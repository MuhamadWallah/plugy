import React, { useState } from 'react';
import { LogIn, Mail, Lock, AlertCircle, ArrowRight, Sparkles, Phone, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiError } from '../utils/format';

interface LoginPageProps {
  onSwitchToRegister: () => void;
  onSuccess: () => void;
}

const inputClass =
  'w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-white placeholder-slate-500 outline-none transition';

/**
 * Password reset with a code sent by SMS to the account's verified phone number.
 */
const ForgotPassword: React.FC<{ onBack: () => void; onDone: () => void }> = ({ onBack, onDone }) => {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not send a reset code'));
      const data = await res.json();
      setDevCode(data.devOtp ?? null);
      setNotice(data.message);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset code');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Choose a password with at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: phone.trim(), otp: code.trim(), password }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not reset the password'));
      await refreshUser();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </button>
      <div>
        <h2 className="text-xl font-bold text-white">Reset your password</h2>
        <p className="text-xs text-slate-400 mt-1">We'll send a 6-digit code to the phone number on your account.</p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {notice && step === 'code' && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
        </div>
      )}
      {devCode && (
        <p className="text-[11px] text-amber-300">Development mode: your code is <strong className="font-mono">{devCode}</strong></p>
      )}

      {step === 'phone' ? (
        <form onSubmit={requestCode} className="space-y-3">
          <label htmlFor="reset-phone" className="block text-xs font-semibold text-slate-300">Phone number</label>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input id="reset-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+263 77 123 4567" className={inputClass} />
          </div>
          <button type="submit" disabled={busy || phone.trim().length < 7} className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm disabled:opacity-50">
            Send reset code
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-3">
          <label htmlFor="reset-code" className="block text-xs font-semibold text-slate-300">6-digit code</label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="reset-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className={`${inputClass} font-mono tracking-widest`}
            />
          </div>
          <label htmlFor="reset-password" className="block text-xs font-semibold text-slate-300">New password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input id="reset-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className={inputClass} />
          </div>
          <button type="submit" disabled={busy || code.length !== 6} className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm disabled:opacity-50">
            Set new password and sign in
          </button>
          <button type="button" onClick={() => setStep('phone')} className="w-full text-xs text-slate-400 hover:text-white">
            Didn't get a code? Send again
          </button>
        </form>
      )}
      <p className="text-[11px] text-slate-500">Resetting your password signs you out on all other devices.</p>
    </div>
  );
};

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToRegister, onSuccess }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      await login({ email, password });
      onSuccess();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto w-full my-6">
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {forgot ? (
          <ForgotPassword onBack={() => setForgot(false)} onDone={onSuccess} />
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
                <LogIn className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
              <p className="text-xs text-slate-400 mt-1">One account to post jobs and to work</p>
            </div>

            {localError && (
              <div role="alert" className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">{localError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300">Password</label>
                  <button type="button" onClick={() => setForgot(true)} className="text-xs text-emerald-400 hover:text-emerald-300">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>

              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={() => {
                    setEmail('demo@plugy.dev');
                    setPassword('PlugySecret123!');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-dashed border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Fill demo credentials (dev)
                </button>
              )}
            </form>

            <div className="mt-6 pt-5 border-t border-slate-800/80 text-center text-xs text-slate-400">
              Don't have an account?{' '}
              <button onClick={onSwitchToRegister} className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4 cursor-pointer">
                Create one now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
