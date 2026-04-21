import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Search, Trash2 } from 'lucide-react';
import ModalCloseButton from './ModalCloseButton';
import TablePagination from './TablePagination';

const MENU_PERMISSION_KEYS = [
  'generate',
  'history',
  'posts',
  'scraper',
  'logs',
  'scheduler',
  'export',
  'bulkExport',
  'settings',
  'notifications',
  'manageUsers',
];

const SETTINGS_TAB_PERMISSION_KEYS = [
  'settings.ai',
  'settings.research',
  'settings.keys',
  'settings.publishing',
  'settings.storage',
  'settings.prompts',
  'settings.usage',
  'settings.updates',
  'settings.admin',
];

const DELETE_PERMISSION_KEYS = ['delete.history', 'delete.posts', 'delete.logs'];

const ALL_PERMISSION_KEYS = [...MENU_PERMISSION_KEYS, ...SETTINGS_TAB_PERMISSION_KEYS, ...DELETE_PERMISSION_KEYS];

const EMPTY_EDITOR = {
  id: '',
  username: '',
  role: 'user',
  status: 'active',
  permissions: ['generate', 'history'],
};

function AdminPanelPage({ t, currentUser }) {
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [password, setPassword] = useState('');
  const [isCreateMode, setIsCreateMode] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createUserErrorModalOpen, setCreateUserErrorModalOpen] = useState(false);
  const [createUserErrorMessage, setCreateUserErrorMessage] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);
  const isCurrentUserAdmin = currentUser?.role === 'admin';

  const menuPermissionLabels = useMemo(
    () => ({
      generate: t.permissionGenerate || 'Generate blogs',
      history: t.permissionHistory || 'View history',
      posts: t.permissionPosts || 'Posts',
      scraper: t.permissionScraper || 'Products',
      logs: t.permissionLogs || 'Logs',
      scheduler: t.permissionScheduler || 'Scheduler',
      export: t.permissionExport || 'Export',
      bulkExport: t.permissionBulkExport || 'Bulk export',
      settings: t.permissionSettings || 'Settings',
      notifications: t.permissionNotifications || 'Notifications',
      manageUsers: t.permissionManageUsers || 'Manage users',
    }),
    [t]
  );

  const deletePermissionLabels = useMemo(
    () => ({
      'delete.history': t.permissionDeleteHistory || 'Delete in history',
      'delete.posts': t.permissionDeletePosts || 'Delete in posts',
      'delete.logs': t.permissionDeleteLogs || 'Clear logs',
    }),
    [t]
  );

  const settingsTabPermissionLabels = useMemo(
    () => ({
      'settings.ai': t.settingsTabAi || 'AI',
      'settings.research': t.settingsTabResearch || 'Research',
      'settings.keys': t.settingsTabKeys || 'API Keys',
      'settings.publishing': t.settingsTabPublishing || 'Publishing',
      'settings.storage': t.settingsTabStorage || 'Storage',
      'settings.prompts': t.settingsTabPrompts || 'Prompts',
      'settings.usage': t.settingsTabUsage || 'Usage',
      'settings.updates': t.settingsTabUpdates || 'Updates',
      'settings.admin': t.settingsTabAdmin || 'Admin',
    }),
    [t]
  );

  const loadUsers = async () => {
    const result = await window.electronAPI.listUsers();
    if (!result.success) {
      setError(result.error || 'Failed to load users');
      return;
    }
    setUsers(result.users || []);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = String(userSearch || '').trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const username = String(user?.username || '').toLowerCase();
      const role = String(user?.role || '').toLowerCase();
      const status = String(user?.status || '').toLowerCase();
      return username.includes(q) || role.includes(q) || status.includes(q);
    });
  }, [users, userSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const pagedUsers = useMemo(() => {
    const startIndex = (usersPage - 1) * usersPerPage;
    return filteredUsers.slice(startIndex, startIndex + usersPerPage);
  }, [filteredUsers, usersPage, usersPerPage]);

  useEffect(() => {
    setUsersPage(1);
  }, [userSearch]);

  useEffect(() => {
    if (usersPage > totalUserPages) {
      setUsersPage(totalUserPages);
    }
  }, [usersPage, totalUserPages]);

  const openCreateModal = () => {
    setIsCreateMode(true);
    setEditor(EMPTY_EDITOR);
    setPassword('');
    setCreateUserErrorModalOpen(false);
    setCreateUserErrorMessage('');
    setError('');
    setSuccess('');
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    if (!user) return;
    setIsCreateMode(false);
    setPassword('');
    setError('');
    setSuccess('');
    setEditor({
      id: user.id,
      username: user.username || '',
      role: user.role || 'user',
      status: user.status || 'active',
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setCreateUserErrorModalOpen(false);
    setCreateUserErrorMessage('');
    setModalOpen(false);
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const hasPermission = (perm) => editor.permissions.includes(perm);

  const setRole = (value) => {
    const nextRole = value === 'admin' ? 'admin' : 'user';
    setEditor((prev) => ({
      ...prev,
      role: nextRole,
      permissions: nextRole === 'admin' ? ALL_PERMISSION_KEYS : prev.permissions.filter((perm) => perm !== 'settings.admin'),
    }));
  };

  const setStatus = (value) => {
    setEditor((prev) => ({
      ...prev,
      status: value === 'deactive' ? 'deactive' : 'active',
    }));
  };

  const toggleMenuPermission = (perm) => {
    if (editor.role === 'admin') return;
    setEditor((prev) => {
      const hasPerm = prev.permissions.includes(perm);
      if (perm === 'settings') {
        if (hasPerm) {
          return {
            ...prev,
            permissions: prev.permissions.filter(
              (item) => item !== 'settings' && !item.startsWith('settings.')
            ),
          };
        }
        return { ...prev, permissions: [...prev.permissions, 'settings'] };
      }

      return {
        ...prev,
        permissions: hasPerm
          ? prev.permissions.filter((item) => item !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const toggleSettingsTabPermission = (perm) => {
    if (editor.role === 'admin') return;
    setEditor((prev) => {
      const hasPerm = prev.permissions.includes(perm);
      const next = hasPerm
        ? prev.permissions.filter((item) => item !== perm)
        : [...prev.permissions, perm];
      if (!next.includes('settings')) {
        next.push('settings');
      }
      return { ...prev, permissions: next };
    });
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setCreateUserErrorModalOpen(false);
    setCreateUserErrorMessage('');
    setBusy(true);

    const result = await window.electronAPI.createUser({
      username: editor.username.trim(),
      password,
      role: editor.role,
      status: editor.status,
      permissions: editor.permissions,
    });

    setBusy(false);
    if (!result.success) {
      const rawError = String(result.error || 'Failed to create user');
      const cleanMessage = /username already exists/i.test(rawError)
        ? (t.usernameExistsError || 'This username is already taken. Please choose a different username.')
        : rawError;
      setCreateUserErrorMessage(cleanMessage);
      setCreateUserErrorModalOpen(true);
      return;
    }

    setSuccess(t.userCreatedSuccess || 'User created successfully');
    setModalOpen(false);
    await loadUsers();
  };

  const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!editor.id) {
      setError('No user selected');
      return;
    }

    setError('');
    setSuccess('');
    setBusy(true);

    const result = await window.electronAPI.updateUserAccess({
      userId: editor.id,
      role: editor.role,
      status: editor.status,
      permissions: editor.permissions,
    });

    setBusy(false);
    if (!result.success) {
      setError(result.error || 'Failed to update user');
      return;
    }

    setSuccess(t.userUpdatedSuccess || 'User updated successfully');
    setModalOpen(false);
    await loadUsers();
  };

  const handleDeleteUser = async (user) => {
    if (!user?.id) return;
    setDeleteTargetUser(user);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (busy) return;
    setDeleteModalOpen(false);
    setDeleteTargetUser(null);
  };

  const confirmDeleteUser = async () => {
    const user = deleteTargetUser;
    if (!user?.id) return;

    setError('');
    setSuccess('');
    setBusy(true);

    const result = await window.electronAPI.deleteUser({ userId: user.id });
    setBusy(false);
    if (!result.success) {
      setError(result.error || 'Failed to delete user');
      return;
    }

    setSuccess(t.userDeletedSuccess || 'User deleted successfully');
    if (editor.id === user.id) {
      setModalOpen(false);
    }
    closeDeleteModal();
    await loadUsers();
  };

  const handleQuickStatusChange = async (user, status) => {
    if (!user?.id) return;
    const nextStatus = status === 'deactive' ? 'deactive' : 'active';
    setBusy(true);
    setError('');
    setSuccess('');
    const result = await window.electronAPI.updateUserAccess({
      userId: user.id,
      role: user.role,
      status: nextStatus,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error || 'Failed to update user');
      return;
    }
    setSuccess(t.userUpdatedSuccess || 'User updated successfully');
    await loadUsers();
  };

  const openPasswordModal = (user) => {
    setPasswordTargetUser(user || null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    if (busy) return;
    setPasswordModalOpen(false);
    setPasswordTargetUser(null);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (!passwordTargetUser?.id) return;
    if (!newPassword.trim()) {
      setError('Password is required');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.passwordMismatch || 'Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    const result = await window.electronAPI.changeUserPassword({
      userId: passwordTargetUser.id,
      password: newPassword,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error || 'Failed to change password');
      return;
    }
    setSuccess(t.userUpdatedSuccess || 'User updated successfully');
    closePasswordModal();
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{t.userManagementTitle}</h2>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{t.permissionsLabel}</p>
        </div>
        {isCurrentUserAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            {t.addUserButton || 'Add User'}
          </button>
        )}
      </div>

      {!isCurrentUserAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {t.adminOnlyAddUser || 'Only admin can add users.'}
        </div>
      )}

      {isCurrentUserAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder={t.userSearchPlaceholder || 'Search users...'}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t.usernameLabel || 'Username'}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t.roleLabel || 'Role'}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t.createdAtLabel || 'Created at'}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t.lastOnlineLabel || 'Last online'}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t.statusLabel || 'Status'}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{t.actionLabel || 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      {t.noUsersAvailable || 'No users available.'}
                    </td>
                  </tr>
                )}
                {pagedUsers.map((user) => {
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{user.username}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{user.role}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatDateTime(user.createdAt)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatDateTime(user.lastOnlineAt)}</td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={user.status || 'active'}
                          onChange={(event) => handleQuickStatusChange(user, event.target.value)}
                          disabled={busy}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                            (user.status || 'active') === 'deactive'
                              ? 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
                          }`}
                        >
                          <option value="active">{t.statusActive || 'Active'}</option>
                          <option value="deactive">{t.statusDeactive || 'Deactive'}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {t.editLabel || 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openPasswordModal(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {t.changePasswordLabel || 'Change Password'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t.deleteLabel || 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <TablePagination
              totalItems={filteredUsers.length}
              page={usersPage}
              perPage={usersPerPage}
              perPageOptions={[10, 20, 50]}
              onPageChange={setUsersPage}
              onPerPageChange={(value) => {
                setUsersPerPage(value);
                setUsersPage(1);
              }}
            />
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-6">
          <div className="w-full max-w-4xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isCreateMode ? (t.createUserTitle || 'Create User') : (t.editUserTitle || 'Edit User')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.permissionsLabel}
                </p>
              </div>
              <ModalCloseButton onClick={closeModal} label={t.close || 'Close'} />
            </div>

            <form onSubmit={isCreateMode ? handleCreateUser : handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className={isCreateMode ? '' : 'md:col-span-2'}>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t.usernameLabel}</label>
                  <input
                    type="text"
                    value={editor.username}
                    onChange={(event) => setEditor((prev) => ({ ...prev, username: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                    disabled={!isCreateMode}
                  />
                </div>
                {isCreateMode && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t.passwordLabel}</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t.roleLabel || 'Role'}</label>
                  <select
                    value={editor.role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="user">{t.roleUser || 'User'}</option>
                    <option value="admin">{t.roleAdmin || 'Admin'}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t.statusLabel || 'Status'}</label>
                  <select
                    value={editor.status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="active">{t.statusActive || 'Active'}</option>
                    <option value="deactive">{t.statusDeactive || 'Deactive'}</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.adminMenuAccessLabel || 'Menu access'}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MENU_PERMISSION_KEYS.map((perm) => (
                    <label key={perm} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={hasPermission(perm)}
                        onChange={() => toggleMenuPermission(perm)}
                        disabled={editor.role === 'admin'}
                      />
                      {menuPermissionLabels[perm] || perm}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.adminSettingsTabsLabel || 'Settings tabs'}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SETTINGS_TAB_PERMISSION_KEYS.filter((perm) => perm !== 'settings.admin').map((perm) => (
                    <label key={perm} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={hasPermission(perm)}
                        onChange={() => toggleSettingsTabPermission(perm)}
                        disabled={editor.role === 'admin' || !hasPermission('settings')}
                      />
                      {settingsTabPermissionLabels[perm] || perm}
                    </label>
                  ))}
                </div>
                {!hasPermission('settings') && editor.role !== 'admin' && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {t.permissionSettings || 'Settings'} permission is required to enable tab-level access.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.deleteLabel || 'Delete'}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DELETE_PERMISSION_KEYS.map((perm) => (
                    <label key={perm} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={hasPermission(perm)}
                        onChange={() => toggleMenuPermission(perm)}
                        disabled={editor.role === 'admin'}
                      />
                      {deletePermissionLabels[perm] || perm}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {!isCreateMode && (
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(editor)}
                    className="mr-auto rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    disabled={busy}
                  >
                    {t.deleteUserButton || 'Delete User'}
                  </button>
                )}
                {!isCreateMode && (
                  <button
                    type="button"
                    onClick={() => openPasswordModal(editor)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    disabled={busy}
                  >
                    {t.changePasswordLabel || 'Change Password'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={busy}
                >
                  {t.cancel || 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
                  disabled={busy}
                >
                  {isCreateMode ? (t.createUserTitle || 'Create User') : (t.saveUserButton || 'Save User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalOpen && createUserErrorModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-500/40 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t.createUserTitle || 'Create User'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {createUserErrorMessage}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setCreateUserErrorModalOpen(false);
                  setCreateUserErrorMessage('');
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {t.ok || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-6">
          <div className="w-full max-w-md max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.changePasswordLabel || 'Change Password'}
              </h3>
              <ModalCloseButton onClick={closePasswordModal} label={t.close || 'Close'} />
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {passwordTargetUser?.username || '-'}
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.passwordLabel || 'Password'}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.reenterPasswordLabel || 'Re-enter password'}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={busy}
                >
                  {t.cancel || 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
                  disabled={busy}
                >
                  {t.saveUserButton || 'Save User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t.deleteUserConfirmTitle || 'Delete user?'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t.deleteUserConfirmMessage || 'Are you sure you want to delete user'}{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "{deleteTargetUser?.username || ''}"
              </span>
              ?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                disabled={busy}
              >
                {t.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                disabled={busy}
              >
                {t.deleteConfirmButton || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanelPage;
