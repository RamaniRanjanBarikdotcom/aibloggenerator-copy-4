import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { languageNames } from '../i18n';
import ModalCloseButton from './ModalCloseButton';
import TablePagination from './TablePagination';
import KeywordsInput from './KeywordsInput';

const STYLES = ['professional', 'conversational', 'educational', 'persuasive', 'storytelling'];
const TONES = ['friendly', 'formal', 'persuasive', 'casual'];
const PLATFORMS = ['generic', 'shopify', 'woocommerce', 'magento', 'custom'];
const STATUS_FILTERS = ['all', 'pending', 'paused', 'running', 'completed', 'failed', 'cancelled'];
const CSV_HEADERS = [
  'destination_id',
  'destination',
  'schedule_mode',
  'source_blog_id',
  'topic',
  'keywords',
  'focus_keyword',
  'run_at',
  'generate_image',
  'auto_post',
  'publish_status',
  'writing_style',
  'writing_tone',
  'target_word_count',
  'language',
  'use_product_context',
  'website_url',
  'scraper_platform',
  'categories',
  'platform',
  'payload_json',
];
const IMPORT_TEMPLATE_HEADERS = [
  'destination',
  'schedule_mode',
  'source_blog_id',
  'topic',
  'keywords',
  'focus_keyword',
  'categories',
  'run_at',
  'generate_image',
  'auto_post',
  'publish_status',
  'writing_style',
  'writing_tone',
  'target_word_count',
  'language',
  'use_product_context',
  'website_url',
  'scraper_platform',
];
const IMPORT_FIELD_OPTIONS = [
  { value: '', label: 'Not mapped' },
  { value: 'destination_id', label: 'Destination ID' },
  { value: 'destination', label: 'Destination name' },
  { value: 'shop_id', label: 'Shop ID (legacy)' },
  { value: 'platform', label: 'Platform (legacy)' },
  { value: 'schedule_mode', label: 'Schedule mode (generate/existing)' },
  { value: 'source_blog_id', label: 'Source blog ID' },
  { value: 'topic', label: 'Topic' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'focus_keyword', label: 'Focus keyword' },
  { value: 'run_at', label: 'Run at (DD-MM-YYYY HH:mm)' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Datetime' },
  { value: 'generate_image', label: 'Generate image' },
  { value: 'auto_post', label: 'Auto post' },
  { value: 'publish_status', label: 'Publish status' },
  { value: 'writing_style', label: 'Writing style' },
  { value: 'writing_tone', label: 'Writing tone' },
  { value: 'target_word_count', label: 'Target word count' },
  { value: 'language', label: 'Language' },
  { value: 'use_product_context', label: 'Use product context' },
  { value: 'website_url', label: 'Website URL' },
  { value: 'scraper_platform', label: 'Scraper platform' },
  { value: 'categories', label: 'Categories' },
  { value: 'payload_json', label: 'Payload JSON' },
];
const HEADER_ALIASES = {
  destination_id: 'destination_id',
  destinationid: 'destination_id',
  destination: 'destination',
  destination_name: 'destination',
  destinationname: 'destination',
  post_destination: 'destination',
  postdestination: 'destination',
  shop_id: 'shop_id',
  shopid: 'shop_id',
  shop: 'shop_id',
  platform: 'platform',
  schedule_mode: 'schedule_mode',
  schedulemode: 'schedule_mode',
  mode: 'schedule_mode',
  source_blog_id: 'source_blog_id',
  sourceblogid: 'source_blog_id',
  source_blog: 'source_blog_id',
  sourceblog: 'source_blog_id',
  topic: 'topic',
  title: 'topic',
  keywords: 'keywords',
  keyword: 'keywords',
  focus_keyword: 'focus_keyword',
  focuskeyword: 'focus_keyword',
  run_at: 'run_at',
  runat: 'run_at',
  schedule_at: 'run_at',
  scheduleat: 'run_at',
  datetime: 'datetime',
  date_time: 'datetime',
  date: 'date',
  time: 'time',
  generate_image: 'generate_image',
  generateimage: 'generate_image',
  auto_post: 'auto_post',
  autopost: 'auto_post',
  publish_status: 'publish_status',
  publishstatus: 'publish_status',
  writing_style: 'writing_style',
  writingstyle: 'writing_style',
  writing_tone: 'writing_tone',
  writingtone: 'writing_tone',
  target_word_count: 'target_word_count',
  targetwordcount: 'target_word_count',
  language: 'language',
  use_product_context: 'use_product_context',
  useproductcontext: 'use_product_context',
  website_url: 'website_url',
  websiteurl: 'website_url',
  store_url: 'website_url',
  storeurl: 'website_url',
  scraper_platform: 'scraper_platform',
  scraperplatform: 'scraper_platform',
  categories: 'categories',
  payload_json: 'payload_json',
  payloadjson: 'payload_json',
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200';

function HistoryBlogDropdown({
  value,
  options,
  loading,
  query,
  onQueryChange,
  onSelect,
  onRefresh,
  placeholder = 'Select a generated blog',
  searchPlaceholder = 'Search by title or keyword',
  refreshLabel = 'Refresh',
  loadingLabel = 'Loading blogs...',
  emptyLabel = 'No matching blogs found.',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = (options || []).find((item) => String(item?.id || '') === String(value || ''));

  useEffect(() => {
    const handleOutside = (event) => {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      >
        <span className="truncate">{selected?.title || placeholder}</span>
        <span className="ml-3 text-slate-400">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open ? (
        <div className="absolute z-[80] mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2">
            <input
              autoFocus
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-70 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              {refreshLabel}
            </button>
          </div>
          <div className="max-h-64 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
            {loading ? (
              <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{loadingLabel}</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</div>
            ) : (
              options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm transition ${
                    String(item.id) === String(value)
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-600/30 dark:text-blue-200'
                      : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.title}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, '0');

function formatCsvDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function toLocalDatetime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function formatDatetime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value || '-') : formatCsvDateTime(d.toISOString());
}

function toIso(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';

  const dmY = text.match(
    /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (dmY) {
    const day = Number(dmY[1]);
    const month = Number(dmY[2]) - 1;
    const year = Number(dmY[3]);
    const hour = Number(dmY[4] || 0);
    const minute = Number(dmY[5] || 0);
    const second = Number(dmY[6] || 0);
    const d = new Date(year, month, day, hour, minute, second);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const t = String(value || '').trim().toLowerCase();
  if (!t) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(t)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(t)) return false;
  return fallback;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectImportField(header) {
  const key = normalizeHeaderKey(header);
  if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
  if (IMPORT_FIELD_OPTIONS.some((opt) => opt.value === key)) return key;
  return '';
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values.map((v) => v.trim());
}

function stableNormalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableNormalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  try {
    return JSON.stringify(stableNormalize(value));
  } catch (_error) {
    return '';
  }
}

function buildScheduleSignature(item) {
  const categories = Array.isArray(item?.categories)
    ? item.categories.map((x) => String(x || '').trim()).filter(Boolean)
    : String(item?.categories || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
  const runAt = toIso(item?.runAt || item?.run_at || '');
  return [
    String(item?.status || 'pending').toLowerCase(),
    String(item?.shopId || item?.shop_id || '').trim(),
    String(item?.destinationId || item?.destination_id || '').trim(),
    String(item?.platform || '').trim(),
    String(item?.scheduleMode || item?.schedule_mode || 'generate').trim().toLowerCase(),
    String(item?.sourceBlogId || item?.source_blog_id || '').trim(),
    String(item?.topic || '').trim(),
    String(item?.keywords || '').trim(),
    runAt,
    String(!!item?.generateImage),
    String(!!item?.autoPost),
    String(item?.publishStatus || 'draft'),
    String(item?.writingStyle || ''),
    String(item?.writingTone || ''),
    String(Number(item?.targetWordCount || 0)),
    String(item?.language || ''),
    String(!!item?.useProductContext),
    String(item?.websiteUrl || '').trim(),
    String(item?.scraperPlatform || '').trim(),
    categories.join('|'),
    stableStringify(item?.payload || {}),
  ].join('||');
}

function normalizeJob(job) {
  let payload = {};
  if (job?.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)) {
    payload = job.payload;
  } else if (typeof job?.payload === 'string' && String(job.payload).trim()) {
    try {
      const parsed = JSON.parse(job.payload);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed;
      }
    } catch {
      payload = {};
    }
  }
  if (payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)) {
    payload = { ...payload.payload, ...payload };
  }
  const sourceBlogId = String(
    job?.source_blog_id ||
      job?.sourceBlogId ||
      payload.source_blog_id ||
      payload.sourceBlogId ||
      payload.source_blog ||
      payload.sourceBlog ||
      ''
  ).trim();
  const scheduleModeRaw = String(
    job?.schedule_mode ||
      job?.scheduleMode ||
      payload.schedule_mode ||
      payload.scheduleMode ||
      payload.mode ||
      ''
  )
    .trim()
    .toLowerCase();
  const scheduleMode = scheduleModeRaw === 'existing' || sourceBlogId ? 'existing' : 'generate';
  const categories = Array.isArray(payload.categories)
    ? payload.categories
    : String(payload.categories || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

  return {
    id: job?._id || job?.id || '',
    shopId: job?.shop_id || '',
    destinationId: job?.destination_id || payload.destination_id || '',
    platform: job?.platform || payload.platform || '',
    scheduleMode,
    sourceBlogId,
    topic: job?.topic || '',
    keywords: job?.keywords || '',
    focusKeyword: job?.focus_keyword || payload.focus_keyword || '',
    runAt: job?.run_at || '',
    completedAt: job?.completed_at || payload?.completed_at || job?.completedAt || '',
    updatedAt: job?.updated_at || payload?.updated_at || job?.updatedAt || '',
    status: job?.status || 'pending',
    generateImage: parseBool(job?.generate_image ?? payload.generate_image, true),
    autoPost: parseBool(job?.auto_post ?? payload.auto_post, false),
    publishStatus:
      String(job?.publish_status || payload.publish_status || 'draft').toLowerCase() === 'publish'
        ? 'publish'
        : 'draft',
    writingStyle: payload.writing_style || 'professional',
    writingTone: payload.writing_tone || 'friendly',
    targetWordCount: Number(payload.target_word_count || 2500),
    language: payload.language || 'English',
    useProductContext: parseBool(payload.use_product_context, false),
    websiteUrl: payload.website_url || '',
    scraperPlatform: payload.scraper_platform || 'generic',
    categories,
    payload,
  };
}

function defaultForm() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  d.setSeconds(0, 0);
  return {
    scheduleMode: 'generate',
    sourceBlogId: '',
    topic: '',
    keywords: '',
    focusKeyword: '',
    categories: '',
    destinationId: '',
    runAt: toLocalDatetime(d.toISOString()),
    generateImage: true,
    autoPost: true,
    publishStatus: 'draft',
    writingStyle: 'professional',
    writingTone: 'friendly',
    targetWordCount: 2500,
    language: 'English',
    useProductContext: false,
    websiteUrl: '',
    scraperPlatform: 'generic',
  };
}

function formFromJob(job) {
  return {
    scheduleMode: String(job?.scheduleMode || 'generate').toLowerCase() === 'existing' ? 'existing' : 'generate',
    sourceBlogId: job?.sourceBlogId || '',
    topic: job?.topic || '',
    keywords: job?.keywords || '',
    focusKeyword: job?.focusKeyword || '',
    categories: Array.isArray(job?.categories) ? job.categories.join(', ') : '',
    destinationId: job?.destinationId || '',
    runAt: toLocalDatetime(job?.runAt || ''),
    generateImage: !!job?.generateImage,
    autoPost: !!job?.autoPost,
    publishStatus: String(job?.publishStatus || 'draft').toLowerCase() === 'publish' ? 'publish' : 'draft',
    writingStyle: job?.writingStyle || 'professional',
    writingTone: job?.writingTone || 'friendly',
    targetWordCount: Number(job?.targetWordCount || 2500),
    language: job?.language || 'English',
    useProductContext: !!job?.useProductContext,
    websiteUrl: job?.websiteUrl || '',
    scraperPlatform: job?.scraperPlatform || 'generic',
  };
}

function SchedulerPage({ t }) {
  const tr = useCallback(
    (key, fallback, vars) => {
      let text = (t && t[key]) || fallback;
      if (!vars) return text;
      Object.entries(vars).forEach(([token, value]) => {
        text = text.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value));
      });
      return text;
    },
    [t]
  );
  const jobTableTabs = useMemo(
    () => [
      { value: 'scheduled', label: tr('schedulerTabScheduled', 'Scheduled jobs') },
      { value: 'completed', label: tr('schedulerTabCompleted', 'Completed jobs') },
    ],
    [tr]
  );
  const scheduleModes = useMemo(
    () => [
      { value: 'generate', label: tr('schedulerModeGenerate', 'Generate new blog') },
      { value: 'existing', label: tr('schedulerModeExisting', 'Use existing history blog') },
    ],
    [tr]
  );
  const importFieldLabels = useMemo(
    () => ({
      '': tr('schedulerFieldNotMapped', 'Not mapped'),
      destination_id: tr('schedulerFieldDestinationId', 'Destination ID'),
      destination: tr('schedulerFieldDestinationName', 'Destination name'),
      shop_id: tr('schedulerFieldShopId', 'Shop ID (legacy)'),
      platform: tr('schedulerFieldPlatformLegacy', 'Platform (legacy)'),
      schedule_mode: tr('schedulerFieldScheduleMode', 'Schedule mode (generate/existing)'),
      source_blog_id: tr('schedulerFieldSourceBlogId', 'Source blog ID'),
      topic: tr('schedulerFieldTopic', 'Topic'),
      keywords: tr('schedulerFieldKeywords', 'Keywords'),
      focus_keyword: tr('schedulerFieldFocusKeyword', 'Focus keyword'),
      run_at: tr('schedulerFieldRunAt', 'Run at (DD-MM-YYYY HH:mm)'),
      date: tr('schedulerFieldDate', 'Date'),
      time: tr('schedulerFieldTime', 'Time'),
      datetime: tr('schedulerFieldDatetime', 'Datetime'),
      generate_image: tr('schedulerFieldGenerateImage', 'Generate image'),
      auto_post: tr('schedulerFieldAutoPost', 'Auto post'),
      publish_status: tr('schedulerFieldPublishStatus', 'Publish status'),
      writing_style: tr('schedulerFieldWritingStyle', 'Writing style'),
      writing_tone: tr('schedulerFieldWritingTone', 'Writing tone'),
      target_word_count: tr('schedulerFieldTargetWordCount', 'Target word count'),
      language: tr('schedulerFieldLanguage', 'Language'),
      use_product_context: tr('schedulerFieldUseProductContext', 'Use product context'),
      website_url: tr('schedulerFieldWebsiteUrl', 'Website URL'),
      scraper_platform: tr('schedulerFieldScraperPlatform', 'Scraper platform'),
      categories: tr('schedulerFieldCategories', 'Categories'),
      payload_json: tr('schedulerFieldPayloadJson', 'Payload JSON'),
    }),
    [tr]
  );
  const importFieldOptions = useMemo(
    () =>
      IMPORT_FIELD_OPTIONS.map((option) => ({
        ...option,
        label: importFieldLabels[option.value] || option.label,
      })),
    [importFieldLabels]
  );
  const styleLabels = useMemo(
    () => ({
      professional: tr('schedulerStyleProfessional', 'professional'),
      conversational: tr('schedulerStyleConversational', 'conversational'),
      educational: tr('schedulerStyleEducational', 'educational'),
      persuasive: tr('schedulerStylePersuasive', 'persuasive'),
      storytelling: tr('schedulerStyleStorytelling', 'storytelling'),
    }),
    [tr]
  );
  const toneLabels = useMemo(
    () => ({
      friendly: tr('schedulerToneFriendly', 'friendly'),
      formal: tr('schedulerToneFormal', 'formal'),
      persuasive: tr('schedulerTonePersuasive', 'persuasive'),
      casual: tr('schedulerToneCasual', 'casual'),
    }),
    [tr]
  );
  const platformLabels = useMemo(
    () => ({
      generic: tr('schedulerPlatformGeneric', 'generic'),
      shopify: tr('schedulerPlatformShopify', 'shopify'),
      woocommerce: tr('schedulerPlatformWoo', 'woocommerce'),
      magento: tr('schedulerPlatformMagento', 'magento'),
      custom: tr('schedulerPlatformCustom', 'custom'),
    }),
    [tr]
  );
  const statusLabels = useMemo(
    () => ({
      all: tr('schedulerStatusAll', 'All status'),
      pending: tr('schedulerStatusPending', 'pending'),
      paused: tr('schedulerStatusPaused', 'paused'),
      running: tr('schedulerStatusRunning', 'running'),
      completed: tr('schedulerStatusCompleted', 'completed'),
      failed: tr('schedulerStatusFailed', 'failed'),
      cancelled: tr('schedulerStatusCancelled', 'cancelled'),
    }),
    [tr]
  );
  const [apiEnabled, setApiEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState(defaultForm());

  const [statusFilter, setStatusFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [jobTableTab, setJobTableTab] = useState('scheduled');
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsPerPage, setJobsPerPage] = useState(10);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTargetId, setEditTargetId] = useState('');
  const [editForm, setEditForm] = useState(defaultForm());
  const [historyBlogOptions, setHistoryBlogOptions] = useState([]);
  const [historyBlogLoading, setHistoryBlogLoading] = useState(false);
  const [createHistoryBlogQuery, setCreateHistoryBlogQuery] = useState('');
  const [editHistoryBlogQuery, setEditHistoryBlogQuery] = useState('');
  const historyBlogCacheRef = useRef(new Map());
  const historyBlogLoadingRef = useRef(false);

  const [csvContent, setCsvContent] = useState('');
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvColumnMappings, setCsvColumnMappings] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const sortedJobs = useMemo(
    () => [...jobs].map(normalizeJob).sort((a, b) => String(a.runAt).localeCompare(String(b.runAt))),
    [jobs]
  );

  const destinationMap = useMemo(() => new Map((destinations || []).map((d) => [d.id, d])), [destinations]);
  const historyBlogMap = useMemo(
    () => new Map((historyBlogOptions || []).map((item) => [String(item.id || ''), item])),
    [historyBlogOptions]
  );
  const createFilteredHistoryBlogOptions = useMemo(() => {
    const q = String(createHistoryBlogQuery || '').trim().toLowerCase();
    if (!q) return historyBlogOptions;
    return historyBlogOptions.filter((item) => {
      const keywords = Array.isArray(item?.keywords) ? item.keywords.join(', ') : String(item?.keywords || '');
      return `${item?.title || ''} ${keywords}`.toLowerCase().includes(q);
    });
  }, [historyBlogOptions, createHistoryBlogQuery]);
  const editFilteredHistoryBlogOptions = useMemo(() => {
    const q = String(editHistoryBlogQuery || '').trim().toLowerCase();
    if (!q) return historyBlogOptions;
    return historyBlogOptions.filter((item) => {
      const keywords = Array.isArray(item?.keywords) ? item.keywords.join(', ') : String(item?.keywords || '');
      return `${item?.title || ''} ${keywords}`.toLowerCase().includes(q);
    });
  }, [historyBlogOptions, editHistoryBlogQuery]);

  const filteredJobs = useMemo(() => {
    const needle = String(searchTerm || '').trim().toLowerCase();
    return sortedJobs.filter((job) => {
      const byStatus = statusFilter === 'all' || job.status === statusFilter;
      const byDestination = !destinationFilter || job.destinationId === destinationFilter;
      const byPlatform = !platformFilter || job.platform === platformFilter;
      const destinationName = String(destinationMap.get(job.destinationId)?.name || '').toLowerCase();
      const bySearch =
        !needle ||
        [
          job.topic,
          job.keywords,
          job.focusKeyword,
          job.destinationId,
          destinationName,
          job.platform,
          job.status,
        ].some((value) => String(value || '').toLowerCase().includes(needle));
      return byStatus && byDestination && byPlatform && bySearch;
    });
  }, [sortedJobs, statusFilter, destinationFilter, platformFilter, searchTerm, destinationMap]);

  const scheduledJobs = useMemo(
    () => filteredJobs.filter((job) => String(job.status || '').toLowerCase() !== 'completed'),
    [filteredJobs]
  );

  const completedJobs = useMemo(
    () =>
      filteredJobs
        .filter((job) => String(job.status || '').toLowerCase() === 'completed')
        .sort((a, b) => {
          const aTime = Date.parse(a.completedAt || a.updatedAt || a.runAt || '') || 0;
          const bTime = Date.parse(b.completedAt || b.updatedAt || b.runAt || '') || 0;
          return bTime - aTime;
        }),
    [filteredJobs]
  );

  const visibleJobs = jobTableTab === 'completed' ? completedJobs : scheduledJobs;
  const countLabel =
    jobTableTab === 'completed'
      ? tr('schedulerCountCompleted', '{count} completed', { count: visibleJobs.length })
      : tr('schedulerCountScheduled', '{count} scheduled', { count: visibleJobs.length });
  const timeColumnLabel =
    jobTableTab === 'completed'
      ? tr('schedulerCompletedOn', 'Completed on')
      : tr('schedulerRunAt', 'Run at');
  const totalJobPages = Math.max(1, Math.ceil(visibleJobs.length / jobsPerPage));
  const pagedVisibleJobs = useMemo(() => {
    const startIndex = (jobsPage - 1) * jobsPerPage;
    return visibleJobs.slice(startIndex, startIndex + jobsPerPage);
  }, [visibleJobs, jobsPage, jobsPerPage]);

  const languages = useMemo(() => {
    return Array.from(new Set([...Object.values(languageNames || {}), 'English'])).sort();
  }, []);

  useEffect(() => {
    setJobsPage(1);
  }, [statusFilter, destinationFilter, platformFilter, searchTerm, jobTableTab]);

  useEffect(() => {
    if (jobsPage > totalJobPages) {
      setJobsPage(totalJobPages);
    }
  }, [jobsPage, totalJobPages]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, destinationsRes, jobsRes] = await Promise.all([
        window.electronAPI.getServerApiConfig(),
        window.electronAPI.getPublishDestinations(),
        window.electronAPI.schedulerListJobs({ limit: 1000 }),
      ]);
      setApiEnabled(!!cfg?.enabled);
      if (!destinationsRes?.success) {
        throw new Error(destinationsRes?.error || tr('schedulerErrorLoadDestinations', 'Failed to load destinations'));
      }
      if (!jobsRes?.success) {
        throw new Error(jobsRes?.error || tr('schedulerErrorLoadJobs', 'Failed to load scheduler jobs'));
      }
      setDestinations(Array.isArray(destinationsRes.destinations) ? destinationsRes.destinations : []);
      setJobs(Array.isArray(jobsRes.jobs) ? jobsRes.jobs : []);
    } catch (e) {
      setError(e.message || tr('schedulerErrorLoadData', 'Failed to load scheduler data'));
    } finally {
      setLoading(false);
    }
  }, []);

  const mapHistoryRowsToOptions = useCallback((items = []) => {
    return (Array.isArray(items) ? items : [])
      .map((item) => ({
        id: String(item?.id || item?._id || ''),
        title: String(item?.title || item?.topic || '').trim(),
        keywords: item?.keywords || '',
        categories: Array.isArray(item?.categories)
          ? item.categories
          : String(item?.categories || '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
        generatedAt: item?.generatedAt || item?.created_at || item?.createdAt || '',
      }))
      .filter((item) => item.id && item.title);
  }, []);

  const loadHistoryBlogOptions = useCallback(async ({ search = '', force = false, limit = 1000 } = {}) => {
    if (historyBlogLoadingRef.current && !force) return;
    const normalizedSearch = String(search || '').trim();
    const cacheKey = normalizedSearch.toLowerCase();
    if (!force && historyBlogCacheRef.current.has(cacheKey)) {
      setHistoryBlogOptions(historyBlogCacheRef.current.get(cacheKey));
      return;
    }
    historyBlogLoadingRef.current = true;
    setHistoryBlogLoading(true);
    try {
      const response = await window.electronAPI.schedulerListHistoryBlogs({
        limit: Math.max(20, Math.min(5000, Number(limit) || 1000)),
        search: normalizedSearch,
      });
      if (!response?.success) {
        throw new Error(response?.error || tr('schedulerErrorLoadHistory', 'Failed to load history blogs'));
      }
      let items = mapHistoryRowsToOptions(response?.blogs || []);

      historyBlogCacheRef.current.set(cacheKey, items);
      setHistoryBlogOptions(items);
    } catch (e) {
      try {
        const fallback = await window.electronAPI.getHistory({ limit: 1000 });
        if (!fallback?.success) {
          throw new Error(fallback?.error || tr('schedulerErrorLoadHistory', 'Failed to load history blogs'));
        }
        const mappedItems = mapHistoryRowsToOptions(fallback?.history || []);
        const fallbackFiltered = normalizedSearch
          ? mappedItems.filter((item) =>
              `${item.title} ${Array.isArray(item.keywords) ? item.keywords.join(', ') : item.keywords || ''}`
                .toLowerCase()
                .includes(normalizedSearch.toLowerCase())
            )
          : mappedItems;
        historyBlogCacheRef.current.set(cacheKey, fallbackFiltered);
        setHistoryBlogOptions(
          fallbackFiltered
        );
      } catch (fallbackErr) {
        setError(fallbackErr.message || e.message || tr('schedulerErrorLoadHistory', 'Failed to load history blogs'));
      }
    } finally {
      historyBlogLoadingRef.current = false;
      setHistoryBlogLoading(false);
    }
  }, [mapHistoryRowsToOptions, tr]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (showCreateModal && form.scheduleMode === 'existing') {
      loadHistoryBlogOptions();
    }
  }, [showCreateModal, form.scheduleMode, loadHistoryBlogOptions]);

  useEffect(() => {
    if (showEditModal && editForm.scheduleMode === 'existing') {
      loadHistoryBlogOptions();
    }
  }, [showEditModal, editForm.scheduleMode, loadHistoryBlogOptions]);

  useEffect(() => {
    if (!(showCreateModal && form.scheduleMode === 'existing')) return;
    const q = String(createHistoryBlogQuery || '').trim();
    const timer = setTimeout(() => {
      if (q.length >= 2 && historyBlogOptions.length === 0) {
        loadHistoryBlogOptions({ search: q, force: false, limit: 1000 });
      } else if (q.length === 0) {
        loadHistoryBlogOptions({ search: '', force: false, limit: 1000 });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [createHistoryBlogQuery, showCreateModal, form.scheduleMode, loadHistoryBlogOptions, historyBlogOptions.length]);

  useEffect(() => {
    if (!(showEditModal && editForm.scheduleMode === 'existing')) return;
    const q = String(editHistoryBlogQuery || '').trim();
    const timer = setTimeout(() => {
      if (q.length >= 2 && historyBlogOptions.length === 0) {
        loadHistoryBlogOptions({ search: q, force: false, limit: 1000 });
      } else if (q.length === 0) {
        loadHistoryBlogOptions({ search: '', force: false, limit: 1000 });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [editHistoryBlogQuery, showEditModal, editForm.scheduleMode, loadHistoryBlogOptions, historyBlogOptions.length]);

  useEffect(() => {
    if (!showImportModal) return;
    const lines = String(csvContent || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setCsvHeaders([]);
      setCsvColumnMappings({});
      return;
    }
    const headers = parseCsvLine(lines[0]).map((h) => String(h || '').trim()).filter(Boolean);
    setCsvHeaders(headers);
    setCsvColumnMappings((prev) => {
      const next = {};
      headers.forEach((header) => {
        next[header] = Object.prototype.hasOwnProperty.call(prev, header)
          ? prev[header]
          : detectImportField(header);
      });
      return next;
    });
  }, [csvContent, showImportModal]);

  const onDestinationChange = (destinationId) => {
    setForm((prev) => ({
      ...prev,
      destinationId,
    }));
  };

  const onCreateModeChange = (mode) => {
    if (mode !== 'existing') {
      setCreateHistoryBlogQuery('');
    }
    setForm((prev) => ({
      ...prev,
      scheduleMode: mode,
      sourceBlogId: mode === 'existing' ? prev.sourceBlogId : '',
    }));
  };

  const onEditModeChange = (mode) => {
    if (mode !== 'existing') {
      setEditHistoryBlogQuery('');
    }
    setEditForm((prev) => ({
      ...prev,
      scheduleMode: mode,
      sourceBlogId: mode === 'existing' ? prev.sourceBlogId : '',
    }));
  };

  const onCreateSourceBlogChange = (sourceBlogId) => {
    const blog = historyBlogMap.get(String(sourceBlogId || ''));
    const mappedKeywords = Array.isArray(blog?.keywords) ? blog.keywords.join(', ') : String(blog?.keywords || '');
    setForm((prev) => ({
      ...prev,
      sourceBlogId,
      topic: blog?.title || prev.topic,
      keywords: mappedKeywords || prev.keywords,
      categories:
        Array.isArray(blog?.categories) && blog.categories.length > 0
          ? blog.categories.join(', ')
          : prev.categories,
    }));
  };

  const onEditSourceBlogChange = (sourceBlogId) => {
    const blog = historyBlogMap.get(String(sourceBlogId || ''));
    const mappedKeywords = Array.isArray(blog?.keywords) ? blog.keywords.join(', ') : String(blog?.keywords || '');
    setEditForm((prev) => ({
      ...prev,
      sourceBlogId,
      topic: blog?.title || prev.topic,
      keywords: mappedKeywords || prev.keywords,
      categories:
        Array.isArray(blog?.categories) && blog.categories.length > 0
          ? blog.categories.join(', ')
          : prev.categories,
    }));
  };

  const onEditDestinationChange = (destinationId) => {
    setEditForm((prev) => ({
      ...prev,
      destinationId,
    }));
  };

  const buildPayload = (sourceForm = form) => {
    const scheduleMode = String(sourceForm.scheduleMode || 'generate').toLowerCase() === 'existing' ? 'existing' : 'generate';
    const sourceBlogId = String(sourceForm.sourceBlogId || '').trim();
    const sourceBlog = sourceBlogId ? historyBlogMap.get(sourceBlogId) : null;
    const topic =
      scheduleMode === 'existing'
        ? String(sourceBlog?.title || sourceForm.topic || '').trim()
        : String(sourceForm.topic || '').trim();
    const runAt = toIso(sourceForm.runAt);
    const shopId = String(sourceForm.destinationId || 'default').trim();
    const selectedDestination = destinations.find((item) => item.id === sourceForm.destinationId);
    const resolvedPlatform = String(selectedDestination?.platform || '').trim();

    if (scheduleMode === 'existing' && !sourceBlogId) {
      throw new Error(tr('schedulerErrorSelectHistory', 'Select a history blog to schedule.'));
    }
    if (scheduleMode === 'existing' && !sourceBlog && !String(sourceForm.topic || '').trim()) {
      throw new Error(tr('schedulerErrorHistoryNotFound', 'Selected history blog was not found.'));
    }
    if (!topic) throw new Error(tr('schedulerErrorTopicRequired', 'Topic is required.'));
    if (!runAt) throw new Error(tr('schedulerErrorRunAtRequired', 'Valid run date/time is required.'));
    if (sourceForm.autoPost && !String(sourceForm.destinationId || '').trim()) {
      throw new Error(tr('schedulerErrorDestinationRequired', 'Destination is required when auto post is enabled.'));
    }

    const sourceCategories = Array.isArray(sourceBlog?.categories) ? sourceBlog.categories : [];
    const categoriesInput =
      scheduleMode === 'existing' && !String(sourceForm.categories || '').trim()
        ? sourceCategories.join(', ')
        : String(sourceForm.categories || '');
    const categories = categoriesInput
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const sourceKeywords =
      Array.isArray(sourceBlog?.keywords) ? sourceBlog.keywords.join(', ') : String(sourceBlog?.keywords || '').trim();
    const keywords =
      scheduleMode === 'existing' && !String(sourceForm.keywords || '').trim()
        ? sourceKeywords
        : String(sourceForm.keywords || '').trim();
    const focusKeyword = String(sourceForm.focusKeyword || '').trim();

    const payloadCore = {
      destination_id: String(sourceForm.destinationId || '').trim(),
      platform: resolvedPlatform,
      focus_keyword: focusKeyword,
      publish_status: sourceForm.publishStatus === 'publish' ? 'publish' : 'draft',
      generate_image: !!sourceForm.generateImage,
      auto_post: !!sourceForm.autoPost,
      writing_style: String(sourceForm.writingStyle || 'professional'),
      writing_tone: String(sourceForm.writingTone || 'friendly'),
      target_word_count: Math.min(10000, Math.max(300, Number(sourceForm.targetWordCount) || 2500)),
      language: String(sourceForm.language || 'English'),
      use_product_context: !!sourceForm.useProductContext,
      website_url: String(sourceForm.websiteUrl || '').trim(),
      scraper_platform: String(sourceForm.scraperPlatform || 'generic'),
      categories,
      schedule_mode: scheduleMode,
      source_blog_id: sourceBlogId,
    };

    return {
      shopId,
      destinationId: payloadCore.destination_id,
      platform: payloadCore.platform,
      schedule_mode: scheduleMode,
      source_blog_id: sourceBlogId,
      scheduleMode,
      sourceBlogId,
      topic,
      keywords,
      focusKeyword: payloadCore.focus_keyword,
      runAt,
      generateImage: payloadCore.generate_image,
      autoPost: payloadCore.auto_post,
      publishStatus: payloadCore.publish_status,
      writingStyle: payloadCore.writing_style,
      writingTone: payloadCore.writing_tone,
      targetWordCount: payloadCore.target_word_count,
      language: payloadCore.language,
      useProductContext: payloadCore.use_product_context,
      websiteUrl: payloadCore.website_url,
      scraperPlatform: payloadCore.scraper_platform,
      categories,
      payload: payloadCore,
    };
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    clearMessages();
    try {
      const payload = buildPayload();
      const result = await window.electronAPI.schedulerCreateJob({ job: payload });
      if (!result?.success) throw new Error(result?.error || tr('schedulerErrorCreateFailed', 'Failed to create scheduler job'));
      setSuccess(tr('schedulerCreateSuccess', 'Scheduler job created.'));
      setForm(defaultForm());
      setShowCreateModal(false);
      await loadAll();
    } catch (err) {
      setError(err.message || tr('schedulerErrorCreateFailed', 'Failed to create scheduler job'));
    }
  };

  const openEditModal = (job) => {
    setEditTargetId(job.id || '');
    setEditForm(formFromJob(job));
    setEditHistoryBlogQuery('');
    setShowEditModal(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    clearMessages();
    if (!editTargetId) {
      setError(tr('schedulerErrorNoEdit', 'No schedule selected for edit.'));
      return;
    }
    try {
      const payload = buildPayload(editForm);
      const updates = {
        topic: payload.topic,
        keywords: payload.keywords,
        runAt: payload.runAt,
        payload: payload.payload,
      };
      const result = await window.electronAPI.schedulerUpdateJob({
        jobId: editTargetId,
        updates,
      });
      if (!result?.success) throw new Error(result?.error || tr('schedulerErrorUpdateFailed', 'Failed to update schedule'));
      setSuccess(tr('schedulerUpdateSuccess', 'Schedule updated.'));
      setShowEditModal(false);
      setEditTargetId('');
      await loadAll();
    } catch (err) {
      setError(err.message || tr('schedulerErrorUpdateFailed', 'Failed to update schedule'));
    }
  };

  const handlePauseToggle = async (job) => {
    clearMessages();
    const nextStatus = job.status === 'paused' ? 'pending' : 'paused';
    const result = await window.electronAPI.schedulerUpdateJob({
      jobId: job.id,
      updates: { status: nextStatus },
    });
    if (!result?.success) {
      setError(result?.error || tr('schedulerErrorUpdateStatus', 'Failed to update schedule status'));
      return;
    }
    setSuccess(nextStatus === 'paused' ? tr('schedulerPaused', 'Schedule paused.') : tr('schedulerResumed', 'Schedule resumed.'));
    await loadAll();
  };

  const handleRetryFailed = async (job) => {
    clearMessages();
    const result = await window.electronAPI.schedulerUpdateJob({
      jobId: job.id,
      updates: { status: 'pending' },
    });
    if (!result?.success) {
      setError(result?.error || tr('schedulerErrorRetry', 'Failed to retry schedule'));
      return;
    }
    setSuccess(tr('schedulerRetryQueued', 'Schedule moved to pending. It will retry shortly.'));
    await loadAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    clearMessages();
    const result = await window.electronAPI.schedulerDeleteJob({ jobId: deleteTarget.id });
    if (!result?.success) {
      setError(result?.error || tr('schedulerErrorDeleteFailed', 'Failed to delete schedule'));
      return;
    }
    setDeleteTarget(null);
    setSuccess(tr('schedulerDeleteSuccess', 'Schedule deleted.'));
    await loadAll();
  };

  const handleImportCsv = async () => {
    clearMessages();
    if (!csvContent.trim()) {
      setError(tr('schedulerErrorCsvEmpty', 'CSV content is empty.'));
      return;
    }

    const lines = String(csvContent || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setError(tr('schedulerErrorCsvNoRows', 'CSV has no usable rows.'));
      return;
    }

    const headers = parseCsvLine(lines[0]).map((h) => String(h || '').trim());
    const mappedFields = headers
      .map((h) => csvColumnMappings[h] || detectImportField(h))
      .filter(Boolean);
    const hasTopicField = mappedFields.includes('topic') || mappedFields.includes('source_blog_id');
    const hasRunField = mappedFields.some((f) => f === 'run_at' || f === 'datetime' || f === 'date');
    if (!hasTopicField || !hasRunField) {
      setError(
        tr(
          'schedulerErrorCsvMapFirst',
          'Map CSV columns first. Required fields: topic or source_blog_id, and run_at (or date/datetime).'
        )
      );
      return;
    }
    const rows = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((h, idx) => {
        const mappedField = csvColumnMappings[h] || detectImportField(h);
        if (!mappedField) return;
        row[mappedField] = values[idx] || '';
      });
      return row;
    });

    let created = 0;
    let skippedDuplicates = 0;
    const errors = [];
    const existingPendingSignatures = new Set(
      sortedJobs
        .filter((job) => String(job.status || '').toLowerCase() === 'pending')
        .map((job) => buildScheduleSignature({ ...job, status: 'pending' }))
    );

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const destinationByName = String(row.destination || '').trim();
      const matchedDestination = destinationByName
        ? destinations.find((d) => String(d.name || '').toLowerCase() === destinationByName.toLowerCase())
        : null;
      const destinationId = String(row.destination_id || row.destinationid || matchedDestination?.id || '').trim();
      const selectedDestination = destinationId ? destinations.find((d) => d.id === destinationId) : matchedDestination;
      const shopId = String(destinationId || row.shop_id || row.shopid || 'default').trim();
      const scheduleMode =
        String(row.schedule_mode || row.schedulemode || 'generate').trim().toLowerCase() === 'existing'
          ? 'existing'
          : 'generate';
      const sourceBlogId = String(row.source_blog_id || row.sourceblogid || '').trim();
      const fallbackSourceBlog = sourceBlogId ? historyBlogMap.get(sourceBlogId) : null;
      const topic = String(row.topic || fallbackSourceBlog?.title || '').trim();
      const keywords = String(row.keywords || '').trim();
      const focusKeyword = String(row.focus_keyword || row.focuskeyword || '').trim();
      const platform = String(selectedDestination?.platform || row.platform || '').trim();
      const generateImage = parseBool(row.generate_image || row.generateimage, true);
      const autoPost = parseBool(row.auto_post || row.autopost, false);
      const publishStatus = String(row.publish_status || row.publishstatus || 'draft').toLowerCase() === 'publish' ? 'publish' : 'draft';
      const writingStyle = String(row.writing_style || row.writingstyle || 'professional').trim();
      const writingTone = String(row.writing_tone || row.writingtone || 'friendly').trim();
      const targetWordCount = Math.min(10000, Math.max(300, Number(row.target_word_count || row.targetwordcount || 2500) || 2500));
      const language = String(row.language || 'English').trim();
      const useProductContext = parseBool(row.use_product_context || row.useproductcontext, false);
      const websiteUrl = String(row.website_url || row.websiteurl || '').trim();
      const scraperPlatform = String(row.scraper_platform || row.scraperplatform || 'generic').trim();
      const categories = String(row.categories || '')
        .split(/[,;]+/)
        .map((x) => x.trim())
        .filter(Boolean);

      let runAtRaw = String(row.run_at || row.datetime || '').trim();
      if (!runAtRaw && row.date) {
        runAtRaw = `${String(row.date).trim()} ${String(row.time || '00:00').trim()}`.trim();
      }
      const runAt = toIso(runAtRaw);

      if ((!topic && scheduleMode !== 'existing') || !runAt) {
        errors.push(tr('schedulerErrorCsvRowMissing', 'Row {row}: Missing topic/run_at', { row: i + 2 }));
        continue;
      }
      if (scheduleMode === 'existing' && !sourceBlogId) {
        errors.push(
          tr('schedulerErrorCsvRowSource', 'Row {row}: source_blog_id is required when schedule_mode is existing', {
            row: i + 2,
          })
        );
        continue;
      }
      if (autoPost && !destinationId) {
        errors.push(
          tr('schedulerErrorCsvRowDestination', 'Row {row}: Destination is required when auto_post is true', {
            row: i + 2,
          })
        );
        continue;
      }

      let payloadJson = {};
      if (row.payload_json) {
        try {
          const parsed = JSON.parse(row.payload_json);
          if (parsed && typeof parsed === 'object') payloadJson = parsed;
        } catch (_error) {
          // ignore invalid payload_json
        }
      }

      const payload = {
        destination_id: destinationId,
        platform,
        focus_keyword: focusKeyword,
        publish_status: publishStatus,
        generate_image: generateImage,
        auto_post: autoPost,
        writing_style: writingStyle,
        writing_tone: writingTone,
        target_word_count: targetWordCount,
        language,
        use_product_context: useProductContext,
        website_url: websiteUrl,
        scraper_platform: scraperPlatform,
        categories,
        schedule_mode: scheduleMode,
        source_blog_id: sourceBlogId,
        ...payloadJson,
      };

      const jobPayload = {
        shopId,
        destinationId,
        platform,
        scheduleMode,
        sourceBlogId,
        topic: topic || `History blog ${sourceBlogId}`,
        keywords,
        focusKeyword,
        runAt,
        generateImage,
        autoPost,
        publishStatus,
        writingStyle,
        writingTone,
        targetWordCount,
        language,
        useProductContext,
        websiteUrl,
        scraperPlatform,
        categories,
        payload,
      };

      const signature = buildScheduleSignature({ ...jobPayload, status: 'pending' });
      if (existingPendingSignatures.has(signature)) {
        skippedDuplicates += 1;
        continue;
      }

      const result = await window.electronAPI.schedulerCreateJob({ job: jobPayload });
      if (!result?.success) {
        errors.push(
          tr('schedulerErrorCsvRowCreate', 'Row {row}: {error}', {
            row: i + 2,
            error: result?.error || tr('schedulerErrorCsvCreateFailed', 'Create failed'),
          })
        );
      } else {
        created += 1;
        existingPendingSignatures.add(signature);
      }
    }

    const msg =
      tr('schedulerImportSummary', 'Imported {count} schedule(s).', { count: created }) +
      (skippedDuplicates
        ? ' ' +
          tr('schedulerImportSkipped', 'Skipped {count} duplicate pending row(s).', {
            count: skippedDuplicates,
          })
        : '') +
      (errors.length
        ? ' ' + tr('schedulerImportFailed', '{count} row(s) failed.', { count: errors.length })
        : '');

    if (errors.length) {
      setError(msg + ' ' + tr('schedulerImportCheckLogs', 'Check Logs menu for row details.'));
    } else {
      setSuccess(msg);
      setShowImportModal(false);
    }
    await loadAll();
  };

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvContent(await file.text());
  };

  const downloadCsv = (name, rows) => {
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const rows = visibleJobs.map((job) => [
      job.destinationId,
      destinationMap.get(job.destinationId)?.name || '',
      job.scheduleMode || 'generate',
      job.sourceBlogId || '',
      job.topic,
      job.keywords,
      job.focusKeyword,
      formatCsvDateTime(job.runAt),
      job.generateImage ? 'true' : 'false',
      job.autoPost ? 'true' : 'false',
      job.publishStatus,
      job.writingStyle,
      job.writingTone,
      job.targetWordCount,
      job.language,
      job.useProductContext ? 'true' : 'false',
      job.websiteUrl,
      job.scraperPlatform,
      Array.isArray(job.categories) ? job.categories.join(',') : '',
      job.platform,
      JSON.stringify(job.payload || {}),
    ].map(csvEscape));
    const fileName = jobTableTab === 'completed' ? 'scheduler-completed-jobs.csv' : 'scheduler-jobs.csv';
    downloadCsv(fileName, [CSV_HEADERS.map(csvEscape), ...rows]);
  };

  const handleTemplateCsv = () => {
    const sampleDate = new Date();
    sampleDate.setMinutes(sampleDate.getMinutes() + 30);
    const sampleRow = {
      destination: destinations[0]?.name || 'Your destination name',
      schedule_mode: 'generate',
      source_blog_id: '',
      topic: 'Best leather care tips for premium furniture',
      keywords: 'leather care, premium furniture',
      focus_keyword: 'leather care tips',
      categories: 'guides,tips',
      run_at: formatCsvDateTime(sampleDate.toISOString()),
      generate_image: 'true',
      auto_post: 'false',
      publish_status: 'draft',
      writing_style: 'professional',
      writing_tone: 'friendly',
      target_word_count: '2200',
      language: 'English',
      use_product_context: 'false',
      website_url: 'https://example.com/products/leather-care-kit',
      scraper_platform: 'generic',
    };
    const sample = IMPORT_TEMPLATE_HEADERS.map((header) => sampleRow[header] ?? '').map(csvEscape);
    downloadCsv('scheduler-template.csv', [IMPORT_TEMPLATE_HEADERS.map(csvEscape), sample]);
  };

  const statusClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'completed') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (s === 'failed') return 'bg-red-500/15 text-red-400 border-red-500/30';
    if (s === 'paused') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    if (s === 'running') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    if (s === 'cancelled') return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
  };

  const isTerminalStatus = (status) => ['completed', 'failed', 'cancelled'].includes(String(status || '').toLowerCase());

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {tr('schedulerTitle', 'Scheduler')}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {tr(
            'schedulerSubtitle',
            'Build full generation schedules with auto-post settings and CSV import/export.'
          )}
        </p>
        {!apiEnabled && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            {tr('schedulerApiWarning', 'Server API is not configured. Set APP_SERVER_API_BASE_URL.')}
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[260px] flex-1">
            <input
              className={inputClass}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={tr('schedulerSearchPlaceholder', 'Search schedules by topic, keyword, destination...')}
            />
          </div>
          <div className="w-full sm:w-[180px]">
            <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{statusLabels[s] || s}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-[220px]">
            <select className={inputClass} value={destinationFilter} onChange={(e) => setDestinationFilter(e.target.value)}>
              <option value="">{tr('schedulerAllDestinations', 'All destinations')}</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>{d.name || d.id}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-[180px]">
            <select className={inputClass} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
              <option value="">{tr('schedulerAllPlatforms', 'All platforms')}</option>
              {[...new Set(destinations.map((d) => d.platform).filter(Boolean))].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-70 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="inline-flex items-center gap-1">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {tr('schedulerRefresh', 'Refresh')}
              </span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {tr('schedulerExportSchedules', 'Export schedules')}
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="whitespace-nowrap rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
            >
              {tr('schedulerImport', '+ Import')}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(defaultForm());
                setCreateHistoryBlogQuery('');
                setShowCreateModal(true);
              }}
              className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              {tr('schedulerCreateSchedule', '+ Create schedule')}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-700/80 dark:bg-slate-800/70">
            {jobTableTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setJobTableTab(tab.value)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  jobTableTab === tab.value
                    ? 'border border-blue-300 bg-white text-slate-900 shadow-sm dark:border-blue-500/40 dark:bg-blue-900/40 dark:text-white dark:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]'
                    : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{countLabel}</span>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-3">{timeColumnLabel}</th>
                <th className="py-2 pr-3">{tr('schedulerTopic', 'Topic')}</th>
                <th className="py-2 pr-3">{tr('schedulerDestination', 'Destination')}</th>
                <th className="py-2 pr-3">{tr('schedulerStatus', 'Status')}</th>
                <th className="py-2 pr-3">{tr('schedulerPost', 'Post')}</th>
                <th className="py-2 pr-3">{tr('schedulerImage', 'Image')}</th>
                <th className="py-2">{tr('schedulerAction', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>
                    {tr('schedulerLoading', 'Loading...')}
                  </td>
                </tr>
              ) : null}
              {!loading && visibleJobs.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>
                    {jobTableTab === 'completed'
                      ? tr('schedulerNoCompleted', 'No completed jobs found.')
                      : tr('schedulerNoScheduled', 'No scheduler jobs found.')}
                  </td>
                </tr>
              ) : null}
              {!loading && pagedVisibleJobs.map((job) => {
                const d = destinationMap.get(job.destinationId);
                const canPauseResume = !isTerminalStatus(job.status);
                const isFailed = String(job.status || '').toLowerCase() === 'failed';
                const primaryTime =
                  jobTableTab === 'completed' ? job.completedAt || job.updatedAt || job.runAt : job.runAt;
                const publishLabel =
                  job.publishStatus === 'publish'
                    ? tr('schedulerPublishStatusPublish', 'publish')
                    : tr('schedulerPublishStatusDraft', 'draft');
                return (
                  <tr key={job.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{formatDatetime(primaryTime)}</td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">
                      <div className="font-medium">{job.topic}</div>
                    </td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200"><div>{d?.name || job.destinationId || '-'}</div><div className="text-xs text-slate-500 dark:text-slate-400">{job.platform || d?.platform || '-'}</div></td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(job.status)}`}>
                        {statusLabels[String(job.status || '').toLowerCase()] || job.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">
                      {job.autoPost
                        ? `${tr('schedulerPostAuto', 'Auto')} (${publishLabel})`
                        : tr('schedulerPostGenerateOnly', 'Generate only')}
                    </td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">
                      {job.generateImage ? tr('schedulerYes', 'Yes') : tr('schedulerNo', 'No')}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => openEditModal(job)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                          {tr('schedulerEdit', 'Edit')}
                        </button>
                        {isFailed ? (
                          <button
                            type="button"
                            onClick={() => handleRetryFailed(job)}
                            className="rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                          >
                            {tr('schedulerRetry', 'Retry')}
                          </button>
                        ) : canPauseResume ? (
                          <button type="button" onClick={() => handlePauseToggle(job)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                            {String(job.status || '').toLowerCase() === 'paused'
                              ? tr('schedulerResume', 'Resume')
                              : tr('schedulerPause', 'Pause')}
                          </button>
                        ) : (
                          <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400">
                            {tr('schedulerDone', 'Done')}
                          </span>
                        )}
                        <button type="button" onClick={() => setDeleteTarget(job)} className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20">
                          {tr('schedulerDelete', 'Delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination
          totalItems={visibleJobs.length}
          page={jobsPage}
          perPage={jobsPerPage}
          perPageOptions={[10, 20, 50, 100]}
          labels={{
            showing: tr('schedulerPaginationShowing', 'Showing'),
            of: tr('schedulerPaginationOf', 'of'),
            perPage: tr('schedulerPaginationPerPage', 'Per page'),
            prev: tr('schedulerPaginationPrev', 'Prev'),
            page: tr('schedulerPaginationPage', 'Page'),
            next: tr('schedulerPaginationNext', 'Next'),
          }}
          onPageChange={setJobsPage}
          onPerPageChange={(value) => {
            setJobsPerPage(value);
            setJobsPage(1);
          }}
        />
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {tr('schedulerCreateTitle', 'Create schedule')}
              </h3>
              <ModalCloseButton onClick={() => setShowCreateModal(false)} label={tr('schedulerClose', 'Close')} />
            </div>

            <form onSubmit={handleCreate} className="mt-4">
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {tr('schedulerScheduleType', 'Schedule type')}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {scheduleModes.map((mode) => (
                      <button
                        key={`create-mode-${mode.value}`}
                        type="button"
                        onClick={() => onCreateModeChange(mode.value)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          form.scheduleMode === mode.value
                            ? 'border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-600/20 dark:text-blue-300'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  {form.scheduleMode === 'existing' ? (
                    <>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepSelectExisting', '1. Select existing history blog')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
                        <div className="md:col-span-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <label className={`${labelClass} mb-0`}>{tr('schedulerHistoryBlog', 'History blog')}</label>
                            <button
                              type="button"
                              onClick={() => loadHistoryBlogOptions({ search: '', force: true, limit: 1000 })}
                              disabled={historyBlogLoading}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-70 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              title={tr('schedulerHistoryRefresh', 'Refresh')}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${historyBlogLoading ? 'animate-spin' : ''}`} />
                              {tr('schedulerHistoryRefresh', 'Refresh')}
                            </button>
                          </div>
                          <HistoryBlogDropdown
                            value={form.sourceBlogId}
                            options={createFilteredHistoryBlogOptions}
                            loading={historyBlogLoading}
                            query={createHistoryBlogQuery}
                            onQueryChange={setCreateHistoryBlogQuery}
                            onSelect={onCreateSourceBlogChange}
                            onRefresh={() => loadHistoryBlogOptions({ search: '', force: true, limit: 1000 })}
                            placeholder={tr('schedulerHistoryBlogPlaceholder', 'Select a generated blog')}
                            searchPlaceholder={tr('schedulerHistorySearchPlaceholder', 'Search by title or keyword')}
                            refreshLabel={tr('schedulerHistoryRefresh', 'Refresh')}
                            loadingLabel={tr('schedulerHistoryDropdownLoading', 'Loading blogs...')}
                            emptyLabel={tr('schedulerHistoryDropdownEmpty', 'No matching blogs found.')}
                          />
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {historyBlogLoading
                              ? tr('schedulerHistoryLoading', 'Loading history blogs...')
                              : tr('schedulerBlogsFound', '{count} blog(s) found', {
                                  count: createFilteredHistoryBlogOptions.length,
                                })}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepBlogContent', '1. Blog content')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label className={labelClass}>{tr('schedulerBlogTopic', 'Blog topic')}</label>
                          <input className={inputClass} value={form.topic} onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))} />
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerKeywords', 'Keywords')}</label>
                          <KeywordsInput value={form.keywords} onChange={(val) => setForm((p) => ({ ...p, keywords: val }))} />
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerFocusKeyword', 'Focus keyword')}</label>
                          <input className={inputClass} value={form.focusKeyword} onChange={(e) => setForm((p) => ({ ...p, focusKeyword: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelClass}>{tr('schedulerCategories', 'Categories (comma separated)')}</label>
                          <input className={inputClass} value={form.categories} onChange={(e) => setForm((p) => ({ ...p, categories: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {tr('schedulerStepDestination', '2. Destination and run time')}
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelClass}>{tr('schedulerPostDestinationLabel', 'Post destination')}</label>
                      <select className={inputClass} value={form.destinationId} onChange={(e) => onDestinationChange(e.target.value)}>
                        <option value="">{tr('schedulerSelectDestination', 'Select destination')}</option>
                        {destinations.map((d) => (
                          <option key={d.id} value={d.id}>{d.name || d.id} ({d.platform || 'unknown'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>{tr('schedulerRunDateTime', 'Run date & time')}</label>
                      <input className={inputClass} type="datetime-local" value={form.runAt} onChange={(e) => setForm((p) => ({ ...p, runAt: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {form.scheduleMode !== 'existing' ? (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepWriting', '3. Writing setup')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <div>
                          <label className={labelClass}>{tr('schedulerLanguage', 'Language')}</label>
                          <select className={inputClass} value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}>{languages.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerStyle', 'Style')}</label>
                          <select className={inputClass} value={form.writingStyle} onChange={(e) => setForm((p) => ({ ...p, writingStyle: e.target.value }))}>{STYLES.map((x) => <option key={x} value={x}>{styleLabels[x] || x}</option>)}</select>
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerTone', 'Tone')}</label>
                          <select className={inputClass} value={form.writingTone} onChange={(e) => setForm((p) => ({ ...p, writingTone: e.target.value }))}>{TONES.map((x) => <option key={x} value={x}>{toneLabels[x] || x}</option>)}</select>
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerTargetWords', 'Target words')}</label>
                          <input className={inputClass} type="number" min={300} max={10000} value={form.targetWordCount} onChange={(e) => setForm((p) => ({ ...p, targetWordCount: e.target.value }))} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepProduct', '4. Product context and scrape')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelClass}>{tr('schedulerStoreUrlOptional', 'Store URL (optional)')}</label>
                          <input className={inputClass} value={form.websiteUrl} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))} />
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerScraperPlatform', 'Scraper platform')}</label>
                          <select className={inputClass} value={form.scraperPlatform} onChange={(e) => setForm((p) => ({ ...p, scraperPlatform: e.target.value }))}>{PLATFORMS.map((x) => <option key={x} value={x}>{platformLabels[x] || x}</option>)}</select>
                        </div>
                        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"><input type="checkbox" checked={form.useProductContext} onChange={(e) => setForm((p) => ({ ...p, useProductContext: e.target.checked }))} />{tr('schedulerUseProductDb', 'Use product DB')}</label>
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {form.scheduleMode === 'existing'
                      ? tr('schedulerStepOutputActions3', '3. Output actions')
                      : tr('schedulerStepOutputActions5', '5. Output actions')}
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"><input type="checkbox" checked={form.generateImage} onChange={(e) => setForm((p) => ({ ...p, generateImage: e.target.checked }))} />{tr('schedulerGenerateImage', 'Generate image')}</label>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"><input type="checkbox" checked={form.autoPost} onChange={(e) => setForm((p) => ({ ...p, autoPost: e.target.checked }))} />{tr('schedulerAutoPost', 'Auto post')}</label>
                    {form.autoPost ? (
                      <select className={inputClass} value={form.publishStatus} onChange={(e) => setForm((p) => ({ ...p, publishStatus: e.target.value }))}>
                        <option value="draft">{tr('schedulerPostAsDraft', 'Post as draft')}</option>
                        <option value="publish">{tr('schedulerPublishLive', 'Publish live')}</option>
                      </select>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setForm(defaultForm())} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">{tr('schedulerReset', 'Reset')}</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{tr('schedulerAddSchedule', 'Add schedule')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {tr('schedulerEditTitle', 'Edit schedule')}
              </h3>
              <ModalCloseButton onClick={() => setShowEditModal(false)} label={tr('schedulerClose', 'Close')} />
            </div>

            <form onSubmit={handleEditSave} className="mt-4">
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {tr('schedulerScheduleType', 'Schedule type')}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {scheduleModes.map((mode) => (
                      <button
                        key={`edit-mode-${mode.value}`}
                        type="button"
                        onClick={() => onEditModeChange(mode.value)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          editForm.scheduleMode === mode.value
                            ? 'border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-600/20 dark:text-blue-300'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  {editForm.scheduleMode === 'existing' ? (
                    <>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepSelectExisting', '1. Select existing history blog')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
                        <div className="md:col-span-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <label className={`${labelClass} mb-0`}>{tr('schedulerHistoryBlog', 'History blog')}</label>
                            <button
                              type="button"
                              onClick={() => loadHistoryBlogOptions({ search: '', force: true, limit: 1000 })}
                              disabled={historyBlogLoading}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-70 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              title={tr('schedulerHistoryRefresh', 'Refresh')}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${historyBlogLoading ? 'animate-spin' : ''}`} />
                              {tr('schedulerHistoryRefresh', 'Refresh')}
                            </button>
                          </div>
                          <HistoryBlogDropdown
                            value={editForm.sourceBlogId}
                            options={editFilteredHistoryBlogOptions}
                            loading={historyBlogLoading}
                            query={editHistoryBlogQuery}
                            onQueryChange={setEditHistoryBlogQuery}
                            onSelect={onEditSourceBlogChange}
                            onRefresh={() => loadHistoryBlogOptions({ search: '', force: true, limit: 1000 })}
                            placeholder={tr('schedulerHistoryBlogPlaceholder', 'Select a generated blog')}
                            searchPlaceholder={tr('schedulerHistorySearchPlaceholder', 'Search by title or keyword')}
                            refreshLabel={tr('schedulerHistoryRefresh', 'Refresh')}
                            loadingLabel={tr('schedulerHistoryDropdownLoading', 'Loading blogs...')}
                            emptyLabel={tr('schedulerHistoryDropdownEmpty', 'No matching blogs found.')}
                          />
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {historyBlogLoading
                              ? tr('schedulerHistoryLoading', 'Loading history blogs...')
                              : tr('schedulerBlogsFound', '{count} blog(s) found', {
                                  count: editFilteredHistoryBlogOptions.length,
                                })}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepBlogContent', '1. Blog content')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label className={labelClass}>{tr('schedulerBlogTopic', 'Blog topic')}</label>
                          <input className={inputClass} value={editForm.topic} onChange={(e) => setEditForm((p) => ({ ...p, topic: e.target.value }))} />
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerKeywords', 'Keywords')}</label>
                          <KeywordsInput value={editForm.keywords} onChange={(val) => setEditForm((p) => ({ ...p, keywords: val }))} />
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerFocusKeyword', 'Focus keyword')}</label>
                          <input className={inputClass} value={editForm.focusKeyword} onChange={(e) => setEditForm((p) => ({ ...p, focusKeyword: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelClass}>{tr('schedulerCategories', 'Categories (comma separated)')}</label>
                          <input className={inputClass} value={editForm.categories} onChange={(e) => setEditForm((p) => ({ ...p, categories: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {tr('schedulerStepDestination', '2. Destination and run time')}
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelClass}>{tr('schedulerPostDestinationLabel', 'Post destination')}</label>
                      <select className={inputClass} value={editForm.destinationId} onChange={(e) => onEditDestinationChange(e.target.value)}>
                        <option value="">{tr('schedulerSelectDestination', 'Select destination')}</option>
                        {destinations.map((d) => (
                          <option key={d.id} value={d.id}>{d.name || d.id} ({d.platform || 'unknown'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>{tr('schedulerRunDateTime', 'Run date & time')}</label>
                      <input className={inputClass} type="datetime-local" value={editForm.runAt} onChange={(e) => setEditForm((p) => ({ ...p, runAt: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {editForm.scheduleMode !== 'existing' ? (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepWriting', '3. Writing setup')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <div>
                          <label className={labelClass}>{tr('schedulerLanguage', 'Language')}</label>
                          <select className={inputClass} value={editForm.language} onChange={(e) => setEditForm((p) => ({ ...p, language: e.target.value }))}>{languages.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerStyle', 'Style')}</label>
                          <select className={inputClass} value={editForm.writingStyle} onChange={(e) => setEditForm((p) => ({ ...p, writingStyle: e.target.value }))}>{STYLES.map((x) => <option key={x} value={x}>{styleLabels[x] || x}</option>)}</select>
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerTone', 'Tone')}</label>
                          <select className={inputClass} value={editForm.writingTone} onChange={(e) => setEditForm((p) => ({ ...p, writingTone: e.target.value }))}>{TONES.map((x) => <option key={x} value={x}>{toneLabels[x] || x}</option>)}</select>
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerTargetWords', 'Target words')}</label>
                          <input className={inputClass} type="number" min={300} max={10000} value={editForm.targetWordCount} onChange={(e) => setEditForm((p) => ({ ...p, targetWordCount: e.target.value }))} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {tr('schedulerStepProduct', '4. Product context and scrape')}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelClass}>{tr('schedulerStoreUrlOptional', 'Store URL (optional)')}</label>
                          <input className={inputClass} value={editForm.websiteUrl} onChange={(e) => setEditForm((p) => ({ ...p, websiteUrl: e.target.value }))} />
                        </div>
                        <div>
                          <label className={labelClass}>{tr('schedulerScraperPlatform', 'Scraper platform')}</label>
                          <select className={inputClass} value={editForm.scraperPlatform} onChange={(e) => setEditForm((p) => ({ ...p, scraperPlatform: e.target.value }))}>{PLATFORMS.map((x) => <option key={x} value={x}>{platformLabels[x] || x}</option>)}</select>
                        </div>
                        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"><input type="checkbox" checked={editForm.useProductContext} onChange={(e) => setEditForm((p) => ({ ...p, useProductContext: e.target.checked }))} />{tr('schedulerUseProductDb', 'Use product DB')}</label>
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {editForm.scheduleMode === 'existing'
                      ? tr('schedulerStepOutputActions3', '3. Output actions')
                      : tr('schedulerStepOutputActions5', '5. Output actions')}
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"><input type="checkbox" checked={editForm.generateImage} onChange={(e) => setEditForm((p) => ({ ...p, generateImage: e.target.checked }))} />{tr('schedulerGenerateImage', 'Generate image')}</label>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"><input type="checkbox" checked={editForm.autoPost} onChange={(e) => setEditForm((p) => ({ ...p, autoPost: e.target.checked }))} />{tr('schedulerAutoPost', 'Auto post')}</label>
                    {editForm.autoPost ? (
                      <select className={inputClass} value={editForm.publishStatus} onChange={(e) => setEditForm((p) => ({ ...p, publishStatus: e.target.value }))}>
                        <option value="draft">{tr('schedulerPostAsDraft', 'Post as draft')}</option>
                        <option value="publish">{tr('schedulerPublishLive', 'Publish live')}</option>
                      </select>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">{tr('schedulerCancel', 'Cancel')}</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{tr('schedulerSaveChanges', 'Save changes')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {tr('schedulerImportTitle', 'Import schedules')}
              </h3>
              <ModalCloseButton onClick={() => setShowImportModal(false)} label={tr('schedulerClose', 'Close')} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTemplateCsv}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {tr('schedulerExportTemplate', 'Export sample template')}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="w-full text-sm text-slate-700 dark:text-slate-200" />
              <textarea
                className={inputClass}
                rows={10}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder={tr('schedulerPasteCsvPlaceholder', 'Paste schedule CSV content (run_at: DD-MM-YYYY HH:mm)')}
              />
            </div>

            {csvHeaders.length > 0 ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {tr('schedulerColumnMapping', 'Column mapping')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {tr('schedulerIdentified', 'Identified')}:{' '}
                    {csvHeaders.filter((h) => (csvColumnMappings[h] || detectImportField(h))).length} / {csvHeaders.length}
                  </p>
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2 text-left">{tr('schedulerCsvColumn', 'CSV column')}</th>
                        <th className="px-3 py-2 text-left">{tr('schedulerDetected', 'Detected')}</th>
                        <th className="px-3 py-2 text-left">{tr('schedulerMapTo', 'Map to')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvHeaders.map((header) => {
                        const mapped = csvColumnMappings[header] || detectImportField(header);
                        const mappedLabel = importFieldLabels[mapped] || mapped || tr('schedulerNotIdentified', 'Not identified');
                        return (
                          <tr key={header} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{header}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 ${
                                  mapped ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {mappedLabel}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                value={mapped}
                                onChange={(e) =>
                                  setCsvColumnMappings((prev) => ({
                                    ...prev,
                                    [header]: e.target.value,
                                  }))
                                }
                              >
                                {importFieldOptions.map((option) => (
                                  <option key={`${header}-${option.value || 'empty'}`} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCsvContent('');
                  setCsvHeaders([]);
                  setCsvColumnMappings({});
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {tr('schedulerClear', 'Clear')}
              </button>
              <button
                type="button"
                onClick={handleImportCsv}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {tr('schedulerImportCsv', 'Import CSV')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h4 className="text-lg font-semibold text-white">
              {tr('schedulerDeleteTitle', 'Delete schedule?')}
            </h4>
            <p className="mt-2 text-sm text-slate-300">
              {tr('schedulerDeleteBody', 'This will permanently delete the schedule for "{topic}".', {
                topic: deleteTarget.topic,
              })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">{tr('schedulerCancel', 'Cancel')}</button>
              <button type="button" onClick={handleDelete} className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/50">{tr('schedulerDelete', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SchedulerPage;
