const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const initSqlJs = require('sql.js');

let SQL;
let db;
let dbPath;
let dbReadyPromise;

const safeParseJson = (value, fallback = []) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : fallback;
  } catch (error) {
    return fallback;
  }
};

const buildImageGallery = (gallery, imageUrl) => {
  const list = Array.isArray(gallery) ? gallery.filter(Boolean) : [];
  if (imageUrl && !list.includes(imageUrl)) {
    return [imageUrl, ...list];
  }
  return list;
};

async function initDb() {
  if (dbReadyPromise) {
    return dbReadyPromise;
  }

  dbReadyPromise = (async () => {
    SQL = await initSqlJs();
    dbPath = path.join(app.getPath('userData'), 'blog-generator.sqlite');

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS blogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        meta_description TEXT,
        keywords TEXT,
        categories TEXT,
        image_url TEXT,
        image_gallery TEXT,
        local_image_path TEXT,
        word_count INTEGER,
        seo_score INTEGER,
        language TEXT,
        created_at TEXT,
        updated_at TEXT,
        cost REAL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions TEXT NOT NULL,
        created_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT,
        blogs_generated INTEGER,
        total_cost REAL,
        total_tokens INTEGER
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        level TEXT,
        category TEXT,
        message TEXT,
        details TEXT,
        blog_id INTEGER,
        tokens_used INTEGER,
        cost REAL,
        user_id INTEGER
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER,
        action TEXT,
        target_user_id INTEGER,
        details TEXT,
        created_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        message TEXT,
        is_read INTEGER,
        created_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS remote_posts (
        id INTEGER PRIMARY KEY,
        provider TEXT,
        destination_id TEXT,
        title TEXT,
        status TEXT,
        url TEXT,
        created_at TEXT,
        updated_at TEXT,
        published_at TEXT,
        views INTEGER,
        last_viewed TEXT,
        time_spent INTEGER,
        topics TEXT,
        synced_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS publish_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blog_id INTEGER,
        remote_post_id INTEGER,
        destination_id TEXT,
        destination_name TEXT,
        platform TEXT,
        status TEXT,
        published_url TEXT,
        published_at TEXT,
        user_id INTEGER,
        FOREIGN KEY (blog_id) REFERENCES blogs(id)
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_publish_history_blog ON publish_history(blog_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_publish_history_date ON publish_history(published_at)`);

    const columns = db.exec("PRAGMA table_info(blogs)");
    const columnNames = new Set((columns[0]?.values || []).map((row) => row[1]));
    if (!columnNames.has('user_id')) {
      db.run('ALTER TABLE blogs ADD COLUMN user_id INTEGER');
    }
    if (!columnNames.has('categories')) {
      db.run('ALTER TABLE blogs ADD COLUMN categories TEXT');
    }
    if (!columnNames.has('updated_at')) {
      db.run('ALTER TABLE blogs ADD COLUMN updated_at TEXT');
    }
    if (!columnNames.has('cost')) {
      db.run('ALTER TABLE blogs ADD COLUMN cost REAL');
    }
    if (!columnNames.has('image_gallery')) {
      db.run('ALTER TABLE blogs ADD COLUMN image_gallery TEXT');
    }

    const remoteColumns = db.exec('PRAGMA table_info(remote_posts)');
    const remoteNames = new Set((remoteColumns[0]?.values || []).map((row) => row[1]));
    if (!remoteNames.has('destination_id')) {
      db.run('ALTER TABLE remote_posts ADD COLUMN destination_id TEXT');
    }
    if (!remoteNames.has('topics')) {
      db.run('ALTER TABLE remote_posts ADD COLUMN topics TEXT');
    }
    if (!remoteNames.has('time_spent')) {
      db.run('ALTER TABLE remote_posts ADD COLUMN time_spent INTEGER');
    }
  })();

  return dbReadyPromise;
}

function persistDb() {
  if (!db || !dbPath) {
    console.error('[DB] persistDb called but db or dbPath not set:', { db: !!db, dbPath });
    return;
  }
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    console.log('[DB] Database persisted to:', dbPath);
  } catch (error) {
    console.error('[DB] persistDb error:', error);
    throw error;
  }
}

async function saveBlog(blog, userId) {
  await initDb();

    db.run(
      `INSERT INTO blogs (
        user_id,
        title,
        content,
        meta_description,
        keywords,
        categories,
        image_url,
        image_gallery,
        local_image_path,
        word_count,
        seo_score,
        language,
        created_at,
        cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        userId || null,
        blog.title,
        blog.content,
        blog.metaDescription || null,
        JSON.stringify(blog.keywords || []),
        JSON.stringify(blog.categories || []),
        blog.imageUrl || null,
        JSON.stringify(buildImageGallery(blog.imageGallery, blog.imageUrl)),
        blog.localImagePath || null,
        blog.wordCount || 0,
        blog.seoScore || null,
        blog.language || 'English',
        blog.generatedAt || new Date().toISOString(),
        typeof blog.cost === 'number' ? blog.cost : null,
      ]
    );

  const idResult = db.exec('SELECT last_insert_rowid() as id');
  persistDb();
  return idResult?.[0]?.values?.[0]?.[0] || null;
}

async function listBlogs({ limit = 50, userId = null, isAdmin = false } = {}) {
  await initDb();

  if (!isAdmin && !userId) {
    return [];
  }

  let query = `SELECT id, title, image_url, image_gallery, local_image_path, word_count, seo_score, language, created_at, cost
     FROM blogs`;
  const params = [];
  if (!isAdmin || userId) {
    query += ' WHERE user_id = ?';
    params.push(userId);
  }
  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);

  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    imageGallery: safeParseJson(row.image_gallery, []),
    localImagePath: row.local_image_path,
    wordCount: row.word_count,
    seoScore: row.seo_score,
    language: row.language,
    generatedAt: row.created_at,
    cost: row.cost,
  }));
}

