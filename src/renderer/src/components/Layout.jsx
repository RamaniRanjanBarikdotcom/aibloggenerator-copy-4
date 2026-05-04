import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Home,
  Settings,
  Globe,
  History,
  Bell,
  Shield,
  ClipboardList,
  Database,
  CalendarClock,
  Moon,
  Sun,
  ArrowLeft,
  ChevronDown,
  User,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

function Layout({
  children,
  currentView,
  setCurrentView,
  canGoBack,
  onBack,
  language,
  setLanguage,
  theme,
  onToggleTheme,
  t,
  currentUser,
  onLogout,
  notifications,
  notificationsOpen,
  onToggleNotifications,
  canNotifications,
  canGenerate,
  canHistory,
  canPosts,
  canSettings,
  canScraper,
  canLogs,
  canScheduler,
  canAdmin,
}) {
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isHeaderFloating, setIsHeaderFloating] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('layout.sidebarCollapsed') === '1';
    } catch (_error) {
      return false;
    }
  });
  const languageMenuRef = useRef(null);
  const accountMenuRef = useRef(null);
  const notificationsMenuRef = useRef(null);
  const contentRef = useRef(null);
  const languageOptions = useMemo(
    () => [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'Deutsch' },
    ],
    []
  );
  const activeLanguageLabel =
    languageOptions.find((option) => option.code === language)?.label || language.toUpperCase();

  useEffect(() => {
    const onPointerDown = (event) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
        setLanguageMenuOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
      if (
        notificationsOpen &&
        notificationsMenuRef.current &&
        !notificationsMenuRef.current.contains(event.target)
      ) {
        if (typeof onToggleNotifications === 'function') {
          onToggleNotifications();
        }
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [notificationsOpen, onToggleNotifications]);

  useEffect(() => {
    const target = contentRef.current;
    if (!target) return;
    const handleScroll = () => {
      setIsHeaderFloating(target.scrollTop > 8);
    };
    handleScroll();
    target.addEventListener('scroll', handleScroll);
    return () => target.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('layout.sidebarCollapsed', isSidebarCollapsed ? '1' : '0');
    } catch (_error) {
      // ignore persistence failures
    }
  }, [isSidebarCollapsed]);

  const navButtonClass = (active) =>
    `flex items-center w-full py-3 mb-2 rounded-lg transition ${
      isSidebarCollapsed ? 'justify-center px-2' : 'px-4'
    } ${
      active
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
    }`;
  const navIconClass = `w-5 h-5${isSidebarCollapsed ? '' : ' mr-3'}`;


  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-100 dark:from-[#050b18] dark:via-[#07132a] dark:to-[#081835]">
      <div
        className={`${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } bg-white/90 backdrop-blur border-r border-purple-100 flex flex-col transition-all duration-300 dark:bg-slate-900/80 dark:border-slate-800`}
      >
        <div
          className={`border-b border-purple-100 dark:border-slate-800 ${
            isSidebarCollapsed ? 'p-3' : 'p-6'
          }`}
        >
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} gap-2`}>
            {!isSidebarCollapsed ? (
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t.appTitle}</h1>
            ) : null}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4">
          {canGenerate && (
            <button
              onClick={() => setCurrentView('home')}
              className={navButtonClass(currentView === 'home')}
              title={isSidebarCollapsed ? t.generateBlog : undefined}
            >
              <Home className={navIconClass} />
              {!isSidebarCollapsed ? <span>{t.generateBlog}</span> : null}
            </button>
          )}

          {canHistory && (
            <button
              onClick={() => setCurrentView('history')}
              className={navButtonClass(currentView === 'history')}
              title={isSidebarCollapsed ? t.historyNav : undefined}
            >
              <History className={navIconClass} />
              {!isSidebarCollapsed ? <span>{t.historyNav}</span> : null}
            </button>
          )}

          {canPosts && (
            <button
              onClick={() => setCurrentView('posts')}
              className={navButtonClass(currentView === 'posts')}
              title={isSidebarCollapsed ? (t.postsNav || 'Posts') : undefined}
            >
              <Globe className={navIconClass} />
              {!isSidebarCollapsed ? <span>{t.postsNav || 'Posts'}</span> : null}
            </button>
          )}

          {canSettings && (
            <button
              onClick={() => setCurrentView('settings')}
              className={navButtonClass(currentView === 'settings')}
              title={isSidebarCollapsed ? t.settings : undefined}
            >
              <Settings className={navIconClass} />
              {!isSidebarCollapsed ? <span>{t.settings}</span> : null}
            </button>
          )}

          {canScraper && (
            <button
              onClick={() => setCurrentView('scraper')}
              className={navButtonClass(currentView === 'scraper')}
              title={isSidebarCollapsed ? t.scraperNav : undefined}
            >
              <Database className={navIconClass} />
              {!isSidebarCollapsed ? <span>{t.scraperNav}</span> : null}
            </button>
          )}

          {canLogs && (
            <button
              onClick={() => setCurrentView('logs')}
              className={navButtonClass(currentView === 'logs')}
              title={isSidebarCollapsed ? t.logsNav : undefined}
            >
              <ClipboardList className={navIconClass} />
              {!isSidebarCollapsed ? <span>{t.logsNav}</span> : null}
            </button>
          )}

          {canScheduler && (
            <button
              onClick={() => setCurrentView('scheduler')}
              className={navButtonClass(currentView === 'scheduler')}
              title={isSidebarCollapsed ? 'Scheduler' : undefined}
            >
              <CalendarClock className={navIconClass} />
              {!isSidebarCollapsed ? <span>Scheduler</span> : null}
            </button>
          )}

          {canAdmin && (
            <button
              onClick={() => setCurrentView('admin')}
              className={navButtonClass(currentView === 'admin')}
              title={isSidebarCollapsed ? t.adminNav : undefined}
            >
              <Shield className={navIconClass} />
              {!isSidebarCollapsed ? <span>{t.adminNav}</span> : null}
            </button>
          )}
        </nav>

        <div className={`border-t border-purple-100 dark:border-slate-800 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
          <p className="text-xs text-slate-500 text-center dark:text-slate-500">
            {isSidebarCollapsed ? 'v1.0.2' : 'Version 1.0.2'}
          </p>
        </div>
      </div>

      <div ref={contentRef} className="flex-1 overflow-auto">
        <div
          className={`sticky top-0 z-20 px-8 py-2 backdrop-blur transition ${
            isHeaderFloating
              ? 'bg-white/65 shadow-sm dark:bg-slate-950/55'
              : 'bg-transparent'
          }`}
        >
          <div
            className={`flex items-center justify-between gap-3 border-b pb-3 transition ${
              isHeaderFloating
                ? 'border-transparent'
                : 'border-transparent'
            }`}
          >
            <button
              type="button"
              onClick={onBack}
              disabled={!canGoBack}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-sm transition ${
                canGoBack
                  ? 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900'
                  : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-600'
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">{t.backLabel}</span>
            </button>

            <div className="flex items-center gap-3">
              {canNotifications && (
                <div className="relative" ref={notificationsMenuRef}>
                  <button
                    type="button"
                    onClick={onToggleNotifications}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 p-2 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <Bell className="h-4 w-4" />
                  </button>
                  {notificationsOpen && (
                    <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                          {t.notificationsTitle}
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            await window.electronAPI.clearNotifications();
                            onToggleNotifications();
                          }}
                          className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          {t.clearLabel}
                        </button>
                      </div>
                      <div className="mt-2 space-y-2 max-h-64 overflow-auto">
                        {notifications.length === 0 ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {t.notificationsEmpty}
                          </p>
                        ) : (
                          notifications.map((note) => (
                            <div
                              key={note.id}
                              className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/70"
                            >
                              <div className="flex items-center justify-between">
                                <p className="font-semibold text-slate-800 dark:text-slate-100">
                                  {(note.type || 'info').toUpperCase()}
                                </p>
                                {!note.isRead && (
                                  <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                                    NEW
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-700 dark:text-slate-200">
                                {note.message}
                              </p>
                              {!note.isRead && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await window.electronAPI.markNotificationRead({ id: note.id });
                                    onToggleNotifications();
                                  }}
                                  className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                                >
                                  {t.markReadLabel}
                                </button>
                              )}
                              <p className="text-[10px] text-slate-500 mt-1 dark:text-slate-400">
                                {new Date(note.createdAt).toLocaleString()}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => onToggleTheme()}
                title={theme === 'dark' ? t.lightMode : t.darkMode}
                className={`relative flex h-10 w-16 items-center rounded-full border p-1 shadow-sm transition ${
                  theme === 'dark'
                    ? 'border-slate-600 bg-slate-800 hover:bg-slate-700'
                    : 'border-amber-200 bg-amber-100 hover:bg-amber-200'
                }`}
              >
                <span
                  className={`absolute inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                    theme === 'dark'
                      ? 'translate-x-7 bg-slate-950 text-blue-300'
                      : 'translate-x-0 bg-yellow-400 text-amber-900'
                  }`}
                >
                  {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </span>
              </button>

              <div className="relative" ref={languageMenuRef}>
                <button
                  type="button"
                  onClick={() => setLanguageMenuOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <span>{activeLanguageLabel}</span>
                  <ChevronDown className="h-4 w-4" />
                </button>

                {languageMenuOpen && (
                  <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {languageOptions.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => {
                          setLanguage(option.code);
                          setLanguageMenuOpen(false);
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                          language === option.code
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {currentUser && (
                <div className="relative" ref={accountMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <User className="h-4 w-4" />
                    <span>{currentUser.username}</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>

                  {accountMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t.signedInAs}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {currentUser.username}
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {currentUser.role === 'admin' ? t.roleAdmin : t.roleUser}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          onLogout();
                        }}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>{t.logoutButton}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Layout;
