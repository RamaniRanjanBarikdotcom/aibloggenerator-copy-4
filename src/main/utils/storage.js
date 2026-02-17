const Store = require('electron-store');

const store = new Store({
  encryptionKey: 'your-secret-key-change-in-production',
});

module.exports = store;
