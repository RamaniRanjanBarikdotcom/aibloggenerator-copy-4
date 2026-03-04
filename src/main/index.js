const { app, BrowserWindow, ipcMain, shell, Menu, clipboard } = require('electron');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment variables (packaged build reads from resources/.env)
const envPath = app?.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

// Reduce GPU-related black screens on some Windows setups.
app.disableHardwareAcceleration();
const Store = require('electron-store');
const FormData = require('form-data');
const mime = require('mime-types');
const {
  chatCompletion,
  generateImage,
  testConnection,
  estimateCost,
  parseJsonContent,
  tavilySearch,
  openaiWebSearch,
  wikipediaSummary,
  getProvider,
  IMAGE_DEFAULT_MODEL,
  listProviderModels,
} = require('./aiProviders');
const {
  setStore,
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
  deleteUser,
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
  getRemotePostAnalytics,
  addPublishHistory,
  getPublishHistoryByBlog,
  getPublishHistory,
  getPublishAnalytics,
  logAnalyticsEvent,
  upsertSession,
  heartbeatSession,
  endSession,
  getRealtimeAnalytics,
} = require('./utils/db-mongodb');
const { exportBlog, exportHistoryCsv } = require('./services/fileExporter');
const ProductScraper = require('./services/productScraper');
const axios = require('axios');
const cheerio = require('cheerio');

const store = new Store({
  encryptionKey: 'your-secret-key-change-in-production',
});

// Pass store instance to database module so it can access MongoDB credentials
// This is crucial for built executables where .env file is not available
setStore(store);

let mainWindow;
let currentUser = null;
const CURRENT_USER_KEY = 'current_user_id';
const LAST_EXPORT_DIR_KEY = 'last_export_dir';

function getUserApiKeyKey(userId) {
  return `openai_api_key_${userId}`;
}

function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function requireHttps(url) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Endpoint must start with http:// or https://');
  }
  return url;
}

function ensureValue(label, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`${label} is required`);
  }
  return String(value).trim();
}

function isPublicHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function normalizeImageGallery(gallery, imageUrl = null) {
  let list = [];
  if (Array.isArray(gallery)) {
    list = gallery.filter(Boolean);
  } else if (typeof gallery === 'string') {
    try {
      const parsed = JSON.parse(gallery);
      if (Array.isArray(parsed)) {
        list = parsed.filter(Boolean);
      }
    } catch (error) {
      list = [];
    }
  }
  if (imageUrl && !list.includes(imageUrl)) {
    list.unshift(imageUrl);
  }
  return list;
}

function slugifyFilename(value) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'image';
}

function buildImageFilename({ title, blogId, mimeType, originalName }) {
  const base = slugifyFilename(title || blogId);
  const extFromMime = mime.extension(mimeType || '') || '';
  const extFromName = originalName && path.extname(originalName).replace('.', '');
  const ext = extFromMime || extFromName || 'jpg';
  return `${base}-${Date.now()}.${ext}`;
}

function appendImageToGallery(gallery, imageUrl) {
  const list = normalizeImageGallery(gallery);
  if (imageUrl && !list.includes(imageUrl)) {
    list.unshift(imageUrl);
  }
  return list;
}

function normalizeShopDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
}

const SHOPIFY_SECRET_MASK = '********';

function getShopifyOauthRedirectUrl() {
  const port = Number(process.env.SHOPIFY_OAUTH_PORT || 4319);
  return `http://localhost:${port}/shopify/callback`;
}

function getEncryptionKey() {
  const seed =
    process.env.APP_ENCRYPTION_KEY ||
    process.env.SHOPIFY_OAUTH_STORE_KEY ||
    process.env.ELECTRON_STORE_KEY ||
    app.getPath('userData');
  return crypto.createHash('sha256').update(String(seed)).digest();
}

function encryptSecret(secret) {
  if (!secret) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(payload) {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('enc:')) {
    return payload || '';
  }
  const parts = payload.split(':');
  if (parts.length !== 4) return '';
  const [, ivHex, tagHex, dataHex] = parts;
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.warn('[OAuth] Failed to decrypt secret:', error.message);
    return '';
  }
}

function sanitizeShopifyOauthClientsForUi(list = []) {
  return list.map((client) => ({
    id: client.id,
    name: client.name || '',
    clientId: client.clientId || '',
    hasSecret: Boolean(client.clientSecretEnc),
    clientSecretMasked: client.clientSecretEnc ? SHOPIFY_SECRET_MASK : '',
    createdAt: client.createdAt || null,
    updatedAt: client.updatedAt || null,
  }));
}

function normalizeShopifyOauthClients(incoming = [], existing = []) {
  const existingMap = new Map(existing.map((item) => [item.id, item]));
  return incoming
    .filter((client) => client && client.clientId)
    .map((client) => {
      const existingClient = existingMap.get(client.id);
      const next = {
        id: client.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: client.name || existingClient?.name || '',
        clientId: client.clientId || existingClient?.clientId || '',
        createdAt: existingClient?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const incomingSecret = String(client.clientSecret || '').trim();
      if (incomingSecret && incomingSecret !== SHOPIFY_SECRET_MASK) {
        next.clientSecretEnc = encryptSecret(incomingSecret);
      } else if (existingClient?.clientSecretEnc) {
        next.clientSecretEnc = existingClient.clientSecretEnc;
      } else {
        next.clientSecretEnc = '';
      }
      return next;
    });
}

function buildShopifyHmacMessage(params) {
  const pairs = Object.keys(params)
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .map((key) => `${key}=${params[key]}`);
  return pairs.join('&');
}

function verifyShopifyHmac(params, secret) {
  const hmac = params.hmac || '';
  if (!hmac) return false;
  const message = buildShopifyHmacMessage(params);
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const digestBuf = Buffer.from(digest);
  const hmacBuf = Buffer.from(hmac);
  if (digestBuf.length !== hmacBuf.length) return false;
  return crypto.timingSafeEqual(digestBuf, hmacBuf);
}

function buildShopifyArticleUrl({ shopDomain, blogHandle, articleHandle }) {
  const domain = normalizeShopDomain(shopDomain);
  if (!domain || !blogHandle || !articleHandle) return null;
  return `https://${domain}/blogs/${blogHandle}/${articleHandle}`;
}

async function fetchShopifyBlogHandle({ shopDomain, accessToken, apiVersion = '2024-01', blogId }) {
  if (!shopDomain || !accessToken || !blogId) return '';
  const domain = normalizeShopDomain(shopDomain);
  const version = (apiVersion || '2024-01').trim();
  try {
    const response = await axios.get(`https://${domain}/admin/api/${version}/blogs/${blogId}.json`, {
      headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': accessToken },
      timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    });
    return response.data?.blog?.handle || '';
  } catch (error) {
    console.warn('[Shopify] Failed to fetch blog handle:', error?.response?.status || '', error?.message || '');
    return '';
  }
}

async function loadImageBuffer({ imageUrl, localImagePath }) {
  // Prefer local file if present
  if (localImagePath && fs.existsSync(localImagePath)) {
    const buf = fs.readFileSync(localImagePath);
    const mimeType = mime.lookup(localImagePath) || 'image/jpeg';
    const filename = path.basename(localImagePath) || 'image.jpg';
    return { buffer: buf, mimeType, filename };
  }

  if (!imageUrl) {
    throw new Error('No image source provided');
  }

  // Support data URI sources directly.
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageUrl)) {
    const match = imageUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) {
      throw new Error('Invalid data URI image');
    }
    const mimeType = match[1] || 'image/jpeg';
    const buffer = Buffer.from(match[2], 'base64');
    const ext = mime.extension(mimeType) || 'jpg';
    return { buffer, mimeType, filename: `image.${ext}` };
  }

  const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const buffer = Buffer.from(resp.data);
  const mimeType = resp.headers['content-type'] || mime.lookup(imageUrl) || 'image/jpeg';
  const urlPath = new URL(imageUrl).pathname;
  const filenameFromUrl = path.basename(urlPath || '') || 'image.jpg';
  const filename = /\.[a-z0-9]{2,5}$/i.test(filenameFromUrl) ? filenameFromUrl : `${filenameFromUrl}.jpg`;

  return { buffer, mimeType, filename };
}

