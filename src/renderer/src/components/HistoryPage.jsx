import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, ExternalLink, X } from 'lucide-react';

function HistoryPage({
  history,
  summary,
  wpCounts,
  t,
  canExport,
  canBulkExport,
  canDelete,
  onViewBlog,
  onEditBlog,
  onDeleteBlog,
  onClearAll,
  onGenerateImage,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [bulkFormat, setBulkFormat] = useState('markdown');
  const [imageGeneratingId, setImageGeneratingId] = useState(null);
  const [publishStatuses, setPublishStatuses] = useState({});
  const [selectedBlogId, setSelectedBlogId] = useState(null);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsExportFormat, setDetailsExportFormat] = useState('markdown');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [removedImageUrls, setRemovedImageUrls] = useState([]);
  const [showImageDeleteConfirm, setShowImageDeleteConfirm] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(1);
  const summarySafe = summary || { totalCount: 0, totalCost: 0 };
  const wpCountsSafe = wpCounts || null;
  const normalizeImageGallery = (galleryValue, imageUrl) => {
    if (Array.isArray(galleryValue)) {
      const list = galleryValue.filter(Boolean);
      if (imageUrl && !list.includes(imageUrl)) list.unshift(imageUrl);
      return list;
    }
    if (typeof galleryValue === 'string' && galleryValue.trim()) {
      try {
        const parsed = JSON.parse(galleryValue);
        if (Array.isArray(parsed)) {
          const list = parsed.filter(Boolean);
          if (imageUrl && !list.includes(imageUrl)) list.unshift(imageUrl);
          return list;
        }
      } catch (error) {
        // ignore parse error
      }
    }
    return imageUrl ? [imageUrl] : [];
  };

  // Load publish status for all blogs
  useEffect(() => {
    const loadPublishStatuses = async () => {
      const statuses = {};
      for (const item of history) {
        const result = await window.electronAPI.getBlogPublishStatus({ blogId: item.id });
        if (result.success && result.history?.length > 0) {
          statuses[item.id] = result.history[0]; // Get most recent publish
        }
      }
      setPublishStatuses(statuses);
    };
    if (history.length > 0) {
      loadPublishStatuses();
    }
  }, [history]);

  const filteredHistory = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    return history.filter((item) => {
      const matchesSearch = item.title
        .toLowerCase()
        .includes(searchTerm.trim().toLowerCase());

      const itemDate = new Date(item.generatedAt);
      let matchesFilter = true;

      if (dateFilter === 'today') {
        matchesFilter = itemDate >= startOfToday;
      } else if (dateFilter === 'week') {
        matchesFilter = itemDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateFilter === 'month') {
        matchesFilter = itemDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (dateFilter === 'thisMonth') {
        matchesFilter = itemDate >= startOfMonth;
      } else if (dateFilter === 'year') {
        matchesFilter = itemDate >= startOfYear;
      }

      return matchesSearch && matchesFilter;
    });
  }, [history, searchTerm, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages);
  const pageStart = (safePageIndex - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pagedHistory = filteredHistory.slice(pageStart, pageEnd);

  useEffect(() => {
    setPageIndex(1);
  }, [searchTerm, dateFilter, pageSize]);

  const selectedPublishStatus = selectedBlogId ? publishStatuses[selectedBlogId] : null;
  const selectedGallery = useMemo(
    () => normalizeImageGallery(selectedBlog?.imageGallery || selectedBlog?.image_gallery, selectedBlog?.imageUrl),
    [selectedBlog]
  );

  const handleSelectHistoryImage = async (url) => {
    if (!selectedBlogId || !url || !selectedBlog) return;
    if (removedImageUrls.includes(url)) return;
    setSelectedBlog((prev) => (prev ? { ...prev, imageUrl: url, imageGallery: selectedGallery } : prev));
    const result = await window.electronAPI.updateBlog({
      blog: { ...selectedBlog, imageUrl: url, imageGallery: selectedGallery },
    });
    if (!result.success) {
      alert(result.error || 'Failed to update featured image');
    }
  };

  const openDetails = async (id) => {
    const fallback = history.find((entry) => entry.id === id) || null;
    setSelectedBlogId(id);
    setSelectedBlog(fallback);
    setDetailsExportFormat('markdown');
    setDetailsLoading(true);
    setRemovedImageUrls([]);
    const result = await window.electronAPI.getBlog({ id });
    if (result.success && result.blog) {
      setSelectedBlog(result.blog);
    }
    setDetailsLoading(false);
  };

  const closeDetails = () => {
    setSelectedBlogId(null);
    setSelectedBlog(null);
    setDetailsLoading(false);
    setDetailsExportFormat('markdown');
  };

  const toggleSelectedId = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleHistoryClick = (event, id) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      toggleSelectedId(id);
      return;
    }
    if (selectedIds.length) {
      setSelectedIds([]);
    }
    openDetails(id);
  };

  const handleDeleteSelected = async () => {
    if (!canDelete) return;
    const idsToDelete = selectedIds.length
      ? selectedIds
      : pendingDeleteId
      ? [pendingDeleteId]
      : [];
    if (!idsToDelete.length) return;
    setDeletingSelected(true);
    for (const id of idsToDelete) {
      await onDeleteBlog(id);
    }
    setDeletingSelected(false);
    setShowDeleteConfirm(false);
    setSelectedIds([]);
    if (pendingDeleteId) {
      closeDetails();
    }
    setPendingDeleteId(null);
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-2">{t.historyTitle}</h2>
      <p className="text-slate-600 mb-8">{t.generateSeo}</p>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase text-slate-500 tracking-wide">
              {t.historySearch}
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t.historySearchPlaceholder}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="md:w-64">
            <label className="text-xs font-semibold uppercase text-slate-500 tracking-wide">
              {t.historyFilter}
            </label>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="all">{t.historyFilterAll}</option>
              <option value="today">{t.historyFilterToday}</option>
              <option value="week">{t.historyFilterWeek}</option>
              <option value="month">{t.historyFilterMonth}</option>
              <option value="thisMonth">{t.historyFilterThisMonth}</option>
              <option value="year">{t.historyFilterYear}</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-3 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
              {t.historyTotalBlogs}: <strong>{summarySafe.totalCount || 0}</strong>
            </div>
            <div className="rounded-lg bg-purple-50 px-3 py-2 text-purple-700">
              {t.historyTotalCost}: <strong>${(summarySafe.totalCost || 0).toFixed(2)}</strong>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
              {t.historyShowing}: <strong>{filteredHistory.length}</strong>
            </div>
            {wpCountsSafe && (
              <>
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                  Published: <strong>{wpCountsSafe.published ?? '-'}</strong>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                  Draft: <strong>{wpCountsSafe.draft ?? '-'}</strong>
                </div>
                {wpCountsSafe.scheduled !== undefined && (
                  <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                    Scheduled: <strong>{wpCountsSafe.scheduled ?? '-'}</strong>
                  </div>
                )}
                {wpCountsSafe.pending !== undefined && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                    Pending: <strong>{wpCountsSafe.pending ?? '-'}</strong>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canBulkExport && (
              <div className="flex flex-wrap items-center gap-2">
              {selectedIds.length > 0 ? (
                <>
                  <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">
                    {selectedIds.length} selected
                  </span>
                  <label className="text-xs font-semibold uppercase text-slate-500 tracking-wide">
                    {t.exportFormat}
                  </label>
                  <select
                    value={bulkFormat}
                    onChange={(event) => setBulkFormat(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="markdown">Markdown</option>
                    <option value="html">HTML</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await window.electronAPI.exportBulk({
                        blogIds: selectedIds,
                        format: bulkFormat,
                      });
                      if (!result.success && result.error !== 'Export cancelled') {
                        alert(`Export failed: ${result.error}`);
                      }
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {t.exportBulk}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const rows = filteredHistory.filter((item) => selectedIds.includes(item.id));
                      const result = await window.electronAPI.exportHistoryCsv({
                        rows,
                      });
                      if (!result.success && result.error !== 'Export cancelled') {
                        alert(`Export failed: ${result.error}`);
                      }
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t.exportHistoryCsv}
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      {t.deleteLabel || 'Delete'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <label className="text-xs font-semibold uppercase text-slate-500 tracking-wide">
                    {t.exportFormat}
                  </label>
                  <select
                    value={bulkFormat}
                    onChange={(event) => setBulkFormat(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="markdown">Markdown</option>
                    <option value="html">HTML</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const ids = filteredHistory.map((item) => item.id);
                      const result = await window.electronAPI.exportBulk({
                        blogIds: ids,
                        format: bulkFormat,
                      });
                      if (!result.success && result.error !== 'Export cancelled') {
                        alert(`Export failed: ${result.error}`);
                      }
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {t.exportBulk}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await window.electronAPI.exportHistoryCsv({
                        rows: filteredHistory,
                      });
                      if (!result.success && result.error !== 'Export cancelled') {
                        alert(`Export failed: ${result.error}`);
                      }
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t.exportHistoryCsv}
                  </button>
                </>
              )}
              </div>
            )}
            <div className="ml-auto rounded-lg bg-white px-3 py-2 text-slate-600 border border-slate-200">
              {t.historyPerPage || 'Per page'}:{' '}
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="ml-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-6 py-8 text-center text-sm text-slate-500">
          {t.historyEmpty}
        </div>
      ) : (
        <div className="space-y-3">
          {pagedHistory.map((item) => {
            const publishStatus = publishStatuses[item.id];
            return (
            <button
              key={item.id}
              type="button"
              onClick={(event) => handleHistoryClick(event, item.id)}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                selectedIds.includes(item.id)
                  ? 'border-blue-400 bg-blue-50/60'
                  : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900 truncate">{item.title}</p>
                  {publishStatus && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {publishStatus.status === 'publish' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <CheckCircle className="w-3 h-3" />
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Clock className="w-3 h-3" />
                          Draft
                        </span>
                      )}
                      {publishStatus.publishedUrl && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.electronAPI.openExternal({ url: publishStatus.publishedUrl });
                          }}
                          className="text-blue-600 hover:text-blue-800 p-0.5"
                          title="View on site"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {new Date(item.generatedAt).toLocaleString()} • {item.wordCount} {t.historyWords}
                  {publishStatus && (
                    <span className="ml-2 text-slate-400">
                      • {publishStatus.destinationName} ({new Date(publishStatus.publishedAt).toLocaleDateString()})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {item.language}
                </span>
                <span className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                  {t.viewLabel}
                </span>
              </div>
              </div>
            </button>
            );
          })}
        </div>
      )}

      {filteredHistory.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <div>
            {t.historyPageLabel || 'Page'} {safePageIndex} {t.historyPageOf || 'of'} {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex(1)}
              disabled={safePageIndex === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t.historyFirst || 'First'}
            </button>
            <button
              type="button"
              onClick={() => setPageIndex((prev) => Math.max(1, prev - 1))}
              disabled={safePageIndex === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t.historyPrev || 'Prev'}
            </button>
            <button
              type="button"
              onClick={() => setPageIndex((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePageIndex === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t.historyNext || 'Next'}
            </button>
            <button
              type="button"
              onClick={() => setPageIndex(totalPages)}
              disabled={safePageIndex === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t.historyLast || 'Last'}
            </button>
          </div>
        </div>
      )}

      {selectedBlogId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {selectedBlog?.title || 'Blog'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedBlog?.generatedAt ? new Date(selectedBlog.generatedAt).toLocaleString() : ''}
                  {selectedBlog?.wordCount ? ` • ${selectedBlog.wordCount} ${t.historyWords}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetails}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {detailsLoading ? (
                <p className="text-sm text-slate-500">Loading blog details...</p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {selectedBlog?.language || '-'}
                    </span>
                    {selectedPublishStatus ? (
                      selectedPublishStatus.status === 'publish' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                          <CheckCircle className="w-3 h-3" />
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          <Clock className="w-3 h-3" />
                          Draft
                        </span>
                      )
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        Not published
                      </span>
                    )}
                    {selectedPublishStatus?.publishedUrl && (
                      <button
                        type="button"
                        onClick={() => window.electronAPI.openExternal({ url: selectedPublishStatus.publishedUrl })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open Live URL
                      </button>
                    )}
                  </div>

                  {selectedGallery.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-600">
                        {t.generatedImagesLabel || 'Generated images'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedGallery.map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => handleSelectHistoryImage(url)}
                            className={`relative h-20 w-28 overflow-hidden rounded-md border ${
                              url === selectedBlog?.imageUrl ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
                            } ${removedImageUrls.includes(url) ? 'opacity-40' : ''}`}
                            title={t.selectImageLabel || 'Use as featured image'}
                          >
                            <img src={url} alt="Generated" className="h-full w-full object-cover" />
                            {canDelete && (
                              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow">
                                <X
                                  className="h-3 w-3"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRemovedImageUrls((prev) =>
                                      prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url]
                                    );
                                  }}
                                />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {canDelete && removedImageUrls.length > 0 && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowImageDeleteConfirm(true)}
                            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            {t.saveChanges || 'Save changes'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                      No image available yet.
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        onViewBlog(selectedBlogId);
                        closeDetails();
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {t.viewLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onEditBlog(selectedBlogId);
                        closeDetails();
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {t.editLabel}
                    </button>
                    {onGenerateImage && (
                      <button
                        type="button"
                        onClick={async () => {
                          setImageGeneratingId(selectedBlogId);
                          await onGenerateImage(selectedBlogId);
                          const updated = await window.electronAPI.getBlog({ id: selectedBlogId });
                          if (updated.success && updated.blog) {
                            setSelectedBlog(updated.blog);
                          }
                          setImageGeneratingId(null);
                        }}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        {imageGeneratingId === selectedBlogId ? t.generatingImageLabel : t.generateImageLabel}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDeleteId(selectedBlogId);
                          setShowDeleteConfirm(true);
                        }}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        {t.deleteLabel}
                      </button>
                    )}
                  </div>

                  {canExport && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t.exportFormat}
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={detailsExportFormat}
                          onChange={(event) => setDetailsExportFormat(event.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          <option value="markdown">Markdown</option>
                          <option value="html">HTML</option>
                          <option value="pdf">PDF</option>
                          <option value="docx">DOCX</option>
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await window.electronAPI.exportBlog({
                              blogId: selectedBlogId,
                              formats: [detailsExportFormat],
                            });
                            if (!result.success && result.error !== 'Export cancelled') {
                              alert(`Export failed: ${result.error}`);
                            }
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {t.exportSingle}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && canDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {pendingDeleteId ? (t.deleteConfirmSingleTitle || 'Delete this blog') : (t.deleteConfirmTitle || 'Delete selected blogs')}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {pendingDeleteId
                ? (t.deleteConfirmSingle || 'Delete this blog? This action cannot be undone.')
                : (t.deleteConfirm || 'Delete selected blogs? This action cannot be undone.')}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setPendingDeleteId(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              >
                {t.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deletingSelected}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deletingSelected ? (t.deletingLabel || 'Deleting...') : (t.deleteLabel || 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageDeleteConfirm && canDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {t.deleteConfirmTitle || 'Delete selected images'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t.deleteConfirm ||
                'Delete selected images? This action cannot be undone.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImageDeleteConfirm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              >
                {t.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedBlog) return;
                  const nextGallery = selectedGallery.filter((url) => !removedImageUrls.includes(url));
                  const nextImageUrl = removedImageUrls.includes(selectedBlog.imageUrl)
                    ? nextGallery[0] || ''
                    : selectedBlog.imageUrl || nextGallery[0] || '';
                  const result = await window.electronAPI.updateBlog({
                    blog: { ...selectedBlog, imageGallery: nextGallery, imageUrl: nextImageUrl || null },
                  });
                  if (!result.success) {
                    alert(result.error || 'Failed to update images');
                    return;
                  }
                  setSelectedBlog((prev) =>
                    prev ? { ...prev, imageGallery: nextGallery, imageUrl: nextImageUrl || null } : prev
                  );
                  setRemovedImageUrls([]);
                  setShowImageDeleteConfirm(false);
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                {t.deleteLabel || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HistoryPage;
