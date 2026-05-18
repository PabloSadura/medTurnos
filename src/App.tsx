import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { db } from './lib/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';

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
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NAV_ITEMS } from './lib/navigation';

function HomeRedirect() {
  const { permissions } = useAuth();
  
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
  const { user, loading } = useAuth();

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
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
