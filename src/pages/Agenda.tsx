import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock, Plus, Filter, User, MoreVertical, Search, CheckCircle2, AlertTriangle, Edit2, CalendarClock, Stethoscope, Package, Sparkles, Phone, MessageCircle, Zap, X, Download, Lock, Unlock, Trash2, Ban } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { ClinicalHistoryModal } from '../components/ClinicalHistoryModal';
import { ReminderModal } from '../components/ReminderModal';
import { ExportDayAgendaModal } from '../components/ExportDayAgendaModal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where, getDocs, increment, writeBatch, getDoc } from 'firebase/firestore';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { consumePackageSession } from '../lib/packageUtils';
import { PatientPackage } from '../types';
import { splitFullName, getPatientFirstName, formatPatientFullName, comparePatientsByLastName, formatPatientLastNameFirst, getPatientLastName } from '../lib/patientNameUtils';
import { PhoneInputArgentina } from '../components/PhoneInputArgentina';
import { formatArgentinePhoneWithPrefix } from '../lib/phoneUtils';
import { 
  calculateEndTime, 
  checkScheduleCollision, 
  checkIsOutsideWorkingHours, 
  minutesToTime, 
  timeToMinutes,
  getDayOccupiedSlots,
  getSuggestedAvailableSlots,
  getEffectiveDuration,
  computeOverlappingLayout,
  getAppointmentStatusStyles,
  compareAppointments,
  DayOccupiedSlot
} from '../lib/agendaUtils';
import { saveAppointmentWithPersistenceCheck } from '../lib/appointmentService';
import { SuggestedSlotsPicker } from '../components/SuggestedSlotsPicker';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function Agenda() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { ownerId, profile, user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [workingHours, setWorkingHours] = useState<any>(null);
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [isExportDayModalOpen, setIsExportDayModalOpen] = useState(false);

  // La agenda profesional siempre debe iniciarse en vista mes
  useEffect(() => {
    setView('month');
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;

    // Subscribe to Working Hours in real-time from profile (Días y horarios)
    const unsubscribeSchedule = onSnapshot(doc(db, 'users', ownerId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().schedule) {
        const sched = docSnap.data().schedule;
        setWorkingHours(sched);
        if (sched.appointmentDurationMinutes && Number(sched.appointmentDurationMinutes) > 0) {
          const profMin = Number(sched.appointmentDurationMinutes);
          setNewApt(prev => ({
            ...prev,
            duration: (!prev.duration || prev.duration === 30) ? profMin : prev.duration
          }));
        }
      }
    });

    return () => unsubscribeSchedule();
  }, [ownerId]);

  useEffect(() => {
    if (!isNewAppointmentOpen) {
      setIsCreatingNewPatient(false);
      setNewPatientData({ firstName: '', lastName: '', name: '', phone: '', idNumber: '', birthDate: '' });
      setSearchTerm('');
    }
  }, [isNewAppointmentOpen]);

  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [reminderModalApt, setReminderModalApt] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isBlockingAgenda, setIsBlockingAgenda] = useState(false);
  const [blockData, setBlockData] = useState<{
    id?: string;
    date: string;
    time: string;
    duration: number;
    isAllDay: boolean;
    reason: string;
    notes: string;
  }>({
    date: formatLocalDate(new Date()),
    time: '09:00',
    duration: 60,
    isAllDay: false,
    reason: 'Almuerzo / Descanso',
    notes: ''
  });
  const [isClinicalHistoryOpen, setIsClinicalHistoryOpen] = useState(false);
  const [clinicalHistoryAppointment, setClinicalHistoryAppointment] = useState<any>(null);
  const [clinicalHistoryPatient, setClinicalHistoryPatient] = useState<any>(null);
  const [editAptData, setEditAptData] = useState<{
    id: string;
    patientId: string;
    patientName: string;
    date: string;
    time: string;
    type: string;
    notes: string;
    duration?: number;
    isOverturn?: boolean;
    manualOverturn?: boolean;
    status?: string;
  }>({
    id: '',
    patientId: '',
    patientName: '',
    date: '',
    time: '09:00',
    type: 'Check-up General',
    notes: '',
    duration: 30,
    isOverturn: false,
    manualOverturn: false
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement>(null);
  const [isCreatingNewPatient, setIsCreatingNewPatient] = useState(false);
  const [selectedPatientStats, setSelectedPatientStats] = useState<{ attendance: number, absences: number } | null>(null);

  const [newPatientData, setNewPatientData] = useState({
    firstName: '',
    lastName: '',
    name: '',
    phone: '',
    idNumber: '',
    birthDate: ''
  });

  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);

  const [newApt, setNewApt] = useState<{
    patientId: string;
    patientName: string;
    patientFirstName?: string;
    patientLastName?: string;
    date: string;
    time: string;
    type: string;
    notes: string;
    duration?: number;
    isOverturn?: boolean;
    manualOverturn?: boolean;
    isPackageSession?: boolean;
    patientPackageId?: string;
    packageName?: string;
  }>({
    patientId: '',
    patientName: '',
    patientFirstName: '',
    patientLastName: '',
    date: formatLocalDate(new Date()),
    time: '09:00',
    type: 'Check-up General',
    notes: '',
    duration: 30,
    isOverturn: false,
    manualOverturn: false,
    isPackageSession: false,
    patientPackageId: '',
    packageName: ''
  });

  const [isSubmittingAppointment, setIsSubmittingAppointment] = useState(false);

  // Duration calculations - completely automatic based on selected treatment
  const effectiveNewAptDuration = useMemo(() => {
    const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
    return getEffectiveDuration(newApt.type, newApt.duration, treatments, profDefault);
  }, [newApt.type, newApt.duration, treatments, workingHours]);

  // Calculate outside working hours with duration awareness
  const newAptOutsideCheck = useMemo(() => {
    return checkIsOutsideWorkingHours(newApt.date, newApt.time, workingHours, effectiveNewAptDuration);
  }, [newApt.date, newApt.time, workingHours, effectiveNewAptDuration]);

  const newAptCollision = useMemo(() => {
    return checkScheduleCollision(newApt.date, newApt.time, effectiveNewAptDuration, appointments);
  }, [newApt.date, newApt.time, effectiveNewAptDuration, appointments]);

  const isNewAptOverturn = useMemo(() => {
    if (newApt.manualOverturn) return Boolean(newApt.isOverturn);
    return newAptCollision.hasConflict || Boolean(newApt.isOverturn);
  }, [newApt.manualOverturn, newApt.isOverturn, newAptCollision.hasConflict]);

  // Occupied slots and suggested available free slots for new appointment date
  const newAptOccupiedSlots = useMemo(() => {
    return getDayOccupiedSlots(newApt.date, appointments);
  }, [newApt.date, appointments]);

  const newAptSuggestedSlots = useMemo(() => {
    return getSuggestedAvailableSlots(newApt.date, effectiveNewAptDuration, appointments, workingHours);
  }, [newApt.date, effectiveNewAptDuration, appointments, workingHours]);

  // Duration calculations for edit appointment - completely automatic based on selected treatment
  const effectiveEditAptDuration = useMemo(() => {
    const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
    return getEffectiveDuration(editAptData.type, editAptData.duration, treatments, profDefault);
  }, [editAptData.type, editAptData.duration, treatments, workingHours]);

  // Calculate outside working hours with duration awareness for edited appointment
  const editAptOutsideCheck = useMemo(() => {
    return checkIsOutsideWorkingHours(editAptData.date, editAptData.time, workingHours, effectiveEditAptDuration);
  }, [editAptData.date, editAptData.time, workingHours, effectiveEditAptDuration]);

  const editAptCollision = useMemo(() => {
    return checkScheduleCollision(editAptData.date, editAptData.time, effectiveEditAptDuration, appointments, editAptData.id);
  }, [editAptData.date, editAptData.time, effectiveEditAptDuration, appointments, editAptData.id]);

  const isEditAptOverturn = useMemo(() => {
    if (editAptData.manualOverturn) return Boolean(editAptData.isOverturn);
    return editAptCollision.hasConflict || Boolean(editAptData.isOverturn);
  }, [editAptData.manualOverturn, editAptData.isOverturn, editAptCollision.hasConflict]);

  // Occupied slots and suggested available free slots for edit appointment date
  const editAptOccupiedSlots = useMemo(() => {
    return getDayOccupiedSlots(editAptData.date, appointments, editAptData.id);
  }, [editAptData.date, appointments, editAptData.id]);

  const editAptSuggestedSlots = useMemo(() => {
    return getSuggestedAvailableSlots(editAptData.date, effectiveEditAptDuration, appointments, workingHours, editAptData.id);
  }, [editAptData.date, effectiveEditAptDuration, appointments, workingHours, editAptData.id]);

  useEffect(() => {
    if (newApt.patientId && !isCreatingNewPatient) {
      // Fetch stats for this specific patient from loaded appointments
      const apps = appointments.filter(a => a.patientId === newApt.patientId);
      const finishedCount = apps.filter(a => a.status === 'finished').length;
      const absencesCount = apps.filter(a => a.status === 'cancelado' || a.status === 'ausente').length;
      const total = finishedCount + absencesCount;
      
      setSelectedPatientStats({
        attendance: total > 0 ? Math.round((finishedCount / total) * 100) : 100,
        absences: absencesCount
      });

      // Fetch active packages with available treatments for this patient
      if (ownerId) {
        const pkgQ = query(
          collection(db, 'patient_packages'),
          where('userId', '==', ownerId),
          where('patientId', '==', newApt.patientId)
        );
        getDocs(pkgQ).then((snap) => {
          const pkgs = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as PatientPackage))
            .filter(p => p.status === 'active');
          setPatientPackages(pkgs);
        }).catch((err) => {
          console.error('Error fetching patient packages in agenda:', err);
          setPatientPackages([]);
        });
      } else {
        setPatientPackages([]);
      }
    } else {
      setSelectedPatientStats(null);
      setPatientPackages([]);
    }
  }, [newApt.patientId, isCreatingNewPatient, appointments, ownerId]);

  // Click outside listener for patient search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientSearchRef.current && !patientSearchRef.current.contains(event.target as Node)) {
        setIsPatientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Helper to open new appointment with full clean state
  const handleOpenNewAppointment = (targetDate?: string, targetTime?: string) => {
    const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
    const matchedTreatment = treatments[0];
    const initialDuration = getEffectiveDuration(matchedTreatment, null, treatments, profDefault);
    const finalDate = targetDate || formatLocalDate(selectedDate || new Date());
    const availableSlots = getSuggestedAvailableSlots(finalDate, initialDuration, appointments, workingHours);

    const dayApps = appointments.filter(a => {
      if (!a || !a.date || a.date !== finalDate) return false;
      const st = (a.status || '').toLowerCase().trim();
      return st !== 'cancelado' && st !== 'cancelled' && st !== 'anulado' && st !== 'ausente';
    });
    const isFirstOfDate = dayApps.length === 0;

    const configuredStartTime = (workingHours?.morningActive !== false && workingHours?.morningStart)
      ? workingHours.morningStart
      : (workingHours?.afternoonStart || '08:00');

    let initialTime = targetTime;
    if (!initialTime) {
      if (isFirstOfDate) {
        // "Si es el primer turno, proponer siempre seguir el tiempo configurado"
        initialTime = configuredStartTime;
      } else {
        const freeSlot = availableSlots.find(s => !s.isConflict);
        initialTime = freeSlot ? freeSlot.time : (availableSlots.length > 0 ? availableSlots[0].time : configuredStartTime);
      }
    }

    setNewApt({
      patientId: '',
      patientName: '',
      patientFirstName: '',
      patientLastName: '',
      date: finalDate,
      time: initialTime,
      type: matchedTreatment?.name || 'Check-up General',
      notes: '',
      duration: initialDuration,
      isOverturn: false,
      manualOverturn: false,
      isPackageSession: false,
      patientPackageId: '',
      packageName: ''
    });
    setSearchTerm('');
    setIsCreatingNewPatient(false);
    setSelectedPatientStats(null);
    setPatientPackages([]);
    setIsPatientDropdownOpen(false);
    setIsBlockingAgenda(false);
    setIsNewAppointmentOpen(true);
  };

  const handleOpenBlockModal = (targetDate?: string, targetTime?: string, existingBlock?: any) => {
    const finalDate = targetDate || formatLocalDate(selectedDate || new Date());
    if (existingBlock) {
      setBlockData({
        id: existingBlock.id,
        date: existingBlock.date || finalDate,
        time: existingBlock.time || '09:00',
        duration: Number(existingBlock.duration) > 0 ? Number(existingBlock.duration) : 60,
        isAllDay: Boolean(existingBlock.isAllDayBlock),
        reason: existingBlock.blockReason || (existingBlock.patientName ? existingBlock.patientName.replace('[Bloqueado] ', '') : 'Almuerzo / Descanso'),
        notes: existingBlock.notes || ''
      });
    } else {
      const defaultTime = targetTime || (workingHours?.morningStart || '09:00');
      setBlockData({
        id: undefined,
        date: finalDate,
        time: defaultTime,
        duration: 60,
        isAllDay: false,
        reason: 'Almuerzo / Descanso',
        notes: ''
      });
    }
    setIsBlockModalOpen(true);
  };

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingAppointment) return;
    setIsSubmittingAppointment(true);
    try {
      let finalTime = blockData.time;
      let finalDuration = Number(blockData.duration) > 0 ? Number(blockData.duration) : 60;

      if (blockData.isAllDay) {
        finalTime = (workingHours?.morningActive !== false && workingHours?.morningStart) ? workingHours.morningStart : '08:00';
        const startMin = timeToMinutes(finalTime);
        const endMin = timeToMinutes((workingHours?.afternoonActive !== false && workingHours?.afternoonEnd) ? workingHours.afternoonEnd : '20:00');
        finalDuration = Math.max(600, endMin - startMin);
      }

      const reasonLabel = blockData.reason.trim() || 'Bloqueo de Agenda';

      await saveAppointmentWithPersistenceCheck({
        id: blockData.id,
        patientId: 'agenda_block',
        patientName: `[Bloqueado] ${reasonLabel}`,
        date: blockData.date,
        time: finalTime,
        duration: finalDuration,
        type: blockData.isAllDay ? 'Bloqueo Completo' : 'Bloqueo de Horario',
        treatment: 'Bloqueo de Agenda',
        notes: blockData.notes || '',
        status: 'bloqueado',
        cost: 0,
        price: 0,
        paidAmount: 0,
        userId: ownerId,
        isBlocked: true,
        blockReason: reasonLabel,
        isAllDayBlock: Boolean(blockData.isAllDay),
        workingHours
      }, Boolean(blockData.id));

      setIsBlockModalOpen(false);
      showToast(
        blockData.isAllDay
          ? `Agenda bloqueada para toda la jornada del ${blockData.date}.`
          : `Horario bloqueado (${finalTime} hs, ${finalDuration} min) en la agenda.`,
        'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appointments');
    } finally {
      setIsSubmittingAppointment(false);
    }
  };

  const handleUnblockAppointment = async (aptId: string) => {
    if (!aptId) return;
    try {
      await deleteDoc(doc(db, 'appointments', aptId));
      setIsDetailModalOpen(false);
      setIsBlockModalOpen(false);
      showToast('Horario desbloqueado exitosamente. La agenda vuelve a estar disponible.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `appointments/${aptId}`);
    }
  };

  useEffect(() => {
    if (!ownerId) return;

    // Only subscribe to appointments for the current month and the selected date's surrounding
    const q = query(
      collection(db, 'appointments'),
      where('userId', '==', ownerId)
    );
    
    // Using a broader query for the month view but real-time
    const unsubscribeApps = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      // Client-side sort: by date, active appointments first, cancelled appointments at the end, then by time
      docs.sort(compareAppointments);
      setAppointments(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    const treatmentsQ = query(
      collection(db, 'treatments'), 
      where('userId', '==', ownerId)
    );
    const unsubscribeTreatments = onSnapshot(treatmentsQ, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTreatments(docs.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treatments'));

    const patientsQ = query(collection(db, 'patients'), where('userId', '==', ownerId));
    const unsubscribePatients = onSnapshot(patientsQ, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(docs.sort(comparePatientsByLastName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    return () => {
      unsubscribeApps();
      unsubscribeTreatments();
      unsubscribePatients();
    };
  }, [ownerId]);

  // Removed redundant fetchPatients as it's now real-time in the main useEffect

  const handleAppointmentClick = (apt: any) => {
    setSelectedAppointment(apt);
    setIsDetailModalOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingAppointment) return;
    setIsSubmittingAppointment(true);
    try {
      if (isBlockingAgenda) {
        let finalTime = newApt.time;
        let finalDuration = Number(blockData.duration) > 0 ? Number(blockData.duration) : 60;

        if (blockData.isAllDay) {
          finalTime = (workingHours?.morningActive !== false && workingHours?.morningStart) ? workingHours.morningStart : '08:00';
          const startMin = timeToMinutes(finalTime);
          const endMin = timeToMinutes((workingHours?.afternoonActive !== false && workingHours?.afternoonEnd) ? workingHours.afternoonEnd : '20:00');
          finalDuration = Math.max(600, endMin - startMin);
        }

        const reasonLabel = blockData.reason.trim() || 'Bloqueo de Agenda';

        await saveAppointmentWithPersistenceCheck({
          patientId: 'agenda_block',
          patientName: `[Bloqueado] ${reasonLabel}`,
          date: newApt.date,
          time: finalTime,
          duration: finalDuration,
          type: blockData.isAllDay ? 'Bloqueo Completo' : 'Bloqueo de Horario',
          treatment: 'Bloqueo de Agenda',
          notes: newApt.notes || blockData.notes || '',
          status: 'bloqueado',
          cost: 0,
          price: 0,
          paidAmount: 0,
          userId: ownerId,
          isBlocked: true,
          blockReason: reasonLabel,
          isAllDayBlock: Boolean(blockData.isAllDay),
          workingHours
        }, false);

        setIsNewAppointmentOpen(false);
        setIsBlockingAgenda(false);
        showToast(
          blockData.isAllDay
            ? `Jornada del ${newApt.date} bloqueada exitosamente.`
            : `Horario bloqueado (${finalTime} hs, ${finalDuration} min) en la agenda.`,
          'success'
        );
        return;
      }

      let patientId = newApt.patientId;
      let patientName = newApt.patientName;
      let patientFirstName = newApt.patientFirstName || '';
      let patientLastName = newApt.patientLastName || '';

      if (isCreatingNewPatient) {
        const fn = newPatientData.firstName.trim();
        const ln = newPatientData.lastName.trim();
        if (!fn && !ln && !newPatientData.name.trim()) {
          showToast('Por favor ingrese el nombre del paciente a crear.', 'error');
          return;
        }
        const fullName = formatPatientFullName(fn, ln, newPatientData.name);

        const patientRef = await addDoc(collection(db, 'patients'), {
          firstName: fn,
          lastName: ln,
          name: fullName,
          phone: newPatientData.phone,
          idNumber: newPatientData.idNumber,
          birthDate: newPatientData.birthDate || '',
          userId: ownerId,
          status: 'active',
          lastVisit: '-',
          createdAt: serverTimestamp()
        });
        patientId = patientRef.id;
        patientName = fullName;
        patientFirstName = fn || getPatientFirstName(fullName);
        patientLastName = ln;
      } else {
        // If not creating new, check if patientId is selected or match via searchTerm
        if (!patientId) {
          const trimmedSearch = searchTerm.trim().toLowerCase();
          if (trimmedSearch) {
            const matched = patients.find(p => 
              p.name?.toLowerCase().trim() === trimmedSearch ||
              `${p.lastName || ''} ${p.firstName || ''}`.toLowerCase().trim() === trimmedSearch ||
              p.idNumber?.trim() === trimmedSearch
            );
            if (matched) {
              patientId = matched.id;
              patientName = matched.name;
              patientFirstName = matched.firstName || getPatientFirstName(matched.name);
              patientLastName = matched.lastName || '';
            }
          }
        }

        if (!patientId) {
          showToast('Por favor, selecciona un paciente de la lista o crea uno nuevo.', 'error');
          return;
        }
      }

      const patient = isCreatingNewPatient 
        ? { id: patientId, name: patientName, firstName: patientFirstName, lastName: patientLastName, phone: newPatientData.phone } 
        : patients.find(p => p.id === patientId);
      if (!patient) {
        showToast('Paciente no encontrado. Por favor, selecciona un paciente válido.', 'error');
        return;
      }

      if (!isCreatingNewPatient) {
        patientFirstName = patient.firstName || newApt.patientFirstName || getPatientFirstName(patient.name || patientName);
        patientLastName = patient.lastName || newApt.patientLastName || '';
      }

      // Calculate attendance count
      const attendanceCount = appointments.filter(a => a.patientId === patientId).length + 1;

      const [year, month, day] = newApt.date.split('-').map(Number);
      const [hours, minutes] = newApt.time.split(':').map(Number);
      const appointmentDate = new Date(year, month - 1, day, hours, minutes);

      const matchedTreatment = treatments.find(t => t.name === newApt.type);
      const finalDuration = effectiveNewAptDuration;

      const isPkg = Boolean(newApt.isPackageSession && newApt.patientPackageId);
      const treatmentPrice = isPkg ? 0 : (matchedTreatment?.cost ? Number(matchedTreatment.cost) : 0);
      const patientPhone = isCreatingNewPatient ? newPatientData.phone : (patient?.phone || '');

      const result = await saveAppointmentWithPersistenceCheck({
        ...newApt,
        patientId,
        patientName,
        patientFirstName,
        patientLastName,
        patientPhone,
        treatment: newApt.type,
        treatmentId: matchedTreatment?.id || '',
        cost: treatmentPrice,
        price: treatmentPrice,
        paidAmount: treatmentPrice,
        isPackageSession: isPkg,
        patientPackageId: isPkg ? newApt.patientPackageId : undefined,
        packageName: isPkg ? (newApt.packageName || undefined) : undefined,
        userId: ownerId,
        manualOverturn: Boolean(newApt.manualOverturn),
        status: 'pendiente',
        duration: finalDuration,
        attendance: attendanceCount,
        treatmentsList: treatments,
        workingHours
      }, false);

      setIsNewAppointmentOpen(false);
      setIsCreatingNewPatient(false);
      setNewPatientData({ firstName: '', lastName: '', name: '', phone: '', idNumber: '', birthDate: '' });
      setNewApt({ ...newApt, patientId: '', patientName: '', patientFirstName: '', patientLastName: '', notes: '', isPackageSession: false, patientPackageId: '', packageName: '', isOverturn: false, manualOverturn: false });
      setSearchTerm('');

      if (result.isOverturn) {
        showToast(
          result.conflictSummary 
            ? `⚡ Turno guardado como SOBRETURNO (solapamiento horario): ${result.conflictSummary}` 
            : '⚡ Turno guardado como SOBRETURNO por solapamiento',
          'success'
        );
      } else if (result.isOutsideWorkingHours) {
        showToast(`Turno agendado correctamente (Fuera del horario habitual: ${result.outsideHoursReason || 'excepción de horario'})`, 'success');
      } else {
        showToast('Turno agendado correctamente', 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appointments');
    } finally {
      setIsSubmittingAppointment(false);
    }
  };

  const handleOpenClinicalHistory = (apt: any) => {
    const targetPatientId = apt?.patientId || patients.find(p => p.name?.trim().toLowerCase() === apt?.patientName?.trim().toLowerCase())?.id;
    if (targetPatientId) {
      navigate(`/patients?id=${targetPatientId}&appointmentId=${apt.id}&action=add-entry`);
      return;
    }
    const patient = patients.find(p => p.id === apt.patientId) || {
      id: apt.patientId,
      name: apt.patientName,
      phone: apt.phone || '',
      idNumber: apt.idNumber || ''
    };
    setClinicalHistoryAppointment(apt);
    setClinicalHistoryPatient(patient);
    setIsClinicalHistoryOpen(true);
  };

  const getAppointmentPatientPhone = (apt: any) => {
    if (!apt) return '';
    const patient = patients.find(p => p.id === apt.patientId);
    return patient?.phone || apt.patientPhone || apt.phone || '';
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedAppointment) return;
    const isAlreadyFinished = selectedAppointment.status === 'finished' || selectedAppointment.status === 'finalizado';
    if (isAlreadyFinished) {
      showToast('El turno ya se encuentra finalizado. No se permite volver a un estado anterior.', 'warning');
      return;
    }
    try {
      // User request: When changing status to 'in-session', automatically redirect to patients opening a new entry in evolutions
      if (status === 'in-session') {
        await updateDoc(doc(db, 'appointments', selectedAppointment.id), {
          status: 'in-session',
          updatedAt: serverTimestamp()
        });

        setIsDetailModalOpen(false);

        const targetPatientId = selectedAppointment.patientId || patients.find(p => p.name?.trim().toLowerCase() === selectedAppointment.patientName?.trim().toLowerCase())?.id;
        if (targetPatientId) {
          navigate(`/patients?id=${targetPatientId}&appointmentId=${selectedAppointment.id}&action=add-entry`);
          showToast('Turno en sesión. Abriendo nueva evolución clínica...', 'success');
        } else {
          showToast('Turno puesto en sesión', 'success');
        }
        return;
      }

      const isPkg = Boolean(selectedAppointment.isPackageSession);

      // If changing to 'finished' and appointment is marked as package session, consume from package
      // (This atomically deducts the package session and its linked materials)
      if (status === 'finished' && selectedAppointment.status !== 'finished') {
        if (isPkg && selectedAppointment.patientPackageId && !selectedAppointment.packageDiscounted) {
          await consumePackageSession(
            db, 
            selectedAppointment.patientPackageId, 
            selectedAppointment.type || selectedAppointment.treatment,
            ownerId,
            selectedAppointment.patientName
          );
        }
      }

      const batch = writeBatch(db);

      // Impact logic: If changing to 'finished' for non-package appointments, deduct materials from stocks
      // (Package appointments have materials deducted by consumePackageSession above)
      if (status === 'finished' && selectedAppointment.status !== 'finished' && !isPkg) {
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
              userId: ownerId
            });
          }
        }
        
        // Update patient's last visit date
        const patientRef = doc(db, 'patients', selectedAppointment.patientId);
        batch.set(patientRef, {
          lastVisit: selectedAppointment.date,
          updatedAt: serverTimestamp(),
          userId: ownerId // Ensure it has a userId if it's created newly
        }, { merge: true });
      }

      const treatment = treatments.find(t => t.name === selectedAppointment.type);
      const historicalAmount = isPkg ? 0 : (
        (typeof selectedAppointment.paidAmount === 'number' && !isNaN(selectedAppointment.paidAmount))
          ? selectedAppointment.paidAmount
          : (typeof selectedAppointment.cost === 'number' && !isNaN(selectedAppointment.cost))
            ? selectedAppointment.cost
            : (typeof selectedAppointment.price === 'number' && !isNaN(selectedAppointment.price))
              ? selectedAppointment.price
              : (treatment?.cost ? Number(treatment.cost) : 0)
      );

      const updatePayload: any = {
        status,
        updatedAt: serverTimestamp()
      };

      if (status === 'finished') {
        updatePayload.cost = historicalAmount;
        updatePayload.price = historicalAmount;
        updatePayload.paidAmount = historicalAmount;
        if (isPkg) {
          updatePayload.packageDiscounted = true;
          updatePayload.isPackageSession = true;
        }
      }

      batch.update(doc(db, 'appointments', selectedAppointment.id), updatePayload);

      await batch.commit();
      setIsDetailModalOpen(false);
      showToast('Estado actualizado correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${selectedAppointment.id}`);
    }
  };

  const handleOpenEditAppointment = (apt: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (apt.status === 'finished' || apt.status === 'finalizado') {
      showToast('No se puede modificar la fecha u hora de un turno ya finalizado.', 'warning');
      return;
    }
    const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
    const matched = treatments.find(t => t.name === (apt.type || apt.treatment));
    const initialDuration = getEffectiveDuration(matched, apt.duration, treatments, profDefault);
    setEditAptData({
      id: apt.id,
      patientId: apt.patientId || '',
      patientName: apt.patientName || '',
      date: apt.date || formatLocalDate(new Date()),
      time: apt.time || '09:00',
      type: apt.type || apt.treatment || 'Check-up General',
      notes: apt.notes || '',
      duration: initialDuration,
      isOverturn: Boolean(apt.isOverturn),
      manualOverturn: false,
      status: apt.status || 'pendiente'
    });
    setIsDetailModalOpen(false);
    setIsEditModalOpen(true);
  };

  const handleSaveEditedAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAptData.id || isSubmittingAppointment) return;
    setIsSubmittingAppointment(true);
    try {
      const [year, month, day] = editAptData.date.split('-').map(Number);
      const [hours, minutes] = editAptData.time.split(':').map(Number);
      const appointmentDate = new Date(year, month - 1, day, hours, minutes);

      const matchedTreatment = treatments.find(t => t.name === editAptData.type);
      const finalDuration = effectiveEditAptDuration;

      const result = await saveAppointmentWithPersistenceCheck({
        id: editAptData.id,
        patientId: editAptData.patientId || '',
        patientName: editAptData.patientName || '',
        date: editAptData.date,
        time: editAptData.time,
        duration: finalDuration,
        type: editAptData.type,
        treatment: editAptData.type,
        treatmentId: matchedTreatment?.id || '',
        notes: editAptData.notes || '',
        userId: ownerId,
        manualOverturn: Boolean(editAptData.manualOverturn),
        treatmentsList: treatments,
        workingHours
      }, true);

      setIsEditModalOpen(false);

      if (result.isOverturn) {
        showToast(
          result.conflictSummary
            ? `⚡ Turno actualizado como SOBRETURNO (solapamiento): ${result.conflictSummary}`
            : '⚡ Turno reprogramado como SOBRETURNO',
          'success'
        );
      } else if (result.isOutsideWorkingHours) {
        showToast(`Fecha y hora actualizadas (Fuera de horario habitual: ${result.outsideHoursReason || 'excepción'})`, 'success');
      } else {
        showToast('Fecha y hora del turno actualizadas correctamente', 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${editAptData.id}`);
    } finally {
      setIsSubmittingAppointment(false);
    }
  };

  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [...patients].sort(comparePatientsByLastName);
    return patients
      .filter(p => {
        return (
          p.name?.toLowerCase().includes(term) ||
          p.firstName?.toLowerCase().includes(term) ||
          p.lastName?.toLowerCase().includes(term) ||
          p.idNumber?.toLowerCase().includes(term)
        );
      })
      .sort(comparePatientsByLastName);
  }, [patients, searchTerm]);

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

  const selectedDateAppointments = useMemo(() => {
    const list = appointments.filter(a => a.date === formatLocalDate(selectedDate));
    return [...list].sort(compareAppointments);
  }, [appointments, selectedDate]);

  const getPatientPhone = (apt: any) => {
    if (apt?.patientPhone) return apt.patientPhone;
    const patient = patients.find(p => p.id === apt?.patientId);
    return patient?.phone || '';
  };

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
    <div className={cn("flex flex-col space-y-4 w-full min-w-0", view === 'month' ? "min-h-full pb-16" : "min-h-[550px] lg:h-[calc(100vh-140px)]")}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0 px-1">
        <div>
          <h1 className="headline-lg text-on-surface">Agenda & Calendario</h1>
          <p className="body-md text-on-surface-variant">Gestione sus horarios y reservas de pacientes.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          <div className="flex items-center gap-1 bg-white/80 p-1 rounded-xl border border-outline-variant shadow-xs">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all",
                  view === v ? "bg-primary text-white shadow-xs" : "text-on-surface-variant hover:bg-surface"
                )}
              >
                {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsExportDayModalOpen(true)}
            className="px-3 sm:px-3.5 py-2 bg-white text-on-surface hover:bg-surface border border-outline-variant rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs uppercase tracking-wider shrink-0 cursor-pointer"
            title="Exportar agenda del día con pacientes, tratamientos, turnos y notas"
          >
            <Download size={14} className="text-primary shrink-0" />
            <span className="hidden xs:inline">Exportar Día</span>
            <span className="xs:hidden">Exportar</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenBlockModal(formatLocalDate(selectedDate))}
            className="px-3 sm:px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs uppercase tracking-wider shrink-0 cursor-pointer"
            title="Bloquear un horario o el día completo en la agenda"
          >
            <Lock size={14} className="text-amber-700 shrink-0" />
            <span className="hidden xs:inline">Bloquear Horario</span>
            <span className="xs:hidden">Bloquear</span>
          </button>

          <button 
            onClick={() => handleOpenNewAppointment()}
            className="px-3 sm:px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 sm:gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-xs uppercase tracking-wider shrink-0 cursor-pointer"
          >
            <Plus size={15} />
            <span className="hidden xs:inline">Nuevo Turno</span>
            <span className="xs:hidden">Turno</span>
          </button>
        </div>
      </div>

      <div className={cn(
        view === 'month' 
          ? "flex flex-col space-y-6" 
          : "flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0"
      )}>
        {/* Main Calendar View */}
        <div className={cn(
          "bg-white rounded-2xl border border-outline-variant shadow-sm flex flex-col overflow-hidden",
          view === 'month' ? "w-full" : "lg:col-span-3"
        )}>
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
          </div>

          <div className="flex-1 overflow-auto bg-surface-dim">
            {view === 'month' && (
              <div className="grid grid-cols-7 grid-rows-[auto_repeat(6,1fr)] w-full min-w-0">
                {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((d, i) => (
                  <div key={d} className="flex items-center justify-center text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-on-surface-variant border-b border-r border-outline-variant last:border-r-0 bg-surface py-2 sm:py-2.5">
                    <span className="sm:hidden">{['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]}</span>
                    <span className="hidden sm:inline">{d}</span>
                  </div>
                ))}
                {getCalendarDays().map((item, idx) => {
                  const dayAppointments = appointments.filter(a => a.date === formatLocalDate(item.date));
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(item.date);
                        if (item.month !== 'current') setViewDate(item.date);
                      }}
                      className={cn(
                        "flex flex-col items-center sm:items-start p-1 sm:p-2 border-b border-r border-outline-variant last:border-r-0 transition-all group relative min-h-[52px] sm:min-h-[96px] w-full min-w-0 overflow-hidden",
                        item.month === 'current' ? "bg-white" : "bg-surface-dim/70 opacity-40",
                        workingHours && item.month === 'current' && !(workingHours.workingDays || workingHours.days || []).includes(item.date.getDay() === 0 ? 7 : item.date.getDay()) && "bg-surface-bright opacity-60 grayscale-[0.5]",
                        isSelected(item.date) && "bg-primary-container/40 ring-2 ring-inset ring-primary z-10",
                        !isSelected(item.date) && "hover:bg-surface"
                      )}
                    >
                      <span className={cn(
                        "w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-[11px] sm:text-[13px] font-bold transition-all shrink-0",
                        isToday(item.date) && !isSelected(item.date) ? "bg-primary text-white" : 
                        isSelected(item.date) ? "bg-primary text-white font-black scale-105" : "text-on-surface"
                      )}>
                        {item.day}
                      </span>

                      {/* Mobile Indicator Dots */}
                      <div className="w-full mt-1 flex sm:hidden items-center justify-center gap-0.5 flex-wrap">
                        {dayAppointments.slice(0, 3).map((apt) => {
                          const styles = getAppointmentStatusStyles(apt.status);
                          return (
                            <span 
                              key={apt.id} 
                              className={cn("w-1.5 h-1.5 rounded-full shrink-0", styles.dotColor)} 
                            />
                          );
                        })}
                        {dayAppointments.length > 3 && (
                          <span className="text-[8px] font-black text-on-surface-variant leading-none">
                            +{dayAppointments.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Desktop Appointment Cards */}
                      <div className="w-full space-y-1 hidden sm:block mt-1">
                        {dayAppointments
                          .slice(0, 3)
                          .map((apt) => {
                            if (apt.isBlocked || apt.status === 'bloqueado') {
                              return (
                                <div 
                                  key={apt.id} 
                                  className="w-full px-1.5 py-0.5 rounded text-[10px] font-bold truncate border flex items-center gap-1 bg-slate-100 text-slate-800 border-slate-300"
                                  title={`Bloqueado: ${apt.blockReason || 'Agenda Bloqueada'}`}
                                >
                                  <Lock size={8} className="shrink-0 text-slate-700" />
                                  <span className="truncate">
                                    {apt.isAllDayBlock ? 'Todo el día' : apt.time} {apt.blockReason || 'Bloqueado'}
                                  </span>
                                </div>
                              );
                            }
                            const styles = getAppointmentStatusStyles(apt.status);
                            return (
                              <div 
                                key={apt.id} 
                                className={cn(
                                  "w-full px-1.5 py-0.5 rounded text-[10px] font-bold truncate border flex items-center gap-1",
                                  styles.bgLight,
                                  styles.textColor,
                                  styles.borderColor,
                                  apt.isOverturn && "ring-1 ring-purple-400"
                                )}
                              >
                                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", styles.dotColor)} />
                                {apt.isOverturn && (
                                  <span className="px-1 py-0.2 rounded bg-purple-200 text-purple-900 text-[8px] font-black uppercase shrink-0 flex items-center gap-0.5 border border-purple-300">
                                    <Zap size={7} className="fill-purple-700 text-purple-700" />
                                    ST
                                  </span>
                                )}
                                {apt.isPackageSession && <Package size={9} className="shrink-0 text-emerald-600" />}
                                <span className="truncate">{apt.patientName}</span>
                              </div>
                            );
                          })
                        }
                        {dayAppointments.length > 3 && (
                          <div className="text-[10px] font-black text-on-surface-variant/50 px-1">
                            + {dayAppointments.length - 3} más
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
                        {(() => {
                          const dayApts = appointments.filter(a => a.date === formatLocalDate(dayDate));
                          const layoutMap = computeOverlappingLayout(dayApts);
                          return dayApts.map((apt) => {
                            const [h, m] = apt.time.split(':').map(Number);
                            if (h < startHour || h > hours[hours.length - 1]) return null;
                            const duration = apt.duration || 30;
                            const calculatedEnd = apt.endTime || calculateEndTime(apt.time, duration);
                            const layout = layoutMap[apt.id] || { colIndex: 0, totalCols: 1, leftPercent: 0, widthPercent: 100 };
                            const styles = getAppointmentStatusStyles(apt.status);
                            return (
                              <div
                                key={apt.id}
                                onClick={() => handleAppointmentClick(apt)}
                                className={cn(
                                  "absolute p-1.5 sm:p-2 rounded-lg border border-l-4 shadow-sm cursor-pointer transition-all hover:scale-[1.02] overflow-hidden",
                                  styles.bg,
                                  styles.textColor,
                                  styles.borderColor,
                                  styles.borderLeftColor,
                                  apt.isOverturn && "ring-2 ring-purple-400 shadow-purple-900/10"
                                )}
                                style={{
                                  top: `${((h - startHour) * 60 + m)}px`,
                                  height: `${Math.max(28, duration - 2)}px`,
                                  left: `calc(2px + ${layout.leftPercent}% * 0.94)`,
                                  width: `calc(${layout.widthPercent}% * 0.94)`,
                                  zIndex: (apt.isOverturn ? 20 : 10) + layout.colIndex
                                }}
                              >
                                {apt.isBlocked || apt.status === 'bloqueado' ? (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1">
                                      <Lock size={10} className="text-slate-700 shrink-0" />
                                      <p className="text-[10px] font-black truncate text-slate-900">{apt.blockReason || 'Bloqueado'}</p>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-600 uppercase truncate">
                                      {apt.isAllDayBlock ? 'Todo el día' : `${apt.time} - ${calculatedEnd}`}
                                    </p>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="text-[11px] font-black truncate">{apt.patientName}</p>
                                      {apt.isOverturn && (
                                        <span className="px-1.5 py-0.5 rounded bg-purple-200 text-purple-900 text-[8px] font-black uppercase shrink-0 flex items-center gap-0.5 border border-purple-300">
                                          <Zap size={7} className="fill-purple-700 text-purple-700" />
                                          Sobre Turno
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[9px] font-bold opacity-75 uppercase truncate">
                                      {apt.time} - {calculatedEnd} ({duration}m)
                                    </p>
                                  </>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'day' && (
              <div className="grid grid-cols-[55px_1fr] sm:grid-cols-[80px_1fr] h-full w-full min-w-0 bg-white">
                <div className="bg-surface border-r border-outline-variant">
                  {hours.map(hour => (
                    <div key={hour} className="h-[100px] flex items-start justify-center pt-4 border-b border-outline-variant border-dashed">
                      <span className="text-[10px] sm:text-[12px] font-black text-on-surface-variant tracking-wider">{hour}:00</span>
                    </div>
                  ))}
                </div>
                <div className="relative">
                  {hours.map(hour => (
                    <div key={hour} className="h-[100px] border-b border-outline-variant border-dashed opacity-30"></div>
                  ))}
                  {(() => {
                    const dayLayoutMap = computeOverlappingLayout(selectedDateAppointments);
                    return selectedDateAppointments.map((apt) => {
                      const [h, m] = apt.time.split(':').map(Number);
                      if (h < startHour || h > hours[hours.length - 1]) return null;
                      const duration = apt.duration || 30;
                      const calculatedEnd = apt.endTime || calculateEndTime(apt.time, duration);
                      const layout = dayLayoutMap[apt.id] || { colIndex: 0, totalCols: 1, leftPercent: 0, widthPercent: 100 };
                      const isBlocked = apt.isBlocked || apt.status === 'bloqueado';
                      const styles = getAppointmentStatusStyles(apt.status);
                      return (
                        <motion.div
                          key={apt.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          onClick={() => handleAppointmentClick(apt)}
                          className={cn(
                            "absolute p-2.5 sm:p-4 rounded-xl border border-l-[4px] sm:border-l-[6px] shadow-md cursor-pointer flex flex-col justify-center gap-1 transition-all hover:translate-x-0.5 overflow-hidden",
                            styles.bg,
                            styles.textColor,
                            styles.borderColor,
                            styles.borderLeftColor,
                            styles.shadow,
                            apt.isOverturn && "ring-2 ring-purple-400 shadow-purple-900/10",
                            isBlocked && "bg-slate-100/95 border-slate-300 border-l-slate-700 text-slate-800"
                          )}
                          style={{
                            top: `${((h - startHour) * 100 + (m / 60) * 100)}px`,
                            height: `${Math.max(48, ((duration) / 60) * 100 - 4)}px`,
                            left: `calc(8px + ${layout.leftPercent}% * 0.94)`,
                            width: `calc(${layout.widthPercent}% * 0.94)`,
                            zIndex: (apt.isOverturn ? 25 : (isBlocked ? 20 : 10)) + layout.colIndex
                          }}
                        >
                          <div className="flex justify-between items-center gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-wider opacity-80 truncate flex items-center gap-1">
                                {isBlocked && <Lock size={12} className="shrink-0 text-slate-600" />}
                                {apt.time} - {calculatedEnd} hs ({duration}m) • {isBlocked ? (apt.isAllDayBlock ? 'Todo el día' : 'Bloqueo Agenda') : (apt.type || apt.treatment)}
                              </span>
                              {apt.isOverturn && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300 flex items-center gap-1 shrink-0">
                                  <Zap size={10} className="text-purple-600 fill-purple-600" />
                                  Sobre Turno
                                </span>
                              )}
                            </div>
                            <span className={cn(
                              "text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded capitalize shrink-0 border flex items-center gap-1",
                              isBlocked ? "bg-slate-200 text-slate-800 border-slate-300" : (
                                cn(styles.badgeBg, styles.badgeText, styles.badgeBorder)
                              )
                            )}>
                              {isBlocked && <Lock size={9} />}
                              {isBlocked ? 'Bloqueado' : styles.label}
                            </span>
                          </div>
                          <h4 className="text-[13px] sm:text-[16px] font-black tracking-tight truncate flex items-center gap-1.5">
                            {isBlocked ? (
                              <>
                                <Ban size={14} className="text-slate-500 shrink-0" />
                                <span>{apt.blockReason || (apt.patientName ? apt.patientName.replace('[Bloqueado] ', '') : 'Horario Bloqueado')}</span>
                              </>
                            ) : (
                              apt.patientName
                            )}
                          </h4>
                        </motion.div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* En vista Mes: Lista con todos los turnos dados del día seleccionado */}
        {view === 'month' && (
          <div id="turnos-del-dia" className="bg-white rounded-2xl border border-outline-variant shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline-variant">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black shrink-0">
                  <CalendarClock size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Turnos del Día
                    </p>
                    {isToday(selectedDate) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                        Hoy
                      </span>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-on-surface capitalize">
                    {new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(selectedDate)}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
                <span className="text-xs font-bold px-3 py-1.5 bg-surface-bright text-on-surface rounded-xl border border-outline-variant">
                  {selectedDateAppointments.length} {selectedDateAppointments.length === 1 ? 'registro' : 'registros'}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenBlockModal(formatLocalDate(selectedDate))}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-2xs uppercase tracking-wider"
                  title="Bloquear un horario o toda la jornada"
                >
                  <Lock size={14} />
                  Bloquear Horario
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNewAppointment(formatLocalDate(selectedDate))}
                  className="px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider"
                >
                  <Plus size={14} />
                  Agendar Turno
                </button>
              </div>
            </div>

            {selectedDateAppointments.length === 0 ? (
              <div className="py-12 px-4 text-center bg-surface-bright/50 rounded-xl border border-outline-variant/60">
                <Calendar size={40} className="mx-auto text-on-surface-variant/40 mb-3" />
                <h4 className="text-sm font-black text-on-surface">No hay turnos ni bloqueos para este día</h4>
                <p className="text-xs text-on-surface-variant mt-1 max-w-sm mx-auto">
                  No se encontraron citas ni bloqueos para el {new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(selectedDate)}. Seleccione otro día del calendario o presione un botón para continuar.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenNewAppointment(formatLocalDate(selectedDate))}
                    className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 hover:bg-primary/90 transition-all shadow-xs"
                  >
                    <Plus size={14} />
                    Agendar Turno
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBlockModal(formatLocalDate(selectedDate))}
                    className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    <Lock size={14} />
                    Bloquear Horario / Jornada
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {selectedDateAppointments.map((apt) => {
                  const isBlocked = apt.isBlocked || apt.status === 'bloqueado';
                  const phone = getPatientPhone(apt);
                  const styles = getAppointmentStatusStyles(apt.status);

                  if (isBlocked) {
                    return (
                      <motion.div
                        key={apt.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl border border-l-4 border-slate-300 border-l-slate-700 bg-slate-50/70 transition-all flex flex-col justify-between gap-3 relative group shadow-xs hover:shadow-md"
                      >
                        <div>
                          {/* Header: Hora & Badge Bloqueado */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-slate-800 bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 flex items-center gap-1">
                                <Lock size={12} className="text-slate-600" />
                                {apt.isAllDayBlock
                                  ? 'Todo el día'
                                  : `${apt.time} - ${apt.endTime || calculateEndTime(apt.time, apt.duration || 60)} hs`}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500">
                                ({apt.isAllDayBlock ? 'Jornada Completa' : `${apt.duration || 60} min`})
                              </span>
                            </div>

                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border bg-slate-200 text-slate-800 border-slate-300 flex items-center gap-1">
                              <Lock size={10} />
                              Bloqueado
                            </span>
                          </div>

                          {/* Motivo del bloqueo */}
                          <div className="space-y-1">
                            <h4 
                              onClick={() => handleAppointmentClick(apt)}
                              className="text-base font-black text-slate-800 hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                              <Ban size={15} className="text-slate-500 shrink-0" />
                              <span>{apt.blockReason || (apt.patientName ? apt.patientName.replace('[Bloqueado] ', '') : 'Bloqueo de Agenda')}</span>
                            </h4>
                            <p className="text-[11px] font-medium text-slate-500">
                              Tiempo reservado sin asignación de pacientes
                            </p>
                          </div>

                          {apt.notes && (
                            <p className="mt-2.5 text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-200 line-clamp-2">
                              {apt.notes}
                            </p>
                          )}
                        </div>

                        {/* Barra de Acciones para Bloqueos */}
                        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 mt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnblockAppointment(apt.id);
                            }}
                            title="Desbloquear este horario de la agenda"
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Desbloquear</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBlockModal(apt.date, apt.time, apt);
                              }}
                              title="Modificar duración o motivo del bloqueo"
                              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 size={13} />
                              <span>Modificar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAppointmentClick(apt)}
                              title="Ver detalle del bloqueo"
                              className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span>Detalle</span>
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={apt.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "p-4 rounded-xl border border-l-4 transition-all flex flex-col justify-between gap-3 relative group bg-white shadow-xs hover:shadow-md",
                        styles.borderColor,
                        styles.borderLeftColor,
                        styles.bgLight
                      )}
                    >
                      <div>
                        {/* Header: Hora & Estado */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-primary bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20 flex items-center gap-1">
                              <Clock size={12} />
                              {apt.time} - {apt.endTime || calculateEndTime(apt.time, apt.duration || 30)} hs
                            </span>
                            <span className="text-[11px] font-semibold text-on-surface-variant">
                              ({apt.duration || 30} min)
                            </span>
                            {apt.isOverturn && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1 shadow-xs">
                                <Zap size={11} className="text-purple-600 fill-purple-600" />
                                Sobre Turno
                              </span>
                            )}
                          </div>

                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                            styles.badgeBg,
                            styles.badgeText,
                            styles.badgeBorder
                          )}>
                            {styles.label}
                          </span>
                        </div>

                        {/* Paciente */}
                        <div className="space-y-1">
                          <h4 
                            onClick={() => handleAppointmentClick(apt)}
                            className="text-base font-black text-on-surface hover:text-primary transition-colors cursor-pointer"
                          >
                            {apt.patientName}
                          </h4>
                          
                          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                            <Phone size={12} className={phone ? "text-emerald-600" : "text-on-surface-variant/50"} />
                            {phone ? (
                              <span className="font-semibold text-on-surface font-mono">{formatArgentinePhoneWithPrefix(phone)}</span>
                            ) : (
                              <span className="text-on-surface-variant/60 italic text-[11px]">Sin teléfono registrado</span>
                            )}
                          </div>
                        </div>

                        {/* Tratamiento y Bono */}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-surface-bright border border-outline-variant text-on-surface">
                            {apt.type || apt.treatment || 'Consulta'}
                          </span>
                          {apt.isPackageSession && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
                              <Package size={11} /> {apt.packageName || 'Paquete'}
                            </span>
                          )}
                        </div>

                        {apt.notes && (
                          <p className="mt-2 text-xs text-on-surface-variant/90 bg-surface p-2 rounded-lg border border-outline-variant/60 line-clamp-2">
                            {apt.notes}
                          </p>
                        )}
                      </div>

                      {/* Barra de Acciones */}
                      <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-between gap-2 mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const phone = getAppointmentPatientPhone(apt);
                            setReminderModalApt({
                              ...apt,
                              patientPhone: phone
                            });
                          }}
                          title="Enviar recordatorio manual por WhatsApp"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <MessageCircle size={13} />
                          <span>Recordatorio</span>
                        </button>
                        <div className="flex items-center gap-1">
                          {apt.status === 'in-session' && (
                            <button
                              type="button"
                              onClick={() => handleOpenClinicalHistory(apt)}
                              title="Abrir evoluciones del paciente en sesión"
                              className="px-2.5 py-1.5 rounded-lg bg-tertiary text-white hover:bg-tertiary/90 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer animate-pulse"
                            >
                              <Stethoscope size={13} />
                              <span>Evolución (En Sesión)</span>
                            </button>
                          )}
                          {apt.status !== 'finished' && apt.status !== 'finalizado' && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditAppointment(apt, e)}
                              title="Reprogramar / Editar fecha y hora"
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAppointmentClick(apt)}
                            title="Ver detalle del turno"
                            className="px-2.5 py-1.5 rounded-lg bg-surface text-on-surface hover:bg-surface-bright text-xs font-bold border border-outline-variant transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>Detalle</span>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sidebar: Day View (Solo en vistas Semana y Día) */}
        {view !== 'month' && (
          <div className="hidden lg:flex bg-white rounded-2xl border border-outline-variant shadow-sm flex-col overflow-hidden max-h-full">
            <div className="p-6 border-b border-outline-variant bg-surface-bright shrink-0 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-1">Agenda del día</p>
                <h3 className="text-sm font-bold text-on-surface capitalize">
                  {new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(selectedDate)}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenBlockModal(formatLocalDate(selectedDate))}
                  className="p-2 bg-white hover:bg-surface text-slate-700 border border-outline-variant rounded-xl transition-colors shadow-2xs"
                  title="Bloquear un horario o jornada"
                >
                  <Lock size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsExportDayModalOpen(true)}
                  className="p-2 bg-white hover:bg-surface text-on-surface border border-outline-variant rounded-xl transition-colors shadow-2xs"
                  title="Exportar agenda del día"
                >
                  <Download size={15} className="text-primary" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
              {selectedDateAppointments.length > 0 ? (
                selectedDateAppointments.map((apt) => {
                  const isBlocked = apt.isBlocked || apt.status === 'bloqueado';
                  const styles = getAppointmentStatusStyles(apt.status);

                  if (isBlocked) {
                    return (
                      <motion.div
                        key={apt.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => handleAppointmentClick(apt)}
                        className="p-3.5 rounded-xl border border-l-4 border-slate-300 border-l-slate-700 bg-slate-50/80 shadow-none hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12px] font-black text-slate-800 bg-slate-200 px-2 py-0.5 rounded border border-slate-300 flex items-center gap-1">
                              <Lock size={11} className="text-slate-600" />
                              {apt.isAllDayBlock ? 'Todo el día' : `${apt.time} - ${apt.endTime || calculateEndTime(apt.time, apt.duration || 60)}`}
                            </span>
                          </div>
                          <span className="w-2 h-2 rounded-full shrink-0 bg-slate-600" />
                        </div>
                        <h4 className="text-[14px] font-bold text-slate-800 mb-1 group-hover:text-primary transition-colors flex items-center gap-1.5">
                          <Ban size={13} className="text-slate-500 shrink-0" />
                          <span className="truncate">{apt.blockReason || (apt.patientName ? apt.patientName.replace('[Bloqueado] ', '') : 'Bloqueado')}</span>
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                          <span className="truncate">{apt.isAllDayBlock ? 'Jornada Completa' : `${apt.duration || 60}m`}</span>
                          <span className="shrink-0">•</span>
                          <span className="shrink-0 text-slate-600">Agenda Bloqueada</span>
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={apt.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => handleAppointmentClick(apt)}
                      className={cn(
                        "p-3.5 rounded-xl border border-l-4 shadow-none hover:shadow-md transition-all cursor-pointer group relative overflow-hidden bg-white",
                        styles.borderColor,
                        styles.borderLeftColor,
                        styles.bgLight
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                            {apt.time} - {apt.endTime || calculateEndTime(apt.time, apt.duration || 30)}
                          </span>
                          {apt.isOverturn && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-0.5">
                              <Zap size={9} className="text-purple-600 fill-purple-600" /> ST
                            </span>
                          )}
                          {apt.status !== 'finished' && apt.status !== 'finalizado' && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditAppointment(apt, e)}
                              title="Editar fecha y hora"
                              className="p-1 rounded-md text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}
                        </div>
                        <div className={cn("w-2 h-2 rounded-full shrink-0", styles.dotColor)} />
                      </div>
                      <h4 className="text-[14px] font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">{apt.patientName}</h4>
                      <div className="flex items-center gap-2 text-[11px] font-bold text-on-surface-variant uppercase tracking-tighter">
                        <span className="truncate">{apt.type}</span>
                        <span className="shrink-0">•</span>
                        <span className="shrink-0">{apt.duration || 30}m</span>
                        {apt.isPackageSession && (
                          <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 flex items-center gap-0.5 ml-auto">
                            <Package size={9} /> Paquete ($0)
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-30 py-20 text-center">
                  <Calendar size={48} className="mb-4 text-on-surface-variant" />
                  <p className="text-[11px] font-black uppercase tracking-widest leading-loose">
                    No hay turnos agendados<br />para este día
                  </p>
                  <button 
                    onClick={() => handleOpenNewAppointment(formatLocalDate(selectedDate))}
                    className="mt-6 text-[10px] font-black text-primary uppercase underline tracking-widest"
                  >
                    Agendar Primero
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-outline-variant bg-surface-dim shrink-0 flex gap-2">
              <button 
                type="button"
                onClick={() => handleOpenBlockModal(formatLocalDate(selectedDate))}
                className="px-3.5 py-3 bg-white hover:bg-slate-100 text-slate-700 border border-outline-variant rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                title="Bloquear un horario"
              >
                <Lock size={15} />
                Bloquear
              </button>
              <button 
                type="button"
                onClick={() => handleOpenNewAppointment(formatLocalDate(selectedDate))}
                className="flex-1 py-3 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all"
              >
                <Clock size={16} />
                NUEVO TURNO
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal 
        isOpen={isNewAppointmentOpen} 
        onClose={() => setIsNewAppointmentOpen(false)} 
        title={isBlockingAgenda ? "Bloquear Horario de Agenda" : "Agendar Nuevo Turno"}
      >
        <form className="space-y-4" onSubmit={handleSaveAppointment}>
          {/* Selector de Modo: Turno Paciente vs Bloquear Agenda */}
          <div className="grid grid-cols-2 p-1 bg-surface-bright rounded-xl border border-outline-variant gap-1">
            <button
              type="button"
              onClick={() => setIsBlockingAgenda(false)}
              className={cn(
                "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                !isBlockingAgenda
                  ? "bg-white text-primary shadow-xs border border-outline-variant/60"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <User size={14} />
              Turno Paciente
            </button>
            <button
              type="button"
              onClick={() => setIsBlockingAgenda(true)}
              className={cn(
                "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                isBlockingAgenda
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <Lock size={14} />
              Bloquear Agenda
            </button>
          </div>

          {isBlockingAgenda ? (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
                <Lock size={16} className="text-slate-600 shrink-0 mt-0.5" />
                <p>
                  Reserva este espacio en tu agenda para descanso, trámites o compromisos personales. Evita que se asignen pacientes en este intervalo.
                </p>
              </div>

              {/* Checkbox: Todo el día */}
              <label className="flex items-center gap-3 p-3 bg-surface-bright hover:bg-surface rounded-xl border border-outline-variant cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={blockData.isAllDay}
                  onChange={(e) => setBlockData(prev => ({ ...prev, isAllDay: e.target.checked }))}
                  className="rounded border-outline-variant text-slate-800 focus:ring-slate-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-on-surface block">Bloquear jornada completa (Todo el día)</span>
                  <span className="text-[11px] text-on-surface-variant">Inhabilita todo el día para turnos de pacientes</span>
                </div>
              </label>

              {/* Fecha y Hora */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</label>
                  <input
                    type="date"
                    required
                    value={newApt.date}
                    onChange={(e) => setNewApt(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {!blockData.isAllDay && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Hora de inicio</label>
                    <input
                      type="time"
                      required
                      value={newApt.time}
                      onChange={(e) => setNewApt(prev => ({ ...prev, time: e.target.value }))}
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Duración */}
              {!blockData.isAllDay && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                      Duración del Bloqueo
                    </label>
                    <span className="text-xs font-bold text-slate-700 font-mono">
                      {blockData.duration} min ({Math.floor(blockData.duration / 60)}h {blockData.duration % 60 > 0 ? `${blockData.duration % 60}m` : ''})
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '30 min', val: 30 },
                      { label: '1 hora', val: 60 },
                      { label: '2 horas', val: 120 },
                      { label: '3 horas', val: 180 },
                      { label: '4 horas', val: 240 }
                    ].map(dur => (
                      <button
                        key={dur.val}
                        type="button"
                        onClick={() => setBlockData(prev => ({ ...prev, duration: dur.val }))}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                          blockData.duration === dur.val
                            ? "bg-slate-800 text-white border-slate-900 shadow-2xs"
                            : "bg-surface-bright text-on-surface border-outline-variant hover:bg-surface"
                        )}
                      >
                        {dur.label}
                      </button>
                    ))}
                  </div>

                  <div className="pt-1 flex items-center gap-2">
                    <span className="text-[11px] text-on-surface-variant font-medium">O especificar minutos:</span>
                    <input
                      type="number"
                      min={10}
                      max={720}
                      step={5}
                      value={blockData.duration}
                      onChange={(e) => setBlockData(prev => ({ ...prev, duration: Math.max(10, Number(e.target.value)) }))}
                      className="w-24 px-2 py-1 bg-surface border border-outline-variant rounded-md text-xs font-mono font-bold"
                    />
                    <span className="text-xs text-on-surface-variant">minutos</span>
                  </div>
                </div>
              )}

              {/* Motivo */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Motivo de la reserva
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Almuerzo / Descanso',
                    'Trámite personal',
                    'Congreso / Capacitación',
                    'Reunión de equipo',
                    'Asuntos médicos',
                    'Feriado / Asueto'
                  ].map(mot => (
                    <button
                      key={mot}
                      type="button"
                      onClick={() => setBlockData(prev => ({ ...prev, reason: mot }))}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer",
                        blockData.reason === mot
                          ? "bg-slate-800 text-white border-slate-900 shadow-2xs"
                          : "bg-surface text-on-surface border-outline-variant hover:bg-surface-bright"
                      )}
                    >
                      {mot}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Ej: Almuerzo, Trámite personal, etc."
                  value={blockData.reason}
                  onChange={(e) => setBlockData(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Observaciones */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Observaciones adicionales (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles sobre el bloqueo..."
                  value={newApt.notes}
                  onChange={(e) => setNewApt(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Paciente</label>
                  <button 
                    type="button"
                onClick={() => {
                  const nextState = !isCreatingNewPatient;
                  setIsCreatingNewPatient(nextState);
                  if (nextState) {
                    setIsPatientDropdownOpen(false);
                  } else {
                    setIsPatientDropdownOpen(true);
                  }
                }}
                className="text-[10px] text-primary font-bold uppercase underline tracking-tighter cursor-pointer"
              >
                {isCreatingNewPatient ? 'Buscar Existente' : '+ Nuevo Paciente'}
              </button>
            </div>
            
            {isCreatingNewPatient ? (
              <div className="space-y-3 bg-surface p-3 rounded-lg border border-outline-variant">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase ml-1 block mb-1">
                      Nombre *
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: Juan"
                      required
                      value={newPatientData.firstName}
                      onChange={(e) => {
                        const fn = e.target.value;
                        setNewPatientData({
                          ...newPatientData,
                          firstName: fn,
                          name: `${fn} ${newPatientData.lastName}`.trim()
                        });
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase ml-1 block mb-1">
                      Apellido *
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: Pérez"
                      required
                      value={newPatientData.lastName}
                      onChange={(e) => {
                        const ln = e.target.value;
                        setNewPatientData({
                          ...newPatientData,
                          lastName: ln,
                          name: `${newPatientData.firstName} ${ln}`.trim()
                        });
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase ml-1">Teléfono / WhatsApp</label>
                    <PhoneInputArgentina
                      value={newPatientData.phone}
                      onChange={(val) => setNewPatientData({ ...newPatientData, phone: val })}
                      placeholder="Área + Número"
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
              </div>
            ) : (
              <div className="relative" ref={patientSearchRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
                  <input 
                    type="text" 
                    placeholder="Buscar paciente por nombre o teléfono..."
                    value={searchTerm}
                    onFocus={() => setIsPatientDropdownOpen(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchTerm(val);
                      setIsPatientDropdownOpen(true);
                      if (newApt.patientId) {
                        setNewApt(prev => ({
                          ...prev,
                          patientId: '',
                          patientName: '',
                          patientFirstName: '',
                          patientLastName: ''
                        }));
                        setSelectedPatientStats(null);
                        setPatientPackages([]);
                      }
                    }}
                    className={cn(
                      "w-full pl-9 pr-9 py-2 bg-surface border rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px] transition-all",
                      newApt.patientId ? "border-primary font-bold text-on-surface bg-primary/5" : "border-outline-variant"
                    )}
                  />
                  {(searchTerm || newApt.patientId) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setNewApt(prev => ({
                          ...prev,
                          patientId: '',
                          patientName: '',
                          patientFirstName: '',
                          patientLastName: ''
                        }));
                        setSelectedPatientStats(null);
                        setPatientPackages([]);
                        setIsPatientDropdownOpen(true);
                      }}
                      title="Borrar paciente seleccionado"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright rounded-full transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {isPatientDropdownOpen && !newApt.patientId && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-white border border-outline-variant rounded-xl shadow-xl mt-1.5 max-h-52 overflow-y-auto divide-y divide-outline-variant">
                    {filteredPatients.length > 0 ? (
                      <>
                        <div className="px-3 py-1.5 bg-surface-bright text-[10px] font-black uppercase tracking-wider text-on-surface-variant flex items-center justify-between sticky top-0 z-10 border-b border-outline-variant">
                          <span>Pacientes ({filteredPatients.length})</span>
                          <span className="font-medium text-[9px] opacity-70">Seleccione uno de la lista</span>
                        </div>
                        {filteredPatients.slice(0, 30).map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setNewApt(prev => ({
                                ...prev,
                                patientId: p.id,
                                patientName: p.name,
                                patientFirstName: p.firstName || getPatientFirstName(p.name),
                                patientLastName: p.lastName || ''
                              }));
                              setSearchTerm(p.name);
                              setIsPatientDropdownOpen(false);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-[12px] hover:bg-primary/5 active:bg-primary/10 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <div className="truncate pr-2">
                              <span className="font-bold text-on-surface group-hover:text-primary transition-colors">
                                {p.lastName || getPatientLastName(p) ? (
                                  <>
                                    <span className="font-extrabold">{p.lastName || getPatientLastName(p)}</span>
                                    {(p.firstName || getPatientFirstName(p)) && (
                                      <span className="font-normal text-on-surface-variant">, {p.firstName || getPatientFirstName(p)}</span>
                                    )}
                                  </>
                                ) : (
                                  p.name
                                )}
                              </span>
                              {p.phone && (
                                <span className="ml-2 font-mono text-[11px] text-on-surface-variant bg-surface px-1.5 py-0.5 rounded border border-outline-variant">
                                  {formatArgentinePhoneWithPrefix(p.phone) || p.phone}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                              Seleccionar
                            </span>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-[11px] text-on-surface-variant mb-2 font-medium">
                          No se encontró ningún paciente {searchTerm ? `con "${searchTerm}"` : 'registrado'}
                        </p>
                        <button 
                          type="button"
                          onClick={() => {
                            const parsed = splitFullName(searchTerm);
                            setIsCreatingNewPatient(true);
                            setNewPatientData({
                              ...newPatientData,
                              firstName: parsed.firstName,
                              lastName: parsed.lastName,
                              name: searchTerm
                            });
                            setIsPatientDropdownOpen(false);
                          }}
                          className="text-xs text-primary font-bold hover:underline uppercase inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={13} />
                          Crear nuevo paciente {searchTerm ? `"${searchTerm}"` : ''}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {newApt.patientId && (
                  <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      <span className="text-emerald-950 truncate">
                        Paciente: <strong className="font-bold">{newApt.patientName}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setNewApt(prev => ({
                          ...prev,
                          patientId: '',
                          patientName: '',
                          patientFirstName: '',
                          patientLastName: ''
                        }));
                        setSelectedPatientStats(null);
                        setPatientPackages([]);
                        setIsPatientDropdownOpen(true);
                      }}
                      className="text-[11px] text-emerald-800 hover:text-emerald-950 font-bold underline shrink-0 ml-2 cursor-pointer"
                    >
                      Cambiar
                    </button>
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</label>
              <input 
                type="date" 
                required
                className={cn(
                  "w-full px-3 py-2 bg-surface border rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]",
                  workingHours && newApt.date && !(workingHours.workingDays || workingHours.days || []).includes(new Date(newApt.date + 'T00:00:00').getDay() === 0 ? 7 : new Date(newApt.date + 'T00:00:00').getDay()) 
                    ? "border-amber-400 focus:ring-amber-500/20" 
                    : "border-outline-variant"
                )}
                value={newApt.date}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  const dayApps = appointments.filter(a => {
                    if (!a || !a.date || a.date !== nextDate) return false;
                    const st = (a.status || '').toLowerCase().trim();
                    return st !== 'cancelado' && st !== 'cancelled' && st !== 'anulado' && st !== 'ausente';
                  });
                  const isFirstOfDate = dayApps.length === 0;
                  const configuredStartTime = (workingHours?.morningActive !== false && workingHours?.morningStart)
                    ? workingHours.morningStart
                    : (workingHours?.afternoonStart || '08:00');

                  let proposedTime = newApt.time;
                  if (isFirstOfDate) {
                    proposedTime = configuredStartTime;
                  } else {
                    const updatedSlots = getSuggestedAvailableSlots(nextDate, effectiveNewAptDuration, appointments, workingHours);
                    const freeSlot = updatedSlots.find(s => !s.isConflict);
                    if (freeSlot) {
                      proposedTime = freeSlot.time;
                    }
                  }

                  setNewApt(prev => ({
                    ...prev,
                    date: nextDate,
                    time: proposedTime
                  }));
                }}
              />
              {workingHours && newApt.date && !(workingHours.workingDays || workingHours.days || []).includes(new Date(newApt.date + 'T00:00:00').getDay() === 0 ? 7 : new Date(newApt.date + 'T00:00:00').getDay()) && (
                <p className="text-[10px] text-purple-700 font-bold flex items-center gap-1">
                  <Zap size={10} className="fill-purple-700" /> Día no habitual (Sobre Turno)
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Hora de Inicio</label>
              <input 
                type="time" 
                required
                className={cn(
                  "w-full px-3 py-2 bg-surface border rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]",
                  newAptCollision.hasConflict ? "border-red-500 ring-1 ring-red-500/30" : "border-outline-variant"
                )}
                value={newApt.time}
                onChange={(e) => setNewApt({ ...newApt, time: e.target.value })}
              />
              <div className="text-[10px] text-on-surface-variant font-bold flex items-center justify-between">
                <span>Finaliza: <strong className="text-primary">{calculateEndTime(newApt.time, effectiveNewAptDuration)} hs</strong></span>
                <span className="text-on-surface-variant/70">({effectiveNewAptDuration} min)</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Tratamiento</label>
              {newApt.type && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  Duración requerida: {effectiveNewAptDuration} min
                </span>
              )}
            </div>
            <select 
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]"
              value={newApt.type}
              onChange={(e) => {
                const selected = e.target.value;
                const matched = treatments.find(t => t.name === selected);
                const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
                const nextDuration = getEffectiveDuration(matched, null, treatments, profDefault);

                const dayApps = appointments.filter(a => {
                  if (!a || !a.date || a.date !== newApt.date) return false;
                  const st = (a.status || '').toLowerCase().trim();
                  return st !== 'cancelado' && st !== 'cancelled' && st !== 'anulado' && st !== 'ausente';
                });
                const isFirstOfDate = dayApps.length === 0;
                const configuredStartTime = (workingHours?.morningActive !== false && workingHours?.morningStart)
                  ? workingHours.morningStart
                  : (workingHours?.afternoonStart || '08:00');

                let proposedTime = newApt.time;
                if (isFirstOfDate) {
                  // "Si es el primer turno, proponer siempre seguir el tiempo configurado"
                  proposedTime = configuredStartTime;
                } else {
                  // Si el horario actual colisiona con la nueva duración del tratamiento, proponer el primer turno dinámico libre
                  const currentCollision = checkScheduleCollision(newApt.date, newApt.time, nextDuration, appointments);
                  if (currentCollision.hasConflict) {
                    const updatedSlots = getSuggestedAvailableSlots(newApt.date, nextDuration, appointments, workingHours);
                    const freeSlot = updatedSlots.find(s => !s.isConflict);
                    if (freeSlot) {
                      proposedTime = freeSlot.time;
                    }
                  }
                }

                setNewApt(prev => ({
                  ...prev,
                  type: selected,
                  duration: nextDuration,
                  time: proposedTime
                }));
              }}
            >
              <option value="">Seleccione tratamiento...</option>
              {treatments.map(t => {
                const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
                const dispDur = getEffectiveDuration(t, null, treatments, profDefault);
                return (
                  <option key={t.id} value={t.name}>
                    {t.name} ({dispDur} min) {t.cost ? `— $${Number(t.cost).toLocaleString()}` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* HORARIOS SUGERIDOS DISPONIBLES (SIEMPRE VISIBLE AL AGENDAR) */}
          <SuggestedSlotsPicker
            slots={newAptSuggestedSlots}
            selectedTime={newApt.time}
            onSelectTime={(time) => setNewApt(prev => ({ ...prev, time }))}
            duration={effectiveNewAptDuration}
            treatmentName={newApt.type}
            dateStr={newApt.date}
            workingHours={workingHours}
            isFirstAppointment={newAptOccupiedSlots.length === 0}
          />

          {/* AVISO INFORMATIVO NO BLOQUEANTE DE SUPERPOSICIÓN / SOBRETURNO */}
          {newAptCollision.hasConflict && (
            <div className="p-3.5 bg-purple-50/95 border border-purple-300 rounded-xl space-y-2 text-purple-950 animate-in fade-in">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black flex items-center gap-1.5 text-purple-900 text-[12px]">
                  <Zap size={15} className="text-purple-600 fill-purple-600 shrink-0" />
                  Superposición horaria detectada
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300">
                  Sobreturno Permitido
                </span>
              </div>
              <p className="text-[12px] text-purple-900 font-medium leading-snug">
                {newAptCollision.conflictSummary || newAptCollision.message}
              </p>
              {newAptCollision.detailedConflicts && newAptCollision.detailedConflicts.length > 0 && (
                <div className="space-y-1 pt-1">
                  {newAptCollision.detailedConflicts.map(conf => (
                    <div key={conf.id} className="text-[11px] bg-white/80 px-2.5 py-1 rounded-lg border border-purple-200 flex items-center justify-between text-purple-950">
                      <span className="font-bold truncate">{conf.patientName}</span>
                      <span className="font-mono text-purple-700 text-[10px] font-bold shrink-0">
                        {conf.time} - {conf.endTime} hs ({conf.treatment})
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-purple-800 italic">
                La agenda no bloquea la operación: el turno se guardará válidamente clasificado como <strong>SOBRETURNO</strong>.
              </p>
            </div>
          )}

          {/* LISTADO DE TURNOS BLOQUEADOS EN EL DÍA */}
          {newAptOccupiedSlots.length > 0 && (
            <div className="p-2.5 bg-surface-bright rounded-xl border border-outline-variant space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <CalendarClock size={13} className="text-primary" />
                  Turnos agendados en esta fecha ({newAptOccupiedSlots.length})
                </span>
                <span className="text-[10px] font-medium opacity-70">Horarios bloqueados</span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {newAptOccupiedSlots.map((slot) => {
                  const isConflictSlot = newAptCollision.hasConflict && newAptCollision.conflictingAppointment?.id === slot.id;
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] flex items-center justify-between border",
                        isConflictSlot
                          ? "bg-red-100/90 border-red-300 text-red-950 font-bold"
                          : "bg-white border-outline-variant text-on-surface"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={cn("font-mono font-bold", isConflictSlot ? "text-red-700" : "text-primary")}>
                          {slot.time} - {slot.endTime} hs
                        </span>
                        <span className="truncate">{slot.patientName}</span>
                        <span className="text-[10px] text-on-surface-variant font-medium">({slot.treatment})</span>
                      </div>
                      {slot.isOverturn && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 shrink-0">
                          Sobre Turno
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AVISO DE SOBRE TURNO (FUERA DE HORARIO HABITUAL) */}
          {newAptOutsideCheck.isOutside && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1 text-purple-950">
              <div className="flex items-center justify-between">
                <span className="font-black flex items-center gap-1.5 text-purple-900 uppercase tracking-wide text-[11px]">
                  <Zap size={14} className="text-purple-600 fill-purple-600 shrink-0" />
                  Turno fuera de horario habitual
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300">
                  Sobre Turno
                </span>
              </div>
              <p className="text-[11px] text-purple-800">
                {newAptOutsideCheck.reason}. Se registrará con la etiqueta oficial de <strong>SOBRE TURNO</strong>.
              </p>
            </div>
          )}

          {/* Toggle manual de Sobre Turno */}
          <label className="flex items-center gap-2.5 p-2.5 bg-purple-50/50 hover:bg-purple-50 rounded-xl border border-purple-200 cursor-pointer select-none text-xs font-bold text-purple-950 transition-colors">
            <input
              type="checkbox"
              checked={isNewAptOverturn}
              onChange={(e) => setNewApt(prev => ({
                ...prev,
                isOverturn: e.target.checked,
                manualOverturn: true
              }))}
              className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              <Zap size={13} className="text-purple-600 fill-purple-600" />
              <span>Marcar como <strong>Sobre Turno</strong> (Turno de excepción extraordinario)</span>
            </div>
          </label>

          {/* Selector de Sesión de Paquete si el paciente cuenta con paquetes activos */}
          {!isCreatingNewPatient && patientPackages.some(p => p.status === 'active' && (p.remainingSessions || 0) > 0) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles size={13} className="text-amber-600" />
                  Cubrir con Paquete Adquirido
                </span>
                {newApt.isPackageSession && (
                  <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                    $0 Abonado previamente
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-800">
                El paciente tiene paquetes comprados. Puedes cubrir este turno sin costo adicional:
              </p>
              <select
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-[12px] font-bold text-on-surface outline-none focus:ring-1 focus:ring-amber-500"
                value={newApt.isPackageSession ? `${newApt.patientPackageId}:::${newApt.type}` : 'none'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'none') {
                    setNewApt({
                      ...newApt,
                      isPackageSession: false,
                      patientPackageId: '',
                      packageName: ''
                    });
                  } else {
                    const [pkgId, treatName] = val.split(':::');
                    const foundPkg = patientPackages.find(p => p.id === pkgId);
                    setNewApt({
                      ...newApt,
                      isPackageSession: true,
                      patientPackageId: pkgId,
                      packageName: foundPkg?.packageName || 'Paquete',
                      type: treatName
                    });
                  }
                }}
              >
                <option value="none">No usar paquete (tarifa estándar del tratamiento)</option>
                {patientPackages
                  .filter(p => p.status === 'active' && (p.remainingSessions || 0) > 0)
                  .flatMap(pkg =>
                    (pkg.items || [])
                      .filter(item => (item.remainingQuantity || 0) > 0)
                      .map((item, idx) => (
                        <option key={`${pkg.id}-${idx}`} value={`${pkg.id}:::${item.treatmentName}`}>
                          🎁 [{pkg.packageName}] {item.treatmentName} ({item.remainingQuantity} restantes) — $0
                        </option>
                      ))
                  )}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Notas</label>
            <textarea 
              rows={2}
              placeholder="Agregar observaciones..."
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px] resize-none"
              value={newApt.notes}
              onChange={(e) => setNewApt({ ...newApt, notes: e.target.value })}
            />
          </div>
            </>
          )}

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={() => setIsNewAppointmentOpen(false)}
              className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-wider cursor-pointer"
            >
              CANCELAR
            </button>
            <button 
              type="submit"
              disabled={(!isBlockingAgenda && !isCreatingNewPatient && !newApt.patientId) || isSubmittingAppointment}
              className={cn(
                "flex-1 px-4 py-2.5 text-white text-[12px] font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer",
                isSubmittingAppointment ? "opacity-70 cursor-not-allowed bg-slate-500" : (
                  isBlockingAgenda
                    ? "bg-slate-800 hover:bg-slate-900 shadow-slate-900/10"
                    : (
                      newAptCollision.hasConflict || isNewAptOverturn
                        ? "bg-purple-700 hover:bg-purple-800"
                        : "bg-primary hover:bg-primary/90"
                    )
                )
              )}
            >
              {isSubmittingAppointment ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  GUARDANDO...
                </>
              ) : isBlockingAgenda ? (
                <>
                  <Lock size={14} />
                  BLOQUEAR AGENDA
                </>
              ) : newAptCollision.hasConflict ? (
                <>
                  <Zap size={14} className="fill-white" />
                  GUARDAR COMO SOBRETURNO
                </>
              ) : isNewAptOverturn ? (
                <>
                  <Zap size={14} className="fill-white" />
                  GUARDAR SOBRE TURNO
                </>
              ) : (
                'GUARDAR TURNO'
              )}
            </button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        title={selectedAppointment?.isBlocked || selectedAppointment?.status === 'bloqueado' ? "Detalles del Bloqueo de Agenda" : "Detalles del Turno"}
      >
        {selectedAppointment && (() => {
          const isBlocked = selectedAppointment.isBlocked || selectedAppointment.status === 'bloqueado';

          if (isBlocked) {
            return (
              <div className="space-y-6">
                {/* Header Bloqueo */}
                <div className="flex items-center gap-4 p-4 rounded-xl border border-l-4 border-slate-300 border-l-slate-700 bg-slate-50">
                  <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-lg font-bold shrink-0">
                    <Lock size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-base font-black text-slate-900 truncate">
                        {selectedAppointment.blockReason || (selectedAppointment.patientName ? selectedAppointment.patientName.replace('[Bloqueado] ', '') : 'Bloqueo de Agenda')}
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border bg-slate-200 text-slate-800 border-slate-300 flex items-center gap-1 shrink-0">
                        <Lock size={10} />
                        Bloqueado
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                      {selectedAppointment.isAllDayBlock
                        ? 'Jornada Completa'
                        : `${selectedAppointment.time} a ${selectedAppointment.endTime || calculateEndTime(selectedAppointment.time, selectedAppointment.duration || 60)} hs (${selectedAppointment.duration || 60} min)`}
                    </p>
                  </div>
                </div>

                {/* Fecha y Franja Horaria */}
                <div className="p-4 bg-surface-bright rounded-xl border border-outline-variant space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-bold shrink-0">
                      <CalendarClock size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Día y Franja Reservada</p>
                      <p className="text-[13px] font-bold text-on-surface">
                        {selectedAppointment.date} {selectedAppointment.isAllDayBlock ? '(Todo el día)' : `de ${selectedAppointment.time} a ${selectedAppointment.endTime || calculateEndTime(selectedAppointment.time, selectedAppointment.duration || 60)} hs`}
                      </p>
                      <p className="text-[11px] font-semibold text-on-surface-variant">
                        Tipo: {selectedAppointment.isAllDayBlock ? 'Bloqueo total de jornada' : `Reserva de ${selectedAppointment.duration || 60} minutos`}
                      </p>
                    </div>
                  </div>

                  {selectedAppointment.notes && (
                    <div className="pt-2 border-t border-outline-variant/60">
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Notas / Observaciones</p>
                      <p className="text-xs text-on-surface bg-surface p-2.5 rounded-lg border border-outline-variant">
                        {selectedAppointment.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Aviso Explicativo */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    Durante este intervalo ningún paciente podrá agendar turnos ni el sistema sugerirá este horario como libre. Si necesitas habilitar este horario para atención, presiona <strong>Desbloquear Horario</strong>.
                  </p>
                </div>

                {/* Acciones */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleUnblockAppointment(selectedAppointment.id)}
                    className="w-full sm:flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <Trash2 size={15} />
                    Desbloquear Horario
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      handleOpenBlockModal(selectedAppointment.date, selectedAppointment.time, selectedAppointment);
                    }}
                    className="w-full sm:flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <Edit2 size={14} />
                    Modificar Bloqueo
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDetailModalOpen(false)}
                    className="w-full sm:w-auto py-2.5 px-4 bg-white hover:bg-surface text-on-surface border border-outline-variant text-xs font-bold rounded-xl transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            );
          }

          const modalStatusStyles = getAppointmentStatusStyles(selectedAppointment.status);
          const isFinishedAppointment = selectedAppointment.status === 'finished' || selectedAppointment.status === 'finalizado';
          return (
            <div className="space-y-6">
              <div className={cn(
                "flex items-center gap-4 p-4 rounded-xl border border-l-4 bg-surface-bright",
                modalStatusStyles.borderColor,
                modalStatusStyles.borderLeftColor
              )}>
                <div className="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center text-lg font-bold">
                  {selectedAppointment.patientName.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-on-surface">{selectedAppointment.patientName}</h4>
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border",
                      modalStatusStyles.badgeBg,
                      modalStatusStyles.badgeText,
                      modalStatusStyles.badgeBorder
                    )}>
                      {modalStatusStyles.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant tracking-wide uppercase font-bold">
                    {selectedAppointment.time} • {selectedAppointment.duration || 30} min
                  </p>
                  {getPatientPhone(selectedAppointment) && (
                    <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                      <Phone size={11} />
                      {getPatientPhone(selectedAppointment)}
                    </p>
                  )}
                </div>
              </div>

              {/* Fecha y Hora con botón de edición */}
              <div className="p-4 bg-surface-bright rounded-xl border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                    <CalendarClock size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Fecha y Horario Bloqueado</p>
                    <p className="text-[13px] font-bold text-on-surface">
                      {selectedAppointment.date} de {selectedAppointment.time} a {selectedAppointment.endTime || calculateEndTime(selectedAppointment.time, selectedAppointment.duration || 30)} hs
                    </p>
                    <p className="text-[11px] font-semibold text-on-surface-variant">
                      Duración: {selectedAppointment.duration || 30} minutos
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const phone = getAppointmentPatientPhone(selectedAppointment);
                      setReminderModalApt({
                        ...selectedAppointment,
                        patientPhone: phone
                      });
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider shadow-sm cursor-pointer"
                  >
                    <MessageCircle size={14} />
                    Recordatorio WhatsApp
                  </button>
                  {!isFinishedAppointment && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditAppointment(selectedAppointment)}
                      className="px-3 py-2 bg-primary text-white hover:bg-primary/90 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider shadow-sm cursor-pointer"
                    >
                      <Edit2 size={13} />
                      Editar Fecha / Hora
                    </button>
                  )}
                </div>
              </div>

              {selectedAppointment.isOverturn && (
                <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-200 text-purple-900 flex items-center justify-center shrink-0">
                        <Zap size={16} className="fill-purple-700 text-purple-700" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-purple-900">Turno de Excepción</p>
                        <p className="text-[12px] font-bold text-purple-950">
                          {selectedAppointment.overturnReason || 'Atención registrada con clasificación de SOBRETURNO'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black text-purple-900 bg-white px-2.5 py-1 rounded-md border border-purple-300 shadow-2xs shrink-0">
                      ⚡ SOBRE TURNO
                    </span>
                  </div>
                  {selectedAppointment.overlappingAppointmentIds && selectedAppointment.overlappingAppointmentIds.length > 0 && (
                    <div className="pt-1.5 border-t border-purple-200/80 text-[11px] text-purple-900">
                      <p className="font-semibold text-[10px] uppercase tracking-wider mb-1 opacity-80">
                        Coincide en horario con ({selectedAppointment.overlappingAppointmentIds.length}) turno(s):
                      </p>
                      <div className="space-y-1">
                        {appointments
                          .filter(a => selectedAppointment.overlappingAppointmentIds?.includes(a.id))
                          .map(conf => (
                            <div key={conf.id} className="bg-white/80 px-2 py-1 rounded border border-purple-200 flex justify-between items-center text-[11px]">
                              <span className="font-bold">{conf.patientName}</span>
                              <span className="font-mono text-[10px] text-purple-800 font-semibold">{conf.time} - {conf.endTime || calculateEndTime(conf.time, conf.duration || 30)} hs</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedAppointment.isPackageSession && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                      <Package size={16} className="text-emerald-700" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Sesión Cubierta por Paquete</p>
                      <p className="text-[12px] font-bold text-emerald-900">{selectedAppointment.packageName || 'Paquete de tratamientos'}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-md border border-emerald-300 shadow-xs">
                    $0 (Ya abonado)
                  </span>
                </div>
              )}

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

              {selectedAppointment.notes && (
                <div className="p-3 bg-surface rounded-xl border border-outline-variant">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Notas</p>
                  <p className="text-[12px] text-on-surface">{selectedAppointment.notes}</p>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                    {isFinishedAppointment ? 'Estado del Turno' : 'Cambiar Estado'}
                  </label>
                  {isFinishedAppointment && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      Finalizado (Definitivo)
                    </span>
                  )}
                </div>

                {isFinishedAppointment && (
                  <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-emerald-950">Turno Completado</p>
                      <p className="text-[11px] text-emerald-800">
                        Este turno ya fue finalizado. Por seguridad clínica y de inventario, no se permite volver a un estado anterior.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'pendiente', label: 'Pendiente', color: 'bg-amber-500' },
                    { id: 'confirmed', label: 'Confirmado', color: 'bg-primary' },
                    { id: 'in-session', label: 'En Sesión', color: 'bg-teal-600' },
                    { id: 'finished', label: 'Finalizado', color: 'bg-emerald-600' },
                    { id: 'cancelado', label: 'Cancelado', color: 'bg-error' },
                    { id: 'ausente', label: 'Ausente', color: 'bg-orange-500' },
                  ].map((s) => {
                    const isCurrent = selectedAppointment.status === s.id;
                    return (
                      <button
                        key={s.id}
                        disabled={isFinishedAppointment && !isCurrent}
                        onClick={() => !isFinishedAppointment && handleUpdateStatus(s.id)}
                        className={cn(
                          "px-3 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                          isCurrent 
                            ? `${s.color} text-white border-transparent shadow-sm ring-2 ring-offset-1 ring-emerald-500` 
                            : isFinishedAppointment
                              ? "bg-surface-dim/40 border-outline-variant/40 text-on-surface-variant/40 cursor-not-allowed opacity-40"
                              : "bg-white border-outline-variant text-on-surface-variant hover:bg-surface cursor-pointer"
                        )}
                      >
                        <div className={cn("w-1.5 h-1.5 rounded-full", isCurrent ? "bg-white" : s.color)} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-2.5">
                <button 
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant text-[11px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest text-on-surface-variant"
                >
                  Cerrar
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    const targetPatientId = selectedAppointment?.patientId || patients.find(p => p.name?.trim().toLowerCase() === selectedAppointment?.patientName?.trim().toLowerCase())?.id;
                    if (targetPatientId) {
                      navigate(`/patients?id=${targetPatientId}&appointmentId=${selectedAppointment.id}&action=add-entry`);
                    }
                    setIsDetailModalOpen(false);
                  }}
                  className={cn(
                    "px-4 py-2 bg-surface-variant text-on-surface text-[11px] font-bold rounded-lg hover:bg-surface-variant/80 border border-outline-variant transition-colors uppercase tracking-widest cursor-pointer",
                    isFinishedAppointment && "flex-1"
                  )}
                >
                  Ver Ficha
                </button>
                {selectedAppointment.status === 'in-session' ? (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      const targetPatientId = selectedAppointment?.patientId || patients.find(p => p.name?.trim().toLowerCase() === selectedAppointment?.patientName?.trim().toLowerCase())?.id;
                      if (targetPatientId) {
                        navigate(`/patients?id=${targetPatientId}&appointmentId=${selectedAppointment.id}&action=add-entry`);
                      } else {
                        handleOpenClinicalHistory(selectedAppointment);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-tertiary text-white text-[11px] font-bold rounded-lg hover:bg-tertiary/90 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm animate-pulse cursor-pointer"
                  >
                    <Stethoscope size={13} />
                    Evolución (En Sesión)
                  </button>
                ) : isFinishedAppointment ? null : (
                  <button 
                    type="button"
                    onClick={async () => {
                      await handleUpdateStatus('in-session');
                    }}
                    className="flex-1 px-4 py-2 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary/90 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Stethoscope size={13} />
                    Atender (Poner En Sesión)
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Modal Editar Fecha y Hora del Turno */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Fecha y Hora del Turno"
      >
        <form onSubmit={handleSaveEditedAppointment} className="space-y-4">
          <div className="p-4 bg-surface-bright rounded-xl border border-outline-variant flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Paciente</p>
              <h4 className="text-sm font-bold text-on-surface">{editAptData.patientName}</h4>
            </div>
            <span className="text-[10px] font-black uppercase px-2 py-1 bg-surface rounded-md border border-outline-variant text-on-surface-variant">
              {editAptData.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                Nueva Fecha
              </label>
              <input
                type="date"
                required
                value={editAptData.date}
                onChange={(e) => setEditAptData({ ...editAptData, date: e.target.value })}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                Hora de Inicio
              </label>
              <input
                type="time"
                required
                value={editAptData.time}
                onChange={(e) => setEditAptData({ ...editAptData, time: e.target.value })}
                className={cn(
                  "w-full px-3 py-2 bg-surface rounded-lg border text-sm font-bold text-on-surface focus:outline-none focus:border-primary",
                  editAptCollision.hasConflict ? "border-red-500 ring-1 ring-red-500/30" : "border-outline-variant"
                )}
              />
              <div className="text-[10px] text-on-surface-variant font-bold flex items-center justify-between mt-1">
                <span>Finaliza: <strong className="text-primary">{calculateEndTime(editAptData.time, effectiveEditAptDuration)} hs</strong></span>
                <span className="text-on-surface-variant/70">({effectiveEditAptDuration} min)</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                Tratamiento
              </label>
              {editAptData.type && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  Duración requerida: {effectiveEditAptDuration} min
                </span>
              )}
            </div>
            <select
              value={editAptData.type}
              onChange={(e) => {
                const selected = e.target.value;
                const matched = treatments.find(t => t.name === selected);
                const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
                const nextDuration = getEffectiveDuration(matched, null, treatments, profDefault);
                setEditAptData(prev => ({
                  ...prev,
                  type: selected,
                  duration: nextDuration
                }));
              }}
              className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
            >
              {treatments.length > 0 ? (
                treatments.map((t) => {
                  const profDefault = Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30;
                  const dispDur = getEffectiveDuration(t, null, treatments, profDefault);
                  return (
                    <option key={t.id} value={t.name}>{t.name} ({dispDur}m)</option>
                  );
                })
              ) : (
                <option value="Check-up General">Check-up General ({Number(workingHours?.appointmentDurationMinutes) > 0 ? Number(workingHours.appointmentDurationMinutes) : 30}m)</option>
              )}
            </select>
          </div>

          {/* HORARIOS SUGERIDOS DISPONIBLES (SIEMPRE VISIBLE AL EDITAR) */}
          <SuggestedSlotsPicker
            slots={editAptSuggestedSlots}
            selectedTime={editAptData.time}
            onSelectTime={(time) => setEditAptData(prev => ({ ...prev, time }))}
            duration={effectiveEditAptDuration}
            treatmentName={editAptData.type}
            dateStr={editAptData.date}
            workingHours={workingHours}
            isFirstAppointment={editAptOccupiedSlots.length === 0}
          />

          {/* AVISO INFORMATIVO NO BLOQUEANTE DE SUPERPOSICIÓN / SOBRETURNO */}
          {editAptCollision.hasConflict && (
            <div className="p-3.5 bg-purple-50/95 border border-purple-300 rounded-xl space-y-2 text-purple-950 animate-in fade-in">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black flex items-center gap-1.5 text-purple-900 text-[12px]">
                  <Zap size={15} className="text-purple-600 fill-purple-600 shrink-0" />
                  Superposición horaria detectada
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300">
                  Sobreturno Permitido
                </span>
              </div>
              <p className="text-[12px] text-purple-900 font-medium leading-snug">
                {editAptCollision.conflictSummary || editAptCollision.message}
              </p>
              {editAptCollision.detailedConflicts && editAptCollision.detailedConflicts.length > 0 && (
                <div className="space-y-1 pt-1">
                  {editAptCollision.detailedConflicts.map(conf => (
                    <div key={conf.id} className="text-[11px] bg-white/80 px-2.5 py-1 rounded-lg border border-purple-200 flex items-center justify-between text-purple-950">
                      <span className="font-bold truncate">{conf.patientName}</span>
                      <span className="font-mono text-purple-700 text-[10px] font-bold shrink-0">
                        {conf.time} - {conf.endTime} hs ({conf.treatment})
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-purple-800 italic">
                La agenda permite guardar el turno reprogramado como <strong>SOBRETURNO</strong> sin bloquear la operación.
              </p>
            </div>
          )}

          {/* LISTADO DE TURNOS BLOQUEADOS EN EL DÍA */}
          {editAptOccupiedSlots.length > 0 && (
            <div className="p-2.5 bg-surface-bright rounded-xl border border-outline-variant space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <CalendarClock size={13} className="text-primary" />
                  Turnos agendados en esta fecha ({editAptOccupiedSlots.length})
                </span>
                <span className="text-[10px] font-medium opacity-70">Horarios bloqueados</span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {editAptOccupiedSlots.map((slot) => {
                  const isConflictSlot = editAptCollision.hasConflict && editAptCollision.conflictingAppointment?.id === slot.id;
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] flex items-center justify-between border",
                        isConflictSlot
                          ? "bg-red-100/90 border-red-300 text-red-950 font-bold"
                          : "bg-white border-outline-variant text-on-surface"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={cn("font-mono font-bold", isConflictSlot ? "text-red-700" : "text-primary")}>
                          {slot.time} - {slot.endTime} hs
                        </span>
                        <span className="truncate">{slot.patientName}</span>
                        <span className="text-[10px] text-on-surface-variant font-medium">({slot.treatment})</span>
                      </div>
                      {slot.isOverturn && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 shrink-0">
                          Sobre Turno
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AVISO DE SOBRE TURNO (FUERA DE HORARIO HABITUAL) */}
          {editAptOutsideCheck.isOutside && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1 text-purple-950">
              <div className="flex items-center justify-between">
                <span className="font-black flex items-center gap-1.5 text-purple-900 uppercase tracking-wide text-[11px]">
                  <Zap size={14} className="text-purple-600 fill-purple-600 shrink-0" />
                  Reprogramado fuera de horario habitual
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300">
                  Sobre Turno
                </span>
              </div>
              <p className="text-[11px] text-purple-800">
                {editAptOutsideCheck.reason}. Se guardará con la etiqueta oficial de <strong>SOBRE TURNO</strong>.
              </p>
            </div>
          )}

          {/* Toggle manual de Sobre Turno */}
          <label className="flex items-center gap-2.5 p-2.5 bg-purple-50/50 hover:bg-purple-50 rounded-xl border border-purple-200 cursor-pointer select-none text-xs font-bold text-purple-950 transition-colors">
            <input
              type="checkbox"
              checked={isEditAptOverturn}
              onChange={(e) => setEditAptData(prev => ({
                ...prev,
                isOverturn: e.target.checked,
                manualOverturn: true
              }))}
              className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              <Zap size={13} className="text-purple-600 fill-purple-600" />
              <span>Marcar como <strong>Sobre Turno</strong> (Turno de excepción extraordinario)</span>
            </div>
          </label>

          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">
              Notas / Observaciones
            </label>
            <textarea
              rows={2}
              value={editAptData.notes}
              onChange={(e) => setEditAptData({ ...editAptData, notes: e.target.value })}
              placeholder="Motivo de la reprogramación o notas..."
              className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingAppointment}
              className={cn(
                "flex-1 px-4 py-2.5 text-white text-[12px] font-bold rounded-lg shadow-sm transition-all uppercase tracking-widest flex items-center justify-center gap-2",
                isSubmittingAppointment ? "opacity-70 cursor-not-allowed bg-slate-500" : (
                  editAptCollision.hasConflict || isEditAptOverturn
                    ? "bg-purple-700 hover:bg-purple-800"
                    : "bg-primary hover:bg-primary/90"
                )
              )}
            >
              {isSubmittingAppointment ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando...
                </>
              ) : editAptCollision.hasConflict ? (
                <>
                  <Zap size={15} className="fill-white" />
                  Guardar como Sobreturno
                </>
              ) : isEditAptOverturn ? (
                <>
                  <Zap size={15} className="fill-white" />
                  Guardar Sobre Turno
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Guardar Cambios
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Bloquear Horario / Agenda */}
      <Modal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        title={blockData.id ? "Modificar Bloqueo de Agenda" : "Bloquear Horario de Agenda"}
      >
        <form onSubmit={handleSaveBlock} className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
            <Lock size={16} className="text-slate-600 shrink-0 mt-0.5" />
            <p>
              Bloquea un horario o la jornada completa para que no se puedan agendar turnos ni se sugiera este tiempo como disponible para pacientes.
            </p>
          </div>

          {/* Toggle Jornada Completa */}
          <label className="flex items-center gap-3 p-3 bg-surface-bright hover:bg-surface rounded-xl border border-outline-variant cursor-pointer select-none">
            <input
              type="checkbox"
              checked={blockData.isAllDay}
              onChange={(e) => setBlockData(prev => ({ ...prev, isAllDay: e.target.checked }))}
              className="rounded border-outline-variant text-slate-800 focus:ring-slate-500 w-4 h-4 cursor-pointer"
            />
            <div>
              <span className="text-xs font-bold text-on-surface block">Bloquear jornada completa (Todo el día)</span>
              <span className="text-[11px] text-on-surface-variant">Inhabilita la atención durante todo el día seleccionado</span>
            </div>
          </label>

          {/* Fecha y Hora de Inicio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                Fecha a Bloquear *
              </label>
              <input
                type="date"
                required
                value={blockData.date}
                onChange={(e) => setBlockData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {!blockData.isAllDay && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Hora de Inicio *
                </label>
                <input
                  type="time"
                  required
                  value={blockData.time}
                  onChange={(e) => setBlockData(prev => ({ ...prev, time: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>
            )}
          </div>

          {/* Selector de Duración (1h, 2h, o personalizada) */}
          {!blockData.isAllDay && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Tiempo a Bloquear
                </label>
                <span className="text-xs font-bold text-slate-800 font-mono">
                  Hasta las {calculateEndTime(blockData.time, blockData.duration)} hs ({blockData.duration} min)
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {[
                  { label: '30 min', val: 30 },
                  { label: '1 hora', val: 60 },
                  { label: '2 horas', val: 120 },
                  { label: '3 horas', val: 180 },
                  { label: '4 horas', val: 240 }
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setBlockData(prev => ({ ...prev, duration: item.val }))}
                    className={cn(
                      "py-2 px-2 rounded-lg text-xs font-bold border transition-all text-center cursor-pointer",
                      blockData.duration === item.val
                        ? "bg-slate-800 text-white border-slate-900 shadow-2xs"
                        : "bg-surface-bright text-on-surface border-outline-variant hover:bg-surface"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="pt-1 flex items-center gap-2">
                <span className="text-[11px] text-on-surface-variant font-medium">O duración personalizada:</span>
                <input
                  type="number"
                  min={10}
                  max={720}
                  step={5}
                  value={blockData.duration}
                  onChange={(e) => setBlockData(prev => ({ ...prev, duration: Math.max(10, Number(e.target.value)) }))}
                  className="w-24 px-2.5 py-1 bg-surface border border-outline-variant rounded-md text-xs font-mono font-bold text-on-surface outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-on-surface-variant">minutos</span>
              </div>
            </div>
          )}

          {/* Motivo de Bloqueo */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Motivo del Bloqueo
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Almuerzo / Descanso',
                'Trámite personal',
                'Congreso / Capacitación',
                'Reunión de equipo',
                'Asuntos médicos',
                'Feriado / Asueto'
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setBlockData(prev => ({ ...prev, reason }))}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer",
                    blockData.reason === reason
                      ? "bg-slate-800 text-white border-slate-900 shadow-2xs"
                      : "bg-surface text-on-surface border-outline-variant hover:bg-surface-bright"
                  )}
                >
                  {reason}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              placeholder="Ej: Almuerzo, Trámite, Capacitación, etc."
              value={blockData.reason}
              onChange={(e) => setBlockData(prev => ({ ...prev, reason: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Observaciones */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Observaciones adicionales (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Detalles sobre este bloqueo de agenda..."
              value={blockData.notes}
              onChange={(e) => setBlockData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Acciones */}
          <div className="pt-3 flex items-center gap-2.5">
            {blockData.id && (
              <button
                type="button"
                onClick={() => {
                  if (blockData.id) {
                    handleUnblockAppointment(blockData.id);
                    setIsBlockModalOpen(false);
                  }
                }}
                className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
              >
                <Trash2 size={14} />
                Desbloquear
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsBlockModalOpen(false)}
              className="flex-1 py-2.5 px-4 border border-outline-variant text-xs font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest text-on-surface cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingAppointment}
              className={cn(
                "flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm transition-all uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer",
                isSubmittingAppointment && "opacity-70 cursor-not-allowed"
              )}
            >
              {isSubmittingAppointment ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Lock size={14} />
                  {blockData.id ? 'Guardar Cambios' : 'Bloquear Agenda'}
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Historia Clínica — Flujo Automático In-Session */}
      {clinicalHistoryAppointment && (
        <ClinicalHistoryModal
          isOpen={isClinicalHistoryOpen}
          onClose={() => {
            setIsClinicalHistoryOpen(false);
            setClinicalHistoryAppointment(null);
            setClinicalHistoryPatient(null);
          }}
          appointment={clinicalHistoryAppointment}
          patient={clinicalHistoryPatient}
          ownerId={ownerId || ''}
          treatments={treatments}
          onSavedAndFinished={() => {
            // Turno finalizado y guardado
          }}
        />
      )}

      {/* Modal Recordatorio WhatsApp Manual */}
      {reminderModalApt && (
        <ReminderModal
          isOpen={Boolean(reminderModalApt)}
          onClose={() => setReminderModalApt(null)}
          appointment={reminderModalApt}
          clinicName={profile?.clinicName || 'nuestra clínica'}
          clinicAddress={profile?.clinicAddress || profile?.address || 'nuestra sede'}
          professionalName={
            (profile?.role !== 'secretaria' && profile?.name?.trim()) ||
            reminderModalApt.professionalName ||
            reminderModalApt.professional ||
            (profile?.name && profile.name.trim()) ||
            (profile?.displayName && profile.displayName.trim()) ||
            (user?.displayName && user.displayName.trim()) ||
            ''
          }
          onReminderSent={(aptId) => {
            showToast('Enlace de WhatsApp generado correctamente');
          }}
        />
      )}

      {/* Modal Exportar Agenda del Día */}
      <ExportDayAgendaModal
        isOpen={isExportDayModalOpen}
        onClose={() => setIsExportDayModalOpen(false)}
        initialDate={selectedDate}
        appointments={appointments}
        patients={patients}
        treatments={treatments}
        profile={profile}
      />
    </div>
  );
}
