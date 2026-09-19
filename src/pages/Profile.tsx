import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  User, 
  Clock, 
  Shield, 
  Cloud, 
  FileText, 
  AlertTriangle, 
  Save, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { cn } from '../lib/utils';
import { logAuditEvent } from '../lib/auditLogger';
import { ProfileTab, ProfileState, DEFAULT_PROFILE } from '../types/profile';

// Subcomponents
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { AdminScopeCard } from '../components/profile/AdminScopeCard';
import { PersonalInfoTab } from '../components/profile/tabs/PersonalInfoTab';
import { ScheduleTab } from '../components/profile/tabs/ScheduleTab';
import { SecurityTab } from '../components/profile/tabs/SecurityTab';
import { GoogleDriveTab } from '../components/profile/tabs/GoogleDriveTab';
import { AuditLogsTab } from '../components/profile/tabs/AuditLogsTab';
import { PatientPublicProfilePreview } from '../components/PatientPublicProfilePreview';
import { AvatarCropModal } from '../components/AvatarCropModal';

export function Profile() {
  const { user, profile: authProfile } = useAuth();
  const { 
    isConnected: isDriveConnected, 
    disconnectGoogleDrive
  } = useGoogleDrive();

  // Tab State
  const [activeTab, setActiveTab] = useState<ProfileTab>('info');

  // Form Profile State
  const [profile, setProfile] = useState<ProfileState>(DEFAULT_PROFILE);
  const [initialProfile, setInitialProfile] = useState<ProfileState>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Field validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal states
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [tempImageForCrop, setTempImageForCrop] = useState<string | null>(null);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);

  // Cooldown counters
  const [verifyEmailCooldown, setVerifyEmailCooldown] = useState(0);
  const [resetEmailCooldown, setResetEmailCooldown] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = authProfile?.role === 'secretary' || profile.role === 'secretary';
  const isAdmin = authProfile?.role === 'admin' || profile.role === 'admin';

  useEffect(() => {
    if (verifyEmailCooldown <= 0) return;
    const t = setInterval(() => setVerifyEmailCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [verifyEmailCooldown]);

  useEffect(() => {
    if (resetEmailCooldown <= 0) return;
    const t = setInterval(() => setResetEmailCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resetEmailCooldown]);

  // Toast Helper
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Field change helper
  const handleFieldChange = <K extends keyof ProfileState>(field: K, value: ProfileState[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  // Load profile data from Firestore
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const loaded: ProfileState = {
          displayName: data.name || data.displayName || user.displayName || '',
          email: user.email || data.email || '',
          licenseNumber: data.licenseNumber || '',
          specialty: data.specialty || (data.role === 'admin' ? 'Dirección Médica y Gestión' : 'Cirujano Dentista'),
          phone: data.phone || '',
          clinicName: data.clinicName || '',
          clinicAddress: data.clinicAddress || data.address || '',
          photoURL: data.photoURL || user.photoURL || '',
          role: data.role || authProfile?.role || 'medico',
          status: data.status || 'Activo',
          workingDays: Array.isArray(data.schedule?.workingDays) ? data.schedule.workingDays : [1, 2, 3, 4, 5],
          morningStart: data.schedule?.morningStart || '08:00',
          morningEnd: data.schedule?.morningEnd || '12:00',
          morningActive: data.schedule?.morningActive ?? true,
          afternoonStart: data.schedule?.afternoonStart || '14:00',
          afternoonEnd: data.schedule?.afternoonEnd || '18:00',
          afternoonActive: data.schedule?.afternoonActive ?? true,
          appointmentDurationMinutes: data.schedule?.appointmentDurationMinutes || 30,
          isPureAdminRole: data.isPureAdminRole ?? (data.role === 'admin'),
          clinicalPracticeActive: data.clinicalPracticeActive ?? (data.role !== 'admin'),
          scheduleMode: data.scheduleMode || (data.role === 'admin' ? 'institutional_reference' : 'personal_availability'),
          driveScope: data.driveScope || 'institutional',
          driveEnabled: data.driveEnabled ?? false
        };
        setProfile(loaded);
        setInitialProfile(loaded);
      } else {
        const initial: ProfileState = {
          ...DEFAULT_PROFILE,
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
          role: authProfile?.role || 'medico',
          specialty: authProfile?.role === 'admin' ? 'Dirección Médica y Gestión' : 'Cirujano Dentista'
        };
        setProfile(initial);
        setInitialProfile(initial);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching user profile:', error);
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authProfile]);

  // Dirty State Detection
  const { isDirty, modifiedSections } = useMemo(() => {
    if (loading) return { isDirty: false, modifiedSections: [] };

    const sections: string[] = [];

    const isInfoDirty =
      profile.displayName !== initialProfile.displayName ||
      profile.licenseNumber !== initialProfile.licenseNumber ||
      profile.specialty !== initialProfile.specialty ||
      profile.phone !== initialProfile.phone ||
      profile.clinicName !== initialProfile.clinicName ||
      profile.clinicAddress !== initialProfile.clinicAddress ||
      profile.photoURL !== initialProfile.photoURL;

    if (isInfoDirty) sections.push('Información General');

    const isScheduleDirty =
      JSON.stringify(profile.workingDays) !== JSON.stringify(initialProfile.workingDays) ||
      profile.morningStart !== initialProfile.morningStart ||
      profile.morningEnd !== initialProfile.morningEnd ||
      profile.morningActive !== initialProfile.morningActive ||
      profile.afternoonStart !== initialProfile.afternoonStart ||
      profile.afternoonEnd !== initialProfile.afternoonEnd ||
      profile.afternoonActive !== initialProfile.afternoonActive ||
      profile.appointmentDurationMinutes !== initialProfile.appointmentDurationMinutes ||
      profile.clinicalPracticeActive !== initialProfile.clinicalPracticeActive;

    if (isScheduleDirty) sections.push('Horarios y Atención');

    return {
      isDirty: sections.length > 0,
      modifiedSections: sections
    };
  }, [profile, initialProfile, loading]);

  // Form Validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    const trimmedName = profile.displayName.trim();
    if (!trimmedName) {
      errors.displayName = 'El nombre completo o denominación es obligatorio.';
    } else if (trimmedName.length < 3) {
      errors.displayName = 'El nombre debe tener al menos 3 caracteres.';
    } else if (trimmedName.length > 80) {
      errors.displayName = 'El nombre no puede superar los 80 caracteres.';
    }

    const trimmedPhone = profile.phone.trim();
    if (trimmedPhone) {
      const digitsOnly = trimmedPhone.replace(/\D/g, '');
      if (digitsOnly.length < 6) {
        errors.phone = 'Ingrese un número telefónico válido con código de área.';
      }
    }

    if (profile.clinicName.trim().length > 80) {
      errors.clinicName = 'El nombre del centro clínico no puede superar los 80 caracteres.';
    }

    if (profile.clinicAddress.trim().length > 120) {
      errors.clinicAddress = 'La dirección no puede superar los 120 caracteres.';
    }

    if (!isStaff) {
      if (profile.specialty.trim().length > 60) {
        errors.specialty = 'La especialidad o cargo no puede superar los 60 caracteres.';
      }
      const trimmedLicense = profile.licenseNumber.trim();
      if (trimmedLicense && trimmedLicense.length > 30) {
        errors.licenseNumber = 'La matrícula no puede superar los 30 caracteres.';
      }
    }

    // Schedule Validations
    if (!isStaff && profile.workingDays.length > 0 && profile.clinicalPracticeActive) {
      if (!profile.morningActive && !profile.afternoonActive) {
        errors.schedule = 'Debe activar al menos un turno (mañana o tarde) para los días laborales seleccionados.';
      }
      if (profile.morningActive && profile.morningStart >= profile.morningEnd) {
        errors.morning = 'La hora de inicio matutino debe ser anterior a la hora de fin.';
      }
      if (profile.afternoonActive && profile.afternoonStart >= profile.afternoonEnd) {
        errors.afternoon = 'La hora de inicio vespertino debe ser anterior a la hora de fin.';
      }
      if (profile.morningActive && profile.afternoonActive && profile.afternoonStart < profile.morningEnd) {
        errors.overlap = 'El turno de la tarde no puede solaparse con el turno de la mañana.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Profile Handler
  const handleSave = async () => {
    if (!user) return;

    if (!validateForm()) {
      showToast('Por favor corrija los campos marcados con error antes de guardar.', 'error');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSuccess(false);

    try {
      const isUserStaffRole = isStaff || profile.role === 'secretary';
      
      const payload: any = {
        name: profile.displayName.trim() || user.displayName || 'Administrador',
        email: user.email,
        phone: profile.phone.trim() || '',
        clinicName: profile.clinicName.trim() || '',
        clinicAddress: profile.clinicAddress.trim() || '',
        address: profile.clinicAddress.trim() || '',
        photoURL: profile.photoURL || '',
        updatedAt: serverTimestamp()
      };

      if (!isUserStaffRole) {
        payload.licenseNumber = profile.licenseNumber.trim() || '';
        payload.specialty = profile.specialty.trim() || (isAdmin ? 'Dirección Médica y Gestión' : 'Cirujano Dentista');
        payload.clinicalPracticeActive = profile.clinicalPracticeActive ?? !isAdmin;
        payload.schedule = {
          workingDays: profile.workingDays,
          morningStart: profile.morningStart,
          morningEnd: profile.morningEnd,
          morningActive: profile.morningActive,
          afternoonStart: profile.afternoonStart,
          afternoonEnd: profile.afternoonEnd,
          afternoonActive: profile.afternoonActive,
          appointmentDurationMinutes: profile.appointmentDurationMinutes
        };
      }

      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });

      try {
        await setDoc(doc(db, 'reminder_settings', user.uid), {
          clinicName: profile.clinicName.trim() || '',
          clinicAddress: profile.clinicAddress.trim() || '',
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('Reminder settings sync note:', err);
      }

      // Log Security Audit Event
      await logAuditEvent({
        action: 'UPDATE_PROFILE',
        section: 'PERFIL',
        details: `Perfil institucional de ${profile.displayName} actualizado`,
        changes: {
          modifiedSections,
          displayName: profile.displayName,
          specialty: profile.specialty
        }
      });
      
      setInitialProfile(profile);
      setValidationErrors({});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      showToast('Perfil institucional y preferencias guardados correctamente', 'success');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      const msg = error?.message || 'Error al guardar los cambios en el servidor.';
      setSaveError(msg);
      showToast(msg, 'error');
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setProfile(initialProfile);
    setValidationErrors({});
    setSaveError(null);
    showToast('Cambios descartados. Se restauraron los datos anteriores.', 'info');
  };

  // Photo Selection & Cropping
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Formato no compatible. Por favor suba una imagen JPG, PNG o WebP.', 'error');
      return;
    }

    if (file.size > 1.5 * 1024 * 1024) {
      showToast('La imagen supera el límite permitido (1.5 MB). Seleccione una foto más liviana.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTempImageForCrop(reader.result as string);
      setIsCropModalOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      showToast('Error al leer el archivo de imagen.', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    setProfile((prev) => ({ ...prev, photoURL: croppedDataUrl }));
    showToast('Foto encuadrada correctamente. Recuerde pulsar "Guardar Cambios".', 'info');
  };

  const handleVerifyEmail = async () => {
    if (!auth.currentUser || verifyEmailCooldown > 0) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyEmailCooldown(60);
      showToast('Email de verificación enviado a su casilla. Revise su bandeja de entrada.', 'success');
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      showToast('Error al enviar el email de verificación.', 'error');
    }
  };

  const handleSendResetPasswordEmail = async () => {
    if (!user || !user.email || resetEmailCooldown > 0) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetEmailCooldown(60);
      showToast(`Enlace enviado a ${user.email}. Revise su bandeja o spam.`, 'info');
    } catch (err: any) {
      console.error('Error sending reset email:', err);
      showToast('No se pudo enviar el correo de restablecimiento.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
          Cargando perfil institucional...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 sm:pb-12">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold transition-all animate-in fade-in slide-in-from-top-2",
          toastMessage.type === 'success' && "bg-emerald-50 text-emerald-900 border-emerald-300",
          toastMessage.type === 'error' && "bg-red-50 text-red-900 border-red-300",
          toastMessage.type === 'info' && "bg-blue-50 text-blue-900 border-blue-300"
        )}>
          {toastMessage.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle size={16} className="text-red-600 shrink-0" />}
          {toastMessage.type === 'info' && <AlertCircle size={16} className="text-blue-600 shrink-0" />}
          <span>{toastMessage.text}</span>
          <button 
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-current opacity-60 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hidden file input for photo upload */}
      <input 
        ref={fileInputRef}
        type="file" 
        className="hidden" 
        accept="image/jpeg,image/png,image/webp" 
        onChange={handlePhotoSelect} 
        aria-label="Seleccionar archivo de imagen para foto de perfil"
      />

      {/* Main Profile Header */}
      <ProfileHeader
        profile={profile}
        isAdmin={isAdmin}
        isStaff={isStaff}
        userEmail={user?.email}
        emailVerified={!!user?.emailVerified}
        saving={saving}
        isDirty={isDirty}
        modifiedSections={modifiedSections}
        verifyEmailCooldown={verifyEmailCooldown}
        onPhotoClick={() => fileInputRef.current?.click()}
        onSave={handleSave}
        onDiscard={handleDiscardChanges}
        onPreviewClick={() => setIsPreviewOpen(true)}
        onVerifyEmail={handleVerifyEmail}
      />

      {/* Administrative Scope Card (Visible for Super Admin / Admin) */}
      {isAdmin && <AdminScopeCard />}

      {/* Tabs Navigation */}
      <div 
        role="tablist" 
        aria-label="Secciones de configuración del perfil"
        className="flex border-b border-outline-variant bg-white px-2 sm:px-4 rounded-xl shadow-xs gap-1 sm:gap-2 overflow-x-auto scrollbar-none"
      >
        <button
          role="tab"
          id="tab-info"
          aria-selected={activeTab === 'info'}
          aria-controls="panel-info"
          tabIndex={activeTab === 'info' ? 0 : -1}
          onClick={() => setActiveTab('info')}
          className={cn(
            "flex items-center gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px]",
            activeTab === 'info'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <User size={15} />
          <span>Información General</span>
        </button>

        {!isStaff && (
          <button
            role="tab"
            id="tab-schedule"
            aria-selected={activeTab === 'schedule'}
            aria-controls="panel-schedule"
            tabIndex={activeTab === 'schedule' ? 0 : -1}
            onClick={() => setActiveTab('schedule')}
            className={cn(
              "flex items-center gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px]",
              activeTab === 'schedule'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Clock size={15} />
            <span>Horarios y Atención</span>
          </button>
        )}

        <button
          role="tab"
          id="tab-security"
          aria-selected={activeTab === 'security'}
          aria-controls="panel-security"
          tabIndex={activeTab === 'security' ? 0 : -1}
          onClick={() => setActiveTab('security')}
          className={cn(
            "flex items-center gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px]",
            activeTab === 'security'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Shield size={15} />
          <span>Seguridad y Cuenta</span>
        </button>

        <button
          role="tab"
          id="tab-integrations"
          aria-selected={activeTab === 'integrations'}
          aria-controls="panel-integrations"
          tabIndex={activeTab === 'integrations' ? 0 : -1}
          onClick={() => setActiveTab('integrations')}
          className={cn(
            "flex items-center gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px]",
            activeTab === 'integrations'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Cloud size={15} />
          <span>Google Drive y Nube</span>
        </button>

        {isAdmin && (
          <button
            role="tab"
            id="tab-audit"
            aria-selected={activeTab === 'audit'}
            aria-controls="panel-audit"
            tabIndex={activeTab === 'audit' ? 0 : -1}
            onClick={() => setActiveTab('audit')}
            className={cn(
              "flex items-center gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px]",
              activeTab === 'audit'
                ? "border-purple-600 text-purple-700 font-black"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <FileText size={15} />
            <span>Auditoría y Trazabilidad</span>
          </button>
        )}
      </div>

      {/* TAB CONTENT PANELS */}
      {activeTab === 'info' && (
        <PersonalInfoTab
          profile={profile}
          isAdmin={isAdmin}
          isStaff={isStaff}
          userEmail={user?.email}
          emailVerified={!!user?.emailVerified}
          onChange={handleFieldChange}
          onPreviewClick={() => setIsPreviewOpen(true)}
        />
      )}

      {activeTab === 'schedule' && !isStaff && (
        <ScheduleTab
          profile={profile}
          onChange={handleFieldChange}
          showToast={showToast}
        />
      )}

      {activeTab === 'security' && (
        <SecurityTab
          userEmail={user?.email}
          emailVerified={!!user?.emailVerified}
          userUid={user?.uid}
          verifyEmailCooldown={verifyEmailCooldown}
          resetEmailCooldown={resetEmailCooldown}
          onVerifyEmail={handleVerifyEmail}
          onSendResetEmail={handleSendResetPasswordEmail}
          showToast={showToast}
        />
      )}

      {activeTab === 'integrations' && (
        <GoogleDriveTab
          profile={profile}
          isAdmin={isAdmin}
          onChange={handleFieldChange}
          showToast={showToast}
        />
      )}

      {activeTab === 'audit' && isAdmin && (
        <AuditLogsTab />
      )}

      {/* Floating Save Toolbar on Mobile when dirty */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white/95 backdrop-blur-md border-t border-outline-variant shadow-lg flex items-center justify-between gap-3 sm:hidden">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-900 truncate">
              {modifiedSections.length} sección(es) con cambios
            </p>
            <button
              type="button"
              onClick={handleDiscardChanges}
              className="text-[10px] text-amber-800 underline font-semibold"
            >
              Descartar
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-primary text-white text-xs font-black rounded-xl uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{saving ? 'Guardando...' : 'Guardar'}</span>
          </button>
        </div>
      )}

      {/* Modals */}
      <AvatarCropModal
        isOpen={isCropModalOpen}
        onClose={() => {
          setIsCropModalOpen(false);
          setTempImageForCrop(null);
        }}
        imageSrc={tempImageForCrop}
        onCropComplete={handleCropComplete}
      />

      <PatientPublicProfilePreview
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        displayName={profile.displayName}
        specialty={profile.specialty}
        licenseNumber={profile.licenseNumber}
        clinicName={profile.clinicName}
        clinicAddress={profile.clinicAddress}
        phone={profile.phone}
        photoURL={profile.photoURL}
      />

      {/* Disconnect Google Drive Modal */}
      {isDisconnectModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans"
          role="presentation"
        >
          <div 
            className="bg-white rounded-2xl border border-outline-variant shadow-2xl max-w-md w-full p-6 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disconnect-modal-title"
          >
            <div className="flex items-center gap-3 text-error">
              <AlertTriangle size={24} />
              <h3 id="disconnect-modal-title" className="text-base font-bold text-on-surface">
                ¿Desconectar Google Drive?
              </h3>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Al desconectar su cuenta, MedTurnos dejará de sincronizar archivos en su Google Drive institucional. 
              <strong> Los documentos e imágenes ya subidos a su carpeta personal de Drive no serán eliminados</strong> y permanecerán seguros en su cuenta de Google.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDisconnectModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface rounded-xl border border-outline-variant bg-surface transition-colors cursor-pointer min-h-[40px]"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  disconnectGoogleDrive();
                  setIsDisconnectModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-error hover:bg-error/90 rounded-xl transition-all cursor-pointer min-h-[40px]"
              >
                Confirmar Desconexión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
