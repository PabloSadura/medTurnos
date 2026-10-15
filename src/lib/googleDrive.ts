import firebaseConfig from '../../firebase-applet-config.json';
import { formatEvolutionDate } from './evolutionUtils';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

export const DEFAULT_GOOGLE_CLIENT_ID = '410876856184-50cmm871petrptm30kn2ciloahlqe87b.apps.googleusercontent.com';

export const getGoogleClientId = (): string => {
  const customClientId = localStorage.getItem('medturnos_custom_oauth_client_id');
  const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const projectClientId = (firebaseConfig as any).oAuthClientId as string | undefined;

  // Custom user-configured Client ID or env overrides take first precedence
  if (customClientId && customClientId.trim()) return customClientId.trim();
  if (envClientId && envClientId.trim()) return envClientId.trim();

  // If a project OAuth Client ID exists in config, check if default fallback is preferred
  return (
    (customClientId && customClientId.trim()) ||
    (envClientId && envClientId.trim()) ||
    DEFAULT_GOOGLE_CLIENT_ID ||
    (projectClientId && projectClientId.trim()) ||
    ''
  );
};

export const setCustomGoogleClientId = (clientId: string) => {
  if (clientId && clientId.trim()) {
    localStorage.setItem('medturnos_custom_oauth_client_id', clientId.trim());
  } else {
    localStorage.removeItem('medturnos_custom_oauth_client_id');
  }
};

export const GOOGLE_CLIENT_ID = getGoogleClientId();

export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  createdTime: string;
  description?: string;
  category?: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            include_granted_scopes?: boolean;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
              expires_in?: number;
              token_type?: string;
              scope?: string;
            }) => void;
            error_callback?: (err: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          hasGrantedAllScopes?: (tokenResponse: any, firstScope: string, ...restScopes: string[]) => boolean;
          hasGrantedAnyScope?: (tokenResponse: any, firstScope: string, ...restScopes: string[]) => boolean;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

/**
 * Helper to parse Google Drive API error responses into readable messages
 */
async function parseDriveApiError(res: Response, fallbackPrefix: string): Promise<Error> {
  let detail = '';
  try {
    const errJson = await res.json();
    const apiMsg = errJson?.error?.message || errJson?.error_description || '';
    const reason = errJson?.error?.errors?.[0]?.reason || errJson?.error?.status || '';
    if (res.status === 401) {
      detail = 'La sesión de Google Drive expiró o el token no es válido. Por favor, desconecta y vuelve a conectar tu cuenta de Google Drive.';
    } else if (res.status === 403) {
      if (reason === 'insufficientPermissions' || apiMsg.toLowerCase().includes('insufficient permission')) {
        detail = 'Permisos insuficientes en Google Drive. Al conectar tu cuenta, asegúrate de marcar la casilla para autorizar a MedTurnos a crear carpetas y subir archivos.';
      } else if (reason === 'accessNotConfigured' || apiMsg.includes('has not been used in project')) {
        detail = 'La API de Google Drive no está habilitada para este proyecto OAuth. Reconecta la cuenta de Google Drive.';
      } else {
        detail = apiMsg || 'Acceso denegado por Google Drive (403).';
      }
    } else if (res.status === 404) {
      detail = 'La carpeta o archivo de destino no existe o fue eliminado en Google Drive (404).';
    } else {
      detail = apiMsg || `HTTP ${res.status}`;
    }
  } catch {
    const text = await res.text().catch(() => '');
    detail = text || `HTTP ${res.status}`;
  }
  const error = new Error(`${fallbackPrefix}: ${detail}`);
  (error as any).status = res.status;
  return error;
}

/**
 * Verify that an access token has active permission to use Google Drive API
 */
export async function verifyDriveAccess(accessToken: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!accessToken) return { ok: false, error: 'Sin token de acceso' };
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await parseDriveApiError(res, 'Verificación de Drive');
      return { ok: false, status: res.status, error: err.message };
    }
    return { ok: true, status: 200 };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Error de red al verificar Google Drive' };
  }
}

/**
 * Verify if a specific folder ID exists and is not in trash
 */
export async function verifyDriveFolderExists(folderId: string, accessToken: string): Promise<boolean> {
  if (!folderId || !accessToken) return false;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data && data.id && !data.trashed && data.mimeType === 'application/vnd.google-apps.folder');
  } catch {
    return false;
  }
}

/**
 * Fetch basic user info using Google OAuth token
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserProfile | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        email: data.email || '',
        name: data.name || data.email?.split('@')[0] || 'Usuario Google',
        picture: data.picture,
      };
    }
    // Fallback to Drive about endpoint if userinfo scope was not returned
    const driveRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName,photoLink)', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (driveRes.ok) {
      const driveData = await driveRes.json();
      const u = driveData?.user;
      if (u) {
        return {
          email: u.emailAddress || '',
          name: u.displayName || u.emailAddress?.split('@')[0] || 'Usuario Google',
          picture: u.photoLink,
        };
      }
    }
    return null;
  } catch (err) {
    console.error('Error fetching Google userinfo:', err);
    return null;
  }
}

/**
 * Find an existing folder by name and optional parent in Google Drive
 */
