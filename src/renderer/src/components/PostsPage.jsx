import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Globe, TrendingUp, FileText, Eye, Calendar, BarChart3, AlertCircle, CheckCircle, XCircle, Clock, Pencil, Trash2 } from 'lucide-react';
import ModalCloseButton from './ModalCloseButton';
import TablePagination from './TablePagination';
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
const TINYMCE_SCRIPT_ID = 'tinymce-local-script';
const TINYMCE_SCRIPT_SRC = './tinymce/tinymce.min.js';
const TINYMCE_BASE_URL = './tinymce';
const POSTS_DESTINATION_STORAGE_KEY = 'posts.selectedDestinationId';

const normalizeUrlKey = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return `${host}${parsed.pathname}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

const normalizeFileKey = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  let pathPart = trimmed;
  try {
    const parsed = new URL(trimmed);
    pathPart = parsed.pathname || '';
  } catch {
    pathPart = trimmed;
  }
  const segments = String(pathPart).split(/[\\/]/).filter(Boolean);
  const file = decodeURIComponent(segments[segments.length - 1] || '').toLowerCase();
  if (!file) return '';
  // Collapse common CMS variants like image-300x200.jpg or image-scaled.jpg
  return file
    .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '')
    .replace(/-scaled(?=\.[a-z0-9]+$)/i, '');
};

const normalizeFileVariantKey = (value) => {
  const fileKey = normalizeFileKey(value);
  if (!fileKey) return '';
  const dotIndex = fileKey.lastIndexOf('.');
  const ext = dotIndex >= 0 ? fileKey.slice(dotIndex) : '';
  const name = dotIndex >= 0 ? fileKey.slice(0, dotIndex) : fileKey;
  const parts = name.split('-').filter(Boolean);
  const isSuffixToken = (token) =>
    /^scaled$/i.test(token) ||
    /^\d+x\d+$/i.test(token) ||
    /^\d{2,}$/.test(token) ||
    /^[a-f0-9]{6,}$/i.test(token);
  while (parts.length > 1 && isSuffixToken(parts[parts.length - 1])) {
    parts.pop();
  }
  return `${parts.join('-')}${ext}`;
};

const dedupeUrls = (items = []) => {
  const seenUrl = new Set();
  const seenFile = new Set();
  const seenFileVariant = new Set();
  const seenStamp = new Set();
  return items
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => {
      const urlKey = normalizeUrlKey(value);
      const fileKey = normalizeFileKey(value);
      const fileVariantKey = normalizeFileVariantKey(value);
      const stampMatch = fileKey.match(/-(\d{10,})(?=\.[a-z0-9]+$)/i);
      const stampKey = stampMatch ? stampMatch[1] : '';
      if (!urlKey) return false;
      if (seenUrl.has(urlKey)) return false;
      if (fileKey && seenFile.has(fileKey)) return false;
      if (fileVariantKey && seenFileVariant.has(fileVariantKey)) return false;
      if (stampKey && seenStamp.has(stampKey)) return false;
      seenUrl.add(urlKey);
      if (fileKey) seenFile.add(fileKey);
      if (fileVariantKey) seenFileVariant.add(fileVariantKey);
      if (stampKey) seenStamp.add(stampKey);
      return true;
    });
};

function PostsPage({ t, canDelete = false }) {
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
  const [destinationId, setDestinationId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(POSTS_DESTINATION_STORAGE_KEY) || '';
  });
  const [syncMessage, setSyncMessage] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [autoSynced, setAutoSynced] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    id: null,
    title: '',
    content: '',
    status: 'draft',
  });
  const [editGallery, setEditGallery] = useState([]);
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editEditorMode, setEditEditorMode] = useState('visual');
  const [recentPublishesPage, setRecentPublishesPage] = useState(1);
  const [recentPublishesPerPage, setRecentPublishesPerPage] = useState(10);
  const [publishHistoryPage, setPublishHistoryPage] = useState(1);
  const [publishHistoryPerPage, setPublishHistoryPerPage] = useState(10);
  const [postsPage, setPostsPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(10);
  const [tinyLoaded, setTinyLoaded] = useState(false);
  const [tinyLoadError, setTinyLoadError] = useState('');
  const [deleteConfirmPost, setDeleteConfirmPost] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );
  const tinyTextareaRef = useRef(null);
  const tinyEditorRef = useRef(null);
  const syncingFromTinyRef = useRef(false);
  const pendingTinyContentRef = useRef('');
  const activeEditPostIdRef = useRef('');
  const selectedDestination = destinations.find((dest) => dest.id === destinationId) || null;
  const autoSyncInFlight = useRef(false);
  const lastAutoSyncAt = useRef(0);

  const recentPublishes = Array.isArray(analytics?.recentPublishes) ? analytics.recentPublishes : [];
  const recentPublishesTotalPages = Math.max(1, Math.ceil(recentPublishes.length / recentPublishesPerPage));
  const pagedRecentPublishes = useMemo(() => {
    const startIndex = (recentPublishesPage - 1) * recentPublishesPerPage;
    return recentPublishes.slice(startIndex, startIndex + recentPublishesPerPage);
  }, [recentPublishes, recentPublishesPage, recentPublishesPerPage]);

  const publishHistoryTotalPages = Math.max(1, Math.ceil(publishHistory.length / publishHistoryPerPage));
  const pagedPublishHistory = useMemo(() => {
    const startIndex = (publishHistoryPage - 1) * publishHistoryPerPage;
    return publishHistory.slice(startIndex, startIndex + publishHistoryPerPage);
  }, [publishHistory, publishHistoryPage, publishHistoryPerPage]);

  const postsTotalPages = Math.max(1, Math.ceil(posts.length / postsPerPage));
  const pagedPosts = useMemo(() => {
    const startIndex = (postsPage - 1) * postsPerPage;
    return posts.slice(startIndex, startIndex + postsPerPage);
  }, [posts, postsPage, postsPerPage]);

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
      const destination = destinations.find((dest) => dest.id === destinationId) || null;
      const now = Date.now();
      if (
        !hasData &&
        destinationId &&
        !autoSynced &&
        !syncing &&
        !autoSyncInFlight.current &&
        now - lastAutoSyncAt.current > 60000
      ) {
        // attempt one automatic sync to pull data for charts
        autoSyncInFlight.current = true;
        try {
          await handleSync();
        } finally {
          setAutoSynced(true);
          lastAutoSyncAt.current = Date.now();
          autoSyncInFlight.current = false;
        }
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
            d.platform === 'wordpress' ||
            d.platform === 'wordpress-token' ||
            d.platform === 'shopify'
          )
        : [];
      setDestinations(dests);
      setDestinationId((prev) => {
        if (!dests.length) return '';
        const preferred = prev || (typeof window !== 'undefined'
          ? window.localStorage.getItem(POSTS_DESTINATION_STORAGE_KEY) || ''
          : '');
        const exists = dests.some((d) => d.id === preferred);
        return exists ? preferred : dests[0].id;
      });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (destinationId) {
      window.localStorage.setItem(POSTS_DESTINATION_STORAGE_KEY, destinationId);
    } else {
      window.localStorage.removeItem(POSTS_DESTINATION_STORAGE_KEY);
    }
  }, [destinationId]);

  const handleSync = async () => {
    if (syncing) return;
    if (!destinationId) {
      setError(t.publishDestinationRequired || 'Select a destination first.');
      return;
    }
    const selected = destinations.find((dest) => dest.id === destinationId);
    const platformLabel = selected?.platform || 'destination';
    setSyncing(true);
    setSyncMessage('');
    setTestResult(null);
    const result = await window.electronAPI.syncRemotePosts({ destinationId });
    if (!result.success) {
      setError(result.error || 'Sync failed');
    } else {
      setError('');
      setSyncMessage(t.syncSuccess || `Synced ${result.count || 0} posts from ${platformLabel}.`);
    }
    setSyncing(false);
    await Promise.all([loadPosts(), loadAnalytics(), loadPublishHistory()]);
  };

  const handleTestConnection = async () => {
    if (!destinationId) {
      setError(t.publishDestinationRequired || 'Select a destination first.');
      return;
    }
    setTesting(true);
    setError('');
    setSyncMessage('');
    setTestResult(null);
    const selectedDestination = destinations.find((dest) => dest.id === destinationId) || null;
    if (!selectedDestination) {
      setTesting(false);
      setError(t.publishDestinationRequired || 'Select a destination first.');
      return;
    }
    if (selectedDestination.platform === 'shopify') {
      const apiVersion = selectedDestination.apiVersion || '2024-01';
      const shopDomain = selectedDestination.shopDomain || '';
      const accessToken = selectedDestination.accessToken || '';
      const endpoint = shopDomain
        ? `https://${shopDomain}/admin/api/${apiVersion}/shop.json`
        : '';
      const response = await window.electronAPI.testPublishDestination({
        destination: selectedDestination,
      });
      setTestResult({
        success: response?.success,
        error: response?.error,
        result: {
          destination: {
            name: selectedDestination.name,
            platform: selectedDestination.platform,
            baseUrl: shopDomain,
            hasApiToken: accessToken.length > 0,
            hasUsername: false,
            hasAppPassword: false,
            apiTokenLength: accessToken.length,
            apiTokenFirst10: accessToken.substring(0, 10),
          },
          tests: [
            {
              name: 'Shopify Admin API',
              endpoint,
              success: response?.success,
              status: response?.success ? 'OK' : 'Failed',
              siteName: response?.result?.name,
            },
          ],
        },
      });
    } else {
      const result = await window.electronAPI.testWordpressSync({ destinationId });
      setTestResult(result);
    }
    setTesting(false);
  };

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains('dark'));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.tinymce) {
      setTinyLoaded(true);
      return;
    }

    const existingScript = document.getElementById(TINYMCE_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener('load', () => setTinyLoaded(true));
      existingScript.addEventListener('error', () => setTinyLoadError('Failed to load local TinyMCE assets.'));
      return;
    }

    const script = document.createElement('script');
    script.id = TINYMCE_SCRIPT_ID;
    script.src = TINYMCE_SCRIPT_SRC;
    script.onload = () => setTinyLoaded(true);
    script.onerror = () => setTinyLoadError('Failed to load local TinyMCE assets.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!editModalOpen || !tinyLoaded || editEditorMode !== 'visual' || !tinyTextareaRef.current || !window.tinymce) {
      return;
    }
    if (editLoading) return;
    if (tinyEditorRef.current) return;

    window.tinymce
      .init({
        target: tinyTextareaRef.current,
        license_key: 'gpl',
        base_url: TINYMCE_BASE_URL,
        suffix: '.min',
        skin: isDarkMode ? 'oxide-dark' : 'oxide',
        content_css: isDarkMode ? 'dark' : 'default',
        menubar: false,
        branding: false,
        promotion: false,
        height: 360,
        resize: true,
        toolbar_sticky: true,
        toolbar_sticky_offset: 8,
        plugins: 'autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime table help wordcount',
        toolbar:
          'undo redo | blocks | bold italic underline | alignleft aligncenter alignright | bullist numlist outdent indent | link image | blockquote code removeformat',
        content_style:
          `body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.65; padding: 8px; ${
            isDarkMode
              ? 'background: #0f172a; color: #e2e8f0 !important; } h1, h2, h3, h4, h5, h6, p, li, blockquote, span, div, a { color: inherit !important; '
              : ''
          } } img { max-width: 100%; height: auto; }`,
        setup: (editor) => {
          tinyEditorRef.current = editor;
          editor.on('init', () => {
            const initial = pendingTinyContentRef.current || editForm.content || '';
            editor.setContent(initial);
            pendingTinyContentRef.current = '';
          });
          editor.on('change input undo redo setcontent', () => {
            const nextHtml = editor.getContent();
            syncingFromTinyRef.current = true;
            setEditForm((prev) => ({ ...prev, content: nextHtml }));
          });
          editor.on('remove', () => {
            tinyEditorRef.current = null;
          });
        },
      })
      .catch(() => {
        setTinyLoadError('Failed to initialize TinyMCE.');
      });

    return () => {
      if (tinyEditorRef.current) {
        tinyEditorRef.current.remove();
        tinyEditorRef.current = null;
      }
    };
  }, [editModalOpen, tinyLoaded, editEditorMode, editLoading, isDarkMode]);

  useEffect(() => {
    if (!editModalOpen || editEditorMode !== 'visual' || !tinyEditorRef.current) return;
    if (editLoading) return;
    if (syncingFromTinyRef.current) {
      syncingFromTinyRef.current = false;
      return;
    }
    const current = tinyEditorRef.current.getContent();
    if (current !== editForm.content) {
      tinyEditorRef.current.setContent(editForm.content || '');
    }
  }, [editEditorMode, editForm.content]);

  const openEditModal = async (post) => {
    if (!destinationId) {
      setError(t.publishDestinationRequired || 'Select a destination first.');
      return;
    }
    setEditEditorMode('visual');
    setEditModalOpen(true);
    setEditLoading(true);
    setEditSaving(false);
    setEditError('');
    setTinyLoadError('');
    syncingFromTinyRef.current = false;
    activeEditPostIdRef.current = String(post?.id || '');
    const result = await window.electronAPI.getRemotePostDetail({
      destinationId,
      postId: post.id,
    });
    if (result.success) {
      const remoteImage = String(result.post.featuredImage || '').trim();
      const localGallery = Array.isArray(result.post.imageGallery) ? result.post.imageGallery : [];
      // Keep the remotely posted image as the primary/default selection.
      const mergedGallery = dedupeUrls([remoteImage, result.post.localImageUrl, ...localGallery]);
      const nextContent = result.post.content || result.post.summary || '';
      const resolvedPostId = String(result.post.id || post.id || '');
      activeEditPostIdRef.current = resolvedPostId;
      setEditForm({
        id: result.post.id,
        title: result.post.title || '',
        content: nextContent,
        status: result.post.status || 'draft',
      });
      setEditGallery(mergedGallery);
      pendingTinyContentRef.current = nextContent;
      setEditImageUrl(remoteImage || mergedGallery[0] || '');
      if (tinyEditorRef.current && editEditorMode === 'visual') {
        tinyEditorRef.current.setContent(nextContent);
      }
      setEditEditorMode('visual');

      // Only backfill linked images if we don't already have a meaningful gallery.
      if (mergedGallery.length <= 1) {
        window.electronAPI
          .getRemotePostLinkedImages({
            destinationId,
            postId: resolvedPostId,
            remoteUrl: result.post.url || '',
            remoteTitle: result.post.title || '',
            remoteFeaturedImage: remoteImage || '',
          })
          .then((linkedResult) => {
            if (!linkedResult?.success) return;
            if (activeEditPostIdRef.current !== resolvedPostId) return;

            const linkedGallery = Array.isArray(linkedResult.imageGallery) ? linkedResult.imageGallery : [];
            const merged = dedupeUrls([
              remoteImage,
              result.post.localImageUrl,
              ...localGallery,
              linkedResult.localImageUrl,
              ...linkedGallery,
            ]);

            if (merged.length) {
              setEditGallery(merged);
              setEditImageUrl((prev) => {
                if (prev && merged.some((url) => normalizeUrlKey(url) === normalizeUrlKey(prev))) {
                  return prev;
                }
                return remoteImage || merged[0] || '';
              });
            }
          })
          .catch(() => {});
      }
    } else {
      setEditError(result.error || 'Failed to load post');
    }
    setEditLoading(false);
  };

  const handleSaveEdit = async () => {
    if (!editForm.id) return;
    setEditSaving(true);
    setEditError('');
    const result = await window.electronAPI.updateRemotePost({
      destinationId,
      postId: editForm.id,
      title: editForm.title,
      content: editForm.content,
      status: editForm.status,
      imageUrl: editImageUrl || '',
    });
    if (!result.success) {
      setEditError(result.error || 'Update failed');
      setEditSaving(false);
      return;
    }
    setEditSaving(false);
    setEditModalOpen(false);
    await Promise.all([loadPosts(), loadAnalytics(), loadPublishHistory()]);
  };

  const handleDeletePost = async (post) => {
    if (!destinationId) {
      setError(t.publishDestinationRequired || 'Select a destination first.');
      return;
    }
    setDeleteConfirmPost(post || null);
  };

  const confirmDeletePost = async () => {
    const post = deleteConfirmPost;
    if (!post) return;
    const result = await window.electronAPI.deleteRemotePost({
      destinationId,
      postId: post.id,
      force: false,
    });
    if (!result.success) {
      setError(result.error || 'Delete failed');
      setDeleteConfirmPost(null);
      return;
    }
    setDeleteConfirmPost(null);
    await Promise.all([loadPosts(), loadAnalytics(), loadPublishHistory()]);
  };

  useEffect(() => {
    loadDestinations();
    loadPosts();
    loadAnalytics();
    loadPublishHistory();
  }, [statusFilter, platformFilter, destinationId]);

  useEffect(() => {
    setAutoSynced(false);
    lastAutoSyncAt.current = 0;
  }, [destinationId]);

  useEffect(() => {
    setRecentPublishesPage(1);
  }, [destinationId, analytics?.recentPublishes?.length]);

  useEffect(() => {
    setPublishHistoryPage(1);
    setPostsPage(1);
  }, [statusFilter, platformFilter, destinationId]);

  useEffect(() => {
    if (recentPublishesPage > recentPublishesTotalPages) {
      setRecentPublishesPage(recentPublishesTotalPages);
    }
  }, [recentPublishesPage, recentPublishesTotalPages]);

  useEffect(() => {
    if (publishHistoryPage > publishHistoryTotalPages) {
      setPublishHistoryPage(publishHistoryTotalPages);
    }
  }, [publishHistoryPage, publishHistoryTotalPages]);

  useEffect(() => {
    if (postsPage > postsTotalPages) {
      setPostsPage(postsTotalPages);
    }
  }, [postsPage, postsTotalPages]);

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
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  const getStatusLabel = (status) => {
    if (status === 'publish') return t.statusPublish || 'Published';
    if (status === 'draft') return t.statusDraft || 'Draft';
    if (status === 'pending') return t.statusPending || 'Pending';
    if (status === 'private') return t.statusPrivate || 'Private';
    if (status === 'scheduled') return t.statusScheduled || 'Scheduled';
    return status || '-';
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
            <span>{testing ? (t.testingLabel || 'Testing...') : (t.testConnectionLabel || 'Test Connection')}</span>
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
      <div className="flex flex-wrap items-center gap-6 mb-6 border-b border-slate-200 dark:border-slate-700/60">
        {['overview', 'history', 'posts'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative pb-3 text-sm font-semibold transition ${
              activeTab === tab
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span
              className={`absolute left-0 -bottom-[1px] h-0.5 w-full rounded-full transition ${
                activeTab === tab ? 'bg-blue-500' : 'bg-transparent'
              }`}
            />
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
                <p className="text-sm text-slate-500 text-center py-8">{t.noDataYet || 'No data yet'}</p>
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
                <p className="text-sm text-slate-500 text-center py-8">{t.noDataYet || 'No data yet'}</p>
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
                <p className="text-sm text-slate-500 text-center py-8">{t.noTopicDataYet || 'No topic data yet'}</p>
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
                        <span className="truncate text-slate-800">{post.title || t.untitledLabel || 'Untitled'}</span>
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
                <p className="text-sm text-slate-500 text-center py-8">{t.emptyPosts || 'No posts yet'}</p>
              )}
            </div>
          </div>

          {/* Recent Publishes */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              {t.recentPublishes || 'Recent Publishes'}
            </h3>
            {recentPublishes.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">{t.destinationLabel || 'Destination'}</th>
                      <th className="pb-2 font-medium">{t.scraperPlatformLabel || 'Platform'}</th>
                      <th className="pb-2 font-medium">{t.colStatus || 'Status'}</th>
                      <th className="pb-2 font-medium">{t.dateLabel || 'Date'}</th>
                      <th className="pb-2 font-medium">{t.actionLabel || 'Action'}</th>
                    </tr>
                  </thead>
                    <tbody>
                      {pagedRecentPublishes.map((pub) => (
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
                            {getStatusLabel(pub.status)}
                          </span>
                        </td>
                        <td className="py-2 text-slate-600">{formatDate(pub.publishedAt)}</td>
                        <td className="py-2">
                          {pub.publishedUrl && (
                            <button
                              onClick={() => window.electronAPI.openExternal({ url: pub.publishedUrl })}
                              className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" /> {t.viewLabel || 'View'}
                            </button>
                          )}
                        </td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalItems={recentPublishes.length}
                  page={recentPublishesPage}
                  perPage={recentPublishesPerPage}
                  perPageOptions={[5, 10, 20, 50]}
                  onPageChange={setRecentPublishesPage}
                  onPerPageChange={(value) => {
                    setRecentPublishesPerPage(value);
                    setRecentPublishesPage(1);
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">{t.noRecentPublishes || 'No recent publishes'}</p>
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
              <option value="any">{t.allStatusLabel || 'All Status'}</option>
              <option value="publish">{t.statusPublish || 'Published'}</option>
              <option value="draft">{t.statusDraft || 'Draft'}</option>
            </select>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="any">{t.allPlatformsLabel || 'All Platforms'}</option>
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
                  <th className="px-4 py-3 font-medium">{t.blogTitleLabel || 'Blog Title'}</th>
                  <th className="px-4 py-3 font-medium">{t.destinationLabel || 'Destination'}</th>
                  <th className="px-4 py-3 font-medium">{t.scraperPlatformLabel || 'Platform'}</th>
                  <th className="px-4 py-3 font-medium">{t.colStatus || 'Status'}</th>
                  <th className="px-4 py-3 font-medium">{t.colPublished || 'Published'}</th>
                  <th className="px-4 py-3 font-medium">{t.colActions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {publishHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      {t.noPublishingHistoryYet || 'No publishing history yet'}
                    </td>
                  </tr>
                ) : (
                  pagedPublishHistory.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 truncate max-w-[200px]">
                          {item.blogTitle || t.untitledLabel || 'Untitled'}
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
                          {getStatusLabel(item.status)}
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
                            <span>{t.viewLabel || 'View'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100">
            <TablePagination
              totalItems={publishHistory.length}
              page={publishHistoryPage}
              perPage={publishHistoryPerPage}
              perPageOptions={[10, 20, 50, 100]}
              onPageChange={setPublishHistoryPage}
              onPerPageChange={(value) => {
                setPublishHistoryPerPage(value);
                setPublishHistoryPage(1);
              }}
            />
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
            <div className="p-6 text-center text-slate-500">
              {t.emptyPosts || 'No posts yet. Click Sync to fetch posts from your destination.'}
            </div>
          ) : (
            pagedPosts.map((post) => (
              <div
                key={post.id}
                className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-100 text-sm text-slate-800 hover:bg-slate-50"
              >
                <div className="col-span-4">
                  <p className="font-semibold truncate">{post.title || t.untitledLabel || 'Untitled'}</p>
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
                    {getStatusLabel(post.status)}
                  </span>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-600">{formatDate(post.publishedAt)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm font-semibold">
                    {typeof post.views === 'number' ? post.views.toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2">
                  {post.url && (
                    <button
                      onClick={() => window.electronAPI.openExternal({ url: post.url })}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t.viewLabel || 'Open'}
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(post)}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 text-sm"
                  >
                    <Pencil className="h-4 w-4" />
                    {t.editLabel || 'Edit'}
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDeletePost(post)}
                      className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 text-sm"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t.deleteLabel || 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <div className="px-4 py-3 border-t border-slate-100">
            <TablePagination
              totalItems={posts.length}
              page={postsPage}
              perPage={postsPerPage}
              perPageOptions={[10, 20, 50, 100]}
              onPageChange={setPostsPage}
              onPerPageChange={(value) => {
                setPostsPerPage(value);
                setPostsPage(1);
              }}
            />
          </div>
        </div>
      )}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t.editPostTitle || 'Edit Remote Post'}</h3>
              <ModalCloseButton onClick={() => setEditModalOpen(false)} label={t.close || 'Close'} />
            </div>
            {editLoading ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400">{t.loading || 'Loading...'}</div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.colTitle || 'Title'}</label>
                  <input
                    value={editForm.title}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder={t.postTitlePlaceholder || 'Post title'}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.colStatus || 'Status'}</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="publish">{t.statusPublish || 'Published'}</option>
                    <option value="draft">{t.statusDraft || 'Draft'}</option>
                    {selectedDestination?.platform !== 'shopify' && (
                      <option value="pending">{t.statusPending || 'Pending'}</option>
                    )}
                    {selectedDestination?.platform !== 'shopify' && (
                      <option value="private">{t.statusPrivate || 'Private'}</option>
                    )}
                  </select>
                </div>
                {editGallery.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t.featuredImageLabel || 'Featured image'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {editGallery.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setEditImageUrl(url)}
                          className={`h-20 w-28 overflow-hidden rounded-md border ${
                            url === editImageUrl
                              ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-500/50'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                          title={t.selectImageLabel || 'Use as featured image'}
                        >
                          <img src={url} alt="Generated" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                    {editImageUrl && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t.selectedImageHint || 'Selected image will be used as the featured image.'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                    {t.noImagesAvailable || 'No images available for this blog.'}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.colContent || 'Content'}</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditEditorMode('visual')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          editEditorMode === 'visual'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {t.editorModeVisual || 'Visual'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditEditorMode('html')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          editEditorMode === 'html'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {t.editorModeHtml || 'HTML'}
                      </button>
                    </div>
                  </div>
                  {editEditorMode === 'visual' ? (
                    <div className="mt-2 space-y-2">
                      {tinyLoadError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                          {tinyLoadError}
                        </div>
                      ) : null}
                      {!tinyLoaded ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                          {t.loadingEditor || 'Loading editor...'}
                        </div>
                      ) : null}
                      <textarea ref={tinyTextareaRef} defaultValue={editForm.content} className="hidden" />
                    </div>
                  ) : (
                    <textarea
                      value={editForm.content}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, content: e.target.value }))}
                      className="mt-2 h-60 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      placeholder={t.postContentPlaceholder || 'Post content (HTML supported)'}
                    />
                  )}
                </div>
                {editError && <p className="text-sm text-rose-600">{editError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditModalOpen(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
                  >{t.cancel || 'Cancel'}</button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={editSaving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editSaving ? (t.saving || 'Saving...') : (t.save || 'Save')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {deleteConfirmPost && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t.deletePostTitle || 'Delete remote post?'}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t.deletePostBody || 'This will permanently delete this post from the connected platform.'}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 break-words">
                  {deleteConfirmPost?.title || t.untitledLabel || 'Untitled'}
                </p>
              </div>
              <ModalCloseButton onClick={() => setDeleteConfirmPost(null)} label={t.close || 'Close'} />
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmPost(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                {t.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmDeletePost}
                className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/30"
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

export default PostsPage;








