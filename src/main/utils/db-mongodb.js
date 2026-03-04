const { MongoClient, ObjectId } = require('mongodb');

let client;
let db;
let isInitialized = false;
let storeInstance = null;

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

function normalizeDocId(id) {
  if (id instanceof ObjectId) {
    return id;
  }
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (!trimmed) {
      return trimmed;
    }
    if (ObjectId.isValid(trimmed) && String(new ObjectId(trimmed)) === trimmed) {
      return new ObjectId(trimmed);
    }
    if (/^-?\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }
  if (typeof id === 'number') {
    return id;
  }
  return id;
}

function buildIdFilter(id) {
  const candidates = [];
  const seen = new Set();
  const add = (value) => {
    const key =
      value instanceof ObjectId
        ? `oid:${value.toString()}`
        : `${typeof value}:${String(value)}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(value);
    }
  };

  add(id);

  if (id instanceof ObjectId) {
    add(id.toString());
  }

  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (trimmed && trimmed !== id) {
      add(trimmed);
    }
    if (/^-?\d+$/.test(trimmed)) {
      add(Number(trimmed));
    }
    if (ObjectId.isValid(trimmed) && String(new ObjectId(trimmed)) === trimmed) {
      add(new ObjectId(trimmed));
    }
  }

  if (typeof id === 'number') {
    add(String(id));
  }

  const normalized = normalizeDocId(id);
  add(normalized);

  if (candidates.length === 1) {
    return { _id: candidates[0] };
  }

  return { _id: { $in: candidates } };
}

/**
 * Set the electron-store instance for accessing persisted MongoDB config
 * This allows the database to work in built executables where .env is not available
 */
function setStore(store) {
  storeInstance = store;
}

/**
 * Initialize MongoDB connection
 * Priority: electron-store > environment variables > localhost
 */
async function initDb() {
  if (isInitialized && db && client && client.topology && client.topology.isConnected()) {
    return db;
  }

  try {
    // MongoDB Atlas connection string format:
    // mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

    // Priority 1: Check electron-store (for built .exe)
    let uri = null;
    let dbName = null;

    if (storeInstance) {
      uri = storeInstance.get('mongodb_uri');
      dbName = storeInstance.get('mongodb_db_name');
      if (uri) {
        console.log('[MongoDB] Using credentials from electron-store (persistent storage)');
      }
    }

    // Priority 2: Check environment variables (for development)
    if (!uri) {
      uri = process.env.MONGODB_URI || process.env.DB_URI;
      dbName = process.env.MONGODB_DB_NAME || process.env.DB_NAME;
      if (uri) {
        console.log('[MongoDB] Using credentials from .env file');
      }
    }

    // Priority 3: Default to localhost (fallback)
    if (!uri) {
      uri = 'mongodb://localhost:27017';
      dbName = 'aiblog_generator';
      console.log('[MongoDB] Using default localhost connection');
    }

    if (!dbName) {
      dbName = 'aiblog_generator';
    }

    console.log('[MongoDB] Connecting to database...');
    console.log('[MongoDB] Database name:', dbName);

    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db(dbName);

    console.log('[MongoDB] Connected successfully!');

    // Create indexes for better performance
    await createIndexes();

    isInitialized = true;
    return db;
  } catch (error) {
    console.error('[MongoDB] Connection error:', error);
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

/**
 * Create indexes for better query performance
 */
async function createIndexes() {
  try {
    // Blogs collection indexes
    await db.collection('blogs').createIndex({ user_id: 1, created_at: -1 });
    await db.collection('blogs').createIndex({ created_at: -1 });

    // Users collection indexes
    await db.collection('users').createIndex({ username: 1 }, { unique: true });

    // Activities collection indexes
    await db.collection('activities').createIndex({ user_id: 1, created_at: -1 });
    await db.collection('activities').createIndex({ created_at: -1 });

    // Settings collection indexes
    await db.collection('settings').createIndex({ user_id: 1, key: 1 }, { unique: true });

    // API usage collection indexes
    await db.collection('api_usage').createIndex({ user_id: 1, date: -1 });
    await db.collection('api_usage').createIndex({ date: -1 });

    // Logs collection indexes
    await db.collection('logs').createIndex({ timestamp: -1 });
    await db.collection('logs').createIndex({ user_id: 1 });

    // Audit logs collection indexes
    await db.collection('audit_logs').createIndex({ actor_user_id: 1, created_at: -1 });
    await db.collection('audit_logs').createIndex({ created_at: -1 });

    // Notifications collection indexes
    await db.collection('notifications').createIndex({ user_id: 1, is_read: 1 });

    // Remote posts collection indexes
    await db.collection('remote_posts').createIndex({ provider: 1, id: 1 }, { unique: true });
    await db.collection('remote_posts').createIndex({ synced_at: -1 });

    // Publish history collection indexes
    await db.collection('publish_history').createIndex({ blog_id: 1 });
    await db.collection('publish_history').createIndex({ user_id: 1, published_at: -1 });
    await db.collection('publish_history').createIndex({ published_at: -1 });

    // Analytics events
    await db.collection('events').createIndex({ event: 1, created_at: -1 });
    await db.collection('events').createIndex({ session_id: 1, created_at: -1 });
    await db.collection('events').createIndex({ user_id: 1, created_at: -1 });

    // Sessions
    await db.collection('sessions').createIndex({ session_id: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ last_seen: -1 });
    await db.collection('sessions').createIndex({ user_id: 1, started_at: -1 });

    console.log('[MongoDB] Indexes created successfully');
  } catch (error) {
    console.error('[MongoDB] Error creating indexes:', error);
  }
}

/**
 * Save a blog post
 */
async function saveBlog(blog, userId) {
  await initDb();

  const document = {
    user_id: userId || null,
    title: blog.title || '',
    content: blog.content || '',
    meta_description: blog.metaDescription || '',
    keywords: blog.keywords || '',
    image_url: blog.imageUrl || '',
    image_gallery: buildImageGallery(blog.imageGallery, blog.imageUrl),
    local_image_path: blog.localImagePath || blog.local_image_path || '',
    word_count: blog.wordCount || 0,
    seo_score: blog.seoScore || 0,
    language: blog.language || 'en',
    cost: blog.cost || 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.collection('blogs').insertOne(document);
  return result.insertedId.toString();
}

/**
 * Get blogs with filters
 */
async function getBlogs({ userId = null, isAdmin = false, limit = 50, offset = 0, search = '', dateFrom, dateTo } = {}) {
  await initDb();

  const filter = {};

  // Admin with no userId filter sees all blogs; non-admin always scoped to their userId
  if (!isAdmin && userId) {
    filter.user_id = userId;
  } else if (userId) {
    filter.user_id = userId;
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { keywords: { $regex: search, $options: 'i' } },
    ];
  }

  if (dateFrom || dateTo) {
    filter.created_at = {};
    if (dateFrom) {
      filter.created_at.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      filter.created_at.$lte = new Date(dateTo);
    }
  }

  const results = await db
    .collection('blogs')
    .find(filter)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  // Convert _id to id and format dates
  return results.map((doc) => ({
    id: doc._id.toString(),
    user_id: doc.user_id,
    title: doc.title,
    content: doc.content,
    metaDescription: doc.meta_description,
    keywords: doc.keywords,
    categories: safeParseJson(doc.categories, []),
    imageUrl: doc.image_url,
    imageGallery: buildImageGallery(doc.image_gallery, doc.image_url),
    localImagePath: doc.local_image_path,
    wordCount: doc.word_count,
    seoScore: doc.seo_score,
    language: doc.language,
    cost: doc.cost,
    generatedAt: doc.created_at?.toISOString(),
    updatedAt: doc.updated_at?.toISOString(),
  }));
}

/**
 * Get a single blog by ID
 */
async function getBlogById(id, { userId = null, isAdmin = false } = {}) {
  await initDb();

  const filter = { _id: new ObjectId(id) };
  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  const doc = await db.collection('blogs').findOne(filter);

  if (!doc) return null;

  return {
    id: doc._id.toString(),
    user_id: doc.user_id,
    title: doc.title,
    content: doc.content,
    metaDescription: doc.meta_description,
    keywords: doc.keywords,
    categories: safeParseJson(doc.categories, []),
    imageUrl: doc.image_url,
    imageGallery: buildImageGallery(doc.image_gallery, doc.image_url),
    localImagePath: doc.local_image_path,
    wordCount: doc.word_count,
    seoScore: doc.seo_score,
    language: doc.language,
    cost: doc.cost,
    generatedAt: doc.created_at?.toISOString(),
    updatedAt: doc.updated_at?.toISOString(),
  };
}

/**
 * Update a blog
 * Called as updateBlog({ blog, userId, isAdmin }) from index.js
 */
async function updateBlog({ blog, userId, isAdmin }) {
  await initDb();

  const filter = { _id: new ObjectId(blog.id) };
  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  const updateDoc = { $set: { updated_at: new Date() } };

  if (blog.title !== undefined) updateDoc.$set.title = blog.title;
  if (blog.content !== undefined) updateDoc.$set.content = blog.content;
  if (blog.metaDescription !== undefined) updateDoc.$set.meta_description = blog.metaDescription;
  if (blog.keywords !== undefined) updateDoc.$set.keywords = JSON.stringify(blog.keywords || []);
  if (blog.categories !== undefined) updateDoc.$set.categories = JSON.stringify(blog.categories || []);
  if (blog.imageUrl !== undefined) updateDoc.$set.image_url = blog.imageUrl;
  if (blog.imageGallery !== undefined) {
    updateDoc.$set.image_gallery = buildImageGallery(blog.imageGallery, blog.imageUrl);
  }
  if (blog.localImagePath !== undefined) updateDoc.$set.local_image_path = blog.localImagePath;
  if (blog.wordCount !== undefined) updateDoc.$set.word_count = blog.wordCount;
  if (blog.seoScore !== undefined) updateDoc.$set.seo_score = blog.seoScore;
  if (blog.language !== undefined) updateDoc.$set.language = blog.language;
  if (blog.cost !== undefined) updateDoc.$set.cost = blog.cost;

  await db.collection('blogs').updateOne(filter, updateDoc);
}

/**
 * Delete a blog
 * Called as deleteBlog({ id, userId, isAdmin }) from index.js
 */
async function deleteBlog({ id, userId, isAdmin }) {
  await initDb();

  const filter = { _id: new ObjectId(id) };
  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  await db.collection('blogs').deleteOne(filter);
}

/**
 * Get user by username
 */
async function getUserByUsername(username) {
  await initDb();

  const user = await db.collection('users').findOne({ username });

  if (!user) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email || '',
    passwordHash: user.password_hash,
    passwordSalt: user.password_salt,
    role: user.role,
    status: user.status || 'active',
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    createdAt: user.created_at?.toISOString(),
  };
}

/**
 * Get user by ID
 */
async function getUserById(id) {
  await initDb();

  const user = await db.collection('users').findOne(buildIdFilter(id));

  if (!user) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email || '',
    passwordHash: user.password_hash,
    passwordSalt: user.password_salt,
    role: user.role,
    status: user.status || 'active',
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    createdAt: user.created_at?.toISOString(),
  };
}

/**
 * Create a new user
 */
async function createUser({ username, email, passwordHash, passwordSalt, role, status, permissions }) {
  await initDb();

  const document = {
    username,
    email: (email || '').trim(),
    password_hash: passwordHash,
    password_salt: passwordSalt,
    role,
    status: status === 'deactive' ? 'deactive' : 'active',
    permissions: Array.isArray(permissions) ? permissions : [],
    created_at: new Date(),
  };

  const result = await db.collection('users').insertOne(document);
  return result.insertedId.toString();
}

/**
 * Get user count
 */
async function getUserCount() {
  await initDb();
  return await db.collection('users').countDocuments();
}

/**
 * Save or update settings
 */
async function saveSettings(userId, key, value) {
  await initDb();

  await db.collection('settings').updateOne(
    { user_id: userId, key },
    {
      $set: {
        user_id: userId,
        key,
        value: JSON.stringify(value),
        updated_at: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Get settings
 */
async function getSettings(userId, key) {
  await initDb();

  const setting = await db.collection('settings').findOne({ user_id: userId, key });

  if (!setting) return null;

  try {
    return JSON.parse(setting.value);
  } catch (e) {
    return setting.value;
  }
}

/**
 * Log activity
 */
async function logActivity({ userId, action, details }) {
  await initDb();

  await db.collection('activities').insertOne({
    user_id: userId,
    action,
    details,
    created_at: new Date(),
  });
}

/**
 * Get activities
 */
async function getActivities({ userId = null, limit = 100, offset = 0 }) {
  await initDb();

  const filter = {};
  if (userId) {
    filter.user_id = userId;
  }

  const results = await db
    .collection('activities')
    .find(filter)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    user_id: doc.user_id,
    action: doc.action,
    details: doc.details,
    created_at: doc.created_at?.toISOString(),
  }));
}

/**
 * Track API usage
 */
async function trackApiUsage({ userId, cost, tokens }) {
  await initDb();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.collection('api_usage').updateOne(
    { user_id: userId, date: today },
    {
      $inc: {
        blogs_generated: 1,
        total_cost: cost,
        total_tokens: tokens,
      },
      $setOnInsert: {
        user_id: userId,
        date: today,
      },
    },
    { upsert: true }
  );
}

/**
 * Get API usage (aggregated summary)
 */
async function getApiUsage({ userId = null, isAdmin = false, dateFrom, dateTo }) {
  await initDb();

  const filter = {};

  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) {
      filter.date.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      filter.date.$lte = new Date(dateTo);
    }
  }

  const result = await db
    .collection('api_usage')
    .aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          blogs_generated: { $sum: '$blogs_generated' },
          total_cost: { $sum: '$total_cost' },
          total_tokens: { $sum: '$total_tokens' },
        },
      },
    ])
    .toArray();

  const row = result[0];
  return row
    ? {
        date: null,
        blogsGenerated: row.blogs_generated || 0,
        totalCost: row.total_cost || 0,
        totalTokens: row.total_tokens || 0,
      }
    : { date: null, blogsGenerated: 0, totalCost: 0, totalTokens: 0 };
}

/**
 * Upsert remote posts (from WordPress sync)
 */
async function upsertRemotePosts(posts, provider = 'wordpress') {
  await initDb();

  const bulkOps = posts.map((post) => ({
    updateOne: {
      filter: { id: post.id, provider },
      update: {
        $set: {
          id: post.id,
          provider,
          destination_id: post.destination_id || null,
          title: post.title,
          status: post.status,
          url: post.url,
          created_at: post.created_at ? new Date(post.created_at) : null,
          updated_at: post.updated_at ? new Date(post.updated_at) : null,
          published_at: post.published_at ? new Date(post.published_at) : null,
          views: post.views || 0,
          last_viewed: post.last_viewed ? new Date(post.last_viewed) : null,
          time_spent: typeof post.time_spent === 'number' ? post.time_spent : null,
          topics: post.topics || [],
          synced_at: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (bulkOps.length > 0) {
    await db.collection('remote_posts').bulkWrite(bulkOps);
  }
}

async function replaceRemotePosts(posts, provider = 'wordpress', destinationId = null) {
  await initDb();
  if (destinationId) {
    await db.collection('remote_posts').deleteMany({ provider, destination_id: destinationId });
  }
  await upsertRemotePosts(posts, provider);
}

async function deleteRemotePost({ id, provider = null, destinationId = null }) {
  await initDb();
  if (!id) return;
  const filter = { id };
  if (provider) filter.provider = provider;
  if (destinationId) filter.destination_id = destinationId;
  await db.collection('remote_posts').deleteOne(filter);
}

/**
 * Get remote posts
 */
async function listRemotePosts({ status = null, limit = 200, destinationId = null }) {
  await initDb();

  const filter = {};

  if (status) {
    filter.status = status;
  }
  if (destinationId) {
    filter.destination_id = destinationId;
  }

  const results = await db
    .collection('remote_posts')
    .find(filter)
    .sort({ synced_at: -1 })
    .limit(limit)
    .toArray();

  return results.map((doc) => ({
    id: doc.id,
    provider: doc.provider,
    destinationId: doc.destination_id || null,
    title: doc.title,
    status: doc.status,
    url: doc.url,
    createdAt: doc.created_at?.toISOString(),
    updatedAt: doc.updated_at?.toISOString(),
    publishedAt: doc.published_at?.toISOString(),
    views: typeof doc.views === 'number' ? doc.views : null,
    lastViewed: doc.last_viewed?.toISOString(),
    timeSpent: typeof doc.time_spent === 'number' ? doc.time_spent : null,
    topics: doc.topics || [],
    syncedAt: doc.synced_at?.toISOString(),
  }));
}

/**
 * Record publish history
 */
async function recordPublishHistory(entry) {
  await initDb();

  const document = {
    blog_id: entry.blogId,
    remote_post_id: entry.remotePostId || null,
    destination_id: entry.destinationId,
    destination_name: entry.destinationName,
    platform: entry.platform,
    status: entry.status,
    published_url: entry.publishedUrl,
    published_at: entry.publishedAt ? new Date(entry.publishedAt) : new Date(),
    user_id: entry.userId,
  };

  const result = await db.collection('publish_history').insertOne(document);
  return result.insertedId.toString();
}

// ======================= ANALYTICS EVENTS (REALTIME) =======================

async function logAnalyticsEvent(event) {
  await initDb();
  await db.collection('events').insertOne({
    ...event,
    created_at: new Date(event.created_at || Date.now()),
  });
}

async function upsertSession({ sessionId, userId = null, firstTouch = null, lastTouch = null, landing = null, device = null }) {
  await initDb();
  const now = new Date();
  await db.collection('sessions').updateOne(
    { session_id: sessionId },
    {
      $setOnInsert: { session_id: sessionId, started_at: now, first_touch: firstTouch },
      $set: {
        user_id: userId,
        last_touch: lastTouch,
        landing,
        device,
        last_seen: now,
      },
    },
    { upsert: true }
  );
}

async function heartbeatSession({ sessionId }) {
  await initDb();
  const now = new Date();
  await db.collection('sessions').updateOne({ session_id: sessionId }, { $set: { last_seen: now } });
}

async function endSession({ sessionId }) {
  await initDb();
  const now = new Date();
  const session = await db.collection('sessions').findOne({ session_id: sessionId });
  if (session) {
    const duration = Math.max(0, Math.round((now - session.started_at) / 1000));
    await db
      .collection('sessions')
      .updateOne({ session_id: sessionId }, { $set: { ended_at: now, duration_sec: duration, last_seen: now } });
  }
}

async function getRealtimeAnalytics({ windowMinutes = 10 } = {}) {
  await initDb();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const recentEvents = await db
    .collection('events')
    .find({ created_at: { $gte: since } })
    .project({ event: 1, props: 1, created_at: 1, screen_name: 1 })
    .toArray();

  const activeSessions = await db
    .collection('sessions')
    .find({ last_seen: { $gte: new Date(Date.now() - 60 * 1000) } })
    .project({ session_id: 1, user_id: 1 })
    .toArray();

  // Top screens
  const screenCounts = {};
  recentEvents
    .filter((e) => e.event === 'screen_view' && e.screen_name)
    .forEach((e) => {
      screenCounts[e.screen_name] = (screenCounts[e.screen_name] || 0) + 1;
    });
  const topScreens = Object.entries(screenCounts)
    .map(([screen, count]) => ({ screen, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const liveConversions = recentEvents.filter((e) =>
    ['purchase', 'subscription_start', 'signup_complete'].includes(e.event)
  ).length;

  const liveErrors = recentEvents.filter((e) => e.event === 'error').length;

  return {
    activeUsers: activeSessions.length,
    activeSessions: activeSessions.length,
    topScreens,
    liveConversions,
    liveErrors,
    windowMinutes,
  };
}

/**
 * Get publish history
 */
async function getPublishHistory({ userId = null, limit = 100, offset = 0, dateFrom, dateTo, platform, status, destinationId = null }) {
  await initDb();

  const filter = {};

  if (userId) {
    filter.user_id = userId;
  }

  if (dateFrom || dateTo) {
    filter.published_at = {};
    if (dateFrom) {
      filter.published_at.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      filter.published_at.$lte = new Date(dateTo);
    }
  }

  if (platform) {
    filter.platform = platform;
  }

  if (status) {
    filter.status = status;
  }
  if (destinationId) {
    filter.destination_id = destinationId;
  }

  const results = await db
    .collection('publish_history')
    .find(filter)
    .sort({ published_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    blog_id: doc.blog_id,
    remote_post_id: doc.remote_post_id,
    destination_id: doc.destination_id,
    destination_name: doc.destination_name,
    platform: doc.platform,
    status: doc.status,
    published_url: doc.published_url,
    published_at: doc.published_at?.toISOString(),
    user_id: doc.user_id,
  }));
}

/**
 * Get publish analytics
 */
async function getPublishAnalytics({ userId = null, dateFrom, dateTo, destinationId = null }) {
  await initDb();

  // Build filter for publish history
  const historyFilter = {};
  if (userId) {
    historyFilter.user_id = userId;
  }
  if (destinationId) {
    historyFilter.destination_id = destinationId;
  }
  if (dateFrom || dateTo) {
    historyFilter.published_at = {};
    if (dateFrom) {
      historyFilter.published_at.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      historyFilter.published_at.$lte = new Date(dateTo);
    }
  }

  // Get all publish history
  const historyRows = await db
    .collection('publish_history')
    .find(historyFilter)
    .sort({ published_at: -1 })
    .toArray();

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
      const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
      const month = date.toISOString().substring(0, 7);
      if (!publishedByMonth[month]) {
        publishedByMonth[month] = { month, count: 0, views: 0 };
      }
      publishedByMonth[month].count++;
      publishedByMonth[month].views += post.views || 0;
    });
  } else {
    historyRows.forEach((row) => {
      if (row.published_at) {
        const date = row.published_at instanceof Date ? row.published_at : new Date(row.published_at);
        const month = date.toISOString().substring(0, 7); // YYYY-MM
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
  const recentPublishes = historyRows.slice(0, 10).map((row) => ({
    id: row._id?.toString(),
    blogId: row.blog_id,
    destinationName: row.destination_name,
    platform: row.platform,
    status: row.status,
    publishedAt: row.published_at?.toISOString ? row.published_at.toISOString() : row.published_at,
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
 * Get remote post analytics
 */
async function getRemotePostAnalytics() {
  await initDb();

  const pipeline = [
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalViews: { $sum: '$views' },
      },
    },
  ];

  const statusCounts = await db.collection('remote_posts').aggregate(pipeline).toArray();

  const totalPosts = await db.collection('remote_posts').countDocuments();
  const totalViews = await db
    .collection('remote_posts')
    .aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }])
    .toArray();

  return {
    summary: {
      totalPosts,
      totalPublished: statusCounts.find((s) => s._id === 'publish')?.count || 0,
      totalDrafts: statusCounts.find((s) => s._id === 'draft')?.count || 0,
      totalViews: totalViews[0]?.total || 0,
      avgViewsPerPost: totalPosts > 0 ? Math.round((totalViews[0]?.total || 0) / totalPosts) : 0,
    },
  };
}

/**
 * Get blogs by IDs
 */
async function getBlogsByIds(ids, { userId = null, isAdmin = false } = {}) {
  await initDb();

  if (!ids || ids.length === 0) {
    return [];
  }

  if (!isAdmin && !userId) {
    return [];
  }

  const filter = { _id: { $in: ids.map((id) => new ObjectId(id)) } };

  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  const results = await db.collection('blogs').find(filter).sort({ created_at: -1 }).toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    title: doc.title,
    content: doc.content,
    metaDescription: doc.meta_description,
    keywords: doc.keywords || '',
    categories: safeParseJson(doc.categories, []),
    imageUrl: doc.image_url,
    imageGallery: buildImageGallery(doc.image_gallery, doc.image_url),
    localImagePath: doc.local_image_path,
    wordCount: doc.word_count,
    seoScore: doc.seo_score,
    language: doc.language,
    generatedAt: doc.created_at?.toISOString(),
    cost: doc.cost,
  }));
}

/**
 * Get history summary
 */
async function getHistorySummary({ userId = null, isAdmin = false } = {}) {
  await initDb();

  if (!isAdmin && !userId) {
    return { totalCount: 0, totalCost: 0 };
  }

  const filter = {};
  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  const totalCount = await db.collection('blogs').countDocuments(filter);

  const costResult = await db
    .collection('blogs')
    .aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$cost' } } }])
    .toArray();

  return {
    totalCount,
    totalCost: costResult[0]?.total || 0,
  };
}

/**
 * Clear blogs
 */
async function clearBlogs({ userId, isAdmin }) {
  await initDb();

  if (isAdmin) {
    await db.collection('blogs').deleteMany({});
  } else {
    await db.collection('blogs').deleteMany({ user_id: userId });
  }
}

/**
 * List all users
 */
async function listUsers() {
  await initDb();

  const results = await db
    .collection('users')
    .find({})
    .project({ password_hash: 0, password_salt: 0 })
    .sort({ _id: 1 })
    .toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    username: doc.username,
    email: doc.email || '',
    role: doc.role,
    status: doc.status || 'active',
    permissions: Array.isArray(doc.permissions) ? doc.permissions : [],
    createdAt: doc.created_at?.toISOString(),
  }));
}

/**
 * Update user access
 */
async function updateUserAccess({ id, role, permissions, email, status }) {
  await initDb();

  const nextValues = {};
  if (typeof role === 'string') {
    nextValues.role = role;
  }
  if (Array.isArray(permissions)) {
    nextValues.permissions = permissions;
  }
  if (typeof email === 'string') {
    nextValues.email = email.trim();
  }
  if (status === 'active' || status === 'deactive') {
    nextValues.status = status;
  }

  if (Object.keys(nextValues).length === 0) {
    return;
  }

  await db.collection('users').updateOne(buildIdFilter(id), { $set: nextValues });
}

/**
 * Delete user by ID
 */
async function deleteUser({ id }) {
  await initDb();
  const result = await db.collection('users').deleteOne(buildIdFilter(id));
  return result.deletedCount || 0;
}

/**
 * List activities (alias for getActivities with different signature)
 */
async function listActivities({ userId, isAdmin, limit = 50 }) {
  await initDb();

  const filter = {};
  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  const results = await db
    .collection('activities')
    .aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $sort: { created_at: -1 } },
      { $limit: limit },
    ])
    .toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    userId: doc.user_id,
    username: doc.user[0]?.username || 'System',
    action: doc.action,
    details: doc.details,
    createdAt: doc.created_at?.toISOString(),
  }));
}

/**
 * Set a single setting
 */
async function setSetting({ userId, key, value }) {
  await initDb();

  await db.collection('settings').updateOne(
    { user_id: userId || null, key },
    {
      $set: {
        user_id: userId || null,
        key,
        value,
        updated_at: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Get a single setting
 */
async function getSetting({ userId, key }) {
  await initDb();

  const setting = await db
    .collection('settings')
    .findOne({ user_id: userId || null, key });

  return setting ? setting.value : null;
}

/**
 * Add log entry
 */
async function addLog({ level = 'info', category = 'general', message, details, blogId, tokensUsed, cost, userId }) {
  await initDb();

  await db.collection('logs').insertOne({
    timestamp: new Date(),
    level,
    category,
    message,
    details: details ? JSON.stringify(details) : null,
    blog_id: blogId || null,
    tokens_used: typeof tokensUsed === 'number' ? tokensUsed : null,
    cost: typeof cost === 'number' ? cost : null,
    user_id: userId || null,
  });
}

/**
 * List logs
 */
async function listLogs({ userId, isAdmin, limit = 100, offset = 0, level, category }) {
  await initDb();

  const filter = {};

  if (level) {
    filter.level = level;
  }

  if (category) {
    filter.category = category;
  }

  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  const results = await db
    .collection('logs')
    .find(filter)
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    timestamp: doc.timestamp?.toISOString(),
    level: doc.level,
    category: doc.category,
    message: doc.message,
    details: doc.details,
    blogId: doc.blog_id,
    tokensUsed: doc.tokens_used,
    cost: doc.cost,
    userId: doc.user_id,
  }));
}

/**
 * Get log statistics
 */
async function getLogStats({ userId, isAdmin }) {
  await initDb();

  const matchFilter = {};
  if (!isAdmin && userId) {
    matchFilter.user_id = userId;
  }

  const total = await db.collection('logs').countDocuments(matchFilter);

  const errors = await db.collection('logs').countDocuments({ ...matchFilter, level: 'error' });

  const tokenResult = await db
    .collection('logs')
    .aggregate([
      { $match: { ...matchFilter, tokens_used: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$tokens_used' } } },
    ])
    .toArray();

  const costResult = await db
    .collection('logs')
    .aggregate([
      { $match: { ...matchFilter, cost: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$cost' } } },
    ])
    .toArray();

  return {
    total,
    errors,
    totalTokens: tokenResult[0]?.total || 0,
    totalCost: costResult[0]?.total || 0,
  };
}

/**
 * Clear logs
 */
async function clearLogs({ userId, isAdmin }) {
  await initDb();

  if (isAdmin) {
    await db.collection('logs').deleteMany({});
  } else {
    await db.collection('logs').deleteMany({ user_id: userId });
  }
}

/**
 * Add notification
 */
async function addNotification({ userId, type, message }) {
  await initDb();

  await db.collection('notifications').insertOne({
    user_id: userId,
    type,
    message,
    is_read: false,
    created_at: new Date(),
  });
}

/**
 * List notifications
 */
async function listNotifications({ userId, isAdmin, limit = 100 }) {
  await initDb();

  const filter = {};
  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  const results = await db
    .collection('notifications')
    .find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    userId: doc.user_id,
    type: doc.type,
    message: doc.message,
    isRead: doc.is_read,
    createdAt: doc.created_at?.toISOString(),
  }));
}

/**
 * Mark notification as read
 */
async function markNotificationRead({ id, userId, isAdmin }) {
  await initDb();

  const filter = { _id: new ObjectId(id) };
  if (!isAdmin && userId) {
    filter.user_id = userId;
  }

  await db.collection('notifications').updateOne(filter, { $set: { is_read: true } });
}

/**
 * Clear notifications
 */
async function clearNotifications({ userId, isAdmin }) {
  await initDb();

  if (isAdmin) {
    await db.collection('notifications').deleteMany({});
  } else {
    await db.collection('notifications').deleteMany({ user_id: userId });
  }
}

/**
 * Update API usage (alias for trackApiUsage with different signature)
 */
async function updateApiUsage({ userId, cost = 0, tokens = 0 }) {
  await initDb();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.collection('api_usage').updateOne(
    { user_id: userId || null, date: today },
    {
      $inc: {
        blogs_generated: 1,
        total_cost: cost,
        total_tokens: tokens,
      },
      $setOnInsert: {
        user_id: userId || null,
        date: today,
      },
    },
    { upsert: true }
  );
}

/**
 * Get publish history by blog ID
 */
async function getPublishHistoryByBlog(blogId) {
  await initDb();

  const results = await db
    .collection('publish_history')
    .find({ blog_id: blogId })
    .sort({ published_at: -1 })
    .toArray();

  return results.map((doc) => ({
    id: doc._id.toString(),
    blogId: doc.blog_id,
    remotePostId: doc.remote_post_id,
    destinationId: doc.destination_id,
    destinationName: doc.destination_name,
    platform: doc.platform,
    status: doc.status,
    publishedUrl: doc.published_url,
    publishedAt: doc.published_at?.toISOString(),
    userId: doc.user_id,
  }));
}

/**
 * Close database connection
 */
async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    isInitialized = false;
    console.log('[MongoDB] Connection closed');
  }
}

module.exports = {
  setStore,
  initDb,
  saveBlog,
  getBlogs,
  getBlogById,
  getBlogsByIds,
  updateBlog,
  deleteBlog,
  clearBlogs,
  getHistorySummary,
  getUserByUsername,
  getUserById,
  createUser,
  getUserCount,
  listUsers,
  updateUserAccess,
  deleteUser,
  saveSettings,
  getSettings,
  setSetting,
  getSetting,
  logActivity,
  getActivities,
  listActivities,
  trackApiUsage,
  updateApiUsage,
  getApiUsage,
  addLog,
  listLogs,
  getLogStats,
  clearLogs,
  addNotification,
  listNotifications,
  markNotificationRead,
  clearNotifications,
  upsertRemotePosts,
  replaceRemotePosts,
  deleteRemotePost,
  listRemotePosts,
  recordPublishHistory,
  addPublishHistory: recordPublishHistory, // Alias for compatibility
  getPublishHistory,
  getPublishHistoryByBlog,
  getPublishAnalytics,
  getRemotePostAnalytics,
  logAnalyticsEvent,
  upsertSession,
  heartbeatSession,
  endSession,
  getRealtimeAnalytics,
  closeDb,
  // Additional aliases for compatibility
  listBlogs: getBlogs,
};