async function getBlogById(id, { userId = null, isAdmin = false } = {}) {
  await initDb();

  if (!isAdmin && !userId) {
    return null;
  }

  let query = `SELECT id, title, content, meta_description, keywords, categories, image_url,
            image_gallery, word_count, seo_score, language, created_at, cost
     FROM blogs WHERE id = ?`;
  const params = [id];
  if (!isAdmin || userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  const stmt = db.prepare(query);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    metaDescription: row.meta_description,
    keywords: JSON.parse(row.keywords || '[]'),
    categories: JSON.parse(row.categories || '[]'),
    imageUrl: row.image_url,
    imageGallery: safeParseJson(row.image_gallery, []),
    localImagePath: row.local_image_path,
    wordCount: row.word_count,
    seoScore: row.seo_score,
    language: row.language,
    generatedAt: row.created_at,
    cost: row.cost,
  };
}

async function getBlogsByIds(ids, { userId = null, isAdmin = false } = {}) {
  await initDb();
  if (!ids.length) {
    return [];
  }

  if (!isAdmin && !userId) {
    return [];
  }

  const placeholders = ids.map(() => '?').join(', ');
let query = `SELECT id, title, content, meta_description, keywords, categories, image_url,
            image_gallery, local_image_path, word_count, seo_score, language, created_at, cost
     FROM blogs WHERE id IN (${placeholders})`;
  const params = [...ids];
  if (!isAdmin || userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  const stmt = db.prepare(query);

  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    metaDescription: row.meta_description,
    keywords: JSON.parse(row.keywords || '[]'),
    categories: JSON.parse(row.categories || '[]'),
    imageUrl: row.image_url,
    imageGallery: safeParseJson(row.image_gallery, []),
    localImagePath: row.local_image_path,
    wordCount: row.word_count,
    seoScore: row.seo_score,
    language: row.language,
    generatedAt: row.created_at,
    cost: row.cost,
  }));
}

