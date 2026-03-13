import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Database, Link2, Loader } from 'lucide-react';

function MongoDBSetupPage({ onSetupComplete }) {
  const [mode, setMode] = useState('api');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiTimeoutMs, setApiTimeoutMs] = useState(15000);

  const [mongoUri, setMongoUri] = useState('');
  const [mongoDbName, setMongoDbName] = useState('aiblog_generator');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [serverCfg, mongoCfg] = await Promise.all([
          window.electronAPI.getServerApiConfig(),
          window.electronAPI.getMongoDBConfig(),
        ]);

        if (serverCfg?.success) {
          setApiBaseUrl(serverCfg.baseUrl || '');
          setApiTimeoutMs(Number(serverCfg.timeoutMs || 15000));
          if (serverCfg.enabled) {
            setMode('api');
          }
        }

        if (mongoCfg?.success && mongoCfg.config) {
          setMongoDbName(mongoCfg.config.dbName || 'aiblog_generator');
          if (!serverCfg?.enabled && mongoCfg.config.isConfigured) {
            setMode('mongo');
          }
        }
      } catch (loadError) {
        console.error('Error loading startup config:', loadError);
      }
    };

    loadConfig();
  }, []);

  const clearStatus = () => {
    setError('');
    setTestSuccess(false);
    setTestMessage('');
  };

  const handleTestApi = async () => {
    clearStatus();
    setIsTesting(true);
    try {
      if (!apiBaseUrl.trim()) {
        throw new Error('Server API base URL is required');
      }

      const result = await window.electronAPI.testServerApiConfig({
        baseUrl: apiBaseUrl.trim(),
        timeoutMs: Number(apiTimeoutMs || 15000),
      });

      if (!result.success) {
        throw new Error(result.error || 'Server API test failed');
      }

      setTestSuccess(true);
      setTestMessage(result.message || 'Server API connection successful.');
    } catch (testError) {
      setError(testError.message || 'Server API test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveApi = async () => {
    clearStatus();
    setIsLoading(true);
    try {
      if (!apiBaseUrl.trim()) {
        throw new Error('Server API base URL is required');
      }

      const result = await window.electronAPI.saveServerApiConfig({
        baseUrl: apiBaseUrl.trim(),
        timeoutMs: Number(apiTimeoutMs || 15000),
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save server API configuration');
      }

      onSetupComplete();
    } catch (saveError) {
      setError(saveError.message || 'Failed to save server API configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestMongo = async () => {
    clearStatus();
    setIsTesting(true);
    try {
      if (!mongoUri.trim()) {
        throw new Error('MongoDB URI is required');
      }
      if (!mongoDbName.trim()) {
        throw new Error('Database name is required');
      }

      const result = await window.electronAPI.testMongoDBConnection({
        uri: mongoUri.trim(),
        dbName: mongoDbName.trim(),
      });

      if (!result.success) {
        throw new Error(result.error || 'MongoDB connection test failed');
      }

      setTestSuccess(true);
      setTestMessage(result.message || 'MongoDB connection successful.');
    } catch (testError) {
      setError(testError.message || 'MongoDB connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveMongo = async () => {
    clearStatus();
    setIsLoading(true);
    try {
      if (!mongoUri.trim()) {
        throw new Error('MongoDB URI is required');
      }
      if (!mongoDbName.trim()) {
        throw new Error('Database name is required');
      }

      const result = await window.electronAPI.saveMongoDBConfig({
        uri: mongoUri.trim(),
        dbName: mongoDbName.trim(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save MongoDB configuration');
      }

      onSetupComplete();
    } catch (saveError) {
      setError(saveError.message || 'Failed to save MongoDB configuration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="flex items-center justify-center mb-6">
          <div className="p-4 bg-indigo-100 dark:bg-indigo-900 rounded-full">
            {mode === 'api' ? (
              <Link2 className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Database className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
            )}
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-gray-800 dark:text-white mb-2">
          Connection Setup
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          Configure server API (recommended) or direct MongoDB mode.
        </p>

        <div className="mb-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              clearStatus();
              setMode('api');
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === 'api'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Server API
          </button>
          <button
            type="button"
            onClick={() => {
              clearStatus();
              setMode('mongo');
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === 'mongo'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Direct MongoDB
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Error</p>
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {testSuccess && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">Success</p>
              <p className="text-sm text-green-600 dark:text-green-300 mt-1">{testMessage}</p>
            </div>
          </div>
        )}

        {mode === 'api' ? (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Server API Base URL
              </label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(event) => {
                  setApiBaseUrl(event.target.value);
                  clearStatus();
                }}
                placeholder="https://your-domain.com/path/to/blog-gen.php"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Timeout (ms)
              </label>
              <input
                type="number"
                min={1000}
                step={500}
                value={apiTimeoutMs}
                onChange={(event) => {
                  setApiTimeoutMs(Number(event.target.value || 15000));
                  clearStatus();
                }}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleTestApi}
                disabled={isLoading || isTesting}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTesting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Test Connection
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSaveApi}
                disabled={isLoading || isTesting || !apiBaseUrl}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Link2 className="w-5 h-5" />
                    Save & Continue
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                MongoDB Connection URI
              </label>
              <input
                type="text"
                value={mongoUri}
                onChange={(event) => {
                  setMongoUri(event.target.value);
                  clearStatus();
                }}
                placeholder="mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Database Name
              </label>
              <input
                type="text"
                value={mongoDbName}
                onChange={(event) => {
                  setMongoDbName(event.target.value);
                  clearStatus();
                }}
                placeholder="aiblog_generator"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleTestMongo}
                disabled={isLoading || isTesting}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTesting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Test Connection
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSaveMongo}
                disabled={isLoading || isTesting || !mongoUri || !mongoDbName}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Database className="w-5 h-5" />
                    Save & Continue
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MongoDBSetupPage;
