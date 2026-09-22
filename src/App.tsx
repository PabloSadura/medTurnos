import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth } from './lib/firebase';
import { Lock, RefreshCw, AlertTriangle, Activity } from 'lucide-react';

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
import { AuthProvider, useAuth, isAdminRole } from './contexts/AuthContext';
import { GoogleDriveProvider } from './contexts/GoogleDriveContext';
import { NAV_ITEMS } from './lib/navigation';

function HomeRedirect() {
  const { permissions, profile } = useAuth();
  const isSuperOrAdmin = isAdminRole(profile?.role);
  
  if (isSuperOrAdmin) {
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
  const { permissions, profile } = useAuth();
  const isSuperOrAdmin = isAdminRole(profile?.role);
  
  // Si el usuario es administrador y la ruta es de operaciones clínicas (solo para profesionales), redirigir al panel de control
  if (isSuperOrAdmin && permission && !['sys_dashboard', 'admin'].includes(permission)) {
    return <Navigate to="/system/dashboard" replace />;
  }

  // Si el usuario es un profesional y trata de ingresar al panel maestro del sistema
  if (!isSuperOrAdmin && permission === 'sys_dashboard') {
    return <Navigate to="/medical/dashboard" replace />;
  }

  if (permission && !permissions.includes('all') && !permissions.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function AppContent() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface p-6 font-sans">
        <div className="flex flex-col items-center max-w-xs w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm border border-primary/20 animate-pulse">
            <Activity size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-on-surface">MedTurnos</h1>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Iniciando plataforma médica...</p>
          </div>
          <div className="w-full bg-outline-variant/40 h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full w-2/3 animate-[pulse_1s_ease-in-out_infinite]"></div>
          </div>
        </div>
      </div>
    );
  }

  const isSuperOrAdmin = isAdminRole(profile?.role);
  const isUserBlocked = user && !isSuperOrAdmin && (
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
          <Route path="/dashboard" element={<ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/medical/dashboard" element={<ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute permission="agenda"><Agenda /></ProtectedRoute>} />
          <Route path="/patients" element={<ProtectedRoute permission="patients"><Patients /></ProtectedRoute>} />
          <Route path="/pacientes" element={<Navigate to="/patients" replace />} />
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
