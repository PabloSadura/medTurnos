import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs, limit, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isStaff: boolean;
  ownerId: string | null;
  permissions: string[];
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isStaff: false,
  ownerId: null,
  permissions: [],
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (!u) {
        setProfile(null);
        setIsStaff(false);
        setOwnerId(null);
        setPermissions([]);
        setLoading(false);
        return;
      }

      const emailLower = u.email?.toLowerCase().trim() || '';
      const isAdminEmail = emailLower === 'admin@mail.com' || emailLower === 'pablosadura@gmail.com';

      // 1. Try to find in users
      const userRef = doc(db, 'users', u.uid);
      const unsubscribeUser = onSnapshot(userRef, async (docSnap) => {
        if (isAdminEmail) {
          if (!docSnap.exists() || docSnap.data().role !== 'admin' || docSnap.data().status !== 'Activo') {
            try {
              await setDoc(userRef, {
                email: u.email,
                name: docSnap.exists() && docSnap.data().name ? docSnap.data().name : (u.displayName || 'Administrador del Sistema'),
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
            name: baseData.name || u.displayName || 'Administrador del Sistema',
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

          if (data.role === 'secretary') {
            // It's a secretary, fetch her staff record for ownerId and permissions
            checkStaffStatus(u, data);
          } else {
            // It's a professional (medico)
            checkStaffStatus(u, data);
          }
        } else {
          // Proceed to staff check if user doc doesn't exist yet (backward compatibility or race condition)
          checkStaffStatus(u);
        }
      }, (error) => {
        if (isAdminEmail) {
          setProfile({
            id: u.uid,
            email: u.email,
            name: u.displayName || 'Administrador del Sistema',
            role: 'admin',
            status: 'Activo',
          });
          setIsStaff(false);
          setOwnerId(u.uid);
          setPermissions(['sys_dashboard', 'admin', 'all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
          setLoading(false);
          return;
        }
        // If it's a permission error, they might be a secretary who doesn't have a users doc
        // or the rules are still being applied. Try staff check.
        if (error.message.includes('permission')) {
          checkStaffStatus(u);
        } else {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
          setLoading(false);
        }
      });

      const checkStaffStatus = (u: User, userBaseData?: any) => {
        // 2. Try to find in staff (Secretary)
        // First try a direct document lookup (new preferred way)
        const staffRef = doc(db, 'staff', u.uid);
        onSnapshot(staffRef, async (staffSnap) => {
          if (staffSnap.exists()) {
            const staffData = staffSnap.data();
            setProfile({ ...userBaseData, ...staffData });
            setIsStaff(true);
            setOwnerId(staffData.userId);
            setPermissions(staffData.permissions || []);
            setLoading(false);

            // Inherit theme from professional
            if (staffData.userId) {
              const professionalRef = doc(db, 'users', staffData.userId);
              onSnapshot(professionalRef, (pSnap) => {
                if (pSnap.exists()) {
                  const pData = pSnap.data();
                  if (pData.darkMode) document.documentElement.classList.add('dark');
                  else document.documentElement.classList.remove('dark');
                  if (pData.primaryColor) document.documentElement.style.setProperty('--color-primary', pData.primaryColor);
                }
              }, (err) => {
                console.warn("Professional theme lookup restricted:", err.message);
              });
            }
            setLoading(false);
          } else {
            // Fallback for legacy staff
            const q = query(collection(db, 'staff'), where('authUid', '==', u.uid), limit(1));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              const staffData = qSnap.docs[0].data();
              setProfile({ ...userBaseData, ...staffData });
              setIsStaff(true);
              setOwnerId(staffData.userId);
              setPermissions(staffData.permissions || []);
              
              onSnapshot(doc(db, 'users', staffData.userId), (pSnap) => {
                if (pSnap.exists()) {
                  const pData = pSnap.data();
                  if (pData.darkMode) document.documentElement.classList.add('dark');
                  else document.documentElement.classList.remove('dark');
                  if (pData.primaryColor) document.documentElement.style.setProperty('--color-primary', pData.primaryColor);
                }
              });
            } else if (userBaseData) {
               // Not in staff, but has a user doc.
               // Check if they are a professional role or secretary
               if (userBaseData.role === 'secretary') {
                 setProfile(userBaseData);
                 setIsStaff(true);
                 setPermissions([]);
               } else if (userBaseData.role === 'admin') {
                 setProfile(userBaseData);
                 setIsStaff(false);
                 setOwnerId(u.uid);
                 setPermissions(['sys_dashboard']);
                 if (userBaseData.darkMode) document.documentElement.classList.add('dark');
                 else document.documentElement.classList.remove('dark');
                 if (userBaseData.primaryColor) document.documentElement.style.setProperty('--color-primary', userBaseData.primaryColor);
               } else {
                 setProfile(userBaseData);
                 setIsStaff(false);
                 setOwnerId(u.uid);
                 setPermissions(['all']);
                 if (userBaseData.darkMode) document.documentElement.classList.add('dark');
                 else document.documentElement.classList.remove('dark');
                 if (userBaseData.primaryColor) document.documentElement.style.setProperty('--color-primary', userBaseData.primaryColor);
               }
            } else {
              // User has no staff doc and no userBaseData doc yet
              setProfile({
                id: u.uid,
                email: u.email,
                name: u.displayName || u.email?.split('@')[0] || 'Usuario',
                role: 'medico',
                status: 'Activo'
              });
              setIsStaff(false);
              setOwnerId(u.uid);
              setPermissions(['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
            }
            setLoading(false);
          }
        }, (error) => {
          console.warn("Staff lookup error:", error);
          if (userBaseData) {
            setProfile(userBaseData);
            setOwnerId(userBaseData.userId || u.uid);
            setPermissions(userBaseData.role === 'admin' ? ['sys_dashboard', 'admin', 'all'] : ['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
          } else {
            setProfile({
              id: u.uid,
              email: u.email,
              name: u.displayName || u.email?.split('@')[0] || 'Usuario',
              role: 'medico',
              status: 'Activo'
            });
            setOwnerId(u.uid);
            setPermissions(['all', 'dashboard', 'agenda', 'patients', 'treatments', 'inventory', 'reminders']);
          }
          setLoading(false);
        });
      };

      return () => unsubscribeUser();
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isStaff, ownerId, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}
