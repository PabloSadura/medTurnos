import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.removeProperty('--color-primary');
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        // Apply Dark Mode
        if (data.darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

        // Apply Primary Color
        if (data.primaryColor) {
          document.documentElement.style.setProperty('--color-primary', data.primaryColor);
        }
      }
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          
          <Route element={user ? <MainLayout /> : <Navigate to="/login" />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/treatments" element={<Treatments />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/admin" element={<Administration />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </Router>
    </ToastProvider>
  );
}
