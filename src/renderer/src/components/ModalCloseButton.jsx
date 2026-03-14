import React from 'react';
import { X } from 'lucide-react';

function ModalCloseButton({ onClick, label = 'Close', className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export default ModalCloseButton;
