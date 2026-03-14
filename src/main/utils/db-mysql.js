const mysql = require('mysql2/promise');

let pool;
let isInitialized = false;

const safeParseJson = (value, fallback = []) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : fallback;
  } catch (error) {
    return fallback;
  }
};

const buildImageGallery = (gallery, imageUrl) => {
  const list = Array.isArray(gallery) ? gallery.filter(Boolean) : safeParseJson(gallery, []);
  if (imageUrl && !list.includes(imageUrl)) {
    return [imageUrl, ...list];
  }
  return list;
};

/**
 * Initialize MySQL connection pool
 * Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in environment variables or config
 */
async function initDb() {
  if (isInitialized && pool) {
    return pool;
  }

  try {
    // Load database config from environment or config file
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'aiblog_generator',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    };

    console.log('[MySQL] Connecting to database:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
    });

    pool = mysql.createPool(dbConfig);

    // Test connection
    const connection = await pool.getConnection();
    console.log('[MySQL] Connected successfully!');
    connection.release();

    // Create tables if they don't exist
    await createTables();

    isInitialized = true;
    return pool;
  } catch (error) {
    console.error('[MySQL] Connection error:', error);
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

/**
 * Create all required tables
 */
async function createTables() {
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS blogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        title TEXT NOT NULL,
        content LONGTEXT NOT NULL,
        meta_description TEXT,
        keywords TEXT,
        categories TEXT,
        image_url TEXT,
        image_gallery LONGTEXT,
        word_count INT,
        seo_score INT,
        language VARCHAR(10),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        cost DECIMAL(10, 6),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Backfill new columns for existing installs
    await connection.query(`ALTER TABLE blogs ADD COLUMN IF NOT EXISTS categories TEXT`);
    await connection.query(`ALTER TABLE blogs ADD COLUMN IF NOT EXISTS image_gallery LONGTEXT`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        permissions TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        \`key\` VARCHAR(255) NOT NULL,
        value LONGTEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_key (user_id, \`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        date DATE,
        blogs_generated INT DEFAULT 0,
        total_cost DECIMAL(10, 6) DEFAULT 0,
        total_tokens INT DEFAULT 0,
        UNIQUE KEY unique_user_date (user_id, date),
        INDEX idx_date (date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        level VARCHAR(50),
        category VARCHAR(100),
        message TEXT,
        details LONGTEXT,
        blog_id INT,
        tokens_used INT,
        cost DECIMAL(10, 6),
        user_id INT,
        INDEX idx_timestamp (timestamp),
        INDEX idx_user_id (user_id),
        INDEX idx_blog_id (blog_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        actor_user_id INT,
        action VARCHAR(255),
        target_user_id INT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_actor (actor_user_id),
        INDEX idx_target (target_user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        type VARCHAR(100),
        message TEXT,
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_is_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS remote_posts (
        id BIGINT PRIMARY KEY,
        provider VARCHAR(100),
        title TEXT,
        status VARCHAR(50),
        url TEXT,
        created_at DATETIME,
        updated_at DATETIME,
        published_at DATETIME,
        views INT DEFAULT 0,
        last_viewed DATETIME,
        time_spent INT DEFAULT 0,
        topics TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_provider (provider),
        INDEX idx_status (status),
        INDEX idx_synced_at (synced_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS publish_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        blog_id INT,
        remote_post_id BIGINT,
        destination_id VARCHAR(255),
        destination_name VARCHAR(255),
        platform VARCHAR(100),
        status VARCHAR(50),
        published_url TEXT,
        published_at DATETIME,
        user_id INT,
        INDEX idx_blog_id (blog_id),
        INDEX idx_user_id (user_id),
        INDEX idx_published_at (published_at),
        FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[MySQL] All tables created successfully');
  } catch (error) {
    console.error('[MySQL] Error creating tables:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Execute a query
 */
async function query(sql, params = []) {
  await initDb();
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('[MySQL] Query error:', error);
    throw error;
  }
}

/**
 * Save a blog post
 */
async function saveBlog(blog, userId) {
  await initDb();

  const sql = `
    INSERT INTO blogs (
      user_id, title, content, meta_description, keywords, categories,
      image_url, image_gallery, word_count, seo_score, language, cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    userId || null,
    blog.title || '',
    blog.content || '',
    blog.metaDescription || '',
    JSON.stringify(blog.keywords || []),
    JSON.stringify(blog.categories || []),
    blog.imageUrl || '',
    JSON.stringify(buildImageGallery(blog.imageGallery, blog.imageUrl)),
    blog.wordCount || 0,
    blog.seoScore || 0,
    blog.language || 'en',
    blog.cost || 0,
  ];

  const result = await query(sql, params);
  return result.insertId;
}

/**
 * Get blogs with filters
 */
async function getBlogs({ userId = null, limit = 50, offset = 0, search = '', dateFrom, dateTo } = {}) {
  await initDb();

  let sql = 'SELECT * FROM blogs WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  if (search) {
    sql += ' AND (title LIKE ? OR keywords LIKE ? OR categories LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (dateFrom) {
    sql += ' AND created_at >= ?';
    params.push(dateFrom);
  }

  if (dateTo) {
    sql += ' AND created_at <= ?';
    params.push(dateTo);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = await query(sql, params);
  return results.map((row) => ({
    ...row,
    keywords: safeParseJson(row.keywords),
    categories: safeParseJson(row.categories),
    imageGallery: buildImageGallery(safeParseJson(row.image_gallery), row.image_url),
  }));
}

/**
 * Get a single blog by ID
 */
async function getBlogById(id) {
  await initDb();
  const results = await query('SELECT * FROM blogs WHERE id = ?', [id]);
  const row = results[0];
  if (!row) return null;
  return {
    ...row,
    keywords: safeParseJson(row.keywords),
    categories: safeParseJson(row.categories),
    imageGallery: buildImageGallery(safeParseJson(row.image_gallery), row.image_url),
  };
}

/**
 * Update a blog
 */
async function updateBlog(id, updates) {
  await initDb();

  const fields = [];
  const params = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    params.push(updates.title);
  }
  if (updates.content !== undefined) {
    fields.push('content = ?');
    params.push(updates.content);
  }
  if (updates.metaDescription !== undefined) {
    fields.push('meta_description = ?');
    params.push(updates.metaDescription);
  }
  if (updates.keywords !== undefined) {
    fields.push('keywords = ?');
    params.push(JSON.stringify(updates.keywords || []));
  }
  if (updates.categories !== undefined) {
    fields.push('categories = ?');
    params.push(JSON.stringify(updates.categories || []));
  }
  if (updates.imageUrl !== undefined) {
    fields.push('image_url = ?');
    params.push(updates.imageUrl);
  }
  if (updates.imageGallery !== undefined) {
    fields.push('image_gallery = ?');
    params.push(JSON.stringify(buildImageGallery(updates.imageGallery, updates.imageUrl)));
  }

  if (fields.length === 0) {
    return;
  }

  params.push(id);
  const sql = `UPDATE blogs SET ${fields.join(', ')} WHERE id = ?`;
  await query(sql, params);
}

/**
 * Delete a blog
 */
async function deleteBlog(id) {
  await initDb();
  await query('DELETE FROM blogs WHERE id = ?', [id]);
}

/**
 * Get user by username
 */
async function getUserByUsername(username) {
  await initDb();
  const results = await query(
    'SELECT id, username, password_hash, password_salt, role, permissions, created_at FROM users WHERE username = ?',
    [username]
  );

  if (results.length === 0) {
    return null;
  }

  const user = results[0];
  return {
    id: user.id,
    username: user.username,
    passwordHash: user.password_hash,
    passwordSalt: user.password_salt,
    role: user.role,
    permissions: user.permissions,
    createdAt: user.created_at,
  };
}

/**
 * Get user by ID
 */
async function getUserById(id) {
  await initDb();
  const results = await query(
    'SELECT id, username, password_hash, password_salt, role, permissions, created_at FROM users WHERE id = ?',
    [id]
  );

  if (results.length === 0) {
    return null;
  }

  const user = results[0];
  return {
    id: user.id,
    username: user.username,
    passwordHash: user.password_hash,
    passwordSalt: user.password_salt,
    role: user.role,
    permissions: user.permissions,
    createdAt: user.created_at,
  };
}

/**
 * Create a new user
 */
async function createUser({ username, passwordHash, passwordSalt, role, permissions }) {
  await initDb();
  const result = await query(
    'INSERT INTO users (username, password_hash, password_salt, role, permissions) VALUES (?, ?, ?, ?, ?)',
    [username, passwordHash, passwordSalt, role, permissions]
  );
  return result.insertId;
}

/**
 * Get user count
 */
async function getUserCount() {
  await initDb();
  const results = await query('SELECT COUNT(*) as count FROM users');
  return results[0].count;
}

/**
 * Save or update settings
 */
async function saveSettings(userId, key, value) {
  await initDb();

  // Check if setting exists
  const existing = await query(
    'SELECT id FROM settings WHERE user_id = ? AND `key` = ?',
    [userId, key]
  );

  if (existing.length > 0) {
    // Update existing
    await query(
      'UPDATE settings SET value = ? WHERE user_id = ? AND `key` = ?',
      [JSON.stringify(value), userId, key]
    );
  } else {
    // Insert new
    await query(
      'INSERT INTO settings (user_id, `key`, value) VALUES (?, ?, ?)',
      [userId, key, JSON.stringify(value)]
    );
  }
}

/**
 * Get settings
 */
async function getSettings(userId, key) {
  await initDb();
  const results = await query(
    'SELECT value FROM settings WHERE user_id = ? AND `key` = ?',
    [userId, key]
  );

  if (results.length === 0) {
    return null;
  }

  try {
    return JSON.parse(results[0].value);
  } catch (e) {
    return results[0].value;
  }
}

/**
 * Log activity
 */
async function logActivity({ userId, action, details }) {
  await initDb();
  const actionPrefix = String(action || '').split('.')[0] || 'activity';
  const categoryMap = {
    blog: 'history',
    auth: 'auth',
    admin: 'admin',
    logs: 'logs',
    posts: 'posts',
    settings: 'settings',
    scheduler: 'scheduler',
    notification: 'notifications',
    notifications: 'notifications',
  };
  const category = categoryMap[actionPrefix] || actionPrefix;
  await query(
    'INSERT INTO activities (user_id, action, details) VALUES (?, ?, ?)',
    [userId, action, details]
  );
  await query(
    'INSERT INTO logs (timestamp, level, category, message, details, blog_id, tokens_used, cost, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      new Date(),
      'info',
      category,
      details || action || 'Activity',
      JSON.stringify({ source: 'activity', action: String(action || '') }),
      null,
      null,
      null,
      userId || null,
    ]
  );
}

