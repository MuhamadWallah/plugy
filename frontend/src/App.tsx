import { useEffect, useState } from 'react';
import { 
  RefreshCw,
  Database,
  Layers
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Navbar, NavView } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateJobForm } from './components/CreateJobForm';
import { JobDetailModal } from './components/JobDetailModal';
import { JobFeed } from './components/JobFeed';
import { MyJobs } from './components/MyJobs';
import { sound } from './utils/sound';

interface HealthData {
  status: string;
  service: string;
  timestamp: string;
  database: {
    connected: boolean;
    latencyMs?: number;
    dbTime?: string;
    categoryCount?: number;
  };
}

function MainApp() {
  const { user, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<NavView>('feed');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);

  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error('Health check error:', err);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  // When user signs in or registers, switch view back to feed
  useEffect(() => {
    if (user && (currentView === 'login' || currentView === 'register')) {
      setCurrentView('feed');
    }
  }, [user, currentView]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-400 tracking-wider font-semibold">Verifying secure session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-slate-950">
      {/* Background radial gradient glow (Full Screen Edge-to-Edge) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/4 w-[800px] h-[550px] bg-emerald-500/10 blur-[150px] rounded-full"></div>
        <div className="absolute top-1/3 -right-32 w-[600px] h-[600px] bg-teal-500/8 blur-[160px] rounded-full"></div>
        <div className="absolute -bottom-32 left-1/3 w-[700px] h-[500px] bg-cyan-500/8 blur-[170px] rounded-full"></div>
      </div>

      {/* Full-Width Navigation */}
      <Navbar currentView={currentView} setCurrentView={setCurrentView} />

      {/* Main Full-Width Responsive Body */}
      <main className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6 flex-1 space-y-6">
        {/* View: Browse Jobs Live Feed */}
        {currentView === 'feed' && (
          <JobFeed
            onSelectJob={(jobId) => setSelectedJobId(jobId)}
            onRequireAuth={() => setCurrentView('login')}
            onNavigateToPostJob={() => setCurrentView('post-job')}
          />
        )}

        {/* View: Post a Job Studio */}
        {currentView === 'post-job' && (
          <CreateJobForm
            onJobCreated={(job) => {
              setSelectedJobId(job.id);
            }}
            onRequireAuth={() => setCurrentView('login')}
          />
        )}

        {/* View: My Jobs Management */}
        {currentView === 'my-jobs' && user && (
          <MyJobs
            onSelectJob={(jobId) => setSelectedJobId(jobId)}
            onNavigateToPostJob={() => setCurrentView('post-job')}
            onNavigateToFeed={() => setCurrentView('feed')}
          />
        )}

        {/* View: Account & Diagnostics Dashboard */}
        {currentView === 'dashboard' && user && (
          <div className="max-w-5xl mx-auto w-full">
            <DashboardPage />
          </div>
        )}

        {/* View: Login Page */}
        {currentView === 'login' && !user && (
          <div className="max-w-md mx-auto w-full py-8">
            <LoginPage
              onSwitchToRegister={() => setCurrentView('register')}
              onSuccess={() => setCurrentView('feed')}
            />
          </div>
        )}

        {/* View: Register Page */}
        {currentView === 'register' && !user && (
          <div className="max-w-md mx-auto w-full py-8">
            <RegisterPage
              onSwitchToLogin={() => setCurrentView('login')}
              onSuccess={() => setCurrentView('feed')}
            />
          </div>
        )}
      </main>

      {/* Modal: Job Details & Chat Workspace */}
      {selectedJobId && (
        <JobDetailModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}

      {/* Full-Width Interactive Footer & Live Service Status Bar */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md py-4">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          {/* Service status */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold text-slate-300">Plugy On-Demand Engine</span>
            </div>
            <span>&bull;</span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>PostgreSQL: <strong className="text-emerald-400">{health?.database?.connected ? 'Online' : 'Offline'}</strong></span>
              {health?.database?.latencyMs !== undefined && (
                <span className="font-mono text-[11px] text-slate-500">({health.database.latencyMs}ms)</span>
              )}
            </div>
            <span>&bull;</span>
            <div className="flex items-center gap-1 text-slate-400">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>{health?.database?.categoryCount || 6} Service Categories</span>
            </div>
          </div>

          {/* Right info & ping button */}
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-slate-500">
              InDrive-inspired Local Small-Jobs Marketplace
            </span>

            <button
              onClick={() => {
                sound.playTap();
                fetchHealth();
              }}
              disabled={healthLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer text-[11px]"
              title="Ping Backend Health API"
            >
              <RefreshCw className={`w-3 h-3 ${healthLoading ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Ping</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <MainApp />
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
