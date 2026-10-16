import React from 'react';
import { Mail, Phone, ShieldCheck, ShieldAlert, Briefcase, HandMetal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ProfileSummary } from '../components/ProfileModal';
import { NotificationSettings } from '../components/NotificationSettings';
import { ProfilePhotoControl } from '../components/ProfilePhotoControl';
import { VerificationCard } from '../components/VerificationCard';
import { EarningsCard } from '../components/EarningsCard';
import { AccountSettings } from '../components/AccountSettings';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <section className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h1 className="text-lg font-black text-white">Your profile</h1>
        <ProfilePhotoControl />
        <p className="text-xs text-slate-400 pt-2 border-t border-slate-800">This is what customers and workers see when they view your profile:</p>
        <ProfileSummary key={user.avatar_url ?? 'none'} userId={user.id} />
      </section>

      <EarningsCard />

      <VerificationCard />

      <NotificationSettings />

      <section className="p-5 sm:p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
        <h2 className="text-sm font-black text-white">Private account details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
              <Mail className="w-3.5 h-3.5" /> Email
            </span>
            <span className="font-semibold text-slate-200 break-all">{user.email}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
              <Phone className="w-3.5 h-3.5" /> Phone
            </span>
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              {user.phone || 'Not added'}
              {user.phone &&
                (user.phone_verified !== false ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" aria-label="Verified" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-400" aria-label="Not verified" />
                ))}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          Your phone number is shared only with the person you are matched with, after a worker is hired.
        </p>
      </section>

      <AccountSettings />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3.5">
          <Briefcase className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Need help?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Post a job with your price and location. Nearby workers accept it or offer their own price, and you choose who to hire.
            </p>
          </div>
        </div>
        <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3.5">
          <HandMetal className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Want to earn?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Browse jobs near you, accept the customer's price or offer yours, then navigate there and get rated.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
