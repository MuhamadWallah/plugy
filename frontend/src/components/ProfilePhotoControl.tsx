import React, { useRef, useState } from 'react';
import { Camera, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { shrinkImage, uploadImages } from '../utils/image';
import { Avatar } from './Avatar';

/** Lets the signed-in user add, change or remove their profile photo */
export const ProfilePhotoControl: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadImages('/api/users/me/avatar', { photo: await shrinkImage(file, 1024) });
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/users/me/avatar', { method: 'DELETE', credentials: 'include' });
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={user.name} url={user.avatar_url} size="xl" />
        {busy && (
          <div className="absolute inset-0 rounded-3xl bg-slate-950/70 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" /> {user.avatar_url ? 'Change photo' : 'Add a photo'}
          </button>
          {user.avatar_url && (
            <button type="button" onClick={remove} disabled={busy} className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500">A clear photo of your face helps people trust your offers and requests.</p>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} aria-label="Choose a profile photo" />
      </div>
    </div>
  );
};