/**
 * Get activities
 */
async function getActivities({ userId = null, limit = 100, offset = 0 }) {
  await initDb();

  let sql = 'SELECT * FROM activities WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return await query(sql, params);
}

/**
 * Track API usage
 */
async function trackApiUsage({ userId, cost, tokens }) {
  await initDb();

  const today = new Date().toISOString().split('T')[0];

  await query(
    `INSERT INTO api_usage (user_id, date, blogs_generated, total_cost, total_tokens)
     VALUES (?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE
       blogs_generated = blogs_generated + 1,
       total_cost = total_cost + ?,
       total_tokens = total_tokens + ?`,
    [userId, today, cost, tokens, cost, tokens]
  );
}

/**
 * Get API usage
 */
async function getApiUsage({ userId = null, dateFrom, dateTo }) {
  await initDb();

  let sql = 'SELECT * FROM api_usage WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  if (dateFrom) {
    sql += ' AND date >= ?';
    params.push(dateFrom);
  }

  if (dateTo) {
    sql += ' AND date <= ?';
    params.push(dateTo);
  }

  sql += ' ORDER BY date DESC';

  return await query(sql, params);
}

/**
 * Upsert remote posts (from WordPress sync)
 */
async function upsertRemotePosts(posts, provider = 'wordpress') {
  await initDb();

  for (const post of posts) {
    await query(
      `INSERT INTO remote_posts (
        id, provider, destination_id, title, status, url, created_at, updated_at,
        published_at, views, last_viewed, time_spent, topics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        status = VALUES(status),
        url = VALUES(url),
        updated_at = VALUES(updated_at),
        published_at = VALUES(published_at),
        views = VALUES(views),
        last_viewed = VALUES(last_viewed),
        time_spent = VALUES(time_spent),
        topics = VALUES(topics),
        synced_at = CURRENT_TIMESTAMP`,
      [
        post.id,
        provider,
        post.destination_id || null,
        post.title,
        post.status,
        post.url,
        post.created_at,
        post.updated_at,
        post.published_at,
        post.views || 0,
        post.last_viewed,
        typeof post.time_spent === 'number' ? post.time_spent : 0,
        JSON.stringify(post.topics || []),
      ]
    );
  }
}

