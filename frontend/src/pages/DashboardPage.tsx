import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Mail, 
  Star, 
  Calendar, 
  Fingerprint, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Briefcase, 
  HandMetal 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [testResult, setTestResult] = useState<{ status: number; data: unknown } | null>(null);
  const [testing, setTesting] = useState(false);

  const testProtectedRoute = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/protected-test', {
        credentials: 'include',
      });
      const data = await res.json();
      setTestResult({ status: res.status, data });
    } catch (err) {
      setTestResult({
        status: 500,
        data: { error: err instanceof Error ? err.message : 'Request failed' },
      });
    } finally {
      setTesting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Welcome Banner */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none"></div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 font-black text-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white tracking-tight">{user.name}</h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Authenticated Session
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <span>{user.email}</span>
                {user.phone && <span>&bull; {user.phone}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <div className="px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Rating</span>
              <div className="text-sm font-bold text-white flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>{Number(user.rating_avg).toFixed(1)}</span>
                <span className="text-slate-500 text-xs font-normal">({user.rating_count})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unified Role Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Job Poster Capabilities</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Post service requests (cleaning, gardening, car wash, etc.) with description, location, and your proposed budget.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <HandMetal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Job Worker Capabilities</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Browse the live feed of local jobs nearby and accept ones you wish to do in real-time, just like an on-demand courier.
            </p>
          </div>
        </div>
      </div>

      {/* User Session Profile & Security Inspector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Active Session & Security Diagnostics</h2>
            <p className="text-xs text-slate-400">Inspecting JWT httpOnly cookie verification & protected route access</p>
          </div>
          <button
            onClick={() => refreshUser()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-verify Session
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
              <Fingerprint className="w-3.5 h-3.5 text-slate-500" />
              User UUID
            </span>
            <div className="text-xs font-mono text-slate-200 truncate">{user.id}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              Verified Email
            </span>
            <div className="text-xs font-semibold text-slate-200 truncate">{user.email}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Member Since
            </span>
            <div className="text-xs text-slate-200">
              {new Date(user.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Live Protected Route Tester */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Live Middleware Route Test
              </span>
              <p className="text-[11px] text-slate-400">
                Executes <code className="text-emerald-300">GET /api/protected-test</code> with your httpOnly cookie
              </p>
            </div>

            <button
              onClick={testProtectedRoute}
              disabled={testing}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              Run Protected Test
            </button>
          </div>

          {testResult && (
            <div className={`mt-3 p-3 rounded-lg border text-xs font-mono ${
              testResult.status === 200
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            }`}>
              <div className="flex items-center gap-1.5 font-bold mb-1">
                {testResult.status === 200 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                HTTP {testResult.status} Response
              </div>
              <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
