const localDb = require('./db-mongodb');
const { getApiConfig, dbCall } = require('../services/serverApi');

let tokenGetter = null;
let unauthorizedHandler = null;

function isServerApiDbEnabled() {
  return Boolean(getApiConfig().enabled);
}

function getAccessToken() {
  if (typeof tokenGetter !== 'function') {
    return '';
  }
  try {
    const token = tokenGetter();
    return typeof token === 'string' ? token.trim() : '';
  } catch (error) {
    return '';
  }
}

async function callRemote(action, args) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated (missing server access token).');
  }
  try {
    const response = await dbCall({ accessToken, action, args });
    return response.result;
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 0);
    const message = String(error?.message || '');
    if (status === 401 || /\b401\b/.test(message) || /not authenticated/i.test(message)) {
      if (typeof unauthorizedHandler === 'function') {
        try {
          unauthorizedHandler();
        } catch (_handlerError) {
          // Ignore cleanup callback errors.
        }
      }
      const authError = new Error('Not authenticated');
      authError.status = 401;
      throw authError;
    }
    throw error;
  }
}

function wrap(action) {
  const localFn = localDb[action];
  if (typeof localFn !== 'function') {
    throw new Error(`db-provider: unknown function ${action}`);
  }

  if (action === 'setStore') {
    return (...args) => localFn(...args);
  }

  return async (...args) => {
    if (isServerApiDbEnabled()) {
      return callRemote(action, args);
    }
    return localFn(...args);
  };
}

const exported = {
  setAuthTokenGetter: (getter) => {
    tokenGetter = typeof getter === 'function' ? getter : null;
  },
  setUnauthorizedHandler: (handler) => {
    unauthorizedHandler = typeof handler === 'function' ? handler : null;
  },
};

for (const key of Object.keys(localDb)) {
  exported[key] = wrap(key);
}

module.exports = exported;
