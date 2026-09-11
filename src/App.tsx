import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { db, auth } from './lib/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import { Lock, RefreshCw, AlertTriangle } from 'lucide-react';

import { Login } from './pages/Login';
import { MainLayout } from './components/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Agenda } from './pages/Agenda';
import { Patients } from './pages/Patients';
import { Treatments } from './pages/Treatments';
import { Inventory } from './pages/Inventory';
import { Reminders } from './pages/Reminders';
import { Profile } from './pages/Profile';
import { Administration } from './pages/Administration';
import { SystemAdmin } from './pages/SystemAdmin';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GoogleDriveProvider } from './contexts/GoogleDriveContext';
import { NAV_ITEMS } from './lib/navigation';

function HomeRedirect() {
  const { permissions, profile } = useAuth();
  
  if (profile?.role === 'admin') {
    return <Navigate to="/system/dashboard" replace />;
  }
  
  if (permissions.includes('all') || permissions.includes('dashboard')) {
    return <Dashboard />;
  }

  // Find first available route
  const firstRoute = NAV_ITEMS.find(item => permissions.includes(item.id));
  if (firstRoute) {
    return <Navigate to={firstRoute.path} replace />;
  }

  // If no permissions, just show a message or redirect to profile
  return <Navigate to="/profile" replace />;
}

function ProtectedRoute({ children, permission }: { children: React.ReactNode, permission?: string }) {
  const { permissions } = useAuth();
  
  if (permission && !permissions.includes('all') && !permissions.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function AppContent() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    // Validate connection to Firestore
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isUserBlocked = user && profile?.role !== 'admin' && (
    profile?.status === 'Inactivo' ||
    profile?.status === 'Bloqueado' ||
    profile?.isBlocked === true ||
    profile?.paymentStatus === 'incumplido'
  );

  if (isUserBlocked) {
    const isPaymentIssue = profile?.paymentStatus === 'incumplido';
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl border border-outline-variant shadow-lg max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto">
            {isPaymentIssue ? <AlertTriangle size={32} /> : <Lock size={32} />}
          </div>
          <div>
            <h3 className="text-xl font-black text-on-surface mb-2">
              {isPaymentIssue ? "Acceso Suspendido por Falta de Pago" : "Acceso Bloqueado"}
            </h3>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              {isPaymentIssue 
                ? "Su cuenta registra un pago pendiente del abono mensual. Recordamos que los pagos vencen los días 15 de cada mes. Por favor comuníquese con el administrador para regularizar su abono y reactivar el acceso."
                : "Su cuenta se encuentra inactiva o bloqueada por el administrador del sistema. Comuníquese con administración para solicitar la reactivación."}
            </p>
          </div>

          <div className="bg-surface p-4 rounded-xl border border-outline-variant text-xs text-on-surface-variant text-left space-y-1">
            <p className="font-bold text-on-surface">Detalles de la cuenta:</p>
            <p>Usuario: <span className="font-semibold text-on-surface">{profile?.name || user?.email}</span></p>
            <p>Email: <span className="font-semibold text-on-surface">{user?.email}</span></p>
            <p>Estado de pago: <span className={isPaymentIssue ? "text-error font-bold" : "text-tertiary font-bold"}>{isPaymentIssue ? "Incumpliendo Pago (Vence día 15)" : "Al día"}</span></p>
          </div>

          <div className="flex flex-col gap-2">
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-surface hover:bg-outline-variant border border-outline-variant text-on-surface rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              Verificar Estado
            </button>
            <button 
              onClick={() => auth.signOut()}
              className="w-full py-2.5 bg-primary text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all cursor-pointer"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        <Route element={user ? <MainLayout /> : <Navigate to="/login" />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/agenda" element={<ProtectedRoute permission="agenda"><Agenda /></ProtectedRoute>} />
          <Route path="/patients" element={<ProtectedRoute permission="patients"><Patients /></ProtectedRoute>} />
          <Route path="/treatments" element={<ProtectedRoute permission="treatments"><Treatments /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute permission="inventory"><Inventory /></ProtectedRoute>} />
          <Route path="/reminders" element={<ProtectedRoute permission="reminders"><Reminders /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute permission="admin"><Administration /></ProtectedRoute>} />
          <Route path="/system/dashboard" element={<ProtectedRoute permission="sys_dashboard"><SystemAdmin /></ProtectedRoute>} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <GoogleDriveProvider>
          <AppContent />
        </GoogleDriveProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
