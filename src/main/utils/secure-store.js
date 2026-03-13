const { app, safeStorage } = require('electron');
const crypto = require('crypto');
let warnedSafeStorageDecryptFailure = false;
let warnedFallbackDecryptFailure = false;

function getFallbackKey() {
  const seed =
    process.env.APP_ENCRYPTION_KEY ||
    process.env.SHOPIFY_OAUTH_STORE_KEY ||
    process.env.ELECTRON_STORE_KEY ||
    app.getPath('userData');
  return crypto.createHash('sha256').update(String(seed)).digest();
}

function encryptFallback(value) {
  if (!value) return '';
  const key = getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptFallback(payload) {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('enc:')) {
    return payload || '';
  }
  const parts = payload.split(':');
  if (parts.length !== 4) {
    return '';
  }
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const encrypted = Buffer.from(parts[3], 'hex');
  const key = getFallbackKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function encryptForStore(value) {
  if (!value) return '';
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(String(value));
    return `ss:${encrypted.toString('base64')}`;
  }
  return encryptFallback(value);
}

function decryptFromStore(value) {
  if (!value) return '';
  if (typeof value !== 'string') {
    return '';
  }
  if (value.startsWith('ss:')) {
    const payload = value.slice(3);
    try {
      return safeStorage.decryptString(Buffer.from(payload, 'base64'));
    } catch (error) {
      if (!warnedSafeStorageDecryptFailure) {
        warnedSafeStorageDecryptFailure = true;
        console.warn('[SecureStore] Failed to decrypt a stored safeStorage value. Clearing invalid local encrypted data.');
      }
      return '';
    }
  }
  if (value.startsWith('enc:')) {
    try {
      return decryptFallback(value);
    } catch (error) {
      if (!warnedFallbackDecryptFailure) {
        warnedFallbackDecryptFailure = true;
        console.warn('[SecureStore] Failed to decrypt a stored fallback value. Clearing invalid local encrypted data.');
      }
      return '';
    }
  }
  return value;
}

function isEncryptionAvailable() {
  return !!(safeStorage && safeStorage.isEncryptionAvailable());
}

module.exports = {
  encryptForStore,
  decryptFromStore,
  isEncryptionAvailable,
};