async function getHistorySummary({ userId = null, isAdmin = false } = {}) {
  await initDb();

  if (!isAdmin && !userId) {
    return { totalCount: 0, totalCost: 0 };
  }

  let query = 'SELECT COUNT(*) as total_count, COALESCE(SUM(cost), 0) as total_cost FROM blogs';
  const params = [];
  if (!isAdmin || userId) {
    query += ' WHERE user_id = ?';
    params.push(userId);
  }

  const stmt = db.prepare(query);
  if (params.length) {
    stmt.bind(params);
  }
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();

  return {
    totalCount: row.total_count || 0,
    totalCost: row.total_cost || 0,
  };
}

async function updateBlog({ blog, userId, isAdmin }) {
  await initDb();
  let imageGalleryValue = null;
  if (blog.imageGallery !== undefined) {
    imageGalleryValue = JSON.stringify(buildImageGallery(blog.imageGallery, blog.imageUrl));
  } else {
    const existing = await getBlogById(blog.id, { userId, isAdmin });
    imageGalleryValue = JSON.stringify(
      buildImageGallery(
        existing?.imageGallery || existing?.image_gallery || [],
        blog.imageUrl || existing?.imageUrl || existing?.image_url || null
      )
    );
  }
  const now = new Date().toISOString();
  const params = [
    blog.title,
    blog.content,
    blog.metaDescription || null,
    JSON.stringify(blog.keywords || []),
    JSON.stringify(blog.categories || []),
    blog.imageUrl || null,
    imageGalleryValue,
    blog.localImagePath || null,
    blog.wordCount || 0,
    blog.seoScore || null,
    blog.language || 'English',
    now,
    blog.cost || null,
    blog.id,
  ];

let query = `UPDATE blogs SET
    title = ?,
    content = ?,
    meta_description = ?,
    keywords = ?,
    categories = ?,
    image_url = ?,
    image_gallery = ?,
    local_image_path = ?,
    word_count = ?,
    seo_score = ?,
    language = ?,
    updated_at = ?,
    cost = ?
    WHERE id = ?`;
  if (!isAdmin) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  db.run(query, params);
  persistDb();
}

async function deleteBlog({ id, userId, isAdmin }) {
  await initDb();
  let query = 'DELETE FROM blogs WHERE id = ?';
  const params = [id];
  if (!isAdmin) {
    query += ' AND user_id = ?';
    params.push(userId);
  }
  db.run(query, params);
  persistDb();
}

async function clearBlogs({ userId, isAdmin }) {
  await initDb();
  if (isAdmin) {
    db.run('DELETE FROM blogs');
  } else {
    db.run('DELETE FROM blogs WHERE user_id = ?', [userId]);
  }
  persistDb();
}

async function getUserCount() {
  await initDb();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.count || 0;
}

