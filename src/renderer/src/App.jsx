import React, { useEffect, useMemo, useRef, useState } from 'react';
import Layout from './components/Layout';
import BlogForm from './components/BlogForm';
import SettingsPage from './components/SettingsPage';
import ProgressScreen from './components/ProgressScreen';
import ResultsPage from './components/ResultsPage';
import HistoryPage from './components/HistoryPage';
import LoginPage from './components/LoginPage';
import AdminSetupPage from './components/AdminSetupPage';
import AdminPanelPage from './components/AdminPanelPage';
import ProductScraperPage from './components/ProductScraperPage';
import LogsPage from './components/LogsPage';
import EditBlogPage from './components/EditBlogPage';
import SchedulerPage from './components/SchedulerPage';
import { getTranslations, normalizeLanguage } from './i18n';
import PostsPage from './components/PostsPage';

function App() {
  const BLOG_FORM_DRAFT_KEY = 'blog_form_draft_v1';
  const BLOG_FAILED_DRAFTS_KEY = 'blog_failed_generations_v2';
  const LEGACY_FAILED_DRAFT_KEY = 'blog_failed_generation_v1';
  const historyCacheKey = (userId) => `history_cache_v1_${userId || 'anon'}`;
  const historyPersistKey = (userId) => `history_cache_persist_v1_${userId || 'anon'}`;
  const HISTORY_PERSIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const [currentView, setCurrentView] = useState('home');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ step: 0, message: '' });
  const progressRef = useRef(progress);
  const [generatedBlog, setGeneratedBlog] = useState(null);
  const [lastViewedBlog, setLastViewedBlog] = useState(null);
  const [openPublishForBlogId, setOpenPublishForBlogId] = useState(null);
  const [editingBlog, setEditingBlog] = useState(null);
  const [editSessionId, setEditSessionId] = useState(0);
  const [activeBlogId, setActiveBlogId] = useState(null);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogLoadError, setBlogLoadError] = useState('');
  const editReturnViewRef = useRef('history');
  const openEditorWithBlog = (blog, returnView) => {
    if (!blog) return;
    editReturnViewRef.current = returnView || currentView || 'history';
    setEditingBlog(blog);
    setGeneratedBlog(blog);
    setLastViewedBlog(blog);
    setActiveBlogId(blog.id || null);
    setBlogLoadError('');
    setEditSessionId((prev) => prev + 1);
    navigateTo('edit');
  };
  const [language, setLanguage] = useState(() => {
    return normalizeLanguage(localStorage.getItem('app_language'));
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app_theme') || 'light';
  });
  const [history, setHistory] = useState([]);
  const [historySummary, setHistorySummary] = useState({ totalCount: 0, totalCost: 0 });
  const [wpCounts, setWpCounts] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [viewHistory, setViewHistory] = useState(['home']);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsLeaveModalOpen, setSettingsLeaveModalOpen] = useState(false);
  const [pendingView, setPendingView] = useState(null);
  const settingsLeaveActionsRef = useRef(null);
  const bootstrappedHistoryUserRef = useRef(null);
  const [sessionId] = useState(() => {
    const gCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (gCrypto?.randomUUID) return gCrypto.randomUUID();
    return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  });
  const trackEvent = (event, props = {}) => {
    try {
      if (!window?.electronAPI?.logAnalyticsEvent) return;
      window.electronAPI.logAnalyticsEvent({
        session_id: sessionId,
        user_id: currentUser?.id || null,
        event,
        props,
        screen_name: props.screen_name,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('trackEvent failed', err);
    }
  };

  const t = useMemo(() => getTranslations(language), [language]);
  const permissionFallbacks = useMemo(
    () => ({
      posts: ['history'],
      scraper: ['generate'],
      logs: ['notifications'],
    }),
    []
  );
  const can = (permission) => {
    if (!currentUser) {
      return false;
    }
    if (currentUser.role === 'admin') {
      return true;
    }
    const userPermissions = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
    if (userPermissions.includes(permission)) {
      return true;
    }
    const fallbacks = permissionFallbacks[permission] || [];
    return fallbacks.some((perm) => userPermissions.includes(perm));
  };

  const navigateTo = (view, options = {}) => {
    const { force = false } = options;
    if (!force && currentView === 'settings' && settingsDirty && view !== 'settings') {
      setPendingView(view);
      setSettingsLeaveModalOpen(true);
      return;
    }
    trackEvent('screen_view', { screen_name: view });
    setViewHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last === view) {
        return prev;
      }
      return [...prev, view];
    });
    setCurrentView(view);
  };

  const handleBack = () => {
    if (currentView === 'settings' && settingsDirty) {
      const target = viewHistory.length > 1 ? viewHistory[viewHistory.length - 2] : null;
      if (target) {
        setPendingView(target);
        setSettingsLeaveModalOpen(true);
        return;
      }
    }
    setViewHistory((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      const next = prev.slice(0, -1);
      setCurrentView(next[next.length - 1]);
      return next;
    });
  };

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onGenerationProgress((data) => {
      setProgress(data);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const start = async () => {
      if (!window?.electronAPI?.startSession) return;
      await window.electronAPI.startSession({
        sessionId,
        userId: currentUser?.id || null,
        device: { appVersion: '1.0.0', platform: navigator.platform },
      });
    };
    start();
    const interval = setInterval(() => {
      if (window?.electronAPI?.heartbeatSession) {
        window.electronAPI.heartbeatSession({ sessionId });
      }
    }, 15000);
    const handleUnload = () => {
      if (window?.electronAPI?.endSession) {
        window.electronAPI.endSession({ sessionId });
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      if (window?.electronAPI?.endSession) {
        window.electronAPI.endSession({ sessionId });
      }
    };
  }, [sessionId, currentUser]);

  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (currentView === 'settings' && settingsDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [currentView, settingsDirty]);

  useEffect(() => {
    const initAuth = async () => {
      const result = await window.electronAPI.getAuthState();
      if (result.success) {
        setNeedsAdminSetup(result.needsAdminSetup);
        setCurrentUser(result.currentUser);
        if (result.currentUser) {
          setViewHistory(['home']);
          setCurrentView('home');
          // Load user data from database
          if (result.userData) {
            if (result.userData.historySummary) {
              setHistorySummary(result.userData.historySummary);
            }
            // Apply saved language/theme preferences from database
            if (result.userData.settings?.language) {
              setLanguage(normalizeLanguage(result.userData.settings.language));
            }
            if (result.userData.settings?.theme) {
              setTheme(result.userData.settings.theme);
            }
          }
        }
      }
      setAuthReady(true);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setViewHistory(['home']);
      setCurrentView('home');
    }
    if (!currentUser?.id) {
      bootstrappedHistoryUserRef.current = null;
      return;
    }
    if (!can('history')) {
      return;
    }
    if (bootstrappedHistoryUserRef.current === String(currentUser.id)) {
      return;
    }
    const loadHistory = async () => {
      try {
        const rawCached = sessionStorage.getItem(historyCacheKey(currentUser.id));
        let hasSessionCache = false;
        if (rawCached) {
          const cached = JSON.parse(rawCached);
          if (Array.isArray(cached?.history)) {
            setHistory(cached.history);
          }
          if (cached?.summary && typeof cached.summary === 'object') {
            setHistorySummary(cached.summary);
          }
          if (cached && Object.prototype.hasOwnProperty.call(cached, 'wpCounts')) {
            setWpCounts(cached.wpCounts || null);
          }
          hasSessionCache = true;
        }
        if (!hasSessionCache) {
          const rawPersistent = localStorage.getItem(historyPersistKey(currentUser.id));
          if (rawPersistent) {
            const cached = JSON.parse(rawPersistent);
            if (
              cached &&
              typeof cached === 'object' &&
              typeof cached.ts === 'number' &&
              Date.now() - cached.ts <= HISTORY_PERSIST_CACHE_TTL_MS
            ) {
              if (Array.isArray(cached?.history)) {
                setHistory(cached.history);
              }
              if (cached?.summary && typeof cached.summary === 'object') {
                setHistorySummary(cached.summary);
              }
              if (Object.prototype.hasOwnProperty.call(cached, 'wpCounts')) {
                setWpCounts(cached.wpCounts || null);
              }
            }
          }
        }
      } catch (_cacheError) {
        // Ignore malformed cache and continue with remote fetch.
      }

      const result = await window.electronAPI.getHistory({ limit: 5000 });
      if (result.success) {
        setHistory(result.history);
        if (result.summary) {
          setHistorySummary(result.summary);
        }
        setWpCounts(result.wpCounts || null);
        try {
          sessionStorage.setItem(
            historyCacheKey(currentUser.id),
            JSON.stringify({
              history: result.history || [],
              summary: result.summary || { totalCount: 0, totalCost: 0 },
              wpCounts: result.wpCounts || null,
            })
          );
          localStorage.setItem(
            historyPersistKey(currentUser.id),
            JSON.stringify({
              ts: Date.now(),
              history: result.history || [],
              summary: result.summary || { totalCount: 0, totalCost: 0 },
              wpCounts: result.wpCounts || null,
            })
          );
        } catch (_cacheWriteError) {
          // Ignore session storage write errors.
        }
        bootstrappedHistoryUserRef.current = String(currentUser.id);
      }
    };

    loadHistory();
  }, [currentUser]);

  useEffect(() => {
    if (currentView !== 'edit') return;
    if (editingBlog) return;
    const fallbackBlog = generatedBlog || lastViewedBlog;
    if (fallbackBlog) {
      setEditingBlog(fallbackBlog);
      setEditSessionId((prev) => prev + 1);
      return;
    }
    if (!activeBlogId || blogLoading) return;
    const fetchBlog = async () => {
      setBlogLoading(true);
      setBlogLoadError('');
      const result = await window.electronAPI.getBlog({ id: activeBlogId });
      if (result.success && result.blog) {
        setEditingBlog(result.blog);
        setGeneratedBlog(result.blog);
        setLastViewedBlog(result.blog);
        setEditSessionId((prev) => prev + 1);
      } else {
        setBlogLoadError(result.error || 'Blog not found');
      }
      setBlogLoading(false);
    };
    fetchBlog();
  }, [currentView, editingBlog, generatedBlog, lastViewedBlog, activeBlogId, blogLoading]);

  useEffect(() => {
    if (currentView !== 'results') return;
    if (generatedBlog || lastViewedBlog || blogLoading) return;
    if (!activeBlogId) return;
    const fetchBlog = async () => {
      setBlogLoading(true);
      setBlogLoadError('');
      const result = await window.electronAPI.getBlog({ id: activeBlogId });
      if (result.success && result.blog) {
        setGeneratedBlog(result.blog);
        setLastViewedBlog(result.blog);
      } else {
        setBlogLoadError(result.error || 'Blog not found');
      }
      setBlogLoading(false);
    };
    fetchBlog();
  }, [currentView, generatedBlog, lastViewedBlog, activeBlogId, blogLoading]);

  const refreshHistory = async () => {
    const refreshed = await window.electronAPI.getHistory({ limit: 5000 });
    if (refreshed.success) {
      setHistory(refreshed.history);
      if (refreshed.summary) {
        setHistorySummary(refreshed.summary);
      }
      setWpCounts(refreshed.wpCounts || null);
      if (currentUser?.id) {
        try {
          sessionStorage.setItem(
            historyCacheKey(currentUser.id),
            JSON.stringify({
              history: refreshed.history || [],
              summary: refreshed.summary || { totalCount: 0, totalCost: 0 },
              wpCounts: refreshed.wpCounts || null,
            })
          );
          localStorage.setItem(
            historyPersistKey(currentUser.id),
            JSON.stringify({
              ts: Date.now(),
              history: refreshed.history || [],
              summary: refreshed.summary || { totalCount: 0, totalCost: 0 },
              wpCounts: refreshed.wpCounts || null,
            })
          );
        } catch (_cacheWriteError) {
          // Ignore session storage write errors.
        }
      }
    }
  };

  const handleGenerate = async (formData, options = {}) => {
    const loadFailedDrafts = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(BLOG_FAILED_DRAFTS_KEY) || '[]');
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') return [parsed];
      } catch (_error) {
        // Fallback to legacy value below.
      }
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_FAILED_DRAFT_KEY) || 'null');
        if (legacy && typeof legacy === 'object') {
          return [{ id: legacy.id || `fd-${Date.now()}`, ...legacy }];
        }
      } catch (_error) {
        // Ignore malformed legacy data.
      }
      return [];
    };
    const saveFailedDrafts = (items) => {
      localStorage.setItem(BLOG_FAILED_DRAFTS_KEY, JSON.stringify(items));
      if (items.length > 0) {
        localStorage.setItem(LEGACY_FAILED_DRAFT_KEY, JSON.stringify(items[0]));
      } else {
        localStorage.removeItem(LEGACY_FAILED_DRAFT_KEY);
      }
    };

    localStorage.setItem(
      BLOG_FORM_DRAFT_KEY,
      JSON.stringify({
        ...formData,
        savedAt: new Date().toISOString(),
      })
    );

    setIsGenerating(true);
    navigateTo('progress');
    const initialStep =
      typeof options.resumeStep === 'number' ? Math.max(0, Math.min(8, options.resumeStep)) : 0;
    setProgress({
      step: initialStep,
      message: options.resumeMessage || t.progressSteps[initialStep] || t.progressSteps[0],
    });

    trackEvent('generate_start', { topic: formData.topic });
    const result = await window.electronAPI.generateBlog({
      ...formData,
      resumeState: options.resumeState || null,
    });

    setIsGenerating(false);

    if (result.success) {
      localStorage.removeItem(BLOG_FORM_DRAFT_KEY);
      if (options.failedDraftId) {
        const remaining = loadFailedDrafts().filter((item) => item.id !== options.failedDraftId);
        saveFailedDrafts(remaining);
      }
      setGeneratedBlog(result.blog);
      setActiveBlogId(result.blog?.id || null);
      await refreshHistory();
      navigateTo('results');
    } else {
      const failedItem = {
        id: options.failedDraftId || `fd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        ...formData,
        failedAt: new Date().toISOString(),
        error: result.error || 'Unknown generation error',
        lastProgress: progressRef.current || { step: 0, message: '' },
        resumeState: result.resumeState || options.resumeState || null,
      };
      const existing = loadFailedDrafts().filter((item) => item.id !== failedItem.id);
      saveFailedDrafts([failedItem, ...existing].slice(0, 20));
      alert(`Error: ${result.error}`);
      navigateTo('home');
    }
  };

  const handleLogin = async (payload) => {
    const result = await window.electronAPI.login(payload);
    if (result.success) {
      setCurrentUser(result.user);
      // Load all user data from database on login
      if (result.userData) {
        if (result.userData.historySummary) {
          setHistorySummary(result.userData.historySummary);
        }
        // Apply saved language/theme preferences from database
        if (result.userData.settings?.language) {
          setLanguage(normalizeLanguage(result.userData.settings.language));
        }
        if (result.userData.settings?.theme) {
          setTheme(result.userData.settings.theme);
        }
      }
      navigateTo('home');
    }
    return result;
  };

  const handleSetupAdmin = async (payload) => {
    const result = await window.electronAPI.setupAdmin(payload);
    if (result.success) {
      setNeedsAdminSetup(false);
      setCurrentUser(result.user);
      navigateTo('home');
    }
    return result;
  };

  const handleClientSessionExpired = () => {
    setCurrentUser(null);
    setNotifications([]);
    setNotificationsOpen(false);
    setHistory([]);
    setHistorySummary({ totalCount: 0, totalCost: 0 });
    setWpCounts(null);
    bootstrappedHistoryUserRef.current = null;
    setGeneratedBlog(null);
    setEditingBlog(null);
    setViewHistory(['home']);
    setCurrentView('home');
  };

  const handleLogout = async () => {
    if (typeof document !== 'undefined' && document.activeElement?.blur) {
      document.activeElement.blur();
    }
    await window.electronAPI.logout();
    handleClientSessionExpired();
  };

  useEffect(() => {
    if (!window?.electronAPI?.onAuthExpired) return undefined;
    const unsubscribe = window.electronAPI.onAuthExpired(() => {
      handleClientSessionExpired();
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleToggleNotifications = async () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen) {
      const result = await window.electronAPI.getNotifications();
      if (result.success) {
        setNotifications(result.notifications);
      }
    }
  };

  const handleViewBlog = async (id) => {
    setActiveBlogId(id);
    setBlogLoadError('');
    setBlogLoading(true);
    setOpenPublishForBlogId(null);
    const result = await window.electronAPI.getBlog({ id });
    if (result.success) {
      setGeneratedBlog(result.blog);
      setLastViewedBlog(result.blog);
      navigateTo('results');
    } else {
      alert(result.error || 'Blog not found');
    }
    setBlogLoading(false);
  };

  const handleEditBlog = async (id) => {
    setActiveBlogId(id);
    setBlogLoadError('');
    setBlogLoading(true);
    setOpenPublishForBlogId(null);
    const result = await window.electronAPI.getBlog({ id });
    if (result.success) {
      openEditorWithBlog(result.blog, currentView || 'history');
    } else {
      alert(result.error || 'Blog not found');
    }
    setBlogLoading(false);
  };

  const handleSaveEdit = async (updated) => {
    const result = await window.electronAPI.updateBlog({ blog: updated });
    if (result.success) {
      setEditingBlog(null);
      await refreshHistory();
      setGeneratedBlog(updated);
      setLastViewedBlog(updated);
      setActiveBlogId(updated.id || null);
      navigateTo('results');
    } else {
      alert(result.error || 'Save failed');
    }
  };

  const handleDeleteBlog = async (id) => {
    const result = await window.electronAPI.deleteBlog({ id });
    if (result.success) {
      await refreshHistory();
    } else {
      alert(result.error || 'Delete failed');
    }
  };

  const handleGenerateImageFromHistory = async (id) => {
    const result = await window.electronAPI.getBlog({ id });
    if (!result.success) {
      alert(result.error || 'Blog not found');
      return;
    }
    const blog = result.blog;
    const imageResult = await window.electronAPI.generateBlogImage({
      blogId: blog.id,
      title: blog.title,
      content: blog.content,
    });
    if (!imageResult.success) {
      alert(imageResult.error || 'Image generation failed');
      return;
    }
    await refreshHistory();
    if (generatedBlog && generatedBlog.id === blog.id) {
      setGeneratedBlog((prev) => ({
        ...prev,
        imageUrl: imageResult.imageUrl,
        imageGallery: imageResult.imageGallery || prev.imageGallery,
      }));
    }
  };

  const handlePostBlogFromHistory = async (id) => {
    setActiveBlogId(id);
    setBlogLoadError('');
    setBlogLoading(true);
    const result = await window.electronAPI.getBlog({ id });
    if (result.success) {
      setGeneratedBlog(result.blog);
      setLastViewedBlog(result.blog);
      setOpenPublishForBlogId(result.blog?.id || id);
      navigateTo('results');
    } else {
      setOpenPublishForBlogId(null);
      alert(result.error || 'Blog not found');
    }
    setBlogLoading(false);
  };

  const handleClearAll = async () => {
    const result = await window.electronAPI.clearBlogs();
    if (result.success) {
      await refreshHistory();
    } else {
      alert(result.error || 'Clear failed');
    }
  };

  if (!authReady) {
    return null;
  }

  if (needsAdminSetup) {
    return <AdminSetupPage t={t} onSetup={handleSetupAdmin} />;
  }

  if (!currentUser) {
    return <LoginPage t={t} onLogin={handleLogin} />;
  }

  return (
    <Layout
      currentView={currentView}
      setCurrentView={navigateTo}
      canGoBack={viewHistory.length > 1}
      onBack={handleBack}
      language={language}
      setLanguage={setLanguage}
      theme={theme}
      onToggleTheme={(nextTheme) => {
        if (nextTheme === 'dark' || nextTheme === 'light') {
          setTheme(nextTheme);
          return;
        }
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      }}
      t={t}
      currentUser={currentUser}
      onLogout={handleLogout}
      notifications={notifications}
      notificationsOpen={notificationsOpen}
      onToggleNotifications={handleToggleNotifications}
      canNotifications={can('notifications')}
      canGenerate={can('generate')}
      canHistory={can('history')}
      canPosts={can('posts')}
      canSettings={can('settings')}
      canScraper={can('scraper')}
      canLogs={can('logs')}
      canScheduler={can('scheduler')}
      canAdmin={currentUser?.role === 'admin'}
    >
      {currentView === 'home' && can('generate') && (
        <BlogForm
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          language={language}
          t={t}
          canGenerate={can('generate')}
          currentUser={currentUser}
        />
      )}
      {currentView === 'settings' && can('settings') && (
        <SettingsPage
          t={t}
          currentUser={currentUser}
          onUnsavedChange={setSettingsDirty}
          registerLeaveActions={(actions) => {
            settingsLeaveActionsRef.current = actions;
          }}
        />
      )}
      {currentView === 'history' && can('history') && (
        <HistoryPage
          history={history}
          summary={historySummary}
          wpCounts={wpCounts}
          t={t}
          canExport={can('export')}
          canBulkExport={can('bulkExport')}
          canDelete={can('delete.history')}
          onViewBlog={handleViewBlog}
          onEditBlog={handleEditBlog}
          onPostBlog={handlePostBlogFromHistory}
          onGenerateImage={handleGenerateImageFromHistory}
          onDeleteBlog={handleDeleteBlog}
          onClearAll={handleClearAll}
          onRefreshHistory={refreshHistory}
        />
      )}
      {currentView === 'posts' && can('posts') && <PostsPage t={t} canDelete={can('delete.posts')} />}
      {currentView === 'scraper' && can('scraper') && <ProductScraperPage t={t} />}
      {currentView === 'logs' && can('logs') && <LogsPage t={t} canDelete={can('delete.logs')} />}
      {currentView === 'scheduler' && can('scheduler') && <SchedulerPage t={t} />}
      {currentView === 'edit' && editingBlog && (
        <EditBlogPage
          key={`${editingBlog.id}-${editSessionId}`}
          blog={editingBlog}
          t={t}
          onSave={handleSaveEdit}
          onCancel={() => {
            const fallbackBlog = editingBlog;
            setEditingBlog(null);
            if (fallbackBlog) {
              setGeneratedBlog(fallbackBlog);
              setLastViewedBlog(fallbackBlog);
            }
            const returnView = editReturnViewRef.current || 'history';
            navigateTo(returnView === 'edit' ? 'results' : returnView);
          }}
        />
      )}
      {currentView === 'admin' && currentUser?.role === 'admin' && (
        <AdminPanelPage t={t} currentUser={currentUser} />
      )}
      {currentView === 'progress' && <ProgressScreen progress={progress} t={t} />}
      {currentView === 'results' && generatedBlog && (
        <ResultsPage
          blog={generatedBlog || lastViewedBlog}
          onGenerateAnother={() => navigateTo('home')}
          t={t}
          canExport={can('export')}
          openPublishOnMount={openPublishForBlogId === (generatedBlog?.id || null)}
          onPublishModalOpened={() => setOpenPublishForBlogId(null)}
          onEdit={
            generatedBlog?.id
              ? () => {
                  handleEditBlog(generatedBlog.id);
                }
              : null
          }
        />
      )}
      {currentView === 'results' && !generatedBlog && lastViewedBlog && (
        <ResultsPage
          blog={lastViewedBlog}
          onGenerateAnother={() => navigateTo('home')}
          t={t}
          canExport={can('export')}
          openPublishOnMount={openPublishForBlogId === (lastViewedBlog?.id || null)}
          onPublishModalOpened={() => setOpenPublishForBlogId(null)}
          onEdit={
            lastViewedBlog?.id
              ? () => {
                  handleEditBlog(lastViewedBlog.id);
                }
              : null
          }
        />
      )}
      {currentView === 'results' && !generatedBlog && !lastViewedBlog && (
        <div className="max-w-3xl mx-auto p-8 text-slate-600">
          {blogLoading ? 'Loading blog...' : blogLoadError || 'No blog selected.'}
        </div>
      )}
      {currentView === 'edit' && !editingBlog && (
        <div className="max-w-3xl mx-auto p-8 text-slate-600">
          {blogLoading ? 'Loading editor...' : blogLoadError || 'No blog selected.'}
        </div>
      )}
      {settingsLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:border dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Unsaved Settings
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              You have unsaved changes in Settings. Save before leaving?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSettingsLeaveModalOpen(false);
                  setPendingView(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await settingsLeaveActionsRef.current?.discard?.();
                  setSettingsDirty(false);
                  const next = pendingView;
                  setSettingsLeaveModalOpen(false);
                  setPendingView(null);
                  if (next) navigateTo(next, { force: true });
                }}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await settingsLeaveActionsRef.current?.save?.();
                  if (!ok) return;
                  setSettingsDirty(false);
                  const next = pendingView;
                  setSettingsLeaveModalOpen(false);
                  setPendingView(null);
                  if (next) navigateTo(next, { force: true });
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default App;
