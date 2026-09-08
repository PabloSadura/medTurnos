import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  GOOGLE_DRIVE_SCOPE, 
  fetchGoogleUserInfo, 
  getOrCreateAppRootFolder,
  GoogleUserProfile,
  getGoogleClientId,
} from '../lib/googleDrive';
import { useToast } from '../components/Toast';
import { useAuth } from './AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface GoogleDriveContextType {
  isConnected: boolean;
  isConnecting: boolean;
  accessToken: string | null;
  googleUser: GoogleUserProfile | null;
  isExpired: boolean;
  rootFolderId: string | null;
  connectGoogleDrive: () => Promise<void>;
  disconnectGoogleDrive: () => void;
  ensureFreshToken: () => Promise<string | null>;
  getRootFolderId: () => Promise<string | null>;
}

const GoogleDriveContext = createContext<GoogleDriveContextType | null>(null);

const STORAGE_KEY = 'medturnos_google_drive_session';

export function GoogleDriveProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [rootFolderId, setRootFolderId] = useState<string | null>(null);

  const isExpired = expiresAt ? Date.now() > expiresAt : true;
  const isConnected = !!accessToken && !isExpired;

  // Restore stored session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.accessToken && parsed.expiresAt && Date.now() < parsed.expiresAt) {
          setAccessToken(parsed.accessToken);
          setExpiresAt(parsed.expiresAt);
          setGoogleUser(parsed.googleUser || null);
          setRootFolderId(parsed.rootFolderId || null);
        } else if (parsed.googleUser) {
          // Keep user profile info for display even if token expired, so they see "Reconnect"
          setGoogleUser(parsed.googleUser);
        }
      }
    } catch (e) {
      console.warn('Could not restore Google Drive session:', e);
    }
  }, []);

  const saveSession = useCallback((token: string, expTime: number, gUser: GoogleUserProfile | null, rootId?: string) => {
    setAccessToken(token);
    setExpiresAt(expTime);
    if (gUser) setGoogleUser(gUser);
    if (rootId) setRootFolderId(rootId);

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken: token,
          expiresAt: expTime,
          googleUser: gUser,
          rootFolderId: rootId,
        })
      );
    } catch (e) {
      console.warn('Could not persist Google Drive session:', e);
    }
  }, []);

  const clearSession = useCallback(() => {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(accessToken, () => {});
      } catch (err) {
        console.warn('Error revoking token:', err);
      }
    }
    setAccessToken(null);
    setExpiresAt(null);
    setGoogleUser(null);
    setRootFolderId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Could not remove Google Drive session:', e);
    }
  }, [accessToken]);

  const disconnectGoogleDrive = useCallback(() => {
    clearSession();
    showToast('Cuenta de Google Drive desconectada.');
  }, [clearSession, showToast]);

  const connectGoogleDrive = useCallback(async (): Promise<void> => {
    const activeClientId = getGoogleClientId();
    if (!activeClientId) {
      showToast('No se encontró el ID de Cliente de Google (OAuth Client ID). Revisa la configuración.', 'error');
      return;
    }

    setIsConnecting(true);

    return new Promise<void>((resolve) => {
      if (!window.google?.accounts?.oauth2) {
        setIsConnecting(false);
        showToast('El servicio de Google Identity todavía no está listo. Intenta en unos segundos.', 'error');
        resolve();
        return;
      }

      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: activeClientId,
          scope: GOOGLE_DRIVE_SCOPE,
          callback: async (response) => {
            setIsConnecting(false);
            if (response.error) {
              if (response.error === 'access_denied') {
                console.info('Google OAuth: El usuario canceló o rechazó el consentimiento.');
                showToast('Se canceló la autorización de Google Drive.', 'info');
              } else {
                console.warn('Google OAuth response warning:', response.error);
                showToast(`Error al conectar con Google: ${response.error}`, 'error');
              }
              resolve();
              return;
            }

            if (response.access_token) {
              const expiresIn = response.expires_in || 3600;
              const expirationTimestamp = Date.now() + expiresIn * 1000;
              
              // Fetch user profile info
              const profile = await fetchGoogleUserInfo(response.access_token);
              
              // Fetch or initialize app root folder
              let rootId = '';
              try {
                rootId = await getOrCreateAppRootFolder(response.access_token);
              } catch (folderErr) {
                console.warn('Could not create/find root folder immediately:', folderErr);
              }

              saveSession(response.access_token, expirationTimestamp, profile, rootId);

              // Update Firestore user record if logged in
              if (user?.uid && profile) {
                try {
                  await updateDoc(doc(db, 'users', user.uid), {
                    googleDriveConnected: true,
                    googleDriveEmail: profile.email,
                  });
                } catch (dbErr) {
                  console.warn('Could not update user document in Firestore:', dbErr);
                }
              }

              showToast(`Conectado exitosamente con Google Drive (${profile?.email || 'Cuenta Google'})`);
              resolve();
            } else {
              resolve();
            }
          },
          error_callback: (err: any) => {
            setIsConnecting(false);
            const isPopupClosed = 
              err?.type === 'popup_closed' ||
              (typeof err?.message === 'string' && /popup.*close/i.test(err.message)) ||
              (typeof err === 'string' && /popup.*close/i.test(err));

            const isPopupBlocked = 
              err?.type === 'popup_blocked' ||
              (typeof err?.message === 'string' && /popup.*block/i.test(err.message)) ||
              (typeof err === 'string' && /popup.*block/i.test(err));

            if (isPopupClosed) {
              console.info('Google OAuth: La ventana fue cerrada por el usuario.');
              resolve();
              return;
            }

            if (isPopupBlocked) {
              console.warn('Google OAuth: La ventana fue bloqueada por el navegador.');
              showToast('El navegador bloqueó la ventana emergente de Google. Por favor permite las ventanas emergentes (popups) para este sitio.', 'warning');
              resolve();
              return;
            }

            console.warn('Google Identity notification:', err);
            showToast('No se pudo completar la conexión con Google.', 'error');
            resolve();
          },
        });

        // Request access token with popup
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err: any) {
        setIsConnecting(false);
        const isPopupClosed = 
          err?.type === 'popup_closed' ||
          (typeof err?.message === 'string' && /popup.*close/i.test(err.message)) ||
          (typeof err === 'string' && /popup.*close/i.test(err));

        if (isPopupClosed) {
          console.info('Google OAuth: Ventana cerrada por el usuario.');
          resolve();
          return;
        }

        console.warn('Error starting Google Drive connection:', err);
        showToast(`Fallo al conectar: ${err?.message || err}`, 'error');
        resolve();
      }
    });
  }, [showToast, user, saveSession]);

  const ensureFreshToken = useCallback(async (): Promise<string | null> => {
    if (accessToken && !isExpired) {
      return accessToken;
    }
    // Need to reconnect
    showToast('La sesión de Google Drive ha expirado. Por favor reconecta tu cuenta.', 'warning');
    await connectGoogleDrive();
    return accessToken;
  }, [accessToken, isExpired, showToast, connectGoogleDrive]);

  const getRootFolderId = useCallback(async (): Promise<string | null> => {
    if (rootFolderId) return rootFolderId;
    if (!accessToken || isExpired) return null;
    try {
      const id = await getOrCreateAppRootFolder(accessToken);
      setRootFolderId(id);
      return id;
    } catch (e) {
      console.error('Error getting root folder ID:', e);
      return null;
    }
  }, [rootFolderId, accessToken, isExpired]);

  return (
    <GoogleDriveContext.Provider
      value={{
        isConnected,
        isConnecting,
        accessToken,
        googleUser,
        isExpired,
        rootFolderId,
        connectGoogleDrive,
        disconnectGoogleDrive,
        ensureFreshToken,
        getRootFolderId,
      }}
    >
      {children}
    </GoogleDriveContext.Provider>
  );
}

export function useGoogleDrive() {
  const context = useContext(GoogleDriveContext);
  if (!context) {
    throw new Error('useGoogleDrive must be used within a GoogleDriveProvider');
  }
  return context;
}