async function uploadImageViaPlugin({ baseUrl, authHeader, buffer, filename, mimeType, altText }) {
  const uploadEndpoint = `${baseUrl}/wp-json/aiblog/v1/upload`;
  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
  const payload = {
    url: '',
    data: dataUri,
    filename: filename || 'image.jpg',
    alt: altText || '',
    title: altText || '',
    setFeatured: false,
  };

  const res = await axios.post(uploadEndpoint, payload, {
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    headers: {
      ...PUBLISH_AXIOS_DEFAULTS.headers,
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  return res.data; // { attachmentId, url, fullUrl, ... }
}

// Common axios config for WordPress/external API calls
const PUBLISH_AXIOS_DEFAULTS = {
  timeout: 30000,
  headers: {
    'User-Agent': 'AIBlogGenerator/1.0',
  },
};

async function uploadImageToStorage({ blog, imageUrl, localImagePath, storage, filenameBase = '' }) {
  if (!storage?.enabled) return null;
  const endpointUrl = ensureValue('Image storage endpoint', storage.endpointUrl);
  const token = String(storage.authToken || '').trim();
  const img = await loadImageBuffer({ imageUrl, localImagePath });
  const filename = buildImageFilename({
    title: filenameBase || blog?.title,
    blogId: blog?.id,
    mimeType: img.mimeType,
    originalName: img.filename,
  });
  const form = new FormData();
  form.append('file', img.buffer, {
    filename,
    contentType: img.mimeType || 'image/jpeg',
  });
  if (blog?.id) form.append('blog_id', String(blog.id));
  if (blog?.title) form.append('title', String(blog.title));
  form.append('base_folder', 'blog-bild');
  if (token) {
    form.append('token', token);
  }

  const headers = { ...PUBLISH_AXIOS_DEFAULTS.headers, ...form.getHeaders() };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await axios.post(endpointUrl, form, {
    headers,
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
  });

  const url =
    response.data?.url ||
    response.data?.file?.url ||
    response.data?.data?.url ||
    '';
  if (!url) {
    throw new Error('Image storage did not return a URL.');
  }
  return url;
}

const WP_STATS_CACHE_MS = 60 * 1000; // 1 minute cache for status counters
let wpStatsCache = new Map(); // key: destinationId|baseUrl, value: { ts, data }

function buildWpAuthHeader(destination) {
  const apiToken = (destination.apiToken || destination.token || destination.authToken || '').trim();
  const username = destination.username?.trim();
  const appPassword = destination.appPassword?.trim();

  if (apiToken) {
    return `Bearer ${apiToken}`;
  }
  if (username && appPassword) {
    return `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  }
  throw new Error('Provide either an API token (from AI Blog Token plugin) or username + application password');
}

async function fetchWordpressCategories(destination) {
  const baseUrl = requireHttps(normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl)));
  const endpoint = `${baseUrl}/wp-json/aiblog/v1/categories`;
  const authHeader = buildWpAuthHeader(destination);
  const response = await axios.get(endpoint, {
    headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
  });
  return Array.isArray(response.data) ? response.data : [];
}

async function fetchWordpressStatusCounts(destination) {
  const baseUrl = requireHttps(normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl)));
  const cacheKey = `${destination.id || 'default'}|${baseUrl}`;
  const now = Date.now();
  const cached = wpStatsCache.get(cacheKey);
  if (cached && now - cached.ts < WP_STATS_CACHE_MS) {
    return cached.data;
  }

  const endpoint = `${baseUrl}/wp-json/aiblog/v1/site`;
  const authHeader = buildWpAuthHeader(destination);
  const res = await axios.get(endpoint, {
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
  });
  const postCounts = res.data?.postCounts || {};
  const data = {
    total: Object.values(postCounts).reduce((sum, v) => sum + Number(v || 0), 0),
    published: Number(postCounts.publish || 0),
    draft: Number(postCounts.draft || 0),
    pending: Number(postCounts.pending || 0),
    scheduled: Number(postCounts.future || 0),
    private: Number(postCounts.private || 0),
    trash: Number(postCounts.trash || 0),
    raw: postCounts,
  };
  wpStatsCache.set(cacheKey, { ts: now, data });
  return data;
}

async function createWordpressCategoryRemote(destination, name) {
  const baseUrl = requireHttps(normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl)));
  const endpoint = `${baseUrl}/wp-json/aiblog/v1/categories`;
  const authHeader = buildWpAuthHeader(destination);
  const response = await axios.post(
    endpoint,
    { name },
    {
      headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
      timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    }
  );
  return response.data;
}

// Extract detailed error message from axios errors
function extractPublishError(error) {
  const status = error?.response?.status;
  const wpMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.data?.message ||
    '';
  const generic = error?.message || 'Unknown error';

  // Provide actionable guidance based on HTTP status codes
  if (status === 401) {
    return `Authentication failed (401): ${wpMessage || 'Invalid credentials'}. For WordPress Basic Auth, ensure you are using an Application Password (not your login password). Go to WordPress Admin > Users > Profile > Application Passwords to generate one.`;
  }
  if (status === 403) {
    return `Access forbidden (403): ${wpMessage || 'Insufficient permissions'}. Ensure your WordPress user has Editor or Administrator role. For token auth, verify the token matches exactly what is shown in WordPress Settings > AI Blog Token.`;
  }
  if (status === 404) {
    return `Endpoint not found (404): ${wpMessage || 'The REST API endpoint was not found'}. Verify the site URL is correct and WordPress REST API is enabled. For the token plugin, ensure the AI Blog Endpoint plugin is activated.`;
  }
  if (status === 500 || status === 502 || status === 503) {
    return `Server error (${status}): ${wpMessage || 'The WordPress server encountered an error'}. Check your WordPress error logs for details.`;
  }
  if (error?.code === 'ECONNREFUSED') {
    return 'Connection refused: The server is not reachable. Verify the URL and that the site is online.';
  }
  if (error?.code === 'ENOTFOUND') {
    return 'DNS lookup failed: The domain could not be resolved. Check the URL for typos.';
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return 'Connection timed out: The server did not respond within 30 seconds. Check if the site is accessible from your network.';
  }
  if (generic.includes('SSL') || generic.includes('certificate') || generic.includes('TLSV1')) {
    return `SSL/TLS error: ${generic}. The site may have an invalid SSL certificate. Ensure HTTPS is properly configured on your WordPress site.`;
  }
  return wpMessage || generic || 'Publish failed';
}

function getDefaultExportDir() {
  const saved = store.get(LAST_EXPORT_DIR_KEY);
  if (saved && fs.existsSync(saved)) {
    return saved;
  }
  try {
    return app.getPath('documents');
  } catch {
    return app.getPath('home');
  }
}

function rememberExportDir(dirPath) {
  if (dirPath && fs.existsSync(dirPath)) {
    store.set(LAST_EXPORT_DIR_KEY, dirPath);
  }
}

async function getUserSettings(userId) {
  const raw = await getSetting({
    userId,
    key: `user_settings_${userId}`,
  });
  return raw ? JSON.parse(raw) : {};
}

async function getPublishDestination(destinationId, userId) {
  const settings = await getUserSettings(userId);
  const destinations = Array.isArray(settings.publishDestinations) ? settings.publishDestinations : [];
  if (!destinationId) {
    return destinations[0] || null;
  }
  return destinations.find((d) => d.id === destinationId) || null;
}

async function loadPersistedUser() {
  if (currentUser) {
    return currentUser;
  }
  const persistedUserId = store.get(CURRENT_USER_KEY);
  if (!persistedUserId) {
    return null;
  }
  const user = await getUserById(persistedUserId);
  if (!user) {
    store.delete(CURRENT_USER_KEY);
    return null;
  }
  if (user.status === 'deactive') {
    store.delete(CURRENT_USER_KEY);
    currentUser = null;
    return null;
  }
  currentUser = user;
  return user;
}

const PERMISSIONS = [
  'generate',
  'history',
  'export',
  'bulkExport',
  'settings',
  'notifications',
  'manageUsers',
];

const ALL_PERMISSIONS = [...PERMISSIONS];

const DEFAULT_PROMPTS = {
  styleGuardrails:
    'You are an expert SEO content writer. Output should feel human: varied sentence lengths, concrete mini-scenarios, light opinion with humility, conversational contractions, no cliches, no filler, no invented facts or stats. Ensure the primary keyword appears naturally in the first 120 words and 3-5 times across the post.',
  seoStructureGuardrails:
    'Structure every post: (1) H1 title + meta description, (2) Intro with hook/promise, (3) Context section, (4) 3-6 H2 body sections each with explanation + example + practical step, (5) Common mistakes section, (6) How to apply section with steps, (7) FAQ (3-5 Q&A), (8) Conclusion with CTA. Keep paragraphs short (2-5 lines), headings concise (<9 words).',
  seoResearchPrompt:
    `You are an SEO strategist. Analyze the topic and return tight keyword + intent data in {{language}}.

Topic: "{{topic}}"
Keywords: "{{keywords}}"
Focus keyword: "{{focusKeyword}}"

Respond with JSON:
{
  "primaryKeyword": "main keyword",
  "secondaryKeywords": ["keyword1", "keyword2", "keyword3"],
  "searchIntent": "informational | commercial | comparison | transactional",
  "relatedTopics": ["topic1", "topic2"],
  "questions": ["question1", "question2"],
  "painPoints": ["pain1", "pain2"]
}`,
  keyTakeawaysPrompt:
    `List 5 qualitative takeaways for "{{topic}}" in {{language}} as bullets. No numbers or statistics.`,
  researchSynthesisPrompt:
    `Synthesize research for "{{topic}}" in {{language}} using the context below. Focus on qualitative insights and practical guidance. Avoid statistics or numeric claims. Provide:
- key themes
- audience pain points
- trustworthy sources to cite (with URLs from context)
- recommended angles for the blog

Context:
{{researchContext}}`,
  outlinePrompt:
    `Create a long-form blog outline in {{language}} for "{{topic}}".

Include the primary idea, 4-6 body H2s, one "Common mistakes" H2, one "How to apply" H2, and an FAQ H2.

Respond with JSON:
{
  "sections": [
    {"heading": "Introduction", "subsections": ["Hook", "What readers will learn"]},
    {"heading": "Context", "subsections": ["Why it matters", "Current challenge"]},
    {"heading": "Main Section", "subsections": ["Point A", "Point B"]}
  ]
}`,
  blogPrompt:
    `Write a comprehensive, human-sounding blog post in {{language}}.

Topic: "{{topic}}"
Style: {{writingStyle}}
Tone: {{writingTone}}
Target word count: {{targetWordCount}}

Primary keyword: {{primaryKeyword}}
Secondary keywords: {{secondaryKeywords}}

Keyword usage rules:
- Include the primary keyword in the first 120 words, in one H2, and a few times naturally in body paragraphs.
- If an image is generated, include primary keyword in its alt text placeholder.

Outline:
{{outline}}

Formatting rules:
- Output valid HTML only. Use <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <blockquote>.
- Do not wrap output in code fences.
- Single <h1> at top. H2 headings concise (<9 words), natural language (no forced numbering). After each H2, include a 20-30 word lead paragraph.
- Lists: 4-7 items, 15-25 words each, parallel structure. Use <ol> for steps.
- FAQ: 3-5 Q&A entries using <p><strong>Q:</strong> ...</p><p><strong>A:</strong> ...</p>.
- Include one short <blockquote> quote (no fake attribution) and one <p><strong>Pro Tip:</strong> ...</p> callout.
- Add a comparison table only if clearly useful; otherwise skip.
- Only include <pre><code> if the topic is technical.

Content rules:
- FACTS RULE: Do not invent statistics, years, or percentages. Keep claims qualitative or cite provided sources with <a href="URL">text</a>.
- Use varied sentence lengths, mini-scenarios, and concrete examples. Avoid cliches and filler.
- Cover: intro hook, context, core sections, common mistakes, how to apply (steps), FAQ, conclusion with CTA.
- Internal links: if an internal site URL is provided, add 2-3 natural links using it. If product context is provided, link product names to their URLs.

Return JSON:
{
  "title": "Blog Title",
  "metaDescription": "Description",
  "content": "Full blog content in HTML format"
}`,
  repairPrompt:
    `You are a senior editor. Turn the draft into a full blog post with complete paragraphs, natural flow, and the required structure (intro, context, core sections, mistakes, how-to apply, FAQ, conclusion).

Draft:
{{draft}}

Respond with JSON:
{
  "title": "Blog Title",
  "metaDescription": "Description",
  "content": "Full blog content in HTML format"
}`,
  humanizePrompt:
    `Polish this blog post for natural flow and human tone. Vary sentence length, add subtle transitions, remove cliches, keep facts unchanged. Use light contractions (don't, can't, it's), and avoid formulaic openings/closings. Keep HTML tags intact.

Content:
{{draft}}

Return the improved content only.`,
  compliancePrompt:
    `You are a strict editor. Make sure the draft follows formatting + content rules.

Rules:
- Valid HTML only (<h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <blockquote>, optional <table>). No code fences.
- Single <h1>. H2 concise (<9 words), natural language. After each H2 add a 20-30 word lead paragraph.
- Lists: 4-7 items, 15-25 words, parallel structure; use <ol> for steps.
- Include FAQ (3-5 Q&A), one blockquote, one <p><strong>Pro Tip:</strong> ...</p>. Table only if useful. Code block only if technical.
- No invented statistics/percentages/years. Keep facts qualitative or cite provided sources with links.
- Required sections: intro, context, core sections, common mistakes, how to apply, FAQ, conclusion with CTA.
- Keep tone human, avoid repetition and cliches.

Draft:
{{draft}}

Return the revised content only.`,
  expandPrompt:
    `You are an editor. Expand this blog post to at least {{targetWordCount}} words.

Requirements:
- Keep all existing structure and HTML tags (<h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <blockquote>, optional <table>).
- Add depth with concrete examples, mini-scenarios, and step-by-step detail where relevant.
- Keep tone human and avoid cliches.
- Do NOT add statistics, percentages, or made-up facts.

Draft:
{{draft}}

Return expanded HTML content only.`,
  padPrompt:
    `You are an editor. Enrich this blog post to reach at least {{targetWordCount}} words while keeping its structure unchanged.

Add:
- Extra concrete examples and mini-scenarios inside existing sections
- More step-by-step detail where relevant
- Clarifying sentences that keep flow natural

Keep HTML tags intact (<h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <blockquote>, optional <table>). Do NOT add statistics, percentages, years, or made-up facts.

Draft:
{{draft}}

Return the enriched HTML content only.`,
  imagePrompt: `You are an expert AI prompt engineer specialized in generating high-quality photorealistic featured image prompts for professional blog articles.

Your task is to convert a blog topic paragraph into one polished image-generation prompt.

Instructions:

Analyze the input text and extract:

A clear, specific visual subject

A natural action being performed

A realistic setting or environment

Supporting visual details such as lighting, mood, composition, and color tones

If the topic is abstract (SEO, AI, marketing, strategy, analytics, etc.), convert it into a realistic visual metaphor that can be photographed naturally.

Generate exactly ONE single-line prompt using this structure:

[Specific subject], [natural action], in [clear setting], with [lighting, mood, composition, visual details]. The image must be natural, realistic, in 2018, style raw, 8K, taken on iPhone, --ar 16:9

Strict Rules:

Output ONLY the final image prompt.

No explanations.

No extra text.

No formatting.

No text overlays.

No logos.

No UI elements.

Must be photorealistic.

Must be landscape orientation (16:9).

Must end exactly with:

The image must be natural, realistic, in 2018, style raw, 8K, taken on iPhone, --ar 16:9
|

Input text:
{{topicParagraph}}`,
};

function renderTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (variables[key] === undefined || variables[key] === null) {
      return '';
    }
    return String(variables[key]);
  });
}

function buildImagePrompt({ title, content, template }) {
  const baseTemplate = template || DEFAULT_PROMPTS.imagePrompt;
  const cleanText = stripHtmlTags(content || '').trim();
  const topicParagraph = cleanText || (title || '').trim() || 'Professional blog topic';
  return renderTemplate(baseTemplate, {
    topic: (title || '').trim(),
    topicParagraph,
  });
}

function getPromptTemplates(settings) {
  const overrides = settings?.promptTemplates || {};
  const merged = { ...DEFAULT_PROMPTS, ...overrides };
  merged.blogPrompt = DEFAULT_PROMPTS.blogPrompt;
  merged.repairPrompt = DEFAULT_PROMPTS.repairPrompt;
  merged.compliancePrompt = DEFAULT_PROMPTS.compliancePrompt;
  return merged;
}

function stripHtmlTags(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, ' ');
}

function stripMarkdownFences(text) {
  if (!text) return '';
  let cleaned = text.replace(/```[a-z]*\n?/gi, '');
  cleaned = cleaned.replace(/```/g, '');
  return cleaned.trim();
}

function renumberH2Headings(html) {
  if (!html) return '';
  let index = 0;
  return html.replace(/<h2>(\s*)(\d+)(\s+)/gi, (match, leading, _num, spacing) => {
    index += 1;
    return `<h2>${leading}${index}${spacing}`;
  });
}

function ensureInternalLink(content, siteBaseUrl) {
  if (!content) return content;
  if (siteBaseUrl) {
    if (content.includes(siteBaseUrl)) return content;
    return `${content}\n\n<p>Explore more helpful guides at <a href="${siteBaseUrl}">${siteBaseUrl}</a>.</p>`;
  }
  return content;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function linkProducts(content, products) {
  if (!content || !Array.isArray(products) || products.length === 0) {
    return content;
  }
  const sorted = products
    .filter((item) => item?.title && item?.url)
    .sort((a, b) => b.title.length - a.title.length);
  if (sorted.length === 0) {
    return content;
  }

  const segments = content.split(/(<[^>]+>)/g);
  let inAnchor = false;
  const linked = segments.map((segment) => {
    if (segment.startsWith('<a')) {
      inAnchor = true;
      return segment;
    }
    if (segment.startsWith('</a')) {
      inAnchor = false;
      return segment;
    }
    if (segment.startsWith('<') || inAnchor) {
      return segment;
    }
    let updated = segment;
    sorted.forEach((product) => {
      const regex = new RegExp(`\\b${escapeRegExp(product.title)}\\b`, 'gi');
      updated = updated.replace(
        regex,
        `<a href="${product.url}" target="_blank" rel="noreferrer">${product.title}</a>`
      );
    });
    return updated;
  });

  return linked.join('');
}

function normalizeUrlForMatch(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return '';
  }
}

function keepOnlyScrapedLinks(content, products) {
  if (!content) return content;
  const allowed = new Set(
    (Array.isArray(products) ? products : [])
      .map((item) => normalizeUrlForMatch(item?.url))
      .filter(Boolean)
  );
  return content.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, href, inner) => {
    const normalizedHref = normalizeUrlForMatch(href);
    if (normalizedHref && allowed.has(normalizedHref)) {
      return match;
    }
    // Keep readable text but strip disallowed link markup.
    return inner;
  });
}

function normalizeSeoData(raw) {
  return {
    primaryKeyword: raw?.primaryKeyword || '',
    secondaryKeywords: Array.isArray(raw?.secondaryKeywords) ? raw.secondaryKeywords : [],
    searchIntent: raw?.searchIntent || '',
    relatedTopics: Array.isArray(raw?.relatedTopics) ? raw.relatedTopics : [],
  };
}

function normalizeMaxTokens(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const safe = Math.floor(parsed);
  if (safe <= 0) return null;
  return safe;
}

function isTechnicalTopic(topic, keywords) {
  const combined = `${topic || ''} ${keywords || ''}`.toLowerCase();
  const signals = [
    'driver',
    'printer',
    'software',
    'install',
    'api',
    'code',
    'debug',
    'error',
    'troubleshoot',
    'network',
    'database',
    'script',
    'linux',
    'windows',
  ];
  return signals.some((signal) => combined.includes(signal));
}

function stripCodeBlocks(html) {
  if (!html) return '';
  return html.replace(/<pre><code>[\s\S]*?<\/code><\/pre>/gi, '').trim();
}

function calculateSeoScore(content, title, metaDescription, keywords, focusKeyword) {
  let score = 0;
  if (title) {
    if (title.length >= 30 && title.length <= 60) score += 10;
    if (focusKeyword && title.toLowerCase().includes(focusKeyword.toLowerCase())) score += 10;
  }
  if (metaDescription) {
    if (metaDescription.length >= 120 && metaDescription.length <= 160) score += 10;
    if (focusKeyword && metaDescription.toLowerCase().includes(focusKeyword.toLowerCase())) score += 5;
  }
  if (content) {
    const textContent = stripHtmlTags(content);
    const words = textContent.split(/\s+/).filter(Boolean);
    if (words.length >= 1500) score += 15;
    if (words.length >= 1000 && words.length < 1500) score += 10;
    const markdownHeadings = (content.match(/^#{2,3}\s+/gm) || []).length;
    const htmlHeadings = (content.match(/<h[23]\b[^>]*>/gi) || []).length;
    const textHeadings = (content.match(/^\s*H[23]:\s+/gim) || []).length;
    const headings = markdownHeadings + htmlHeadings + textHeadings;
    if (headings >= 4) score += 10;
    const lists =
      (/^\s*[-*]\s+/m.test(content) ||
        /^\d+\.\s+/m.test(content) ||
        /<ul\b[^>]*>/.test(content) ||
        /<ol\b[^>]*>/.test(content));
    if (lists) score += 10;
    const paragraphs = textContent.split(/\n\n+/).filter((p) => p.trim().length > 0);
    if (paragraphs.length > 0) {
      const avgLength = paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length;
      if (avgLength <= 100) score += 10;
    }
  }
  if (keywords && keywords.length > 0) score += 10;
  return Math.min(score, 100);
}

function ensureFocusKeywordUsage(content, keyword) {
  if (!content || !keyword) return content;
  let updated = content;
  const kw = keyword.trim();
  if (!kw) return content;

  // Normalize helper
  const hasKw = (text) => text.toLowerCase().includes(kw.toLowerCase());

  // Ensure keyword appears in first paragraph
  updated = updated.replace(/<p>([^<]*)<\/p>/i, (match, p1) => {
    if (hasKw(p1)) return match;
    return `<p>${kw} - ${p1}</p>`;
  });

  // Ensure keyword appears in one H2 lead paragraph
  updated = updated.replace(/(<h2[^>]*>[^<]*<\/h2>\s*<p>)([^<]*)(<\/p>)/i, (match, h2start, pText, pend) => {
    if (hasKw(pText)) return match;
    return `${h2start}${kw} - ${pText}${pend}`;
  });

  // Ensure keyword appears a few times in body
  const occurrences = (updated.toLowerCase().match(new RegExp(kw.toLowerCase(), 'g')) || []).length;
  if (occurrences < 5) {
    updated += `\n<p>${kw} is essential for smooth printing results and should be done carefully.</p>`;
    updated += `\n<p>Always ${kw} following the manufacturer guidelines to protect your printer.</p>`;
    updated += `\n<p>Remember to ${kw} whenever print quality declines.</p>`;
  }
  return updated;
}

async function ensureWordTarget({
  content,
  targetWords,
  provider,
  apiKey,
  model,
  promptTemplates,
  maxTokens = null,
}) {
  let draft = content || '';
  const minWords = Math.max(200, Math.floor(targetWords * 0.96));

  for (let i = 0; i < 2; i += 1) {
    const count = stripHtmlTags(draft).split(/\s+/).filter(Boolean).length;
    if (count >= minWords) {
      return draft;
    }
    const promptTemplate = i === 0 ? promptTemplates.expandPrompt : promptTemplates.padPrompt;
    const expandPrompt = renderTemplate(promptTemplate, {
      draft,
      targetWordCount: targetWords,
    });
    const expandResponse = await chatCompletion({
      provider,
      apiKey,
      model,
      maxTokens,
      messages: [{ role: 'user', content: expandPrompt }],
    });
    draft = expandResponse.text || draft;
  }
  return draft;
}

function getProductsPath() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  return path.join(dataDir, 'products.json');
}

function getImagesDirectory() {
  // Store generated images in a user-visible folder regardless of install location.
  const candidateBases = [];
  try {
    candidateBases.push(app.getPath('pictures'));
  } catch {}
  try {
    candidateBases.push(app.getPath('documents'));
  } catch {}
  try {
    candidateBases.push(app.getPath('home'));
  } catch {}
  candidateBases.push(app.getPath('userData'));

  const folderName = 'Blog Generator Images';
  for (const base of candidateBases) {
    if (!base) continue;
    const dir = path.join(base, folderName);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    } catch {
      // Try next candidate path.
    }
  }

  // Final fallback (should rarely happen).
  const fallbackDir = path.join(process.cwd(), folderName);
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return fallbackDir;
}

function loadProducts() {
  const productsPath = getProductsPath();
  if (!fs.existsSync(productsPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(productsPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.show();
    }
  });

  let reloadAttempts = 0;
  const maxReloadAttempts = 2;

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Renderer] Process gone:', details?.reason || 'unknown');
    if (!mainWindow?.isDestroyed() && reloadAttempts < maxReloadAttempts) {
      reloadAttempts += 1;
      mainWindow.reload();
    }
  });

  mainWindow.on('unresponsive', () => {
    console.warn('[Renderer] Window unresponsive, attempting reload...');
    if (!mainWindow?.isDestroyed() && reloadAttempts < maxReloadAttempts) {
      reloadAttempts += 1;
      mainWindow.reload();
    }
  });
}

app.whenReady().then(async () => {
  try {
    await initDb();
  } catch (error) {
    console.error('Database init failed:', error);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function parseJson(content, label) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${label} response`);
  }
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    role: user.role,
    status: user.status || 'active',
    permissions: user.permissions || [],
  };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
}

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function hasPermission(permission) {
  if (isAdmin()) {
    return true;
  }
  return currentUser && currentUser.permissions && currentUser.permissions.includes(permission);
}

function requirePermission(permission) {
  if (!hasPermission(permission)) {
    throw new Error('Access denied');
  }
}

function requireAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Admin access required');
  }
}

