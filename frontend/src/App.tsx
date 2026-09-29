import { useEffect, useState } from 'react';
import { 
  RefreshCw, 
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
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-400 tracking-wider">Verifying session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Background radial gradient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-emerald-500/10 blur-[130px] rounded-full"></div>
        <div className="absolute top-1/2 -left-32 w-[400px] h-[400px] bg-teal-500/10 blur-[100px] rounded-full"></div>
      </div>

      {/* Navigation */}
      <Navbar currentView={currentView} setCurrentView={setCurrentView} />

      {/* Main Body */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8">
        {/* View: Browse Jobs Live Feed */}
        {currentView === 'feed' && (
          <JobFeed
            onSelectJob={(jobId) => setSelectedJobId(jobId)}
            onRequireAuth={() => setCurrentView('login')}
            onNavigateToPostJob={() => setCurrentView('post-job')}
          />
        )}

        {/* View: Post a Job Form */}
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
          <DashboardPage />
        )}

        {/* View: Login Page */}
        {currentView === 'login' && !user && (
          <LoginPage
            onSwitchToRegister={() => setCurrentView('register')}
            onSuccess={() => setCurrentView('feed')}
          />
        )}

        {/* View: Register Page */}
        {currentView === 'register' && !user && (
          <RegisterPage
            onSwitchToLogin={() => setCurrentView('login')}
            onSuccess={() => setCurrentView('feed')}
          />
        )}

        {/* Backend & DB Health Bar */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>API & Socket.IO: <strong>{health?.service || 'plugy-backend'}</strong></span>
            <span>&bull;</span>
            <span>PostgreSQL: <strong className="text-emerald-400">{health?.database?.connected ? 'Online' : 'Offline'}</strong></span>
            {health?.database?.latencyMs !== undefined && (
              <span>({health.database.latencyMs}ms)</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-slate-500">
              {health?.database?.categoryCount} Categories Verified
            </span>
            <button
              onClick={fetchHealth}
              disabled={healthLoading}
              className="text-slate-400 hover:text-white transition cursor-pointer"
              title="Ping Database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </main>

      {/* Modal: Job Details Viewer */}
      {selectedJobId && (
        <JobDetailModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        Plugy &bull; Step 4 Live: Job Feed, Concurrency-Safe Acceptance & WebSockets
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
