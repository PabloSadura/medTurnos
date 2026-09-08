import { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Shield, 
  Camera, 
  Save, 
  Lock, 
  Clock, 
  CheckCircle2, 
  Trash2, 
  Briefcase, 
  Award, 
  Phone, 
  Sparkles,
  AlertCircle,
  Cloud,
  ExternalLink,
  Folder,
  RefreshCw,
  Loader2,
  FolderOpen
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { sendEmailVerification } from 'firebase/auth';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';

export function Profile() {
  const { isStaff, profile: authProfile } = useAuth();
  const user = auth.currentUser;
  const { showToast } = useToast();
  const { 
    isConnected: isDriveConnected, 
    isConnecting: isDriveConnecting, 
    googleUser, 
    connectGoogleDrive, 
    disconnectGoogleDrive,
    rootFolderId,
    getRootFolderId
  } = useGoogleDrive();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'schedule' | 'security' | 'integrations'>('info');

  const [profile, setProfile] = useState({
    displayName: authProfile?.name || user?.displayName || '',
    email: user?.email || '',
    licenseNumber: authProfile?.licenseNumber || '',
    specialty: authProfile?.specialty || 'Cirujano Dentista',
    phone: authProfile?.phone || '',
    photoURL: authProfile?.photoURL || user?.photoURL || '',
    role: authProfile?.role || 'medico',
    status: authProfile?.status || 'Activo',
    workingDays: authProfile?.schedule?.workingDays || [1, 2, 3, 4, 5], // 1=Lun, 7=Dom
    morningStart: authProfile?.schedule?.morningStart || '08:00',
    morningEnd: authProfile?.schedule?.morningEnd || '12:00',
    morningActive: authProfile?.schedule?.morningActive !== false,
    afternoonStart: authProfile?.schedule?.afternoonStart || '14:00',
    afternoonEnd: authProfile?.schedule?.afternoonEnd || '18:00',
    afternoonActive: authProfile?.schedule?.afternoonActive !== false
  });

  const handleVerifyEmail = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      showToast('Email de verificación enviado. Por favor revise su bandeja de entrada.');
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      showToast('Error al enviar el email de verificación. Intente nuevamente más tarde.', 'error');
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Pre-populate if authProfile exists
    if (authProfile) {
      setProfile(prev => ({
        ...prev,
        displayName: authProfile.name || prev.displayName,
        email: user.email || prev.email,
        licenseNumber: authProfile.licenseNumber || prev.licenseNumber,
        specialty: authProfile.specialty || prev.specialty,
        phone: authProfile.phone || prev.phone,
        photoURL: authProfile.photoURL || prev.photoURL,
        role: authProfile.role || prev.role,
        status: authProfile.status || prev.status,
        workingDays: authProfile.schedule?.workingDays || prev.workingDays,
        morningStart: authProfile.schedule?.morningStart || prev.morningStart,
        morningEnd: authProfile.schedule?.morningEnd || prev.morningEnd,
        morningActive: authProfile.schedule?.morningActive !== undefined ? authProfile.schedule.morningActive : prev.morningActive,
        afternoonStart: authProfile.schedule?.afternoonStart || prev.afternoonStart,
        afternoonEnd: authProfile.schedule?.afternoonEnd || prev.afternoonEnd,
        afternoonActive: authProfile.schedule?.afternoonActive !== undefined ? authProfile.schedule.afternoonActive : prev.afternoonActive,
      }));
    }

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, async (snapshot) => {
      clearTimeout(safetyTimer);
      if (snapshot.exists()) {
        const data = snapshot.data();
        setProfile(prev => ({
          ...prev,
          displayName: data.name || user.displayName || prev.displayName || 'Profesional',
          email: data.email || user.email || prev.email,
          licenseNumber: data.licenseNumber || '',
          specialty: data.specialty || 'Cirujano Dentista',
          phone: data.phone || '',
          photoURL: data.photoURL || user.photoURL || prev.photoURL,
          role: data.role || 'medico',
          status: data.status || 'Activo',
          workingDays: data.schedule?.workingDays || [1, 2, 3, 4, 5],
          morningStart: data.schedule?.morningStart || '08:00',
          morningEnd: data.schedule?.morningEnd || '12:00',
          morningActive: data.schedule?.morningActive !== false,
          afternoonStart: data.schedule?.afternoonStart || '14:00',
          afternoonEnd: data.schedule?.afternoonEnd || '18:00',
          afternoonActive: data.schedule?.afternoonActive !== false
        }));

        if (data.role === 'secretary' || data.role === 'staff') {
          try {
            const staffSnap = await getDoc(doc(db, 'staff', user.uid));
            if (staffSnap.exists()) {
              const staffData = staffSnap.data();
              setProfile(prev => ({
                ...prev,
                displayName: staffData.name || prev.displayName,
                specialty: staffData.role || 'Staff Administrativo',
                phone: staffData.phone || prev.phone
              }));
            }
          } catch (err) {
            console.warn('Could not load staff extra doc:', err);
          }
        }
      } else {
        try {
          const staffSnap = await getDoc(doc(db, 'staff', user.uid));
          if (staffSnap.exists()) {
            const staffData = staffSnap.data();
            setProfile(prev => ({
              ...prev,
              displayName: staffData.name || user.displayName || 'Personal de Staff',
              email: user.email || '',
              specialty: staffData.role || 'Staff Asistente',
              phone: staffData.phone || '',
              role: 'secretary'
            }));
          } else {
            setProfile(prev => ({
              ...prev,
              displayName: user.displayName || user.email?.split('@')[0] || 'Profesional',
              email: user.email || ''
            }));
          }
        } catch (e) {
          console.warn('Error reading fallback staff profile:', e);
        }
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
  }, [user, authProfile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSuccess(false);
    try {
      const isUserStaffRole = isStaff || profile.role === 'secretary';
      
      const payload: any = {
        name: profile.displayName.trim() || user.displayName || 'Profesional',
        email: user.email,
        phone: profile.phone || '',
        photoURL: profile.photoURL || '',
        updatedAt: serverTimestamp()
      };

      if (!isUserStaffRole) {
        payload.licenseNumber = profile.licenseNumber || '';
        payload.specialty = profile.specialty || 'Cirujano Dentista';
        payload.schedule = {
          workingDays: profile.workingDays,
          morningStart: profile.morningStart,
          morningEnd: profile.morningEnd,
          morningActive: profile.morningActive,
          afternoonStart: profile.afternoonStart,
          afternoonEnd: profile.afternoonEnd,
          afternoonActive: profile.afternoonActive
        };
      }

      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });

      try {
        const staffRef = doc(db, 'staff', user.uid);
        const staffSnap = await getDoc(staffRef);
        if (staffSnap.exists()) {
          await setDoc(staffRef, {
            name: profile.displayName.trim(),
            phone: profile.phone || '',
            photoURL: profile.photoURL || '',
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      } catch (err) {
        console.warn('Staff record sync skipped:', err);
      }
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      showToast('Perfil y preferencias guardados con éxito');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      showToast('La imagen es muy pesada. Por favor seleccione una foto de hasta 800KB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfile(prev => ({ ...prev, photoURL: reader.result as string }));
      showToast('Foto cargada. Recuerde pulsar "Guardar Cambios".');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setProfile(prev => ({ ...prev, photoURL: '' }));
  };

  const toggleDay = (dayIndex: number) => {
    setProfile(prev => {
      const exists = prev.workingDays.includes(dayIndex);
      const newDays = exists 
        ? prev.workingDays.filter(d => d !== dayIndex)
        : [...prev.workingDays, dayIndex].sort((a, b) => a - b);
      return { ...prev, workingDays: newDays };
    });
  };

  const daysList = [
    { label: 'Lun', full: 'Lunes', index: 1 },
    { label: 'Mar', full: 'Martes', index: 2 },
    { label: 'Mié', full: 'Miércoles', index: 3 },
    { label: 'Jue', full: 'Jueves', index: 4 },
    { label: 'Vie', full: 'Viernes', index: 5 },
    { label: 'Sáb', full: 'Sábado', index: 6 },
    { label: 'Dom', full: 'Domingo', index: 7 }
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Cargando perfil...</p>
      </div>
    );
  }

  const isAdmin = profile.role === 'admin' || user?.email === 'admin@mail.com' || user?.email === 'pablosadura@gmail.com';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-outline-variant shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-primary/20 overflow-hidden bg-surface-bright flex items-center justify-center shadow-inner">
              {profile.photoURL ? (
                <img src={profile.photoURL} alt="Foto de perfil" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-black text-2xl sm:text-3xl text-primary bg-primary/10">
                  {profile.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
            </div>
            <label 
              title="Cambiar foto"
              className="absolute -bottom-1 -right-1 p-2 bg-primary text-white rounded-xl border-2 border-white shadow-md hover:bg-primary/90 transition-transform active:scale-90 cursor-pointer"
            >
              <Camera size={14} />
              <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
            </label>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
                {profile.displayName || 'Usuario'}
              </h1>
              {isAdmin ? (
                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                  Super Admin
                </span>
              ) : isStaff ? (
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                  Staff
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-wider">
                  Profesional
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-on-surface-variant flex items-center gap-1.5 mt-0.5">
              <Mail size={13} className="opacity-70" /> {user?.email}
            </p>
            <p className="text-[11px] font-bold text-primary uppercase tracking-wider mt-1">
              {profile.specialty} {profile.licenseNumber ? `• Mat. ${profile.licenseNumber}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <AnimatePresence>
            {success && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                <CheckCircle2 size={15} /> <span className="hidden sm:inline">Cambios guardados</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-md uppercase tracking-wider transition-all cursor-pointer",
              saving 
                ? "bg-surface-dim text-on-surface-variant opacity-60 cursor-not-allowed" 
                : "bg-primary text-white hover:bg-primary/90 active:scale-95 shadow-primary/20"
            )}
          >
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-outline-variant bg-white px-2 sm:px-4 rounded-xl shadow-sm gap-1 sm:gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap",
            activeTab === 'info'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <User size={15} /> Información General
        </button>

        {!isStaff && (
          <button
            onClick={() => setActiveTab('schedule')}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap",
              activeTab === 'schedule'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Clock size={15} /> Horarios y Atención
          </button>
        )}

        <button
          onClick={() => setActiveTab('security')}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap",
            activeTab === 'security'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Shield size={15} /> Seguridad y Cuenta
        </button>

        <button
          onClick={() => setActiveTab('integrations')}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 py-3 sm:py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap",
            activeTab === 'integrations'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Cloud size={15} /> Google Drive y Nube
        </button>
      </div>

      {/* Tab 1: Info */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-5">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
                <User size={17} className="text-primary" /> Datos del Perfil
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                    <User size={13} /> Nombre Completo
                  </label>
                  <input 
                    type="text" 
                    value={profile.displayName}
                    onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                    placeholder="Ej. Dr. Juan Pérez"
                    className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                    <Phone size={13} /> Teléfono de Contacto
                  </label>
                  <input 
                    type="text" 
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="Ej. +54 9 11 1234-5678"
                    className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  />
                </div>

                {!isStaff && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <Briefcase size={13} /> Especialidad
                      </label>
                      <input 
                        type="text" 
                        value={profile.specialty}
                        onChange={(e) => setProfile({ ...profile, specialty: e.target.value })}
                        placeholder="Ej. Odontología General / Ortodoncia"
                        className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <Award size={13} /> Matrícula Profesional
                      </label>
                      <input 
                        type="text" 
                        value={profile.licenseNumber}
                        onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })}
                        placeholder="Ej. MN 12345 / MP 6789"
                        className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                      />
                    </div>
                  </>
                )}
              </div>

              {profile.photoURL && (
                <div className="pt-2 flex items-center justify-between p-3 bg-surface-bright rounded-xl border border-outline-variant">
                  <div className="flex items-center gap-3">
                    <img src={profile.photoURL} alt="Miniatura" className="w-10 h-10 rounded-lg object-cover border" />
                    <div>
                      <p className="text-xs font-bold text-on-surface">Foto de Perfil Personalizada</p>
                      <p className="text-[10px] text-on-surface-variant">Visible en el panel y en la agenda</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="p-2 text-error hover:bg-error-container/20 rounded-lg transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={14} /> Quitar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Side Summary Card */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Resumen de la Cuenta
              </h4>
              
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
                    <span className="text-on-surface-variant font-medium">Días de Atención</span>
                    <span className="font-bold text-primary">{profile.workingDays.length} días/sem</span>
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
                  <span className="font-bold text-on-surface truncate max-w-[140px]">{user?.email}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Schedule */}
      {activeTab === 'schedule' && !isStaff && (
        <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
              <Clock size={17} className="text-primary" /> Días y Horarios de Atención
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Configure los días de la semana y los rangos de atención para la disponibilidad de turnos en el sistema.
            </p>
          </div>

          {/* Días de la semana */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant block">
              Días Laborales Activos
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              {daysList.map((day) => {
                const isSelected = profile.workingDays.includes(day.index);
                return (
                  <button 
                    key={day.index}
                    type="button"
                    onClick={() => toggleDay(day.index)}
                    className={cn(
                      "py-3 px-2 rounded-xl border text-center font-black transition-all flex flex-col items-center justify-center gap-1 cursor-pointer",
                      isSelected
                        ? "bg-primary border-primary text-white shadow-md shadow-primary/20" 
                        : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-dim"
                    )}
                  >
                    <span className="text-sm">{day.label}</span>
                    <span className="text-[9px] uppercase font-bold tracking-tight opacity-80">{day.full}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Turnos Mañana y Tarde */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Turno Mañana */}
            <div className={cn(
              "p-5 rounded-2xl border transition-all",
              profile.morningActive ? "bg-surface-bright border-primary/30" : "bg-surface-dim border-outline-variant opacity-60"
            )}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-on-surface">Turno Mañana</h4>
                    <p className="text-[10px] text-on-surface-variant">Franja matutina de consultas</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setProfile({ ...profile, morningActive: !profile.morningActive })}
                  className={cn(
                    "text-[10px] font-black uppercase px-3 py-1 rounded-full transition-all border cursor-pointer",
                    profile.morningActive 
                      ? "bg-primary text-white border-primary shadow-sm" 
                      : "bg-surface border-outline-variant text-on-surface-variant"
                  )}
                >
                  {profile.morningActive ? 'Activo' : 'Desactivado'}
                </button>
              </div>

              <div className={cn("grid grid-cols-2 gap-3", !profile.morningActive && "pointer-events-none opacity-40")}>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Hora Inicio</label>
                  <input 
                    type="time" 
                    value={profile.morningStart}
                    onChange={(e) => setProfile({ ...profile, morningStart: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Hora Fin</label>
                  <input 
                    type="time" 
                    value={profile.morningEnd}
                    onChange={(e) => setProfile({ ...profile, morningEnd: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none" 
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
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
                    <Clock size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-on-surface">Turno Tarde</h4>
                    <p className="text-[10px] text-on-surface-variant">Franja vespertina de consultas</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setProfile({ ...profile, afternoonActive: !profile.afternoonActive })}
                  className={cn(
                    "text-[10px] font-black uppercase px-3 py-1 rounded-full transition-all border cursor-pointer",
                    profile.afternoonActive 
                      ? "bg-primary text-white border-primary shadow-sm" 
                      : "bg-surface border-outline-variant text-on-surface-variant"
                  )}
                >
                  {profile.afternoonActive ? 'Activo' : 'Desactivado'}
                </button>
              </div>

              <div className={cn("grid grid-cols-2 gap-3", !profile.afternoonActive && "pointer-events-none opacity-40")}>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Hora Inicio</label>
                  <input 
                    type="time" 
                    value={profile.afternoonStart}
                    onChange={(e) => setProfile({ ...profile, afternoonStart: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Hora Fin</label>
                  <input 
                    type="time" 
                    value={profile.afternoonEnd}
                    onChange={(e) => setProfile({ ...profile, afternoonEnd: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm font-bold text-on-surface outline-none" 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
            <Shield size={18} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant">
              Los horarios configurados son utilizados por la agenda para validar las horas hábiles de turnos y las franjas horarias disponibles.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Security */}
      {activeTab === 'security' && (
        <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
            <Lock size={17} className="text-primary" /> Seguridad y Credenciales
          </h3>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white rounded-xl border border-outline-variant shadow-sm text-primary">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface">Correo Electrónico Principal</p>
                  <p className="text-xs text-on-surface-variant">{user?.email}</p>
                  {user?.emailVerified ? (
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                      <CheckCircle2 size={12} /> Verificado
                    </span>
                  ) : (
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                      <AlertCircle size={12} /> Pendiente de Verificación
                    </span>
                  )}
                </div>
              </div>

              {!user?.emailVerified && (
                <button 
                  type="button"
                  onClick={handleVerifyEmail}
                  className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Enviar Email de Verificación
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white rounded-xl border border-outline-variant shadow-sm text-primary">
                  <Shield size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface">Identificador de Usuario (UID)</p>
                  <p className="text-[11px] font-mono text-on-surface-variant break-all">{user?.uid}</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-surface-bright rounded-lg border border-outline-variant text-on-surface-variant">
                Activo
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Integrations (Google Drive) */}
      {activeTab === 'integrations' && (
        <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-wider">
              <Cloud size={17} className="text-primary" /> Integración con Google Drive
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Conecta tu cuenta de Google para almacenar automáticamente historias clínicas, radiografías, estudios y adjuntos de tus pacientes.
            </p>
          </div>

          {/* Connection status card */}
          <div className="p-5 rounded-2xl border border-outline-variant bg-surface space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white border border-outline-variant shadow-sm flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-on-surface">Cuenta de Google</h4>
                    {isDriveConnected ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 size={11} /> Conectado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <AlertCircle size={11} /> No conectado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {isDriveConnected 
                      ? (googleUser?.email || 'Sesión autorizada y activa') 
                      : 'Conecta tu cuenta para habilitar el guardado en la nube'}
                  </p>
                </div>
              </div>

              <div>
                {isDriveConnected ? (
                  <div className="flex items-center gap-2">
                    {rootFolderId ? (
                      <a
                        href={`https://drive.google.com/drive/folders/${rootFolderId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                      >
                        <FolderOpen size={14} />
                        Carpeta en Drive
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const id = await getRootFolderId();
                          if (id) window.open(`https://drive.google.com/drive/folders/${id}`, '_blank');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                      >
                        <FolderOpen size={14} />
                        Abrir Carpeta
                        <ExternalLink size={12} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={disconnectGoogleDrive}
                      className="px-3 py-2 border border-outline-variant hover:bg-surface-dim text-on-surface-variant hover:text-error rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
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
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white hover:bg-primary/90 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isDriveConnecting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <Cloud size={15} />
                        Conectar con Google Drive
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Benefits and Organization Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Folder size={16} />
              </div>
              <h5 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Estructura Inteligente
              </h5>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Se crea la carpeta principal <strong>MedTurnos</strong> y dentro una subcarpeta identificada por cada paciente.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <h5 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Historias Clínicas en 1 Clic
              </h5>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Genera el documento consolidado de la historia clínica y súbelo instantáneamente desde la ficha del paciente.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center">
                <Shield size={16} />
              </div>
              <h5 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Permiso Restringido Seguro
              </h5>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Utilizamos el scope seguro <code>drive.file</code>. La app solo interactúa con los archivos creados por ella.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
