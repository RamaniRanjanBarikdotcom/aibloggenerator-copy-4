import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertTriangle, Shield, Zap, Globe, Sparkles } from 'lucide-react';

function LoginPage({ t, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    const result = await onLogin({ username: username.trim(), password });
    setIsSubmitting(false);

    if (!result.success) {
      const rawError = result.error || 'Login failed';
      if (
        rawError.includes('Database connection failed') ||
        rawError.includes('SSL') ||
        rawError.includes('TLSV1')
      ) {
        setError(
          'Cannot connect to database. Please check your internet connection and ensure MongoDB Atlas is active and your IP is whitelisted.'
        );
      } else {
        setError(rawError);
      }
    }
  };

  const features = [
    { icon: Zap, title: 'AI-Powered Writing', desc: 'Generate SEO-optimized blog posts with advanced AI models' },
    { icon: Globe, title: 'One-Click Publishing', desc: 'Publish directly to WordPress and Shopify stores' },
    { icon: Shield, title: 'Enterprise Security', desc: 'Role-based access with encrypted credentials' },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-slate-100 overflow-hidden">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10%] h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute right-[-15%] top-[10%] h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[-20%] left-[20%] h-[600px] w-[600px] rounded-full bg-indigo-500/8 blur-[140px] animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      {/* Subtle grid pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <div className="grid w-full max-w-[1100px] grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Left Panel - Branding */}
          <div className="hidden lg:flex flex-col justify-between rounded-3xl border border-white/[0.08] bg-white/[0.03] p-10 backdrop-blur-2xl">
            <div>
              {/* Logo */}
              <div className="flex items-center gap-3 mb-12">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <span className="text-lg font-semibold text-white tracking-tight">AI Blog Generator</span>
                  <span className="ml-2 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 uppercase tracking-wider">Pro</span>
                </div>
              </div>

              {/* Heading */}
              <h1 className="text-[2.5rem] font-bold leading-[1.15] tracking-tight text-white">
                {t.loginTitle}
              </h1>
              <p className="mt-4 text-base leading-relaxed text-slate-300/80 max-w-sm">
                {t.loginSubtitle}. Your AI-powered content creation workspace awaits.
              </p>

              {/* Feature cards */}
              <div className="mt-10 space-y-3">
                {features.map((feature) => (
                  <div
                    key={feature.title}
                    className="group flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.12]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-300 transition-transform duration-300 group-hover:scale-110">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{feature.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom stats */}
            <div className="mt-10 flex items-center gap-6 border-t border-white/[0.06] pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">99.9%</p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Uptime</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <p className="text-2xl font-bold text-white">AES-256</p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Encryption</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <p className="text-2xl font-bold text-white">RBAC</p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Access Control</p>
              </div>
            </div>
          </div>

          {/* Right Panel - Login Form */}
          <div className="flex flex-col justify-center">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-white">AI Blog Generator</span>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-900/60 shadow-2xl shadow-black/20 backdrop-blur-2xl">
              {/* Top glow */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="p-8 sm:p-10">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-white tracking-tight">Sign in</h2>
                  <p className="mt-2 text-sm text-slate-400">Enter your credentials to access your workspace</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Username */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t.usernameLabel}</label>
                    <div className={`relative rounded-xl border transition-all duration-200 ${focusedField === 'username'
                        ? 'border-cyan-400/50 ring-2 ring-cyan-500/20 bg-white/[0.06]'
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
                        placeholder="Enter your username"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t.passwordLabel}</label>
                    <div className={`relative rounded-xl border transition-all duration-200 ${focusedField === 'password'
                        ? 'border-cyan-400/50 ring-2 ring-cyan-500/20 bg-white/[0.06]'
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
                        placeholder="Enter your password"
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
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/30 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
                  >
                    <span className="relative flex items-center justify-center gap-2">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <span>{t.loginButton}</span>
                          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </>
                      )}
                    </span>
                  </button>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500">Need access? Contact your administrator.</span>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Shield className="h-3 w-3" />
                      <span>Secure Login</span>
                    </div>
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

export default LoginPage;