async function replaceRemotePosts(posts, provider = 'wordpress', destinationId = null) {
  await initDb();
  if (destinationId) {
    await query('DELETE FROM remote_posts WHERE provider = ? AND destination_id = ?', [provider, destinationId]);
  }
  await upsertRemotePosts(posts, provider);
}

async function deleteRemotePost({ id, provider = null, destinationId = null }) {
  await initDb();
  if (!id) return;
  let sql = 'DELETE FROM remote_posts WHERE id = ?';
  const params = [id];
  if (provider) {
    sql += ' AND provider = ?';
    params.push(provider);
  }
  if (destinationId) {
    sql += ' AND destination_id = ?';
    params.push(destinationId);
  }
  await query(sql, params);
}

/**
 * Get remote posts
 */
async function listRemotePosts({ status = null, limit = 200, destinationId = null }) {
  await initDb();

  let sql = 'SELECT * FROM remote_posts WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (destinationId) {
    sql += ' AND destination_id = ?';
    params.push(destinationId);
  }

  sql += ' ORDER BY synced_at DESC LIMIT ?';
  params.push(limit);

  const results = await query(sql, params);

  return results.map((row) => ({
    id: row.id,
    provider: row.provider,
    destinationId: row.destination_id || null,
    title: row.title,
    status: row.status,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    views: typeof row.views === 'number' ? row.views : null,
    lastViewed: row.last_viewed,
    timeSpent: typeof row.time_spent === 'number' ? row.time_spent : null,
    topics: JSON.parse(row.topics || '[]'),
    syncedAt: row.synced_at,
  }));
}

