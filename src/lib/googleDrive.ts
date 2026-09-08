import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

export const DEFAULT_GOOGLE_CLIENT_ID = '410876856184-50cmm871petrptm30kn2ciloahlqe87b.apps.googleusercontent.com';

export const getGoogleClientId = (): string => {
  return (
    ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string) ||
    localStorage.getItem('medturnos_custom_oauth_client_id') ||
    (firebaseConfig as any).oAuthClientId ||
    DEFAULT_GOOGLE_CLIENT_ID
  );
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
            callback: (response: {
              access_token?: string;
              error?: string;
              expires_in?: number;
              token_type?: string;
            }) => void;
            error_callback?: (err: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
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
    if (!res.ok) return null;
    const data = await res.json();
    return {
      email: data.email || '',
      name: data.name || data.email?.split('@')[0] || 'Usuario Google',
      picture: data.picture,
    };
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
  let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
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
    const errorText = await res.text();
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
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al crear carpeta en Drive: ${errText}`);
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
 * Get or create the specific folder for a patient
 */
export async function getOrCreatePatientFolder(
  patient: { id: string; name: string; idNumber?: string },
  accessToken: string
): Promise<string> {
  const rootFolderId = await getOrCreateAppRootFolder(accessToken);
  const patientFolderName = `${patient.name} (${patient.idNumber ? `DNI ${patient.idNumber}` : patient.id.slice(0, 6)})`;
  
  const existingId = await findDriveFolder(patientFolderName, rootFolderId, accessToken);
  if (existingId) return existingId;
  return await createDriveFolder(patientFolderName, rootFolderId, accessToken);
}

/**
 * Upload a binary or text file to Google Drive using multipart upload
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
  const name = fileName || (file instanceof File ? file.name : 'archivo_adjunto');
  const mimeType = file.type || 'application/octet-stream';

  const metadata = {
    name,
    mimeType,
    parents: [parentFolderId],
    description: description || `Subido desde MedTurnos - Categoría: ${category || 'General'}`,
    properties: {
      category: category || 'General',
      app: 'MedTurnos',
    },
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' }));
  form.append('file', file, name);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,size,createdTime,description,properties',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Fallo al subir archivo a Google Drive: ${errorText}`);
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
    const errText = await res.text();
    throw new Error(`Error al listar archivos: ${errText}`);
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
    const err = await res.text();
    throw new Error(`Error al eliminar archivo de Drive: ${err}`);
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
  content += `Documento / DNI: ${patient.idNumber || '-'}\n`;
  content += `Fecha de Nacimiento: ${patient.birthDate || '-'}\n`;
  content += `Género: ${patient.gender === 'Male' ? 'Masculino' : patient.gender === 'Female' ? 'Femenino' : patient.gender || '-'}\n`;
  content += `Teléfono de Contacto: ${patient.phone || '-'}\n`;
  content += `Correo Electrónico: ${patient.email || '-'}\n`;
  content += `Estado de la Ficha: ${patient.status === 'active' ? 'ACTIVO' : 'INACTIVO'}\n\n`;

  content += `------------------------------------------------------------------------\n`;
  content += `2. RESUMEN Y ANTECEDENTES CLÍNICOS\n`;
  content += `------------------------------------------------------------------------\n`;
  content += `Cantidad de Registros / Evoluciones: ${evolutions.length}\n`;
  content += `Última Actualización: ${evolutions.length > 0 ? evolutions[0].date || '-' : 'Sin visitas registradas'}\n\n`;

  content += `------------------------------------------------------------------------\n`;
  content += `3. EVOLUCIONES Y REGISTRO DE ATENCIONES CRONOLÓGICAS\n`;
  content += `------------------------------------------------------------------------\n\n`;

  if (evolutions.length === 0) {
    content += `[No se registran notas de evolución hasta el momento]\n\n`;
  } else {
    evolutions.forEach((evo, idx) => {
      content += `REGISTRO #${idx + 1}\n`;
      content += `Fecha: ${evo.date || '-'}\n`;
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
