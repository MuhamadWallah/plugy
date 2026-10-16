import React, { useState } from 'react';
import { Settings, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readApiError } from '../utils/format';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-white placeholder-slate-500 outline-none';

/** Name, password and account deletion */
export const AccountSettings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  if (!user) return null;

  const call = async (key: string, url: string, method: string, body: unknown, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Something went wrong'));
      setMessage({ text: success, ok: true });
      return true;
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Something went wrong', ok: false });
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-5" aria-labelledby="settings-heading">
      <h2 id="settings-heading" className="text-sm font-black text-white flex items-center gap-2">
        <Settings className="w-4 h-4 text-slate-300" /> Account settings
      </h2>

      {message && (
        <p role="status" className={`text-xs flex gap-1.5 ${message.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
          {message.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {message.text}
        </p>
      )}

      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call('name', '/api/users/me', 'PATCH', { name }, 'Name updated.')) await refreshUser();
        }}
      >
        <label htmlFor="settings-name" className="block text-xs font-bold text-slate-300">Your name</label>
        <div className="flex gap-2">
          <input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} />
          <button type="submit" disabled={busy === 'name' || name.trim() === user.name} className="px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold disabled:opacity-40">
            Save
          </button>
        </div>
      </form>

      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call(
            'password',
            '/api/auth/change-password',
            'POST',
            { current_password: currentPassword, new_password: newPassword },
            'Password changed. Other devices have been signed out.'
          );
          if (ok) {
            setCurrentPassword('');
            setNewPassword('');
          }
        }}
      >
        <p className="text-xs font-bold text-slate-300">Change password</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" aria-label="Current password" className={inputClass} />
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (6+ characters)" aria-label="New password" className={inputClass} />
        </div>
        <button type="submit" disabled={busy === 'password' || !currentPassword || newPassword.length < 6} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold disabled:opacity-40">
          Change password
        </button>
      </form>

      <div className="pt-4 border-t border-slate-800 space-y-2">
        {!deleting ? (
          <button onClick={() => setDeleting(true)} className="text-xs font-bold text-rose-300 hover:text-rose-200 flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete my account
          </button>
        ) : (
          <form
            className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await call('delete', '/api/users/me', 'DELETE', { password: deletePassword }, 'Your account has been deleted.');
              if (ok) await refreshUser();
            }}
          >
            <p className="text-sm font-black text-white">Delete your account?</p>
            <ul className="text-xs text-rose-100/90 list-disc pl-4 space-y-1">
              <li>Your name, email, phone number, photos and ID documents are removed.</li>
              <li>Your open requests are cancelled and your pending offers withdrawn.</li>
              <li>Past jobs, messages and reviews stay for the other people involved, shown as "Deleted user".</li>
              <li>This can't be undone.</li>
            </ul>
            <input type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Enter your password to confirm" aria-label="Password to confirm deletion" className={inputClass} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleting(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">
                Keep my account
              </button>
              <button type="submit" disabled={busy === 'delete' || !deletePassword} className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black disabled:opacity-50">
                Delete permanently
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
};