async function getBlogForRemotePost({ remotePostId, destinationId = null } = {}) {
  await initDb();
  if (!remotePostId) return null;
  const rawId = String(remotePostId).trim();
  const idCandidates = [rawId];
  if (/^-?\d+$/.test(rawId)) {
    idCandidates.push(Number(rawId));
  }

  const findRows = async (withDestination) => {
    const placeholders = idCandidates.map(() => '?').join(', ');
    let sql = `SELECT blog_id FROM publish_history WHERE remote_post_id IN (${placeholders})`;
    const params = [...idCandidates];
    if (withDestination && destinationId) {
      sql += ' AND destination_id = ?';
      params.push(destinationId);
    }
    sql += ' ORDER BY published_at DESC LIMIT 1';
    return query(sql, params);
  };

  let results = await findRows(true);
  if ((!results || !results[0]?.blog_id) && destinationId) {
    results = await findRows(false);
  }
  const blogId = results[0]?.blog_id;
  if (!blogId) return null;
  return await getBlogById(blogId);
}

/**
 * Record publish history
 */
async function recordPublishHistory(entry) {
  await initDb();

  const result = await query(
    `INSERT INTO publish_history (
      blog_id, remote_post_id, destination_id, destination_name,
      platform, status, published_url, published_at, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.blogId,
      entry.remotePostId || null,
      entry.destinationId,
      entry.destinationName,
      entry.platform,
      entry.status,
      entry.publishedUrl,
      entry.publishedAt || new Date().toISOString(),
      entry.userId,
    ]
  );

  return result.insertId;
}

/**
 * Get publish history
 */
async function getPublishHistory({ userId = null, limit = 100, offset = 0, dateFrom, dateTo, platform, status, destinationId = null }) {
  await initDb();

  let sql = 'SELECT * FROM publish_history WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  if (dateFrom) {
    sql += ' AND published_at >= ?';
    params.push(dateFrom);
  }

  if (dateTo) {
    sql += ' AND published_at <= ?';
    params.push(dateTo);
  }

  if (destinationId) {
    sql += ' AND destination_id = ?';
    params.push(destinationId);
  }

  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (destinationId) {
    sql += ' AND destination_id = ?';
    params.push(destinationId);
  }

  sql += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return await query(sql, params);
}

/**
 * Get publish analytics
 */
async function getPublishAnalytics({ userId = null, dateFrom, dateTo, destinationId = null }) {
  await initDb();

  let historySql = 'SELECT * FROM publish_history WHERE 1=1';
  const historyParams = [];

  if (userId) {
    historySql += ' AND user_id = ?';
    historyParams.push(userId);
  }
  if (dateFrom) {
    historySql += ' AND published_at >= ?';
    historyParams.push(dateFrom);
  }
  if (dateTo) {
    historySql += ' AND published_at <= ?';
    historyParams.push(dateTo);
  }
  if (destinationId) {
    historySql += ' AND destination_id = ?';
    historyParams.push(destinationId);
  }

  const historyRows = await query(historySql, historyParams);

  const remotePosts = await listRemotePosts({ limit: 1000, destinationId });
  const remotePostsMap = new Map(remotePosts.map((p) => [p.id, p]));
  const totalTimeSpent = remotePosts.reduce((acc, p) => acc + (p.timeSpent || 0), 0);
  const useRemoteStats = remotePosts.length > 0;

  const totalPublished = useRemoteStats
    ? remotePosts.filter((p) => p.status === 'publish').length
    : historyRows.filter((h) => h.status === 'publish').length;
  const totalDrafts = useRemoteStats
    ? remotePosts.filter((p) => p.status === 'draft').length
    : historyRows.filter((h) => h.status === 'draft').length;
  const totalViews = remotePosts.reduce((acc, p) => acc + (p.views || 0), 0);

  const publishedByMonth = {};
  if (useRemoteStats) {
    remotePosts.forEach((post) => {
      const dateValue = post.published_at || post.created_at || post.updated_at;
      if (!dateValue) return;
      const month = new Date(dateValue).toISOString().substring(0, 7);
      if (!publishedByMonth[month]) {
        publishedByMonth[month] = { month, count: 0, views: 0 };
      }
      publishedByMonth[month].count++;
      publishedByMonth[month].views += post.views || 0;
    });
  } else {
    historyRows.forEach((row) => {
      if (row.published_at) {
        const month = row.published_at.substring(0, 7);
        if (!publishedByMonth[month]) {
          publishedByMonth[month] = { month, count: 0, views: 0 };
        }
        publishedByMonth[month].count++;
        const remotePost = remotePostsMap.get(row.remote_post_id);
        if (remotePost) {
          publishedByMonth[month].views += remotePost.views || 0;
        }
      }
    });
  }

  const byPlatform = {};
  if (useRemoteStats) {
    remotePosts.forEach((post) => {
      const platform = post.provider || 'unknown';
      if (!byPlatform[platform]) {
        byPlatform[platform] = { platform, count: 0, views: 0 };
      }
      byPlatform[platform].count++;
      byPlatform[platform].views += post.views || 0;
    });
  } else {
    historyRows.forEach((row) => {
      const platform = row.platform || 'unknown';
      if (!byPlatform[platform]) {
        byPlatform[platform] = { platform, count: 0, views: 0 };
      }
      byPlatform[platform].count++;
      const remotePost = remotePostsMap.get(row.remote_post_id);
      if (remotePost) {
        byPlatform[platform].views += remotePost.views || 0;
      }
    });
  }

  const topicViews = {};
  const topicCounts = {};
  remotePosts.forEach((post) => {
    (post.topics || []).forEach((topic) => {
      const key = topic.toLowerCase();
      topicViews[key] = (topicViews[key] || 0) + (post.views || 0);
      topicCounts[key] = (topicCounts[key] || 0) + 1;
    });
  });

  const topTopics = Object.entries(topicViews)
    .map(([topic, totalViews]) => ({
      topic,
      totalViews,
      postCount: topicCounts[topic] || 0,
      avgViews: topicCounts[topic] ? Math.round(totalViews / topicCounts[topic]) : 0,
    }))
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 10);

  const topPosts = [...remotePosts]
    .filter((p) => typeof p.views === 'number')
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      title: p.title,
      views: p.views,
      publishedAt: p.published_at,
      url: p.url,
      status: p.status,
    }));

  const recentPublishes = historyRows.slice(0, 10).map((row) => ({
    id: row.id,
    blogId: row.blog_id,
    destinationName: row.destination_name,
    platform: row.platform,
    status: row.status,
    publishedAt: row.published_at,
    publishedUrl: row.published_url,
  }));

  return {
    summary: {
      totalPublished,
      totalDrafts,
      totalViews,
      avgViewsPerPost: remotePosts.length ? Math.round(totalViews / remotePosts.length) : 0,
      totalTimeSpentSeconds: totalTimeSpent,
      avgTimePerPostSeconds: remotePosts.length ? Math.round(totalTimeSpent / remotePosts.length) : 0,
    },
    publishedByMonth: Object.values(publishedByMonth).sort((a, b) => a.month.localeCompare(b.month)),
    byPlatform: Object.values(byPlatform).sort((a, b) => b.count - a.count),
    topTopics,
    topPosts,
    recentPublishes,
  };
}

/**
 * Close database connection
 */
async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    isInitialized = false;
    console.log('[MySQL] Connection closed');
  }
}

module.exports = {
  initDb,
  query,
  saveBlog,
  getBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  getUserByUsername,
  getUserById,
  createUser,
  getUserCount,
  saveSettings,
  getSettings,
  logActivity,
  getActivities,
  trackApiUsage,
  getApiUsage,
  upsertRemotePosts,
  replaceRemotePosts,
  deleteRemotePost,
  listRemotePosts,
  getBlogForRemotePost,
  recordPublishHistory,
  getPublishHistory,
  getPublishAnalytics,
  closeDb,
};
