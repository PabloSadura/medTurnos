import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  GOOGLE_DRIVE_SCOPE, 
  fetchGoogleUserInfo, 
  getOrCreateAppRootFolder,
  verifyDriveAccess,
  verifyDriveFolderExists,
  GoogleUserProfile,
  getGoogleClientId,
} from '../lib/googleDrive';
import { useToast } from '../components/Toast';
import { useAuth } from './AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface GoogleDriveContextType {
  isConnected: boolean;
  isConnecting: boolean;
  accessToken: string | null;
  googleUser: GoogleUserProfile | null;
  isExpired: boolean;
  rootFolderId: string | null;
  connectGoogleDrive: (options?: { forceConsent?: boolean }) => Promise<string | null>;
  disconnectGoogleDrive: () => void;
  ensureFreshToken: () => Promise<string | null>;
  getRootFolderId: () => Promise<string | null>;
}

const GoogleDriveContext = createContext<GoogleDriveContextType | null>(null);

const LEGACY_STORAGE_KEY = 'medturnos_google_drive_session';
const getStorageKey = (uid?: string | null) =>
  uid ? `medturnos_google_drive_session_${uid}` : LEGACY_STORAGE_KEY;

async function ensureGsiScriptLoaded(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.google?.accounts?.oauth2) return true;

  const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
  if (!existingScript) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  for (let i = 0; i < 25; i++) {
    if (window.google?.accounts?.oauth2) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return Boolean(window.google?.accounts?.oauth2);
}