async function getUserByUsername(username) {
  await initDb();
  const stmt = db.prepare(
    'SELECT id, username, password_hash, password_salt, role, permissions, created_at FROM users WHERE username = ?'
  );
  stmt.bind([username]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row
    ? {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        role: row.role,
        permissions: JSON.parse(row.permissions || '[]'),
        createdAt: row.created_at,
      }
    : null;
}

async function getUserById(id) {
  await initDb();
  const stmt = db.prepare(
    'SELECT id, username, password_hash, password_salt, role, permissions, created_at FROM users WHERE id = ?'
  );
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row
    ? {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        role: row.role,
        permissions: JSON.parse(row.permissions || '[]'),
        createdAt: row.created_at,
      }
    : null;
}

async function createUser({ username, passwordHash, passwordSalt, role, permissions }) {
  await initDb();
  db.run(
    `INSERT INTO users (username, password_hash, password_salt, role, permissions, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      username,
      passwordHash,
      passwordSalt,
      role,
      JSON.stringify(permissions || []),
      new Date().toISOString(),
    ]
  );
  persistDb();
}

async function listUsers() {
  await initDb();
  const stmt = db.prepare(
    'SELECT id, username, role, permissions, created_at FROM users ORDER BY id ASC'
  );
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    permissions: JSON.parse(row.permissions || '[]'),
    createdAt: row.created_at,
  }));
}

async function updateUserAccess({ id, role, permissions }) {
  await initDb();
  db.run('UPDATE users SET role = ?, permissions = ? WHERE id = ?', [
    role,
    JSON.stringify(permissions || []),
    id,
  ]);
  persistDb();
}

async function updateUserPassword({ id, passwordHash, passwordSalt }) {
  await initDb();
  db.run('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?', [
    passwordHash,
    passwordSalt,
    id,
  ]);
  persistDb();
}

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
  db.run(
    'INSERT INTO activities (user_id, action, details, created_at) VALUES (?, ?, ?, ?)',
    [userId || null, action, details || null, new Date().toISOString()]
  );
  db.run(
    'INSERT INTO logs (timestamp, level, category, message, details, blog_id, tokens_used, cost, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      new Date().toISOString(),
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
  persistDb();
}

async function listActivities({ userId, isAdmin, limit = 50 }) {
  await initDb();
  let stmt;
  if (isAdmin) {
    stmt = db.prepare(
      `SELECT activities.id, activities.user_id, users.username, activities.action, activities.details, activities.created_at
       FROM activities
       LEFT JOIN users ON users.id = activities.user_id
       ORDER BY activities.id DESC
       LIMIT ?`
    );
    stmt.bind([limit]);
  } else {
    stmt = db.prepare(
      `SELECT activities.id, activities.user_id, users.username, activities.action, activities.details, activities.created_at
       FROM activities
       LEFT JOIN users ON users.id = activities.user_id
       WHERE activities.user_id = ?
       ORDER BY activities.id DESC
       LIMIT ?`
    );
    stmt.bind([userId, limit]);
  }

  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username || 'System',
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
  }));
}

async function setSetting({ userId, key, value }) {
  await initDb();
  try {
    const uid = userId || null;
    console.log('[DB] setSetting called:', { userId: uid, key, valueLength: value?.length });

    if (uid === null) {
      db.run('DELETE FROM settings WHERE user_id IS NULL AND key = ?', [key]);
    } else {
      db.run('DELETE FROM settings WHERE user_id = ? AND key = ?', [uid, key]);
    }

    db.run(
      'INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [uid, key, value, new Date().toISOString()]
    );

    persistDb();
    console.log('[DB] setSetting persisted successfully');

    // Verify the save worked
    const verifyQuery = uid === null
      ? 'SELECT value FROM settings WHERE user_id IS NULL AND key = ?'
      : 'SELECT value FROM settings WHERE user_id = ? AND key = ?';
    const verifyParams = uid === null ? [key] : [uid, key];
    const stmt = db.prepare(verifyQuery);
    stmt.bind(verifyParams);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      console.log('[DB] Verified save - stored value length:', row.value?.length);
    } else {
      console.error('[DB] Verification failed - no row found after insert');
    }
    stmt.free();
  } catch (error) {
    console.error('[DB] setSetting error:', error);
    throw error;
  }
}

async function getSetting({ userId, key }) {
  await initDb();
  try {
    const uid = userId || null;
    console.log('[DB] getSetting called:', { userId: uid, key });

    const query = uid === null
      ? 'SELECT value FROM settings WHERE user_id IS NULL AND key = ? ORDER BY updated_at DESC LIMIT 1'
      : 'SELECT value FROM settings WHERE user_id = ? AND key = ? ORDER BY updated_at DESC LIMIT 1';
    const params = uid === null ? [key] : [uid, key];
    const stmt = db.prepare(query);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();

    console.log('[DB] getSetting result:', row ? `found (length: ${row.value?.length})` : 'not found');
    return row ? row.value : null;
  } catch (error) {
    console.error('[DB] getSetting error:', error);
    throw error;
  }
}

async function getSettings({ userId }) {
  await initDb();
  const stmt = db.prepare('SELECT key, value FROM settings WHERE user_id IS ?');
  stmt.bind([userId || null]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

async function addLog({ level = 'info', category = 'general', message, details, blogId, tokensUsed, cost, userId }) {
  await initDb();
  db.run(
    `INSERT INTO logs (timestamp, level, category, message, details, blog_id, tokens_used, cost, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      new Date().toISOString(),
      level,
      category,
      message,
      details ? JSON.stringify(details) : null,
      blogId || null,
      typeof tokensUsed === 'number' ? tokensUsed : null,
      typeof cost === 'number' ? cost : null,
      userId || null,
    ]
  );
  persistDb();
}

async function listLogs({ userId, isAdmin, limit = 100, offset = 0, level, category }) {
  await initDb();
  let query = 'SELECT * FROM logs';
  const conditions = [];
  const params = [];

  if (level) {
    conditions.push('level = ?');
    params.push(level);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (!isAdmin) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    level: row.level,
    category: row.category,
    message: row.message,
    details: row.details,
    blogId: row.blog_id,
    tokensUsed: row.tokens_used,
    cost: row.cost,
    userId: row.user_id,
  }));
}

