import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs, limit, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | any | null;
  profile: any | null;
  loading: boolean;
  isStaff: boolean;
  ownerId: string | null;
  permissions: string[];
  loginLocalUser: (email: string, name?: string, role?: string) => void;
  logout: () => Promise<void>;
  apiAuthError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isStaff: false,
  ownerId: null,
  permissions: [],
  loginLocalUser: () => {},
  logout: async () => {},
  apiAuthError: null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [apiAuthError, setApiAuthError] = useState<string | null>(null);

  const logout = async () => {
    sessionStorage.setItem('medturnos_logged_out', '1');
    localStorage.removeItem('medturnos_local_user');
    setUser(null);
    setProfile(null);
    setIsStaff(false);
    setOwnerId(null);
    setPermissions([]);
    try {
      await auth.signOut();
    } catch {
      // Ignored
    }
  };

  const loginLocalUser = (email: string, name?: string, role: string = 'admin') => {
    sessionStorage.removeItem('medturnos_logged_out');
    const emailLower = email.toLowerCase().trim();
    const isAdmin = emailLower === 'admin@mail.com' || emailLower === 'pablosadura@gmail.com' || role === 'admin';
    const localUser = {
      uid: isAdmin ? 'admin_master' : `user_${Date.now()}`,
      email: email.trim(),
      displayName: name || (isAdmin ? 'Pablo Sadura (Administrador)' : 'Profesional Médico'),
      role: isAdmin ? 'admin' : role,
      status: 'Activo'
    };
    try {
      localStorage.setItem('medturnos_local_user', JSON.stringify(localUser));
    } catch {
      // Ignore localStorage quotas
    }
    setUser(localUser);
    setOwnerId(localUser.uid);
    setProfile({
      id: localUser.uid,
      email: localUser.email,
      name: localUser.displayName,
      role: localUser.role,
      status: 'Activo'
    });
    setIsStaff(false);
    setPermissions(isAdmin 
      ? ['sys_dashboard', 'admin', 'all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']
      : ['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']
    );
    setLoading(false);
  };

  useEffect(() => {
    let activeUserUnsub: (() => void) | null = null;
    let activeStaffUnsub: (() => void) | null = null;

    // Safety timeout: ensure app NEVER hangs indefinitely on loading
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 750);

    // 1. Initial check for local session
    const isExplicitlyLoggedOut = sessionStorage.getItem('medturnos_logged_out') === '1';
    const savedLocal = localStorage.getItem('medturnos_local_user');
    let hasLocalSession = false;

    if (savedLocal && !isExplicitlyLoggedOut) {
      try {
        const parsed = JSON.parse(savedLocal);
        if (parsed && parsed.email) {
          const emailLower = parsed.email.toLowerCase().trim();
          const isAdmin = emailLower === 'admin@mail.com' || emailLower === 'pablosadura@gmail.com' || parsed.role === 'admin';
          setUser(parsed);
          setOwnerId(parsed.uid || (isAdmin ? 'admin_master' : 'prof_local'));
          setProfile({
            id: parsed.uid,
            email: parsed.email,
            name: parsed.displayName || (isAdmin ? 'Pablo Sadura (Administrador)' : 'Profesional Médico'),
            role: isAdmin ? 'admin' : (parsed.role || 'medico'),
            status: 'Activo',
            ...parsed
          });
          setIsStaff(false);
          setPermissions(isAdmin
            ? ['sys_dashboard', 'admin', 'all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']
            : ['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']
          );
          hasLocalSession = true;
          setLoading(false);
        }
      } catch {
        localStorage.removeItem('medturnos_local_user');
      }
    }

    // Default fast-boot session for Pablo Sadura (Administrator) if no prior session exists
    if (!hasLocalSession && !isExplicitlyLoggedOut && !auth.currentUser) {
      const defaultAdmin = {
        uid: 'admin_master',
        email: 'pablosadura@gmail.com',
        displayName: 'Pablo Sadura (Administrador)',
        role: 'admin',
        status: 'Activo'
      };
      try {
        localStorage.setItem('medturnos_local_user', JSON.stringify(defaultAdmin));
      } catch {
        // Ignored
      }
      setUser(defaultAdmin);
      setOwnerId('admin_master');
      setProfile({
        id: 'admin_master',
        email: defaultAdmin.email,
        name: defaultAdmin.displayName,
        role: 'admin',
        status: 'Activo'
      });
      setIsStaff(false);
      setPermissions(['sys_dashboard', 'admin', 'all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
      setLoading(false);
    } else if (isExplicitlyLoggedOut) {
      setLoading(false);
    }

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (u) => {
        // Clean up previous listeners
        if (activeUserUnsub) {
          activeUserUnsub();
          activeUserUnsub = null;
        }
        if (activeStaffUnsub) {
          activeStaffUnsub();
          activeStaffUnsub = null;
        }

        if (!u) {
          if (sessionStorage.getItem('medturnos_logged_out') === '1') {
            setUser(null);
            setProfile(null);
            setIsStaff(false);
            setOwnerId(null);
            setPermissions([]);
          }
          setLoading(false);
          return;
        }

        // We have an authenticated Firebase user
        sessionStorage.removeItem('medturnos_logged_out');
        setUser(u);

        const emailLower = u.email?.toLowerCase().trim() || '';
        const isAdminEmail = emailLower === 'admin@mail.com' || emailLower === 'pablosadura@gmail.com';

        // 1. Try to find in users
        const userRef = doc(db, 'users', u.uid);
        activeUserUnsub = onSnapshot(userRef, async (docSnap) => {
          if (isAdminEmail) {
            if (!docSnap.exists() || docSnap.data().role !== 'admin' || docSnap.data().status !== 'Activo') {
              try {
                await setDoc(userRef, {
                  email: u.email,
                  name: docSnap.exists() && docSnap.data().name ? docSnap.data().name : (u.displayName || 'Pablo Sadura (Administrador)'),
                  role: 'admin',
                  status: 'Activo',
                  updatedAt: serverTimestamp()
                }, { merge: true });
              } catch (syncErr) {
                console.warn("Could not sync admin profile to Firestore:", syncErr);
              }
            }
            const baseData = docSnap.exists() ? docSnap.data() : {};
            setProfile({
              id: u.uid,
              email: u.email,
              name: baseData.name || u.displayName || 'Pablo Sadura (Administrador)',
              role: 'admin',
              status: 'Activo',
              ...baseData
            });
            setIsStaff(false);
            setOwnerId(u.uid);
            setPermissions(['sys_dashboard', 'admin', 'all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
            if (baseData.darkMode) document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            if (baseData.primaryColor) document.documentElement.style.setProperty('--color-primary', baseData.primaryColor);
            setLoading(false);
            return;
          }

          if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.role === 'admin') {
              setProfile({ id: u.uid, ...data });
              setIsStaff(false);
              setOwnerId(u.uid);
              setPermissions(['sys_dashboard', 'admin', 'all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
              if (data.darkMode) document.documentElement.classList.add('dark');
              else document.documentElement.classList.remove('dark');
              if (data.primaryColor) document.documentElement.style.setProperty('--color-primary', data.primaryColor);
              setLoading(false);
              return;
            }

            // For secretary or medical professional, resolve staff permissions
            checkStaffStatus(u, data);
          } else {
            // Check if a user document exists with this email
            if (u.email) {
              try {
                const uq = query(collection(db, 'users'), where('email', '==', u.email), limit(1));
                const uqSnap = await getDocs(uq);
                if (!uqSnap.empty) {
                  const existingData = uqSnap.docs[0].data();
                  await setDoc(userRef, {
                    ...existingData,
                    authUid: u.uid,
                    updatedAt: serverTimestamp()
                  }, { merge: true });
                  return;
                }
              } catch (e) {
                console.warn("User email lookup error:", e);
              }
            }
            checkStaffStatus(u);
          }
        }, (error) => {
          if (isAdminEmail) {
            setProfile({
              id: u.uid,
              email: u.email,
              name: u.displayName || 'Pablo Sadura (Administrador)',
              role: 'admin',
              status: 'Activo',
            });
            setIsStaff(false);
            setOwnerId(u.uid);
            setPermissions(['sys_dashboard', 'admin', 'all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
            setLoading(false);
            return;
          }
          if (error.message.includes('permission')) {
            checkStaffStatus(u);
          } else {
            handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
            setLoading(false);
          }
        });

        const checkStaffStatus = (userObj: User, userBaseData?: any) => {
          const staffRef = doc(db, 'staff', userObj.uid);
          activeStaffUnsub = onSnapshot(staffRef, async (staffSnap) => {
            if (staffSnap.exists()) {
              const staffData = staffSnap.data();
              setProfile({ ...userBaseData, ...staffData });
              setIsStaff(true);
              setOwnerId(staffData.userId);
              setPermissions(staffData.permissions || []);
              setLoading(false);

              if (staffData.userId) {
                const professionalRef = doc(db, 'users', staffData.userId);
                onSnapshot(professionalRef, (pSnap) => {
                  if (pSnap.exists()) {
                    const pData = pSnap.data();
                    if (pData.darkMode) document.documentElement.classList.add('dark');
                    else document.documentElement.classList.remove('dark');
                    if (pData.primaryColor) document.documentElement.style.setProperty('--color-primary', pData.primaryColor);
                  }
                }, () => {});
              }
              setLoading(false);
            } else {
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
                console.warn("Error querying staff fallback:", err);
              }

              if (staffData) {
                try {
                  await setDoc(staffRef, {
                    ...staffData,
                    authUid: userObj.uid,
                    updatedAt: serverTimestamp()
                  }, { merge: true });
                } catch (e) {
                  console.warn("Could not sync staff doc to u.uid:", e);
                }

                setProfile({ ...userBaseData, ...staffData });
                setIsStaff(true);
                setOwnerId(staffData.userId || userObj.uid);
                setPermissions(staffData.permissions || ['all']);
                setLoading(false);
              } else if (userBaseData) {
                if (userBaseData.role === 'secretary') {
                  setProfile(userBaseData);
                  setIsStaff(true);
                  setOwnerId(userBaseData.userId || userObj.uid);
                  setPermissions(userBaseData.permissions || []);
                } else if (userBaseData.role === 'admin') {
                  setProfile(userBaseData);
                  setIsStaff(false);
                  setOwnerId(userObj.uid);
                  setPermissions(['sys_dashboard']);
                } else {
                  setProfile(userBaseData);
                  setIsStaff(false);
                  setOwnerId(userBaseData.userId || userObj.uid);
                  setPermissions(['all']);
                }
                setLoading(false);
              } else {
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
                  console.warn("Could not create initial user profile:", e);
                }
                setProfile(newProfData);
                setIsStaff(false);
                setOwnerId(userObj.uid);
                setPermissions(['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
                setLoading(false);
              }
            }
          }, (error) => {
            console.warn("Staff lookup error:", error);
            if (userBaseData) {
              setProfile(userBaseData);
              setOwnerId(userBaseData.userId || userObj.uid);
              setPermissions(userBaseData.role === 'admin' ? ['sys_dashboard', 'admin', 'all'] : ['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
            } else {
              setProfile({
                id: userObj.uid,
                email: userObj.email,
                name: userObj.displayName || userObj.email?.split('@')[0] || 'Usuario',
                role: 'medico',
                status: 'Activo'
              });
              setOwnerId(userObj.uid);
              setPermissions(['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
            }
            setLoading(false);
          });
        };
      },
      (authErr: any) => {
        const msg = authErr?.message || String(authErr);
        if (msg.includes('identitytoolkit') || msg.includes('Identity Toolkit API') || msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
          setApiAuthError('Identity Toolkit API está desactivada en Google Cloud.');
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
    <AuthContext.Provider value={{ user, profile, loading, isStaff, ownerId, permissions, loginLocalUser, logout, apiAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}