export async function findDriveFolder(
  folderName: string,
  parentFolderId?: string,
  accessToken?: string
): Promise<string | null> {
  if (!accessToken) return null;
  const escapedName = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`;
  if (parentFolderId) {
    q += ` and '${parentFolderId}' in parents`;
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw await parseDriveApiError(res, 'Error al consultar carpetas en Google Drive');
    }
    const errorText = await res.text().catch(() => '');
    console.error('Error finding drive folder:', errorText);
    return null;
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Create a new folder in Google Drive
 */
export async function createDriveFolder(
  folderName: string,
  parentFolderId?: string,
  accessToken?: string
): Promise<string> {
  if (!accessToken) throw new Error('No se ha proporcionado un token de acceso a Google Drive.');

  const metadata: Record<string, any> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    throw await parseDriveApiError(res, 'Error al crear carpeta en Drive');
  }

  const data = await res.json();
  return data.id;
}

/**
 * Get or create the main MedTurnos root folder in the user's Drive
 */
export async function getOrCreateAppRootFolder(accessToken: string): Promise<string> {
  const rootFolderName = 'MedTurnos - Historias Clínicas y Pacientes';
  const existingId = await findDriveFolder(rootFolderName, undefined, accessToken);
  if (existingId) return existingId;
  return await createDriveFolder(rootFolderName, undefined, accessToken);
}

/**
 * Get or create the specific folder for a patient.
 * Searches for existing folder by patient name (or with DNI) and creates it if not present.
 */
export async function getOrCreatePatientFolder(
  patient: { id: string; name: string; idNumber?: string; driveFolderId?: string },
  accessToken: string,
  knownFolderId?: string | null
): Promise<string> {
  // 0. If we already have a candidate folder ID, verify if it actually exists and is accessible in Drive
  const candidateId = knownFolderId || patient.driveFolderId;
  if (candidateId) {
    const isValid = await verifyDriveFolderExists(candidateId, accessToken);
    if (isValid) {
      return candidateId;
    }
  }

  const rootFolderId = await getOrCreateAppRootFolder(accessToken);
  const cleanName = (patient.name || 'Paciente').trim();
  const patientFolderNameWithDni = patient.idNumber ? `${cleanName} (DNI ${patient.idNumber})` : cleanName;
  
  // 1. Check if folder already exists by exact name
  let existingId = await findDriveFolder(cleanName, rootFolderId, accessToken);
  // 2. Or by name with DNI
  if (!existingId && patientFolderNameWithDni !== cleanName) {
    existingId = await findDriveFolder(patientFolderNameWithDni, rootFolderId, accessToken);
  }
  // 3. Or check legacy ID slice format
  if (!existingId && patient.id) {
    const legacyName = `${cleanName} (${patient.idNumber ? `DNI ${patient.idNumber}` : patient.id.slice(0, 6)})`;
    existingId = await findDriveFolder(legacyName, rootFolderId, accessToken);
  }

  if (existingId) return existingId;

  // Create folder with patient's name
  const folderToCreate = patient.idNumber ? `${cleanName} (DNI ${patient.idNumber})` : cleanName;
  return await createDriveFolder(folderToCreate, rootFolderId, accessToken);
}

/**
 * Upload a binary or text file to Google Drive using RFC 2387 multipart/related upload
 */
export async function uploadFileToDrive({
  file,
  fileName,
  parentFolderId,
  accessToken,
  description,
  category,
}: {
  file: File | Blob;
  fileName?: string;
  parentFolderId: string;
  accessToken: string;
  description?: string;
  category?: string;
}): Promise<DriveFileItem> {
  if (!accessToken) {
    throw new Error('No hay conexión activa con Google Drive.');
  }

  const name = fileName || (file instanceof File ? file.name : 'archivo_adjunto');
  const mimeType = file.type || 'application/octet-stream';

  // Ensure parent folder exists before uploading; if not, fallback to root folder
  let validParentId = parentFolderId;
  if (validParentId) {
    const parentExists = await verifyDriveFolderExists(validParentId, accessToken);
    if (!parentExists) {
      validParentId = await getOrCreateAppRootFolder(accessToken);
    }
  } else {
    validParentId = await getOrCreateAppRootFolder(accessToken);
  }

  const metadata = {
    name,
    mimeType,
    parents: validParentId ? [validParentId] : undefined,
    description: description || `Subido desde MedTurnos - Categoría: ${category || 'General'}`,
    properties: {
      category: category || 'General',
      app: 'MedTurnos',
    },
  };

  const boundary = '-------MedTurnosDriveBoundary' + Date.now().toString(16) + Math.random().toString(16).slice(2);
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaPartHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = new Blob([metadataPart, mediaPartHeader, file, closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,size,createdTime,description,properties',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!res.ok) {
    throw await parseDriveApiError(res, 'Fallo al subir archivo a Google Drive');
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    webViewLink: data.webViewLink,
    webContentLink: data.webContentLink,
    size: data.size,
    createdTime: data.createdTime,
    description: data.description,
    category: data.properties?.category || category || 'General',
  };
}

/**
 * List files inside a patient's folder
 */
export async function listFilesInPatientFolder(
  parentFolderId: string,
  accessToken: string
): Promise<DriveFileItem[]> {
  const q = `'${parentFolderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,webContentLink,size,createdTime,description,properties)&orderBy=createdTime desc`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw await parseDriveApiError(res, 'Error al listar archivos');
  }

  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink,
    webContentLink: f.webContentLink,
    size: f.size,
    createdTime: f.createdTime,
    description: f.description,
    category: f.properties?.category || 'General',
  }));
}

