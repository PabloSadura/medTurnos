import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  Shield, 
  KeyRound, 
  Clock, 
  Save, 
  Building, 
  MapPin, 
  Award, 
  Camera, 
  CheckCircle2, 
  Trash2, 
  Cloud, 
  FolderOpen, 
  Folder, 
  ExternalLink, 
  Loader2, 
  Sparkles, 
  AlertCircle,
  Eye,
  EyeOff,
  Briefcase,
  Lock,
  Key,
  Globe,
  Copy,
  Info,
  RotateCcw,
  Check,
  ChevronRight,
  AlertTriangle,
  HelpCircle,
  Calendar,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  LogOut,
  Smartphone
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { cn } from '../lib/utils';
import { PhoneInputField } from '../components/PhoneInputField';
import { PatientPublicProfilePreview } from '../components/PatientPublicProfilePreview';
import { AvatarCropModal } from '../components/AvatarCropModal';
import { motion, AnimatePresence } from 'motion/react';

export type ProfileTab = 'info' | 'schedule' | 'security' | 'integrations';

interface ProfileState {
  displayName: string;
  email: string;
  licenseNumber: string;
  specialty: string;
  phone: string;
  clinicName: string;
  clinicAddress: string;
  photoURL: string;
  role: string;
  status: string;
  workingDays: number[];
  morningStart: string;
  morningEnd: string;
  morningActive: boolean;
  afternoonStart: string;
  afternoonEnd: string;
  afternoonActive: boolean;
  appointmentDurationMinutes: number;
}

const DEFAULT_PROFILE: ProfileState = {
  displayName: '',
  email: '',
  licenseNumber: '',
  specialty: 'Cirujano Dentista',
  phone: '',
  clinicName: '',
  clinicAddress: '',
  photoURL: '',
  role: 'medico',
  status: 'Activo',
  workingDays: [1, 2, 3, 4, 5],
  morningStart: '08:00',
  morningEnd: '12:00',
  morningActive: true,
  afternoonStart: '14:00',
  afternoonEnd: '18:00',
  afternoonActive: true,
  appointmentDurationMinutes: 30
};

const DAYS_OF_WEEK = [
  { index: 1, label: 'Lun', full: 'Lunes' },
  { index: 2, label: 'Mar', full: 'Martes' },
  { index: 3, label: 'Mié', full: 'Miércoles' },
  { index: 4, label: 'Jue', full: 'Jueves' },
  { index: 5, label: 'Vie', full: 'Viernes' },
  { index: 6, label: 'Sáb', full: 'Sábado' },
  { index: 7, label: 'Dom', full: 'Domingo' }
];