async function getLogStats({ userId, isAdmin }) {
  await initDb();
  const whereClause = isAdmin ? '' : ' WHERE user_id = ?';
  const params = isAdmin ? [] : [userId];
  const total = db.prepare(`SELECT COUNT(*) as count FROM logs${whereClause}`).get(...params);
  const errors = db.prepare(
    `SELECT COUNT(*) as count FROM logs${whereClause}${whereClause ? ' AND' : ' WHERE'} level = 'error'`
  ).get(...params);
  const tokens = db.prepare(
    `SELECT SUM(tokens_used) as total FROM logs${whereClause}${whereClause ? ' AND' : ' WHERE'} tokens_used IS NOT NULL`
  ).get(...params);
  const cost = db.prepare(
    `SELECT SUM(cost) as total FROM logs${whereClause}${whereClause ? ' AND' : ' WHERE'} cost IS NOT NULL`
  ).get(...params);
  return {
    total: total?.count || 0,
    errors: errors?.count || 0,
    totalTokens: tokens?.total || 0,
    totalCost: cost?.total || 0,
  };
}

async function clearLogs({ userId, isAdmin }) {
  await initDb();
  if (isAdmin) {
    db.run('DELETE FROM logs');
  } else {
    db.run('DELETE FROM logs WHERE user_id = ?', [userId]);
  }
  persistDb();
}

