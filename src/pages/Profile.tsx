import { useState, useEffect } from 'react';
import { User, Mail, Shield, Smartphone, Globe, Camera, Save, Lock, Clock, CheckCircle2 } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { doc, onSnapshot, updateDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { sendEmailVerification } from 'firebase/auth';

export function Profile() {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleVerifyEmail = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      alert('Email de verificación enviado. Por favor, revise su bandeja de entrada.');
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      alert('Error al enviar el email de verificación. Intente nuevamente más tarde.');
    }
  };

  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    licenseNumber: '',
    phone: '',
    workingDays: [1, 2, 3, 4, 5], // 1=Mon, 7=Sun
    morningStart: '08:00',
    morningEnd: '12:00',
    afternoonStart: '14:00',
    afternoonEnd: '18:00'
  });

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setProfile(prev => ({
          ...prev,
          displayName: data.name || prev.displayName,
          licenseNumber: data.licenseNumber || '',
          phone: data.phone || '',
          workingDays: data.workingHours?.days || [1, 2, 3, 4, 5],
          morningStart: data.workingHours?.morningStart || '08:00',
          morningEnd: data.workingHours?.morningEnd || '12:00',
          afternoonStart: data.workingHours?.afternoonStart || '14:00',
          afternoonEnd: data.workingHours?.afternoonEnd || '18:00'
        }));
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`));

    return () => unsubscribe();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSuccess(false);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        name: profile.displayName,
        email: user.email,
        licenseNumber: profile.licenseNumber,
        phone: profile.phone,
        workingHours: {
          days: profile.workingDays,
          morningStart: profile.morningStart,
          morningEnd: profile.morningEnd,
          afternoonStart: profile.afternoonStart,
          afternoonEnd: profile.afternoonEnd
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (dayIndex: number) => {
    setProfile(prev => ({
      ...prev,
      workingDays: prev.workingDays.includes(dayIndex)
        ? prev.workingDays.filter(d => d !== dayIndex)
        : [...prev.workingDays, dayIndex].sort()
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="headline-lg text-on-surface">Perfil Profesional</h1>
          <p className="body-md text-on-surface-variant">Gestione su identidad profesional y configuraciones de seguridad.</p>
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {success && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-primary bg-primary/10 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase"
              >
                <CheckCircle2 size={14} /> Guardado
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "px-5 py-2 rounded-md text-[12px] font-bold flex items-center gap-2 shadow-sm uppercase tracking-widest transition-all",
              saving ? "bg-surface-dim text-on-surface-variant opacity-50 cursor-not-allowed" : "bg-primary text-white hover:bg-primary/90 active:scale-95"
            )}
          >
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm text-center">
            <div className="relative inline-block mb-4 group">
              <div className="w-24 h-24 rounded-full border-2 border-primary-container overflow-hidden bg-surface mx-auto">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-primary bg-primary-container">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
                  </div>
                )}
              </div>
              <button className="absolute bottom-0 right-0 p-1.5 bg-primary text-white rounded-full border-2 border-white shadow-lg hover:bg-primary/90 transition-all">
                <Camera size={12} />
              </button>
            </div>
            <h3 className="text-[16px] font-bold text-on-surface">{profile.displayName || 'Profesional Médico'}</h3>
            <p className="text-[11px] text-on-surface-variant mb-3 uppercase font-bold tracking-wider opacity-60">Cirujano Dentista</p>
            <span className="text-[9px] font-black px-2 py-0.5 bg-tertiary-container text-on-tertiary-container rounded-full uppercase tracking-tighter">Sesión Activa</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 opacity-60">Estadísticas Rápidas</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-on-surface-variant">Pacientes Totales</span>
                <span className="font-bold text-on-surface">1,248</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-on-surface-variant">Tratamientos Activos</span>
                <span className="font-bold text-on-surface">12</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-on-surface-variant">Score de Perfil</span>
                <span className="font-bold text-primary">98/100</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
            <h3 className="text-sm font-bold text-on-surface mb-5 flex items-center gap-2">
              <User size={16} className="text-primary" />
              Información General
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Nombre de Usuario</label>
                <input 
                  type="text" 
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  className="w-full px-3 py-1.5 bg-surface border border-outline-variant rounded text-[13px] focus:ring-1 focus:ring-primary outline-none" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Matrícula Prof.</label>
                <input 
                  type="text" 
                  value={profile.licenseNumber}
                  onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })}
                  className="w-full px-3 py-1.5 bg-surface border border-outline-variant rounded text-[13px] focus:ring-1 focus:ring-primary outline-none" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Teléfono Principal</label>
                <input 
                  type="text" 
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-1.5 bg-surface border border-outline-variant rounded text-[13px] focus:ring-1 focus:ring-primary outline-none" 
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
            <h3 className="text-sm font-bold text-on-surface mb-5 flex items-center gap-2">
              <Clock size={16} className="text-primary" />
              Horarios de Atención
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-7 gap-2">
                {[
                  { label: 'L', index: 1 },
                  { label: 'M', index: 2 },
                  { label: 'X', index: 3 },
                  { label: 'J', index: 4 },
                  { label: 'V', index: 5 },
                  { label: 'S', index: 6 },
                  { label: 'D', index: 7 }
                ].map((day) => (
                  <button 
                    key={day.index}
                    type="button"
                    onClick={() => toggleDay(day.index)}
                    className={cn(
                      "aspect-square rounded-lg border text-[11px] font-bold transition-all",
                      profile.workingDays.includes(day.index)
                        ? "bg-primary border-primary text-white shadow-sm" 
                        : "bg-surface border-outline-variant text-on-surface-variant hover:bg-outline-variant/10"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Turno Mañana</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="time" 
                        value={profile.morningStart}
                        onChange={(e) => setProfile({ ...profile, morningStart: e.target.value })}
                        className="flex-1 px-3 py-1 bg-surface border border-outline-variant rounded text-[12px] outline-none" 
                      />
                      <span className="text-[10px] font-bold text-on-surface-variant">a</span>
                      <input 
                        type="time" 
                        value={profile.morningEnd}
                        onChange={(e) => setProfile({ ...profile, morningEnd: e.target.value })}
                        className="flex-1 px-3 py-1 bg-surface border border-outline-variant rounded text-[12px] outline-none" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Turno Tarde</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="time" 
                        value={profile.afternoonStart}
                        onChange={(e) => setProfile({ ...profile, afternoonStart: e.target.value })}
                        className="flex-1 px-3 py-1 bg-surface border border-outline-variant rounded text-[12px] outline-none" 
                      />
                      <span className="text-[10px] font-bold text-on-surface-variant">a</span>
                      <input 
                        type="time" 
                        value={profile.afternoonEnd}
                        onChange={(e) => setProfile({ ...profile, afternoonEnd: e.target.value })}
                        className="flex-1 px-3 py-1 bg-surface border border-outline-variant rounded text-[12px] outline-none" 
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-surface rounded-lg border border-outline-variant flex items-start gap-3">
                  <Shield size={14} className="text-secondary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-on-surface-variant">Estos horarios se utilizarán para generar los huecos automáticos en su agenda y sistema de turnos online.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-error-container/30 shadow-sm">
            <h3 className="text-sm font-bold text-error mb-5 flex items-center gap-2">
              <Lock size={16} />
              Seguridad y Credenciales
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-surface border border-outline-variant rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white rounded-md border border-outline-variant"><Mail className="text-on-surface-variant" size={14} /></div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-on-surface">Email de Autenticación</p>
                    <p className="text-[11px] text-on-surface-variant truncate">{user?.email}</p>
                    {user?.emailVerified ? (
                      <span className="text-[9px] text-primary font-bold uppercase tracking-widest leading-none">Verificado</span>
                    ) : (
                      <span className="text-[9px] text-error font-bold uppercase tracking-widest leading-none">No Verificado</span>
                    )}
                  </div>
                </div>
                {!user?.emailVerified && (
                  <button 
                    onClick={handleVerifyEmail}
                    className="text-[10px] font-black text-primary uppercase underline cursor-pointer tracking-widest hover:text-primary/80 transition-colors"
                  >
                    Verificar
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-surface border border-outline-variant rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white rounded-md border border-outline-variant"><Smartphone className="text-on-surface-variant" size={14} /></div>
                  <div>
                    <p className="text-[12px] font-bold text-on-surface">2FA (SMS)</p>
                    <p className="text-[10px] text-error font-medium">No activo</p>
                  </div>
                </div>
                <button className="bg-primary text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">Activar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
