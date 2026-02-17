import React, { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, Globe, TrendingUp, FileText, Eye, Calendar, BarChart3, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function PostsPage({ t }) {
  const [posts, setPosts] = useState([]);
  const [publishHistory, setPublishHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('any');
  const [platformFilter, setPlatformFilter] = useState('any');
  const [destinations, setDestinations] = useState([]);
  const [destinationId, setDestinationId] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [autoSynced, setAutoSynced] = useState(false);

  const loadPosts = async () => {
    setLoading(true);
    const result = await window.electronAPI.getRemotePosts({
      status: statusFilter === 'any' ? null : statusFilter,
      destinationId: destinationId || null,
    });
    if (result.success) {
      setPosts(result.posts || []);
      setError('');
    } else {
      setError(result.error || 'Failed to load posts');
    }
    setLoading(false);
  };

  const loadAnalytics = async () => {
      const result = await window.electronAPI.getPublishAnalytics({
        destinationId: destinationId || null,
      });
    if (result.success) {
      setAnalytics(result.analytics);
      const hasData =
        (result.analytics?.topTopics?.length || 0) > 0 ||
        (result.analytics?.topPosts?.length || 0) > 0;
      if (!hasData && destinationId && !autoSynced) {
        // attempt one automatic sync to pull data for charts
        await handleSync();
        setAutoSynced(true);
      }
    }
  };

  const loadPublishHistory = async () => {
    const result = await window.electronAPI.getPublishHistory({
      limit: 50,
      platform: platformFilter === 'any' ? null : platformFilter,
      status: statusFilter === 'any' ? null : statusFilter,
      destinationId: destinationId || null,
    });
    if (result.success) {
      setPublishHistory(result.history || []);
    }
  };

  const loadDestinations = async () => {
    const settingsResult = await window.electronAPI.getSettings();
    if (settingsResult.success) {
      const dests = Array.isArray(settingsResult.settings?.publishDestinations)
        ? settingsResult.settings.publishDestinations.filter((d) =>
            d.platform === 'wordpress' || d.platform === 'wordpress-token'
          )
        : [];
      setDestinations(dests);
      if (!destinationId && dests.length) {
        setDestinationId(dests[0].id);
      }
    }
  };

  const handleSync = async () => {
    if (!destinationId) {
      setError(t.publishDestinationRequired || 'Select a WordPress destination first.');
      return;
    }
    setSyncing(true);
    setSyncMessage('');
    setTestResult(null);
    const result = await window.electronAPI.syncRemotePosts({ destinationId });
    if (!result.success) {
      setError(result.error || 'Sync failed');
    } else {
      setError('');
      setSyncMessage(t.syncSuccess || `Synced ${result.count || 0} posts.`);
    }
    setSyncing(false);
    await Promise.all([loadPosts(), loadAnalytics(), loadPublishHistory()]);
  };

  const handleTestConnection = async () => {
    if (!destinationId) {
      setError(t.publishDestinationRequired || 'Select a WordPress destination first.');
      return;
    }
    setTesting(true);
    setError('');
    setSyncMessage('');
    setTestResult(null);
    const result = await window.electronAPI.testWordpressSync({ destinationId });
    setTestResult(result);
    setTesting(false);
  };

  useEffect(() => {
    loadDestinations();
    loadPosts();
    loadAnalytics();
    loadPublishHistory();
  }, [statusFilter, platformFilter, destinationId]);

  // Lightweight polling for near-real-time updates
  useEffect(() => {
    const id = setInterval(() => {
      if (activeTab === 'overview' || activeTab === 'posts') {
        loadAnalytics();
        loadPosts();
      }
      loadPublishHistory();
    }, 10000);
    return () => clearInterval(id);
  }, [activeTab, statusFilter, platformFilter, destinationId]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const SummaryCard = ({ icon: Icon, label, value, subValue, color = 'blue' }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg bg-${color}-50`}>
          <Icon className={`w-5 h-5 text-${color}-600`} />
        </div>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subValue && <p className="text-xs text-slate-400">{subValue}</p>}
        </div>
      </div>
    </div>
  );

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="max-w-7xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t.analyticsTitle || 'Publishing Analytics'}</h2>
          <p className="text-slate-600">{t.analyticsSubtitle || 'Track your published content performance'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <Globe className="h-4 w-4 text-blue-600" />
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="bg-transparent focus:outline-none"
            >
              <option value="">{t.publishSelectDestination || 'Select destination'}</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.baseUrl || d.id}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <AlertCircle className={`h-4 w-4 ${testing ? 'animate-pulse' : ''}`} />
            <span>{testing ? 'Testing...' : 'Test Connection'}</span>
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{t.syncLabel || 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* Test Results */}
      {testResult && (
        <div className={`mb-4 rounded-lg border p-4 ${testResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2 mb-3">
            {testResult.success ? (
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-600" />
            )}
            <span className={`font-semibold ${testResult.success ? 'text-emerald-700' : 'text-amber-700'}`}>
              {testResult.success ? 'All tests passed!' : 'Some tests failed'}
            </span>
            <button
              onClick={() => setTestResult(null)}
              className="ml-auto text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          {testResult.result?.destination && (
            <div className="mb-3 p-2 bg-white/50 rounded text-xs">
              <strong>Destination:</strong> {testResult.result.destination.name} ({testResult.result.destination.platform})
              <br />
              <strong>URL:</strong> {testResult.result.destination.baseUrl}
              <br />
              <strong>Auth:</strong> {testResult.result.destination.hasApiToken ? 'API Token' :
                testResult.result.destination.hasUsername && testResult.result.destination.hasAppPassword ? 'Username + App Password' : 'Unknown'}
              <br />
              <strong className={testResult.result.destination.apiTokenLength > 0 ? 'text-emerald-600' : 'text-red-600'}>
                Token in App: {testResult.result.destination.apiTokenLength > 0
                  ? `${testResult.result.destination.apiTokenFirst10}... (${testResult.result.destination.apiTokenLength} chars)`
                  : '❌ NO TOKEN CONFIGURED'}
              </strong>
            </div>
          )}

          {testResult.result?.tests && (
            <div className="space-y-2">
              {testResult.result.tests.map((test, idx) => (
                <div key={idx} className={`flex items-start gap-2 p-2 rounded text-xs ${test.success ? 'bg-emerald-100/50' : 'bg-red-100/50'}`}>
                  {test.success ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{test.name}</div>
                    <div className="text-slate-500 truncate">{test.endpoint}</div>
                    {test.success ? (
                      <div className="text-emerald-600">
                        Status: {test.status}
                        {test.count !== undefined && ` | Posts: ${test.count}`}
                        {test.siteName && ` | Site: ${test.siteName}`}

                        {/* Show authInfo if available (from Plugin Debug with auth test) */}
                        {test.authInfo && (
                          <div className="mt-2 p-3 bg-white border border-slate-200 rounded text-xs">
                            <div className="font-bold text-slate-700 mb-2">🔍 Authentication Diagnostic</div>
                            <div className="space-y-1">
                              <div>
                                <span className="font-medium">Auth Type (App):</span> {test.authInfo.authType}
                              </div>
                              <div>
                                <span className="font-medium">Auth Method (WP Detected):</span> {test.authInfo.authMethodDetected}
                              </div>
                              <div>
                                <span className="font-medium">Auth Header Present:</span> {test.authInfo.authHeaderPresent ? '✅ YES' : '❌ NO'}
                              </div>

                              {test.authInfo.authType === 'bearer' && (
                                <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-300">
                                  <div className="font-bold text-slate-700 mb-1">Token Comparison:</div>
                                  <div className="text-slate-600">
                                    Token in App: {test.authInfo.tokenLengthInApp} chars
                                  </div>
                                  <div className="text-slate-600">
                                    Token in WordPress: {test.authInfo.tokenLengthInWordPress} chars
                                  </div>
                                  <div className={test.authInfo.tokensMatch ? 'text-emerald-600 font-bold mt-1' : 'text-red-600 font-bold mt-1'}>
                                    ⚠️ Tokens Match: {test.authInfo.tokensMatch ? '✅ YES' : '❌ NO - THIS IS THE PROBLEM!'}
                                  </div>
                                </div>
                              )}

                              {test.authInfo.authType === 'basic' && (
                                <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-300">
                                  <div className="font-bold text-slate-700 mb-1">Username Comparison:</div>
                                  <div className="text-slate-600">
                                    Username in Request: {test.authInfo.usernameInRequest}
                                  </div>
                                  <div className="text-slate-600">
                                    Username Detected: {test.authInfo.usernameDetected}
                                  </div>
                                  <div className={test.authInfo.usernamesMatch ? 'text-emerald-600 font-bold mt-1' : 'text-red-600 font-bold mt-1'}>
                                    Usernames Match: {test.authInfo.usernamesMatch ? '✅ YES' : '❌ NO - THIS IS THE PROBLEM!'}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {test.data && !test.authInfo && (
                          <div className="mt-1 text-slate-600 space-y-0.5">
                            {test.data.token_configured !== undefined && (
                              <div>Token configured: {test.data.token_configured ? '✅ YES' : '❌ NO'}</div>
                            )}
                            {test.data.token_length !== undefined && (
                              <div>Token length: {test.data.token_length} chars</div>
                            )}
                            {test.data.authorization_header && (
                              <div>Auth header: {test.data.authorization_header}</div>
                            )}
                            {test.data.php_sapi && (
                              <div>PHP SAPI: {test.data.php_sapi}</div>
                            )}
                            {test.data.server_software && (
                              <div>Server: {test.data.server_software}</div>
                            )}
                            {test.data.token_first_10 && (
                              <div className="mt-2 p-2 bg-slate-100 rounded text-xs font-mono">
                                <div className="font-bold text-slate-700 mb-1">Token Comparison:</div>
                                <div className="text-slate-600">
                                  WP: {test.data.token_first_10}...{test.data.token_last_10} ({test.data.token_length} chars)
                                </div>
                                <div className="text-slate-600">
                                  App: {test.data.received_token_first_10}...{test.data.received_token_last_10} ({test.data.received_token_length} chars)
                                </div>
                                <div className={test.data.tokens_match ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                                  Match: {test.data.tokens_match ? '✅ YES' : '❌ NO'}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-red-600">
                        {test.status && `Status: ${test.status} | `}
                        {test.error}
                        {test.data?.message && ` - ${test.data.message}`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {testResult.error && !testResult.result && (
            <div className="text-red-600 text-sm">{testResult.error}</div>
          )}
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {syncMessage && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{syncMessage}</div>
      )}

      {/* Summary Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <SummaryCard
            icon={FileText}
            label={t.totalPublished || 'Published'}
            value={analytics.summary?.totalPublished || 0}
            color="emerald"
          />
          <SummaryCard
            icon={FileText}
            label={t.totalDrafts || 'Drafts'}
            value={analytics.summary?.totalDrafts || 0}
            color="amber"
          />
          <SummaryCard
            icon={Eye}
            label={t.totalViews || 'Total Views'}
            value={analytics.summary?.totalViews?.toLocaleString() || 0}
            color="blue"
          />
          <SummaryCard
            icon={TrendingUp}
            label={t.avgViews || 'Avg Views/Post'}
            value={analytics.summary?.avgViewsPerPost || 0}
            color="purple"
          />
          <SummaryCard
            icon={Clock}
            label={t.avgTime || 'Avg Time/Post'}
            value={formatDuration(analytics.summary?.avgTimePerPostSeconds || 0)}
            subValue={`${formatDuration(analytics.summary?.totalTimeSpentSeconds || 0)} total`}
            color="slate"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {['overview', 'history', 'posts'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'overview' && (t.tabOverview || 'Overview')}
            {tab === 'history' && (t.tabHistory || 'Publishing History')}
            {tab === 'posts' && (t.tabPosts || 'Remote Posts')}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && analytics && (
        <div className="space-y-6">
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Publishes by Month */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                {t.publishesByMonth || 'Publishes by Month'}
              </h3>
              {analytics.publishedByMonth?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={analytics.publishedByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Posts" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">No data yet</p>
              )}
            </div>

            {/* Platform Distribution */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" />
                {t.byPlatform || 'By Platform'}
              </h3>
              {analytics.byPlatform?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={analytics.byPlatform}
                      dataKey="count"
                      nameKey="platform"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ platform, count }) => `${platform}: ${count}`}
                    >
                      {analytics.byPlatform.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">No data yet</p>
              )}
            </div>
          </div>

          {/* Topics & Top Posts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Topics */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">
                {t.topTopics || 'Top Topics by Views'}
              </h3>
              {analytics.topTopics?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={analytics.topTopics} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="#64748b" />
                    <YAxis dataKey="topic" type="category" tick={{ fontSize: 11 }} width={100} stroke="#64748b" />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      formatter={(value, name) => [value.toLocaleString(), name === 'totalViews' ? 'Views' : name]}
                    />
                    <Bar dataKey="totalViews" fill="#10b981" radius={[0, 4, 4, 0]} name="Views" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">No topic data yet</p>
              )}
            </div>

            {/* Top Posts */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">
                {t.topPosts || 'Top Posts by Views'}
              </h3>
              {analytics.topPosts?.length > 0 ? (
                <ul className="space-y-3 max-h-[250px] overflow-y-auto">
                  {analytics.topPosts.map((post, idx) => (
                    <li key={post.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-slate-400 font-medium w-5">{idx + 1}.</span>
                        <span className="truncate text-slate-800">{post.title || 'Untitled'}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-semibold text-slate-900">{(post.views || 0).toLocaleString()}</span>
                        {post.url && (
                          <button
                            onClick={() => window.electronAPI.openExternal({ url: post.url })}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">No posts yet</p>
              )}
            </div>
          </div>

          {/* Recent Publishes */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              {t.recentPublishes || 'Recent Publishes'}
            </h3>
            {analytics.recentPublishes?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">Destination</th>
                      <th className="pb-2 font-medium">Platform</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentPublishes.map((pub) => (
                      <tr key={pub.id} className="border-b border-slate-50">
                        <td className="py-2 text-slate-800">{pub.destinationName || '—'}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                            {pub.platform}
                          </span>
                        </td>
                        <td className="py-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              pub.status === 'publish'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {pub.status}
                          </span>
                        </td>
                        <td className="py-2 text-slate-600">{formatDate(pub.publishedAt)}</td>
                        <td className="py-2">
                          {pub.publishedUrl && (
                            <button
                              onClick={() => window.electronAPI.openExternal({ url: pub.publishedUrl })}
                              className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" /> View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">No recent publishes</p>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="any">All Status</option>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
            </select>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="any">All Platforms</option>
              <option value="wordpress">WordPress</option>
              <option value="wordpress-token">WordPress (Token)</option>
              <option value="shopify">Shopify</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Blog Title</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {publishHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No publishing history yet
                    </td>
                  </tr>
                ) : (
                  publishHistory.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 truncate max-w-[200px]">
                          {item.blogTitle || 'Untitled'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.destinationName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                          {item.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'publish'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(item.publishedAt)}</td>
                      <td className="px-4 py-3">
                        {item.publishedUrl && (
                          <button
                            onClick={() => window.electronAPI.openExternal({ url: item.publishedUrl })}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="any">{t.statusAny || 'Any Status'}</option>
              <option value="publish">{t.statusPublish || 'Published'}</option>
              <option value="draft">{t.statusDraft || 'Draft'}</option>
              <option value="pending">{t.statusPending || 'Pending'}</option>
            </select>
          </div>

          <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
            <div className="col-span-4">{t.colTitle || 'Title'}</div>
            <div className="col-span-2">{t.colStatus || 'Status'}</div>
            <div className="col-span-2">{t.colPublished || 'Published'}</div>
            <div className="col-span-2">{t.colViews || 'Views'}</div>
            <div className="col-span-2 text-right">{t.colActions || 'Actions'}</div>
          </div>

          {loading ? (
            <div className="p-6 text-center text-slate-500">{t.loading || 'Loading...'}</div>
          ) : posts.length === 0 ? (
            <div className="p-6 text-center text-slate-500">{t.emptyPosts || 'No posts yet. Click Sync to fetch posts from WordPress.'}</div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-100 text-sm text-slate-800 hover:bg-slate-50"
              >
                <div className="col-span-4">
                  <p className="font-semibold truncate">{post.title || 'Untitled'}</p>
                  <p className="text-xs text-slate-500 truncate">{post.url}</p>
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      post.status === 'publish'
                        ? 'bg-emerald-50 text-emerald-700'
                        : post.status === 'draft'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {post.status}
                  </span>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-600">{formatDate(post.publishedAt)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm font-semibold">{post.views?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="col-span-2 text-right">
                  {post.url && (
                    <button
                      onClick={() => window.electronAPI.openExternal({ url: post.url })}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t.viewLabel || 'Open'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default PostsPage;
