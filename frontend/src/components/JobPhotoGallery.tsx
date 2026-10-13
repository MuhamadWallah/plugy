import React, { useRef, useState } from 'react';
import { ImagePlus, X, RefreshCw } from 'lucide-react';
import { JobPhoto } from '../types/marketplace';
import { shrinkImage, uploadImages } from '../utils/image';
import { Portal } from './Portal';

export const MAX_JOB_PHOTOS = 4;

interface JobPhotoGalleryProps {
  jobId: string;
  photos: JobPhoto[];
  canEdit: boolean;
  onChanged: () => void;
}

/** Photos of the job; tap to enlarge. The poster can add or remove photos before work starts. */
export const JobPhotoGallery: React.FC<JobPhotoGalleryProps> = ({ jobId, photos, canEdit, onChanged }) => {
  const [viewing, setViewing] = useState<JobPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (photos.length === 0 && !canEdit) return null;

  const add = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_JOB_PHOTOS - photos.length);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        await uploadImages(`/api/jobs/${jobId}/photos`, { photo: await shrinkImage(file, 1600) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo');
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const remove = async (photo: JobPhoto) => {
    setBusy(true);
    await fetch(`/api/jobs/${jobId}/photos/${photo.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    setBusy(false);
    onChanged();
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Photos</h4>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((photo, i) => (
          <div key={photo.id} className="relative aspect-square">
            <button
              type="button"
              onClick={() => setViewing(photo)}
              className="w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950"
              aria-label={`View photo ${i + 1}`}
            >
              <img src={photo.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => remove(photo)}
                disabled={busy}
                className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-slate-950 border border-slate-700 text-slate-300 hover:text-rose-300"
                aria-label={`Remove photo ${i + 1}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {canEdit && photos.length < MAX_JOB_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="aspect-square rounded-xl border border-dashed border-slate-700 hover:border-emerald-500/60 text-slate-400 hover:text-emerald-300 flex flex-col items-center justify-center gap-1 text-[10px] font-bold"
          >
            {busy ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
            Add photo
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={add} aria-label="Add job photos" />

      {viewing && (
        <Portal>
          <div className="fixed inset-0 z-[80] bg-slate-950/95 flex items-center justify-center p-3" onClick={() => setViewing(null)} role="dialog" aria-label="Photo">
            <img src={viewing.url} alt="" className="max-w-full max-h-full rounded-2xl" />
            <button className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white" aria-label="Close photo">
              <X className="w-5 h-5" />
            </button>
          </div>
        </Portal>
      )}
    </div>
  );
};
