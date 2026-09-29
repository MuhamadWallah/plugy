import React from 'react';
import { Zap, LogOut, User as UserIcon, Star, PlusCircle, LayoutList, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavView = 'feed' | 'my-jobs' | 'post-job' | 'dashboard' | 'login' | 'register';

interface NavbarProps {
  currentView: NavView;
  setCurrentView: (view: NavView) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setCurrentView }) => {
  const { user, logout, loading } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => setCurrentView('feed')}
            className="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Plugy
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  v0.5 Lifecycle
                </span>
              </span>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setCurrentView('feed')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                currentView === 'feed'
                  ? 'bg-slate-900 text-emerald-400 border border-slate-800'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Browse Jobs
            </button>

            {user && (
              <>
                <button
                  onClick={() => setCurrentView('my-jobs')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    currentView === 'my-jobs'
                      ? 'bg-slate-900 text-emerald-400 border border-slate-800'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  My Jobs
                </button>

                <button
                  onClick={() => setCurrentView('dashboard')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    currentView === 'dashboard'
                      ? 'bg-slate-900 text-emerald-400 border border-slate-800'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  My Account
                </button>
              </>
            )}
          </nav>
        </div>

        {/* User state / Auth actions */}
        <div className="flex items-center gap-3">
          {/* Post a Job button */}
          <button
            onClick={() => setCurrentView('post-job')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer ${
              currentView === 'post-job'
                ? 'bg-emerald-400 text-slate-950 shadow-emerald-500/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
            Post a Job
          </button>

          {loading ? (
            <div className="h-8 w-24 bg-slate-800/60 animate-pulse rounded-lg"></div>
          ) : user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setCurrentView('my-jobs')}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-white leading-tight">{user.name}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>{Number(user.rating_avg).toFixed(1)} ({user.rating_count})</span>
                  </div>
                </div>
              </button>

              <button
                onClick={() => logout()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-800 hover:border-rose-900/50 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('login')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  currentView === 'login'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setCurrentView('register')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition cursor-pointer"
              >
                <UserIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                Register
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
