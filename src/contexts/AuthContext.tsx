import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs, limit } from 'firebase/firestore';

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

      // 1. Try to find in users
      const userRef = doc(db, 'users', u.uid);
      const unsubscribeUser = onSnapshot(userRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          if (data.role === 'secretary') {
            // It's a secretary, fetch her staff record for ownerId and permissions
            checkStaffStatus(u, data);
          } else {
            // It's a professional (medico or admin)
            // But we still check if they are "Staff" of someone else first?
            // Actually, the current logic assumes if you have a user doc and no staff link, you are the owner.
            // Let's refine checkStaffStatus to be called for everyone who MIGHT be staff.
            checkStaffStatus(u, data);
          }
        } else {
          // Proceed to staff check if user doc doesn't exist yet (backward compatibility or race condition)
          checkStaffStatus(u);
        }
      }, (error) => {
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
            onSnapshot(doc(db, 'users', staffData.userId), (pSnap) => {
              if (pSnap.exists()) {
                const pData = pSnap.data();
                if (pData.darkMode) document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
                if (pData.primaryColor) document.documentElement.style.setProperty('--color-primary', pData.primaryColor);
              }
            }, (err) => {
              // Silently fail professional theme lookup if permissions not yet ready
              console.warn("Theme lookup pending...", err.message);
            });
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
               } else {
                 // Admin or Medico not in staff => they are the Owner
                 setProfile(userBaseData);
                 setIsStaff(false);
                 setOwnerId(u.uid);
                 setPermissions(['all']);

                 // Apply theme settings
                 if (userBaseData.darkMode) document.documentElement.classList.add('dark');
                 else document.documentElement.classList.remove('dark');
                 if (userBaseData.primaryColor) document.documentElement.style.setProperty('--color-primary', userBaseData.primaryColor);
               }
            }
            setLoading(false);
          }
        }, (error) => {
          console.error("Staff lookup error:", error);
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
