import React, { useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout';
import BlogForm from './components/BlogForm';
import SettingsPage from './components/SettingsPage';
import ProgressScreen from './components/ProgressScreen';
import ResultsPage from './components/ResultsPage';
import HistoryPage from './components/HistoryPage';
import LoginPage from './components/LoginPage';
import AdminSetupPage from './components/AdminSetupPage';
import AdminPanelPage from './components/AdminPanelPage';
import MongoDBSetupPage from './components/MongoDBSetupPage';
import ProductScraperPage from './components/ProductScraperPage';
import LogsPage from './components/LogsPage';
import EditBlogPage from './components/EditBlogPage';
import { getTranslations } from './i18n';
import PostsPage from './components/PostsPage';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ step: 0, message: '' });
  const [generatedBlog, setGeneratedBlog] = useState(null);
  const [editingBlog, setEditingBlog] = useState(null);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('app_language') || 'en';
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app_theme') || 'light';
  });
  const [history, setHistory] = useState([]);
  const [historySummary, setHistorySummary] = useState({ totalCount: 0, totalCost: 0 });
  const [wpCounts, setWpCounts] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [mongoConfigured, setMongoConfigured] = useState(false);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [viewHistory, setViewHistory] = useState(['home']);
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
  const can = (permission) => {
    if (!currentUser) {
      return false;
    }
    if (currentUser.role === 'admin') {
      return true;
    }
    return currentUser.permissions?.includes(permission);
  };

  const navigateTo = (view) => {
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
    const initAuth = async () => {
      // Check if MongoDB is configured first
      try {
        const mongoConfig = await window.electronAPI.getMongoDBConfig();
        if (mongoConfig.success && mongoConfig.config?.isConfigured) {
          setMongoConfigured(true);
        } else {
          setMongoConfigured(false);
          setAuthReady(true);
          return; // Don't check auth if MongoDB is not configured
        }
      } catch (err) {
        console.error('Error checking MongoDB config:', err);
        setMongoConfigured(false);
        setAuthReady(true);
        return;
      }

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
              setLanguage(result.userData.settings.language);
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
    const loadHistory = async () => {
      const result = await window.electronAPI.getHistory();
      if (result.success) {
        setHistory(result.history);
        if (result.summary) {
          setHistorySummary(result.summary);
        }
        if (result.wpCounts) {
          setWpCounts(result.wpCounts);
        }
      }
    };

    if (currentUser && can('history')) {
      loadHistory();
    }
  }, [currentUser]);

  const refreshHistory = async () => {
    const refreshed = await window.electronAPI.getHistory();
    if (refreshed.success) {
      setHistory(refreshed.history);
      if (refreshed.summary) {
        setHistorySummary(refreshed.summary);
      }
      if (refreshed.wpCounts) {
        setWpCounts(refreshed.wpCounts);
      }
    }
  };

  const handleGenerate = async (formData) => {
    setIsGenerating(true);
    navigateTo('progress');
    setProgress({ step: 0, message: t.progressSteps[0] });

    trackEvent('generate_start', { topic: formData.topic });
    const result = await window.electronAPI.generateBlog(formData);

    setIsGenerating(false);

    if (result.success) {
      setGeneratedBlog(result.blog);
      await refreshHistory();
      navigateTo('results');
    } else {
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
          setLanguage(result.userData.settings.language);
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

  const handleMongoDBSetupComplete = async () => {
    setMongoConfigured(true);
    // Re-initialize auth after MongoDB is configured
    setAuthReady(false);
    const result = await window.electronAPI.getAuthState();
    if (result.success) {
      setNeedsAdminSetup(result.needsAdminSetup);
      setCurrentUser(result.currentUser);
    }
    setAuthReady(true);
  };

  const handleLogout = async () => {
    await window.electronAPI.logout();
    setCurrentUser(null);
    setNotifications([]);
    setNotificationsOpen(false);
    setHistory([]);
    setHistorySummary({ totalCount: 0, totalCost: 0 });
    setGeneratedBlog(null);
    setEditingBlog(null);
    setViewHistory(['home']);
    setCurrentView('home');
  };

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
    const result = await window.electronAPI.getBlog({ id });
    if (result.success) {
      setGeneratedBlog(result.blog);
      navigateTo('results');
    } else {
      alert(result.error || 'Blog not found');
    }
  };

  const handleEditBlog = async (id) => {
    const result = await window.electronAPI.getBlog({ id });
    if (result.success) {
      setEditingBlog(result.blog);
      navigateTo('edit');
    } else {
      alert(result.error || 'Blog not found');
    }
  };

  const handleSaveEdit = async (updated) => {
    const result = await window.electronAPI.updateBlog({ blog: updated });
    if (result.success) {
      setEditingBlog(null);
      await refreshHistory();
      setGeneratedBlog(updated);
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
      }));
    }
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

  // Show MongoDB setup page FIRST if not configured
  if (!mongoConfigured) {
    return <MongoDBSetupPage onSetupComplete={handleMongoDBSetupComplete} />;
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
      canPosts={can('history')}
      canSettings={can('settings')}
      canScraper={can('generate')}
      canLogs={can('notifications')}
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
        <SettingsPage t={t} currentUser={currentUser} />
      )}
      {currentView === 'history' && can('history') && (
        <HistoryPage
          history={history}
          summary={historySummary}
          wpCounts={wpCounts}
          t={t}
          canExport={can('export')}
          canBulkExport={can('bulkExport')}
          onViewBlog={handleViewBlog}
          onEditBlog={handleEditBlog}
          onGenerateImage={handleGenerateImageFromHistory}
          onDeleteBlog={handleDeleteBlog}
          onClearAll={handleClearAll}
        />
      )}
      {currentView === 'posts' && can('history') && <PostsPage t={t} />}
      {currentView === 'scraper' && <ProductScraperPage t={t} />}
      {currentView === 'logs' && <LogsPage t={t} />}
      {currentView === 'edit' && editingBlog && (
        <EditBlogPage
          blog={editingBlog}
          t={t}
          onSave={handleSaveEdit}
          onCancel={() => navigateTo('history')}
        />
      )}
      {currentView === 'admin' && currentUser?.role === 'admin' && (
        <AdminPanelPage t={t} currentUser={currentUser} />
      )}
      {currentView === 'progress' && <ProgressScreen progress={progress} t={t} />}
      {currentView === 'results' && generatedBlog && (
        <ResultsPage
          blog={generatedBlog}
          onGenerateAnother={() => navigateTo('home')}
          t={t}
          canExport={can('export')}
          onEdit={
            generatedBlog?.id
              ? () => {
                  setEditingBlog(generatedBlog);
                  navigateTo('edit');
                }
              : null
          }
        />
      )}
    </Layout>
  );
}

export default App;
