import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Clock, IdCard, AlertCircle, Camera, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { shrinkImage, uploadImages } from '../utils/image';

interface VerificationStatus {
  id_verified: boolean;
  status: 'none' | 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
}

const DOC_TYPES = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's licence" },
];

const PhotoPick: React.FC<{ label: string; hint: string; file: File | null; capture?: 'user' | 'environment'; onPick: (f: File) => void }> = ({
  label,
  hint,
  file,
  capture,
  onPick,
}) => (
  <label className="block p-3 rounded-2xl bg-slate-950 border border-dashed border-slate-700 hover:border-emerald-500/60 cursor-pointer">
    <span className="text-xs font-bold text-white flex items-center gap-1.5">
      <Camera className="w-3.5 h-3.5 text-emerald-400" /> {label}
    </span>
    <span className="block text-[11px] text-slate-400 mt-0.5">{file ? `Selected: ${file.name}` : hint}</span>
    <input
      type="file"
      accept="image/*"
      capture={capture}
      className="sr-only"
      aria-label={label}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onPick(f);
      }}
    />
  </label>
);

/**
 * Identity check: workers submit an ID document and a selfie; an admin reviews them.
 * Required for babysitting and care jobs; shows as an "ID verified" badge everywhere.
 */
export const VerificationCard: React.FC = () => {
  const { refreshUser } = useAuth();
  const { socket } = useSocket();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState('national_id');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/users/me/verification', { credentials: 'include' });
    if (res.ok) setStatus((await res.json()).verification);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live update when an admin reviews the submission
  useEffect(() => {
    if (!socket) return;
    const onReviewed = () => {
      load();
      refreshUser();
    };
    socket.on('verification:reviewed', onReviewed);
    return () => {
      socket.off('verification:reviewed', onReviewed);
    };
  }, [socket, load, refreshUser]);

  const submit = async () => {
    if (!documentFile || !selfieFile) {
      setError('Add a photo of your ID document and a selfie.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [doc, selfie] = await Promise.all([shrinkImage(documentFile, 2000, 0.9), shrinkImage(selfieFile, 1200)]);
      await uploadImages('/api/users/me/verification', { document: doc, selfie }, { document_type: docType });
      setOpen(false);
      setDocumentFile(null);
      setSelfieFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your ID');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3" aria-labelledby="verify-heading">
      <h2 id="verify-heading" className="text-sm font-black text-white flex items-center gap-2">
        <IdCard className="w-4 h-4 text-sky-300" /> ID verification
      </h2>

      {status.id_verified ? (
        <p className="text-sm text-sky-200 flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-sky-300" /> Your ID is verified. Customers see the badge on your profile and offers.
        </p>
      ) : status.status === 'pending' ? (
        <p className="text-sm text-amber-200 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Your ID is being reviewed. You'll be notified when it's done.
        </p>
      ) : (
        <>
          {status.status === 'rejected' && (
            <p className="text-sm text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Your last submission wasn't accepted: {status.rejection_reason}
            </p>
          )}
          <p className="text-sm text-slate-300">
            Verify your ID to get the <strong className="text-sky-300">ID verified</strong> badge and to offer on babysitting and care jobs.
          </p>
          {!open ? (
            <button onClick={() => setOpen(true)} className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black">
              {status.status === 'rejected' ? 'Submit again' : 'Verify my ID'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Document type">
                {DOC_TYPES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    role="radio"
                    aria-checked={docType === d.value}
                    onClick={() => setDocType(d.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${docType === d.value ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-950 text-slate-300 border-slate-800'}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <PhotoPick label="Photo of your ID" hint="All corners visible, no glare" file={documentFile} capture="environment" onPick={setDocumentFile} />
                <PhotoPick label="A selfie" hint="Your face clearly visible" file={selfieFile} capture="user" onPick={setSelfieFile} />
              </div>
              {error && (
                <p role="alert" className="text-xs text-rose-300 flex gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy && <RefreshCw className="w-4 h-4 animate-spin" />} Submit for review
                </button>
              </div>
              <p className="text-[11px] text-slate-500">Your documents are stored privately and only seen by the Plugy review team.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
