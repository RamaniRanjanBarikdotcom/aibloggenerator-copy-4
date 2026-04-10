import React from 'react';

function TablePagination({
  totalItems = 0,
  page = 1,
  perPage = 10,
  perPageOptions = [10, 20, 50, 100],
  onPageChange,
  onPerPageChange,
  className = '',
  labels = {},
}) {
  const labelText = (key, fallback) => labels[key] || fallback;
  const safePerPage = Math.max(1, Number(perPage) || 10);
  const totalPages = Math.max(1, Math.ceil((Number(totalItems) || 0) / safePerPage));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = totalItems > 0 ? (safePage - 1) * safePerPage + 1 : 0;
  const end = totalItems > 0 ? Math.min(totalItems, safePage * safePerPage) : 0;

  return (
    <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {labelText('showing', 'Showing')} {start}-{end} {labelText('of', 'of')} {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 dark:text-slate-400">{labelText('perPage', 'Per page')}</label>
        <select
          value={safePerPage}
          onChange={(event) => onPerPageChange?.(Math.max(1, Number(event.target.value) || 10))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          {perPageOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPageChange?.(safePage - 1)}
          disabled={safePage <= 1}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {labelText('prev', 'Prev')}
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {labelText('page', 'Page')} {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange?.(safePage + 1)}
          disabled={safePage >= totalPages}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {labelText('next', 'Next')}
        </button>
      </div>
    </div>
  );
}

export default TablePagination;
