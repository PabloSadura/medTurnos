import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock, Plus, Filter, User, MoreVertical, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, getDocs, increment, writeBatch, getDoc } from 'firebase/firestore';
import { useToast } from '../components/Toast';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function Agenda() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [workingHours, setWorkingHours] = useState<any>(null);
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Fetch Working Hours
    getDoc(doc(db, 'users', userId)).then(docSnap => {
      if (docSnap.exists() && docSnap.data().schedule) {
        setWorkingHours(docSnap.data().schedule);
      }
    });
    if (!isNewAppointmentOpen) {
      setIsCreatingNewPatient(false);
      setNewPatientData({ name: '', phone: '', idNumber: '', birthDate: '' });
      setSearchTerm('');
    }
  }, [isNewAppointmentOpen]);

  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreatingNewPatient, setIsCreatingNewPatient] = useState(false);
  const [selectedPatientStats, setSelectedPatientStats] = useState<{ attendance: number, absences: number } | null>(null);

  const [newPatientData, setNewPatientData] = useState({
    name: '',
    phone: '',
    idNumber: '',
    birthDate: ''
  });
  
  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [newApt, setNewApt] = useState({
    patientId: '',
    patientName: '',
    date: formatLocalDate(new Date()),
    time: '09:00',
    type: 'Check-up General',
    notes: ''
  });

  useEffect(() => {
    if (newApt.patientId && !isCreatingNewPatient) {
      // Fetch stats for this specific patient (only current user's)
      const appQ = query(
        collection(db, 'appointments'), 
        where('patientId', '==', newApt.patientId),
        where('userId', '==', auth.currentUser?.uid)
      );
      getDocs(appQ).then(snapshot => {
        const apps = snapshot.docs.map(doc => doc.data());
        const finishedCount = apps.filter(a => a.status === 'finished').length;
        const absencesCount = apps.filter(a => a.status === 'cancelado' || a.status === 'ausente').length;
        const total = finishedCount + absencesCount;
        
        setSelectedPatientStats({
          attendance: total > 0 ? Math.round((finishedCount / total) * 100) : 100,
          absences: absencesCount
        });
      });
    } else {
      setSelectedPatientStats(null);
    }
  }, [newApt.patientId, isCreatingNewPatient]);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Only subscribe to appointments for the current month and the selected date's surrounding
    const q = query(
      collection(db, 'appointments'),
      where('userId', '==', userId)
    );
    
    // Using a broader query for the month view but real-time
    const unsubscribeApps = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      // Client-side sort by date and time to avoid composite index requirement
      docs.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        return (a.time || '').localeCompare(b.time || '');
      });
      setAppointments(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    const treatmentsQ = query(
      collection(db, 'treatments'), 
      where('userId', '==', userId)
    );
    const unsubscribeTreatments = onSnapshot(treatmentsQ, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTreatments(docs.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treatments'));

    const patientsQ = query(collection(db, 'patients'), where('userId', '==', userId));
    const unsubscribePatients = onSnapshot(patientsQ, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(docs.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    return () => {
      unsubscribeApps();
      unsubscribeTreatments();
      unsubscribePatients();
    };
  }, [auth.currentUser?.uid]);

  // Removed redundant fetchPatients as it's now real-time in the main useEffect

  const handleAppointmentClick = (apt: any) => {
    setSelectedAppointment(apt);
    setIsDetailModalOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let patientId = newApt.patientId;
      let patientName = newApt.patientName;

      if (isCreatingNewPatient) {
        const patientRef = await addDoc(collection(db, 'patients'), {
          name: newPatientData.name,
          phone: newPatientData.phone,
          idNumber: newPatientData.idNumber,
          birthDate: newPatientData.birthDate || '',
          userId: auth.currentUser?.uid,
          status: 'active',
          lastVisit: '-',
          createdAt: serverTimestamp()
        });
        patientId = patientRef.id;
        patientName = newPatientData.name;
      }

      const patient = isCreatingNewPatient ? { id: patientId, name: patientName } : patients.find(p => p.id === patientId);
      if (!patient) return;

      // Calculate attendance count
      const q = query(
        collection(db, 'appointments'), 
        where('patientId', '==', patientId),
        where('userId', '==', auth.currentUser?.uid)
      );
      const snapshot = await getDocs(q);
      const attendanceCount = snapshot.size + 1;

      const [year, month, day] = newApt.date.split('-').map(Number);
      const [hours, minutes] = newApt.time.split(':').map(Number);
      const appointmentDate = new Date(year, month - 1, day, hours, minutes);

      // Validate working hours
      if (workingHours) {
        const standardDay = appointmentDate.getDay(); // 0 is Sun, 1 is Mon...
        const mappedDay = standardDay === 0 ? 7 : standardDay; // 1-7
        
        const workingDays = workingHours.workingDays || workingHours.days || [];
        if (!workingDays.includes(mappedDay)) {
          showToast('El profesional no atiende los días ' + days[mappedDay - 1] + '.', 'error');
          return;
        }

        const timeString = newApt.time; // "HH:mm"
        const isMorning = workingHours.morningActive !== false && timeString >= workingHours.morningStart && timeString <= workingHours.morningEnd;
        const isAfternoon = workingHours.afternoonActive !== false && timeString >= workingHours.afternoonStart && timeString <= workingHours.afternoonEnd;

        if (!isMorning && !isAfternoon) {
          let errorMsg = `La hora seleccionada (${timeString}) no coincide con los horarios de atención activos:`;
          if (workingHours.morningActive !== false) errorMsg += `\nMañana: ${workingHours.morningStart} - ${workingHours.morningEnd}`;
          if (workingHours.afternoonActive !== false) errorMsg += `\nTarde: ${workingHours.afternoonStart} - ${workingHours.afternoonEnd}`;
          if (workingHours.morningActive === false && workingHours.afternoonActive === false) errorMsg = "El profesional no tiene turnos activos configurados.";
          
          showToast(errorMsg, 'error');
          return;
        }
      }

      await addDoc(collection(db, 'appointments'), {
        ...newApt,
        patientId,
        patientName,
        userId: auth.currentUser?.uid,
        status: 'pendiente',
        duration: 30, // Default duration
        attendance: attendanceCount,
        startTime: appointmentDate, // Save as JS Date, Firestore converts to Timestamp
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setIsNewAppointmentOpen(false);
      setIsCreatingNewPatient(false);
      setNewPatientData({ name: '', phone: '', idNumber: '', birthDate: '' });
      setNewApt({ ...newApt, patientId: '', patientName: '', notes: '' });
      setSearchTerm('');
      showToast('Turno agendado correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appointments');
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedAppointment) return;
    try {
      const batch = writeBatch(db);

      // Impact logic: If changing to 'finished', deduct materials from stocks
      if (status === 'finished' && selectedAppointment.status !== 'finished') {
        const treatment = treatments.find(t => t.name === selectedAppointment.type);
        if (treatment && treatment.materials && treatment.materials.length > 0) {
          for (const item of treatment.materials) {
            const stockRef = doc(db, 'stocks', item.materialId);
            batch.update(stockRef, {
              stock: increment(-item.qty),
              updatedAt: serverTimestamp()
            });

            // Record movement
            const movementRef = doc(collection(db, `stocks/${item.materialId}/movements`));
            batch.set(movementRef, {
              type: 'out',
              quantity: item.qty,
              reason: `Consumido en: ${selectedAppointment.type} para ${selectedAppointment.patientName}`,
              date: serverTimestamp(),
              userId: auth.currentUser?.uid
            });
          }
        }
        
        // Update patient's last visit date
        const patientRef = doc(db, 'patients', selectedAppointment.patientId);
        batch.set(patientRef, {
          lastVisit: selectedAppointment.date,
          updatedAt: serverTimestamp(),
          userId: auth.currentUser?.uid // Ensure it has a userId if it's created newly
        }, { merge: true });
      }

      batch.update(doc(db, 'appointments', selectedAppointment.id), {
        status,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      setIsDetailModalOpen(false);
      showToast('Estado actualizado correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${selectedAppointment.id}`);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.idNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    // Shift firstDay to start from Monday (0: Lun, 1: Mar, ..., 6: Dom)
    const buffer = firstDay === 0 ? 6 : firstDay - 1;
    
    // Previous month buffering
    for (let i = buffer - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, month: 'prev', date: new Date(year, month - 1, prevMonthDays - i) });
    }
    
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, month: 'current', date: new Date(year, month, i) });
    }
    
    // Next month buffering
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, month: 'next', date: new Date(year, month + 1, i) });
    }
    
    return days;
  };

  const selectedDateAppointments = appointments.filter(a => a.date === formatLocalDate(selectedDate));

  const changeMonth = (offset: number) => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    setViewDate(next);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date) => {
    return date.getDate() === selectedDate.getDate() && 
           date.getMonth() === selectedDate.getMonth() && 
           date.getFullYear() === selectedDate.getFullYear();
  };

  const getHours = () => {
    if (!workingHours) return Array.from({ length: 14 }, (_, i) => i + 8);
    
    const mStart = parseInt(workingHours.morningStart.split(':')[0]);
    const aEnd = parseInt(workingHours.afternoonEnd.split(':')[0]);
    
    const start = Math.max(0, mStart - 1);
    const end = Math.min(23, aEnd + 1);
    
    return Array.from({ length: end - start + 1 }, (_, i) => i + start);
  };

  const hours = getHours();
  const startHour = hours[0];

  const getWeekDays = () => {
    const current = new Date(selectedDate);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(current.setDate(diff));
    
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 px-1">
        <div>
          <h1 className="headline-lg text-on-surface">Agenda & Calendario</h1>
          <p className="body-md text-on-surface-variant">Gestione sus horarios y reservas de pacientes.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-white/50 p-1 rounded-lg border border-outline-variant shadow-sm">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all",
                  view === v ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface"
                )}
              >
                {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsNewAppointmentOpen(true)}
            className="px-4 py-2 bg-primary text-white rounded-lg text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider"
          >
            <Plus size={16} />
            Nuevo Turno
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        {/* Main Calendar View */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-outline-variant shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 md:p-6 border-b border-outline-variant flex flex-col md:flex-row items-center justify-between gap-4 bg-surface-bright">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-on-surface capitalize">
                {view === 'month' 
                  ? new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(viewDate)
                  : view === 'week'
                  ? `Semana del ${getWeekDays()[0].getDate()} de ${new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(getWeekDays()[0])}`
                  : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(selectedDate)
                }
              </h2>
              <div className="flex items-center gap-1 bg-surface border border-outline-variant rounded-lg p-1">
                <button 
                  onClick={() => {
                    if (view === 'month') changeMonth(-1);
                    else if (view === 'week') {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() - 7);
                      setSelectedDate(d);
                    } else {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() - 1);
                      setSelectedDate(d);
                    }
                  }}
                  className="p-1.5 hover:bg-white rounded transition-colors text-on-surface-variant"
                >
                  <ChevronLeft size={18} />
                </button>
                <button 
                  onClick={() => {
                    const now = new Date();
                    setViewDate(now);
                    setSelectedDate(now);
                  }}
                  className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-white rounded"
                >
                  Hoy
                </button>
                <button 
                  onClick={() => {
                    if (view === 'month') changeMonth(1);
                    else if (view === 'week') {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() + 7);
                      setSelectedDate(d);
                    } else {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() + 1);
                      setSelectedDate(d);
                    }
                  }}
                  className="p-1.5 hover:bg-white rounded transition-colors text-on-surface-variant"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="sm:hidden flex items-center gap-2 bg-surface border border-outline-variant rounded-lg p-1">
              {(['day', 'week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest whitespace-nowrap",
                    view === v ? "bg-primary text-white" : "text-on-surface-variant"
                  )}
                >
                  {v === 'day' ? 'D' : v === 'week' ? 'S' : 'M'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-surface-dim">
            {view === 'month' && (
              <div className="grid grid-cols-7 grid-rows-[40px_1fr] h-full min-w-[700px]">
                {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((d) => (
                  <div key={d} className="flex items-center justify-center text-[11px] font-black uppercase tracking-widest text-on-surface-variant border-b border-r border-outline-variant last:border-r-0 bg-surface">
                    {d}
                  </div>
                ))}
                {getCalendarDays().map((item, idx) => {
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(item.date);
                        if (item.month !== 'current') setViewDate(item.date);
                      }}
                        className={cn(
                          "flex flex-col items-start p-3 border-b border-r border-outline-variant last:border-r-0 transition-all group relative min-h-[100px]",
                          item.month === 'current' ? "bg-white" : "bg-surface-dim opacity-40",
                          workingHours && item.month === 'current' && !(workingHours.workingDays || workingHours.days || []).includes(item.date.getDay() === 0 ? 7 : item.date.getDay()) && "bg-surface-bright opacity-60 grayscale-[0.5]",
                          isSelected(item.date) && "bg-primary-container ring-1 ring-inset ring-primary z-10",
                          !isSelected(item.date) && "hover:bg-surface"
                        )}
                    >
                      <span className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-bold transition-all mb-2",
                        isToday(item.date) && !isSelected(item.date) ? "bg-primary text-white" : 
                        isSelected(item.date) ? "text-primary scale-110" : "text-on-surface"
                      )}>
                        {item.day}
                      </span>
                      <div className="w-full space-y-1">
                        {appointments
                          .filter(a => a.date === formatLocalDate(item.date))
                          .slice(0, 3)
                          .map((apt) => (
                            <div 
                              key={apt.id} 
                              className={cn(
                                "w-full px-1.5 py-0.5 rounded text-[10px] font-bold truncate border flex items-center gap-1",
                                apt.status === 'pendiente' ? "bg-amber-100/50 text-amber-700 border-amber-200" :
                                apt.status === 'confirmed' ? "bg-primary-container/30 text-primary border-primary/20" :
                                apt.status === 'in-session' ? "bg-tertiary-container/30 text-tertiary border-tertiary/20" :
                                apt.status === 'finished' ? "bg-secondary-container/30 text-secondary border-secondary/20" :
                                "bg-surface-dim text-on-surface-variant border-outline-variant"
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current" />
                              {apt.patientName}
                            </div>
                          ))
                        }
                        {appointments.filter(a => a.date === formatLocalDate(item.date)).length > 3 && (
                          <div className="text-[10px] font-black text-on-surface-variant/50 px-1">
                            + {appointments.filter(a => a.date === formatLocalDate(item.date)).length - 3} más
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {view === 'week' && (
              <div className="grid grid-cols-[60px_1fr] h-full min-w-[1000px]">
                <div className="bg-surface border-r border-outline-variant flex flex-col">
                  <div className="h-[50px] border-b border-outline-variant"></div>
                  {hours.map(hour => (
                    <div key={hour} className="h-[60px] flex items-center justify-center border-b border-outline-variant border-dashed">
                      <span className="text-[11px] font-bold text-on-surface-variant">{hour}:00</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 h-full">
                  {getWeekDays().map((dayDate, i) => (
                    <div key={i} className="flex flex-col border-r border-outline-variant last:border-r-0">
                      <div className={cn(
                        "h-[50px] flex flex-col items-center justify-center border-b border-outline-variant",
                        isToday(dayDate) ? "bg-primary/5" : "bg-surface"
                      )}>
                        <span className="text-[10px] font-black uppercase text-on-surface-variant tracking-tighter">{days[i]}</span>
                        <span className={cn(
                          "text-[14px] font-black",
                          isToday(dayDate) ? "text-primary" : "text-on-surface"
                        )}>{dayDate.getDate()}</span>
                      </div>
                      <div className="flex-1 relative bg-white">
                        {hours.map(hour => (
                          <div key={hour} className="h-[60px] border-b border-outline-variant border-dashed opacity-20"></div>
                        ))}
                        {appointments
                          .filter(a => a.date === formatLocalDate(dayDate))
                          .map((apt) => {
                            const [h, m] = apt.time.split(':').map(Number);
                            if (h < startHour || h > hours[hours.length - 1]) return null;
                            return (
                              <div
                                key={apt.id}
                                onClick={() => handleAppointmentClick(apt)}
                                className={cn(
                                  "absolute left-1 right-1 p-2 rounded-lg border-l-4 shadow-sm cursor-pointer z-10 transition-all hover:scale-[1.02] overflow-hidden",
                                  apt.status === 'pendiente' ? "bg-amber-50 border-amber-400 text-amber-700" :
                                  apt.status === 'confirmed' ? "bg-primary-container/20 border-primary text-primary" : 
                                  apt.status === 'in-session' ? "bg-tertiary-container/20 border-tertiary text-tertiary" : 
                                  apt.status === 'finished' ? "bg-secondary-container/20 border-secondary text-secondary" :
                                  "bg-surface border-outline-variant text-on-surface-variant opacity-80"
                                )}
                                style={{
                                  top: `${((h - startHour) * 60 + m)}px`,
                                  height: `${(apt.duration || 30) - 2}px`
                                }}
                              >
                                <p className="text-[11px] font-black truncate">{apt.patientName}</p>
                                <p className="text-[9px] font-bold opacity-70 uppercase truncate">{apt.time}</p>
                              </div>
                            );
                          })
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'day' && (
              <div className="grid grid-cols-[80px_1fr] h-full min-w-[600px] bg-white">
                <div className="bg-surface border-r border-outline-variant">
                  {hours.map(hour => (
                    <div key={hour} className="h-[100px] flex items-start justify-center pt-4 border-b border-outline-variant border-dashed">
                      <span className="text-[12px] font-black text-on-surface-variant tracking-wider">{hour}:00</span>
                    </div>
                  ))}
                </div>
                <div className="relative">
                  {hours.map(hour => (
                    <div key={hour} className="h-[100px] border-b border-outline-variant border-dashed opacity-30"></div>
                  ))}
                  {selectedDateAppointments.map((apt) => {
                    const [h, m] = apt.time.split(':').map(Number);
                    if (h < startHour || h > hours[hours.length - 1]) return null;
                    return (
                      <motion.div
                        key={apt.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => handleAppointmentClick(apt)}
                        className={cn(
                          "absolute left-4 right-8 p-4 rounded-xl border-l-[6px] shadow-md cursor-pointer z-10 flex flex-col justify-center gap-1 transition-all hover:translate-x-1",
                          apt.status === 'pendiente' ? "bg-amber-50 border-amber-400 text-amber-700 shadow-amber-950/5" :
                          apt.status === 'confirmed' ? "bg-primary-container/30 border-primary text-primary" : 
                          apt.status === 'in-session' ? "bg-tertiary-container/30 border-tertiary text-tertiary shadow-tertiary/10" : 
                          apt.status === 'finished' ? "bg-secondary-container/30 border-secondary text-secondary" :
                          "bg-surface border-outline-variant text-on-surface-variant opacity-80"
                        )}
                        style={{
                          top: `${((h - startHour) * 100 + (m / 60) * 100)}px`,
                          height: `${((apt.duration || 30) / 60) * 100 - 4}px`
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase tracking-widest opacity-60">{apt.time} - {apt.type}</span>
                          <span className="text-[10px] font-black bg-white/50 px-2 py-0.5 rounded capitalize">{apt.status}</span>
                        </div>
                        <h4 className="text-[16px] font-black tracking-tight">{apt.patientName}</h4>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Day View */}
        <div className="hidden lg:flex bg-white rounded-2xl border border-outline-variant shadow-sm flex-col overflow-hidden max-h-full">
          <div className="p-6 border-b border-outline-variant bg-surface-bright shrink-0">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-1">Agenda del día</p>
            <h3 className="text-sm font-bold text-on-surface capitalize">
              {new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(selectedDate)}
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
            {selectedDateAppointments.length > 0 ? (
              selectedDateAppointments.map((apt) => (
                <motion.div
                  key={apt.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleAppointmentClick(apt)}
                  className={cn(
                    "p-4 rounded-xl border border-outline-variant shadow-none hover:shadow-md transition-all cursor-pointer group relative overflow-hidden",
                    apt.status === 'pendiente' ? "hover:border-amber-400 bg-amber-50/30" :
                    apt.status === 'confirmed' ? "hover:border-primary/40" :
                    apt.status === 'in-session' ? "hover:border-tertiary/40 bg-tertiary-container/10" :
                    apt.status === 'finished' ? "hover:border-secondary/40 opacity-70" : "opacity-50"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[13px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                      {apt.time}
                    </span>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      apt.status === 'pendiente' ? "bg-amber-500" :
                      apt.status === 'confirmed' ? "bg-primary" :
                      apt.status === 'in-session' ? "bg-tertiary" :
                      apt.status === 'finished' ? "bg-secondary" : "bg-on-surface-variant"
                    )} />
                  </div>
                  <h4 className="text-[14px] font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">{apt.patientName}</h4>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-on-surface-variant uppercase tracking-tighter">
                    <span className="truncate">{apt.type}</span>
                    <span className="shrink-0">•</span>
                    <span className="shrink-0">30m</span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-30 py-20 text-center">
                <Calendar size={48} className="mb-4 text-on-surface-variant" />
                <p className="text-[11px] font-black uppercase tracking-widest leading-loose">
                  No hay turnos agendados<br />para este día
                </p>
                <button 
                  onClick={() => setIsNewAppointmentOpen(true)}
                  className="mt-6 text-[10px] font-black text-primary uppercase underline tracking-widest"
                >
                  Agendar Primero
                </button>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-outline-variant bg-surface-dim shrink-0">
            <button 
              onClick={() => setIsNewAppointmentOpen(true)}
              className="w-full py-3 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all"
            >
              <Clock size={16} />
              NUEVO TURNO
            </button>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isNewAppointmentOpen} 
        onClose={() => setIsNewAppointmentOpen(false)} 
        title="Agendar Nuevo Turno"
      >
        <form className="space-y-4" onSubmit={handleSaveAppointment}>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Paciente</label>
              <button 
                type="button"
                onClick={() => setIsCreatingNewPatient(!isCreatingNewPatient)}
                className="text-[10px] text-primary font-bold uppercase underline tracking-tighter"
              >
                {isCreatingNewPatient ? 'Buscar Existente' : 'Nuevo Paciente'}
              </button>
            </div>
            
            {isCreatingNewPatient ? (
              <div className="space-y-3 bg-surface p-3 rounded-lg border border-outline-variant">
                <input 
                  type="text" 
                  placeholder="Nombre completo"
                  required
                  value={newPatientData.name}
                  onChange={(e) => setNewPatientData({ ...newPatientData, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded text-[13px] outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="text" 
                    placeholder="Teléfono"
                    value={newPatientData.phone}
                    onChange={(e) => setNewPatientData({ ...newPatientData, phone: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded text-[13px] outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input 
                    type="text" 
                    placeholder="DNI/ID"
                    value={newPatientData.idNumber}
                    onChange={(e) => setNewPatientData({ ...newPatientData, idNumber: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded text-[13px] outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase ml-1">Fecha Nacimiento</label>
                  <input 
                    type="date" 
                    value={newPatientData.birthDate}
                    onChange={(e) => setNewPatientData({ ...newPatientData, birthDate: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded text-[13px] outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input 
                  type="text" 
                  placeholder="Buscar paciente por nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]"
                />
                {searchTerm && !newApt.patientId && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-white border border-outline-variant rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                    {filteredPatients.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setNewApt({ ...newApt, patientId: p.id, patientName: p.name });
                          setSearchTerm(p.name);
                        }}
                        className="w-full px-4 py-2 text-left text-[12px] hover:bg-surface transition-colors border-b last:border-0 border-outline-variant"
                      >
                        {p.name} ({p.idNumber})
                      </button>
                    ))}
                    {filteredPatients.length === 0 && (
                      <div className="p-4 text-center">
                        <p className="text-[11px] text-on-surface-variant mb-2">No se encontró el paciente</p>
                        <button 
                          type="button"
                          onClick={() => {
                            setIsCreatingNewPatient(true);
                            setNewPatientData({ ...newPatientData, name: searchTerm });
                          }}
                          className="text-[11px] text-primary font-bold underline uppercase"
                        >
                          Crear "{searchTerm}"
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {!isCreatingNewPatient && newApt.patientId && selectedPatientStats && (
              <div className={cn(
                "mt-2 p-2 rounded-lg border flex items-center gap-3 animate-in fade-in slide-in-from-top-1",
                selectedPatientStats.attendance < 80 || selectedPatientStats.absences >= 2 
                  ? "bg-error-container/30 border-error/20" 
                  : "bg-surface-bright border-outline-variant"
              )}>
                <div className={cn(
                  "p-1.5 rounded-full",
                  selectedPatientStats.attendance < 80 || selectedPatientStats.absences >= 2 ? "bg-error text-white" : "bg-tertiary text-white"
                )}>
                  {selectedPatientStats.attendance < 80 || selectedPatientStats.absences >= 2 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Estado de Asistencia</p>
                  <p className={cn(
                    "text-[12px] font-bold",
                    selectedPatientStats.attendance < 80 || selectedPatientStats.absences >= 2 ? "text-error" : "text-tertiary"
                  )}>
                    {selectedPatientStats.attendance}% Asistencia • {selectedPatientStats.absences} Ausencias
                    {selectedPatientStats.attendance < 80 && " • Baja probabilidad de asistencia"}
                  </p>
                </div>
              </div>
            )}
            {!isCreatingNewPatient && <input type="hidden" required value={newApt.patientId} />}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</label>
              <input 
                type="date" 
                required
                className={cn(
                  "w-full px-3 py-2 bg-surface border rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]",
                  workingHours && newApt.date && !(workingHours.workingDays || workingHours.days || []).includes(new Date(newApt.date + 'T00:00:00').getDay() === 0 ? 7 : new Date(newApt.date + 'T00:00:00').getDay()) 
                    ? "border-error focus:ring-error/20" 
                    : "border-outline-variant"
                )}
                value={newApt.date}
                onChange={(e) => setNewApt({ ...newApt, date: e.target.value })}
              />
              {workingHours && newApt.date && !(workingHours.workingDays || workingHours.days || []).includes(new Date(newApt.date + 'T00:00:00').getDay() === 0 ? 7 : new Date(newApt.date + 'T00:00:00').getDay()) && (
                <p className="text-[9px] text-error font-bold flex items-center gap-1">
                  <AlertTriangle size={10} /> No laborable
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Hora</label>
              <input 
                type="time" 
                required
                className={cn(
                  "w-full px-3 py-2 bg-surface border rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]",
                  workingHours && newApt.time && !(
                    (workingHours.morningActive !== false && newApt.time >= workingHours.morningStart && newApt.time <= workingHours.morningEnd) ||
                    (workingHours.afternoonActive !== false && newApt.time >= workingHours.afternoonStart && newApt.time <= workingHours.afternoonEnd)
                  )
                    ? "border-error focus:ring-error/20" 
                    : "border-outline-variant"
                )}
                value={newApt.time}
                onChange={(e) => setNewApt({ ...newApt, time: e.target.value })}
              />
              {workingHours && (
                <div className="text-[8px] text-on-surface-variant flex flex-col gap-0.5 mt-1 opacity-70">
                  {workingHours.morningActive !== false && <span className="flex items-center gap-1"><Clock size={8} /> Mañana: {workingHours.morningStart} - {workingHours.morningEnd}</span>}
                  {workingHours.afternoonActive !== false && <span className="flex items-center gap-1"><Clock size={8} /> Tarde: {workingHours.afternoonStart} - {workingHours.afternoonEnd}</span>}
                  {workingHours.morningActive === false && workingHours.afternoonActive === false && <span className="text-error">Sin turnos activos</span>}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Tratamiento</label>
            <select 
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]"
              value={newApt.type}
              onChange={(e) => setNewApt({ ...newApt, type: e.target.value })}
            >
              <option value="">Seleccione...</option>
              {treatments.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Notas</label>
            <textarea 
              rows={3}
              placeholder="Agregar observaciones..."
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px] resize-none"
              value={newApt.notes}
              onChange={(e) => setNewApt({ ...newApt, notes: e.target.value })}
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={() => setIsNewAppointmentOpen(false)}
              className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors"
            >
              CANCELAR
            </button>
            <button 
              type="submit"
              disabled={!isCreatingNewPatient && !newApt.patientId}
              className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors disabled:opacity-50"
            >
              GUARDAR TURNO
            </button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        title="Detalles del Turno"
      >
        {selectedAppointment && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-surface-bright rounded-xl border border-outline-variant">
              <div className="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center text-lg font-bold">
                {selectedAppointment.patientName.charAt(0)}
              </div>
              <div>
                <h4 className="text-sm font-bold text-on-surface">{selectedAppointment.patientName}</h4>
                <p className="text-[11px] text-on-surface-variant tracking-wide uppercase font-bold">
                  {selectedAppointment.time} • {selectedAppointment.duration} min
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-surface rounded-xl border border-outline-variant">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Tratamiento</p>
                <p className="text-[13px] font-bold text-on-surface">{selectedAppointment.type}</p>
              </div>
              <div className="p-3 bg-surface rounded-xl border border-outline-variant">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Asistencias</p>
                <p className="text-[13px] font-bold text-on-surface">
                  {selectedAppointment.attendance === 1 ? 'Primera vez' : `${selectedAppointment.attendance} visitas anteriores`}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Cambiar Estado</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'pendiente', label: 'Pendiente', color: 'bg-amber-500' },
                  { id: 'confirmed', label: 'Confirmado', color: 'bg-primary' },
                  { id: 'in-session', label: 'En Sesión', color: 'bg-tertiary' },
                  { id: 'finished', label: 'Finalizado', color: 'bg-secondary' },
                  { id: 'cancelado', label: 'Cancelado', color: 'bg-error' },
                  { id: 'ausente', label: 'Ausente', color: 'bg-error-container' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleUpdateStatus(s.id)}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                      selectedAppointment.status === s.id 
                        ? `${s.color} text-white border-transparent shadow-sm` 
                        : "bg-white border-outline-variant text-on-surface-variant hover:bg-surface"
                    )}
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full", selectedAppointment.status === s.id ? "bg-white" : s.color)} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button 
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest"
              >
                Cerrar
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (selectedAppointment?.patientId) {
                    navigate(`/patients?id=${selectedAppointment.patientId}`);
                  }
                  setIsDetailModalOpen(false);
                }}
                className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-widest"
              >
                Ver Ficha
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