/**
 * Delete a file in Google Drive
 */
export async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    throw await parseDriveApiError(res, 'Error al eliminar archivo de Drive');
  }
}

/**
 * Formats and generates a clinical history document, uploading it directly to the patient's Google Drive folder
 */
export async function generateAndUploadClinicalHistoryDoc({
  patient,
  evolutions,
  doctorName,
  parentFolderId,
  accessToken,
}: {
  patient: any;
  evolutions: any[];
  doctorName: string;
  parentFolderId: string;
  accessToken: string;
}): Promise<DriveFileItem> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  let content = `========================================================================\n`;
  content += `           MEDTURNOS - FICHA E HISTORIA CLÍNICA INTEGRAL                \n`;
  content += `========================================================================\n\n`;
  content += `FECHA DE EMISIÓN: ${dateStr} - ${timeStr}\n`;
  content += `PROFESIONAL A CARGO: ${doctorName || 'Médico Especialista'}\n\n`;
  content += `------------------------------------------------------------------------\n`;
  content += `1. DATOS PERSONALES DEL PACIENTE\n`;
  content += `------------------------------------------------------------------------\n`;
  content += `Nombre Completo: ${patient.name || '-'}\n`;
  if (patient.idNumber) {
    content += `Documento: ${patient.idNumber}\n`;
  }
  content += `Fecha de Nacimiento: ${patient.birthDate || '-'}\n`;
  content += `Género: ${patient.gender === 'Male' ? 'Masculino' : patient.gender === 'Female' ? 'Femenino' : patient.gender || '-'}\n`;
  content += `Teléfono de Contacto: ${patient.phone || '-'}\n`;
  content += `Correo Electrónico: ${patient.email || '-'}\n`;
  content += `Estado de la Ficha: ${patient.status === 'active' ? 'ACTIVO' : 'INACTIVO'}\n\n`;

  content += `------------------------------------------------------------------------\n`;
  content += `2. RESUMEN Y ANTECEDENTES CLÍNICOS\n`;
  content += `------------------------------------------------------------------------\n`;
  content += `Cantidad de Registros / Evoluciones: ${evolutions.length}\n`;
  content += `Última Actualización: ${evolutions.length > 0 ? formatEvolutionDate(evolutions[0].date) : 'Sin visitas registradas'}\n\n`;

  content += `------------------------------------------------------------------------\n`;
  content += `3. EVOLUCIONES Y REGISTRO DE ATENCIONES CRONOLÓGICAS\n`;
  content += `------------------------------------------------------------------------\n\n`;

  if (evolutions.length === 0) {
    content += `[No se registran notas de evolución hasta el momento]\n\n`;
  } else {
    evolutions.forEach((evo, idx) => {
      content += `REGISTRO #${idx + 1}\n`;
      content += `Fecha: ${formatEvolutionDate(evo.date)}\n`;
      content += `Tratamiento / Procedimiento: ${evo.treatment || 'Consulta General'}\n`;
      content += `Profesional: ${evo.doctorName || doctorName || 'Médico'}\n`;
      content += `Estado: ${evo.status || 'Completado'}\n`;
      if (evo.paidAmount !== undefined) {
        content += `Monto Facturado: $${Number(evo.paidAmount).toLocaleString()}\n`;
      }
      content += `Notas y Observaciones Clínicas:\n`;
      content += `${evo.note ? evo.note.trim() : '(Sin anotaciones específicas)'}\n`;
      content += `------------------------------------------------------------------------\n`;
    });
  }

  content += `\nDocumento generado y resguardado automáticamente mediante la integración de MedTurnos con Google Drive.\n`;
  content += `© MedTurnos - Gestión Médica y Clínica Segura.\n`;

  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
  const sanitizedPatientName = (patient.name || 'Paciente').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Historia_Clinica_${sanitizedPatientName}_${now.toISOString().split('T')[0]}.txt`;

  return await uploadFileToDrive({
    file: blob,
    fileName,
    parentFolderId,
    accessToken,
    description: `Historia clínica completa generada el ${dateStr} por ${doctorName}`,
    category: 'Historia Clínica',
  });
}
