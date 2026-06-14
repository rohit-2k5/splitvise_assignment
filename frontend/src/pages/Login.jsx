import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SplitSquareVertical, ArrowRight, Mail, Lock, Sparkles } from 'lucide-react';

const Login = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields'); return; }

    setSubmitting(true);
    try {
      const res = await login(email, password);
      if (res.success) navigate('/dashboard');
      else setError(res.message);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4 py-12">
      {/* Ambient glow orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-700/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md space-y-8 animate-slide-up relative z-10">
        {/* Logo & Heading */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand shadow-glow-teal pulse-ring">
              <SplitSquareVertical className="h-7 w-7 text-surface-900" />
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to manage your shared expenses
          </p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-card border border-white/5">
          {/* Feature pill */}
          <div className="flex items-center gap-1.5 mb-6 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 w-fit mx-auto">
            <Sparkles className="h-3 w-3 text-brand-400" />
            <span className="text-[11px] font-semibold text-brand-400 tracking-wide">SplitVise — Smart Bill Splitting</span>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 text-sm font-medium text-red-400 flex items-start gap-2">
                <span>⚠</span> {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 pointer-events-none">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-dark input-dark-icon"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 pointer-events-none">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-dark input-dark-icon"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-brand w-full flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-900 border-t-transparent" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-brand-400 hover:text-brand-300 transition-colors">
            Create one free →
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
