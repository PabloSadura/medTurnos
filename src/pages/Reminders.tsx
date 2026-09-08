import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, 
  CalendarClock, 
  Settings, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Info, 
  Save, 
  ToggleLeft, 
  ToggleRight, 
  Search, 
  Edit3, 
  Copy, 
  Check, 
  Sparkles, 
  Calendar, 
  User, 
  Phone, 
  Building2, 
  MapPin, 
  RotateCcw,
  ChevronDown,
  Filter
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { WhatsAppReminderModal } from '../components/WhatsAppReminderModal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, doc, setDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

export function Reminders() {
  const { ownerId } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week'>('today');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  
  // Custom message state per appointment (allows in-card or modal editing)
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Selected appointment for full personalization modal
  const [modalAppointment, setModalAppointment] = useState<any | null>(null);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);

  // In-app notification toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [settings, setSettings] = useState<any>({
    template: 'Hola {nombre}, te recordamos tu turno de {tratamiento} el {fecha} a las {hora} hs en {clinica}. ¡Te esperamos! Por favor confirma tu asistencia respondiendo a este mensaje.',
    botEnabled: false,
    clinicName: 'Clínica Dental',
    clinicAddress: '',
    rules: [
      { label: '24h Antes (Recordatorio)', active: true },
      { label: '1h Antes (Alerta Final)', active: true },
      { label: 'Seguimiento (Post 2 días)', active: false },
      { label: 'Saludo Cumpleaños', active: true },
    ]
  });

  useEffect(() => {
    if (!ownerId) return;

    // Fetch settings reliably using direct document listener to prevent Firestore list rule errors
    const unsubscribeSettings = onSnapshot(doc(db, 'reminder_settings', ownerId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings((prev: any) => ({ ...prev, ...data }));
      }
    }, (error) => {
      console.warn('Could not sync reminder_settings doc, continuing with defaults:', error);
    });

    // Sync patients for enrichment
    const unsubscribePatients = onSnapshot(
      query(collection(db, 'patients'), where('userId', '==', ownerId)), 
      (snapshot) => {
        const pMap: Record<string, any> = {};
        snapshot.docs.forEach(d => {
          pMap[d.id] = d.data();
        });
        setPatients(pMap);
      }, 
      (error) => handleFirestoreError(error, OperationType.LIST, 'patients')
    );

    // Fetch appointments for this user
    const q = query(
      collection(db, 'appointments'),
      where('userId', '==', ownerId)
    );

    const unsubscribeApps = onSnapshot(q, (snapshot) => {
      const allApps = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAppointments(allApps);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    return () => {
      unsubscribeSettings();
      unsubscribePatients();
      unsubscribeApps();
    };
  }, [ownerId]);

  // Robust date/time parser
  const parseAppointmentDate = (app: any): Date => {
    if (app.startTime?.toDate) {
      return app.startTime.toDate();
    }
    if (app.startTime instanceof Date) {
      return app.startTime;
    }
    if (typeof app.startTime === 'string') {
      const parsed = new Date(app.startTime);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (app.date) {
      const parts = app.date.split('-').map(Number);
      if (parts.length === 3) {
        const timeParts = (app.time || '09:00').split(':').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2], timeParts[0] || 9, timeParts[1] || 0);
      }
    }
    return new Date();
  };

  // Process and enrich reminders list
  const processedReminders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);

    const nowTime = new Date();

    return appointments.map((app: any) => {
      const patientData = app.patientId ? patients[app.patientId] : null;
      const patientName = patientData?.name || app.patientName || 'Paciente';
      const patientPhone = patientData?.phone || app.patientPhone || app.phone || '';
      
      const dateObj = parseAppointmentDate(app);
      const appMidnight = new Date(dateObj);
      appMidnight.setHours(0, 0, 0, 0);

      const isToday = appMidnight.getTime() === today.getTime();
      const isTomorrow = appMidnight.getTime() === tomorrow.getTime();
      const isPast = dateObj < nowTime;

      let dateStr = '';
      if (isToday) {
        dateStr = 'Hoy';
      } else if (isTomorrow) {
        dateStr = 'Mañana';
      } else {
        dateStr = new Intl.DateTimeFormat('es-AR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        }).format(dateObj);
      }

      const timeStr = app.time || dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const treatmentStr = app.type || app.treatment || 'Consulta';

      // Build default interpolated message
      let defaultMsg = settings.template || 'Hola {nombre}, te recordamos tu turno de {tratamiento} el {fecha} a las {hora} hs en {clinica}. ¡Te esperamos! Por favor confirma tu asistencia.';
      defaultMsg = defaultMsg.replace(/{nombre}/g, patientName);
      defaultMsg = defaultMsg.replace(/{fecha}/g, dateStr);
      defaultMsg = defaultMsg.replace(/{hora}/g, timeStr);
      defaultMsg = defaultMsg.replace(/{tratamiento}/g, treatmentStr);
      defaultMsg = defaultMsg.replace(/{clinica}/g, settings.clinicName || 'Clínica Dental');
      defaultMsg = defaultMsg.replace(/{direccion}/g, settings.clinicAddress || '');

      // Check if user has a custom edited message for this appointment
      const activeMessage = customMessages[app.id] || defaultMsg;

      return {
        id: app.id,
        rawAppointment: app,
        patient: patientName,
        phone: patientPhone,
        time: timeStr,
        date: dateStr,
        dateObj,
        isToday,
        isTomorrow,
        isPast,
        status: app.status || 'pendiente',
        treatment: treatmentStr,
        message: activeMessage,
        isCustomized: Boolean(customMessages[app.id])
      };
    }).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  }, [appointments, patients, settings, customMessages]);

  // Filter according to user selection
  const filteredReminders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    return processedReminders.filter((rem) => {
      // Date filter
      if (dateFilter === 'today' && !rem.isToday) return false;
      if (dateFilter === 'tomorrow' && !rem.isTomorrow) return false;
      if (dateFilter === 'week') {
        if (rem.dateObj < today || rem.dateObj > weekEnd) return false;
      }

      // Status filter
      if (statusFilter === 'pending' && rem.status !== 'pendiente' && rem.status !== 'pending') return false;
      if (statusFilter === 'confirmed' && rem.status !== 'confirmed' && rem.status !== 'confirmado') return false;

      // Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = rem.patient.toLowerCase().includes(query);
        const matchesPhone = rem.phone.toLowerCase().includes(query);
        const matchesTreatment = rem.treatment.toLowerCase().includes(query);
        if (!matchesName && !matchesPhone && !matchesTreatment) return false;
      }

      return true;
    });
  }, [processedReminders, dateFilter, statusFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const todayCount = processedReminders.filter(r => r.isToday).length;
    const tomorrowCount = processedReminders.filter(r => r.isTomorrow).length;
    const pendingCount = processedReminders.filter(r => r.status === 'pendiente' || r.status === 'pending').length;
    return { todayCount, tomorrowCount, pendingCount, total: processedReminders.length };
  }, [processedReminders]);

  // Open modal for appointment customization
  const handleOpenPersonalizeModal = (reminder: any) => {
    setModalAppointment({
      ...reminder.rawAppointment,
      patientName: reminder.patient,
      patientPhone: reminder.phone,
      time: reminder.time,
      type: reminder.treatment,
      customMessage: customMessages[reminder.id] || reminder.message
    });
    setIsReminderModalOpen(true);
  };

  // Clean phone number helper
  const cleanPhone = (phoneStr: string) => {
    let cleaned = phoneStr.replace(/\D/g, '');
    if (cleaned.length === 10 && !cleaned.startsWith('54')) {
      cleaned = '549' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
      cleaned = '549' + cleaned.substring(1);
    }
    return cleaned;
  };

  // Direct quick send handler
  const handleQuickSend = (reminder: any) => {
    if (!reminder.phone) {
      // If phone is missing, open personalization modal so user can input phone!
      handleOpenPersonalizeModal(reminder);
      showToast('Por favor ingrese el número de teléfono del paciente.', 'info');
      return;
    }

    if (settings.botEnabled) {
      handleSendViaApi(reminder);
    } else {
      handleSendManual(reminder);
    }
  };

  const handleSendManual = (reminder: any) => {
    const phone = cleanPhone(reminder.phone);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(reminder.message)}`;

    // Log attempt safely in Firestore
    if (ownerId) {
      addDoc(collection(db, 'whatsapp_logs'), {
        to: reminder.phone,
        patientName: reminder.patient,
        appointmentId: reminder.id,
        message: reminder.message,
        status: 'success',
        userId: ownerId,
        createdAt: serverTimestamp(),
        method: 'manual'
      }).catch(err => console.warn('Error saving whatsapp log:', err));
    }

    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      showToast('Apertura automática bloqueada. Usa "Ajustar Mensaje" para abrir enlace directo.', 'info');
    } else {
      showToast(`Abriendo WhatsApp para ${reminder.patient}`, 'success');
    }
  };

  const handleSendViaApi = async (reminder: any) => {
    setSendingId(reminder.id);
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanPhone(reminder.phone),
          message: reminder.message
        })
      });

      const result = await response.json();

      if (ownerId) {
        await addDoc(collection(db, 'whatsapp_logs'), {
          to: reminder.phone,
          patientName: reminder.patient,
          appointmentId: reminder.id,
          message: reminder.message,
          status: response.ok ? 'success' : 'error',
          error: response.ok ? null : (result.error || 'Unknown error'),
          userId: ownerId,
          createdAt: serverTimestamp(),
          method: 'meta_api'
        });
      }

      if (!response.ok) throw new Error(result.error || 'Failed to send message via Meta API');
      showToast('Mensaje enviado exitosamente vía Meta API', 'success');
    } catch (error: any) {
      console.error(error);
      showToast(`Error al enviar: ${error.message}. Abriendo modo manual.`, 'error');
      handleSendManual(reminder);
    } finally {
      setSendingId(null);
    }
  };

  // Handle inline message changes
  const handleInlineMessageChange = (appointmentId: string, newText: string) => {
    setCustomMessages(prev => ({
      ...prev,
      [appointmentId]: newText
    }));
  };

  // Reset custom message for an appointment
  const handleResetCustomMessage = (appointmentId: string) => {
    setCustomMessages(prev => {
      const next = { ...prev };
      delete next[appointmentId];
      return next;
    });
    setEditingCardId(null);
    showToast('Mensaje restaurado a la plantilla predeterminada.', 'info');
  };

  // Copy message text to clipboard
  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast('Mensaje copiado al portapapeles', 'success');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      showToast('No se pudo copiar automáticamente', 'error');
    }
  };

  // Save settings in Firestore
  const handleSaveSettings = async () => {
    if (!ownerId) return;

    try {
      await setDoc(doc(db, 'reminder_settings', ownerId), {
        ...settings,
        userId: ownerId,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsSettingsOpen(false);
      showToast('Configuración de recordatorios guardada con éxito', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      handleFirestoreError(error, OperationType.WRITE, 'reminder_settings');
    }
  };

  const toggleRule = (index: number) => {
    const newRules = [...settings.rules];
    newRules[index].active = !newRules[index].active;
    setSettings({ ...settings, rules: newRules });
  };

  return (
    <div className="space-y-6">
      {/* Toast notification banner */}
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-3 transition-all animate-in slide-in-from-bottom-3",
          toast.type === 'success' && "bg-emerald-50 text-emerald-900 border-emerald-300 shadow-emerald-500/10",
          toast.type === 'error' && "bg-red-50 text-red-900 border-red-300 shadow-red-500/10",
          toast.type === 'info' && "bg-blue-50 text-blue-900 border-blue-300 shadow-blue-500/10"
        )}>
          {toast.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <AlertCircle size={16} className="text-blue-600 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Recordatorios de WhatsApp</h1>
          <p className="body-md text-on-surface-variant">
            Ajuste, personalice y envíe recordatorios con 1 clic a sus pacientes.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="px-3.5 py-2 bg-white border border-outline-variant text-[11px] font-bold text-on-surface-variant rounded-xl flex items-center gap-2 hover:bg-surface transition-all uppercase tracking-wider shadow-xs"
          >
            <Settings size={14} />
            Plantilla y Configuración
          </button>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          onClick={() => setDateFilter('today')}
          className={cn(
            "p-3.5 rounded-xl border transition-all cursor-pointer",
            dateFilter === 'today'
              ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
              : "bg-white border-outline-variant hover:border-primary/50 text-on-surface"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Turnos Hoy</div>
          <div className="text-xl font-black mt-0.5">{stats.todayCount}</div>
        </div>

        <div 
          onClick={() => setDateFilter('tomorrow')}
          className={cn(
            "p-3.5 rounded-xl border transition-all cursor-pointer",
            dateFilter === 'tomorrow'
              ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
              : "bg-white border-outline-variant hover:border-primary/50 text-on-surface"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Turnos Mañana</div>
          <div className="text-xl font-black mt-0.5">{stats.tomorrowCount}</div>
        </div>

        <div 
          onClick={() => setDateFilter('all')}
          className={cn(
            "p-3.5 rounded-xl border transition-all cursor-pointer",
            dateFilter === 'all'
              ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
              : "bg-white border-outline-variant hover:border-primary/50 text-on-surface"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Total en Cola</div>
          <div className="text-xl font-black mt-0.5">{stats.total}</div>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-outline-variant">
          <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant opacity-70">Modo WhatsApp</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={cn(
              "w-2 h-2 rounded-full",
              settings.botEnabled ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )}></span>
            <span className="text-xs font-bold text-on-surface">
              {settings.botEnabled ? 'Bot Meta Activo' : 'Manual (wa.me)'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Reminders Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            {/* Filter and Search Bar */}
            <div className="p-4 border-b border-outline-variant bg-surface-bright space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'today', label: 'Hoy' },
                    { id: 'tomorrow', label: 'Mañana' },
                    { id: 'week', label: 'Próx. 7 días' },
                    { id: 'all', label: 'Todos' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDateFilter(tab.id as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider shrink-0",
                        dateFilter === tab.id
                          ? "bg-primary text-white shadow-xs"
                          : "bg-surface hover:bg-surface-dim text-on-surface-variant"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por paciente o teléfono..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-outline-variant rounded-lg outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Reminders List */}
            <div className="divide-y divide-surface">
              {filteredReminders.map((msg) => {
                const isEditingThis = editingCardId === msg.id;

                return (
                  <div key={msg.id} className="p-4 hover:bg-surface/30 transition-colors space-y-3">
                    {/* Header line: Patient name, phone, date & time, status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                          <MessageSquare size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-on-surface">{msg.patient}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-dim text-on-surface-variant">
                              {msg.treatment}
                            </span>
                            {msg.isCustomized && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 flex items-center gap-1">
                                <Sparkles size={10} />
                                Personalizado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-on-surface-variant mt-0.5 font-medium">
                            <span className="font-bold text-primary flex items-center gap-1">
                              <Calendar size={11} />
                              {msg.date} • {msg.time} hs
                            </span>
                            {msg.phone ? (
                              <span className="flex items-center gap-1">
                                <Phone size={11} />
                                {msg.phone}
                              </span>
                            ) : (
                              <span className="text-amber-600 font-bold flex items-center gap-1">
                                <AlertCircle size={11} />
                                Sin teléfono registrado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className={cn(
                        "flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded self-start sm:self-center",
                        msg.status === 'confirmed' || msg.status === 'confirmado' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-surface-dim text-on-surface-variant'
                      )}>
                        {(msg.status === 'confirmed' || msg.status === 'confirmado') && <CheckCircle2 size={12} />}
                        {(msg.status === 'pending' || msg.status === 'pendiente') && <Clock size={12} />}
                        {msg.status}
                      </div>
                    </div>

                    {/* Message Box: View or Inline Edit */}
                    {isEditingThis ? (
                      <div className="space-y-2 bg-surface-bright p-3 rounded-xl border border-primary/30">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-primary">
                          <span>Editando Mensaje Directo</span>
                          {msg.isCustomized && (
                            <button
                              type="button"
                              onClick={() => handleResetCustomMessage(msg.id)}
                              className="text-on-surface-variant hover:text-primary flex items-center gap-1"
                            >
                              <RotateCcw size={10} />
                              Restablecer
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={3}
                          value={msg.message}
                          onChange={(e) => handleInlineMessageChange(msg.id, e.target.value)}
                          className="w-full p-2.5 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary transition-all resize-y"
                          placeholder="Ajuste el mensaje aquí..."
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingCardId(null)}
                            className="px-3 py-1 bg-white border border-outline-variant rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface transition-colors"
                          >
                            Listo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 bg-surface-bright p-2.5 rounded-xl border border-outline-variant/50">
                        <p className="text-xs text-on-surface-variant italic leading-relaxed flex-1 break-words">
                          "{msg.message}"
                        </p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingCardId(isEditingThis ? null : msg.id)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors border",
                            isEditingThis
                              ? "bg-primary text-white border-primary"
                              : "bg-surface hover:bg-surface-bright text-on-surface-variant border-outline-variant"
                          )}
                          title="Editar texto directamente en la tarjeta"
                        >
                          <Edit3 size={12} />
                          <span>{isEditingThis ? 'Ocultar Edición' : 'Ajustar Mensaje'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenPersonalizeModal(msg)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 bg-surface hover:bg-surface-bright text-primary border border-outline-variant transition-colors"
                          title="Abrir ventana de personalización completa con plantillas rápidas y vista previa de WhatsApp"
                        >
                          <Sparkles size={12} />
                          <span>Personalizar & Enviar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.message)}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors"
                          title="Copiar texto del mensaje"
                        >
                          {copiedId === msg.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuickSend(msg)}
                          disabled={sendingId === msg.id}
                          className={cn(
                            "px-3.5 py-1.5 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95",
                            !msg.phone 
                              ? "bg-amber-600 hover:bg-amber-700" 
                              : "bg-[#25D366] hover:bg-[#1EBE5D]"
                          )}
                          title={!msg.phone ? "Sin teléfono: abrir para ingresar número" : "Enviar por WhatsApp"}
                        >
                          {sendingId === msg.id ? (
                            <Clock size={14} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>{!msg.phone ? 'Ingresar Teléfono' : 'Enviar WhatsApp'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredReminders.length === 0 && !loading && (
                <div className="p-12 text-center text-on-surface-variant">
                  <CalendarClock size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest opacity-60">
                    No hay recordatorios para los filtros seleccionados
                  </p>
                  <p className="text-xs opacity-50 mt-1">
                    Pruebe seleccionando "Todos" o revisando la agenda.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Bot Status & Rules */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-primary/20 bg-primary/5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full pointer-events-none"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <MessageSquare className={cn(settings.botEnabled ? "text-primary" : "text-on-surface-variant")} size={18} />
              <h3 className="text-sm font-bold text-on-surface">Bot de WhatsApp</h3>
              <div className="ml-auto flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", settings.botEnabled ? "bg-primary animate-pulse" : "bg-on-surface-variant/30")}></div>
                <span className={cn("text-[10px] font-black uppercase", settings.botEnabled ? "text-primary" : "text-on-surface-variant/50")}>
                  {settings.botEnabled ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
            </div>
            <div className="space-y-4 relative z-10">
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {settings.botEnabled 
                  ? "El bot está habilitado para envíos automáticos usando la API de Meta." 
                  : "Modo manual activo: los recordatorios se abren con 1 clic en WhatsApp Web / Móvil con el mensaje pre-cargado."}
              </p>
              <button 
                type="button"
                onClick={() => setSettings({ ...settings, botEnabled: !settings.botEnabled })}
                className={cn(
                  "w-full py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all",
                  settings.botEnabled ? "bg-white border border-primary text-primary hover:bg-surface" : "bg-primary text-white hover:bg-primary/90"
                )}
              >
                {settings.botEnabled ? "Desactivar Envío Automático" : "Activar Envío Automático"}
              </button>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-on-surface">Reglas de Envío</h3>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="text-[10px] font-bold text-primary uppercase hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="space-y-3">
              {(settings.rules || []).map((rule: any, idx: number) => (
                <div key={rule.label} className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-on-surface-variant">{rule.label}</span>
                  <div 
                    onClick={() => toggleRule(idx)}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-colors cursor-pointer",
                      rule.active ? "bg-primary" : "bg-surface-dim"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                      rule.active ? "right-0.5" : "left-0.5"
                    )}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Configuración de Recordatorios"
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="space-y-4">
            {/* Bot toggle */}
            <div className="flex items-center justify-between p-4 bg-surface-bright rounded-xl border border-outline-variant">
              <div>
                <h4 className="text-sm font-bold text-on-surface">Meta WhatsApp API</h4>
                <p className="text-[11px] text-on-surface-variant">Envío automático en segundo plano</p>
              </div>
              <button 
                type="button"
                onClick={() => setSettings({ ...settings, botEnabled: !settings.botEnabled })}
                className="text-primary"
              >
                {settings.botEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-on-surface-variant/30" />}
              </button>
            </div>

            {/* Clinic Info for Variables */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest pl-1">
                  Nombre de la Clínica ({`{clinica}`})
                </label>
                <input
                  type="text"
                  value={settings.clinicName || ''}
                  onChange={(e) => setSettings({ ...settings, clinicName: e.target.value })}
                  placeholder="Ej: Clínica Dental San Lucas"
                  className="w-full mt-1 px-3 py-2 bg-white border border-outline-variant rounded-xl text-xs outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest pl-1">
                  Dirección ({`{direccion}`})
                </label>
                <input
                  type="text"
                  value={settings.clinicAddress || ''}
                  onChange={(e) => setSettings({ ...settings, clinicAddress: e.target.value })}
                  placeholder="Ej: Av. Santa Fe 1234, CABA"
                  className="w-full mt-1 px-3 py-2 bg-white border border-outline-variant rounded-xl text-xs outline-none focus:border-primary transition-all"
                />
              </div>
            </div>

            {/* Template Editor */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest pl-1">
                  Plantilla Predeterminada
                </label>
                <div className="group relative">
                  <Info size={12} className="text-primary cursor-help" />
                  <div className="absolute bottom-full right-0 mb-2 w-56 p-2.5 bg-on-surface text-surface text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl pointer-events-none">
                    Variables dinámicas disponibles:<br/>
                    <b>{`{nombre}`}</b>, <b>{`{fecha}`}</b>, <b>{`{hora}`}</b>, <b>{`{tratamiento}`}</b>, <b>{`{clinica}`}</b>, <b>{`{direccion}`}</b>
                  </div>
                </div>
              </div>

              <textarea 
                rows={4}
                value={settings.template}
                onChange={(e) => setSettings({ ...settings, template: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white border border-outline-variant rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-y"
                placeholder="Hola {nombre}, te recordamos tu turno..."
              />

              {/* Variable insertion buttons */}
              <div className="flex gap-1 flex-wrap">
                {['{nombre}', '{fecha}', '{hora}', '{tratamiento}', '{clinica}', '{direccion}'].map(v => (
                  <button 
                    key={v}
                    type="button"
                    onClick={() => setSettings({ ...settings, template: settings.template + ' ' + v })}
                    className="px-2 py-0.5 bg-surface text-[10px] font-mono font-bold rounded border border-outline-variant hover:border-primary transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="flex-1 px-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-[11px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button 
              type="button"
              onClick={handleSaveSettings}
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-[11px] font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 uppercase tracking-widest shadow-xs"
            >
              <Save size={14} />
              Guardar Configuración
            </button>
          </div>
        </div>
      </Modal>

      {/* Individual WhatsApp Message Customization Modal */}
      {isReminderModalOpen && modalAppointment && (
        <WhatsAppReminderModal
          isOpen={isReminderModalOpen}
          onClose={() => {
            setIsReminderModalOpen(false);
            setModalAppointment(null);
          }}
          appointment={modalAppointment}
          defaultTemplate={settings.template}
          clinicInfo={{
            name: settings.clinicName,
            address: settings.clinicAddress
          }}
          botEnabled={settings.botEnabled}
          onMessageSent={(appointmentId, sentMessage, method) => {
            setCustomMessages(prev => ({
              ...prev,
              [appointmentId]: sentMessage
            }));
            showToast(`Recordatorio enviado vía WhatsApp (${method === 'meta_api' ? 'API' : 'Web/Móvil'})`, 'success');
          }}
        />
      )}
    </div>
  );
}
