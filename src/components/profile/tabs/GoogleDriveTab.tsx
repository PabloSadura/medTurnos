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
  Trash2,
  Key,
  Copy,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useGoogleDrive } from '../../../contexts/GoogleDriveContext';
import { getGoogleClientId, setCustomGoogleClientId } from '../../../lib/googleDrive';
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
  const [verifyingRoot, setVerifyingRoot] = useState(false);

  // Custom OAuth Client ID & Origin Troubleshooting state
  const [customClientIdInput, setCustomClientIdInput] = useState(() => localStorage.getItem('medturnos_custom_oauth_client_id') || '');
  const [showOAuthHelp, setShowOAuthHelp] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-3kwo2v25dudxhaqgrpqa5c-166114037624.us-east5.run.app';
  const activeClientId = getGoogleClientId();

  const handleSaveCustomClientId = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customClientIdInput.trim();
    setCustomGoogleClientId(trimmed);
    showToast(trimmed ? 'ID de Cliente OAuth guardado con éxito' : 'Se restauró el ID de Cliente predeterminado', 'success');
  };

  const handleCopyOrigin = () => {
    navigator.clipboard.writeText(currentOrigin);
    showToast(`Origen copiado: ${currentOrigin}`, 'info');
  };

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

  const handleOpenOrCreateRootFolder = async () => {
    setVerifyingRoot(true);
    try {
      const id = rootFolderId || (await getRootFolderId());
      if (id) {
        showToast('Carpeta raíz de MedTurnos verificada en Google Drive', 'success');
        window.open(`https://drive.google.com/drive/folders/${id}`, '_blank');
      } else {
        showToast('No se pudo verificar la carpeta raíz. Intenta reconectar tu cuenta de Google Drive.', 'error');
      }
    } finally {
      setVerifyingRoot(false);
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
                {isAdmin
                  ? 'Copia de seguridad externa para fotos clínicas, radiografías y consentimientos médicos.'
                  : 'Vincula tu cuenta de Google Drive para crear carpetas por paciente, subir estudios y respaldar fotos de evolución.'}
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
            <span className="text-[10px] text-primary font-bold">
              {isAdmin ? 'Configuración para Administrador' : 'Configuración del Profesional'}
            </span>
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
                <p className="text-xs font-black text-on-surface">
                  {isAdmin ? 'Drive Institucional (Recomendado)' : 'Drive del Consultorio / Clínica (Recomendado)'}
                </p>
                <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                  {isAdmin
                    ? 'Esta cuenta servirá como repositorio institucional para radiografías, estudios y consentimientos de todos los profesionales y pacientes de la clínica.'
                    : 'Organiza automáticamente una carpeta raíz para el consultorio y una subcarpeta individual por cada paciente atendido.'}
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
                <p className="text-xs font-black text-on-surface">
                  {isAdmin ? 'Drive Personal del Administrador' : 'Drive Personal del Profesional'}
                </p>
                <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                  Solo respaldará los archivos, estudios y fotografías clínicas de los pacientes asignados directamente a tu agenda.
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
                  onClick={handleOpenOrCreateRootFolder}
                  disabled={verifyingRoot}
                  className="px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px] disabled:opacity-50"
                  title="Verificar y abrir carpeta raíz en Google Drive"
                >
                  {verifyingRoot ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                  <span>{rootFolderId ? 'Carpeta MedTurnos' : 'Crear / Abrir Carpeta Raíz'}</span>
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

        {/* SECTION: Custom OAuth Client ID & Error 400 origin_mismatch Resolver */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key size={15} className="text-primary" />
              <span className="text-xs font-bold text-on-surface">Configuración de Cliente OAuth y Cuentas de Gmail</span>
            </div>
            <button
              type="button"
              onClick={() => setShowOAuthHelp(!showOAuthHelp)}
              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle size={13} />
              <span>¿Error 400 origin_mismatch?</span>
              {showOAuthHelp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Cada profesional puede conectar su propia cuenta de Gmail y Google Drive institucional o personal. Si tu consola de Google Cloud muestra el <b>Error 400: origin_mismatch</b>, se debe a que el dominio actual de la aplicación debe estar registrado en los <i>Orígenes de JavaScript autorizados</i> del Client ID.
          </p>

          {showOAuthHelp && (
            <div className="p-3 bg-white border border-slate-300 rounded-lg space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between bg-slate-100 p-2 rounded-md">
                <span className="font-mono text-[11px] text-slate-800 break-all select-all">{currentOrigin}</span>
                <button
                  type="button"
                  onClick={handleCopyOrigin}
                  className="px-2.5 py-1 bg-white hover:bg-slate-200 border border-slate-300 rounded text-[10px] font-bold text-slate-800 flex items-center gap-1 shrink-0 ml-2 cursor-pointer"
                >
                  <Copy size={12} />
                  <span>Copiar Origen</span>
                </button>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pl-1 leading-relaxed">
                <li>Ve a <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary font-bold hover:underline inline-flex items-center gap-0.5">Google Cloud Console &gt; Credenciales <ExternalLink size={10} /></a>.</li>
                <li>Selecciona tu <b>ID de cliente de OAuth 2.0</b> (tipo Aplicación web).</li>
                <li>En la sección <b>Orígenes de JavaScript autorizados</b>, haz clic en <i>+ Agregar URI</i> y pega el origen copiado arriba.</li>
                <li>Guarda los cambios y vuelve a pulsar <b>Conectar Google Drive</b>.</li>
              </ol>
            </div>
          )}

          <form onSubmit={handleSaveCustomClientId} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <div className="flex-1">
              <input
                type="text"
                value={customClientIdInput}
                onChange={(e) => setCustomClientIdInput(e.target.value)}
                placeholder={activeClientId || "Ingresa tu OAuth Client ID (ej: 123...apps.googleusercontent.com)"}
                className="w-full px-3 py-2 bg-white text-xs border border-outline-variant rounded-xl font-mono text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer"
            >
              Guardar Client ID
            </button>
            {customClientIdInput && (
              <button
                type="button"
                onClick={() => {
                  setCustomClientIdInput('');
                  setCustomGoogleClientId('');
                  showToast('Se restableció el Client ID predeterminado', 'info');
                }}
                className="px-3 py-2 bg-surface hover:bg-slate-200 text-on-surface-variant rounded-xl text-xs font-bold transition-all shrink-0 border border-outline-variant cursor-pointer"
              >
                Restablecer
              </button>
            )}
          </form>
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
