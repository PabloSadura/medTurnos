import React from 'react';
import { 
  Camera, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  Globe, 
  Loader2, 
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Send
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ProfileState } from '../../types/profile';

interface ProfileHeaderProps {
  profile: ProfileState;
  isAdmin: boolean;
  isStaff: boolean;
  userEmail: string | null | undefined;
  emailVerified: boolean;
  saving: boolean;
  isDirty: boolean;
  modifiedSections: string[];
  verifyEmailCooldown: number;
  onPhotoClick: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onPreviewClick: () => void;
  onVerifyEmail: () => void;
}

export function ProfileHeader({
  profile,
  isAdmin,
  isStaff,
  userEmail,
  emailVerified,
  saving,
  isDirty,
  modifiedSections,
  verifyEmailCooldown,
  onPhotoClick,
  onSave,
  onDiscard,
  onPreviewClick,
  onVerifyEmail
}: ProfileHeaderProps) {
  // Normalized role badge and text
  const roleDisplay = isAdmin
    ? {
        title: 'Superadministrador',
        scope: 'Toda la organización',
        badgeClass: 'bg-primary/10 text-primary border-primary/20'
      }
    : isStaff
    ? {
        title: 'Staff Administrativo',
        scope: 'Consultorio y Asistencia',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
      }
    : {
        title: 'Profesional Clínico',
        scope: 'Atención Médica Directa',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-200'
      };

  return (
    <div className="space-y-4">
      {/* Priority Warning: Unverified Superadmin Email */}
      {!emailVerified && (
        <div 
          role="alert" 
          aria-live="polite"
          className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-2xs"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 sm:mt-0">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-amber-950">
                  Correo pendiente de verificación
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200/70 text-amber-900 rounded-full">
                  Acción requerida
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-0.5 leading-relaxed">
                Verifique <strong className="font-mono font-bold">{userEmail}</strong> para habilitar la recuperación de cuenta y recibir notificaciones de seguridad de la organización.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onVerifyEmail}
            disabled={verifyEmailCooldown > 0}
            className="self-start sm:self-center shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-h-[40px] touch-manipulation"
          >
            <Send size={13} />
            <span>{verifyEmailCooldown > 0 ? `Reintentar en ${verifyEmailCooldown}s` : 'Enviar correo de verificación'}</span>
          </button>
        </div>
      )}

      {/* Main Identity & Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Identity Block: Avatar, Name, Email, Role and Status */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative group shrink-0">
              <button
                type="button"
                onClick={onPhotoClick}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl border-2 border-primary/20 overflow-hidden bg-surface-bright flex items-center justify-center shadow-inner focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none cursor-pointer"
                title="Haga clic para cambiar o recortar foto de perfil"
                aria-label="Foto de perfil. Presione para cargar una nueva imagen."
              >
                {profile.photoURL ? (
                  <img 
                    src={profile.photoURL} 
                    alt={`Foto de ${profile.displayName || 'perfil'}`} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-black text-2xl sm:text-3xl text-primary bg-primary/10 select-none">
                    {profile.displayName?.charAt(0)?.toUpperCase() || userEmail?.charAt(0)?.toUpperCase() || 'A'}
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={onPhotoClick}
                title="Cambiar foto de perfil"
                aria-label="Subir nueva foto de perfil"
                className="absolute -bottom-1 -right-1 p-2 bg-primary text-white rounded-xl border-2 border-white shadow-md hover:bg-primary/90 transition-transform active:scale-95 cursor-pointer flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary outline-none"
              >
                <Camera size={14} />
              </button>
            </div>

            {/* Names, Normalized Role, Verified Status & Clinic */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-black text-on-surface tracking-tight truncate">
                  {profile.displayName || (isAdmin ? 'Administrador del Sistema' : 'Usuario')}
                </h1>
                
                {/* Normalized Role Badge with Scope */}
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1",
                  roleDisplay.badgeClass
                )}>
                  <ShieldCheck size={12} />
                  <span>{roleDisplay.title} · {roleDisplay.scope}</span>
                </span>

                {/* Explicit Textual Status */}
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  <span>Estado: Activo</span>
                </span>
              </div>

              {/* Email and Verified Badge */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-on-surface-variant font-medium">
                <span className="flex items-center gap-1.5 font-mono text-on-surface">
                  <Mail size={13} className="text-primary/70 shrink-0" />
                  {userEmail || profile.email}
                </span>

                <span className="text-outline-variant">•</span>

                {emailVerified ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle2 size={13} className="text-emerald-600" /> Correo verificado
                  </span>
                ) : (
                  <span className="text-amber-800 font-bold flex items-center gap-1 text-[11px]">
                    <AlertCircle size={13} className="text-amber-600" /> No verificado
                  </span>
                )}
              </div>

              {/* Specialty / Role Position */}
              <p className="text-[11px] font-bold text-primary uppercase tracking-wider truncate">
                {profile.specialty || (isAdmin ? 'Dirección Médica y Gestión' : 'Especialidad')}
                {profile.licenseNumber ? ` • Mat. ${profile.licenseNumber}` : ''}
              </p>
            </div>
          </div>

          {/* Action Buttons: Preview & Save */}
          <div className="flex items-center gap-2.5 self-stretch lg:self-auto justify-end flex-wrap pt-2 lg:pt-0 border-t lg:border-t-0 border-outline-variant/60">
            <button
              type="button"
              onClick={onPreviewClick}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold border border-outline-variant hover:border-primary/40 bg-surface-bright/50 hover:bg-surface text-on-surface flex items-center gap-1.5 uppercase tracking-wider transition-all cursor-pointer min-h-[44px]"
              title="Simular visualización para pacientes en WhatsApp y avisos"
            >
              <Globe size={14} className="text-primary" />
              <span className="hidden sm:inline">Vista Previa Paciente</span>
              <span className="sm:hidden">Previa</span>
            </button>

            {isDirty && (
              <button
                type="button"
                onClick={onDiscard}
                disabled={saving}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold border border-outline-variant hover:bg-surface-dim text-on-surface-variant flex items-center gap-1.5 uppercase tracking-wider transition-all cursor-pointer min-h-[44px]"
                title="Descartar las modificaciones realizadas"
              >
                <RotateCcw size={14} />
                <span>Descartar</span>
              </button>
            )}

            <button 
              type="button"
              onClick={onSave}
              disabled={saving || !isDirty}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer min-h-[44px]",
                saving 
                  ? "bg-surface-dim text-on-surface-variant opacity-60 cursor-not-allowed" 
                  : isDirty
                    ? "bg-primary text-white hover:bg-primary/90 active:scale-95 shadow-primary/20"
                    : "bg-surface text-on-surface-variant/40 border border-outline-variant cursor-not-allowed"
              )}
              title={isDirty ? "Guardar los cambios realizados en el perfil" : "No hay modificaciones pendientes por guardar"}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </div>

        {/* Changes Indicator Bar */}
        {isDirty && (
          <div className="mt-4 pt-3 border-t border-outline-variant/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-amber-900 bg-amber-50/90 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-3 px-5 sm:px-6 rounded-b-2xl gap-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span>
                Modificaciones sin guardar en: <strong className="underline">{modifiedSections.join(', ')}</strong>
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-amber-800">Recuerde presionar "Guardar Cambios" para aplicar las actualizaciones.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