ipcMain.handle('save-api-key', async (event, apiKey) => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    // Store API key in MongoDB (database-only)
    await setSetting({
      userId: currentUser.id,
      key: `api_key_${currentUser.id}`,
      value: apiKey,
    });
    await logActivity({
      userId: currentUser?.id,
      action: 'settings.saveApiKey',
      details: 'Saved OpenAI API key',
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-api-key', async () => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    // Read API key from MongoDB (database-only)
    let apiKey = await getSetting({
      userId: currentUser.id,
      key: `api_key_${currentUser.id}`,
    });
    // Fallback: migrate from electron-store if exists
    if (!apiKey) {
      const legacyKey = store.get(getUserApiKeyKey(currentUser.id), '') || store.get('openai_api_key', '');
      if (legacyKey) {
        // Migrate to database
        await setSetting({
          userId: currentUser.id,
          key: `api_key_${currentUser.id}`,
          value: legacyKey,
        });
        apiKey = legacyKey;
        console.log('[Auth] Migrated API key from local store to database');
      }
    }
    return { success: true, apiKey: apiKey || '' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    console.log('[IPC] save-settings called, currentUser:', currentUser?.id);
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const rawExisting = await getSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
    });
    const existingSettings = rawExisting ? JSON.parse(rawExisting) : {};
    const existingOauthClients = Array.isArray(existingSettings.shopifyOauthClients)
      ? existingSettings.shopifyOauthClients
      : [];
    const incomingOauthClients = Array.isArray(settings?.shopifyOauthClients)
      ? settings.shopifyOauthClients
      : null;
    const normalizedOauthClients = incomingOauthClients
      ? normalizeShopifyOauthClients(incomingOauthClients, existingOauthClients)
      : existingOauthClients;
    const settingsToStore = {
      ...(settings || {}),
      shopifyOauthClients: normalizedOauthClients,
    };

    const settingsJson = JSON.stringify(settingsToStore);
    console.log('[IPC] save-settings payload size:', settingsJson.length, 'publishDestinations count:', settings?.publishDestinations?.length);

    await setSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
      value: settingsJson,
    });

    await logActivity({
      userId: currentUser?.id,
      action: 'settings.save',
      details: 'Saved user settings',
    });
    console.log('[IPC] save-settings completed successfully');
    return { success: true };
  } catch (error) {
    console.error('[IPC] save-settings error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-settings', async () => {
  try {
    console.log('[IPC] get-settings called, currentUser:', currentUser?.id);
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const raw = await getSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
    });
    const parsed = raw ? JSON.parse(raw) : {};
    const oauthClients = Array.isArray(parsed.shopifyOauthClients) ? parsed.shopifyOauthClients : [];
    parsed.shopifyOauthClients = sanitizeShopifyOauthClientsForUi(oauthClients);
    parsed.shopifyOauthRedirectUrl = getShopifyOauthRedirectUrl();
    console.log('[IPC] get-settings loaded, publishDestinations count:', parsed?.publishDestinations?.length);
    return { success: true, settings: parsed };
  } catch (error) {
    console.error('[IPC] get-settings error:', error.message);
    return { success: false, error: error.message };
  }
});

