import React, { useEffect, useMemo, useState } from 'react';

function SchedulerPage() {
  const [apiEnabled, setApiEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [jobForm, setJobForm] = useState({
    shopId: '',
    topic: '',
    keywords: '',
    runAt: '',
  });

  const [csvContent, setCsvContent] = useState('');
  const [defaultShopId, setDefaultShopId] = useState('');

  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => String(a.run_at || '').localeCompare(String(b.run_at || '')));
  }, [jobs]);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, jobsRes, logsRes] = await Promise.all([
        window.electronAPI.getServerApiConfig(),
        window.electronAPI.schedulerListJobs({ limit: 500 }),
        window.electronAPI.schedulerListLogs({ limit: 200 }),
      ]);

      setApiEnabled(!!cfg?.enabled);

      if (!jobsRes?.success) {
        throw new Error(jobsRes?.error || 'Failed to load scheduler jobs');
      }
      if (!logsRes?.success) {
        throw new Error(logsRes?.error || 'Failed to load scheduler logs');
      }

      setJobs(Array.isArray(jobsRes.jobs) ? jobsRes.jobs : []);
      setLogs(Array.isArray(logsRes.logs) ? logsRes.logs : []);
    } catch (e) {
      setError(e.message || 'Failed to load scheduler data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateJob = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const payload = {
      shopId: String(jobForm.shopId || '').trim(),
      topic: String(jobForm.topic || '').trim(),
      keywords: String(jobForm.keywords || '').trim(),
      runAt: String(jobForm.runAt || '').trim(),
      payload: {},
    };

    if (!payload.shopId || !payload.topic || !payload.runAt) {
      setError('Shop ID, topic, and run time are required.');
      return;
    }

    const result = await window.electronAPI.schedulerCreateJob({ job: payload });
    if (!result.success) {
      setError(result.error || 'Failed to create job');
      return;
    }

    setSuccess('Scheduler job created.');
    setJobForm({ shopId: '', topic: '', keywords: '', runAt: '' });
    await loadAll();
  };

  const handleDeleteJob = async (jobId) => {
    if (!jobId) return;
    setError('');
    const ok = window.confirm('Delete this scheduler job?');
    if (!ok) return;

    const result = await window.electronAPI.schedulerDeleteJob({ jobId });
    if (!result.success) {
      setError(result.error || 'Failed to delete job');
      return;
    }
    await loadAll();
  };

  const handleImportCsv = async () => {
    setError('');
    setSuccess('');
    if (!csvContent.trim()) {
      setError('CSV content is empty.');
      return;
    }

    const result = await window.electronAPI.schedulerImportCsv({
      csvContent,
      defaultShopId: String(defaultShopId || '').trim(),
    });

    if (!result.success) {
      setError(result.error || 'CSV import failed');
      return;
    }

    const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
    setSuccess(`Imported ${result.created || 0} row(s). ${errorCount > 0 ? `${errorCount} row(s) failed.` : ''}`);
    await loadAll();
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvContent(text);
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setError('');
    try {
      const result = await window.electronAPI.checkAppUpdate({
        currentVersion: '1.0.0',
        channel: 'stable',
      });
      if (!result.success) {
        throw new Error(result.error || 'Update check failed');
      }
      setUpdateInfo(result);
    } catch (e) {
      setError(e.message || 'Update check failed');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Scheduler</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Schedule blog generation/publishing tasks, bulk import via CSV, and review scheduler logs.
        </p>
        {!apiEnabled && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            Server API is not configured. Set APP_SERVER_API_BASE_URL.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={handleCreateJob} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create schedule</h3>
          <input
            value={jobForm.shopId}
            onChange={(e) => setJobForm((p) => ({ ...p, shopId: e.target.value }))}
            placeholder="Shop ID"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            value={jobForm.topic}
            onChange={(e) => setJobForm((p) => ({ ...p, topic: e.target.value }))}
            placeholder="Blog topic"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            value={jobForm.keywords}
            onChange={(e) => setJobForm((p) => ({ ...p, keywords: e.target.value }))}
            placeholder="Keywords"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            type="datetime-local"
            value={jobForm.runAt}
            onChange={(e) => setJobForm((p) => ({ ...p, runAt: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Job
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Bulk CSV import</h3>
          <input
            value={defaultShopId}
            onChange={(e) => setDefaultShopId(e.target.value)}
            placeholder="Default shop ID (optional)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvFile}
            className="w-full text-sm text-slate-700 dark:text-slate-200"
          />
          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            rows={8}
            placeholder="Paste CSV content here"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleImportCsv}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Import CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Scheduled jobs</h3>
          <button
            type="button"
            onClick={loadAll}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-3">Run at</th>
                <th className="py-2 pr-3">Shop</th>
                <th className="py-2 pr-3">Topic</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-3 text-slate-500" colSpan={5}>Loading...</td></tr>
              ) : sortedJobs.length === 0 ? (
                <tr><td className="py-3 text-slate-500" colSpan={5}>No jobs found.</td></tr>
              ) : (
                sortedJobs.map((job) => (
                  <tr key={job._id || job.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{String(job.run_at || '')}</td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{job.shop_id}</td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{job.topic}</td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{job.status}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteJob(job._id || job.id)}
                        className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Scheduler logs</h3>
            <button
              type="button"
              onClick={loadAll}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">No scheduler logs.</p>
            ) : (
              logs.map((log) => (
                <div key={log._id || log.id} className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">[{log.status}] {log.message}</p>
                  <p className="text-slate-500 dark:text-slate-400">{String(log.created_at || '')}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">App updates</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Check if a newer installer is available on the server.
          </p>
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {checkingUpdate ? 'Checking...' : 'Check for update'}
          </button>
          {updateInfo && (
            <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <p className="text-slate-700 dark:text-slate-200">Latest version: {updateInfo?.update?.version || '-'}</p>
              <p className="text-slate-700 dark:text-slate-200">Update available: {String(!!updateInfo?.isUpdateAvailable)}</p>
              {updateInfo?.update?.url && (
                <button
                  type="button"
                  onClick={() => window.electronAPI.openExternal({ url: updateInfo.update.url })}
                  className="mt-2 rounded-lg border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/20"
                >
                  Open download URL
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SchedulerPage;
