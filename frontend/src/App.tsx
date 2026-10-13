import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import { AvailabilityProvider } from './context/AvailabilityContext';
import { Navbar, NavView } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { CreateJobForm } from './components/CreateJobForm';
import { JobDetailModal } from './components/JobDetailModal';
import { JobFeed } from './components/JobFeed';
import { MyJobs } from './components/MyJobs';
import { NotificationCenter } from './components/NotificationCenter';

function MainApp() {
  const { user, loading: authLoading } = useAuth();
  const { connected } = useSocket();
  const [currentView, setCurrentView] = useState<NavView>('feed');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [openInChat, setOpenInChat] = useState(false);

  // Deep links from notifications: /?job=<id>[&tab=chat]
  const openFromUrl = useCallback((href: string) => {
    const url = new URL(href, window.location.origin);
    const jobId = url.searchParams.get('job');
    if (jobId) {
      setOpenInChat(url.searchParams.get('tab') === 'chat');
      setSelectedJobId(jobId);
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('job')) {
      openFromUrl(window.location.href);
      window.history.replaceState(null, '', window.location.pathname);
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-url' && typeof event.data.url === 'string') openFromUrl(event.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [openFromUrl]);

  // When user signs in or registers, switch view back to feed
  useEffect(() => {
    if (user && (currentView === 'login' || currentView === 'register')) {
      setCurrentView('feed');
    }
  }, [user, currentView]);

  const openJob = useCallback((jobId: string) => {
    setOpenInChat(false);
    setSelectedJobId(jobId);
  }, []);
  const requireSignIn = useCallback(() => {
    setSelectedJobId(null);
    setCurrentView('login');
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-400 tracking-wider font-semibold">Loading Plugy…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-slate-950">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/4 w-[800px] h-[550px] bg-emerald-500/10 blur-[150px] rounded-full"></div>
        <div className="absolute top-1/3 -right-32 w-[600px] h-[600px] bg-teal-500/8 blur-[160px] rounded-full"></div>
      </div>

      <Navbar currentView={currentView} setCurrentView={setCurrentView} />

      <main className="relative z-10 w-full px-3 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-6 flex-1 space-y-6">
        {currentView === 'feed' && (
          <JobFeed onSelectJob={openJob} onRequireAuth={requireSignIn} onNavigateToPostJob={() => setCurrentView('post-job')} />
        )}

        {currentView === 'post-job' && (
          <CreateJobForm
            onJobCreated={(job) => {
              setCurrentView('my-jobs');
              setSelectedJobId(job.id);
            }}
            onRequireAuth={requireSignIn}
          />
        )}

        {currentView === 'my-jobs' && user && (
          <MyJobs onSelectJob={openJob} onNavigateToPostJob={() => setCurrentView('post-job')} onNavigateToFeed={() => setCurrentView('feed')} />
        )}

        {currentView === 'dashboard' && user && (
          <div className="max-w-3xl mx-auto w-full">
            <DashboardPage />
          </div>
        )}

        {currentView === 'admin' && user?.is_admin && <AdminPage onOpenJob={openJob} />}

        {currentView === 'login' && !user && (
          <div className="max-w-md mx-auto w-full py-8">
            <LoginPage onSwitchToRegister={() => setCurrentView('register')} onSuccess={() => setCurrentView('feed')} />
          </div>
        )}

        {currentView === 'register' && !user && (
          <div className="max-w-md mx-auto w-full py-8">
            <RegisterPage onSwitchToLogin={() => setCurrentView('login')} onSuccess={() => setCurrentView('feed')} />
          </div>
        )}
      </main>

      {selectedJobId && (
        <JobDetailModal
          key={selectedJobId}
          jobId={selectedJobId}
          initialTab={openInChat ? 'chat' : 'details'}
          onClose={() => setSelectedJobId(null)}
          onRequireAuth={requireSignIn}
        />
      )}

      <NotificationCenter onOpenJob={openJob} openJobId={selectedJobId} currentView={currentView} />

      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950/90 py-4">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></span>
            {connected ? 'Live updates on' : 'Reconnecting to live updates…'}
          </span>
          <span>Plugy · Local help, fair prices. You set the price, workers respond, you choose.</span>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AvailabilityProvider>
          <MainApp />
        </AvailabilityProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
