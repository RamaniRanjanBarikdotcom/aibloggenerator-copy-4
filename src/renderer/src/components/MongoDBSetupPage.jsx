import React, { useState, useEffect } from 'react';
import { Database, AlertCircle, CheckCircle, Loader } from 'lucide-react';

function MongoDBSetupPage({ onSetupComplete }) {
  const [uri, setUri] = useState('');
  const [dbName, setDbName] = useState('aiblog_generator');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    // Load existing config if any
    const loadConfig = async () => {
      try {
        const result = await window.electronAPI.getMongoDBConfig();
        if (result.success && result.config) {
          // Don't set URI as it's masked, but set dbName
          setDbName(result.config.dbName || 'aiblog_generator');
        }
      } catch (err) {
        console.error('Error loading MongoDB config:', err);
      }
    };
    loadConfig();
  }, []);

  const handleTest = async () => {
    setError('');
    setIsTesting(true);
    setTestSuccess(false);

    try {
      if (!uri.trim()) {
        throw new Error('MongoDB URI is required');
      }
      if (!dbName.trim()) {
        throw new Error('Database name is required');
      }

      const result = await window.electronAPI.testMongoDBConnection({ uri, dbName });

      if (result.success) {
        setTestSuccess(true);
        setError('');
      } else {
        throw new Error(result.error || 'Connection test failed');
      }
    } catch (err) {
      setError(err.message);
      setTestSuccess(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setIsLoading(true);

    try {
      if (!uri.trim()) {
        throw new Error('MongoDB URI is required');
      }
      if (!dbName.trim()) {
        throw new Error('Database name is required');
      }

      const result = await window.electronAPI.saveMongoDBConfig({ uri, dbName });

      if (result.success) {
        onSetupComplete();
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="flex items-center justify-center mb-6">
          <div className="p-4 bg-indigo-100 dark:bg-indigo-900 rounded-full">
            <Database className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-gray-800 dark:text-white mb-2">
          MongoDB Database Setup
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          Configure your MongoDB connection to get started
        </p>

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
              <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                Connection successful! You can now save the configuration.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              MongoDB Connection URI
            </label>
            <input
              type="text"
              value={uri}
              onChange={(e) => {
                setUri(e.target.value);
                setTestSuccess(false);
              }}
              placeholder="mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Get your connection string from{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.electronAPI.openExternal({ url: 'https://cloud.mongodb.com' });
                }}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                MongoDB Atlas
              </a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Database Name
            </label>
            <input
              type="text"
              value={dbName}
              onChange={(e) => {
                setDbName(e.target.value);
                setTestSuccess(false);
              }}
              placeholder="aiblog_generator"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
              📘 Setup Instructions:
            </p>
            <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Sign up for a free MongoDB Atlas account at cloud.mongodb.com</li>
              <li>Create a new cluster (free tier available)</li>
              <li>Click "Connect" and copy your connection string</li>
              <li>Replace <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'<password>'}</code> with your actual password</li>
              <li>Make sure to URL-encode special characters (@ = %40, etc.)</li>
              <li>Whitelist your IP address in Network Access</li>
            </ol>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleTest}
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
              onClick={handleSave}
              disabled={isLoading || isTesting || !uri || !dbName}
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

          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your credentials are encrypted and stored securely on your computer.
              <br />
              They will persist when you build the .exe file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MongoDBSetupPage;
