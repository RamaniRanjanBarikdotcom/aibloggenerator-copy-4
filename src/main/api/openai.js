const OpenAI = require('openai');
const Store = require('electron-store');

const store = new Store({
  encryptionKey: 'your-secret-key-change-in-production',
});

function getOpenAIClient() {
  const apiKey = store.get('openai_api_key');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  return new OpenAI({ apiKey });
}

module.exports = { getOpenAIClient };
