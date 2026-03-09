import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertTriangle, Shield, UserPlus, KeyRound, Sparkles } from 'lucide-react';

function AdminSetupPage({ t, onSetup }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const passwordStrength = (() => {
    if (!password) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-orange-500' };
    if (score <= 3) return { level: 3, label: 'Good', color: 'bg-yellow-500' };
    if (score <= 4) return { level: 4, label: 'Strong', color: 'bg-emerald-500' };
    return { level: 5, label: 'Excellent', color: 'bg-cyan-400' };
  })();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const result = await onSetup({ username: username.trim(), password });
    setIsSubmitting(false);

    if (!result.success) {
      const rawError = result.error || 'Setup failed';
      if (rawError.includes('Database connection failed') || rawError.includes('SSL') || rawError.includes('TLSV1')) {
        setError('Cannot connect to database. Please check your internet connection and ensure MongoDB Atlas is active and your IP is whitelisted.');
      } else {
        setError(rawError);
      }
    }
  };

  const steps = [
    { icon: UserPlus, label: 'Create admin account', active: true },
    { icon: KeyRound, label: 'Configure API keys', active: false },
    { icon: Sparkles, label: 'Start generating', active: false },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 overflow-hidden">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10%] h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute right-[-15%] top-[10%] h-[400px] w-[400px] rounded-full bg-indigo-500/10 blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[-20%] left-[20%] h-[600px] w-[600px] rounded-full bg-cyan-500/8 blur-[140px] animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      {/* Subtle grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <div className="grid w-full max-w-[1100px] grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Left Panel - Welcome */}
          <div className="hidden lg:flex flex-col justify-between rounded-3xl border border-white/[0.08] bg-white/[0.03] p-10 backdrop-blur-2xl">
            <div>
              {/* Logo */}
              <div className="flex items-center gap-3 mb-12">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 shadow-lg shadow-violet-500/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <span className="text-lg font-semibold text-white tracking-tight">AI Blog Generator</span>
                  <span className="ml-2 rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 uppercase tracking-wider">Setup</span>
                </div>
              </div>

              {/* Heading */}
              <h1 className="text-[2.5rem] font-bold leading-[1.15] tracking-tight text-white">
                Welcome aboard
              </h1>
              <p className="mt-4 text-base leading-relaxed text-slate-300/80 max-w-sm">
                Let's set up your admin account. This will be the primary account with full access to manage your AI blog platform.
              </p>

              {/* Setup steps */}
              <div className="mt-10 space-y-3">
                {steps.map((step, i) => (
                  <div
                    key={step.label}
                    className={`flex items-center gap-4 rounded-2xl border p-4 transition-all duration-300 ${
                      step.active
                        ? 'border-violet-400/30 bg-violet-500/10'
                        : 'border-white/[0.06] bg-white/[0.02]'
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                      step.active
                        ? 'bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-lg shadow-violet-500/20'
                        : 'bg-white/[0.06] text-slate-500'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex items-center gap-3">
                      <step.icon className={`h-4 w-4 ${step.active ? 'text-violet-300' : 'text-slate-500'}`} />
                      <span className={`text-sm font-medium ${step.active ? 'text-white' : 'text-slate-500'}`}>
                        {step.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom info */}
            <div className="mt-10 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
              <div>
                <p className="text-sm font-medium text-white">Your data is secure</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Passwords are hashed with PBKDF2-SHA512. All credentials are encrypted at rest in MongoDB Atlas.
                </p>
              </div>
            </div>
          </div>

          {/* Right Panel - Setup Form */}
          <div className="flex flex-col justify-center">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-white">AI Blog Generator</span>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-900/60 shadow-2xl shadow-black/20 backdrop-blur-2xl">
              {/* Top glow */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

              <div className="p-8 sm:p-10">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-white tracking-tight">{t.setupAdminTitle}</h2>
                  <p className="mt-2 text-sm text-slate-400">{t.setupAdminSubtitle}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Username */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t.usernameLabel}</label>
                    <div className={`relative rounded-xl border transition-all duration-200 ${
                      focusedField === 'username'
                        ? 'border-violet-400/50 ring-2 ring-violet-500/20 bg-white/[0.06]'
                        : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]'
                    }`}>
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <User className="h-[18px] w-[18px]" />
                      </span>
                      <input
                        type="text"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        onFocus={() => setFocusedField('username')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full bg-transparent px-11 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                        placeholder="Choose an admin username"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t.passwordLabel}</label>
                    <div className={`relative rounded-xl border transition-all duration-200 ${
                      focusedField === 'password'
                        ? 'border-violet-400/50 ring-2 ring-violet-500/20 bg-white/[0.06]'
                        : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]'
                    }`}>
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <Lock className="h-[18px] w-[18px]" />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full bg-transparent px-11 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                        placeholder="Create a strong password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password strength */}
                    {password && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                i <= passwordStrength.level ? passwordStrength.color : 'bg-white/[0.08]'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Password strength: <span className="text-slate-400">{passwordStrength.label}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Confirm Password</label>
                    <div className={`relative rounded-xl border transition-all duration-200 ${
                      focusedField === 'confirm'
                        ? 'border-violet-400/50 ring-2 ring-violet-500/20 bg-white/[0.06]'
                        : confirmPassword && confirmPassword !== password
                          ? 'border-red-500/40 bg-white/[0.03]'
                          : confirmPassword && confirmPassword === password
                            ? 'border-emerald-500/40 bg-white/[0.03]'
                            : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]'
                    }`}>
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <Lock className="h-[18px] w-[18px]" />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        onFocus={() => setFocusedField('confirm')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full bg-transparent px-11 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                        placeholder="Confirm your password"
                        required
                      />
                      {confirmPassword && (
                        <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium ${
                          confirmPassword === password ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {confirmPassword === password ? 'Match' : 'Mismatch'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 backdrop-blur-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                      <span className="text-sm text-red-200 leading-relaxed">{error}</span>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/30 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
                  >
                    <span className="relative flex items-center justify-center gap-2">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Creating account...</span>
                        </>
                      ) : (
                        <>
                          <span>{t.createAdminButton}</span>
                          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </>
                      )}
                    </span>
                  </button>

                  {/* Footer */}
                  <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-500">
                    <Shield className="h-3 w-3" />
                    <span>PBKDF2-SHA512 encrypted</span>
                    <span className="mx-1">·</span>
                    <span>120,000 iterations</span>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSetupPage;
