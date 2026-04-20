import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertTriangle, Shield } from 'lucide-react';

const formatAuthError = (result, fallbackMessage) => {
  const rawError = String(result?.error || fallbackMessage || 'Request failed');
  const normalized = rawError.toLowerCase();

  if (normalized.includes('invalid credentials')) {
    return 'Invalid username or password.';
  }
  if (normalized.includes('deactive') || normalized.includes('inactive')) {
    return 'Your account is inactive. Please contact the administrator.';
  }

  const isConnectivityError =
    normalized.includes('database connection failed') ||
    normalized.includes('econnrefused') ||
    normalized.includes('enotfound') ||
    normalized.includes('etimedout') ||
    normalized.includes('econnaborted') ||
    normalized.includes('eai_again') ||
    normalized.includes('route not found') ||
    normalized.includes('server api') ||
    normalized.includes('network');

  if (isConnectivityError) {
    return 'Unable to connect to server. Please try again.';
  }

  return 'Login failed. Please try again.';
};

function LoginPage({ t, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    const result = await onLogin({ username: username.trim(), password });
    setIsSubmitting(false);

    if (!result.success) {
      setError(formatAuthError(result, 'Login failed'));
    }
  };

  return (
    <div className="login-page min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-[520px]">
          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/70 p-8 shadow-xl">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Sign in</h2>
              <p className="mt-2 text-sm text-slate-400">Enter your credentials to access your workspace</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Username */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t.usernameLabel}</label>
                    <div className="relative rounded-xl border border-white/[0.08] bg-white/[0.03] transition-all duration-200 hover:border-white/[0.15] focus-within:border-cyan-400/50 focus-within:ring-2 focus-within:ring-cyan-500/20 focus-within:bg-white/[0.06]">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <User className="h-[18px] w-[18px]" />
                      </span>
                      <input
                        type="text"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        className="w-full bg-transparent px-11 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                        placeholder="Enter your username"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t.passwordLabel}</label>
                    <div className="relative rounded-xl border border-white/[0.08] bg-white/[0.03] transition-all duration-200 hover:border-white/[0.15] focus-within:border-cyan-400/50 focus-within:ring-2 focus-within:ring-cyan-500/20 focus-within:bg-white/[0.06]">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <Lock className="h-[18px] w-[18px]" />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full bg-transparent px-11 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                        placeholder="Enter your password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-slate-300 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
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
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/30 hover:brightness-110 focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
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
  );
}

export default LoginPage;
