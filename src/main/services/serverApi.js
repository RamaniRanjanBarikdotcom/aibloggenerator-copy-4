const axios = require('axios');
const appBootstrap = require('../config/app-bootstrap');

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function getApiConfig() {
  const bootstrapBaseUrl = normalizeBaseUrl(appBootstrap?.serverApiBaseUrl || '');
  const bootstrapTimeoutMs = Number(appBootstrap?.serverApiTimeoutMs || 15000);

  const baseUrl = normalizeBaseUrl(
    process.env.APP_SERVER_API_BASE_URL ||
    process.env.APP_PHP_API_URL ||
    process.env.SERVER_API_BASE_URL ||
    bootstrapBaseUrl ||
    ''
  );

  const timeoutMs = Number(
    process.env.APP_SERVER_API_TIMEOUT_MS ||
    process.env.APP_PHP_API_TIMEOUT_MS ||
    bootstrapTimeoutMs ||
    15000
  );

  return {
    enabled: Boolean(baseUrl),
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
  };
}

function ensureEnabled() {
  const cfg = getApiConfig();
  if (!cfg.baseUrl) {
    throw new Error('Server API base URL is missing. Set APP_SERVER_API_BASE_URL.');
  }
  return cfg;
}

function buildHeaders(accessToken = '') {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    headers['X-Access-Token'] = accessToken;
  }

  return headers;
}

function buildRequestUrl(baseUrl, path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  // Support both explicit PHP endpoints (.../blog-gen.php) and extensionless
  // routed endpoints (.../blog-gen) that expect ?route=/...
  const isRoutedEndpoint =
    /\.php(?:$|\?)/i.test(baseUrl) ||
    /\/blog-gen(?:\.php)?(?:$|\?)/i.test(baseUrl);

  if (!isRoutedEndpoint) {
    return `${baseUrl}${normalizedPath}`;
  }

  const [routePart, queryPart = ''] = normalizedPath.split('?');
  const route = `/${String(routePart || '').replace(/^\/+/, '')}`;
  const params = new URLSearchParams(queryPart);
  params.set('route', route);

  const joiner = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${joiner}${params.toString()}`;
}

async function request(path, { method = 'GET', data = null, accessToken = '' } = {}) {
  const cfg = ensureEnabled();
  const url = buildRequestUrl(cfg.baseUrl, path);
  try {
    const response = await axios({
      url,
      method,
      data,
      timeout: cfg.timeoutMs,
      headers: buildHeaders(accessToken),
    });

    const payload = response?.data || {};
    if (!payload.success) {
      const apiError = new Error(payload.error || `Server API request failed: ${path}`);
      apiError.statusCode = response?.status || null;
      apiError.code = payload.code || null;
      throw apiError;
    }
    return payload;
  } catch (error) {
    const statusCode = error?.response?.status || error?.statusCode || null;
    const remotePayload = error?.response?.data || null;
    const remoteCode = remotePayload?.code || error?.code || null;
    const remoteMessage = remotePayload?.error || remotePayload?.message || '';
    const baseMessage = remoteMessage || error?.message || `Server API request failed: ${path}`;

    let message = baseMessage;
    if (statusCode) {
      message = `HTTP ${statusCode}: ${baseMessage}`;
    } else if (remoteCode) {
      message = `${remoteCode}: ${baseMessage}`;
    }

    const normalizedError = new Error(message);
    normalizedError.statusCode = statusCode;
    normalizedError.code = remoteCode;
    throw normalizedError;
  }
}

async function dbCall({ accessToken, action, args = [] }) {
  return request('/db/call', {
    method: 'POST',
    data: {
      action: String(action || '').trim(),
      args: Array.isArray(args) ? args : [],
      accessToken: String(accessToken || '').trim(),
    },
    accessToken,
  });
}

async function setupAdmin({ username, password }) {
  return request('/auth/setup-admin', {
    method: 'POST',
    data: { username, password },
  });
}

async function login({ username, password }) {
  return request('/auth/login', {
    method: 'POST',
    data: { username, password },
  });
}

async function getAuthState({ accessToken = '' } = {}) {
  return request('/auth/state', {
    method: 'GET',
    accessToken,
  });
}

async function listSchedulerJobs({
  accessToken,
  status = '',
  shopId = '',
  destinationId = '',
  platform = '',
  limit = 500,
} = {}) {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (shopId) qs.set('shopId', shopId);
  if (destinationId) qs.set('destinationId', destinationId);
  if (platform) qs.set('platform', platform);
  if (limit) qs.set('limit', String(limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request(`/scheduler/jobs${suffix}`, { method: 'GET', accessToken });
}

async function createSchedulerJob({ accessToken, job }) {
  return request('/scheduler/jobs', {
    method: 'POST',
    data: job,
    accessToken,
  });
}

async function updateSchedulerJob({ accessToken, jobId, updates }) {
  return request(`/scheduler/jobs/${encodeURIComponent(jobId)}`, {
    method: 'PUT',
    data: updates,
    accessToken,
  });
}

async function deleteSchedulerJob({ accessToken, jobId }) {
  return request(`/scheduler/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    accessToken,
  });
}

