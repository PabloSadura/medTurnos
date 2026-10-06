import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  Auth
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || 'turneroweb');
export const auth = getAuth(app);
export const googleClientId = (firebaseConfig as any).oAuthClientId || '';

const SECONDARY_APP_NAME = 'MedTurnosAdminUserProvisioningApp';
let secondaryAuthInstance: Auth | null = null;

function getSecondaryAuth(): Auth {
  if (secondaryAuthInstance) {
    return secondaryAuthInstance;
  }
  const existingSecondary = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  const secondaryApp = existingSecondary || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  try {
    secondaryAuthInstance = initializeAuth(secondaryApp, {
      persistence: inMemoryPersistence
    });
  } catch {
    secondaryAuthInstance = getAuth(secondaryApp);
  }
  return secondaryAuthInstance;
}

export interface ProvisionAuthResult {
  uid: string | null;
  createdInAuth: boolean;
  alreadyExisted: boolean;
  error?: string;
}

/**
 * Creates or verifies a user in Firebase Authentication using an isolated secondary
 * Firebase App instance with in-memory persistence so the current Administrator
 * session is never interrupted or signed out.
 */
export async function provisionUserInFirebaseAuth(params: {
  email: string;
  password?: string;
  displayName?: string;
}): Promise<ProvisionAuthResult> {
  const cleanEmail = (params.email || '').trim().toLowerCase();
  const cleanPassword = (params.password || '').trim();
  const cleanName = (params.displayName || '').trim();

  if (!cleanEmail || !cleanPassword) {
    return {
      uid: null,
      createdInAuth: false,
      alreadyExisted: false,
      error: 'Email y contraseña requeridos para crear cuenta en Firebase Authentication.'
    };
  }

  const secAuth = getSecondaryAuth();

  try {
    const userCredential = await createUserWithEmailAndPassword(secAuth, cleanEmail, cleanPassword);
    const createdUser = userCredential.user;

    if (cleanName) {
      try {
        await updateProfile(createdUser, { displayName: cleanName });
      } catch (profileErr) {
        console.warn('[Firebase Auth Provision] Could not set displayName:', profileErr);
      }
    }

    const uid = createdUser.uid;
    await signOut(secAuth).catch(() => {});

    return {
      uid,
      createdInAuth: true,
      alreadyExisted: false
    };
  } catch (err: any) {
    const code = err?.code || '';
    const msg = err?.message || String(err);

    // If the user already exists in Firebase Authentication, try signing in on secondary auth
    // to retrieve their exact Firebase Auth UID without disturbing the admin's session
    if (code === 'auth/email-already-in-use' || msg.includes('EMAIL_EXISTS')) {
      try {
        const signInCred = await signInWithEmailAndPassword(secAuth, cleanEmail, cleanPassword);
        const existingUser = signInCred.user;
        if (cleanName && existingUser.displayName !== cleanName) {
          await updateProfile(existingUser, { displayName: cleanName }).catch(() => {});
        }
        const uid = existingUser.uid;
        await signOut(secAuth).catch(() => {});
        return {
          uid,
          createdInAuth: false,
          alreadyExisted: true
        };
      } catch {
        await signOut(secAuth).catch(() => {});
        return {
          uid: null,
          createdInAuth: false,
          alreadyExisted: true
        };
      }
    }

    await signOut(secAuth).catch(() => {});

    let friendlyError = msg;
    if (code === 'auth/operation-not-allowed') {
      friendlyError = 'El método de acceso Email/Contraseña no está habilitado en Firebase Console (Authentication > Sign-in method).';
    } else if (code === 'auth/weak-password') {
      friendlyError = 'La contraseña es demasiado débil para Firebase Authentication (mínimo 6 caracteres).';
    } else if (code === 'auth/invalid-email') {
      friendlyError = 'El formato del correo electrónico no es válido para Firebase Authentication.';
    }

    return {
      uid: null,
      createdInAuth: false,
      alreadyExisted: false,
      error: friendlyError
    };
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Do not crash the entire react rendering cycle on background snapshot listeners
  return errInfo;
}