async function addNotification({ userId, type, message }) {
  await initDb();
  db.run(
    `INSERT INTO notifications (user_id, type, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, message, 0, new Date().toISOString()]
  );
  persistDb();
}

async function listNotifications({ userId, isAdmin, limit = 100 }) {
  await initDb();
  let query = 'SELECT * FROM notifications';
  const params = [];
  if (!isAdmin) {
    query += ' WHERE user_id = ?';
    params.push(userId);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    message: row.message,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  }));
}

async function markNotificationRead({ id, userId, isAdmin }) {
  await initDb();
  if (isAdmin) {
    db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  } else {
    db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
  }
  persistDb();
}

async function clearNotifications({ userId, isAdmin }) {
  await initDb();
  if (isAdmin) {
    db.run('DELETE FROM notifications');
  } else {
    db.run('DELETE FROM notifications WHERE user_id = ?', [userId]);
  }
  persistDb();
}

async function updateApiUsage({ userId, cost = 0, tokens = 0 }) {
  await initDb();
  const today = new Date().toISOString().slice(0, 10);
  const stmt = db.prepare(
    'SELECT id, blogs_generated, total_cost, total_tokens FROM api_usage WHERE user_id IS ? AND date = ?'
  );
  stmt.bind([userId || null, today]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();

  if (row) {
    db.run(
      'UPDATE api_usage SET blogs_generated = ?, total_cost = ?, total_tokens = ? WHERE id = ?',
      [
        (row.blogs_generated || 0) + 1,
        (row.total_cost || 0) + cost,
        (row.total_tokens || 0) + tokens,
        row.id,
      ]
    );
  } else {
    db.run(
      'INSERT INTO api_usage (user_id, date, blogs_generated, total_cost, total_tokens) VALUES (?, ?, ?, ?, ?)',
      [userId || null, today, 1, cost, tokens]
    );
  }
  persistDb();
}

async function getApiUsage({ userId, isAdmin }) {
  await initDb();
  let query =
    'SELECT COALESCE(SUM(blogs_generated), 0) as blogs_generated, COALESCE(SUM(total_cost), 0) as total_cost, COALESCE(SUM(total_tokens), 0) as total_tokens FROM api_usage';
  const params = [];
  if (!isAdmin) {
    query += ' WHERE user_id = ?';
    params.push(userId);
  }
  const stmt = db.prepare(query);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row
    ? {
        date: null,
        blogsGenerated: row.blogs_generated || 0,
        totalCost: row.total_cost || 0,
        totalTokens: row.total_tokens || 0,
      }
    : { date: null, blogsGenerated: 0, totalCost: 0, totalTokens: 0 };
}

async function upsertRemotePosts(posts = [], provider = 'wordpress') {
  await initDb();
  const now = new Date().toISOString();
  const stmtInsert = db.prepare(
    `INSERT INTO remote_posts (id, provider, destination_id, title, status, url, created_at, updated_at, published_at, views, last_viewed, time_spent, topics, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const stmtUpdate = db.prepare(
    `UPDATE remote_posts
     SET provider = ?, destination_id = ?, title = ?, status = ?, url = ?, created_at = ?, updated_at = ?, published_at = ?, views = ?, last_viewed = ?, time_spent = ?, topics = ?, synced_at = ?
     WHERE id = ?`
  );

  posts.forEach((post) => {
    const topics = JSON.stringify(post.topics || []);
    const check = db.prepare('SELECT id FROM remote_posts WHERE id = ?');
    check.bind([post.id]);
    const exists = check.step();
    check.free();
    if (exists) {
      stmtUpdate.run(
        provider,
        post.destination_id || null,
        post.title || '',
        post.status || '',
        post.url || '',
        post.created_at || null,
        post.updated_at || null,
        post.published_at || post.updated_at || post.created_at || null,
        typeof post.views === 'number' ? post.views : null,
        post.last_viewed || null,
        typeof post.time_spent === 'number' ? post.time_spent : null,
        topics,
        now,
        post.id
      );
    } else {
      stmtInsert.run(
        post.id,
        provider,
        post.destination_id || null,
        post.title || '',
        post.status || '',
        post.url || '',
        post.created_at || null,
        post.updated_at || null,
        post.published_at || post.updated_at || post.created_at || null,
        typeof post.views === 'number' ? post.views : null,
        post.last_viewed || null,
        typeof post.time_spent === 'number' ? post.time_spent : null,
        topics,
        now
      );
    }
  });

  stmtInsert.free();
  stmtUpdate.free();
  persistDb();
}

async function replaceRemotePosts(posts = [], provider = 'wordpress', destinationId = null) {
  await initDb();
  if (destinationId) {
    db.run('DELETE FROM remote_posts WHERE provider = ? AND destination_id = ?', [provider, destinationId]);
  }
  await upsertRemotePosts(posts, provider);
}

async function deleteRemotePost({ id, provider = null, destinationId = null }) {
  await initDb();
  if (!id) return;
  let query = 'DELETE FROM remote_posts WHERE id = ?';
  const params = [id];
  if (provider) {
    query += ' AND provider = ?';
    params.push(provider);
  }
  if (destinationId) {
    query += ' AND destination_id = ?';
    params.push(destinationId);
  }
  db.run(query, params);
  persistDb();
}

async function listRemotePosts({ status = null, limit = 100, destinationId = null } = {}) {
  await initDb();
  let query = 'SELECT * FROM remote_posts';
  const params = [];
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  if (destinationId) {
    query += params.length ? ' AND destination_id = ?' : ' WHERE destination_id = ?';
    params.push(destinationId);
  }
  query += ' ORDER BY updated_at DESC, id DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    destinationId: row.destination_id || null,
    title: row.title,
    status: row.status,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    views: row.views,
    lastViewed: row.last_viewed,
    timeSpent: row.time_spent,
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

  const findRow = (withDestination) => {
    const placeholders = idCandidates.map(() => '?').join(', ');
    let query = `SELECT blog_id FROM publish_history WHERE remote_post_id IN (${placeholders})`;
    const params = [...idCandidates];
    if (withDestination && destinationId) {
      query += ' AND destination_id = ?';
      params.push(destinationId);
    }
    query += ' ORDER BY published_at DESC LIMIT 1';
    const stmt = db.prepare(query);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  };

  let row = findRow(true);
  // Fallback for legacy publish-history rows that may not carry destination_id.
  if (!row?.blog_id && destinationId) {
    row = findRow(false);
  }
  if (!row?.blog_id) return null;
  return await getBlogById(row.blog_id);
}

async function getRemotePostAnalytics() {
  await initDb();
  const all = listRemotePosts({ limit: 1000 });
  const posts = await all;
  const now = Date.now();
  const viewsByTopic = {};
  posts.forEach((post) => {
    const ageDays = Math.max(1, (now - new Date(post.createdAt || post.updatedAt || now).getTime()) / (1000 * 60 * 60 * 24));
    const ctrProxy = post.views ? post.views / ageDays : 0;
    post.ctrProxy = ctrProxy;
    (post.topics || []).forEach((topic) => {
      const key = topic.toLowerCase();
      viewsByTopic[key] = (viewsByTopic[key] || 0) + (post.views || 0);
    });
  });
  const topPosts = [...posts]
    .filter((p) => typeof p.views === 'number')
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);

  const viewsByTopicArr = Object.entries(viewsByTopic)
    .map(([topic, views]) => ({ topic, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  return {
    posts,
    aggregates: {
      topPosts,
      viewsByTopic: viewsByTopicArr,
    },
  };
}

// ==================== PUBLISH HISTORY FUNCTIONS ====================

async function addPublishHistory({
  blogId,
  remotePostId,
  destinationId,
  destinationName,
  platform,
  status,
  publishedUrl,
  userId,
}) {
  await initDb();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO publish_history (blog_id, remote_post_id, destination_id, destination_name, platform, status, published_url, published_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [blogId || null, remotePostId || null, destinationId, destinationName, platform, status, publishedUrl, now, userId || null]
  );
  persistDb();
  return { id: db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] };
}

async function getPublishHistoryByBlog(blogId) {
  await initDb();
  const stmt = db.prepare('SELECT * FROM publish_history WHERE blog_id = ? ORDER BY published_at DESC');
  stmt.bind([blogId]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map((row) => ({
    id: row.id,
    blogId: row.blog_id,
    remotePostId: row.remote_post_id,
    destinationId: row.destination_id,
    destinationName: row.destination_name,
    platform: row.platform,
    status: row.status,
    publishedUrl: row.published_url,
    publishedAt: row.published_at,
    userId: row.user_id,
  }));
}

async function updatePublishHistoryStatusByRemotePost({
  remotePostId,
  destinationId = null,
  status,
} = {}) {
  await initDb();
  if (!remotePostId || typeof status === 'undefined') return;
  const rawId = String(remotePostId).trim();
  if (!rawId) return;
  const idCandidates = [rawId];
  if (/^-?\d+$/.test(rawId)) {
    idCandidates.push(Number(rawId));
  }
  const placeholders = idCandidates.map(() => '?').join(', ');
  let query = `UPDATE publish_history SET status = ? WHERE remote_post_id IN (${placeholders})`;
  const params = [status, ...idCandidates];
  if (destinationId) {
    query += ' AND destination_id = ?';
    params.push(destinationId);
  }
  db.run(query, params);
  persistDb();
}

async function getPublishHistory({ userId, limit = 100, offset = 0, dateFrom, dateTo, platform, status, destinationId } = {}) {
  await initDb();
  let query = 'SELECT ph.*, b.title as blog_title FROM publish_history ph LEFT JOIN blogs b ON ph.blog_id = b.id WHERE 1=1';
  const params = [];

  if (userId) {
    query += ' AND ph.user_id = ?';
    params.push(userId);
  }
  if (dateFrom) {
    query += ' AND ph.published_at >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    query += ' AND ph.published_at <= ?';
    params.push(dateTo);
  }
  if (platform) {
    query += ' AND ph.platform = ?';
    params.push(platform);
  }
  if (status) {
    query += ' AND ph.status = ?';
    params.push(status);
  }
  if (destinationId) {
    query += ' AND ph.destination_id = ?';
    params.push(destinationId);
  }

  query += ' ORDER BY ph.published_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map((row) => ({
    id: row.id,
    blogId: row.blog_id,
    blogTitle: row.blog_title,
    remotePostId: row.remote_post_id,
    destinationId: row.destination_id,
    destinationName: row.destination_name,
    platform: row.platform,
    status: row.status,
    publishedUrl: row.published_url,
    publishedAt: row.published_at,
    userId: row.user_id,
  }));
}

async function getPublishAnalytics({ userId, dateFrom, dateTo, destinationId = null } = {}) {
  await initDb();

  // Get all publish history with optional filters
  let historyQuery = 'SELECT * FROM publish_history WHERE 1=1';
  const historyParams = [];
  if (userId) {
    historyQuery += ' AND user_id = ?';
    historyParams.push(userId);
  }
  if (destinationId) {
    historyQuery += ' AND destination_id = ?';
    historyParams.push(destinationId);
  }
  if (dateFrom) {
    historyQuery += ' AND published_at >= ?';
    historyParams.push(dateFrom);
  }
  if (dateTo) {
    historyQuery += ' AND published_at <= ?';
    historyParams.push(dateTo);
  }

  const historyStmt = db.prepare(historyQuery);
  historyStmt.bind(historyParams);
  const historyRows = [];
  while (historyStmt.step()) {
    historyRows.push(historyStmt.getAsObject());
  }
  historyStmt.free();

  // Get remote posts for views data
  const remotePosts = await listRemotePosts({ limit: 1000, destinationId });
  const remotePostsMap = new Map(remotePosts.map((p) => [p.id, p]));
  const totalTimeSpent = remotePosts.reduce((acc, p) => acc + (p.timeSpent || 0), 0);
  const useRemoteStats = remotePosts.length > 0;

  // Calculate summary stats
  const totalPublished = useRemoteStats
    ? remotePosts.filter((p) => p.status === 'publish').length
    : historyRows.filter((h) => h.status === 'publish').length;
  const totalDrafts = useRemoteStats
    ? remotePosts.filter((p) => p.status === 'draft').length
    : historyRows.filter((h) => h.status === 'draft').length;
  let totalViews = 0;
  remotePosts.forEach((p) => {
    totalViews += p.views || 0;
  });

  // Group by month
  const publishedByMonth = {};
  if (useRemoteStats) {
    remotePosts.forEach((post) => {
      const dateValue = post.publishedAt || post.createdAt || post.updatedAt;
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
        const month = row.published_at.substring(0, 7); // YYYY-MM
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

  // Group by platform
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

  // Top topics from remote posts
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

  // Top posts
  const topPosts = [...remotePosts]
    .filter((p) => typeof p.views === 'number')
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      title: p.title,
      views: p.views,
      publishedAt: p.publishedAt,
      url: p.url,
      status: p.status,
    }));

  // Recent publishes
  const recentPublishes = historyRows
    .slice(0, 10)
    .map((row) => ({
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

module.exports = {
  initDb,
  saveBlog,
  listBlogs,
  getHistorySummary,
  getBlogById,
  getBlogsByIds,
  updateBlog,
  deleteBlog,
  clearBlogs,
  getUserCount,
  getUserByUsername,
  getUserById,
  createUser,
  listUsers,
  updateUserAccess,
  updateUserPassword,
  logActivity,
  listActivities,
  setSetting,
  getSetting,
  getSettings,
  addLog,
  listLogs,
  getLogStats,
  clearLogs,
  addNotification,
  listNotifications,
  markNotificationRead,
  clearNotifications,
  updateApiUsage,
  getApiUsage,
  upsertRemotePosts,
  replaceRemotePosts,
  deleteRemotePost,
  listRemotePosts,
  getBlogForRemotePost,
  getRemotePostAnalytics,
  addPublishHistory,
  updatePublishHistoryStatusByRemotePost,
  getPublishHistoryByBlog,
  getPublishHistory,
  getPublishAnalytics,
};