async function importSchedulerCsv({ accessToken, csvContent, defaultShopId = '' }) {
  return request('/scheduler/import-csv', {
    method: 'POST',
    data: { csvContent, defaultShopId },
    accessToken,
  });
}

async function listSchedulerLogs({ accessToken, jobId = '', status = '', limit = 500 } = {}) {
  const qs = new URLSearchParams();
  if (jobId) qs.set('jobId', jobId);
  if (status) qs.set('status', status);
  if (limit) qs.set('limit', String(limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request(`/scheduler/logs${suffix}`, { method: 'GET', accessToken });
}

async function addSchedulerLog({ accessToken, log }) {
  return request('/scheduler/logs', {
    method: 'POST',
    data: log,
    accessToken,
  });
}

async function shopifyListOauthClients({ accessToken } = {}) {
  return request('/shopify/oauth/clients', { method: 'GET', accessToken });
}

async function shopifySaveOauthClient({ accessToken, client } = {}) {
  return request('/shopify/oauth/clients', { method: 'POST', data: client, accessToken });
}

async function shopifyDeleteOauthClient({ accessToken, id } = {}) {
  return request(`/shopify/oauth/clients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    accessToken,
  });
}

async function shopifyStartOauth({ accessToken, ...payload } = {}) {
  return request('/shopify/oauth/start', { method: 'POST', data: payload, accessToken });
}

async function shopifyOauthStatus({ accessToken, state } = {}) {
  return request(`/shopify/oauth/status?state=${encodeURIComponent(state)}`, {
    method: 'GET',
    accessToken,
  });
}

async function shopifyPublish({ accessToken, ...payload } = {}) {
  return request('/shopify/publish', { method: 'POST', data: payload, accessToken });
}

async function shopifyListBlogs({ accessToken, shop, destinationId = '', apiVersion = '2024-01' } = {}) {
  const qs = new URLSearchParams({ shop, apiVersion });
  if (destinationId) qs.set('destinationId', destinationId);
  return request(`/shopify/blogs?${qs.toString()}`, { method: 'GET', accessToken });
}

async function shopifyCreateBlog({ accessToken, shop, destinationId = '', apiVersion = '2024-01', title } = {}) {
  return request('/shopify/blogs', {
    method: 'POST',
    data: { shop, destinationId, apiVersion, title },
    accessToken,
  });
}

async function shopifyTestConnection({ accessToken, shop, destinationId = '', apiVersion = '2024-01' } = {}) {
  const qs = new URLSearchParams({ shop, apiVersion });
  if (destinationId) qs.set('destinationId', destinationId);
  return request(`/shopify/shop?${qs.toString()}`, { method: 'GET', accessToken });
}

async function checkLatestUpdate({ currentVersion = '', channel = 'stable' } = {}) {
  const qs = new URLSearchParams();
  if (currentVersion) qs.set('currentVersion', currentVersion);
  if (channel) qs.set('channel', channel);
  return request(`/updates/latest?${qs.toString()}`, { method: 'GET' });
}

module.exports = {
  getApiConfig,
  dbCall,
  setupAdmin,
  login,
  getAuthState,
  listSchedulerJobs,
  createSchedulerJob,
  updateSchedulerJob,
  deleteSchedulerJob,
  importSchedulerCsv,
  listSchedulerLogs,
  addSchedulerLog,
  shopifyListOauthClients,
  shopifySaveOauthClient,
  shopifyDeleteOauthClient,
  shopifyStartOauth,
  shopifyOauthStatus,
  shopifyPublish,
  shopifyListBlogs,
  shopifyCreateBlog,
  shopifyTestConnection,
  checkLatestUpdate,
};
