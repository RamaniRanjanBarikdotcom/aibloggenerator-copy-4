import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

function parseToTags(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value !== 'string' || !value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function dedupe(tags) {
  const seen = new Set();
  const result = [];
  tags.forEach((tag) => {
    const key = tag.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  });
  return result;
}

export default function KeywordsInput({
  value,
  onChange,
  placeholder = '',
  className = '',
  inputId,
  disabled = false,
}) {
  const [tags, setTags] = useState(() => dedupe(parseToTags(value)));
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editingValue, setEditingValue] = useState('');
  const inputRef = useRef(null);
  const editRef = useRef(null);
  const lastEmitted = useRef('');

  useEffect(() => {
    const incoming = dedupe(parseToTags(value));
    const incomingStr = incoming.join(',');
    const currentStr = tags.join(',');
    if (incomingStr !== currentStr && incomingStr !== lastEmitted.current) {
      setTags(incoming);
    }
  }, [value]);

  useEffect(() => {
    if (editingIndex >= 0 && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingIndex]);

  const emit = (next) => {
    const deduped = dedupe(next);
    setTags(deduped);
    const out = deduped.join(', ');
    lastEmitted.current = deduped.join(',');
    if (typeof onChange === 'function') onChange(out);
  };

  const commitDraft = (raw) => {
    const parts = parseToTags(raw);
    if (parts.length === 0) {
      setDraft('');
      return;
    }
    emit([...tags, ...parts]);
    setDraft('');
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft(draft);
      } else if (e.key === 'Enter') {
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Backspace' && !draft && tags.length > 0) {
      e.preventDefault();
      const next = tags.slice(0, -1);
      const last = tags[tags.length - 1];
      emit(next);
      setDraft(last);
    }
  };

  const handlePaste = (e) => {
    if (disabled) return;
    const pasted = e.clipboardData?.getData('text') || '';
    if (pasted.includes(',') || pasted.includes('\n')) {
      e.preventDefault();
      const parts = pasted
        .split(/[,\n]/)
        .map((v) => v.trim())
        .filter(Boolean);
      if (parts.length) emit([...tags, ...parts]);
    }
  };

  const handleBlur = () => {
    if (draft.trim()) commitDraft(draft);
  };

  const removeAt = (idx) => {
    const next = tags.filter((_, i) => i !== idx);
    emit(next);
  };

  const startEdit = (idx) => {
    if (disabled) return;
    setEditingIndex(idx);
    setEditingValue(tags[idx]);
  };

  const commitEdit = () => {
    if (editingIndex < 0) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      removeAt(editingIndex);
    } else {
      const next = [...tags];
      next[editingIndex] = trimmed;
      emit(next);
    }
    setEditingIndex(-1);
    setEditingValue('');
  };

  const cancelEdit = () => {
    setEditingIndex(-1);
    setEditingValue('');
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const focusInput = () => {
    if (editingIndex < 0 && inputRef.current) inputRef.current.focus();
  };

  return (
    <div
      onClick={focusInput}
      className={`flex flex-wrap items-center gap-2 w-full px-3 py-2 min-h-[3rem] border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent dark:bg-slate-800 dark:border-slate-700 ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-text'
      } ${className}`}
    >
      {tags.map((tag, idx) =>
        editingIndex === idx ? (
          <input
            key={`edit-${idx}`}
            ref={editRef}
            type="text"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            className="px-2 py-1 text-sm rounded-full bg-blue-50 border border-blue-300 text-blue-900 outline-none dark:bg-slate-700 dark:border-blue-500 dark:text-slate-100"
            style={{ minWidth: `${Math.max(editingValue.length + 2, 4)}ch` }}
          />
        ) : (
          <span
            key={`tag-${idx}-${tag}`}
            className="group inline-flex items-center gap-1 pl-3 pr-1 py-1 text-sm rounded-full bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-600 transition-colors"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startEdit(idx);
              }}
              className="cursor-text bg-transparent border-0 p-0 m-0 text-inherit"
              title="Click to edit"
            >
              {tag}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(idx);
              }}
              className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-blue-300 dark:hover:bg-slate-500 transition-opacity"
              title="Remove"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={tags.length === 0 ? placeholder : ''}
        disabled={disabled}
        className="flex-1 min-w-[8rem] bg-transparent border-0 outline-none text-sm py-1 dark:text-slate-100 placeholder:text-slate-400"
      />
    </div>
  );
}
