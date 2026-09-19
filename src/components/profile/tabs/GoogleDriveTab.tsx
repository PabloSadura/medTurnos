import React, { useState } from 'react';
import { 
  Cloud, 
  FolderOpen, 
  Folder, 
  ExternalLink, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck, 
  Building, 
  User, 
  AlertTriangle,
  Info,
  Trash2
} from 'lucide-react';
import { useGoogleDrive } from '../../../contexts/GoogleDriveContext';
import { ProfileState } from '../../../types/profile';
import { cn } from '../../../lib/utils';

interface GoogleDriveTabProps {
  profile: ProfileState;
  isAdmin: boolean;
  onChange: <K extends keyof ProfileState>(field: K, value: ProfileState[K]) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function GoogleDriveTab({
  profile,
  isAdmin,
  onChange,
  showToast
}: GoogleDriveTabProps) {
  const { 
    isConnected, 
    isConnecting, 
    googleUser, 
    rootFolderId, 
    connectGoogleDrive, 
    disconnectGoogleDrive, 
    getRootFolderId 
  } = useGoogleDrive();

  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConfirmDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectGoogleDrive();
      showToast('Google Drive desconectado con éxito', 'info');
      setIsDisconnectModalOpen(false);
    } catch (err: any) {
      console.error('Error disconnecting drive:', err);
      showToast('Error al desconectar Google Drive', 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: Scope & Connection Status Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-5">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Cloud size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                Almacenamiento en Google Drive
              </h3>
              <p className="text-xs text-on-surface-variant">
                Copia de seguridad externa para fotos clínicas, radiografías y consentimientos médicos.
              </p>
            </div>
          </div>

          {isConnected ? (
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Conectado
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={13} /> No Conectado
            </span>
          )}
        </div>

        {/* Scope Selector: Institutional vs Personal Drive */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface flex items-center justify-between">
            <span>Alcance de la Cuenta Conectada</span>
            <span className="text-[10px] text-primary font-bold">Configuración para Administrador</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChange('driveScope', 'institutional')}
              className={cn(
                "p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5",
                profile.driveScope === 'institutional'
                  ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary"
                  : "bg-surface border-outline-variant hover:border-primary/40 text-on-surface"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 bg-white rounded-lg border border-outline-variant text-primary">
                  <Building size={16} />
                </div>
                {profile.driveScope === 'institutional' && (
                  <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded-full uppercase">
                    Seleccionado
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-black text-on-surface">Drive Institucional (Recomendado)</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                  Esta cuenta servirá como repositorio institucional para radiografías, estudios y consentimientos de todos los profesionales y pacientes de la clínica.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChange('driveScope', 'personal')}
              className={cn(
                "p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5",
                profile.driveScope === 'personal'
                  ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary"
                  : "bg-surface border-outline-variant hover:border-primary/40 text-on-surface"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 bg-white rounded-lg border border-outline-variant text-primary">
                  <User size={16} />
                </div>
                {profile.driveScope === 'personal' && (
                  <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded-full uppercase">
                    Seleccionado
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-black text-on-surface">Drive Personal del Administrador</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                  Solo respaldará los archivos de los pacientes asignados directamente a su agenda propia.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Current Connection Details & Action Bar */}
        <div className="p-4 bg-surface rounded-xl border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-on-surface">
              {isConnected ? 'Cuenta Google Vinculada' : 'Estado de Vinculación'}
            </span>
            <p className="text-xs font-mono font-medium text-on-surface-variant">
              {isConnected 
                ? (googleUser?.email || 'Cuenta conectada y autorizada') 
                : 'Ninguna cuenta conectada actualmente'}
            </p>
            <p className="text-[11px] text-on-surface-variant">
              Scope autorizado: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-outline-variant text-[10px]">https://www.googleapis.com/auth/drive.file</code>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0 flex-wrap">
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const id = rootFolderId || await getRootFolderId();
                    if (id) window.open(`https://drive.google.com/drive/folders/${id}`, '_blank');
                    else window.open('https://drive.google.com', '_blank');
                  }}
                  className="px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                  title="Abrir carpeta raíz en Google Drive"
                >
                  <FolderOpen size={14} />
                  <span>Carpeta MedTurnos</span>
                  <ExternalLink size={12} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsDisconnectModalOpen(true)}
                  className="px-3.5 py-2 bg-surface hover:bg-red-50 text-on-surface-variant hover:text-red-700 border border-outline-variant hover:border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                >
                  <Trash2 size={13} />
                  <span>Desconectar</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { void connectGoogleDrive(); }}
                disabled={isConnecting}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 min-h-[44px]"
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Cloud size={15} />
                    <span>Conectar Google Drive</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: Organization Impact & Architecture Explanations */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-outline-variant shadow-xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Folder size={16} />
          </div>
          <h4 className="text-xs font-black text-on-surface uppercase tracking-wider">
            Estructura Institucional
          </h4>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Se crea automáticamente la carpeta raíz <strong>MedTurnos_Pacientes</strong> y una subcarpeta aislada por cada paciente.
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-outline-variant shadow-xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <ShieldCheck size={16} />
          </div>
          <h4 className="text-xs font-black text-on-surface uppercase tracking-wider">
            Privacidad Segura (drive.file)
          </h4>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            La plataforma solo tiene acceso a los archivos creados por ella misma. Nunca leerá ni accederá a otros documentos de su cuenta personal.
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-outline-variant shadow-xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center">
            <Sparkles size={16} />
          </div>
          <h4 className="text-xs font-black text-on-surface uppercase tracking-wider">
            Disponibilidad Inmediata
          </h4>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Los odontólogos y secretarias podrán subir fotos evolutivas antes/después y radiografías desde el módulo clínico.
          </p>
        </div>
      </div>

      {/* SECTION 3: Guaranteed Business Continuity */}
      <div className="p-4 bg-surface rounded-xl border border-outline-variant text-xs text-on-surface-variant space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-on-surface">
          <Info size={14} className="text-primary" />
          <span>Continuidad operativa garantizada:</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          El sistema MedTurnos permanece <strong>100% operativo</strong> incluso si Google Drive no está conectado o se desconecta temporalmente. Todas las citas, historias clínicas, cobros, presupuestos y pacientes se persisten con total integridad en la base de datos principal.
        </p>
      </div>

      {/* Disconnect Warning Modal */}
      {isDisconnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl border border-outline-variant shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-700">
              <div className="p-3 bg-amber-50 rounded-xl">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-on-surface">
                  ¿Desconectar Google Drive Institucional?
                </h3>
                <p className="text-xs text-on-surface-variant">Confirmación de impacto</p>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Desconectar la unidad de Drive institucional suspenderá la sincronización automática de fotos clínicas y consentimientos de los pacientes. Los archivos previamente guardados en su cuenta de Google Drive no se eliminarán.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDisconnectModalOpen(false)}
                disabled={isDisconnecting}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={isDisconnecting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDisconnecting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{isDisconnecting ? 'Desconectando...' : 'Confirmar Desconexión'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
