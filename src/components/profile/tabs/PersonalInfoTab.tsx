import React from 'react';
import { 
  User, 
  Building, 
  MapPin, 
  Globe, 
  Briefcase, 
  Award, 
  Phone, 
  Mail, 
  Info, 
  HelpCircle,
  Eye,
  CheckCircle2,
  Stethoscope
} from 'lucide-react';
import { ProfileState } from '../../../types/profile';
import { PhoneInputField } from '../../PhoneInputField';
import { cn } from '../../../lib/utils';

interface PersonalInfoTabProps {
  profile: ProfileState;
  isAdmin: boolean;
  isStaff: boolean;
  userEmail: string | null | undefined;
  emailVerified: boolean;
  onChange: <K extends keyof ProfileState>(field: K, value: ProfileState[K]) => void;
  onPreviewClick: () => void;
}

export function PersonalInfoTab({
  profile,
  isAdmin,
  isStaff,
  userEmail,
  emailVerified,
  onChange,
  onPreviewClick
}: PersonalInfoTabProps) {
  return (
    <div className="space-y-6">
      {/* SECTION 1: Personal Identity */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <User size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                1. Información Personal del Administrador
              </h3>
              <p className="text-xs text-on-surface-variant">
                Datos de identificación personal y contacto directo.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-primary bg-primary/5 px-2.5 py-1 rounded-full border border-primary/20">
            Identidad
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Display Name */}
          <div className="space-y-1.5">
            <label 
              htmlFor="profile-display-name" 
              className="text-xs font-bold text-on-surface flex items-center justify-between"
            >
              <span>Nombre Completo *</span>
              <span className="text-[10px] text-on-surface-variant font-normal">Requerido</span>
            </label>
            <input 
              id="profile-display-name"
              type="text"
              value={profile.displayName}
              onChange={(e) => onChange('displayName', e.target.value)}
              placeholder="Ej. Dr. Carlos Mendoza / Administrador del Sistema"
              className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>

          {/* Email (Read-only representation with status) */}
          <div className="space-y-1.5">
            <label 
              htmlFor="profile-email-readonly" 
              className="text-xs font-bold text-on-surface flex items-center justify-between"
            >
              <span>Correo Electrónico Principal</span>
              {emailVerified ? (
                <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                  <CheckCircle2 size={11} /> Verificado
                </span>
              ) : (
                <span className="text-[10px] text-amber-700 font-bold">
                  Pendiente de verificación
                </span>
              )}
            </label>
            <div className="relative">
              <input 
                id="profile-email-readonly"
                type="email"
                disabled
                value={userEmail || profile.email}
                className="w-full pl-9 pr-3.5 py-2.5 bg-surface-dim/60 text-on-surface-variant text-xs font-mono rounded-xl border border-outline-variant cursor-not-allowed"
              />
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
            </div>
            <p className="text-[10px] text-on-surface-variant">
              Para cambiar su correo electrónico acceda a la pestaña de Seguridad.
            </p>
          </div>

          {/* Phone with Flexible Country Input */}
          <div className="space-y-1.5 md:col-span-2">
            <label 
              htmlFor="profile-phone-input" 
              className="text-xs font-bold text-on-surface flex items-center justify-between"
            >
              <span>Teléfono Móvil / WhatsApp de Contacto</span>
              <span className="text-[10px] text-on-surface-variant font-normal">Soporta código de país y número local</span>
            </label>
            <PhoneInputField
              id="profile-phone-input"
              value={profile.phone}
              onChange={(val) => onChange('phone', val)}
              helperText="Ej. 11 2345 6789 o +54 9 11 2345 6789"
            />
            <p className="text-[10px] text-on-surface-variant">
              Utilizado para notificaciones internas de seguridad y doble factor.
            </p>
          </div>

          {/* Language & Timezone */}
          <div className="space-y-1.5">
            <label 
              htmlFor="profile-language-select" 
              className="text-xs font-bold text-on-surface"
            >
              Idioma del Sistema
            </label>
            <select
              id="profile-language-select"
              value={profile.language || 'es'}
              onChange={(e) => onChange('language', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all cursor-pointer"
            >
              <option value="es">Español (Latinoamérica)</option>
              <option value="es-AR">Español (Argentina)</option>
              <option value="en">English (US)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label 
              htmlFor="profile-timezone-select" 
              className="text-xs font-bold text-on-surface"
            >
              Zona Horaria
            </label>
            <select
              id="profile-timezone-select"
              value={profile.timezone || 'America/Argentina/Buenos_Aires'}
              onChange={(e) => onChange('timezone', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all cursor-pointer"
            >
              <option value="America/Argentina/Buenos_Aires">Buenos Aires, Argentina (GMT-3)</option>
              <option value="America/Montevideo">Montevideo, Uruguay (GMT-3)</option>
              <option value="America/Santiago">Santiago, Chile (GMT-3)</option>
              <option value="America/Lima">Lima, Perú (GMT-5)</option>
              <option value="America/Bogota">Bogotá, Colombia (GMT-5)</option>
              <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
              <option value="Europe/Madrid">Madrid, España (CET)</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 2: Organization & Clinic Sede */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Building size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                2. Organización y Sede Institucional
              </h3>
              <p className="text-xs text-on-surface-variant">
                Identidad de la clínica o consultorio central para avisos y turnos.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            Impacto Global
          </span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Clinic Name */}
            <div className="space-y-1.5">
              <label 
                htmlFor="profile-clinic-name" 
                className="text-xs font-bold text-on-surface flex items-center justify-between"
              >
                <span>Nombre de la Sede Central / Clínica</span>
                <span className="text-[10px] text-primary font-bold">Variable {'{clinica}'}</span>
              </label>
              <input 
                id="profile-clinic-name"
                type="text"
                value={profile.clinicName}
                onChange={(e) => onChange('clinicName', e.target.value)}
                placeholder="Ej. Centro Odontológico San Lucas"
                className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>

            {/* Clinic Phone */}
            <div className="space-y-1.5">
              <label 
                htmlFor="profile-clinic-phone" 
                className="text-xs font-bold text-on-surface flex items-center justify-between"
              >
                <span>Teléfono Institucional de Recepción</span>
                <span className="text-[10px] text-primary font-bold">Variable {'{telefono}'}</span>
              </label>
              <input 
                id="profile-clinic-phone"
                type="text"
                value={profile.clinicPhone || ''}
                onChange={(e) => onChange('clinicPhone', e.target.value)}
                placeholder="Ej. +54 9 11 5555 4444"
                className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>
          </div>

          {/* Clinic Address with Live Reminder Impact */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <label 
                htmlFor="profile-clinic-address" 
                className="text-xs font-bold text-on-surface flex items-center gap-1.5"
              >
                <MapPin size={14} className="text-primary" />
                <span>Dirección de la Sede Central</span>
              </label>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                Sustituye la variable {'{direccion}'} en WhatsApp
              </span>
            </div>
            
            <input 
              id="profile-clinic-address"
              type="text"
              value={profile.clinicAddress}
              onChange={(e) => onChange('clinicAddress', e.target.value)}
              placeholder="Ej. Av. Santa Fe 1234, Piso 4, Consultorio B, CABA"
              className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />

            {/* Live Visual Reminder Impact Box */}
            <div className="p-3 bg-primary/5 rounded-xl border border-primary/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-on-surface">Impacto directo en recordatorios de WhatsApp:</p>
                  <p className="text-on-surface-variant text-[11px] mt-0.5">
                    "Lo esperamos en <strong className="text-primary font-bold">{profile.clinicAddress || '[Dirección no configurada]'}</strong> el día..."
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onPreviewClick}
                className="shrink-0 px-3 py-1.5 bg-white hover:bg-surface border border-outline-variant rounded-xl text-xs font-bold text-primary flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all self-start sm:self-center"
              >
                <Eye size={13} />
                <span>Ver simulación</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: Clinical & Executive Role */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Briefcase size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                3. Rol Directivo y Práctica Clínica
              </h3>
              <p className="text-xs text-on-surface-variant">
                Definición del ejercicio clínico vs. función puramente administrativa.
              </p>
            </div>
          </div>
        </div>

        {/* Pure Admin Role Switch */}
        <div className="p-4 bg-surface rounded-xl border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <label 
              htmlFor="toggle-pure-admin" 
              className="text-xs font-bold text-on-surface flex items-center gap-2 cursor-pointer"
            >
              <Stethoscope size={15} className="text-primary" />
              <span>¿Ejerce práctica clínica directa o es rol puramente administrativo?</span>
            </label>
            <p className="text-[11px] text-on-surface-variant">
              {profile.isPureAdminRole 
                ? "Actualmente configurado como rol puramente directivo/administrativo (no atiende pacientes en agenda)."
                : "Actualmente configurado con práctica clínica activa (puede recibir turnos en su agenda)."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-on-surface-variant">
              {profile.isPureAdminRole ? 'Directivo / Gestión' : 'Atiende Pacientes'}
            </span>
            <input 
              id="toggle-pure-admin"
              type="checkbox"
              checked={!profile.isPureAdminRole}
              onChange={(e) => onChange('isPureAdminRole', !e.target.checked)}
              className="w-5 h-5 text-primary rounded-md focus:ring-primary cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Specialty / Cargo */}
          <div className="space-y-1.5">
            <label 
              htmlFor="profile-specialty" 
              className="text-xs font-bold text-on-surface flex items-center justify-between"
            >
              <span>Especialidad o Cargo Directivo</span>
              <span className="text-[10px] text-on-surface-variant">Visible en perfil</span>
            </label>
            <input 
              id="profile-specialty"
              type="text"
              value={profile.specialty}
              onChange={(e) => onChange('specialty', e.target.value)}
              placeholder="Ej. Dirección Médica y Gestión / Odontología General"
              className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>

          {/* License Number (Matrícula) - Optional for pure admins */}
          <div className="space-y-1.5">
            <label 
              htmlFor="profile-license-number" 
              className="text-xs font-bold text-on-surface flex items-center justify-between"
            >
              <span>Matrícula Profesional (MN / MP)</span>
              <span className="text-[10px] text-on-surface-variant">
                {profile.isPureAdminRole ? 'Opcional para directivos' : 'Requerida para atención'}
              </span>
            </label>
            <input 
              id="profile-license-number"
              type="text"
              value={profile.licenseNumber}
              onChange={(e) => onChange('licenseNumber', e.target.value)}
              placeholder={profile.isPureAdminRole ? "No aplica si no ejerce práctica clínica" : "Ej. MN 123456"}
              className="w-full px-3.5 py-2.5 bg-surface text-on-surface text-xs font-semibold rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
            {profile.isPureAdminRole && (
              <p className="text-[10px] text-on-surface-variant">
                Como rol administrativo/directivo, puede dejar este campo vacío sin advertencias clínicas.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
