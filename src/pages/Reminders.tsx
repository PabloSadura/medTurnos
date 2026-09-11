import { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, Search, Filter, Calendar, Clock, User, Phone, 
  Send, CheckCircle2, AlertCircle, Sparkles, Settings, ExternalLink, 
  RefreshCw, Check, Copy, ArrowUpDown, Building, MapPin, Eye, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, onSnapshot, query, where, doc, updateDoc, 
  serverTimestamp, setDoc, getDoc 
} from 'firebase/firestore';
import { ReminderModal } from '../components/ReminderModal';
import { getPatientFirstName } from '../lib/patientNameUtils';
import { formatDateDDMMAAAA, formatArgentinePhoneWithPrefix, getWhatsAppNumber } from '../lib/phoneUtils';

export function Reminders() {
  const { ownerId, profile } = useAuth();

  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow' | 'week' | 'all'>('today');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'sent'>('all');
  const [selectedProfessional, setSelectedProfessional] = useState<string>('all');

  // Modal State
  const [activeModalAppointment, setActiveModalAppointment] = useState<any | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Default Template & Clinic Info in Settings
  const [template, setTemplate] = useState(
    'Hola {nombre}, te recordamos tu turno el {fecha} a las {hora} con {profesional} en {clinica}, ubicada en {direccion}. Por favor responde este mensaje para confirmar tu asistencia. ¡Te esperamos!'
  );
  const [clinicName, setClinicName] = useState('Nuestra Clínica');
  const [clinicAddress, setClinicAddress] = useState('Av. Libertador 1234');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Fetch Patients, Appointments & Staff
  useEffect(() => {
    if (!ownerId) return;

    setLoading(true);

    const unsubscribePatients = onSnapshot(
      query(collection(db, 'patients'), where('userId', '==', ownerId)),
      (snapshot) => {
        setPatients(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'patients')
    );

    const unsubscribeAppointments = onSnapshot(
      query(collection(db, 'appointments'), where('userId', '==', ownerId)),
      (snapshot) => {
        const apts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setAppointments(apts);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'appointments');
        setLoading(false);
      }
    );

    const unsubscribeStaff = onSnapshot(
      query(collection(db, 'staff'), where('userId', '==', ownerId)),
      (snapshot) => {
        setStaff(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'staff')
    );

    // Fetch Template & Clinic Settings
    getDoc(doc(db, 'reminder_settings', ownerId)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.template) setTemplate(d.template);
        if (d.clinicName) setClinicName(d.clinicName);
        if (d.clinicAddress) setClinicAddress(d.clinicAddress);
      } else if (profile) {
        if (profile.clinicName) setClinicName(profile.clinicName);
        if (profile.clinicAddress || profile.address) setClinicAddress(profile.clinicAddress || profile.address);
      }
    }).catch(console.warn);

    return () => {
      unsubscribePatients();
      unsubscribeAppointments();
      unsubscribeStaff();
    };
  }, [ownerId, profile]);

  // Save Default Template and Clinic Info
  const handleSaveSettings = async () => {
    if (!ownerId) return;
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'reminder_settings', ownerId), {
        userId: ownerId,
        template: template,
        clinicName: clinicName.trim(),
        clinicAddress: clinicAddress.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Synchronize with user profile doc
      try {
        await setDoc(doc(db, 'users', ownerId), {
          clinicName: clinicName.trim(),
          clinicAddress: clinicAddress.trim(),
          address: clinicAddress.trim()
        }, { merge: true });
      } catch (e) {
        console.warn('Could not sync clinic data with user profile:', e);
      }

      showToast('Configuración y plantilla guardadas correctamente');
      setShowSettings(false);
    } catch (err) {
      console.error('Error saving settings:', err);
      showToast('Error al guardar la plantilla');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Helper date calculations
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const nextWeekStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);

  // Process and merge appointment data with patient phone and first names
  const processedAppointments = useMemo(() => {
    return appointments.map(apt => {
      const patient = patients.find(p => p.id === apt.patientId);
      const phone = patient?.phone || apt.patientPhone || apt.phone || '';
      const patientName = apt.patientName || patient?.name || 'Paciente';
      const firstName = apt.patientFirstName || patient?.firstName || getPatientFirstName(patient || patientName);

      return {
        ...apt,
        patientName,
        patientFirstName: firstName,
        phone,
        isToday: apt.date === todayStr,
        isTomorrow: apt.date === tomorrowStr,
        isFuture: apt.date >= todayStr
      };
    });
  }, [appointments, patients, todayStr, tomorrowStr]);

  // Filtered List
  const filteredAppointments = useMemo(() => {
    return processedAppointments.filter(apt => {
      // Date filter
      if (dateFilter === 'today' && apt.date !== todayStr) return false;
      if (dateFilter === 'tomorrow' && apt.date !== tomorrowStr) return false;
      if (dateFilter === 'week' && (apt.date < todayStr || apt.date > nextWeekStr)) return false;

      // Status filter
      if (statusFilter === 'pending' && apt.reminderSent) return false;
      if (statusFilter === 'sent' && !apt.reminderSent) return false;

      // Professional filter
      if (selectedProfessional !== 'all') {
        const prof = (apt.professionalName || apt.professional || '').toLowerCase();
        if (!prof.includes(selectedProfessional.toLowerCase())) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = (apt.patientName || '').toLowerCase().includes(query);
        const matchesPhone = (apt.phone || '').includes(query);
        const matchesProf = (apt.professionalName || apt.professional || '').toLowerCase().includes(query);
        const matchesDate = (apt.date || '').includes(query);
        if (!matchesName && !matchesPhone && !matchesProf && !matchesDate) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by date then time
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.time || '').localeCompare(b.time || '');
    });
  }, [processedAppointments, dateFilter, statusFilter, selectedProfessional, searchTerm, todayStr, tomorrowStr, nextWeekStr]);

  // Metrics
  const metrics = useMemo(() => {
    const todayCount = processedAppointments.filter(a => a.isToday).length;
    const tomorrowCount = processedAppointments.filter(a => a.isTomorrow).length;
    const pendingCount = processedAppointments.filter(a => a.isFuture && !a.reminderSent).length;
    const sentCount = processedAppointments.filter(a => a.isFuture && a.reminderSent).length;

    return { todayCount, tomorrowCount, pendingCount, sentCount };
  }, [processedAppointments]);

  // Toggle Reminder Status directly
  const handleToggleStatus = async (apt: any) => {
    try {
      await updateDoc(doc(db, 'appointments', apt.id), {
        reminderSent: !apt.reminderSent,
        reminderSentAt: !apt.reminderSent ? serverTimestamp() : null
      });
      showToast(!apt.reminderSent ? 'Marcado como recordatorio enviado' : 'Marcado como pendiente');
    } catch (err) {
      console.error('Error updating appointment reminder status:', err);
    }
  };

  // Quick 1-click WhatsApp trigger with fixed prefix +54 9, DDMMAAAA date and clinic address
  const handleQuickWhatsApp = (apt: any) => {
    const cleanPhone = getWhatsAppNumber(apt.phone);

    if (!cleanPhone || cleanPhone === '549') {
      setActiveModalAppointment(apt);
      return;
    }

    const formattedDate = formatDateDDMMAAAA(apt.date);
    const message = template
      .replace(/{nombre}/g, apt.patientFirstName)
      .replace(/{fecha}/g, formattedDate)
      .replace(/{hora}/g, apt.time || 'su horario')
      .replace(/{profesional}/g, apt.professionalName || apt.professional || 'su profesional')
      .replace(/{clinica}/g, clinicName)
      .replace(/{direccion}/g, clinicAddress)
      .replace(/{tratamiento}/g, apt.treatment || 'su consulta');

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    // Mark as sent
    updateDoc(doc(db, 'appointments', apt.id), {
      reminderSent: true,
      reminderSentAt: serverTimestamp(),
      reminderPhone: cleanPhone
    }).catch(console.warn);

    showToast(`WhatsApp abierto para ${apt.patientFirstName}`);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-on-surface text-surface px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 border border-outline-variant animate-in fade-in slide-in-from-bottom-3">
          <Check size={14} className="text-secondary" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-tight flex items-center gap-2.5">
            <MessageSquare className="text-primary" size={26} />
            Recordatorios de Turnos
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Envío manual de recordatorios con 1 clic directo a WhatsApp Web o móvil con mensaje personalizado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
              showSettings 
                ? "bg-primary text-white border-primary" 
                : "border-outline-variant bg-surface hover:bg-surface-bright text-on-surface"
            )}
          >
            <Settings size={14} />
            <span>Configurar Plantilla y Clínica</span>
          </button>
        </div>
      </div>

      {/* Settings Drawer / Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 bg-surface-bright border border-outline-variant rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-secondary" />
                  <h3 className="text-sm font-bold text-on-surface">Configuración de Mensaje y Clínica</h3>
                </div>
                <span className="text-[11px] text-on-surface-variant font-medium">
                  Se autocompleta con los datos de cada paciente y sede
                </span>
              </div>

              {/* Clinic Name and Address inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                    <Building size={13} /> Nombre de la Clínica
                  </label>
                  <input
                    type="text"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Ej: Clínica Odontológica Dental"
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface outline-none focus:border-primary font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                    <MapPin size={13} /> Dirección de la Clínica
                  </label>
                  <input
                    type="text"
                    value={clinicAddress}
                    onChange={(e) => setClinicAddress(e.target.value)}
                    placeholder="Ej: Av. Libertador 1234, CABA"
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface outline-none focus:border-primary font-medium"
                  />
                </div>
              </div>

              {/* Template editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                    Plantilla del Mensaje
                  </label>
                  <span className="text-[10px] text-primary font-medium">
                    Formato de fecha: <b>DDMMAAAA (DD/MM/AAAA)</b>
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full p-3 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface outline-none focus:border-primary transition-all resize-none leading-relaxed"
                  placeholder="Ej: Hola {nombre}, te recordamos tu turno el {fecha} a las {hora} con {profesional} en {clinica}, ubicada en {direccion}..."
                />

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-on-surface-variant">
                  <span className="font-semibold text-on-surface text-[10px] uppercase tracking-wider">Insertar variable:</span>
                  {[
                    { tag: '{nombre}', label: 'Nombre' },
                    { tag: '{fecha}', label: 'Fecha (DDMMAAAA)' },
                    { tag: '{hora}', label: 'Hora' },
                    { tag: '{profesional}', label: 'Profesional' },
                    { tag: '{clinica}', label: 'Clínica' },
                    { tag: '{direccion}', label: 'Dirección' },
                    { tag: '{tratamiento}', label: 'Tratamiento' }
                  ].map(({ tag, label }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTemplate(prev => `${prev} ${tag}`)}
                      className="px-2 py-0.5 rounded-md bg-surface border border-outline-variant hover:border-primary text-on-surface text-[10px] font-mono cursor-pointer transition-colors"
                      title={`Insertar ${label}`}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview of message */}
              <div className="p-3 bg-surface border border-outline-variant rounded-xl space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                  <Eye size={12} className="text-secondary" />
                  <span>Vista previa en vivo (ejemplo con fecha DDMMAAAA):</span>
                </div>
                <p className="text-xs text-on-surface bg-surface-bright p-2.5 rounded-lg border border-outline-variant/60 leading-relaxed font-sans italic">
                  {template
                    .replace(/{nombre}/g, 'María')
                    .replace(/{fecha}/g, formatDateDDMMAAAA(todayStr))
                    .replace(/{hora}/g, '14:30')
                    .replace(/{profesional}/g, 'Dra. López')
                    .replace(/{clinica}/g, clinicName || 'Nuestra Clínica')
                    .replace(/{direccion}/g, clinicAddress || 'Av. Libertador 1234')
                    .replace(/{tratamiento}/g, 'Control y Limpieza')}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1.5 rounded-xl border border-outline-variant text-xs text-on-surface hover:bg-surface transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={isSavingSettings}
                  onClick={handleSaveSettings}
                  className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check size={13} />
                  <span>{isSavingSettings ? 'Guardando...' : 'Guardar Configuración'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-surface border border-outline-variant rounded-2xl shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Turnos Hoy</p>
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-2xl font-black text-on-surface">{metrics.todayCount}</p>
            <Calendar size={16} className="text-primary opacity-60" />
          </div>
        </div>

        <div className="p-4 bg-surface border border-outline-variant rounded-2xl shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Turnos Mañana</p>
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-2xl font-black text-on-surface">{metrics.tomorrowCount}</p>
            <Clock size={16} className="text-secondary opacity-60" />
          </div>
        </div>

        <div className="p-4 bg-surface border border-outline-variant rounded-2xl shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Pendientes de Envío</p>
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{metrics.pendingCount}</p>
            <AlertCircle size={16} className="text-amber-500 opacity-60" />
          </div>
        </div>

        <div className="p-4 bg-surface border border-outline-variant rounded-2xl shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Recordatorios Enviados</p>
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{metrics.sentCount}</p>
            <CheckCircle2 size={16} className="text-emerald-500 opacity-60" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-surface border border-outline-variant rounded-2xl space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por paciente, teléfono o profesional..."
              className="w-full pl-9 pr-4 py-2 bg-surface-bright border border-outline-variant rounded-xl text-xs text-on-surface outline-none focus:border-primary transition-all"
            />
          </div>

          {/* Quick Date Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'tomorrow', label: 'Mañana' },
              { id: 'week', label: 'Próximos 7 días' },
              { id: 'all', label: 'Todos' }
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDateFilter(d.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                  dateFilter === d.id
                    ? "bg-primary text-white shadow-xs"
                    : "bg-surface-bright text-on-surface-variant hover:text-on-surface hover:bg-outline-variant/30"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/60 text-xs">
          {/* Status Segment */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mr-1">Estado:</span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: 'Pendientes' },
              { id: 'sent', label: 'Enviados' }
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id as any)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                  statusFilter === s.id
                    ? "bg-secondary text-white font-bold"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-bright"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Professional Selector */}
          {staff.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Profesional:</span>
              <select
                value={selectedProfessional}
                onChange={(e) => setSelectedProfessional(e.target.value)}
                className="px-2.5 py-1 bg-surface-bright border border-outline-variant rounded-lg text-xs text-on-surface outline-none focus:border-primary"
              >
                <option value="all">Todos los profesionales</option>
                {staff.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Appointments List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-on-surface-variant">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary" />
            <p className="text-xs">Cargando turnos y recordatorios...</p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="p-12 text-center bg-surface border border-outline-variant rounded-2xl">
            <MessageSquare size={32} className="mx-auto mb-2 text-on-surface-variant/40" />
            <p className="text-sm font-bold text-on-surface">No hay turnos para los filtros seleccionados</p>
            <p className="text-xs text-on-surface-variant mt-1">Pruebe cambiando la fecha o el estado del recordatorio.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {filteredAppointments.map((apt) => {
              const isSent = Boolean(apt.reminderSent);
              const hasPhone = Boolean(apt.phone);

              return (
                <div
                  key={apt.id}
                  className="p-4 bg-surface border border-outline-variant rounded-2xl hover:border-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
                >
                  {/* Left: Patient & Appointment Details */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 sm:mt-0">
                      {(apt.patientFirstName?.[0] || 'P').toUpperCase()}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-on-surface truncate">
                          {apt.patientName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-bright border border-outline-variant text-on-surface-variant font-mono">
                          Saluda: {apt.patientFirstName}
                        </span>
                        {apt.isOverturn && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1">
                            <Zap size={11} className="text-purple-600 fill-purple-600" />
                            Sobre Turno
                          </span>
                        )}
                        {isSent ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            Enviado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                            <Clock size={11} />
                            Pendiente
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar size={12} className="text-primary" />
                          {formatDateDDMMAAAA(apt.date)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-semibold text-on-surface">
                          <Clock size={12} className="text-secondary" />
                          {apt.time || 'Horario a confirmar'}
                        </span>
                        <span>•</span>
                        <span>{apt.professionalName || apt.professional || 'Profesional'}</span>
                        {apt.treatment && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[140px] text-[11px] opacity-80">{apt.treatment}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        {hasPhone ? (
                          <span className="font-mono text-[11px] text-on-surface-variant flex items-center gap-1">
                            <Phone size={11} /> {formatArgentinePhoneWithPrefix(apt.phone)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertCircle size={11} /> Sin teléfono guardado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {/* Toggle Sent/Pending button */}
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(apt)}
                      title={isSent ? "Marcar como pendiente" : "Marcar como enviado"}
                      className={cn(
                        "p-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer",
                        isSent 
                          ? "border-outline-variant text-on-surface-variant hover:bg-surface-bright" 
                          : "border-outline-variant text-on-surface-variant hover:text-emerald-600 hover:border-emerald-300"
                      )}
                    >
                      {isSent ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Clock size={15} />}
                    </button>

                    {/* Quick 1-click WhatsApp button */}
                    {hasPhone && (
                      <button
                        type="button"
                        onClick={() => handleQuickWhatsApp(apt)}
                        title="Abrir WhatsApp Web/Móvil con mensaje directo"
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        <Send size={13} />
                        <span className="hidden sm:inline">1-Clic WhatsApp</span>
                      </button>
                    )}

                    {/* Open Detailed Customization Modal */}
                    <button
                      type="button"
                      onClick={() => setActiveModalAppointment(apt)}
                      className="px-3.5 py-2 bg-primary text-white hover:bg-primary/90 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <MessageSquare size={13} />
                      <span>Personalizar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reminder Modal */}
      {activeModalAppointment && (
        <ReminderModal
          isOpen={Boolean(activeModalAppointment)}
          onClose={() => setActiveModalAppointment(null)}
          appointment={activeModalAppointment}
          defaultTemplate={template}
          clinicName={clinicName}
          clinicAddress={clinicAddress}
          onReminderSent={(aptId) => {
            showToast('Recordatorio abierto en WhatsApp con éxito');
            // Update local state if needed
            setAppointments(prev => prev.map(a => a.id === aptId ? { ...a, reminderSent: true } : a));
          }}
        />
      )}
    </div>
  );
}
