import React, { useState, useMemo } from 'react';
import { 
  Lock, 
  ShieldCheck, 
  ShieldAlert, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Copy, 
  Check, 
  LogOut, 
  Laptop, 
  Smartphone, 
  Globe, 
  Loader2, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  KeyRound,
  RefreshCw
} from 'lucide-react';
import { updatePassword, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { logAuditEvent } from '../../../lib/auditLogger';
import { cn } from '../../../lib/utils';

interface SecurityTabProps {
  userEmail: string | null | undefined;
  emailVerified: boolean;
  userUid: string | undefined;
  verifyEmailCooldown: number;
  resetEmailCooldown: number;
  onVerifyEmail: () => void;
  onSendResetEmail: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function SecurityTab({
  userEmail,
  emailVerified,
  userUid,
  verifyEmailCooldown,
  resetEmailCooldown,
  onVerifyEmail,
  onSendResetEmail,
  showToast
}: SecurityTabProps) {
  // Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Technical UID Accordion
  const [showUidDetails, setShowUidDetails] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  // Active Sessions & Revocation State
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  // Password Policy Analysis (Minimum 12 chars for admin, upper, lower, number, special)
  const passwordCriteria = useMemo(() => {
    const hasLength = newPassword.length >= 12;
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
    const matchesConfirm = newPassword.length > 0 && newPassword === confirmPassword;

    let score = 0;
    if (hasLength) score += 25;
    if (hasUpper && hasLower) score += 25;
    if (hasNumber) score += 25;
    if (hasSpecial) score += 25;

    let label = 'Muy débil';
    let color = 'bg-red-500';
    if (score >= 100) {
      label = 'Excelente (Grado Clínico)';
      color = 'bg-emerald-500';
    } else if (score >= 75) {
      label = 'Fuerte';
      color = 'bg-teal-500';
    } else if (score >= 50) {
      label = 'Moderada';
      color = 'bg-amber-500';
    }

    const isValid = hasLength && hasUpper && hasLower && hasNumber && hasSpecial && matchesConfirm;

    return {
      hasLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      matchesConfirm,
      score,
      label,
      color,
      isValid
    };
  }, [newPassword, confirmPassword]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!passwordCriteria.isValid) {
      setPasswordError('La contraseña no cumple con todos los requisitos de seguridad institucional requeridos para administradores.');
      return;
    }

    setIsChangingPassword(true);
    setPasswordError(null);

    try {
      await updatePassword(auth.currentUser, newPassword);
      showToast('Contraseña actualizada con éxito', 'success');
      setNewPassword('');
      setConfirmPassword('');
      
      // Log security audit event
      await logAuditEvent({
        action: 'UPDATE_PASSWORD',
        section: 'Seguridad',
        details: 'El superadministrador actualizó su contraseña de acceso institucional'
      });
    } catch (err: any) {
      console.error('Error changing password:', err);
      if (err.code === 'auth/requires-recent-login') {
        setPasswordError('Por seguridad, debe cerrar sesión e iniciar nuevamente para cambiar la contraseña.');
      } else {
        setPasswordError(err.message || 'No se pudo actualizar la contraseña.');
      }
      showToast('Error al actualizar contraseña', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const copyUidToClipboard = () => {
    if (!userUid) return;
    navigator.clipboard.writeText(userUid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 3000);
    showToast('Identificador técnico (UID) copiado al portapapeles', 'info');
  };

  const handleRevokeOtherSessions = async () => {
    setIsRevokingSessions(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const response = await fetch('/api/auth/revoke-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('No se pudo revocar las sesiones activas.');
      }

      await logAuditEvent({
        action: 'REVOKE_SESSIONS',
        section: 'Seguridad',
        details: 'El superadministrador forzó el cierre de todas las demás sesiones activas'
      });

      showToast('Se han cerrado todas las demás sesiones activas de la cuenta', 'success');
      setShowRevokeModal(false);
    } catch (err: any) {
      console.error('Error revoking sessions:', err);
      showToast('No se pudo revocar las demás sesiones. Intente más tarde.', 'error');
    } finally {
      setIsRevokingSessions(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: Verification Status & Password Reset Email */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                1. Estado de Verificación y Respaldo de Cuenta
              </h3>
              <p className="text-xs text-on-surface-variant">
                Garantice la integridad de la cuenta principal del sistema.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Email verification card */}
          <div className="p-4 bg-surface rounded-xl border border-outline-variant flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface">Verificación del Correo</span>
                {emailVerified ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full uppercase flex items-center gap-1">
                    <CheckCircle2 size={11} /> Verificado
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full uppercase flex items-center gap-1">
                    <AlertCircle size={11} /> No Verificado
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant">
                {emailVerified 
                  ? 'Su correo institucional está verificado. Recibirá alertas de auditoría y respaldo.' 
                  : 'Recomendamos verificar el correo para habilitar la recuperación de contraseña y alertas.'}
              </p>
            </div>

            {!emailVerified && (
              <button
                type="button"
                onClick={onVerifyEmail}
                disabled={verifyEmailCooldown > 0}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 min-h-[40px]"
              >
                <Send size={13} />
                <span>{verifyEmailCooldown > 0 ? `Reintentar en ${verifyEmailCooldown}s` : 'Enviar correo de verificación'}</span>
              </button>
            )}
          </div>

          {/* Password reset link email */}
          <div className="p-4 bg-surface rounded-xl border border-outline-variant flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-on-surface">Restablecimiento por Enlace Externo</span>
              <p className="text-[11px] text-on-surface-variant">
                Envíe un enlace seguro a su casilla <strong className="font-mono">{userEmail}</strong> para restablecer su contraseña desde el navegador.
              </p>
            </div>

            <button
              type="button"
              onClick={onSendResetEmail}
              disabled={resetEmailCooldown > 0}
              className="w-full py-2 bg-white hover:bg-surface-dim border border-outline-variant text-on-surface text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 min-h-[40px]"
            >
              <KeyRound size={13} />
              <span>{resetEmailCooldown > 0 ? `Reenviar en ${resetEmailCooldown}s` : 'Enviar enlace de restablecimiento'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: Robust Password Policy for Administrators */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Lock size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                2. Cambio de Contraseña (Política de Superadministrador)
              </h3>
              <p className="text-xs text-on-surface-variant">
                Requiere un estándar estricto de 12 caracteres con caracteres combinados para resguardo de historias clínicas.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-primary bg-primary/5 px-2.5 py-1 rounded-full border border-primary/20">
            Estándar Clínico
          </span>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* New Password */}
            <div className="space-y-1.5">
              <label 
                htmlFor="security-new-password" 
                className="text-xs font-bold text-on-surface flex items-center justify-between"
              >
                <span>Nueva Contraseña *</span>
                <span className="text-[10px] text-on-surface-variant">Mínimo 12 caracteres</span>
              </label>
              <div className="relative">
                <input
                  id="security-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ingrese nueva contraseña"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
                  aria-label={showNewPassword ? 'Ocultar nueva contraseña' : 'Ver nueva contraseña'}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label 
                htmlFor="security-confirm-password" 
                className="text-xs font-bold text-on-surface flex items-center justify-between"
              >
                <span>Confirmar Nueva Contraseña *</span>
                <span className="text-[10px] text-on-surface-variant">Debe coincidir exactamente</span>
              </label>
              <div className="relative">
                <input
                  id="security-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita la nueva contraseña"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
                  aria-label={showConfirmPassword ? 'Ocultar confirmación de contraseña' : 'Ver confirmación de contraseña'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Strength Bar */}
          {newPassword.length > 0 && (
            <div className="space-y-1.5 p-3 bg-surface rounded-xl border border-outline-variant">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-on-surface-variant">Fortaleza de Contraseña:</span>
                <span className="text-on-surface">{passwordCriteria.label}</span>
              </div>
              <div className="w-full h-2 bg-outline-variant/50 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-300", passwordCriteria.color)}
                  style={{ width: `${passwordCriteria.score}%` }}
                />
              </div>
            </div>
          )}

          {/* Real-time Criteria Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            <div className={cn(
              "p-2.5 rounded-lg border flex items-center gap-2",
              passwordCriteria.hasLength ? "bg-emerald-50 text-emerald-900 border-emerald-200" : "bg-surface text-on-surface-variant border-outline-variant"
            )}>
              <CheckCircle2 size={14} className={passwordCriteria.hasLength ? "text-emerald-600" : "opacity-40"} />
              <span>Al menos 12 caracteres</span>
            </div>

            <div className={cn(
              "p-2.5 rounded-lg border flex items-center gap-2",
              passwordCriteria.hasUpper && passwordCriteria.hasLower ? "bg-emerald-50 text-emerald-900 border-emerald-200" : "bg-surface text-on-surface-variant border-outline-variant"
            )}>
              <CheckCircle2 size={14} className={passwordCriteria.hasUpper && passwordCriteria.hasLower ? "text-emerald-600" : "opacity-40"} />
              <span>Mayúsculas y minúsculas</span>
            </div>

            <div className={cn(
              "p-2.5 rounded-lg border flex items-center gap-2",
              passwordCriteria.hasNumber ? "bg-emerald-50 text-emerald-900 border-emerald-200" : "bg-surface text-on-surface-variant border-outline-variant"
            )}>
              <CheckCircle2 size={14} className={passwordCriteria.hasNumber ? "text-emerald-600" : "opacity-40"} />
              <span>Al menos un número (0-9)</span>
            </div>

            <div className={cn(
              "p-2.5 rounded-lg border flex items-center gap-2",
              passwordCriteria.hasSpecial ? "bg-emerald-50 text-emerald-900 border-emerald-200" : "bg-surface text-on-surface-variant border-outline-variant"
            )}>
              <CheckCircle2 size={14} className={passwordCriteria.hasSpecial ? "text-emerald-600" : "opacity-40"} />
              <span>Al menos un símbolo (@, $, !, etc.)</span>
            </div>

            <div className={cn(
              "p-2.5 rounded-lg border flex items-center gap-2 sm:col-span-2",
              passwordCriteria.matchesConfirm ? "bg-emerald-50 text-emerald-900 border-emerald-200" : "bg-surface text-on-surface-variant border-outline-variant"
            )}>
              <CheckCircle2 size={14} className={passwordCriteria.matchesConfirm ? "text-emerald-600" : "opacity-40"} />
              <span>Ambas contraseñas coinciden</span>
            </div>
          </div>

          {passwordError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={15} className="text-red-600 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isChangingPassword || !passwordCriteria.isValid}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isChangingPassword ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            <span>{isChangingPassword ? 'Actualizando Contraseña...' : 'Actualizar Contraseña'}</span>
          </button>
        </form>
      </div>

      {/* SECTION 3: Active Sessions and Authorized Devices */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Globe size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                3. Sesiones Activas y Dispositivos Autorizados
              </h3>
              <p className="text-xs text-on-surface-variant">
                Monitoreo de accesos a la cuenta institucional de superadministrador.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {/* Current Session */}
          <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                <Laptop size={18} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-950">Navegador Actual (Sesión Activa)</span>
                  <span className="px-2 py-0.2 bg-emerald-200 text-emerald-900 text-[10px] font-black rounded-full uppercase">
                    Este Dispositivo
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  {navigator.userAgent.includes('Macintosh') ? 'macOS' : navigator.userAgent.includes('Windows') ? 'Windows' : 'Linux'} • Navegador Web Seguro
                </p>
              </div>
            </div>

            <div className="text-[11px] text-emerald-800 font-mono">
              IP Conexión: <span className="font-bold">Protegida / Local</span>
            </div>
          </div>

          {/* Revoke All Other Sessions */}
          <div className="p-4 bg-surface rounded-xl border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-bold text-on-surface">Cierre de Seguridad de Otras Sesiones</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Si sospecha que su cuenta fue abierta en un equipo no confiable, revoque los tokens de sesión inmediatamente.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowRevokeModal(true)}
              className="px-4 py-2 bg-surface hover:bg-red-50 text-red-700 hover:text-red-800 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 min-h-[40px]"
            >
              <LogOut size={14} />
              <span>Cerrar otras sesiones</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: Protected Technical UID (Collapsible Accordion) */}
      <div className="bg-white rounded-2xl border border-outline-variant shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowUidDetails(!showUidDetails)}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-surface transition-colors cursor-pointer"
          aria-expanded={showUidDetails}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface text-on-surface-variant rounded-xl border border-outline-variant">
              <KeyRound size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Identificador Técnico (UID) de Soporte
              </h4>
              <p className="text-[11px] text-on-surface-variant">
                Uso exclusivo para auditoría técnica y mesa de ayuda.
              </p>
            </div>
          </div>
          {showUidDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showUidDetails && (
          <div className="p-4 sm:p-5 pt-0 border-t border-outline-variant/60 bg-surface/50 space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <span>
                Este identificador interno pertenece a los registros del motor de base de datos. Solo compártalo con soporte oficial verificado de MedTurnos.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={userUid || 'Cargando identificador...'}
                className="flex-1 px-3 py-2 bg-white text-on-surface font-mono text-xs rounded-xl border border-outline-variant select-all cursor-text"
              />
              <button
                type="button"
                onClick={copyUidToClipboard}
                className="px-3.5 py-2 bg-white hover:bg-surface-dim border border-outline-variant rounded-xl text-xs font-bold text-on-surface flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
                title="Copiar UID"
              >
                {copiedUid ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedUid ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Confirm Revoke Sessions */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl border border-outline-variant shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <div className="p-3 bg-red-50 rounded-xl">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-on-surface">
                  ¿Cerrar todas las demás sesiones?
                </h3>
                <p className="text-xs text-on-surface-variant">Acción de seguridad institucional</p>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Esta acción invalidará de inmediato los tokens de sesión en cualquier otro teléfono, computadora o navegador donde esta cuenta haya iniciado sesión. Su sesión actual permanecerá activa.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRevokeModal(false)}
                disabled={isRevokingSessions}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleRevokeOtherSessions}
                disabled={isRevokingSessions}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isRevokingSessions ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                <span>{isRevokingSessions ? 'Cerrando...' : 'Confirmar Cierre'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
