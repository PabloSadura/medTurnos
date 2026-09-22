import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  serverTimestamp, 
  query, 
  collection, 
  where, 
  getDocs, 
  limit 
} from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isStaff: boolean;
  ownerId: string;
  permissions: string[];
  logout: () => Promise<void>;
  apiAuthError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isStaff: false,
  ownerId: '',
  permissions: [],
  logout: async () => {},
  apiAuthError: null
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isStaff, setIsStaff] = useState<boolean>(false);
  const [ownerId, setOwnerId] = useState<string>('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [apiAuthError, setApiAuthError] = useState<string | null>(null);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('[Auth] Sign out error:', err);
    } finally {
      // Clear all state
      setUser(null);
      setProfile(null);
      setIsStaff(false);
      setOwnerId('');
      setPermissions([]);
      try {
        localStorage.removeItem('medturnos_auth_user');
      } catch {
        // Ignored
      }
    }
  };

  useEffect(() => {
    let activeUserUnsub: (() => void) | null = null;
    let activeStaffUnsub: (() => void) | null = null;

    // Safety timeout to prevent infinite blank screen in edge network cases
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('[Auth] Safety timeout reached, resolving loading state.');
          return false;
        }
        return prev;
      });
    }, 6000);

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (activeUserUnsub) {
          activeUserUnsub();
          activeUserUnsub = null;
        }
        if (activeStaffUnsub) {
          activeStaffUnsub();
          activeStaffUnsub = null;
        }

        if (!firebaseUser) {
          setUser(null);
          setProfile(null);
          setIsStaff(false);
          setOwnerId('');
          setPermissions([]);
          setLoading(false);
          return;
        }

        setUser(firebaseUser);

        // Listen to Firestore profile
        const userRef = doc(db, 'users', firebaseUser.uid);
        activeUserUnsub = onSnapshot(
          userRef,
          async (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setProfile(data);

              const isSuperOrAdmin = data.role === 'admin' || data.role === 'superadmin' || data.role === 'super_admin' || firebaseUser.email === 'pablosadura@gmail.com';
              if (isSuperOrAdmin) {
                setIsStaff(false);
                setOwnerId(firebaseUser.uid);
                // El administrador solo accede al panel de control administrativo; las demás opciones son únicamente para los profesionales
                setPermissions([
                  'sys_dashboard',
                  'admin'
                ]);
                setLoading(false);
                return;
              }

              if (data.role === 'secretary') {
                checkStaffStatus(firebaseUser, data);
                return;
              }

              // Regular clinician
              setIsStaff(false);
              setOwnerId(firebaseUser.uid);
              setPermissions(['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);

              // Apply UI themes
              if (data.darkMode) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
              if (data.primaryColor) {
                document.documentElement.style.setProperty('--color-primary', data.primaryColor);
              }

              setLoading(false);
            } else {
              if (firebaseUser.email === 'pablosadura@gmail.com') {
                const superAdminProfile = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  name: firebaseUser.displayName || 'Superadministrador',
                  role: 'admin',
                  status: 'Activo'
                };
                setProfile(superAdminProfile);
                setIsStaff(false);
                setOwnerId(firebaseUser.uid);
                setPermissions(['sys_dashboard', 'admin']);
                setLoading(false);
                return;
              }
              // Check if user is registered in staff collection
              checkStaffStatus(firebaseUser);
            }
          },
          (error) => {
            console.warn('[Auth] Error fetching user profile:', error.message);
            setLoading(false);
          }
        );

        const checkStaffStatus = (userObj: User, userBaseData?: any) => {
          const staffRef = doc(db, 'staff', userObj.uid);
          activeStaffUnsub = onSnapshot(
            staffRef,
            async (staffSnap) => {
              if (staffSnap.exists()) {
                const staffData = staffSnap.data();
                setProfile({ ...userBaseData, ...staffData });
                setIsStaff(true);
                setOwnerId(staffData.userId || userObj.uid);
                setPermissions(staffData.permissions || ['agenda', 'patients']);
                setLoading(false);
              } else {
                // Query staff by authUid or email fallback
                let staffData: any = null;
                try {
                  const qUid = query(collection(db, 'staff'), where('authUid', '==', userObj.uid), limit(1));
                  const qUidSnap = await getDocs(qUid);
                  if (!qUidSnap.empty) {
                    staffData = qUidSnap.docs[0].data();
                  } else if (userObj.email) {
                    const qEmail = query(collection(db, 'staff'), where('email', '==', userObj.email), limit(1));
                    const qEmailSnap = await getDocs(qEmail);
                    if (!qEmailSnap.empty) {
                      staffData = qEmailSnap.docs[0].data();
                    }
                  }
                } catch (err) {
                  console.warn('[Auth] Staff fallback query warning:', err);
                }

                if (staffData) {
                  setProfile({ ...userBaseData, ...staffData });
                  setIsStaff(true);
                  setOwnerId(staffData.userId || userObj.uid);
                  setPermissions(staffData.permissions || ['agenda', 'patients']);
                  setLoading(false);
                } else if (userBaseData) {
                  setProfile(userBaseData);
                  setIsStaff(false);
                  setOwnerId(userObj.uid);
                  setPermissions(['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
                  setLoading(false);
                } else {
                  // Initialize basic clinician profile for new authenticated user
                  const newProfData = {
                    id: userObj.uid,
                    email: userObj.email,
                    name: userObj.displayName || userObj.email?.split('@')[0] || 'Profesional',
                    role: 'medico',
                    status: 'Activo',
                    userId: userObj.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                  };
                  try {
                    await setDoc(userRef, newProfData, { merge: true });
                  } catch (e) {
                    console.warn('[Auth] Could not create initial user profile in Firestore:', e);
                  }
                  setProfile(newProfData);
                  setIsStaff(false);
                  setOwnerId(userObj.uid);
                  setPermissions(['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
                  setLoading(false);
                }
              }
            },
            (error) => {
              console.warn('[Auth] Staff lookup error:', error.message);
              setLoading(false);
            }
          );
        };
      },
      (authErr: any) => {
        const msg = authErr?.message || String(authErr);
        if (
          msg.includes('identitytoolkit') ||
          msg.includes('Identity Toolkit API') ||
          msg.includes('403') ||
          msg.includes('PERMISSION_DENIED')
        ) {
          setApiAuthError('Identity Toolkit API está desactivada en Google Cloud Console para este proyecto.');
        }
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      if (activeUserUnsub) activeUserUnsub();
      if (activeStaffUnsub) activeStaffUnsub();
      unsubscribeAuth();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isStaff,
        ownerId,
        permissions,
        logout,
        apiAuthError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
