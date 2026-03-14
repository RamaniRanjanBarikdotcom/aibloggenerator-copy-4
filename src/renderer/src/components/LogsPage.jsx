import React, { useEffect, useMemo, useState } from 'react';
import ModalCloseButton from './ModalCloseButton';
import TablePagination from './TablePagination';

function LogsPage({ t, canDelete = false }) {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ total: 0, errors: 0, totalTokens: 0, totalCost: 0 });
  const [level, setLevel] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [loadError, setLoadError] = useState('');
  const categoryOptions = [
    { value: '', label: t.logsAllCategories || 'All categories' },
    { value: 'generation', label: t.logsCategoryGeneration || 'Generation' },
    { value: 'image', label: t.logsCategoryImage || 'Image' },
    { value: 'scheduler', label: t.logsCategoryScheduler || 'Scheduler' },
    { value: 'history', label: t.logsCategoryHistory || 'History' },
    { value: 'posts', label: t.logsCategoryPosts || 'Posts' },
    { value: 'settings', label: t.logsCategorySettings || 'Settings' },
    { value: 'auth', label: t.logsCategoryAuth || 'Auth' },
    { value: 'admin', label: t.logsCategoryAdmin || 'Admin' },
    { value: 'logs', label: t.logsCategoryLogs || 'Logs' },
    { value: 'notifications', label: t.logsCategoryNotifications || 'Notifications' },
  ];

  const loadLogs = async () => {
    setLoadError('');
    const result = await window.electronAPI.getLogs({
      level: level || null,
      category: category || null,
    });
    if (result.success) {
      setLogs(result.logs || []);
      return;
    }
    setLogs([]);
    setLoadError(result.error || 'Failed to load logs');
  };

  const loadStats = async () => {
    const result = await window.electronAPI.getLogsStats();
    if (result.success) {
      setStats(result.stats || stats);
    }
  };

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [level, category]);

  useEffect(() => {
    setPage(1);
  }, [level, category, perPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil((logs?.length || 0) / Math.max(1, Number(perPage) || 20)));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [logs, page, perPage]);

  const paginatedLogs = useMemo(() => {
    const safePerPage = Math.max(1, Number(perPage) || 20);
    const start = (Math.max(1, page) - 1) * safePerPage;
    return (logs || []).slice(start, start + safePerPage);
  }, [logs, page, perPage]);

  const handleClear = async () => {
    const result = await window.electronAPI.clearLogs();
    if (result.success) {
      loadLogs();
      loadStats();
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">{t.logsTitle}</h2>
        <p className="text-slate-600">{t.logsSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 border border-slate-200">
          <p className="text-xs text-slate-500">{t.logsTotal}</p>
          <p className="text-lg font-semibold text-slate-800">{stats.total}</p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-slate-200">
          <p className="text-xs text-slate-500">{t.logsErrors}</p>
          <p className="text-lg font-semibold text-slate-800">{stats.errors}</p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-slate-200">
          <p className="text-xs text-slate-500">{t.logsTokens}</p>
          <p className="text-lg font-semibold text-slate-800">{stats.totalTokens}</p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-slate-200">
          <p className="text-xs text-slate-500">{t.logsCost}</p>
          <p className="text-lg font-semibold text-slate-800">${(stats.totalCost || 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        {loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">{t.logsAllLevels}</option>
            <option value="info">Info</option>
            <option value="error">Error</option>
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              loadLogs();
              loadStats();
            }}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
            {t.logsRefresh}
          </button>
          {canDelete && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
            >
              {t.logsClear}
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-200">
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6">{t.logsEmpty}</p>
          ) : (
            paginatedLogs.map((log) => (
              <div key={log.id} className="py-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-slate-800 break-words">
                      [{log.level}] {log.category}
                    </p>
                    <p className="text-slate-600 break-words">{log.message}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      {log.username && (
                        <span>{t.logsUserLabel || 'User'}: {log.username}</span>
                      )}
                      {typeof log.tokensUsed === 'number' && (
                        <span>{t.logsTokens || 'Tokens'}: {log.tokensUsed}</span>
                      )}
                      {typeof log.cost === 'number' && (
                        <span>{t.logsCost || 'Cost'}: ${log.cost.toFixed(4)}</span>
                      )}
                      {log.blogId && (
                        <span>{t.logsBlogId || 'Blog ID'}: {log.blogId}</span>
                      )}
                    </div>
                    {log.details && (
                      <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-500 whitespace-pre-wrap break-words">
                        {log.details}
                      </pre>
                    )}
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-xs text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        {logs.length > 0 && (
          <TablePagination
            totalItems={logs.length}
            page={page}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        )}
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">
                  {t.logsClearConfirmTitle || 'Clear logs?'}
                </h4>
                <p className="text-sm text-slate-500 mt-1">
                  {t.logsClearConfirmBody || 'This will permanently delete all log entries.'}
                </p>
              </div>
              <ModalCloseButton onClick={() => setShowClearConfirm(false)} label={t.close || 'Close'} />
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
              >
                {t.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleClear();
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
              >
                {t.logsClearConfirmAction || 'Clear logs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LogsPage;