export function Profile() {
  const { user, profile: authProfile } = useAuth();
  const { 
    isConnected: isDriveConnected, 
    isConnecting: isDriveConnecting, 
    googleUser, 
    connectGoogleDrive, 
    disconnectGoogleDrive,
    getRootFolderId,
    rootFolderId
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

  // Field inline validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal states
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [tempImageForCrop, setTempImageForCrop] = useState<string | null>(null);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  // Password Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  // Cooldown timers
  const [resetEmailCooldown, setResetEmailCooldown] = useState(0);
  const [verifyEmailCooldown, setVerifyEmailCooldown] = useState(0);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const isStaff = authProfile?.role === 'staff' || authProfile?.role === 'secretary';
  const isAdmin = profile.role === 'admin';

  // Cooldown timers interval
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resetEmailCooldown > 0 || verifyEmailCooldown > 0) {
      interval = setInterval(() => {
        setResetEmailCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        setVerifyEmailCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resetEmailCooldown, verifyEmailCooldown]);

  // Compute Unsaved Changes (Dirty check)
  const isDirty = useMemo(() => {
    return (
      profile.displayName.trim() !== initialProfile.displayName.trim() ||
      profile.phone.trim() !== initialProfile.phone.trim() ||
      profile.clinicName.trim() !== initialProfile.clinicName.trim() ||
      profile.clinicAddress.trim() !== initialProfile.clinicAddress.trim() ||
      profile.specialty.trim() !== initialProfile.specialty.trim() ||
      profile.licenseNumber.trim() !== initialProfile.licenseNumber.trim() ||
      profile.photoURL !== initialProfile.photoURL ||
      profile.morningStart !== initialProfile.morningStart ||
      profile.morningEnd !== initialProfile.morningEnd ||
      profile.morningActive !== initialProfile.morningActive ||
      profile.afternoonStart !== initialProfile.afternoonStart ||
      profile.afternoonEnd !== initialProfile.afternoonEnd ||
      profile.afternoonActive !== initialProfile.afternoonActive ||
      profile.appointmentDurationMinutes !== initialProfile.appointmentDurationMinutes ||
      JSON.stringify(profile.workingDays.slice().sort()) !== JSON.stringify(initialProfile.workingDays.slice().sort())
    );
  }, [profile, initialProfile]);

  // List of modified sections for informative display
  const modifiedSections = useMemo(() => {
    const list: string[] = [];
    if (
      profile.displayName.trim() !== initialProfile.displayName.trim() ||
      profile.phone.trim() !== initialProfile.phone.trim() ||
      profile.clinicName.trim() !== initialProfile.clinicName.trim() ||
      profile.clinicAddress.trim() !== initialProfile.clinicAddress.trim() ||
      profile.specialty.trim() !== initialProfile.specialty.trim() ||
      profile.licenseNumber.trim() !== initialProfile.licenseNumber.trim()
    ) {
      list.push('Información General');
    }
    if (profile.photoURL !== initialProfile.photoURL) {
      list.push('Foto de Perfil');
    }
    if (
      profile.morningStart !== initialProfile.morningStart ||
      profile.morningEnd !== initialProfile.morningEnd ||
      profile.morningActive !== initialProfile.morningActive ||
      profile.afternoonStart !== initialProfile.afternoonStart ||
      profile.afternoonEnd !== initialProfile.afternoonEnd ||
      profile.afternoonActive !== initialProfile.afternoonActive ||
      profile.appointmentDurationMinutes !== initialProfile.appointmentDurationMinutes ||
      JSON.stringify(profile.workingDays.slice().sort()) !== JSON.stringify(initialProfile.workingDays.slice().sort())
    ) {
      list.push('Horarios y Atención');
    }
    return list;
  }, [profile, initialProfile]);

  // Warn on page unload if changes are unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Load User Data
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, async (snapshot) => {
      clearTimeout(safetyTimer);
      if (snapshot.exists()) {
        const data = snapshot.data();
        const loaded: ProfileState = {
          displayName: data.name || user.displayName || 'Profesional',
          email: data.email || user.email || '',
          licenseNumber: data.licenseNumber || '',
          specialty: data.specialty || 'Cirujano Dentista',
          phone: data.phone || '',
          clinicName: data.clinicName || '',
          clinicAddress: data.clinicAddress || data.address || '',
          photoURL: data.photoURL || user.photoURL || '',
          role: data.role || 'medico',
          status: data.status || 'Activo',
          workingDays: Array.isArray(data.schedule?.workingDays) ? data.schedule.workingDays : [1, 2, 3, 4, 5],
          morningStart: data.schedule?.morningStart || '08:00',
          morningEnd: data.schedule?.morningEnd || '12:00',
          morningActive: data.schedule?.morningActive !== false,
          afternoonStart: data.schedule?.afternoonStart || '14:00',
          afternoonEnd: data.schedule?.afternoonEnd || '18:00',
          afternoonActive: data.schedule?.afternoonActive !== false,
          appointmentDurationMinutes: data.schedule?.appointmentDurationMinutes || 30
        };

        if (data.role === 'secretary' || data.role === 'staff') {
          try {
            const staffSnap = await getDoc(doc(db, 'staff', user.uid));
            if (staffSnap.exists()) {
              const staffData = staffSnap.data();
              loaded.displayName = staffData.name || loaded.displayName;
              loaded.specialty = staffData.role || 'Staff Administrativo';
              loaded.phone = staffData.phone || loaded.phone;
            }
          } catch (err) {
            console.warn('Could not load staff extra doc:', err);
          }
        }

        setProfile(loaded);
        setInitialProfile(loaded);
      } else {
        const fallback: ProfileState = {
          ...DEFAULT_PROFILE,
          displayName: user.displayName || user.email?.split('@')[0] || 'Profesional',
          email: user.email || ''
        };
        setProfile(fallback);
        setInitialProfile(fallback);
      }
      setLoading(false);
    }, (error) => {
      console.warn('Firestore profile snapshot note:', error);
      clearTimeout(safetyTimer);
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [user]);

  // Validate form fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 1. Display Name
    const trimmedName = profile.displayName.trim();
    if (!trimmedName) {
      errors.displayName = 'El nombre completo es obligatorio.';
    } else if (trimmedName.length < 3) {
      errors.displayName = 'El nombre debe tener al menos 3 caracteres.';
    } else if (trimmedName.length > 70) {
      errors.displayName = 'El nombre no puede superar los 70 caracteres.';
    } else if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñüÜ0-9\s.,'-]+$/.test(trimmedName)) {
      errors.displayName = 'El nombre contiene caracteres especiales no válidos.';
    }

    // 2. Phone
    const trimmedPhone = profile.phone.trim();
    if (trimmedPhone) {
      const digitsOnly = trimmedPhone.replace(/\D/g, '');
      if (digitsOnly.length < 6) {
        errors.phone = 'Ingrese un número telefónico válido con código de área.';
      }
    }

    // 3. Clinic Name
    if (profile.clinicName.trim().length > 80) {
      errors.clinicName = 'El nombre de la clínica no puede superar los 80 caracteres.';
    }

    // 4. Clinic Address
    if (profile.clinicAddress.trim().length > 120) {
      errors.clinicAddress = 'La dirección no puede superar los 120 caracteres.';
    }

    // 5. Specialty
    if (!isStaff) {
      if (profile.specialty.trim().length > 60) {
        errors.specialty = 'La especialidad no puede superar los 60 caracteres.';
      }
      // 6. License Number
      const trimmedLicense = profile.licenseNumber.trim();
      if (trimmedLicense && trimmedLicense.length > 30) {
        errors.licenseNumber = 'La matrícula no puede superar los 30 caracteres.';
      } else if (trimmedLicense && !/^[A-Za-z0-9\s/.-]+$/.test(trimmedLicense)) {
        errors.licenseNumber = 'Formato de matrícula inválido (use letras, números, guiones o barras).';
      }
    }

    // 7. Schedule Validations
    if (!isStaff) {
      if (profile.workingDays.length > 0 && !profile.morningActive && !profile.afternoonActive) {
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
        name: profile.displayName.trim() || user.displayName || 'Profesional',
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
        payload.specialty = profile.specialty.trim() || 'Cirujano Dentista';
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

      try {
        const staffRef = doc(db, 'staff', user.uid);
        const staffSnap = await getDoc(staffRef);
        if (staffSnap.exists()) {
          await setDoc(staffRef, {
            name: profile.displayName.trim(),
            phone: profile.phone.trim() || '',
            photoURL: profile.photoURL || '',
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      } catch (err) {
        console.warn('Staff record sync note:', err);
      }
      
      setInitialProfile(profile);
      setValidationErrors({});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      showToast('Perfil y preferencias guardados correctamente', 'success');
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

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Formato no compatible. Por favor suba una imagen JPG, PNG o WebP.', 'error');
      return;
    }

    // Validate size (max 1.5MB)
    if (file.size > 1.5 * 1024 * 1024) {
      showToast('La imagen supera el límite permitido (1.5 MB). Seleccione una foto más liviana.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTempImageForCrop(reader.result as string);
      setIsCropModalOpen(true);
      // Reset input value so same file can be selected again if needed
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

  const handleRemovePhoto = () => {
    setProfile((prev) => ({ ...prev, photoURL: '' }));
    showToast('Foto eliminada. Se usará el avatar con sus iniciales.', 'info');
  };

  // Schedule Toggles
  const toggleDay = (dayIndex: number) => {
    setProfile((prev) => {
      const exists = prev.workingDays.includes(dayIndex);
      const newDays = exists 
        ? prev.workingDays.filter((d) => d !== dayIndex)
        : [...prev.workingDays, dayIndex].sort((a, b) => a - b);
      return { ...prev, workingDays: newDays };
    });
  };

  const applySchedulePreset = (preset: 'full' | 'morning' | 'afternoon' | 'continuous') => {
    if (preset === 'full') {
      setProfile((prev) => ({
        ...prev,
        workingDays: [1, 2, 3, 4, 5],
        morningActive: true,
        morningStart: '08:00',
        morningEnd: '12:00',
        afternoonActive: true,
        afternoonStart: '14:00',
        afternoonEnd: '18:00',
      }));
      showToast('Preset aplicado: Jornada Completa (08:00 - 12:00 y 14:00 - 18:00)', 'info');
    } else if (preset === 'morning') {
      setProfile((prev) => ({
        ...prev,
        workingDays: [1, 2, 3, 4, 5],
        morningActive: true,
        morningStart: '08:00',
        morningEnd: '13:00',
        afternoonActive: false,
      }));
      showToast('Preset aplicado: Solo Mañanas (08:00 - 13:00)', 'info');
    } else if (preset === 'afternoon') {
      setProfile((prev) => ({
        ...prev,
        workingDays: [1, 2, 3, 4, 5],
        morningActive: false,
        afternoonActive: true,
        afternoonStart: '14:00',
        afternoonEnd: '20:00',
      }));
      showToast('Preset aplicado: Solo Tardes (14:00 - 20:00)', 'info');
    } else if (preset === 'continuous') {
      setProfile((prev) => ({
        ...prev,
        workingDays: [1, 2, 3, 4, 5],
        morningActive: true,
        morningStart: '09:00',
        morningEnd: '17:00',
        afternoonActive: false,
      }));
      showToast('Preset aplicado: Turno Corrido (09:00 - 17:00)', 'info');
    }
  };

  // Schedule Hours and Daily Capacity Calculation
  const scheduleStats = useMemo(() => {
    let dailyHours = 0;
    if (profile.morningActive) {
      const [msh, msm] = profile.morningStart.split(':').map(Number);
      const [meh, mem] = profile.morningEnd.split(':').map(Number);
      const diffMins = (meh * 60 + mem) - (msh * 60 + msm);
      if (diffMins > 0) dailyHours += diffMins / 60;
    }
    if (profile.afternoonActive) {
      const [ash, asm] = profile.afternoonStart.split(':').map(Number);
      const [aeh, aem] = profile.afternoonEnd.split(':').map(Number);
      const diffMins = (aeh * 60 + aem) - (ash * 60 + asm);
      if (diffMins > 0) dailyHours += diffMins / 60;
    }

    const weeklyHours = dailyHours * profile.workingDays.length;
    const slotDuration = profile.appointmentDurationMinutes || 30;
    const dailyAppointments = Math.floor((dailyHours * 60) / slotDuration);
    const weeklyAppointments = dailyAppointments * profile.workingDays.length;

    return {
      dailyHours: Math.round(dailyHours * 10) / 10,
      weeklyHours: Math.round(weeklyHours * 10) / 10,
      dailyAppointments,
      weeklyAppointments,
    };
  }, [
    profile.morningActive,
    profile.morningStart,
    profile.morningEnd,
    profile.afternoonActive,
    profile.afternoonStart,
    profile.afternoonEnd,
    profile.workingDays,
    profile.appointmentDurationMinutes
  ]);

  // Password Policy & Real-time Checklist
  const passwordCriteria = useMemo(() => {
    return {
      minLen: newPassword.length >= 8,
      mixedCase: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
      numberOrSpecial: /[0-9]/.test(newPassword) || /[^A-Za-z0-9]/.test(newPassword),
    };
  }, [newPassword]);

  const isNewPasswordValid = passwordCriteria.minLen && passwordCriteria.mixedCase && passwordCriteria.numberOrSpecial;
  const isConfirmMatching = !!newPassword && newPassword === confirmPassword;

  // Password Strength Calculation
  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: 'Sin ingresar', color: 'bg-surface-variant' };
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (newPassword.length >= 12) score += 1;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;

    if (score <= 1) return { score: 1, label: 'Débil', color: 'bg-red-500' };
    if (score === 2 || score === 3) return { score: 2, label: 'Media', color: 'bg-amber-500' };
    if (score === 4) return { score: 3, label: 'Segura', color: 'bg-emerald-500' };
    return { score: 4, label: 'Muy Segura', color: 'bg-teal-600' };
  }, [newPassword]);

  // Change Password Action
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordChangeSuccess(false);

    if (!user || !user.email) {
      setPasswordError('No hay sesión de usuario activa.');
      return;
    }

    if (!currentPassword) {
      setPasswordError('Debe ingresar su contraseña actual.');
      return;
    }

    if (!isNewPasswordValid) {
      setPasswordError('La nueva contraseña debe cumplir con todos los requisitos mínimos de seguridad.');
      return;
    }

    if (!isConfirmMatching) {
      setPasswordError('Las nuevas contraseñas no coinciden.');
      return;
    }

    setIsChangingPassword(true);

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setPasswordChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Contraseña actualizada exitosamente', 'success');
    } catch (err: any) {
      console.error('Password change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPasswordError('La contraseña actual es incorrecta. Verifíquela e intente nuevamente.');
      } else if (err.code === 'auth/too-many-requests') {
        setPasswordError('Demasiados intentos fallidos. Espere unos minutos por seguridad.');
      } else {
        setPasswordError(err.message || 'Error al actualizar la contraseña.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSendResetPasswordEmail = async () => {
    if (!user || !user.email || resetEmailCooldown > 0) return;
    setIsSendingResetEmail(true);
    setPasswordError(null);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetEmailSent(true);
      setResetEmailCooldown(60);
      showToast(`Enlace enviado a ${user.email}. Revise su bandeja o spam.`, 'info');
    } catch (err: any) {
      console.error('Error sending reset email:', err);
      showToast('No se pudo enviar el correo de restablecimiento.', 'error');
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!auth.currentUser || verifyEmailCooldown > 0) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyEmailCooldown(60);
      showToast('Email de verificación enviado a su casilla. Revise su bandeja.');
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      showToast('Error al enviar el email de verificación.', 'error');
    }
  };

  const copyUidToClipboard = () => {
    if (!user?.uid) return;
    navigator.clipboard.writeText(user.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 3000);
    showToast('Identificador (UID) copiado al portapapeles', 'info');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Cargando perfil profesional...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-28 sm:pb-20 font-sans">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 text-xs font-bold max-w-sm",
              toastMessage.type === 'success' && "bg-emerald-50 text-emerald-900 border-emerald-300",
              toastMessage.type === 'error' && "bg-red-50 text-red-900 border-red-300",
              toastMessage.type === 'info' && "bg-sky-50 text-sky-900 border-sky-300"
            )}
            role="status"
            aria-live="polite"
          >
            {toastMessage.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
            {toastMessage.type === 'error' && <AlertCircle size={16} className="text-red-600 shrink-0" />}
            {toastMessage.type === 'info' && <Info size={16} className="text-sky-600 shrink-0" />}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section: Identity, Visual Hierarchy & Global Save Bar */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          {/* Identity: Avatar with Crop Modal + Names + Badges */}
          <div className="flex items-center gap-4">
            <div className="relative group shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl border-2 border-primary/20 overflow-hidden bg-surface-bright flex items-center justify-center shadow-inner focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none cursor-pointer"
                title="Haga clic para cambiar o recortar foto de perfil"
                aria-label="Foto de perfil. Haga clic o presione Enter para cambiar imagen."
              >
                {profile.photoURL ? (
                  <img 
                    src={profile.photoURL} 
                    alt={`Foto de ${profile.displayName || 'perfil'}`} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-black text-2xl sm:text-3xl text-primary bg-primary/10 select-none">
                    {profile.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'P'}
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Cambiar foto de perfil"
                aria-label="Subir nueva foto de perfil"
                className="absolute -bottom-1 -right-1 p-2 bg-primary text-white rounded-xl border-2 border-white shadow-md hover:bg-primary/90 transition-transform active:scale-95 cursor-pointer flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary outline-none"
              >
                <Camera size={14} />
              </button>

              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                accept="image/jpeg,image/png,image/webp" 
                onChange={handlePhotoSelect} 
                aria-label="Seleccionar archivo de imagen para foto de perfil"
              />
            </div>

            {/* Names, Specialty & Role Badge */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-black text-on-surface tracking-tight truncate">
                  {profile.displayName || 'Profesional'}
                </h1>
                {isAdmin ? (
                  <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Super Admin
                  </span>
                ) : isStaff ? (
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Staff Administrativo
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Profesional Clínico
                  </span>
                )}
              </div>

              <p className="text-xs font-semibold text-on-surface-variant flex items-center gap-1.5 mt-0.5 truncate">
                <Mail size={13} className="opacity-70 shrink-0" /> {user?.email}
              </p>

              {!isStaff && (
                <p className="text-[11px] font-bold text-primary uppercase tracking-wider mt-1 truncate">
                  {profile.specialty} {profile.licenseNumber ? `• Mat. ${profile.licenseNumber}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Header Action Controls (Desktop/Tablet Save & Public Preview) */}
          <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end flex-wrap">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold border border-outline-variant hover:border-primary/40 bg-surface-bright/50 hover:bg-surface text-on-surface flex items-center gap-1.5 uppercase tracking-wider transition-all cursor-pointer min-h-[44px]"
              title="Ver cómo visualizan sus datos los pacientes en WhatsApp y avisos"
            >
              <Globe size={14} className="text-primary" />
              <span className="hidden md:inline">Vista Previa Paciente</span>
              <span className="md:hidden">Vista Previa</span>
            </button>

            {/* Desktop / Tablet Save Button */}
            <button 
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={cn(
                "hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer min-h-[44px]",
                saving 
                  ? "bg-surface-dim text-on-surface-variant opacity-60 cursor-not-allowed" 
                  : isDirty
                    ? "bg-primary text-white hover:bg-primary/90 active:scale-95 shadow-primary/20"
                    : "bg-surface text-on-surface-variant/40 border border-outline-variant cursor-not-allowed"
              )}
              title={isDirty ? "Guardar los cambios realizados" : "No hay modificaciones pendientes por guardar"}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </div>

        {/* Unsaved Changes Banner for Desktop & Tablet */}
        {isDirty && (
          <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs text-amber-900 bg-amber-50/80 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-3 px-5 sm:px-6 rounded-b-2xl">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span>
                Modificaciones sin guardar en: <strong>{modifiedSections.join(', ')}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={handleDiscardChanges}
              className="text-amber-800 hover:text-amber-950 font-bold underline text-[11px] cursor-pointer"
            >
              Descartar cambios
            </button>
          </div>
        )}

        {/* Inline Save Success Banner */}
        {success && (
          <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center gap-2 text-xs text-emerald-900 bg-emerald-50 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-3 px-5 sm:px-6 rounded-b-2xl font-bold">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>Perfil actualizado correctamente en la base de datos clínica.</span>
          </div>
        )}

        {/* Inline Save Error Banner */}
        {saveError && (
          <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs text-red-900 bg-red-50 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-3 px-5 sm:px-6 rounded-b-2xl">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{saveError}</span>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Tabs Navigation: Mobile-First Scrollable Bar with WCAG AA Contrast */}
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
      </div>

      {/* TAB 1: INFORMACIÓN GENERAL */}
      {activeTab === 'info' && (
        <div id="panel-info" role="tabpanel" aria-labelledby="tab-info" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
                    <User size={17} className="text-primary" /> Datos del Profesional y Consultorio
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Defina su nombre visible, contacto y dirección de atención para recordatorios a pacientes.
                  </p>
                </div>
              </div>

              {/* Patient Visibility Guidance Banner */}
              <div className="p-3 bg-surface-bright rounded-xl border border-outline-variant text-xs flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-on-surface font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Los campos con etiqueta verde se incluyen en los recordatorios automáticos de WhatsApp.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer text-xs"
                >
                  <Globe size={13} /> Simular mensaje
                </button>
              </div>

              {/* Form Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Nombre Completo */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label 
                      htmlFor="profile-displayName" 
                      className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                    >
                      <User size={13} className="text-primary" /> Nombre Completo
                      <span className="text-error font-bold" aria-hidden="true">*</span>
                    </label>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Visible en WhatsApp
                    </span>
                  </div>
                  <input 
                    id="profile-displayName"
                    type="text" 
                    required
                    aria-required="true"
                    aria-invalid={!!validationErrors.displayName}
                    aria-describedby={validationErrors.displayName ? 'error-displayName' : 'help-displayName'}
                    value={profile.displayName}
                    onChange={(e) => {
                      setProfile({ ...profile, displayName: e.target.value });
                      if (validationErrors.displayName) {
                        setValidationErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.displayName;
                          return copy;
                        });
                      }
                    }}
                    placeholder="Ej. Dra. Florencia Morales"
                    className={cn(
                      "w-full px-4 py-2.5 bg-surface border rounded-xl text-sm font-semibold outline-none transition-all text-on-surface focus-visible:ring-2",
                      validationErrors.displayName
                        ? "border-error focus-visible:ring-error/20"
                        : "border-outline-variant focus-visible:border-primary focus-visible:ring-primary/20"
                    )}
                  />
                  {validationErrors.displayName ? (
                    <p id="error-displayName" role="alert" className="text-[11px] text-error font-bold">
                      {validationErrors.displayName}
                    </p>
                  ) : (
                    <p id="help-displayName" className="text-[11px] text-on-surface-variant/75">
                      Nombre oficial mostrado en turnos, agenda e historial clínico.
                    </p>
                  )}
                </div>

                {/* 2. Teléfono con Selector de País Flexible */}
                <div className="space-y-1.5">
                  <PhoneInputField 
                    id="profile-phone"
                    value={profile.phone}
                    onChange={(val) => {
                      setProfile({ ...profile, phone: val });
                      if (validationErrors.phone) {
                        setValidationErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.phone;
                          return copy;
                        });
                      }
                    }}
                    label="Teléfono de Contacto"
                    patientVisible={true}
                    error={validationErrors.phone}
                    helperText="Número para WhatsApp y notificaciones de turnos."
                  />
                </div>

                {/* 3. Nombre de la Clínica */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label 
                      htmlFor="profile-clinicName"
                      className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                    >
                      <Building size={13} className="text-primary" /> Nombre del Consultorio / Clínica
                    </label>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Visible en WhatsApp
                    </span>
                  </div>
                  <input 
                    id="profile-clinicName"
                    type="text" 
                    aria-invalid={!!validationErrors.clinicName}
                    aria-describedby={validationErrors.clinicName ? 'error-clinicName' : 'help-clinicName'}
                    value={profile.clinicName}
                    onChange={(e) => {
                      setProfile({ ...profile, clinicName: e.target.value });
                      if (validationErrors.clinicName) {
                        setValidationErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.clinicName;
                          return copy;
                        });
                      }
                    }}
                    placeholder="Ej. Centro Odontológico Norte"
                    className={cn(
                      "w-full px-4 py-2.5 bg-surface border rounded-xl text-sm font-semibold outline-none transition-all text-on-surface focus-visible:ring-2",
                      validationErrors.clinicName
                        ? "border-error focus-visible:ring-error/20"
                        : "border-outline-variant focus-visible:border-primary focus-visible:ring-primary/20"
                    )}
                  />
                  {validationErrors.clinicName ? (
                    <p id="error-clinicName" role="alert" className="text-[11px] text-error font-bold">
                      {validationErrors.clinicName}
                    </p>
                  ) : (
                    <p id="help-clinicName" className="text-[11px] text-on-surface-variant/75">
                      Aparece como encabezado en mensajes para pacientes.
                    </p>
                  )}
                </div>

                {/* 4. Dirección de la Clínica */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label 
                      htmlFor="profile-clinicAddress"
                      className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                    >
                      <MapPin size={13} className="text-primary" /> Dirección de Atención
                    </label>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Visible en WhatsApp
                    </span>
                  </div>
                  <input 
                    id="profile-clinicAddress"
                    type="text" 
                    aria-invalid={!!validationErrors.clinicAddress}
                    aria-describedby={validationErrors.clinicAddress ? 'error-clinicAddress' : 'help-clinicAddress'}
                    value={profile.clinicAddress}
                    onChange={(e) => {
                      setProfile({ ...profile, clinicAddress: e.target.value });
                      if (validationErrors.clinicAddress) {
                        setValidationErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.clinicAddress;
                          return copy;
                        });
                      }
                    }}
                    placeholder="Ej. Av. Cabildo 2450, Piso 4 B"
                    className={cn(
                      "w-full px-4 py-2.5 bg-surface border rounded-xl text-sm font-semibold outline-none transition-all text-on-surface focus-visible:ring-2",
                      validationErrors.clinicAddress
                        ? "border-error focus-visible:ring-error/20"
                        : "border-outline-variant focus-visible:border-primary focus-visible:ring-primary/20"
                    )}
                  />
                  {validationErrors.clinicAddress ? (
                    <p id="error-clinicAddress" role="alert" className="text-[11px] text-error font-bold">
                      {validationErrors.clinicAddress}
                    </p>
                  ) : (
                    <p id="help-clinicAddress" className="text-[11px] text-on-surface-variant/75">
                      Se inserta en la variable <code className="text-primary font-bold">&#123;direccion&#125;</code> en recordatorios.
                    </p>
                  )}
                </div>

                {/* 5. Especialidad (Solo profesionales) */}
                {!isStaff && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label 
                        htmlFor="profile-specialty"
                        className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                      >
                        <Briefcase size={13} className="text-primary" /> Especialidad
                      </label>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Visible en WhatsApp
                      </span>
                    </div>
                    <input 
                      id="profile-specialty"
                      type="text" 
                      aria-invalid={!!validationErrors.specialty}
                      aria-describedby={validationErrors.specialty ? 'error-specialty' : 'help-specialty'}
                      value={profile.specialty}
                      onChange={(e) => {
                        setProfile({ ...profile, specialty: e.target.value });
                        if (validationErrors.specialty) {
                          setValidationErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.specialty;
                            return copy;
                          });
                        }
                      }}
                      placeholder="Ej. Ortodoncia / Odontopediatría"
                      className={cn(
                        "w-full px-4 py-2.5 bg-surface border rounded-xl text-sm font-semibold outline-none transition-all text-on-surface focus-visible:ring-2",
                        validationErrors.specialty
                          ? "border-error focus-visible:ring-error/20"
                          : "border-outline-variant focus-visible:border-primary focus-visible:ring-primary/20"
                      )}
                    />
                    {validationErrors.specialty && (
                      <p id="error-specialty" role="alert" className="text-[11px] text-error font-bold">
                        {validationErrors.specialty}
                      </p>
                    )}
                  </div>
                )}

                {/* 6. Matrícula Profesional */}
                {!isStaff && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label 
                        htmlFor="profile-licenseNumber"
                        className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                      >
                        <Award size={13} className="text-primary" /> Matrícula Profesional
                      </label>
                      <span className="text-[10px] font-bold text-on-surface-variant bg-surface-dim border border-outline-variant px-2 py-0.5 rounded-full">
                        Uso Clínico
                      </span>
                    </div>
                    <input 
                      id="profile-licenseNumber"
                      type="text" 
                      aria-invalid={!!validationErrors.licenseNumber}
                      aria-describedby={validationErrors.licenseNumber ? 'error-licenseNumber' : 'help-licenseNumber'}
                      value={profile.licenseNumber}
                      onChange={(e) => {
                        setProfile({ ...profile, licenseNumber: e.target.value });
                        if (validationErrors.licenseNumber) {
                          setValidationErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.licenseNumber;
                            return copy;
                          });
                        }
                      }}
                      placeholder="Ej. MN 45892 / MP 1284"
                      className={cn(
                        "w-full px-4 py-2.5 bg-surface border rounded-xl text-sm font-semibold outline-none transition-all text-on-surface focus-visible:ring-2",
                        validationErrors.licenseNumber
                          ? "border-error focus-visible:ring-error/20"
                          : "border-outline-variant focus-visible:border-primary focus-visible:ring-primary/20"
                      )}
                    />
                    {validationErrors.licenseNumber ? (
                      <p id="error-licenseNumber" role="alert" className="text-[11px] text-error font-bold">
                        {validationErrors.licenseNumber}
                      </p>
                    ) : (
                      <p id="help-licenseNumber" className="text-[11px] text-on-surface-variant/75">
                        Identificación en recetas y evoluciones médicas.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Photo Management Pill */}
              {profile.photoURL && (
                <div className="pt-2 flex items-center justify-between p-3 bg-surface-bright rounded-xl border border-outline-variant">
                  <div className="flex items-center gap-3">
                    <img src={profile.photoURL} alt="Foto actual del perfil" className="w-10 h-10 rounded-lg object-cover border" />
                    <div>
                      <p className="text-xs font-bold text-on-surface">Foto de Perfil Personalizada</p>
                      <p className="text-[10px] text-on-surface-variant">Visible en agenda y membretes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Camera size={13} /> Reemplazar
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="px-2.5 py-1.5 text-error hover:bg-error-container/20 rounded-lg transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={13} /> Quitar
                    </button>
                  </div>
                </div>
              )}

              {/* WhatsApp Live Preview Box */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-emerald-700" />
                    Previsualización en tiempo real del recordatorio a pacientes:
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-full">
                    WhatsApp
                  </span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-200/60 shadow-2xs font-sans text-slate-800 leading-relaxed text-[11px]">
                  &ldquo;Hola María, le recordamos su turno con el profesional <strong>{profile.displayName || 'Profesional'}</strong> en <strong>{profile.clinicName || 'Consultorio'}</strong> ({profile.clinicAddress || 'Dirección de atención'}). Por cualquier consulta responda a este mensaje o llame al {profile.phone || 'su teléfono'}.&rdquo;
                </div>
              </div>
            </div>
          </div>

          {/* Account Summary Sidebar */}
          <div className="space-y-6">
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Resumen de la Cuenta
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/50 text-xs">
                  <span className="text-on-surface-variant font-medium">Rol Asignado</span>
                  <span className="font-bold text-on-surface capitalize">{profile.role}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/50 text-xs">
                  <span className="text-on-surface-variant font-medium">Estado</span>
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {profile.status}
                  </span>
                </div>
                {!isStaff && (
                  <div className="flex justify-between items-center py-2 border-b border-outline-variant/50 text-xs">
                    <span className="text-on-surface-variant font-medium">Días Hábiles</span>
                    <span className="font-bold text-primary">{profile.workingDays.length} días activos</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-outline-variant/50 text-xs">
                  <span className="text-on-surface-variant font-medium flex items-center gap-1.5">
                    <Cloud size={13} className="text-primary" /> Google Drive
                  </span>
                  <span className={cn("font-bold text-[11px]", isDriveConnected ? "text-emerald-600" : "text-amber-600")}>
                    {isDriveConnected ? 'Conectado' : 'Sin conectar'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 text-xs">
                  <span className="text-on-surface-variant font-medium">Email</span>
                  <span className="font-bold text-on-surface truncate max-w-[140px]" title={user?.email || ''}>
                    {user?.email}
                  </span>
                </div>
              </div>
            </div>

            {/* Privacy & Safe Storage Card */}
            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-2 text-xs text-on-surface-variant">
              <div className="flex items-center gap-2 font-bold text-primary">
                <ShieldCheck size={16} />
                <span>Privacidad y Control de Acceso</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Toda la información personal y las credenciales clínicas se almacenan bajo cifrado en Firebase. Sus datos nunca son compartidos con terceros no autorizados.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HORARIOS Y ATENCIÓN */}
      {activeTab === 'schedule' && !isStaff && (
        <div id="panel-schedule" role="tabpanel" aria-labelledby="tab-schedule" className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant pb-4">
            <div>
              <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
                <Clock size={17} className="text-primary" /> Días y Horarios de Atención
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Defina los días laborables y franjas horarias disponibles para asignación de turnos.
              </p>
            </div>

            {/* Timezone Indicator */}
            <div className="flex items-center gap-2 text-xs bg-surface-bright border border-outline-variant px-3 py-1.5 rounded-xl self-start sm:self-center">
              <Globe size={14} className="text-primary shrink-0" />
              <span className="font-mono text-[11px] font-bold text-on-surface">GMT-3 (Buenos Aires)</span>
            </div>
          </div>

          {/* Validation Warnings */}
          {validationErrors.schedule || validationErrors.morning || validationErrors.afternoon || validationErrors.overlap ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1 text-xs text-red-800">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle size={15} className="text-red-600" />
                <span>Conflicto en la configuración de horarios:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                {validationErrors.schedule && <li>{validationErrors.schedule}</li>}
                {validationErrors.morning && <li>{validationErrors.morning}</li>}
                {validationErrors.afternoon && <li>{validationErrors.afternoon}</li>}
                {validationErrors.overlap && <li>{validationErrors.overlap}</li>}
              </ul>
            </div>
          ) : null}

          {/* Presets & Quick Actions Bar */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant block">
              Configuraciones Rápidas (Presets)
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applySchedulePreset('full')}
                className="px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant text-on-surface rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Jornada Completa (08:00 - 12:00 y 14:00 - 18:00)
              </button>
              <button
                type="button"
                onClick={() => applySchedulePreset('continuous')}
                className="px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant text-on-surface rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Turno Corrido (09:00 - 17:00)
              </button>
              <button
                type="button"
                onClick={() => applySchedulePreset('morning')}
                className="px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant text-on-surface rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Solo Mañanas (08:00 - 13:00)
              </button>
              <button
                type="button"
                onClick={() => applySchedulePreset('afternoon')}
                className="px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant text-on-surface rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Solo Tardes (14:00 - 20:00)
              </button>
            </div>
          </div>

          {/* Días Laborales: Accessible Mobile-First Card Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant block">
                Días de Atención Habilitados ({profile.workingDays.length} de 7)
              </label>
              <button
                type="button"
                onClick={() => setProfile((prev) => ({ ...prev, workingDays: [1, 2, 3, 4, 5] }))}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Copy size={13} /> Aplicar a Lun - Vie
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = profile.workingDays.includes(day.index);
                return (
                  <button 
                    key={day.index}
                    type="button"
                    onClick={() => toggleDay(day.index)}
                    className={cn(
                      "py-3 px-2 rounded-xl border text-center font-black transition-all flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[52px] touch-manipulation focus-visible:ring-2 focus-visible:ring-primary outline-none",
                      isSelected
                        ? "bg-primary border-primary text-white shadow-md shadow-primary/20" 
                        : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-dim"
                    )}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Atención el día ${day.full}`}
                  >
                    <span className="text-sm">{day.label}</span>
                    <span className="text-[9px] uppercase font-bold tracking-tight opacity-90">
                      {isSelected ? 'Atiende' : 'Cerrado'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Franjas Horarias: Turno Mañana y Turno Tarde */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Turno Mañana */}
            <div className={cn(
              "p-5 rounded-2xl border transition-all",
              profile.morningActive ? "bg-surface-bright border-primary/30" : "bg-surface-dim border-outline-variant opacity-60"
            )}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-on-surface">Turno Mañana</h3>
                    <p className="text-[10px] text-on-surface-variant">Franja matutina de consultas</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setProfile({ ...profile, morningActive: !profile.morningActive })}
                  className={cn(
                    "text-[10px] font-black uppercase px-3 py-1.5 rounded-full transition-all border cursor-pointer min-h-[34px] focus-visible:ring-2 focus-visible:ring-primary outline-none",
                    profile.morningActive 
                      ? "bg-primary text-white border-primary shadow-xs" 
                      : "bg-surface border-outline-variant text-on-surface-variant"
                  )}
                  role="switch"
                  aria-checked={profile.morningActive}
                  aria-label="Activar o desactivar turno mañana"
                >
                  {profile.morningActive ? 'Activo' : 'Desactivado'}
                </button>
              </div>

              <div className={cn("grid grid-cols-2 gap-3", !profile.morningActive && "pointer-events-none opacity-40")}>
                <div className="space-y-1">
                  <label htmlFor="schedule-morningStart" className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                    Hora Inicio
                  </label>
                  <input 
                    id="schedule-morningStart"
                    type="time" 
                    value={profile.morningStart}
                    onChange={(e) => setProfile({ ...profile, morningStart: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/20" 
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="schedule-morningEnd" className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                    Hora Fin
                  </label>
                  <input 
                    id="schedule-morningEnd"
                    type="time" 
                    value={profile.morningEnd}
                    onChange={(e) => setProfile({ ...profile, morningEnd: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/20" 
                  />
                </div>
              </div>
            </div>

            {/* Turno Tarde */}
            <div className={cn(
              "p-5 rounded-2xl border transition-all",
              profile.afternoonActive ? "bg-surface-bright border-primary/30" : "bg-surface-dim border-outline-variant opacity-60"
            )}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
                    <Clock size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-on-surface">Turno Tarde</h3>
                    <p className="text-[10px] text-on-surface-variant">Franja vespertina de consultas</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setProfile({ ...profile, afternoonActive: !profile.afternoonActive })}
                  className={cn(
                    "text-[10px] font-black uppercase px-3 py-1.5 rounded-full transition-all border cursor-pointer min-h-[34px] focus-visible:ring-2 focus-visible:ring-primary outline-none",
                    profile.afternoonActive 
                      ? "bg-primary text-white border-primary shadow-xs" 
                      : "bg-surface border-outline-variant text-on-surface-variant"
                  )}
                  role="switch"
                  aria-checked={profile.afternoonActive}
                  aria-label="Activar o desactivar turno tarde"
                >
                  {profile.afternoonActive ? 'Activo' : 'Desactivado'}
                </button>
              </div>

              <div className={cn("grid grid-cols-2 gap-3", !profile.afternoonActive && "pointer-events-none opacity-40")}>
                <div className="space-y-1">
                  <label htmlFor="schedule-afternoonStart" className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                    Hora Inicio
                  </label>
                  <input 
                    id="schedule-afternoonStart"
                    type="time" 
                    value={profile.afternoonStart}
                    onChange={(e) => setProfile({ ...profile, afternoonStart: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/20" 
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="schedule-afternoonEnd" className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                    Hora Fin
                  </label>
                  <input 
                    id="schedule-afternoonEnd"
                    type="time" 
                    value={profile.afternoonEnd}
                    onChange={(e) => setProfile({ ...profile, afternoonEnd: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/20" 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Appointment Duration & Capacity Summary Box */}
          <div className="p-4 bg-surface rounded-2xl border border-outline-variant space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant block">
                  Duración Estándar de Consulta
                </span>
                <p className="text-xs text-on-surface-variant">
                  Se utiliza para calcular la cantidad máxima de turnos por franja diaria.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {[20, 30, 45, 60].map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setProfile((prev) => ({ ...prev, appointmentDurationMinutes: dur }))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      profile.appointmentDurationMinutes === dur
                        ? "bg-primary text-white shadow-xs"
                        : "bg-white border border-outline-variant text-on-surface hover:bg-surface-dim"
                    )}
                  >
                    {dur} min
                  </button>
                ))}
              </div>
            </div>

            {/* Calculated stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-outline-variant/60 text-xs">
              <div className="p-2.5 bg-white rounded-xl border border-outline-variant/80">
                <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Horas Diarias</span>
                <span className="text-base font-black text-on-surface">{scheduleStats.dailyHours} hs</span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-outline-variant/80">
                <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Total Semanal</span>
                <span className="text-base font-black text-primary">{scheduleStats.weeklyHours} hs/sem</span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-outline-variant/80">
                <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Capacidad Diaria</span>
                <span className="text-base font-black text-on-surface">~{scheduleStats.dailyAppointments} turnos</span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-outline-variant/80">
                <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Capacidad Semanal</span>
                <span className="text-base font-black text-emerald-600">~{scheduleStats.weeklyAppointments} turnos</span>
              </div>
            </div>
          </div>

          {/* Clinical Notice */}
          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
            <Shield size={18} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong>Nota clínica de seguridad:</strong> Las modificaciones en los días u horas de atención no cancelarán ni alterarán citas ya concedidas con anterioridad. Regulan la disponibilidad para nuevas reservas en la agenda médica.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: SEGURIDAD Y CUENTA */}
      {activeTab === 'security' && (
        <div id="panel-security" role="tabpanel" aria-labelledby="tab-security" className="space-y-6">
          {/* Change Password Card */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant pb-4">
              <div>
                <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
                  <KeyRound size={17} className="text-primary" /> Actualización de Contraseña
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Establezca una clave segura de acceso para proteger los datos de sus pacientes.
                </p>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-primary/10 text-primary rounded-lg border border-primary/20 self-start sm:self-center">
                Mínimo 8 caracteres
              </span>
            </div>

            {passwordChangeSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800"
                role="status"
              >
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                <div className="text-xs">
                  <p className="font-bold">¡Contraseña actualizada exitosamente!</p>
                  <p className="text-emerald-700/80 mt-0.5">Utilice su nueva contraseña en el próximo inicio de sesión.</p>
                </div>
              </motion.div>
            )}

            {passwordError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800"
                role="alert"
              >
                <AlertCircle size={18} className="shrink-0 text-red-600" />
                <div className="text-xs">
                  <p className="font-bold">No se pudo actualizar la contraseña</p>
                  <p className="text-red-700/80 mt-0.5">{passwordError}</p>
                </div>
              </motion.div>
            )}

            {resetEmailSent && (
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center gap-2.5 text-sky-800 text-xs">
                <Mail size={15} className="text-sky-600 shrink-0" />
                <span>Se envió un enlace para restablecer su clave a <b>{user?.email}</b>. Revise su bandeja o spam.</span>
              </div>
            )}

            {/* Password Form: Exactly ordered Current -> New -> Confirm */}
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
              {/* 1. Contraseña Actual */}
              <div className="space-y-1.5">
                <label 
                  htmlFor="security-currentPassword"
                  className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                >
                  <Lock size={12} className="text-primary" /> Contraseña Actual
                  <span className="text-error font-bold" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <input
                    id="security-currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-3.5 pr-10 py-2.5 bg-surface text-sm border border-outline-variant rounded-xl focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 outline-none text-on-surface transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface cursor-pointer"
                    aria-label={showCurrentPassword ? "Ocultar contraseña actual" : "Mostrar contraseña actual"}
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 2. Nueva Contraseña */}
              <div className="space-y-1.5">
                <label 
                  htmlFor="security-newPassword"
                  className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                >
                  <Key size={12} className="text-primary" /> Nueva Contraseña
                  <span className="text-error font-bold" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <input
                    id="security-newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-surface text-sm border border-outline-variant rounded-xl focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 outline-none text-on-surface transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface cursor-pointer"
                    aria-label={showNewPassword ? "Ocultar nueva contraseña" : "Mostrar nueva contraseña"}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Real-time Checklist & Strength Indicator */}
                <div className="p-3 bg-surface rounded-xl border border-outline-variant/70 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-on-surface-variant">Fortaleza estimada:</span>
                    <span className="font-bold">{passwordStrength.label}</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-dim rounded-full overflow-hidden flex gap-1">
                    <div className={cn("h-full transition-all rounded-full", passwordStrength.score >= 1 ? passwordStrength.color : "bg-transparent", "w-1/4")} />
                    <div className={cn("h-full transition-all rounded-full", passwordStrength.score >= 2 ? passwordStrength.color : "bg-transparent", "w-1/4")} />
                    <div className={cn("h-full transition-all rounded-full", passwordStrength.score >= 3 ? passwordStrength.color : "bg-transparent", "w-1/4")} />
                    <div className={cn("h-full transition-all rounded-full", passwordStrength.score >= 4 ? passwordStrength.color : "bg-transparent", "w-1/4")} />
                  </div>

                  {/* Real-time checks */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 pt-1 text-[10px]">
                    <span className={cn("flex items-center gap-1 font-semibold", passwordCriteria.minLen ? "text-emerald-700" : "text-on-surface-variant/70")}>
                      <Check size={11} className={passwordCriteria.minLen ? "text-emerald-600" : "opacity-40"} />
                      8+ caracteres
                    </span>
                    <span className={cn("flex items-center gap-1 font-semibold", passwordCriteria.mixedCase ? "text-emerald-700" : "text-on-surface-variant/70")}>
                      <Check size={11} className={passwordCriteria.mixedCase ? "text-emerald-600" : "opacity-40"} />
                      Mayúscula y minúscula
                    </span>
                    <span className={cn("flex items-center gap-1 font-semibold", passwordCriteria.numberOrSpecial ? "text-emerald-700" : "text-on-surface-variant/70")}>
                      <Check size={11} className={passwordCriteria.numberOrSpecial ? "text-emerald-600" : "opacity-40"} />
                      Número o símbolo
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Confirmar Nueva Contraseña */}
              <div className="space-y-1.5">
                <label 
                  htmlFor="security-confirmPassword"
                  className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
                >
                  <CheckCircle2 size={12} className="text-primary" /> Confirmar Nueva Contraseña
                  <span className="text-error font-bold" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <input
                    id="security-confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita la nueva contraseña"
                    required
                    minLength={8}
                    className={cn(
                      "w-full pl-3.5 pr-10 py-2.5 bg-surface text-sm border rounded-xl outline-none text-on-surface transition-all font-mono focus-visible:ring-2",
                      confirmPassword && !isConfirmMatching
                        ? "border-amber-400 bg-amber-50/20 focus-visible:ring-amber-400/20"
                        : "border-outline-variant focus-visible:border-primary focus-visible:ring-primary/20"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface cursor-pointer"
                    aria-label={showConfirmPassword ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword && !isConfirmMatching && (
                  <p className="text-[11px] text-amber-600 font-semibold">Las contraseñas no coinciden aún.</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword || !currentPassword || !isNewPasswordValid || !isConfirmMatching}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer min-h-[44px]",
                    isChangingPassword || !currentPassword || !isNewPasswordValid || !isConfirmMatching
                      ? "bg-surface-dim text-on-surface-variant/50 cursor-not-allowed"
                      : "bg-primary text-white hover:bg-primary/90 active:scale-95 shadow-primary/20"
                  )}
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Actualizando...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={14} />
                      <span>Actualizar Contraseña</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSendResetPasswordEmail}
                  disabled={isSendingResetEmail || resetEmailCooldown > 0}
                  className="text-xs text-primary hover:underline font-bold transition-colors text-center sm:text-right cursor-pointer py-2 disabled:opacity-50"
                >
                  {isSendingResetEmail 
                    ? 'Enviando enlace...' 
                    : resetEmailCooldown > 0 
                      ? `Reenviar en ${resetEmailCooldown}s` 
                      : '¿Olvidó su contraseña actual? Enviar enlace por email'}
                </button>
              </div>
            </form>
          </div>

          {/* Account Details & Status */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
              <Shield size={17} className="text-primary" /> Información de la Cuenta y Seguridad
            </h2>

            <div className="space-y-4">
              {/* Email verification row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white rounded-xl border border-outline-variant shadow-xs text-primary">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface">Correo Electrónico Registrado</p>
                    <p className="text-xs text-on-surface-variant font-mono">{user?.email}</p>
                    {user?.emailVerified ? (
                      <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                        <CheckCircle2 size={12} /> Verificado
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                        <AlertCircle size={12} /> Pendiente de Verificación
                      </span>
                    )}
                  </div>
                </div>

                {!user?.emailVerified && (
                  <button 
                    type="button"
                    onClick={handleVerifyEmail}
                    disabled={verifyEmailCooldown > 0}
                    className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer min-h-[40px] disabled:opacity-50"
                  >
                    {verifyEmailCooldown > 0 ? `Reintentar en ${verifyEmailCooldown}s` : 'Enviar Email de Verificación'}
                  </button>
                )}
              </div>

              {/* Technical UID section for technical support */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white rounded-xl border border-outline-variant shadow-xs text-primary">
                    <Shield size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface">Identificador Clínico de Soporte (UID)</p>
                    <p className="text-[11px] font-mono text-on-surface-variant break-all">{user?.uid}</p>
                    <p className="text-[10px] text-on-surface-variant/70 mt-0.5">
                      Solo comparta este identificador si es solicitado por el equipo de soporte técnico oficial.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copyUidToClipboard}
                  className="px-3.5 py-2 bg-white border border-outline-variant hover:bg-surface-dim text-on-surface rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-center min-h-[40px]"
                >
                  {copiedUid ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  <span>{copiedUid ? 'Copiado' : 'Copiar UID'}</span>
                </button>
              </div>

              {/* 2FA & Session Security info */}
              <div className="p-4 bg-surface-bright rounded-2xl border border-outline-variant space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-on-surface">
                  <Smartphone size={16} className="text-primary" />
                  <span>Recomendación de Seguridad para Datos Clínicos</span>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Para cumplir con normativas de protección de historias clínicas, asegúrese de no dejar sesiones abiertas en computadoras compartidas del consultorio y mantenga una contraseña de alta complejidad.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GOOGLE DRIVE Y NUBE */}
      {activeTab === 'integrations' && (
        <div id="panel-integrations" role="tabpanel" aria-labelledby="tab-integrations" className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div>
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
              <Cloud size={17} className="text-primary" /> Integración con Google Drive
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Conecte su cuenta de Google para respaldar historias clínicas, radiografías y consentimientos informados de sus pacientes.
            </p>
          </div>

          {/* Status Card */}
          <div className="p-5 rounded-2xl border border-outline-variant bg-surface space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white border border-outline-variant shadow-xs flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-on-surface">Cuenta de Google Drive</h3>
                    {isDriveConnected ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 size={11} /> Conectado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <AlertCircle size={11} /> No conectado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {isDriveConnected 
                      ? (googleUser?.email || 'Sesión autorizada y activa') 
                      : 'Conecte su cuenta para habilitar el guardado automático de archivos'}
                  </p>
                </div>
              </div>

              <div>
                {isDriveConnected ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {rootFolderId ? (
                      <a
                        href={`https://drive.google.com/drive/folders/${rootFolderId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all min-h-[40px]"
                      >
                        <FolderOpen size={14} />
                        Carpeta Drive
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const id = await getRootFolderId();
                          if (id) window.open(`https://drive.google.com/drive/folders/${id}`, '_blank');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[40px]"
                      >
                        <FolderOpen size={14} />
                        Abrir Carpeta
                        <ExternalLink size={12} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsDisconnectModalOpen(true)}
                      className="px-3.5 py-2 border border-outline-variant hover:bg-surface-dim text-on-surface-variant hover:text-error rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[40px]"
                    >
                      Desconectar
                    </button>
                  </div>
                ) : (
                  <button
                    id="btn-profile-connect-drive"
                    type="button"
                    onClick={() => { void connectGoogleDrive(); }}
                    disabled={isDriveConnecting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white hover:bg-primary/90 rounded-xl text-xs font-bold uppercase tracking-wider shadow-xs transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
                  >
                    {isDriveConnecting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Conectando...</span>
                      </>
                    ) : (
                      <>
                        <Cloud size={15} />
                        <span>Conectar con Google Drive</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Scope and Privacy Explanations */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Folder size={16} />
              </div>
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Estructura por Paciente
              </h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Se crea la carpeta principal <strong>MedTurnos</strong> y una subcarpeta automática para cada paciente registrado.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Respaldo en 1 Clic
              </h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Suba consentimientos y estudios radiológicos directamente desde la ficha médica.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <ShieldCheck size={16} />
              </div>
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Permiso Restringido Seguro
              </h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Utilizamos el scope seguro <code>drive.file</code>. La aplicación solo accede a los archivos creados por ella misma.
              </p>
            </div>
          </div>

          {/* Graceful Degradation Notice */}
          <div className="p-4 bg-surface-bright rounded-xl border border-outline-variant text-xs text-on-surface-variant space-y-1">
            <p className="font-bold text-on-surface">Continuidad operativa garantizada:</p>
            <p className="text-[11px]">
              Si no conecta Google Drive o se encuentra temporalmente sin conexión a internet, todas sus citas, pacientes, presupuestos e historias clínicas siguen guardándose normalmente en la base de datos de MedTurnos.
            </p>
          </div>
        </div>
      )}

      {/* MOBILE FLOATING UNSAVED CHANGES DOCK */}
      {/* Positioned safely above mobile bottom navigation (bottom-20) */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="sm:hidden fixed bottom-20 left-3 right-3 z-40 bg-white/95 backdrop-blur-md border border-amber-300 shadow-2xl rounded-2xl p-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
              <span className="text-xs font-bold text-on-surface truncate">Cambios pendientes</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={saving}
                className="px-3 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface rounded-xl border border-outline-variant bg-surface cursor-pointer min-h-[44px]"
              >
                Descartar
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-xs font-black text-white bg-primary hover:bg-primary/90 rounded-xl shadow-md uppercase tracking-wider flex items-center gap-1.5 cursor-pointer min-h-[44px]"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>{saving ? 'Guardando...' : 'Guardar'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Crop & Adjustment Modal */}
      <AvatarCropModal
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        imageSrc={tempImageForCrop}
        onCropComplete={handleCropComplete}
      />

      {/* Patient Public Profile Preview Modal */}
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

      {/* Disconnect Google Drive Confirmation Modal */}
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
              Al desconectar su cuenta, MedTurnos dejará de sincronizar archivos en su Google Drive. 
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
