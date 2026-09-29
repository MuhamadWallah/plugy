import React, { useState } from 'react';
import { 
  Zap, 
  LogOut, 
  User as UserIcon, 
  Star, 
  PlusCircle, 
  LayoutList, 
  Briefcase, 
  Volume2, 
  VolumeX, 
  Menu, 
  X,
  Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { sound } from '../utils/sound';

export type NavView = 'feed' | 'my-jobs' | 'post-job' | 'dashboard' | 'login' | 'register';

interface NavbarProps {
  currentView: NavView;
  setCurrentView: (view: NavView) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setCurrentView }) => {
  const { user, logout, loading } = useAuth();
  const { connected: socketConnected } = useSocket();
  const [soundActive, setSoundActive] = useState(() => sound.isEnabled());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleToggleSound = () => {
    const next = sound.toggle();
    setSoundActive(next);
  };

  const handleNavigate = (view: NavView) => {
    sound.playTap();
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl transition-all">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 h-16 flex items-center justify-between">
        {/* Left Section: Brand & Live Market Indicator */}
        <div className="flex items-center gap-6 lg:gap-8">
          <button
            onClick={() => handleNavigate('feed')}
            className="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 group-hover:scale-105 group-hover:shadow-emerald-500/40 transition-all duration-200">
              <Zap className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                Plugy
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
                  Marketplace
                </span>
              </span>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => handleNavigate('feed')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                currentView === 'feed'
                  ? 'bg-slate-900 text-emerald-400 border border-slate-800 shadow-inner'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Browse Jobs
            </button>

            {user && (
              <>
                <button
                  onClick={() => handleNavigate('my-jobs')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    currentView === 'my-jobs'
                      ? 'bg-slate-900 text-emerald-400 border border-slate-800 shadow-inner'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  My Jobs
                </button>

                <button
                  onClick={() => handleNavigate('dashboard')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    currentView === 'dashboard'
                      ? 'bg-slate-900 text-emerald-400 border border-slate-800 shadow-inner'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  My Account
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Center / Pulse Ticker (Desktop only) */}
        <div className="hidden xl:flex items-center gap-3 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800/80 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Radio className={`w-3 h-3 ${socketConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span className="font-semibold text-slate-300">
              {socketConnected ? 'Live Network Connected' : 'Reconnecting...'}
            </span>
          </div>
          <span>&bull;</span>
          <span className="text-slate-400">Real-time InDrive Courier Dispatch</span>
        </div>

        {/* Right Section: Sound toggle, Post a Job, Profile / Auth Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Sound FX Toggle Button */}
          <button
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
              soundActive
                ? 'bg-slate-900/80 border-slate-800 text-emerald-400 hover:text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400'
            }`}
            title={soundActive ? 'Sound Effects Enabled (Click to Mute)' : 'Sound Effects Muted (Click to Enable)'}
          >
            {soundActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Post a Job button */}
          <button
            onClick={() => handleNavigate('post-job')}
            className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition shadow-md cursor-pointer ${
              currentView === 'post-job'
                ? 'bg-emerald-400 text-slate-950 shadow-emerald-500/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden xs:inline">Post a Job</span>
          </button>

          {loading ? (
            <div className="h-8 w-24 bg-slate-800/60 animate-pulse rounded-lg"></div>
          ) : user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleNavigate('dashboard')}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-black">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-white leading-tight">{user.name}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                    <span>{Number(user.rating_avg).toFixed(1)}</span>
                    <span className="text-slate-500 font-normal">({user.rating_count})</span>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  sound.playTap();
                  logout();
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 bg-slate-900/80 border border-slate-800 hover:border-rose-900/50 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleNavigate('login')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  currentView === 'login'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => handleNavigate('register')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition cursor-pointer"
              >
                <UserIcon className="w-3.5 h-3.5" />
                Register
              </button>
            </div>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 py-4 bg-slate-950 border-b border-slate-800 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <button
            onClick={() => handleNavigate('feed')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
              currentView === 'feed' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-900/50'
            }`}
          >
            <LayoutList className="w-4 h-4" />
            Browse Jobs Live Board
          </button>

          {user && (
            <>
              <button
                onClick={() => handleNavigate('my-jobs')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
                  currentView === 'my-jobs' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-900/50'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                My Jobs & Contracts
              </button>

              <button
                onClick={() => handleNavigate('dashboard')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
                  currentView === 'dashboard' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-900/50'
                }`}
              >
                <UserIcon className="w-4 h-4" />
                Account & Security Settings
              </button>
            </>
          )}

          {!user && (
            <div className="pt-2 flex gap-2">
              <button
                onClick={() => handleNavigate('login')}
                className="flex-1 py-2 text-center rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-white"
              >
                Sign In
              </button>
              <button
                onClick={() => handleNavigate('register')}
                className="flex-1 py-2 text-center rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold"
              >
                Register
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