// MongoDB Configuration Handlers (for built executables)
ipcMain.handle('save-mongodb-config', async (event, { uri, dbName }) => {
  try {
    console.log('[IPC] save-mongodb-config called');
    if (!uri || !uri.trim()) {
      throw new Error('MongoDB URI is required');
    }
    if (!dbName || !dbName.trim()) {
      throw new Error('Database name is required');
    }

    // Save to electron-store (persists across restarts and in built .exe)
    store.set('mongodb_uri', uri.trim());
    store.set('mongodb_db_name', dbName.trim());

    console.log('[IPC] MongoDB config saved successfully');
    return { success: true, message: 'MongoDB configuration saved successfully' };
  } catch (error) {
    console.error('[IPC] save-mongodb-config error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-mongodb-config', async () => {
  try {
    console.log('[IPC] get-mongodb-config called');
    const uri = store.get('mongodb_uri') || process.env.MONGODB_URI || '';
    const dbName = store.get('mongodb_db_name') || process.env.MONGODB_DB_NAME || 'aiblog_generator';

    // Return masked URI for security (don't expose password in frontend)
    const maskedUri = uri ? uri.replace(/:([^:@]+)@/, ':****@') : '';

    return {
      success: true,
      config: {
        uri: maskedUri,
        dbName,
        isConfigured: !!uri
      }
    };
  } catch (error) {
    console.error('[IPC] get-mongodb-config error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-mongodb-connection', async (event, { uri, dbName }) => {
  try {
    console.log('[IPC] test-mongodb-connection called');

    // Temporarily save config for testing
    const originalUri = store.get('mongodb_uri');
    const originalDbName = store.get('mongodb_db_name');

    if (uri) store.set('mongodb_uri', uri);
    if (dbName) store.set('mongodb_db_name', dbName);

    try {
      // Try to initialize database with new config
      await initDb();
      console.log('[IPC] MongoDB connection test successful');
      return { success: true, message: 'Connection successful!' };
    } catch (error) {
      // Restore original config if test failed
      if (originalUri) store.set('mongodb_uri', originalUri);
      else store.delete('mongodb_uri');

      if (originalDbName) store.set('mongodb_db_name', originalDbName);
      else store.delete('mongodb_db_name');

      throw error;
    }
  } catch (error) {
    console.error('[IPC] test-mongodb-connection error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-settings', async (event, updates) => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const raw = await getSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
    });
    const existing = raw ? JSON.parse(raw) : {};
    const next = { ...existing, ...(updates || {}) };
    const existingOauthClients = Array.isArray(existing.shopifyOauthClients)
      ? existing.shopifyOauthClients
      : [];
    if (Array.isArray(updates?.shopifyOauthClients)) {
      next.shopifyOauthClients = normalizeShopifyOauthClients(
        updates.shopifyOauthClients,
        existingOauthClients
      );
    }
    await setSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
      value: JSON.stringify(next),
    });
    await logActivity({
      userId: currentUser?.id,
      action: 'settings.update',
      details: 'Updated user settings',
    });
    return { success: true, settings: next };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-api-connection', async (event, { apiKey, provider = 'openai' }) => {
  try {
    requirePermission('settings');
    if (!apiKey) {
      throw new Error('API key required');
    }
    await testConnection({ provider, apiKey });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-provider-models', async (event, { provider = 'openai', apiKey = null } = {}) => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    let resolvedKey = apiKey || null;
    if (!resolvedKey) {
      const raw = await getSetting({
        userId: currentUser.id,
        key: `user_settings_${currentUser.id}`,
      });
      const settings = raw ? JSON.parse(raw) : {};
      const keys = Array.isArray(settings.apiKeys) ? settings.apiKeys : [];
      const providerKeys = keys.filter((item) => (item.provider || 'openai') === provider);
      const active = providerKeys.find((item) => item.isActive) || providerKeys[0];
      resolvedKey = active?.key || null;

      if (!resolvedKey && provider === 'openai') {
        resolvedKey = await getSetting({ userId: currentUser.id, key: `api_key_${currentUser.id}` });
      }
    }

    if (!resolvedKey) {
      throw new Error(`No API key configured for ${provider}`);
    }

    const models = await listProviderModels({ provider, apiKey: resolvedKey });
    return { success: true, models };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-user-api-key', async (event, { userId }) => {
  try {
    requirePermission('manageUsers');
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    // Read from MongoDB
    const apiKey = await getSetting({ userId, key: `api_key_${userId}` });
    return { success: true, apiKey: apiKey || '' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-user-api-key', async (event, { userId, apiKey }) => {
  try {
    requirePermission('manageUsers');
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    // Save to MongoDB
    await setSetting({ userId, key: `api_key_${userId}`, value: apiKey });
    await logActivity({
      userId: currentUser?.id,
      action: 'admin.updateUserSettings',
      details: `Updated API key for "${user.username}"`,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-user-settings', async (event, { userId }) => {
  try {
    requirePermission('manageUsers');
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const raw = await getSetting({
      userId,
      key: `user_settings_${userId}`,
    });
    const parsed = raw ? JSON.parse(raw) : {};
    return { success: true, settings: parsed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-user-settings', async (event, { userId, settings }) => {
  try {
    requirePermission('manageUsers');
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    await setSetting({
      userId,
      key: `user_settings_${userId}`,
      value: JSON.stringify(settings || {}),
    });
    await logActivity({
      userId: currentUser?.id,
      action: 'admin.updateUserSettings',
      details: `Updated settings for "${user.username}"`,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-history', async (event, { userId } = {}) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const targetUserId = isAdmin() ? (userId || null) : currentUser.id;
    const history = await listBlogs({
      limit: 50,
      userId: targetUserId,
      isAdmin: isAdmin(),
    });
    const summary = await getHistorySummary({
      userId: targetUserId,
      isAdmin: isAdmin(),
    });
    // Try to append WordPress status counts for the default destination (best effort)
    let wpCounts = null;
    try {
      const destination = await getPublishDestination(null, currentUser.id);
      if (destination && ['wordpress', 'wordpress-token'].includes(destination.platform)) {
        wpCounts = await fetchWordpressStatusCounts(destination);
      }
    } catch (e) {
      wpCounts = null; // silent; UI can ignore if null
    }

    return { success: true, history, summary, wpCounts };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-blog', async (event, { id }) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const blog = await getBlogById(id, { userId: currentUser.id, isAdmin: isAdmin() });
    if (!blog) {
      return { success: false, error: 'Blog not found' };
    }
    return { success: true, blog };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-blog', async (event, { blog }) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    await updateBlog({ blog, userId: currentUser.id, isAdmin: isAdmin() });
    await logActivity({
      userId: currentUser.id,
      action: 'blog.update',
      details: `Updated blog ${blog.id}`,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-blog', async (event, { id }) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    await deleteBlog({ id, userId: currentUser.id, isAdmin: isAdmin() });
    await logActivity({
      userId: currentUser.id,
      action: 'blog.delete',
      details: `Deleted blog ${id}`,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-blogs', async () => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    await clearBlogs({ userId: currentUser.id, isAdmin: isAdmin() });
    await logActivity({
      userId: currentUser.id,
      action: 'blog.clear',
      details: 'Cleared all blogs',
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-blog', async (event, { blogId, blog, formats }) => {
  console.log('[IPC] export-blog called with:', { blogId, hasBlob: !!blog, formats });

  try {
    requirePermission('export');
    const exportFormats = Array.isArray(formats) ? formats : ['markdown'];
    console.log('[IPC] Export formats:', exportFormats);

    const data = blogId
      ? await getBlogById(blogId, { userId: currentUser?.id, isAdmin: isAdmin() })
      : blog;

    if (!data) {
      throw new Error('Blog not found');
    }
    console.log('[IPC] Blog data ready:', { title: data.title, hasContent: !!data.content });

    const { dialog } = require('electron');
    console.log('[IPC] Showing dialog, mainWindow exists:', !!mainWindow);

    // Ensure the dialog shows on top
    if (mainWindow) {
      mainWindow.focus();
    }

    const dialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getDefaultExportDir(),
      title: 'Select folder to save exported blog',
      buttonLabel: 'Save here',
    };

    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    console.log('[IPC] Dialog result:', result);

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Export cancelled' };
    }

    const exportDir = result.filePaths[0];
    console.log('[IPC] Export directory:', exportDir);

    rememberExportDir(exportDir);

    console.log('[IPC] Calling exportBlog...');
    const files = await exportBlog(data, exportDir, exportFormats);
    console.log('[IPC] Export complete, files:', files);

    await logActivity({
      userId: currentUser?.id,
      action: 'export.single',
      details: `Exported "${data.title}" (${exportFormats.join(', ')})`,
    });

    return { success: true, files };
  } catch (error) {
    console.error('[IPC] export-blog error:', error);
    return { success: false, error: error.message || 'Export failed' };
  }
});

ipcMain.handle('publish-blog', async (event, { destination, blog, status = 'draft' }) => {
  try {
    requirePermission('export');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    if (!destination || typeof destination !== 'object') {
      throw new Error('Publish destination is required');
    }
    if (!blog) {
      throw new Error('Blog content is required');
    }

    const platform = ensureValue('Platform', destination.platform);
    const publishStatus = status || 'draft';
    const title = blog.title || 'Untitled';
    let content = blog.content || '';
    const metaDescription = blog.metaDescription || '';
    let imageUrl = blog.imageUrl || null;
    let localImagePath = blog.localImagePath || blog.local_image_path || null;
    const keywords = Array.isArray(blog.keywords)
      ? blog.keywords
      : String(blog.keywords || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
    const categories =
      Array.isArray(blog.categories) && blog.categories.length
        ? blog.categories
        : String(blog.categories || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

    let result = null;
    let imageStorageUsed = false;

    try {
      const rawSettings = await getSetting({
        userId: currentUser.id,
        key: `user_settings_${currentUser.id}`,
      });
      const userSettings = rawSettings ? JSON.parse(rawSettings) : {};
      if (userSettings.imageStorage?.enabled && (imageUrl || localImagePath)) {
        const uploadedUrl = await uploadImageToStorage({
          blog,
          imageUrl,
          localImagePath,
          storage: userSettings.imageStorage,
          filenameBase: blog?.title || title,
        });
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
          localImagePath = null;
          imageStorageUsed = true;
          console.log('[Publish] Image uploaded to external storage:', uploadedUrl);
        }
      }
    } catch (err) {
      console.warn('[Publish] External image storage failed:', err.message);
    }

    // Helper function to insert image into content
    const insertImageIntoContent = (imgSrc, imgAlt, htmlContent) => {
      if (!imgSrc) return htmlContent;
      const imageHtml = `<figure class="wp-block-image alignwide"><img src="${imgSrc}" alt="${imgAlt}" class="blog-featured-image" style="width:100%;height:auto;border-radius:8px;margin-bottom:1.5em;" /></figure>\n\n`;

      // Check if content starts with an H1 tag - insert image after it
      const h1Match = htmlContent.match(/^(\s*<h1[^>]*>.*?<\/h1>\s*)/i);
      if (h1Match) {
        return h1Match[1] + imageHtml + htmlContent.slice(h1Match[0].length);
      }
      // Otherwise insert at the beginning
      return imageHtml + htmlContent;
    };

    const stripLeadingTitleFromContent = (htmlContent, pageTitle) => {
      if (!htmlContent || !pageTitle) return htmlContent;
      const normalizeText = (value) =>
        String(value || '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&quot;/gi, '"')
          .replace(/&#39;|&apos;/gi, "'")
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      const normalizedTitle = normalizeText(pageTitle);
      if (!normalizedTitle) return htmlContent;

      const h1Match = htmlContent.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>\s*/i);
      if (h1Match) {
        const h1Text = normalizeText(h1Match[1]);
        if (h1Text === normalizedTitle) {
          return htmlContent.slice(h1Match[0].length);
        }
      }

      const mdMatch = htmlContent.match(/^\s*#\s+(.+?)(\r?\n)+/);
      if (mdMatch) {
        const mdText = normalizeText(mdMatch[1]);
        if (mdText === normalizedTitle) {
          return htmlContent.slice(mdMatch[0].length);
        }
      }

      const setextMatch = htmlContent.match(/^\s*(.+?)\s*\r?\n=+\s*\r?\n/);
      if (setextMatch) {
        const setextText = normalizeText(setextMatch[1]);
        if (setextText === normalizedTitle) {
          return htmlContent.slice(setextMatch[0].length);
        }
      }

      return htmlContent;
    };

    const normalizeShopifyTags = (items) => {
      const raw = (items || []).flatMap((item) =>
        String(item || '').split(/[,;\n]+/)
      );
      const cleaned = raw
        .map((tag) =>
          tag
            .replace(/[^a-zA-Z0-9 _-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        )
        .filter(Boolean)
        .map((tag) => (tag.length > 255 ? tag.slice(0, 255) : tag));
      return Array.from(new Set(cleaned));
    };

    // Helper: fetch remote image and return base64 data + filename
    const fetchImageAsBase64 = async (url) => {
      if (!url) return { data: null, filename: null };
      try {
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
        const contentType = resp.headers['content-type'] || 'image/jpeg';
        const base64 = Buffer.from(resp.data).toString('base64');
        const basename = path.basename(new URL(url).pathname) || 'image.jpg';
        const hasExt = /\.[a-zA-Z0-9]{3,4}$/.test(basename);
        const filename = hasExt ? basename : `${basename || 'image'}.jpg`;
        return { data: `data:${contentType};base64,${base64}`, filename };
      } catch (err) {
        console.warn('[Publish] Failed to fetch image for base64 payload:', err.message);
        return { data: null, filename: null };
      }
    };

    if (platform === 'wordpress' || platform === 'wordpress-token') {
      // Pull latest stored image paths if current payload is missing them.
      if ((!imageUrl || !localImagePath) && blog?.id) {
        try {
          const latest = await getBlogById(blog.id, { userId: currentUser.id, isAdmin: isAdmin() });
          if (latest) {
            imageUrl = imageUrl || latest.image_url || latest.imageUrl || null;
            localImagePath =
              localImagePath || latest.local_image_path || latest.localImagePath || null;
          }
        } catch (err) {
          console.warn('[Publish] Failed to load latest blog image from DB:', err.message);
        }
      }

      const baseUrl = requireHttps(normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl)));
      const endpoint = `${baseUrl}/wp-json/aiblog/v1/post`;

      // Determine auth header - supports both Token and Basic Auth
      const apiToken = (destination.apiToken || destination.token || destination.authToken || '').trim();
      const username = destination.username?.trim();
      const appPassword = destination.appPassword?.trim();

      let authHeader;
      if (apiToken) {
        authHeader = `Bearer ${apiToken}`;
      } else if (username && appPassword) {
        authHeader = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
      } else {
        throw new Error('Provide either an API token (from AI Blog Token plugin) or username + application password');
      }

      // Prepare image payload once so we can use it for both /upload and /post fallback.
      let imageAsset = null;
      if (imageUrl || localImagePath) {
        try {
          imageAsset = await loadImageBuffer({ imageUrl, localImagePath });
        } catch (err) {
          console.warn('[Publish] Failed to load image asset:', err.message);
        }
      }

      // Upload image to WordPress media (via plugin endpoint) so it's in Media Library
      let mediaUrl = imageUrl;
      const imageAltText = title || keywords?.[0] || '';
      if (imageAsset) {
        try {
          const uploaded = await uploadImageViaPlugin({
            baseUrl,
            authHeader,
            buffer: imageAsset.buffer,
            filename: imageAsset.filename,
            mimeType: imageAsset.mimeType,
            altText: imageAltText,
          });
          mediaUrl = uploaded.fullUrl || uploaded.url || mediaUrl;
          console.log('[Publish] Image uploaded to WordPress media library:', mediaUrl);
        } catch (err) {
          console.warn('[Publish] Image upload failed, will send inline image data to /post:', err.message);
        }
      }

      // WordPress already renders the title + featured image, so avoid duplicating in body content.
      let contentWithImage = stripLeadingTitleFromContent(content, title);

      // Build payload - plugin handles everything (image download, SEO, categories, etc.)
      const postPayload = {
        title,
        content: contentWithImage,
        excerpt: metaDescription,
        status: publishStatus,
        keywords,
        categories,
        metaDescription,
        focusKeyword: keywords[0] || '',
      };

      // Include featured image URL for plugin to process (it will set featured image)
      if (mediaUrl) {
        postPayload.featuredImage = mediaUrl;
        console.log('[Publish] Including media library URL as featured image');
      }
      if (imageAltText) {
        postPayload.featuredImageAlt = imageAltText;
      }

      // Fallback for servers that cannot download remote URLs:
      // send the image binary directly so WordPress can save it to Media Library.
      if (imageAsset) {
        postPayload.featuredImageData = `data:${imageAsset.mimeType};base64,${imageAsset.buffer.toString('base64')}`;
        postPayload.featuredImageName = imageAsset.filename || 'featured-image.jpg';
      }

      console.log('[Publish] Posting to WordPress plugin endpoint:', endpoint, 'status:', publishStatus);
      const response = await axios.post(
        endpoint,
        postPayload,
        {
          timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
          headers: {
            ...PUBLISH_AXIOS_DEFAULTS.headers,
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        }
      );
      result = response.data || null;
    } else if (platform === 'shopify') {
      const shopDomain = ensureValue('Shopify shop domain', destination.shopDomain);
      const accessToken = ensureValue('Shopify access token', destination.accessToken);
      const blogId = ensureValue('Shopify blog ID', destination.blogId);
      const apiVersion = (destination.apiVersion || '2024-01').trim();
      const blogHandle =
        destination.blogHandle ||
        (await fetchShopifyBlogHandle({ shopDomain, accessToken, apiVersion, blogId }));

      let mediaUrl = isPublicHttpUrl(imageUrl) ? imageUrl : null;
      if (!imageStorageUsed && (imageUrl || localImagePath)) {
        try {
          const img = await loadImageBuffer({ imageUrl, localImagePath });
          const base64 = img.buffer.toString('base64');
          const fileResponse = await axios.post(
            `https://${shopDomain}/admin/api/${apiVersion}/files.json`,
            {
              file: {
                attachment: base64,
                filename: img.filename || 'blog-image.jpg',
                mime_type: img.mimeType || 'image/jpeg',
              },
            },
            {
              timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
              headers: {
                ...PUBLISH_AXIOS_DEFAULTS.headers,
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          );
          mediaUrl = fileResponse.data?.file?.url || mediaUrl;
          console.log('[Publish] Shopify file uploaded:', mediaUrl);
        } catch (err) {
          const details = err?.response?.data || err.message;
          console.warn('[Publish] Shopify file upload failed, using original URL:', details);
        }
      }

      // Shopify already displays the title + featured image, so avoid duplicating them in body_html.
      let contentWithImage = stripLeadingTitleFromContent(content, title);

      const articlePayload = {
        title,
        body_html: contentWithImage,
        summary_html: metaDescription,
        tags: normalizeShopifyTags([...keywords, ...categories]).join(', '),
        published: publishStatus === 'publish',
      };

      // Add featured image for Shopify (separate from content image)
      if (mediaUrl) {
        articlePayload.image = {
          src: mediaUrl,
          alt: title || '',
        };
        console.log('[Publish] Including featured image for Shopify article');
      }

        const response = await axios.post(
          `https://${shopDomain}/admin/api/${apiVersion}/blogs/${blogId}/articles.json`,
          { article: articlePayload },
          {
            timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
            headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          }
        );
        const articleHandle = response.data?.article?.handle || '';
        const articleUrl =
          response.data?.article?.url ||
          buildShopifyArticleUrl({ shopDomain, blogHandle, articleHandle });
        result = { id: response.data?.article?.id, url: articleUrl };
      } else if (platform === 'custom' || platform === 'jtl') {
      const endpointUrl = requireHttps(ensureValue('Endpoint URL', destination.endpointUrl));
      const reqHeaders = { ...PUBLISH_AXIOS_DEFAULTS.headers, 'Content-Type': 'application/json' };
      if (destination.authHeaderName && destination.authHeaderValue) {
        reqHeaders[destination.authHeaderName] = destination.authHeaderValue;
      }
      let extraPayload = {};
      if (destination.extraPayloadJson) {
        const parsed = JSON.parse(destination.extraPayloadJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Extra payload must be a JSON object');
        }
        extraPayload = parsed;
      }

      // Insert image into content body for custom/JTL
      let contentWithImage = content;
      if (imageUrl) {
        contentWithImage = insertImageIntoContent(imageUrl, title, content);
        console.log('[Publish] Image inserted into blog content for custom/JTL');
      }

      const response = await axios.post(
        endpointUrl,
        {
          title,
          content: contentWithImage,
          metaDescription,
          status: publishStatus,
          keywords,
          categories,
          featuredImage: imageUrl,
          source: 'aibloggenerator',
          ...extraPayload,
        },
        { headers: reqHeaders, timeout: PUBLISH_AXIOS_DEFAULTS.timeout }
      );
      result = response.data || null;
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Record publish history
    await addPublishHistory({
      blogId: blog.id || null,
      remotePostId: result?.id || null,
      destinationId: destination.id || null,
      destinationName: destination.name || platform,
      platform,
      status: publishStatus,
      publishedUrl: result?.url || result?.link || null,
      userId: currentUser?.id,
    });

    await logActivity({
      userId: currentUser?.id,
      action: publishStatus === 'publish' ? 'publish.live' : 'publish.draft',
      details: { platform, destination: destination.name || '', status: publishStatus },
    });

    return { success: true, result };
  } catch (error) {
    console.error('[Publish] Error:', error?.response?.status, error?.response?.data || error.message);
    const message = extractPublishError(error);
    return { success: false, error: message };
  }
});

ipcMain.handle('test-publish-destination', async (event, { destination }) => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    if (!destination || typeof destination !== 'object') {
      throw new Error('Destination is required');
    }

    const platform = ensureValue('Platform', destination.platform);
    let result = null;

    if (platform === 'wordpress' || platform === 'wordpress-token') {
      const baseUrl = normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl));
      const endpoint = `${baseUrl}/wp-json/aiblog/v1/ping`;

      // Determine auth header
      const apiToken = (destination.apiToken || destination.token || destination.authToken || '').trim();
      const username = destination.username?.trim();
      const appPassword = destination.appPassword?.trim();

      let authHeader;
      if (apiToken) {
        authHeader = `Bearer ${apiToken}`;
      } else if (username && appPassword) {
        authHeader = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
      } else {
        throw new Error('Provide either an API token or username + application password');
      }

      console.log('[Test] Testing WordPress plugin connection to:', endpoint);
      console.log('[Test] Auth method:', apiToken ? 'Bearer Token' : 'Basic Auth');

      const response = await axios.get(endpoint, {
        timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
        headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
      });
      result = response.data || { success: true };
    } else if (platform === 'shopify') {
      const shopDomain = ensureValue('Shopify shop domain', destination.shopDomain);
      const accessToken = ensureValue('Shopify access token', destination.accessToken);
      const apiVersion = (destination.apiVersion || '2024-01').trim();
      const response = await axios.get(`https://${shopDomain}/admin/api/${apiVersion}/shop.json`, {
        timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
        headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': accessToken },
      });
      result = { name: response.data?.shop?.name };
    } else if (platform === 'custom' || platform === 'jtl') {
      const endpointUrl = ensureValue('Endpoint URL', destination.endpointUrl);
      const reqHeaders = { ...PUBLISH_AXIOS_DEFAULTS.headers };
      if (destination.authHeaderName && destination.authHeaderValue) {
        reqHeaders[destination.authHeaderName] = destination.authHeaderValue;
      }
      const response = await axios.post(
        endpointUrl,
        { ping: true, source: 'aibloggenerator' },
        { headers: reqHeaders, timeout: PUBLISH_AXIOS_DEFAULTS.timeout }
      );
      result = response.data || { success: true };
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log('[Test] Connection successful:', result);
    return { success: true, result };
  } catch (error) {
    console.error('[Test] Connection failed:', error?.response?.status, error?.response?.data || error.message);
    const message = extractPublishError(error);
    return { success: false, error: message };
  }
});

ipcMain.handle('list-shopify-blogs', async (event, { shopDomain, accessToken, apiVersion } = {}) => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const domain = ensureValue('Shopify shop domain', shopDomain);
    const token = ensureValue('Shopify access token', accessToken);
    const version = (apiVersion || '2024-01').trim();

    const response = await axios.get(
      `https://${domain}/admin/api/${version}/blogs.json`,
      {
        timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
        headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': token },
      }
    );
    const blogs = Array.isArray(response.data?.blogs) ? response.data.blogs : [];
    return { success: true, blogs };
  } catch (error) {
    console.error('[Shopify] list-blogs error:', error?.response?.status, error?.response?.data || error.message);
    return { success: false, error: extractPublishError(error) };
  }
});

ipcMain.handle('export-bulk', async (event, { blogIds, format }) => {
  try {
    requirePermission('bulkExport');
    const ids = Array.isArray(blogIds) ? blogIds : [];
    if (!ids.length) {
      throw new Error('No blogs selected');
    }

    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getDefaultExportDir(),
      title: 'Select folder to save exported blogs',
      buttonLabel: 'Save here',
    });

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Export cancelled' };
    }

    const exportDir = result.filePaths[0];
    rememberExportDir(exportDir);
    const blogs = await getBlogsByIds(ids, { userId: currentUser?.id, isAdmin: isAdmin() });
    const files = [];

    for (const item of blogs) {
      const exported = await exportBlog(item, exportDir, [format]);
      files.push(...exported);
    }

    await logActivity({
      userId: currentUser?.id,
      action: 'export.bulk',
      details: `Bulk exported ${blogs.length} blogs as ${format}`,
    });
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

let activeShopifyOAuth = null;

ipcMain.handle('start-shopify-oauth', async (event, { shopDomain, apiVersion, oauthClientId } = {}) => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    if (activeShopifyOAuth) {
      throw new Error('Shopify OAuth is already in progress');
    }

    const settings = await getUserSettings(currentUser.id);
    const oauthClients = Array.isArray(settings.shopifyOauthClients) ? settings.shopifyOauthClients : [];
    let selectedClient = null;
    if (oauthClientId) {
      selectedClient = oauthClients.find((client) => client.id === oauthClientId) || null;
      if (!selectedClient) {
        throw new Error('Selected Shopify OAuth app was not found.');
      }
    } else if (oauthClients.length === 1) {
      selectedClient = oauthClients[0];
    }

    const clientId = ensureValue(
      'Shopify client ID',
      selectedClient?.clientId || process.env.SHOPIFY_CLIENT_ID
    );
    const clientSecret = ensureValue(
      'Shopify client secret',
      (selectedClient?.clientSecretEnc ? decryptSecret(selectedClient.clientSecretEnc) : '') ||
        process.env.SHOPIFY_CLIENT_SECRET
    );
    const shop = normalizeShopDomain(ensureValue('Shopify shop domain', shopDomain));
    const version = (apiVersion || '2024-01').trim();
    const port = Number(process.env.SHOPIFY_OAUTH_PORT || 4319);
    const redirectUri = getShopifyOauthRedirectUrl();
    const scope = 'read_content,write_content,write_files';
    const state = crypto.randomBytes(16).toString('hex');

    activeShopifyOAuth = new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const requestUrl = new URL(req.url, `http://localhost:${port}`);
          if (requestUrl.pathname !== '/shopify/callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }

          const params = Object.fromEntries(requestUrl.searchParams.entries());
          const code = params.code;
          const returnedShop = normalizeShopDomain(params.shop);
          const returnedState = params.state;

          if (!code || !returnedShop) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing shop or code.');
            return;
          }
          if (returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid state.');
            return;
          }
          if (returnedShop !== shop) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Shop mismatch.');
            return;
          }
          if (!verifyShopifyHmac(params, clientSecret)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('HMAC verification failed.');
            return;
          }

          const tokenResponse = await axios.post(
            `https://${returnedShop}/admin/oauth/access_token`,
            {
              client_id: clientId,
              client_secret: clientSecret,
              code,
            },
            { timeout: PUBLISH_AXIOS_DEFAULTS.timeout }
          );

          const accessToken = tokenResponse.data?.access_token;
          if (!accessToken) {
            throw new Error('No access token returned from Shopify.');
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<p>Shopify connected. You can close this window.</p>');
          resolve({
            success: true,
            shopDomain: returnedShop,
            accessToken,
            apiVersion: version,
            scope: tokenResponse.data?.scope,
          });
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('OAuth failed. Check the app logs.');
          reject(err);
        } finally {
          server.close();
        }
      });

      server.on('error', reject);
      server.listen(port, '127.0.0.1', () => {
        const authUrl =
          `https://${shop}/admin/oauth/authorize` +
          `?client_id=${encodeURIComponent(clientId)}` +
          `&scope=${encodeURIComponent(scope)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&state=${encodeURIComponent(state)}`;
        shell.openExternal(authUrl);
      });
    });

    const result = await activeShopifyOAuth;
    return result;
  } catch (error) {
    return { success: false, error: error.message || 'Shopify OAuth failed' };
  } finally {
    activeShopifyOAuth = null;
  }
});

ipcMain.handle('export-history-csv', async (event, { rows }) => {
  try {
    requirePermission('bulkExport');
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getDefaultExportDir(),
      title: 'Select folder to save history CSV',
      buttonLabel: 'Save here',
    });

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Export cancelled' };
    }

    const exportDir = result.filePaths[0];
    rememberExportDir(exportDir);
    const filePath = exportHistoryCsv(rows || [], exportDir);
    await logActivity({
      userId: currentUser?.id,
      action: 'export.historyCsv',
      details: `Exported history CSV (${(rows || []).length} rows)`,
    });
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-image', async (event, { url, title }) => {
  try {
    requirePermission('export');
    if (!url) {
      throw new Error('Image URL required');
    }
    const imagesDir = getImagesDirectory();
    const safeTitle = (title || 'image').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'image';
    const filename = `${safeTitle.replace(/\s+/g, '-')}-${Date.now()}.png`;
    const filePath = path.join(imagesDir, filename);
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    fs.writeFileSync(filePath, response.data);
    await logActivity({
      userId: currentUser?.id,
      action: 'image.download',
      details: `Downloaded image for "${safeTitle}"`,
    });
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('upload-image-storage', async (event, { blogId = null, title = '', imageUrl = '', localImagePath = '' } = {}) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const rawSettings = await getSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
    });
    const userSettings = rawSettings ? JSON.parse(rawSettings) : {};
    if (!userSettings.imageStorage?.enabled) {
      return { success: false, skipped: true, error: 'Image storage not enabled' };
    }

    let blog = null;
    if (blogId) {
      blog = await getBlogById(blogId, { userId: currentUser.id, isAdmin: isAdmin() });
    }
      const uploadedUrl = await uploadImageToStorage({
        blog: blog || { id: blogId, title },
        imageUrl,
        localImagePath,
        storage: userSettings.imageStorage,
        filenameBase: title || blog?.title || 'blog-image',
      });
    if (!uploadedUrl) {
      throw new Error('Image storage did not return a URL.');
    }

    if (blogId && blog) {
      const updated = {
        ...blog,
        imageUrl: uploadedUrl,
        localImagePath: '',
      };
      await updateBlog({ blog: updated, userId: currentUser.id, isAdmin: isAdmin() });
    }

    return { success: true, url: uploadedUrl };
  } catch (error) {
    return { success: false, error: error.message || 'Image storage upload failed' };
  }
});

ipcMain.handle('test-image-storage', async (event, { imageStorage } = {}) => {
  try {
    requirePermission('settings');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const storage = imageStorage || {};
    if (!storage.enabled) {
      throw new Error('Image storage not enabled');
    }

    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

      const url = await uploadImageToStorage({
        blog: { title: 'storage-test' },
        imageUrl: tinyPng,
        localImagePath: '',
        storage,
        filenameBase: 'storage-test',
      });

    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message || 'Image storage test failed' };
  }
});

ipcMain.handle('generate-blog-image', async (event, { blogId, title, content }) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const userSettingsRaw = await getSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
    });
    const storedSettings = userSettingsRaw ? JSON.parse(userSettingsRaw) : {};
    const mergedSettings = {
      aiProvider: 'openai',
      imageProvider: 'openai',
      imageModel: 'gpt-image-1',
      ...storedSettings,
    };

    const getProviderApiKey = async (providerId) => {
      let key = null;
      if (mergedSettings.apiKeys && Array.isArray(mergedSettings.apiKeys)) {
        const providerKeys = mergedSettings.apiKeys.filter(
          (item) => (item.provider || 'openai') === providerId
        );
        const active = providerKeys.find((item) => item.isActive) || providerKeys[0];
        if (active?.key) {
          key = active.key;
        }
      }
      // Fallback: read from database
      if (!key && providerId === 'openai') {
        key = await getSetting({ userId: currentUser.id, key: `api_key_${currentUser.id}` });
      }
      return key;
    };

    const provider = mergedSettings.imageProvider || mergedSettings.aiProvider || 'openai';
    const providerInfo = getProvider(provider);
    if (!providerInfo?.supportsImages) {
      throw new Error(`Selected provider "${provider}" does not support image generation`);
    }
    const apiKey = await getProviderApiKey(provider);
    if (!apiKey) {
      throw new Error(`API key not configured for selected provider "${provider}"`);
    }

    const promptTemplates = getPromptTemplates(mergedSettings);
    const topic = title || (content || '').slice(0, 120) || 'Blog featured image';
    const imagePrompt = buildImagePrompt({ title: topic, content, template: promptTemplates.imagePrompt });
    const selectedImageModel =
      mergedSettings.imageModel || IMAGE_DEFAULT_MODEL[provider] || IMAGE_DEFAULT_MODEL.openai;
    const imageResult = await generateImage({
      provider,
      apiKey,
      model: selectedImageModel,
      prompt: imagePrompt,
    });
    if (!imageResult.imageUrl) {
      throw new Error(`Image generation failed for provider "${provider}"`);
    }

    const imageStorageEnabled = Boolean(storedSettings.imageStorage?.enabled);
    const imagesDir = getImagesDirectory();
    const safeTitle = (topic || 'image').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'image';
    const filename = `${safeTitle.replace(/\s+/g, '-')}-${Date.now()}.png`;
    const filePath = path.join(imagesDir, filename);
    let savedLocalPath = '';
    if (!imageStorageEnabled) {
      try {
        if (imageResult.imageUrl.startsWith('data:')) {
          const base64 = imageResult.imageUrl.split(',')[1] || '';
          if (base64) {
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            savedLocalPath = filePath;
          }
        } else {
          const resp = await axios.get(imageResult.imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
          fs.writeFileSync(filePath, resp.data);
          savedLocalPath = filePath;
        }
      } catch (err) {
        console.warn('[Image] Failed to save locally:', err.message);
      }
    }

    let updatedBlog = null;
    let finalImageUrl = imageResult.imageUrl;
    let finalLocalPath = savedLocalPath;

      try {
        if (imageStorageEnabled) {
          const uploadedUrl = await uploadImageToStorage({
            blog: blogId ? { id: blogId, title: title || topic } : { title: title || topic },
            imageUrl: imageResult.imageUrl,
            localImagePath: savedLocalPath,
            storage: storedSettings.imageStorage,
            filenameBase: title || topic,
          });
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
          finalLocalPath = '';
          console.log('[Image] Uploaded to external storage:', uploadedUrl);
        }
      }
    } catch (err) {
      console.warn('[Image] External storage upload failed:', err.message);
    }
    if (blogId) {
      const existing = await getBlogById(blogId, { userId: currentUser.id, isAdmin: isAdmin() });
      if (existing) {
        const existingGallery = normalizeImageGallery(
          existing.imageGallery || existing.image_gallery,
          existing.imageUrl || existing.image_url
        );
        const nextGallery = appendImageToGallery(existingGallery, finalImageUrl);
        updatedBlog = {
          ...existing,
          imageUrl: finalImageUrl,
          imageGallery: nextGallery,
          localImagePath: finalLocalPath || existing.local_image_path || existing.localImagePath || '',
          cost: (existing.cost || 0) + (imageResult.cost || 0),
        };
        await updateBlog({ blog: updatedBlog, userId: currentUser.id, isAdmin: isAdmin() });
      }
    }

    await updateApiUsage({
      userId: currentUser.id,
      cost: imageResult.cost || 0,
      tokens: 0,
    });

    await addLog({
      level: 'info',
      category: 'image',
      message: `Generated blog image${title ? ` for "${title}"` : ''}`,
      details: { cost: imageResult.cost || 0 },
      userId: currentUser.id,
    });

    return {
      success: true,
      imageUrl: finalImageUrl,
      localPath: finalLocalPath,
      imageGallery: updatedBlog?.imageGallery || updatedBlog?.image_gallery || null,
      blog: updatedBlog,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-wordpress-categories', async (event, { destinationId = null } = {}) => {
  try {
    requirePermission('export');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination || !['wordpress', 'wordpress-token'].includes(destination.platform)) {
      throw new Error('Select a WordPress destination to load categories');
    }
    const categories = await fetchWordpressCategories(destination);
    return { success: true, categories };
  } catch (error) {
    return { success: false, error: extractPublishError(error) };
  }
});

ipcMain.handle('create-wordpress-category', async (event, { destinationId = null, name }) => {
  try {
    requirePermission('export');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const cleaned = (name || '').trim();
    if (!cleaned) {
      throw new Error('Category name is required');
    }
    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination || !['wordpress', 'wordpress-token'].includes(destination.platform)) {
      throw new Error('Select a WordPress destination to create categories');
    }
    const created = await createWordpressCategoryRemote(destination, cleaned);
    const categories = await fetchWordpressCategories(destination);
    return { success: true, category: created, categories };
  } catch (error) {
    return { success: false, error: extractPublishError(error) };
  }
});

ipcMain.handle('get-wordpress-stats', async (event, { destinationId = null } = {}) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination || !['wordpress', 'wordpress-token'].includes(destination.platform)) {
      throw new Error('Select a WordPress destination to load stats');
    }
    const counts = await fetchWordpressStatusCounts(destination);
    return { success: true, counts };
  } catch (error) {
    return { success: false, error: extractPublishError(error) || error.message };
  }
});

ipcMain.handle(
  'generate-blog',
  async (event, { topic, keywords, categories = [], settings, resumeState = null }) => {
  let checkpoint = null;
  try {
    requirePermission('generate');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const userSettingsRaw = await getSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
    });
    const storedSettings = userSettingsRaw ? JSON.parse(userSettingsRaw) : {};
    const mergedSettings = {
      aiProvider: 'openai',
      imageProvider: 'openai',
      aiModel: 'gpt-4o',
      imageModel: 'gpt-image-1',
      maxTokens: null,
      serpProvider: 'openai',
      deepResearchProvider: 'openai',
      deepResearchModel: 'gpt-4o-mini',
      autoSave: true,
      ...storedSettings,
      ...(settings || {}),
    };

    const getProviderApiKey = async (providerId) => {
      let key = null;
      if (mergedSettings.apiKeys && Array.isArray(mergedSettings.apiKeys)) {
        const providerKeys = mergedSettings.apiKeys.filter(
          (item) => (item.provider || 'openai') === providerId
        );
        const active = providerKeys.find((item) => item.isActive) || providerKeys[0];
        if (active?.key) {
          key = active.key;
        }
      }
      // Fallback: read from database
      if (!key && providerId === 'openai') {
        key = await getSetting({ userId: currentUser.id, key: `api_key_${currentUser.id}` });
      }
      return key;
    };

    const provider = mergedSettings.aiProvider || 'openai';
    const apiKey = await getProviderApiKey(provider);
    if (!apiKey) {
      throw new Error('API key not configured for selected provider');
    }

    await addLog({
      level: 'info',
      category: 'generation',
      message: `Starting generation for "${topic}"`,
      details: { keywords, settings },
      userId: currentUser.id,
    });

    const chatModel = mergedSettings.aiModel || 'gpt-4o';
    const maxTokens = normalizeMaxTokens(mergedSettings.maxTokens);
    const promptTemplates = getPromptTemplates(mergedSettings);

    const sendProgress = (step, message) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('generation-progress', { step, message });
      }
    };

    const language = mergedSettings.language || 'English';
    const canResume =
      resumeState &&
      resumeState.topic === topic &&
      JSON.stringify(resumeState.keywords || '') === JSON.stringify(keywords || '') &&
      resumeState.language === language;
    checkpoint = canResume
      ? {
          ...resumeState,
          responses: resumeState.responses || {},
        }
      : {
          topic,
          keywords,
          language,
          completedStep: -1,
          responses: {},
        };
    const markCheckpoint = (step, patch = {}) => {
      Object.assign(checkpoint, patch);
      checkpoint.completedStep = Math.max(checkpoint.completedStep || -1, step);
    };
    const focusKeyword =
      mergedSettings.focusKeyword ||
      (Array.isArray(keywords) ? keywords[0] : keywords) ||
      topic ||
      '';
    const siteBaseUrl = mergedSettings.siteBaseUrl || '';

    let seoResponse = checkpoint.responses.seoResponse || null;
    let seoData = checkpoint.seoData || null;
    if (!seoData) {
      sendProgress(0, 'Researching topic...');
      const seoPrompt = renderTemplate(promptTemplates.seoResearchPrompt, {
        topic,
        keywords: keywords || '',
        focusKeyword,
        language,
      });
      seoResponse = await chatCompletion({
        provider,
        apiKey,
        model: chatModel,
        maxTokens,
        messages: [{ role: 'user', content: seoPrompt }],
      });
      seoData = normalizeSeoData(parseJsonContent(seoResponse.text));
      markCheckpoint(0, {
        seoData,
        responses: {
          ...checkpoint.responses,
          seoResponse: { usage: seoResponse?.usage || {} },
        },
      });
    } else {
      sendProgress(0, 'Resuming from saved topic research...');
    }

    let researchSynthesisResponse = checkpoint.responses.researchSynthesisResponse || null;
    let researchContextText = checkpoint.researchContextText || '';
    if (!researchContextText) {
      sendProgress(1, 'Gathering sources...');
      const researchContextParts = [];
    const serpProvider = mergedSettings.serpProvider || 'openai';
    const serpModel = mergedSettings.serpModel || 'gpt-4o-mini';
    const deepResearchProvider = mergedSettings.deepResearchProvider || 'openai';
    const deepResearchModel = mergedSettings.deepResearchModel || 'gpt-4o-mini';

    if (serpProvider === 'openai') {
      const openaiKey = await getProviderApiKey('openai');
      if (openaiKey) {
        try {
          const openaiResult = await openaiWebSearch({
            apiKey: openaiKey,
            query: `${topic} ${keywords || ''}`.trim(),
            model: serpModel,
          });
          if (openaiResult.answer) {
            researchContextParts.push(`OpenAI web search summary:\n${openaiResult.answer}`);
          }
          if (openaiResult.results.length > 0) {
            const sources = openaiResult.results
              .map((item) => `- ${item.title} (${item.url})`)
              .join('\n');
            researchContextParts.push(`OpenAI web sources:\n${sources}`);
          }
        } catch (error) {
          await addLog({
            level: 'warn',
            category: 'generation',
            message: 'OpenAI web research failed',
            details: { error: error.message },
            userId: currentUser.id,
          });
        }
      }
    }

    if (serpProvider === 'tavily') {
      const tavilyKey = await getProviderApiKey('tavily');
      if (tavilyKey) {
        try {
          const tavilyResult = await tavilySearch({
            apiKey: tavilyKey,
            query: `${topic} ${keywords || ''}`.trim(),
          });
          if (tavilyResult.answer) {
            researchContextParts.push(`Tavily summary:\n${tavilyResult.answer}`);
          }
          if (tavilyResult.results.length > 0) {
            const sources = tavilyResult.results
              .map((item) => `- ${item.title} (${item.url})`)
              .join('\n');
            researchContextParts.push(`Tavily sources:\n${sources}`);
          }
        } catch (error) {
          await addLog({
            level: 'warn',
            category: 'generation',
            message: 'Tavily research failed',
            details: { error: error.message },
            userId: currentUser.id,
          });
        }
      }
    }

    if (mergedSettings.useWikipedia !== false) {
      try {
        const wiki = await wikipediaSummary(topic);
        if (wiki?.extract) {
          const wikiLine = wiki.url ? `${wiki.extract} (${wiki.url})` : wiki.extract;
          researchContextParts.push(`Wikipedia:\n${wikiLine}`);
        }
      } catch (error) {
        // Best-effort Wikipedia enrichment.
      }
    }

      let researchSynthesis = '';
      const researchContext = researchContextParts.join('\n\n');
      if (deepResearchProvider && deepResearchProvider !== 'none') {
        const deepKey = await getProviderApiKey(deepResearchProvider);
        if (deepKey) {
          try {
            const synthesisPrompt = renderTemplate(promptTemplates.researchSynthesisPrompt, {
              topic,
              language,
              researchContext: researchContext || 'No external sources available.',
            });
            researchSynthesisResponse = await chatCompletion({
              provider: deepResearchProvider,
              apiKey: deepKey,
              model: deepResearchModel,
              maxTokens,
              messages: [{ role: 'user', content: synthesisPrompt }],
            });
            researchSynthesis = researchSynthesisResponse.text || '';
          } catch (error) {
            await addLog({
              level: 'warn',
              category: 'generation',
              message: 'Deep research failed',
              details: { error: error.message },
              userId: currentUser.id,
            });
          }
        }
      }

      researchContextText = [
        researchContext ? `Research context:\n${researchContext}` : '',
        researchSynthesis ? `Research synthesis:\n${researchSynthesis}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      markCheckpoint(1, {
        researchContextText,
        responses: {
          ...checkpoint.responses,
          researchSynthesisResponse: researchSynthesisResponse
            ? { usage: researchSynthesisResponse?.usage || {} }
            : null,
        },
      });
    } else {
      sendProgress(1, 'Resuming from saved research context...');
    }

    let takeawaysResponse = checkpoint.responses.takeawaysResponse || null;
    let keyTakeaways = checkpoint.keyTakeaways || '';
    if (!keyTakeaways) {
      sendProgress(2, 'Creating key takeaways...');
      const takeawaysPrompt = renderTemplate(promptTemplates.keyTakeawaysPrompt, {
        topic,
        language,
      });
      takeawaysResponse = await chatCompletion({
        provider,
        apiKey,
        model: chatModel,
        maxTokens,
        messages: [
          {
            role: 'user',
            content: [takeawaysPrompt, researchContextText].filter(Boolean).join('\n\n'),
          },
        ],
      });
      keyTakeaways = takeawaysResponse.text || '';
      markCheckpoint(2, {
        keyTakeaways,
        responses: {
          ...checkpoint.responses,
          takeawaysResponse: { usage: takeawaysResponse?.usage || {} },
        },
      });
    } else {
      sendProgress(2, 'Resuming from saved key takeaways...');
    }

    let outlineResponse = checkpoint.responses.outlineResponse || null;
    let outline = checkpoint.outline || null;
    if (!outline) {
      sendProgress(3, 'Creating outline...');
      const outlinePrompt = renderTemplate(promptTemplates.outlinePrompt, {
        topic,
        language,
        secondaryKeywords: seoData.secondaryKeywords.join(', '),
      });
      outlineResponse = await chatCompletion({
        provider,
        apiKey,
        model: chatModel,
        maxTokens,
        messages: [
          {
            role: 'user',
            content: [outlinePrompt, researchContextText].filter(Boolean).join('\n\n'),
          },
        ],
      });
      outline = parseJsonContent(outlineResponse.text) || { sections: [] };
      markCheckpoint(3, {
        outline,
        responses: {
          ...checkpoint.responses,
          outlineResponse: { usage: outlineResponse?.usage || {} },
        },
      });
    } else {
      sendProgress(3, 'Resuming from saved outline...');
    }

    const productContext = mergedSettings.useProductContext ? loadProducts() : [];
    const productContextText =
      productContext.length > 0
        ? `\n\nProduct context (use only if relevant, link names to URLs):\n${productContext
            .slice(0, 20)
            .map((item) => {
              const image = item.image ? ` | Image: ${item.image}` : '';
              return `- ${item.title} | ${item.url || ''}${image}`;
            })
            .join('\n')}`
        : '';
    let blogResponse = checkpoint.responses.blogResponse || null;
    let blogContent = checkpoint.blogContent || null;
    if (!blogContent) {
      sendProgress(4, 'Writing blog content...');
      const blogPrompt = [
        promptTemplates.styleGuardrails,
        promptTemplates.seoStructureGuardrails,
        renderTemplate(promptTemplates.blogPrompt, {
          topic,
          language,
          writingStyle: mergedSettings.writingStyle || 'professional',
          writingTone: mergedSettings.writingTone || 'friendly',
          targetWordCount: mergedSettings.targetWordCount || 2500,
          primaryKeyword: seoData.primaryKeyword || '',
          secondaryKeywords: seoData.secondaryKeywords.join(', '),
          outline: JSON.stringify(outline.sections || [], null, 2),
        }),
        researchContextText ? `\n\n${researchContextText}` : '',
        siteBaseUrl ? `\n\nInternal site URL: ${siteBaseUrl}` : '',
        productContextText,
      ]
        .filter(Boolean)
        .join('\n\n');
      blogResponse = await chatCompletion({
        provider,
        apiKey,
        model: chatModel,
        maxTokens,
        messages: [{ role: 'user', content: blogPrompt }],
      });
      blogContent = parseJsonContent(blogResponse.text);
      if (!blogContent || !blogContent.content) {
        blogContent = { title: '', metaDescription: '', content: blogResponse.text || '' };
      }
      markCheckpoint(4, {
        blogContent,
        responses: {
          ...checkpoint.responses,
          blogResponse: { usage: blogResponse?.usage || {} },
        },
      });
    } else {
      sendProgress(4, 'Resuming from saved draft...');
    }

    const contentText = blogContent.content || '';
    const contentWords = stripHtmlTags(contentText).split(/\s+/).filter(Boolean).length;
    const looksLikeOutline =
      /^#?\s*outline/i.test(contentText) || contentWords < 300 || contentText.split(/\n/).length < 3;
    let repairResponse = checkpoint.responses.repairResponse || null;
    if (looksLikeOutline && !checkpoint.repairCompleted) {
      sendProgress(5, 'Repairing draft...');
      const repairPrompt = renderTemplate(promptTemplates.repairPrompt, {
        draft: contentText,
      });
      repairResponse = await chatCompletion({
        provider,
        apiKey,
        model: chatModel,
        maxTokens,
        messages: [{ role: 'user', content: repairPrompt }],
      });
      const repaired = parseJsonContent(repairResponse.text);
      if (repaired && repaired.content) {
        blogContent = repaired;
      }
      markCheckpoint(5, {
        repairCompleted: true,
        blogContent,
        responses: {
          ...checkpoint.responses,
          repairResponse: repairResponse ? { usage: repairResponse?.usage || {} } : null,
        },
      });
    } else if (looksLikeOutline) {
      sendProgress(5, 'Resuming from repaired draft...');
    }

    let humanizedResponse = checkpoint.responses.humanizedResponse || null;
    let humanizedContent = checkpoint.humanizedContent || '';
    if (!humanizedContent) {
      sendProgress(6, 'Humanizing content...');
      const humanizePrompt = renderTemplate(promptTemplates.humanizePrompt, {
        draft: blogContent.content || contentText,
      });
      humanizedResponse = await chatCompletion({
        provider,
        apiKey,
        model: chatModel,
        maxTokens,
        messages: [{ role: 'user', content: humanizePrompt }],
      });
      humanizedContent = humanizedResponse.text || blogContent.content;
      markCheckpoint(6, {
        humanizedContent,
        responses: {
          ...checkpoint.responses,
          humanizedResponse: { usage: humanizedResponse?.usage || {} },
        },
      });
    } else {
      sendProgress(6, 'Resuming from humanized content...');
    }

    let complianceResponse = checkpoint.responses.complianceResponse || null;
    let compliantContent = checkpoint.compliantContent || '';
    if (!compliantContent) {
      sendProgress(7, 'Checking compliance...');
      const compliancePrompt = renderTemplate(promptTemplates.compliancePrompt, {
        draft: humanizedContent,
      });
      complianceResponse = await chatCompletion({
        provider,
        apiKey,
        model: chatModel,
        maxTokens,
        messages: [{ role: 'user', content: compliancePrompt }],
      });
      compliantContent = complianceResponse.text || humanizedContent;
      markCheckpoint(7, {
        compliantContent,
        responses: {
          ...checkpoint.responses,
          complianceResponse: { usage: complianceResponse?.usage || {} },
        },
      });
    } else {
      sendProgress(7, 'Resuming from compliance check...');
    }

    const targetWords = mergedSettings.targetWordCount || 2500;
    let expandedContent = checkpoint.expandedContent || '';
    if (!expandedContent) {
      expandedContent = await ensureWordTarget({
        content: compliantContent,
        targetWords,
        provider,
        apiKey,
        model: chatModel,
        promptTemplates,
        maxTokens,
      });
      markCheckpoint(8, { expandedContent });
    }
    const finalWordsCheck = stripHtmlTags(expandedContent).split(/\s+/).filter(Boolean).length;
    if (finalWordsCheck < targetWords * 0.90) {
      throw new Error(`Generated content too short (${finalWordsCheck} words, target ${targetWords}). Please retry.`);
    }

    let imageUrl = null;
    sendProgress(8, 'Finalizing...');

    const usage = [
      seoResponse,
      takeawaysResponse,
      outlineResponse,
      blogResponse,
      repairResponse,
      humanizedResponse,
      complianceResponse,
      researchSynthesisResponse,
    ]
      .filter(Boolean)
      .reduce(
        (acc, item) => ({
          promptTokens: acc.promptTokens + (item.usage?.promptTokens || 0),
          completionTokens: acc.completionTokens + (item.usage?.completionTokens || 0),
        }),
        { promptTokens: 0, completionTokens: 0 }
      );
    const estimatedCost = estimateCost({
      provider,
      model: chatModel,
      usage,
      images: 0,
    });

    const chosenKeyword =
      mergedSettings.focusKeyword ||
      (Array.isArray(keywords) ? keywords[0] : keywords) ||
      seoData.primaryKeyword ||
      topic ||
      '';

    let finalContent = expandedContent || compliantContent || humanizedContent || blogContent.content || '';
    finalContent = ensureFocusKeywordUsage(finalContent, chosenKeyword);
    finalContent = stripMarkdownFences(finalContent);
    finalContent = linkProducts(finalContent, productContext);
    finalContent = keepOnlyScrapedLinks(finalContent, productContext);
    finalContent = renumberH2Headings(finalContent);
    if (!isTechnicalTopic(topic, keywords)) {
      finalContent = stripCodeBlocks(finalContent);
    }
    const wordCount = stripHtmlTags(finalContent).split(/\s+/).filter(Boolean).length;
    const seoScore = calculateSeoScore(
      finalContent,
      blogContent.title,
      blogContent.metaDescription,
      seoData.secondaryKeywords,
      focusKeyword
    );

    const normalizedCategories = Array.isArray(categories)
      ? categories.map((c) => String(c).trim()).filter(Boolean)
      : String(categories || '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);

    const result = {
      title: blogContent.title || `Blog: ${topic}`,
      topic,
      content: finalContent,
      metaDescription: blogContent.metaDescription || '',
      keywords: seoData.secondaryKeywords || [],
      categories: normalizedCategories,
      keyTakeaways,
      imageUrl,
      wordCount,
      seoScore,
      generatedAt: new Date().toISOString(),
      language,
      cost: estimatedCost,
    };

    sendProgress(9, 'Complete!');

    if (mergedSettings.autoSave !== false) {
      const savedId = await saveBlog(result, currentUser.id);
      if (savedId) {
        result.id = savedId;
      }
    }
    await updateApiUsage({
      userId: currentUser.id,
      cost: estimatedCost,
      tokens: usage.promptTokens + usage.completionTokens,
    });
    await logActivity({
      userId: currentUser?.id,
      action: 'blog.generate',
      details: `Generated "${result.title}"`,
    });
    await addNotification({
      userId: currentUser.id,
      type: 'info',
      message: `Blog generated: "${result.title}"`,
    });
    await addLog({
      level: 'info',
      category: 'generation',
      message: `Completed generation for "${result.title}"`,
      details: { cost: estimatedCost },
      userId: currentUser.id,
    });

    return { success: true, blog: result };
  } catch (error) {
    console.error('Blog generation error:', error);
    if (currentUser) {
      await addLog({
        level: 'error',
        category: 'generation',
        message: error.message,
        details: { topic, keywords },
        userId: currentUser.id,
      });
    }
    return {
      success: false,
      error: error.message,
      resumeState: checkpoint ? { ...checkpoint, failedAt: new Date().toISOString() } : null,
    };
  }
});

ipcMain.handle('get-auth-state', async () => {
  try {
    const count = await getUserCount();
    await loadPersistedUser();

    let userData = null;
    if (currentUser) {
      // Load user data from database on session restore
      const userSettingsRaw = await getSetting({
        userId: currentUser.id,
        key: `user_settings_${currentUser.id}`,
      });
      const userSettings = userSettingsRaw ? JSON.parse(userSettingsRaw) : {};
      const apiKey = await getSetting({
        userId: currentUser.id,
        key: `api_key_${currentUser.id}`,
      });
      const userIsAdmin = currentUser.role === 'admin';
      const usage = await getApiUsage({ userId: currentUser.id, isAdmin: userIsAdmin });
      const historySummary = await getHistorySummary({ userId: currentUser.id, isAdmin: userIsAdmin });

      userData = {
        settings: userSettings,
        hasApiKey: !!apiKey,
        apiUsage: usage,
        historySummary,
        publishDestinations: userSettings.publishDestinations || [],
      };
    }

    return {
      success: true,
      needsAdminSetup: count === 0,
      currentUser: sanitizeUser(currentUser),
      permissions: ALL_PERMISSIONS,
      userData,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-current-user', async () => {
  await loadPersistedUser();
  return { success: true, user: sanitizeUser(currentUser) };
});

ipcMain.handle('setup-admin', async (event, { username, password }) => {
  try {
    const count = await getUserCount();
    if (count > 0) {
      throw new Error('Admin already exists');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    await createUser({
      username,
      email: '',
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      status: 'active',
      permissions: ALL_PERMISSIONS,
    });

    const admin = await getUserByUsername(username);
    currentUser = admin;
    store.set(CURRENT_USER_KEY, admin.id);
    await logActivity({
      userId: admin?.id,
      action: 'admin.setup',
      details: 'Initial admin created',
    });

    return { success: true, user: sanitizeUser(admin) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('login', async (event, { username, password }) => {
  try {
    const user = await getUserByUsername(username);
    if (!user) {
      throw new Error('Invalid credentials');
    }
    if (user.status === 'deactive') {
      throw new Error('User is deactive. Contact admin.');
    }

    const hashed = hashPassword(password, user.passwordSalt);
    if (hashed !== user.passwordHash) {
      throw new Error('Invalid credentials');
    }

    currentUser = user;
    store.set(CURRENT_USER_KEY, user.id);
    await logActivity({
      userId: user.id,
      action: 'auth.login',
      details: `${user.username} logged in`,
    });

    // Load all user data from database on login
    const userSettingsRaw = await getSetting({
      userId: user.id,
      key: `user_settings_${user.id}`,
    });
    const userSettings = userSettingsRaw ? JSON.parse(userSettingsRaw) : {};

    const apiKey = await getSetting({
      userId: user.id,
      key: `api_key_${user.id}`,
    });

    const userIsAdmin = user.role === 'admin';
    const usage = await getApiUsage({ userId: user.id, isAdmin: userIsAdmin });
    const historySummary = await getHistorySummary({ userId: user.id, isAdmin: userIsAdmin });

    const recentActivities = await listActivities({
      userId: user.id,
      isAdmin: userIsAdmin,
      limit: 10,
    });

    return {
      success: true,
      user: sanitizeUser(user),
      userData: {
        settings: userSettings,
        hasApiKey: !!apiKey,
        apiUsage: usage,
        historySummary,
        recentActivities,
        publishDestinations: userSettings.publishDestinations || [],
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout', async () => {
  try {
    if (currentUser) {
      await logActivity({
        userId: currentUser.id,
        action: 'auth.logout',
        details: `${currentUser.username} logged out`,
      });
    }
    currentUser = null;
    store.delete(CURRENT_USER_KEY);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-users', async () => {
  try {
    requireAdmin();
    const users = await listUsers();
    return { success: true, users };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-user', async (event, { username, password, role, status, permissions }) => {
  try {
    requireAdmin();
    const nextUsername = (username || '').trim();
    const nextPassword = String(password || '');
    const requestedRole = String(role || 'user').trim().toLowerCase();
    const requestedStatus = String(status || 'active').trim().toLowerCase();
    const nextRole = requestedRole === 'admin' ? 'admin' : 'user';
    const nextStatus = requestedStatus === 'deactive' ? 'deactive' : 'active';
    const safePermissions = Array.isArray(permissions)
      ? permissions.filter((perm) => PERMISSIONS.includes(perm))
      : [];

    if (!nextUsername) {
      throw new Error('Username is required');
    }
    if (!nextPassword) {
      throw new Error('Password is required');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(nextPassword, salt);
    await createUser({
      username: nextUsername,
      email: '',
      passwordHash: hash,
      passwordSalt: salt,
      role: nextRole,
      status: nextStatus,
      permissions: nextRole === 'admin' ? ALL_PERMISSIONS : safePermissions,
    });

    await logActivity({
      userId: currentUser?.id,
      action: 'admin.createUser',
      details: `Created user "${nextUsername}"`,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-user-access', async (event, { userId, permissions, role, status }) => {
  try {
    requireAdmin();
    if (!userId) {
      throw new Error('User ID is required');
    }
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const requestedRole = String(role || user.role || 'user').toLowerCase();
    const nextRole = requestedRole === 'admin' ? 'admin' : 'user';
    const requestedStatus = String(status || user.status || 'active').toLowerCase();
    const nextStatus = requestedStatus === 'deactive' ? 'deactive' : 'active';
    const safePermissions = Array.isArray(permissions)
      ? permissions.filter((perm) => PERMISSIONS.includes(perm))
      : user.permissions || [];

    if (String(currentUser?.id || '') === String(userId) && nextStatus === 'deactive') {
      throw new Error('You cannot deactivate your own account');
    }

    await updateUserAccess({
      id: userId,
      role: nextRole,
      status: nextStatus,
      permissions: nextRole === 'admin' ? ALL_PERMISSIONS : safePermissions,
    });

    await logActivity({
      userId: currentUser?.id,
      action: 'admin.updateUser',
      details: `Updated access for "${user.username}"`,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-user', async (event, { userId }) => {
  try {
    requireAdmin();
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (String(currentUser?.id || '') === String(userId)) {
      throw new Error('You cannot delete your own account');
    }

    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const deletedCount = await deleteUser({ id: userId });
    if (!deletedCount) {
      throw new Error('User could not be deleted');
    }

    await logActivity({
      userId: currentUser?.id,
      action: 'admin.deleteUser',
      details: `Deleted user "${user.username}"`,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-activities', async () => {
  try {
    requirePermission('notifications');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const activities = await listActivities({
      userId: currentUser.id,
      isAdmin: isAdmin(),
      limit: 50,
    });
    return { success: true, activities };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-logs', async (event, { limit = 100, offset = 0, level = null, category = null } = {}) => {
  try {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const logs = await listLogs({
      userId: currentUser.id,
      isAdmin: isAdmin(),
      limit,
      offset,
      level,
      category,
    });
    return { success: true, logs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-logs-stats', async () => {
  try {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const stats = await getLogStats({ userId: currentUser.id, isAdmin: isAdmin() });
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-logs', async () => {
  try {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    await clearLogs({ userId: currentUser.id, isAdmin: isAdmin() });
    await logActivity({
      userId: currentUser?.id,
      action: 'logs.clear',
      details: 'Cleared logs',
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-notifications', async () => {
  try {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const notifications = await listNotifications({
      userId: currentUser.id,
      isAdmin: isAdmin(),
      limit: 100,
    });
    return { success: true, notifications };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mark-notification-read', async (event, { id }) => {
  try {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    await markNotificationRead({ id, userId: currentUser.id, isAdmin: isAdmin() });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-notifications', async () => {
  try {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    await clearNotifications({ userId: currentUser.id, isAdmin: isAdmin() });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-api-usage', async () => {
  try {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const usage = await getApiUsage({ userId: currentUser.id, isAdmin: isAdmin() });
    return { success: true, usage };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('scrape-website', async (event, { url, platform = 'generic', mode = 'static' }) => {
  try {
    requirePermission('generate');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const products = await ProductScraper.productScrapper(url, { platform, mode });
    await logActivity({
      userId: currentUser.id,
      action: 'scraper.run',
      details: `Scraped ${products.length} products from ${url}`,
    });
    return { success: true, products };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-product-database', async (event, { products }) => {
  try {
    requirePermission('generate');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const outputDir = path.join(app.getPath('userData'), 'data');
    const result = ProductScraper.saveToDatabase(products || [], outputDir);
    await logActivity({
      userId: currentUser.id,
      action: 'scraper.save',
      details: `Saved ${products.length} products to database`,
    });
    return { success: true, paths: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-product-database', async () => {
  try {
    requirePermission('generate');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const products = loadProducts();
    return { success: true, products };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('preview-link', async (event, { url }) => {
  try {
    requirePermission('generate');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const raw = String(url || '').trim();
    if (!raw) {
      throw new Error('URL is required');
    }
    if (!/^https?:\/\//i.test(raw)) {
      throw new Error('URL must start with http:// or https://');
    }

    const userSettingsRaw = await getSetting({
      userId: currentUser.id,
      key: `user_settings_${currentUser.id}`,
    });
    const userSettings = userSettingsRaw ? JSON.parse(userSettingsRaw) : {};
    const configuredEndpoint = String(
      userSettings.linkPreviewEndpoint ||
        process.env.LINKPREVIEW_ENDPOINT ||
        'https://api.linkpreview.net'
    ).trim();
    const linkPreviewApiKey = String(
      userSettings.linkPreviewApiKey || process.env.LINKPREVIEW_API_KEY || ''
    ).trim();
    const normalizeLinkPreviewEndpoint = (endpoint) => {
      try {
        const parsed = new URL(endpoint || 'https://api.linkpreview.net');
        const host = parsed.hostname.toLowerCase();
        // my.linkpreview.net is the dashboard; the API is api.linkpreview.net.
        if (host === 'my.linkpreview.net' || host === 'linkpreview.net' || host === 'www.linkpreview.net') {
          return 'https://api.linkpreview.net';
        }
        return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
      } catch (_error) {
        return 'https://api.linkpreview.net';
      }
    };
    const linkPreviewEndpoint = normalizeLinkPreviewEndpoint(configuredEndpoint);

    const buildFallbackPreview = async () => {
      const response = await axios.get(raw, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          ...PUBLISH_AXIOS_DEFAULTS.headers,
          Accept: 'text/html,application/xhtml+xml',
        },
        responseType: 'text',
      });

      const finalUrl = response?.request?.res?.responseUrl || raw;
      const $ = cheerio.load(response.data || '');
      const firstNonEmpty = (...vals) =>
        vals.find((v) => typeof v === 'string' && v.trim())?.trim() || '';
      const absolutize = (candidate) => {
        if (!candidate) return '';
        try {
          return new URL(candidate, finalUrl).toString();
        } catch (_error) {
          return '';
        }
      };

      const title = firstNonEmpty(
        $('meta[property="og:title"]').attr('content'),
        $('meta[name="twitter:title"]').attr('content'),
        $('title').first().text()
      );
      const description = firstNonEmpty(
        $('meta[property="og:description"]').attr('content'),
        $('meta[name="description"]').attr('content'),
        $('meta[name="twitter:description"]').attr('content')
      );
      const image = absolutize(
        firstNonEmpty(
          $('meta[property="og:image"]').attr('content'),
          $('meta[name="twitter:image"]').attr('content')
        )
      );
      const siteName = firstNonEmpty(
        $('meta[property="og:site_name"]').attr('content'),
        new URL(finalUrl).hostname
      );
      const favicon = absolutize(
        firstNonEmpty(
          $('link[rel="icon"]').attr('href'),
          $('link[rel="shortcut icon"]').attr('href'),
          '/favicon.ico'
        )
      );

      return {
        url: finalUrl,
        title: title || finalUrl,
        description,
        image,
        siteName,
        favicon,
      };
    };

    if (linkPreviewApiKey && /^https?:\/\//i.test(linkPreviewEndpoint)) {
      try {
        const lpRes = await axios.get(linkPreviewEndpoint, {
          timeout: 15000,
          headers: {
            ...PUBLISH_AXIOS_DEFAULTS.headers,
            'X-Linkpreview-Api-Key': linkPreviewApiKey,
          },
          params: {
            q: raw,
            // Deprecated, but some plans/proxies still expect it.
            key: linkPreviewApiKey,
            fields: 'icon,icon_type',
          },
        });
        const data = lpRes.data || {};
        const hasStructuredData =
          typeof data === 'object' &&
          !Array.isArray(data) &&
          (data.title || data.description || data.image || data.url);
        if (!hasStructuredData) {
          throw new Error('LinkPreview returned an unexpected payload');
        }
        const resolvedUrl = String(data.url || raw);
        return {
          success: true,
          preview: {
            url: resolvedUrl,
            title: String(data.title || resolvedUrl),
            description: String(data.description || ''),
            image: String(data.image || ''),
            siteName: new URL(resolvedUrl).hostname,
            favicon: String(data.icon || ''),
          },
        };
      } catch (error) {
        // Service unavailable or invalid key; fallback to local metadata extraction.
        console.warn('[preview-link] LinkPreview API failed, using fallback:', error.message);
      }
    }

    const fallbackPreview = await buildFallbackPreview();
    return { success: true, preview: fallbackPreview };
  } catch (error) {
    return { success: false, error: error.message || 'Preview failed' };
  }
});

ipcMain.handle('open-external', async (event, { url }) => {
  try {
    if (!url) {
      throw new Error('Missing URL');
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

async function fetchWordpressPosts({ baseUrl, token, authType = 'bearer', perPage = 50, after = null }) {
  const normalizedUrl = requireHttps(normalizeBaseUrl(baseUrl));
  const endpoint = `${normalizedUrl}/wp-json/aiblog/v1/posts`;

  // Determine auth header based on auth type
  const authHeader = authType === 'basic'
    ? `Basic ${token}`
    : `Bearer ${token}`;

  console.log(`[WordPress Sync] Auth type: ${authType}`);
  console.log(`[WordPress Sync] Fetching from plugin endpoint: ${endpoint}`);

  const params = { per_page: perPage };
  if (after) params.after = after;

  try {
    const response = await axios.get(endpoint, {
      headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
      params,
      timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    });

    console.log(`[WordPress Sync] Success! Items: ${response.data?.items?.length || 0}, Total: ${response.data?.total || 'N/A'}`);
    return response.data;
  } catch (error) {
    console.error(`[WordPress Sync] Failed: ${error.response?.status || 'N/A'} - ${error.message}`);
    throw new Error(extractPublishError(error));
  }
}

async function fetchShopifyPosts({ shopDomain, accessToken, apiVersion = '2024-01', blogId, limit = 100 }) {
  const domain = normalizeShopDomain(shopDomain);
  const version = (apiVersion || '2024-01').trim();
  const endpoint = `https://${domain}/admin/api/${version}/blogs/${blogId}/articles.json`;
  console.log('[Shopify Sync] Fetching from:', endpoint);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await axios.get(endpoint, {
        headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': accessToken },
        params: { limit },
        timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
      });
      return Array.isArray(response.data?.articles) ? response.data.articles : [];
    } catch (error) {
      const status = error.response?.status;
      if (status === 429 && attempt < 2) {
        const retryAfter = Number(error.response?.headers?.['retry-after'] || 2);
        const waitMs = Math.max(1, retryAfter) * 1000;
        console.warn(`[Shopify Sync] Rate limited (429). Retrying in ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }
      console.error('[Shopify Sync] Failed:', status || 'N/A', error.message);
      throw new Error(extractPublishError(error));
    }
  }
  throw new Error('Shopify sync failed after retries');
}

async function fetchWordpressPostDetail({ destination, postId }) {
  const baseUrl = requireHttps(normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl)));
  const authHeader = buildWpAuthHeader(destination);
  const endpoint = `${baseUrl}/wp-json/aiblog/v1/post/${postId}`;
  const response = await axios.get(endpoint, {
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
  });
  return response.data;
}

async function updateWordpressPost({ destination, postId, title, content, status, excerpt }) {
  const baseUrl = requireHttps(normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl)));
  const authHeader = buildWpAuthHeader(destination);
  const endpoint = `${baseUrl}/wp-json/aiblog/v1/post`;
  const payload = {
    id: postId,
    title,
    content,
    status,
    excerpt,
  };
  const response = await axios.post(endpoint, payload, {
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
  });
  return response.data;
}

async function deleteWordpressPost({ destination, postId, force = false }) {
  const baseUrl = requireHttps(normalizeBaseUrl(ensureValue('WordPress site URL', destination.baseUrl)));
  const authHeader = buildWpAuthHeader(destination);
  const endpoint = `${baseUrl}/wp-json/aiblog/v1/post/${postId}`;
  const response = await axios.delete(endpoint, {
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, Authorization: authHeader },
    params: force ? { force: true } : undefined,
  });
  return response.data;
}

async function fetchShopifyArticleDetail({ shopDomain, accessToken, apiVersion = '2024-01', blogId, articleId }) {
  const domain = normalizeShopDomain(shopDomain);
  const version = (apiVersion || '2024-01').trim();
  const endpoint = `https://${domain}/admin/api/${version}/blogs/${blogId}/articles/${articleId}.json`;
  const response = await axios.get(endpoint, {
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': accessToken },
  });
  return response.data?.article || null;
}

async function updateShopifyArticle({
  shopDomain,
  accessToken,
  apiVersion = '2024-01',
  blogId,
  articleId,
  title,
  bodyHtml,
  summaryHtml,
  tags,
  status,
}) {
  const domain = normalizeShopDomain(shopDomain);
  const version = (apiVersion || '2024-01').trim();
  const endpoint = `https://${domain}/admin/api/${version}/blogs/${blogId}/articles/${articleId}.json`;
  const articlePayload = {
    id: articleId,
    title,
    body_html: bodyHtml,
    summary_html: summaryHtml,
    tags,
    published: status === 'publish',
  };
  const response = await axios.put(
    endpoint,
    { article: articlePayload },
    {
      timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
      headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
    }
  );
  return response.data?.article || null;
}

async function deleteShopifyArticle({ shopDomain, accessToken, apiVersion = '2024-01', blogId, articleId }) {
  const domain = normalizeShopDomain(shopDomain);
  const version = (apiVersion || '2024-01').trim();
  const endpoint = `https://${domain}/admin/api/${version}/blogs/${blogId}/articles/${articleId}.json`;
  await axios.delete(endpoint, {
    timeout: PUBLISH_AXIOS_DEFAULTS.timeout,
    headers: { ...PUBLISH_AXIOS_DEFAULTS.headers, 'X-Shopify-Access-Token': accessToken },
  });
  return { success: true };
}

// Debug endpoint to test WordPress connection
ipcMain.handle('test-wordpress-sync', async (event, { destinationId = null } = {}) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination) {
      return { success: false, error: 'No destination found', destination: null };
    }

    const result = {
      destination: {
        name: destination.name,
        platform: destination.platform,
        baseUrl: destination.baseUrl,
        hasApiToken: !!destination.apiToken?.trim(),
        hasToken: !!destination.token?.trim(),
        hasAuthToken: !!destination.authToken?.trim(),
        hasUsername: !!destination.username?.trim(),
        hasAppPassword: !!destination.appPassword?.trim(),
        apiTokenLength: destination.apiToken?.trim()?.length || 0,
        tokenLength: destination.token?.trim()?.length || 0,
        authTokenLength: destination.authToken?.trim()?.length || 0,
        apiTokenFirst10: destination.apiToken?.trim()?.substring(0, 10) || '',
      },
      tests: [],
    };

    const baseUrl = destination.baseUrl;
    if (!baseUrl) {
      return { success: false, error: 'No baseUrl configured', result };
    }

    // Determine auth
    let token = null;
    let authType = 'bearer';
    if (destination.apiToken?.trim()) {
      token = destination.apiToken.trim();
    } else if (destination.token?.trim()) {
      token = destination.token.trim();
    } else if (destination.authToken?.trim()) {
      token = destination.authToken.trim();
    } else if (destination.username?.trim() && destination.appPassword?.trim()) {
      token = Buffer.from(`${destination.username.trim()}:${destination.appPassword.trim()}`).toString('base64');
      authType = 'basic';
    }

    if (!token) {
      return { success: false, error: 'No authentication credentials found', result };
    }

    const normalizedUrl = requireHttps(normalizeBaseUrl(baseUrl));
    const authHeader = authType === 'basic' ? `Basic ${token}` : `Bearer ${token}`;

    // Test 1: Check if WordPress REST API is accessible
    try {
      const wpApiTest = await axios.get(`${normalizedUrl}/wp-json/`, { timeout: 10000 });
      result.tests.push({
        name: 'WordPress REST API',
        endpoint: `${normalizedUrl}/wp-json/`,
        success: true,
        status: wpApiTest.status,
        siteName: wpApiTest.data?.name,
      });
    } catch (e) {
      result.tests.push({
        name: 'WordPress REST API',
        endpoint: `${normalizedUrl}/wp-json/`,
        success: false,
        error: e.message,
        status: e.response?.status,
      });
    }

    // Test 2: Check plugin debug info (no auth required)
    try {
      const debugTest = await axios.get(`${normalizedUrl}/wp-json/aiblog/v1/debug`, {
        timeout: 10000,
      });
      result.tests.push({
        name: 'Plugin Debug Info (no auth)',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/debug`,
        success: true,
        status: debugTest.status,
        data: debugTest.data,
      });
    } catch (e) {
      result.tests.push({
        name: 'Plugin Debug Info (no auth)',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/debug`,
        success: false,
        error: e.message,
        status: e.response?.status,
      });
    }

    // Test 2b: Check plugin debug WITH auth header to see what WP receives
    try {
      const debugWithAuthTest = await axios.get(`${normalizedUrl}/wp-json/aiblog/v1/debug`, {
        headers: { Authorization: authHeader },
        timeout: 10000,
      });

      const debugData = debugWithAuthTest.data;
      const authInfo = {
        authType: authType,
        authMethodDetected: debugData.auth_method,
        authHeaderPresent: debugData.authorization_header !== 'NO authorization header found',
      };

      // Add specific info based on auth type
      if (authType === 'basic') {
        authInfo.usernameInRequest = destination.username?.trim();
        authInfo.usernameDetected = debugData.basic_username;
        authInfo.usernamesMatch = destination.username?.trim() === debugData.basic_username;
      } else if (authType === 'bearer') {
        authInfo.tokenLengthInApp = token.length;
        authInfo.tokenLengthInWordPress = debugData.token_length;
        authInfo.tokensMatch = debugData.tokens_match;
      }

      result.tests.push({
        name: 'Plugin Debug Info (with auth)',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/debug`,
        success: true,
        status: debugWithAuthTest.status,
        authInfo: authInfo,
        fullDebugData: debugData,
      });
    } catch (e) {
      result.tests.push({
        name: 'Plugin Debug Info (with auth)',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/debug`,
        success: false,
        error: e.message,
        status: e.response?.status,
        data: e.response?.data,
      });
    }

    // Test 3: Check custom plugin ping WITH auth
    try {
      const pingTest = await axios.get(`${normalizedUrl}/wp-json/aiblog/v1/ping`, {
        headers: { Authorization: authHeader },
        timeout: 10000,
      });
      result.tests.push({
        name: 'AI Blog Plugin Ping (with auth)',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/ping`,
        success: true,
        status: pingTest.status,
        data: pingTest.data,
      });
    } catch (e) {
      result.tests.push({
        name: 'AI Blog Plugin Ping (with auth)',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/ping`,
        success: false,
        error: e.message,
        status: e.response?.status,
        data: e.response?.data,
      });
    }

    // Test 5: Check custom plugin posts endpoint
    try {
      const postsTest = await axios.get(`${normalizedUrl}/wp-json/aiblog/v1/posts`, {
        headers: { Authorization: authHeader },
        params: { per_page: 5 },
        timeout: 10000,
      });
      result.tests.push({
        name: 'AI Blog Plugin Posts',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/posts`,
        success: true,
        status: postsTest.status,
        count: postsTest.data?.items?.length || postsTest.data?.count || 'unknown',
      });
    } catch (e) {
      result.tests.push({
        name: 'AI Blog Plugin Posts',
        endpoint: `${normalizedUrl}/wp-json/aiblog/v1/posts`,
        success: false,
        error: e.message,
        status: e.response?.status,
        data: e.response?.data,
      });
    }

    // Test 6: Check standard WP posts endpoint
    try {
      const stdPostsTest = await axios.get(`${normalizedUrl}/wp-json/wp/v2/posts`, {
        headers: { Authorization: authHeader },
        params: { per_page: 5 },
        timeout: 10000,
      });
      result.tests.push({
        name: 'Standard WordPress Posts API',
        endpoint: `${normalizedUrl}/wp-json/wp/v2/posts`,
        success: true,
        status: stdPostsTest.status,
        count: Array.isArray(stdPostsTest.data) ? stdPostsTest.data.length : 'unknown',
      });
    } catch (e) {
      result.tests.push({
        name: 'Standard WordPress Posts API',
        endpoint: `${normalizedUrl}/wp-json/wp/v2/posts`,
        success: false,
        error: e.message,
        status: e.response?.status,
        data: e.response?.data,
      });
    }

    const allPassed = result.tests.every(t => t.success);
    return { success: allPassed, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-remote-posts', async (event, { destinationId = null, after = null } = {}) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    console.log('[Sync] Starting sync, destinationId:', destinationId);

    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination) {
      throw new Error('No destination found. Please select a WordPress destination.');
    }

    const platform = destination.platform;

    if (platform === 'wordpress' || platform === 'wordpress-token') {
      console.log('[Sync] Destination:', destination.name, 'Platform: wordpress (plugin endpoint)');

      const baseUrl = destination.baseUrl;
      if (!baseUrl) {
        throw new Error('Destination baseUrl is missing. Please check your WordPress settings.');
      }

      // Determine authentication method
      let token = null;
      let authType = 'bearer';

      // Check for JWT/Bearer token first
      if (destination.apiToken?.trim()) {
        token = destination.apiToken.trim();
        authType = 'bearer';
      } else if (destination.token?.trim()) {
        token = destination.token.trim();
        authType = 'bearer';
      } else if (destination.authToken?.trim()) {
        token = destination.authToken.trim();
        authType = 'bearer';
      } else if (destination.username?.trim() && destination.appPassword?.trim()) {
        // Use Application Password with Basic Auth
        token = Buffer.from(`${destination.username.trim()}:${destination.appPassword.trim()}`).toString('base64');
        authType = 'basic';
      }

      if (!token) {
        throw new Error('API token or credentials missing for destination');
      }

      console.log('[Sync] Fetching posts from:', baseUrl, 'using', authType, 'auth');

      const data = await fetchWordpressPosts({ baseUrl, token, authType, after });
      const posts = Array.isArray(data.items) ? data.items : [];

      console.log('[Sync] Received posts:', posts.length);

      await replaceRemotePosts(
        posts.map((item) => ({
          id: item.id,
          destination_id: destination.id || null,
          title: typeof item.title === 'string' ? item.title : (item.title?.rendered || 'Untitled'),
          status: item.status,
          url: item.url || item.link,
          created_at: item.created_at || item.date,
          updated_at: item.updated_at || item.modified,
          published_at: item.status === 'publish' ? (item.created_at || item.date) : null,
          views: typeof item.views === 'number' ? item.views : null,
          last_viewed: item.last_viewed || null,
          time_spent: typeof item.timeSpent === 'number' ? item.timeSpent : null,
          topics: [...(item.tags || []), ...(item.categories || [])],
        })),
        'wordpress',
        destination.id || null
      );

      console.log('[Sync] Sync complete, saved posts:', posts.length);
      return { success: true, count: posts.length };
    }

    if (platform === 'shopify') {
      console.log('[Sync] Destination:', destination.name, 'Platform: shopify');
      const shopDomain = ensureValue('Shopify shop domain', destination.shopDomain);
      const accessToken = ensureValue('Shopify access token', destination.accessToken);
      const blogId = ensureValue('Shopify blog ID', destination.blogId);
      const apiVersion = (destination.apiVersion || '2024-01').trim();

      const articles = await fetchShopifyPosts({
        shopDomain,
        accessToken,
        apiVersion,
        blogId,
      });

      console.log('[Sync] Received posts:', articles.length);

        const blogHandle =
          destination.blogHandle ||
          (await fetchShopifyBlogHandle({ shopDomain, accessToken, apiVersion, blogId }));

        await replaceRemotePosts(
          articles.map((item) => {
            const articleHandle = item.handle || '';
            const candidateUrl = item.url || '';
            const articleUrl = isPublicHttpUrl(candidateUrl)
              ? candidateUrl
              : buildShopifyArticleUrl({ shopDomain, blogHandle, articleHandle });
            return {
              id: item.id,
              destination_id: destination.id || null,
              title: item.title || 'Untitled',
              status: item.published_at ? 'publish' : 'draft',
              url: articleUrl || null,
              created_at: item.created_at,
              updated_at: item.updated_at,
              published_at: item.published_at,
              views: null,
              last_viewed: null,
              time_spent: null,
              topics: Array.isArray(item.tags)
                ? item.tags
                : String(item.tags || '')
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
            };
          }),
          'shopify',
          destination.id || null
        );

      console.log('[Sync] Sync complete, saved posts:', articles.length);
      return { success: true, count: articles.length };
    }

    throw new Error('Sync only works with WordPress or Shopify destinations');
  } catch (error) {
    console.error('[Sync] Error:', error);
    return { success: false, error: error.message || 'Sync failed' };
  }
});

ipcMain.handle('get-remote-posts', async (event, { status = null, limit = 200, destinationId = null } = {}) => {
  try {
    requirePermission('history');
    const posts = await listRemotePosts({ status, limit, destinationId });
    return { success: true, posts };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-remote-post-detail', async (event, { destinationId, postId }) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    if (!destinationId || !postId) {
      throw new Error('Destination and post ID are required');
    }
    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination) {
      throw new Error('Destination not found');
    }

    if (destination.platform === 'shopify') {
      const shopDomain = ensureValue('Shopify shop domain', destination.shopDomain);
      const accessToken = ensureValue('Shopify access token', destination.accessToken);
      const blogId = ensureValue('Shopify blog ID', destination.blogId);
      const apiVersion = (destination.apiVersion || '2024-01').trim();
      const article = await fetchShopifyArticleDetail({
        shopDomain,
        accessToken,
        apiVersion,
        blogId,
        articleId: postId,
      });
      if (!article) {
        throw new Error('Shopify article not found');
      }
      const blogHandle =
        destination.blogHandle ||
        (await fetchShopifyBlogHandle({ shopDomain, accessToken, apiVersion, blogId }));
      const articleHandle = article.handle || '';
      const articleUrl =
        isPublicHttpUrl(article.url || '')
          ? article.url
          : buildShopifyArticleUrl({ shopDomain, blogHandle, articleHandle });
      return {
        success: true,
        post: {
          id: article.id,
          title: article.title || '',
          content: article.body_html || '',
          summary: article.summary_html || '',
          status: article.published_at ? 'publish' : 'draft',
          url: articleUrl || null,
          tags: article.tags || '',
          provider: 'shopify',
        },
      };
    }

    const data = await fetchWordpressPostDetail({ destination, postId });
    const content =
      typeof data?.content === 'string'
        ? data.content
        : data?.content?.rendered || '';
    const summary =
      typeof data?.excerpt === 'string'
        ? data.excerpt
        : data?.excerpt?.rendered || '';
    return {
      success: true,
      post: {
        id: data.id || postId,
        title: data.title || data?.title?.rendered || '',
        content,
        summary,
        status: data.status || 'draft',
        url: data.url || data.link || null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        provider: 'wordpress',
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-remote-post', async (event, { destinationId, postId, title, content, status }) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    if (!destinationId || !postId) {
      throw new Error('Destination and post ID are required');
    }
    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination) {
      throw new Error('Destination not found');
    }

    if (destination.platform === 'shopify') {
      const shopDomain = ensureValue('Shopify shop domain', destination.shopDomain);
      const accessToken = ensureValue('Shopify access token', destination.accessToken);
      const blogId = ensureValue('Shopify blog ID', destination.blogId);
      const apiVersion = (destination.apiVersion || '2024-01').trim();
      const current = await fetchShopifyArticleDetail({
        shopDomain,
        accessToken,
        apiVersion,
        blogId,
        articleId: postId,
      });
      if (!current) {
        throw new Error('Shopify article not found');
      }
      const updated = await updateShopifyArticle({
        shopDomain,
        accessToken,
        apiVersion,
        blogId,
        articleId: postId,
        title,
        bodyHtml: content,
        summaryHtml: current.summary_html || '',
        tags: current.tags || '',
        status,
      });
      const blogHandle =
        destination.blogHandle ||
        (await fetchShopifyBlogHandle({ shopDomain, accessToken, apiVersion, blogId }));
      const articleHandle = updated?.handle || current.handle || '';
      const articleUrl =
        isPublicHttpUrl(updated?.url || '')
          ? updated.url
          : buildShopifyArticleUrl({ shopDomain, blogHandle, articleHandle });
      await upsertRemotePosts(
        [
          {
            id: updated?.id || postId,
            destination_id: destination.id || null,
            title: updated?.title || title || 'Untitled',
            status: updated?.published_at ? 'publish' : 'draft',
            url: articleUrl || null,
            created_at: updated?.created_at || current?.created_at,
            updated_at: updated?.updated_at || new Date().toISOString(),
            published_at: updated?.published_at || null,
            views: null,
            last_viewed: null,
            time_spent: null,
            topics: Array.isArray(updated?.tags)
              ? updated.tags
              : String(updated?.tags || current?.tags || '')
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
          },
        ],
        'shopify'
      );
      return { success: true, postId };
    }

    const updated = await updateWordpressPost({
      destination,
      postId,
      title,
      content,
      status,
      excerpt: '',
    });
    await upsertRemotePosts(
      [
        {
          id: updated.id || postId,
          destination_id: destination.id || null,
          title: updated.title || updated?.title?.rendered || title || 'Untitled',
          status: updated.status || status || 'draft',
          url: updated.url || updated.link,
          created_at: updated.created_at || updated.date,
          updated_at: updated.updated_at || updated.modified,
          published_at: updated.status === 'publish' ? (updated.created_at || updated.date) : null,
          views: typeof updated.views === 'number' ? updated.views : null,
          last_viewed: updated.last_viewed || null,
          time_spent: typeof updated.timeSpent === 'number' ? updated.timeSpent : null,
          topics: [...(updated.tags || []), ...(updated.categories || [])],
        },
      ],
      'wordpress'
    );
    return { success: true, postId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-remote-post', async (event, { destinationId, postId, force = false }) => {
  try {
    requirePermission('history');
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    if (!destinationId || !postId) {
      throw new Error('Destination and post ID are required');
    }
    const destination = await getPublishDestination(destinationId, currentUser.id);
    if (!destination) {
      throw new Error('Destination not found');
    }

    if (destination.platform === 'shopify') {
      const shopDomain = ensureValue('Shopify shop domain', destination.shopDomain);
      const accessToken = ensureValue('Shopify access token', destination.accessToken);
      const blogId = ensureValue('Shopify blog ID', destination.blogId);
      const apiVersion = (destination.apiVersion || '2024-01').trim();
      await deleteShopifyArticle({ shopDomain, accessToken, apiVersion, blogId, articleId: postId });
      await deleteRemotePost({ id: postId, provider: 'shopify', destinationId: destination.id || null });
      return { success: true };
    }

    await deleteWordpressPost({ destination, postId, force });
    await deleteRemotePost({ id: postId, provider: 'wordpress', destinationId: destination.id || null });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-remote-post-analytics', async () => {
  try {
    requirePermission('history');
    const analytics = await getRemotePostAnalytics();
    return { success: true, analytics };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== PUBLISH HISTORY & ANALYTICS HANDLERS ====================

ipcMain.handle('get-publish-history', async (event, { limit = 100, offset = 0, dateFrom, dateTo, platform, status, destinationId = null } = {}) => {
  try {
    requirePermission('history');
    const userId = isAdmin() ? null : currentUser?.id;
    const history = await getPublishHistory({ userId, limit, offset, dateFrom, dateTo, platform, status, destinationId });
    return { success: true, history };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-blog-publish-status', async (event, { blogId }) => {
  try {
    requirePermission('history');
    if (!blogId) {
      throw new Error('Blog ID is required');
    }
    const history = await getPublishHistoryByBlog(blogId);
    return { success: true, history, isPublished: history.length > 0 };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-publish-analytics', async (event, { dateFrom, dateTo, destinationId = null } = {}) => {
  try {
    requirePermission('history');
    const userId = isAdmin() ? null : currentUser?.id;
    const analytics = await getPublishAnalytics({ userId, dateFrom, dateTo, destinationId });
    return { success: true, analytics };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-link-context-menu', async (event, { url }) => {
  try {
    if (!url) {
      throw new Error('Missing URL');
    }
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open link',
        click: () => {
          shell.openExternal(url);
        },
      },
      {
        label: 'Copy link',
        click: () => {
          clipboard.writeText(url);
        },
      },
    ]);
    const window = BrowserWindow.fromWebContents(event.sender);
    menu.popup({ window });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===================== ANALYTICS EVENTS & REALTIME =====================
ipcMain.handle('start-session', async (event, payload) => {
  try {
    requirePermission('history');
    await upsertSession(payload);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('heartbeat-session', async (event, payload) => {
  try {
    requirePermission('history');
    await heartbeatSession(payload);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('end-session', async (event, payload) => {
  try {
    requirePermission('history');
    await endSession(payload);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('log-analytics-event', async (event, payload) => {
  try {
    requirePermission('history');
    await logAnalyticsEvent(payload);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-realtime-analytics', async (event, payload) => {
  try {
    requirePermission('history');
    const data = await getRealtimeAnalytics(payload || {});
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

