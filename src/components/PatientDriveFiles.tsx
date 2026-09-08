import React, { useState, useEffect, useRef } from 'react';
import { 
  Cloud, 
  UploadCloud, 
  FileText, 
  ExternalLink, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Folder, 
  File, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  Plus, 
  Loader2,
  Lock,
  Sparkles,
  Tag,
  ShieldCheck,
  Eye
} from 'lucide-react';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { 
  getOrCreatePatientFolder, 
  listFilesInPatientFolder, 
  uploadFileToDrive, 
  deleteDriveFile, 
  generateAndUploadClinicalHistoryDoc,
  DriveFileItem 
} from '../lib/googleDrive';
import { useToast } from './Toast';
import { cn } from '../lib/utils';

interface PatientDriveFilesProps {
  patient: {
    id: string;
    name: string;
    idNumber?: string;
    birthDate?: string;
    gender?: string;
    phone?: string;
    email?: string;
    status?: string;
  };
  evolutions?: any[];
  doctorName?: string;
}

const CATEGORIES = [
  'Historia Clínica',
  'Estudio Médico',
  'Radiografía / Imagen',
  'Laboratorio',
  'Consentimiento Informado',
  'Receta Médica',
  'Informe Quirúrgico',
  'General',
];

export function PatientDriveFiles({ patient, evolutions = [], doctorName = 'Dr. Profesional' }: PatientDriveFilesProps) {
  const { showToast } = useToast();
  const { 
    isConnected, 
    isConnecting, 
    accessToken, 
    googleUser, 
    connectGoogleDrive, 
    disconnectGoogleDrive,
    isExpired 
  } = useGoogleDrive();

  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingHistory, setGeneratingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Estudio Médico');
  const [fileDescription, setFileDescription] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load patient folder and files when connected
  const loadPatientFiles = async () => {
    if (!accessToken || !patient?.id) return;
    setLoading(true);
    try {
      const pFolderId = await getOrCreatePatientFolder(patient, accessToken);
      setFolderId(pFolderId);
      const items = await listFilesInPatientFolder(pFolderId, accessToken);
      setFiles(items);
    } catch (err: any) {
      console.error('Error loading patient files from Drive:', err);
      showToast(err.message || 'Error al cargar archivos desde Google Drive', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && accessToken) {
      loadPatientFiles();
    } else {
      setFiles([]);
      setFolderId(null);
    }
  }, [isConnected, accessToken, patient.id]);

  // Handle direct file upload
  const handleFileUpload = async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles || uploadedFiles.length === 0 || !accessToken) return;

    setUploading(true);
    try {
      let targetFolderId = folderId;
      if (!targetFolderId) {
        targetFolderId = await getOrCreatePatientFolder(patient, accessToken);
        setFolderId(targetFolderId);
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        await uploadFileToDrive({
          file,
          parentFolderId: targetFolderId,
          accessToken,
          category: selectedCategory,
          description: fileDescription || `Archivo médico subido para ${patient.name}`,
        });
      }

      showToast(`Se ${uploadedFiles.length === 1 ? 'subió 1 archivo' : `subieron ${uploadedFiles.length} archivos`} correctamente a Google Drive.`);
      setFileDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadPatientFiles();
    } catch (err: any) {
      console.error('Error uploading file to Drive:', err);
      showToast(err.message || 'Error al subir archivo a Google Drive', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Generate and save Clinical History
  const handleGenerateHistory = async () => {
    if (!accessToken) {
      showToast('Debes estar conectado a Google Drive para guardar la historia clínica.', 'warning');
      return;
    }

    setGeneratingHistory(true);
    try {
      let targetFolderId = folderId;
      if (!targetFolderId) {
        targetFolderId = await getOrCreatePatientFolder(patient, accessToken);
        setFolderId(targetFolderId);
      }

      const docItem = await generateAndUploadClinicalHistoryDoc({
        patient,
        evolutions,
        doctorName,
        parentFolderId: targetFolderId,
        accessToken,
      });

      showToast(`Historia clínica generada y guardada en Google Drive: ${docItem.name}`);
      await loadPatientFiles();
    } catch (err: any) {
      console.error('Error generating clinical history:', err);
      showToast(err.message || 'Error al generar la historia clínica en Drive', 'error');
    } finally {
      setGeneratingHistory(false);
    }
  };

  // Delete file
  const handleDeleteFile = async (fileItem: DriveFileItem) => {
    if (!accessToken) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el archivo "${fileItem.name}" de Google Drive?`)) {
      return;
    }

    setDeletingId(fileItem.id);
    try {
      await deleteDriveFile(fileItem.id, accessToken);
      showToast(`Archivo "${fileItem.name}" eliminado de Google Drive.`);
      setFiles(prev => prev.filter(f => f.id !== fileItem.id));
    } catch (err: any) {
      console.error('Error deleting file:', err);
      showToast(err.message || 'Error al eliminar archivo', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Format file size
  const formatSize = (bytesStr?: string) => {
    if (!bytesStr) return '-';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return bytesStr;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // File icon based on mimeType
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('image')) return <ImageIcon size={20} className="text-tertiary" />;
    if (mimeType.includes('pdf')) return <FileText size={20} className="text-error" />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet size={20} className="text-secondary" />;
    if (mimeType.includes('text') || mimeType.includes('document')) return <FileText size={20} className="text-primary" />;
    return <File size={20} className="text-on-surface-variant" />;
  };

  // If not connected
  if (!isConnected) {
    return (
      <div className="bg-surface rounded-2xl border border-outline-variant p-6 text-center space-y-5">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Cloud size={32} />
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <h3 className="text-base font-bold text-on-surface">
            Conectar con Google Drive
          </h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Conecta tu cuenta de Google para subir y resguardar archivos, estudios médicos, radiografías e historias clínicas de <strong>{patient.name}</strong> directamente en tu Google Drive.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left py-2">
          <div className="p-3 bg-surface-bright rounded-xl border border-outline-variant/60 flex items-start gap-2.5">
            <Folder size={18} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-on-surface">Organizado</p>
              <p className="text-[11px] text-on-surface-variant leading-tight">Carpeta automática por paciente.</p>
            </div>
          </div>
          <div className="p-3 bg-surface-bright rounded-xl border border-outline-variant/60 flex items-start gap-2.5">
            <ShieldCheck size={18} className="text-secondary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-on-surface">Seguro y Privado</p>
              <p className="text-[11px] text-on-surface-variant leading-tight">Tus archivos en tu propia nube.</p>
            </div>
          </div>
          <div className="p-3 bg-surface-bright rounded-xl border border-outline-variant/60 flex items-start gap-2.5">
            <FileText size={18} className="text-tertiary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-on-surface">Historias Clínicas</p>
              <p className="text-[11px] text-on-surface-variant leading-tight">Exporta y archiva en 1 clic.</p>
            </div>
          </div>
        </div>

        <button
          id="btn-patient-connect-drive"
          type="button"
          onClick={() => { void connectGoogleDrive(); }}
          disabled={isConnecting}
          className="inline-flex items-center gap-3 px-6 py-3 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md hover:bg-primary/95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          {isConnecting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Conectando con Google...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Conectar Cuenta de Google Drive
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Account connection & Folder header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-surface-bright rounded-xl border border-outline-variant">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center shrink-0">
            <Cloud size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-on-surface truncate">
                Google Drive Conectado
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-tertiary-container/30 text-tertiary text-[9px] font-bold uppercase tracking-wider">
                <CheckCircle2 size={10} /> Activo
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant truncate">
              {googleUser?.email || 'Cuenta de Google activa'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {folderId && (
            <a
              href={`https://drive.google.com/drive/folders/${folderId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface text-on-surface text-[11px] font-bold uppercase tracking-wider rounded-lg border border-outline-variant hover:bg-surface-dim transition-all"
              title="Abrir carpeta de este paciente en Google Drive"
            >
              <Folder size={13} className="text-primary" />
              Ver en Drive
              <ExternalLink size={11} className="text-on-surface-variant" />
            </a>
          )}

          <button
            type="button"
            onClick={loadPatientFiles}
            disabled={loading}
            className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-dim transition-all"
            title="Refrescar lista"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={disconnectGoogleDrive}
            className="text-[10px] text-on-surface-variant hover:text-error px-2 py-1 font-bold uppercase tracking-wider transition-all"
            title="Desconectar cuenta de Google"
          >
            Desconectar
          </button>
        </div>
      </div>

      {/* Quick Action: Generate and save Clinical History */}
      <div className="p-3.5 bg-gradient-to-r from-primary/5 via-tertiary/5 to-transparent rounded-xl border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} />
            Historia Clínica Digital Oficial
          </div>
          <p className="text-[11px] text-on-surface-variant">
            Genera un informe completo consolidado con datos del paciente, visitas y todas las evoluciones clínicas ({evolutions.length} registradas) y guárdalo directo en Drive.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerateHistory}
          disabled={generatingHistory}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer shrink-0 disabled:opacity-50"
        >
          {generatingHistory ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Guardando en Drive...
            </>
          ) : (
            <>
              <FileText size={14} />
              Guardar Historia Clínica en Drive
            </>
          )}
        </button>
      </div>

      {/* Upload Zone & Category Selector */}
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFileUpload(e.dataTransfer.files);
        }}
        className={cn(
          "p-4 rounded-xl border-2 border-dashed transition-all space-y-3",
          isDragOver 
            ? "border-primary bg-primary/5 scale-[1.01]" 
            : "border-outline-variant bg-surface hover:border-primary/50"
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={12} />
              Categoría del Archivo a Subir:
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs font-medium bg-surface-bright border border-outline-variant rounded-lg px-2.5 py-1.5 text-on-surface focus:outline-none focus:border-primary"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Nota / Descripción Opcional:
            </label>
            <input
              type="text"
              placeholder="Ej: Radiografía panorámica post-operatoria"
              value={fileDescription}
              onChange={(e) => setFileDescription(e.target.value)}
              className="w-full text-xs bg-surface-bright border border-outline-variant rounded-lg px-2.5 py-1.5 text-on-surface focus:outline-none focus:border-primary placeholder:text-on-surface-variant/50"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-outline-variant/60">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <UploadCloud size={18} className="text-primary" />
            <span>Arrastra archivos aquí o selecciónalos desde tu dispositivo</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-on-secondary text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-secondary/90 transition-all cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Subiendo a Google Drive...
              </>
            ) : (
              <>
                <Plus size={14} />
                Seleccionar y Subir Archivo
              </>
            )}
          </button>
        </div>
      </div>

      {/* Files List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
            Archivos Guardados en Google Drive ({files.length})
          </h4>
          {files.length > 0 && (
            <span className="text-[11px] text-on-surface-variant">
              Carpeta: {patient.name}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center bg-surface rounded-xl border border-outline-variant">
            <Loader2 size={24} className="animate-spin text-primary mx-auto mb-2" />
            <p className="text-xs text-on-surface-variant">Consultando archivos en Google Drive...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center bg-surface rounded-xl border border-outline-variant space-y-2">
            <FileText size={32} className="text-on-surface-variant/40 mx-auto" />
            <p className="text-xs font-bold text-on-surface">No hay archivos en la carpeta de este paciente aún</p>
            <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto">
              Sube estudios médicos, fotos o genera la historia clínica completa con los botones superiores.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/60 bg-surface rounded-xl border border-outline-variant overflow-hidden">
            {files.map((file) => (
              <div 
                key={file.id} 
                className="p-3 flex items-center justify-between gap-3 hover:bg-surface-bright/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-surface-bright rounded-lg shrink-0">
                    {getFileIcon(file.mimeType)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-on-surface truncate">
                        {file.name}
                      </p>
                      {file.category && (
                        <span className="shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                          {file.category}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-on-surface-variant flex items-center gap-2">
                      <span>{new Date(file.createdTime).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span>{formatSize(file.size)}</span>
                      {file.description && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[200px]" title={file.description}>
                            {file.description}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-dim transition-all"
                      title="Abrir en Google Drive"
                    >
                      <Eye size={15} />
                    </a>
                  )}

                  {file.webContentLink && (
                    <a
                      href={file.webContentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-on-surface-variant hover:text-secondary rounded-lg hover:bg-surface-dim transition-all"
                      title="Descargar"
                    >
                      <Download size={15} />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteFile(file)}
                    disabled={deletingId === file.id}
                    className="p-2 text-on-surface-variant hover:text-error rounded-lg hover:bg-surface-dim transition-all cursor-pointer disabled:opacity-50"
                    title="Eliminar archivo de Drive"
                  >
                    {deletingId === file.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
