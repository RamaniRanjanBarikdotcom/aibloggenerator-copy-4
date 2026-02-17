import React, { useEffect, useMemo, useState } from 'react';

const permissionKeys = [
  'generate',
  'history',
  'export',
  'bulkExport',
  'settings',
  'notifications',
  'manageUsers',
];

const EMPTY_EDITOR = {
  id: '',
  username: '',
  role: 'user',
  status: 'active',
  permissions: ['generate', 'history'],
};

function AdminPanelPage({ t, currentUser }) {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [isCreateMode, setIsCreateMode] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isCurrentUserAdmin = currentUser?.role === 'admin';

  const permissionLabels = useMemo(
    () => ({
      generate: t.permissionGenerate,
      history: t.permissionHistory,
      export: t.permissionExport,
      bulkExport: t.permissionBulkExport,
      settings: t.permissionSettings,
      notifications: t.permissionNotifications,
      manageUsers: t.permissionManageUsers,
    }),
    [t]
  );

  const loadUsers = async (preferredId = null) => {
    const result = await window.electronAPI.listUsers();
    if (!result.success) {
      setError(result.error || 'Failed to load users');
      return;
    }

    const nextUsers = result.users || [];
    setUsers(nextUsers);

    const targetId =
      preferredId ||
      (nextUsers.some((u) => u.id === selectedUserId) ? selectedUserId : nextUsers[0]?.id || '');

    if (targetId) {
      selectUser(nextUsers, targetId);
    } else {
      setSelectedUserId('');
      setEditor(EMPTY_EDITOR);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const selectUser = (list, userId) => {
    const selected = list.find((item) => item.id === userId);
    if (!selected) {
      return;
    }
    setIsCreateMode(false);
    setSelectedUserId(userId);
    setPassword('');
    setEditor({
      id: selected.id,
      username: selected.username || '',
      role: selected.role || 'user',
      status: selected.status || 'active',
      permissions: Array.isArray(selected.permissions) ? selected.permissions : [],
    });
  };

  const startCreate = () => {
    setIsCreateMode(true);
    setSelectedUserId('');
    setError('');
    setSuccess('');
    setPassword('');
    setEditor(EMPTY_EDITOR);
  };

  const toggleEditorPermission = (perm) => {
    setEditor((prev) => {
      const hasPerm = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: hasPerm
          ? prev.permissions.filter((item) => item !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const setRole = (value) => {
    const nextRole = value === 'admin' ? 'admin' : 'user';
    setEditor((prev) => ({
      ...prev,
      role: nextRole,
      permissions: nextRole === 'admin' ? permissionKeys : prev.permissions,
    }));
  };

  const setStatus = (value) => {
    setEditor((prev) => ({
      ...prev,
      status: value === 'deactive' ? 'deactive' : 'active',
    }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const result = await window.electronAPI.createUser({
      username: editor.username.trim(),
      password,
      role: editor.role,
      status: editor.status,
      permissions: editor.permissions,
    });

    if (!result.success) {
      setError(result.error || 'Failed to create user');
      return;
    }

    setSuccess('User created successfully');
    setPassword('');
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

    const result = await window.electronAPI.updateUserAccess({
      userId: editor.id,
      role: editor.role,
      status: editor.status,
      permissions: editor.permissions,
    });

    if (!result.success) {
      setError(result.error || 'Failed to update user');
      return;
    }

    setSuccess('User updated successfully');
    await loadUsers(editor.id);
  };

  const handleDeleteUser = async () => {
    if (!editor.id) {
      setError('No user selected');
      return;
    }

    const shouldDelete = window.confirm(`Delete user "${editor.username}"?`);
    if (!shouldDelete) {
      return;
    }

    setError('');
    setSuccess('');

    const result = await window.electronAPI.deleteUser({ userId: editor.id });
    if (!result.success) {
      setError(result.error || 'Failed to delete user');
      return;
    }

    setSuccess('User deleted successfully');
    await loadUsers();
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-2">{t.userManagementTitle}</h2>
      <p className="text-slate-600 mb-8">{t.permissionsLabel}</p>

      {!isCurrentUserAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {t.adminOnlyAddUser || 'Only admin can add users.'}
        </div>
      )}

      {isCurrentUserAdmin && (
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{t.userManagementTitle}</h3>
              <button
                type="button"
                onClick={startCreate}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {t.addUserButton || 'Add User'}
              </button>
            </div>

            <div className="space-y-3">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccess('');
                    selectUser(users, user.id);
                  }}
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    selectedUserId === user.id && !isCreateMode
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{user.username}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-medium text-slate-700">{user.role}</p>
                      <p className={user.status === 'deactive' ? 'text-red-500' : 'text-emerald-600'}>
                        {user.status || 'active'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(user.permissions || []).map((perm) => (
                      <span
                        key={`${user.id}-${perm}`}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600"
                      >
                        {permissionLabels[perm] || perm}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">
              {isCreateMode ? t.createUserTitle : t.editUserTitle || 'Edit User'}
            </h3>

            <form onSubmit={isCreateMode ? handleCreateUser : handleSaveUser} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t.usernameLabel}</label>
                <input
                  type="text"
                  value={editor.username}
                  onChange={(event) => setEditor((prev) => ({ ...prev, username: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                  required
                  disabled={!isCreateMode}
                />
              </div>

              {isCreateMode && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{t.passwordLabel}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{t.roleLabel || 'Role'}</label>
                  <select
                    value={editor.role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="user">{t.roleUser}</option>
                    <option value="admin">{t.roleAdmin}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{t.statusLabel || 'Status'}</label>
                  <select
                    value={editor.status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="active">{t.statusActive || 'Active'}</option>
                    <option value="deactive">{t.statusDeactive || 'Deactive'}</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">{t.permissionsLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {permissionKeys.map((perm) => (
                    <label key={perm} className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={editor.permissions.includes(perm)}
                        onChange={() => toggleEditorPermission(perm)}
                        disabled={editor.role === 'admin'}
                      />
                      {permissionLabels[perm]}
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              {success && <p className="text-sm text-blue-600">{success}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {isCreateMode ? t.createUserTitle : t.saveUserButton || 'Save User'}
                </button>
                {!isCreateMode && (
                  <button
                    type="button"
                    onClick={handleDeleteUser}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    {t.deleteUserButton || 'Delete'}
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminPanelPage;