export function GoogleDriveProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const { user, ownerId } = useAuth();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [rootFolderId, setRootFolderId] = useState<string | null>(null);
  const latestTokenRef = useRef<string | null>(null);

  const isExpired = expiresAt ? Date.now() > expiresAt : true;
  const isConnected = !!accessToken && !isExpired;

  const saveSession = useCallback(
    (token: string, expTime: number, gUser: GoogleUserProfile | null, rootId?: string, clientId?: string) => {
      latestTokenRef.current = token;
      setAccessToken(token);
      setExpiresAt(expTime);
      if (gUser) setGoogleUser(gUser);
      if (rootId) setRootFolderId(rootId);

      const payload = JSON.stringify({
        accessToken: token,
        expiresAt: expTime,
        googleUser: gUser,
        rootFolderId: rootId || '',
        clientId: clientId || getGoogleClientId(),
      });

      try {
        localStorage.setItem(getStorageKey(user?.uid), payload);
        localStorage.setItem(LEGACY_STORAGE_KEY, payload);
      } catch (e) {
        console.warn('Could not persist Google Drive session:', e);
      }
    },
    [user?.uid]
  );

  const clearSession = useCallback(() => {
    const tokenToRevoke = latestTokenRef.current || accessToken;
    if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
      } catch (err) {
        console.warn('Error revoking token:', err);
      }
    }
    latestTokenRef.current = null;
    setAccessToken(null);
    setExpiresAt(null);
    setGoogleUser(null);
    setRootFolderId(null);
    try {
      if (user?.uid) {
        localStorage.removeItem(getStorageKey(user.uid));
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (e) {
      console.warn('Could not remove Google Drive session:', e);
    }
  }, [accessToken, user?.uid]);

  // Restore and verify stored session on mount / user change
  useEffect(() => {
    let cancelled = false;
    const activeClientId = getGoogleClientId();

    const restoreAndVerify = async () => {
      try {
        const userKey = getStorageKey(user?.uid);
        const saved = localStorage.getItem(userKey) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!saved) return;

        const parsed = JSON.parse(saved);

        // If the cached session was created under a different/broken OAuth Client ID, purge it immediately
        if (parsed.clientId && parsed.clientId !== activeClientId) {
          localStorage.removeItem(userKey);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          return;
        }

        if (parsed.accessToken && parsed.expiresAt && Date.now() < parsed.expiresAt) {
          // Verify that the token actually works with Google Drive API (not a token lacking Drive scope or disabled API)
          const check = await verifyDriveAccess(parsed.accessToken);
          if (cancelled) return;

          if (!check.ok) {
            console.warn('Stored Google Drive token failed verification, clearing stale session:', check.error);
            localStorage.removeItem(userKey);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            latestTokenRef.current = null;
            setAccessToken(null);
            setExpiresAt(null);
            setRootFolderId(null);
            return;
          }

          latestTokenRef.current = parsed.accessToken;
          setAccessToken(parsed.accessToken);
          setExpiresAt(parsed.expiresAt);
          setGoogleUser(parsed.googleUser || null);

          // Verify or initialize the root folder
          let validRootId = parsed.rootFolderId || '';
          if (validRootId) {
            const exists = await verifyDriveFolderExists(validRootId, parsed.accessToken);
            if (!exists) validRootId = '';
          }
          if (!validRootId) {
            try {
              validRootId = await getOrCreateAppRootFolder(parsed.accessToken);
            } catch (e) {
              console.warn('Could not auto-create root folder during session restore:', e);
            }
          }
          if (!cancelled && validRootId) {
            setRootFolderId(validRootId);
            saveSession(parsed.accessToken, parsed.expiresAt, parsed.googleUser || null, validRootId, activeClientId);
          }
        } else {
          localStorage.removeItem(userKey);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      } catch (e) {
        console.warn('Could not restore Google Drive session:', e);
      }
    };

    void restoreAndVerify();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, saveSession]);

  const disconnectGoogleDrive = useCallback(() => {
    clearSession();
    if (user?.uid) {
      setDoc(
        doc(db, 'users', user.uid),
        {
          googleDriveConnected: false,
          driveEnabled: false,
        },
        { merge: true }
      ).catch(() => {});
    }
    showToast('Cuenta de Google Drive desconectada.');
  }, [clearSession, showToast, user?.uid]);

  const connectGoogleDrive = useCallback(
    async (options?: { forceConsent?: boolean }): Promise<string | null> => {
      const activeClientId = getGoogleClientId();
      if (!activeClientId) {
        showToast('No se encontró el ID de Cliente de Google (OAuth Client ID). Revisa la configuración.', 'error');
        return null;
      }

      setIsConnecting(true);

      const gsiReady = await ensureGsiScriptLoaded();
      if (!gsiReady || !window.google?.accounts?.oauth2) {
        setIsConnecting(false);
        showToast('El servicio de Google Identity no pudo cargarse. Verifica tu conexión a internet o bloqueador de anuncios.', 'error');
        return null;
      }

      return new Promise<string | null>((resolve) => {
        try {
          const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
            client_id: activeClientId,
            scope: GOOGLE_DRIVE_SCOPE,
            include_granted_scopes: true,
            callback: async (response) => {
              if (response.error) {
                setIsConnecting(false);
                if (response.error === 'access_denied') {
                  console.info('Google OAuth: El usuario canceló o rechazó el consentimiento.');
                  showToast('Se canceló la autorización de Google Drive.', 'info');
                } else {
                  console.warn('Google OAuth response warning:', response.error);
                  showToast(`Error al conectar con Google: ${response.error_description || response.error}`, 'error');
                }
                resolve(null);
                return;
              }

              if (!response.access_token) {
                setIsConnecting(false);
                resolve(null);
                return;
              }

              const token = response.access_token;

              // Check that the user actually granted the Drive scope in Google's granular consent dialog
              const hasDriveScope =
                window.google?.accounts?.oauth2?.hasGrantedAnyScope
                  ? window.google.accounts.oauth2.hasGrantedAnyScope(
                      response,
                      'https://www.googleapis.com/auth/drive.file',
                      'https://www.googleapis.com/auth/drive'
                    )
                  : !response.scope || response.scope.includes('drive');

              if (!hasDriveScope) {
                setIsConnecting(false);
                showToast(
                  'Debes marcar la casilla de permisos de Google Drive en la ventana de autorización para poder crear carpetas y subir archivos.',
                  'error'
                );
                resolve(null);
                return;
              }

              // Verify Drive API access & create/verify the root folder immediately
              let rootId = '';
              try {
                rootId = await getOrCreateAppRootFolder(token);
              } catch (folderErr: any) {
                setIsConnecting(false);
                console.error('Drive root folder verification failed:', folderErr);
                showToast(
                  folderErr?.message || 'No se pudo acceder ni crear carpetas en Google Drive. Verifica los permisos de tu cuenta.',
                  'error'
                );
                resolve(null);
                return;
              }

              const expiresIn = response.expires_in || 3600;
              const expirationTimestamp = Date.now() + expiresIn * 1000;

              // Fetch user profile info
              const profile = await fetchGoogleUserInfo(token);

              saveSession(token, expirationTimestamp, profile, rootId, activeClientId);

              // Update Firestore user record (and owner record if staff)
              const targetUid = user?.uid;
              if (targetUid) {
                try {
                  await setDoc(
                    doc(db, 'users', targetUid),
                    {
                      googleDriveConnected: true,
                      driveEnabled: true,
                      googleDriveEmail: profile?.email || user?.email || '',
                      googleDriveRootFolderId: rootId,
                    },
                    { merge: true }
                  );
                } catch (dbErr) {
                  console.warn('Could not update user document in Firestore:', dbErr);
                }
              }

              setIsConnecting(false);
              showToast(`Conectado exitosamente con Google Drive (${profile?.email || 'Carpeta lista'})`, 'success');
              resolve(token);
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
                resolve(null);
                return;
              }

              if (isPopupBlocked) {
                console.warn('Google OAuth: La ventana fue bloqueada por el navegador.');
                showToast(
                  'El navegador bloqueó la ventana emergente de Google. Por favor permite las ventanas emergentes (popups) para este sitio.',
                  'warning'
                );
                resolve(null);
                return;
              }

              console.warn('Google Identity notification:', err);
              showToast('No se pudo completar la conexión con Google Drive.', 'error');
              resolve(null);
            },
          });

          // Request access token; use 'consent' if forced or if no prior session exists
          tokenClient.requestAccessToken({
            prompt: options?.forceConsent ? 'consent' : '',
          });
        } catch (err: any) {
          setIsConnecting(false);
          const isPopupClosed =
            err?.type === 'popup_closed' ||
            (typeof err?.message === 'string' && /popup.*close/i.test(err.message)) ||
            (typeof err === 'string' && /popup.*close/i.test(err));

          if (isPopupClosed) {
            console.info('Google OAuth: Ventana cerrada por el usuario.');
            resolve(null);
            return;
          }

          console.warn('Error starting Google Drive connection:', err);
          showToast(`Fallo al conectar: ${err?.message || err}`, 'error');
          resolve(null);
        }
      });
    },
    [showToast, user?.uid, user?.email, saveSession]
  );

  const ensureFreshToken = useCallback(async (): Promise<string | null> => {
    const currentToken = latestTokenRef.current || accessToken;
    if (currentToken && !isExpired) {
      return currentToken;
    }
    showToast('Reconectando sesión de Google Drive...', 'info');
    const freshToken = await connectGoogleDrive();
    return freshToken;
  }, [accessToken, isExpired, showToast, connectGoogleDrive]);

  const getRootFolderId = useCallback(async (): Promise<string | null> => {
    const token = latestTokenRef.current || accessToken;
    if (!token || isExpired) return null;
    try {
      if (rootFolderId) {
        const exists = await verifyDriveFolderExists(rootFolderId, token);
        if (exists) return rootFolderId;
      }
      const id = await getOrCreateAppRootFolder(token);
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
