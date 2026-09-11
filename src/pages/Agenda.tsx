import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock, Plus, Filter, User, MoreVertical, Search, CheckCircle2, AlertTriangle, Edit2, CalendarClock, Stethoscope, Package, Sparkles, Phone, MessageCircle, Zap, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { ClinicalHistoryModal } from '../components/ClinicalHistoryModal';
import { ReminderModal } from '../components/ReminderModal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, getDocs, increment, writeBatch, getDoc } from 'firebase/firestore';
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
  DayOccupiedSlot
} from '../lib/agendaUtils';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function Agenda() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { ownerId, profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [workingHours, setWorkingHours] = useState<any>(null);
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);

  useEffect(() => {
    if (!ownerId) return;

    // Fetch Working Hours
    getDoc(doc(db, 'users', ownerId)).then(docSnap => {
      if (docSnap.exists() && docSnap.data().schedule) {
        setWorkingHours(docSnap.data().schedule);
      }
    });
    if (!isNewAppointmentOpen) {
      setIsCreatingNewPatient(false);
      setNewPatientData({ firstName: '', lastName: '', name: '', phone: '', idNumber: '', birthDate: '' });
      setSearchTerm('');
    }
  }, [isNewAppointmentOpen]);

  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [reminderModalApt, setReminderModalApt] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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
  
  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

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

  // Duration calculations - completely automatic based on selected treatment
  const effectiveNewAptDuration = useMemo(() => {
    const matched = treatments.find(t => t.name === newApt.type);
    if (matched?.duration && Number(matched.duration) > 0) {
      return Number(matched.duration);
    }
    return newApt.duration && newApt.duration > 0 ? Number(newApt.duration) : 30;
  }, [newApt.type, newApt.duration, treatments]);

  // Calculate outside working hours with duration awareness
  const newAptOutsideCheck = useMemo(() => {
    return checkIsOutsideWorkingHours(newApt.date, newApt.time, workingHours, effectiveNewAptDuration);
  }, [newApt.date, newApt.time, workingHours, effectiveNewAptDuration]);

  const newAptCollision = useMemo(() => {
    return checkScheduleCollision(newApt.date, newApt.time, effectiveNewAptDuration, appointments);
  }, [newApt.date, newApt.time, effectiveNewAptDuration, appointments]);

  const isNewAptOverturn = useMemo(() => {
    if (newApt.manualOverturn) return Boolean(newApt.isOverturn);
    return newAptOutsideCheck.isOutside || Boolean(newApt.isOverturn);
  }, [newApt.manualOverturn, newApt.isOverturn, newAptOutsideCheck.isOutside]);

  // Occupied slots and suggested available free slots for new appointment date
  const newAptOccupiedSlots = useMemo(() => {
    return getDayOccupiedSlots(newApt.date, appointments);
  }, [newApt.date, appointments]);

  const newAptSuggestedSlots = useMemo(() => {
    return getSuggestedAvailableSlots(newApt.date, effectiveNewAptDuration, appointments, workingHours);
  }, [newApt.date, effectiveNewAptDuration, appointments, workingHours]);

  // Duration calculations for edit appointment - completely automatic based on selected treatment
  const effectiveEditAptDuration = useMemo(() => {
    const matched = treatments.find(t => t.name === editAptData.type);
    if (matched?.duration && Number(matched.duration) > 0) {
      return Number(matched.duration);
    }
    return editAptData.duration && editAptData.duration > 0 ? Number(editAptData.duration) : 30;
  }, [editAptData.type, editAptData.duration, treatments]);

  // Calculate outside working hours with duration awareness for edited appointment
  const editAptOutsideCheck = useMemo(() => {
    return checkIsOutsideWorkingHours(editAptData.date, editAptData.time, workingHours, effectiveEditAptDuration);
  }, [editAptData.date, editAptData.time, workingHours, effectiveEditAptDuration]);

  const editAptCollision = useMemo(() => {
    return checkScheduleCollision(editAptData.date, editAptData.time, effectiveEditAptDuration, appointments, editAptData.id);
  }, [editAptData.date, editAptData.time, effectiveEditAptDuration, appointments, editAptData.id]);

  const isEditAptOverturn = useMemo(() => {
    if (editAptData.manualOverturn) return Boolean(editAptData.isOverturn);
    return editAptOutsideCheck.isOutside || Boolean(editAptData.isOverturn);
  }, [editAptData.manualOverturn, editAptData.isOverturn, editAptOutsideCheck.isOutside]);

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
    const matchedTreatment = treatments[0];
    const initialDuration = matchedTreatment?.duration ? Number(matchedTreatment.duration) : 30;
    setNewApt({
      patientId: '',
      patientName: '',
      patientFirstName: '',
      patientLastName: '',
      date: targetDate || formatLocalDate(selectedDate || new Date()),
      time: targetTime || '09:00',
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
    setIsNewAppointmentOpen(true);
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
    try {
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

      // 1. Strict Overlap / Collision Prevention: Block if another appointment or treatment is already occupying the slot
      const collision = checkScheduleCollision(newApt.date, newApt.time, finalDuration, appointments);
      if (collision.hasConflict) {
        showToast(collision.message || 'No se pueden agendar 2 turnos en el mismo horario.', 'error');
        return;
      }

      // 2. Sobre Turno Detection: outside working hours qualifies as Sobre Turno
      const outsideCheck = checkIsOutsideWorkingHours(newApt.date, newApt.time, workingHours, finalDuration);
      const isOverturn = Boolean(newApt.manualOverturn ? newApt.isOverturn : (newApt.isOverturn || outsideCheck.isOutside));
      const endTime = calculateEndTime(newApt.time, finalDuration);

      const isPkg = Boolean(newApt.isPackageSession && newApt.patientPackageId);
      const treatmentPrice = isPkg ? 0 : (matchedTreatment?.cost ? Number(matchedTreatment.cost) : 0);

      const patientPhone = isCreatingNewPatient ? newPatientData.phone : (patient?.phone || '');

      await addDoc(collection(db, 'appointments'), {
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
        patientPackageId: isPkg ? newApt.patientPackageId : null,
        packageName: isPkg ? (newApt.packageName || null) : null,
        userId: ownerId,
        status: 'pendiente',
        duration: finalDuration,
        endTime,
        isOverturn,
        isOverturnTag: isOverturn ? 'Sobre Turno' : null,
        attendance: attendanceCount,
        startTime: appointmentDate, // Save as JS Date, Firestore converts to Timestamp
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setIsNewAppointmentOpen(false);
      setIsCreatingNewPatient(false);
      setNewPatientData({ firstName: '', lastName: '', name: '', phone: '', idNumber: '', birthDate: '' });
      setNewApt({ ...newApt, patientId: '', patientName: '', patientFirstName: '', patientLastName: '', notes: '', isPackageSession: false, patientPackageId: '', packageName: '', isOverturn: false, manualOverturn: false });
      setSearchTerm('');
      showToast(isOverturn ? '⚡ Turno guardado con etiqueta SOBRE TURNO' : 'Turno agendado correctamente', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appointments');
    }
  };

  const handleOpenClinicalHistory = (apt: any) => {
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
    try {
      // User request: When changing status to 'in-session', automatically open the clinical history modal
      if (status === 'in-session') {
        await updateDoc(doc(db, 'appointments', selectedAppointment.id), {
          status: 'in-session',
          updatedAt: serverTimestamp()
        });

        setIsDetailModalOpen(false);

        const patient = patients.find(p => p.id === selectedAppointment.patientId) || {
          id: selectedAppointment.patientId,
          name: selectedAppointment.patientName,
          phone: selectedAppointment.phone || '',
          idNumber: selectedAppointment.idNumber || ''
        };

        setClinicalHistoryAppointment({ ...selectedAppointment, status: 'in-session' });
        setClinicalHistoryPatient(patient);
        setIsClinicalHistoryOpen(true);
        showToast('Turno en sesión. Abriendo historia clínica...', 'success');
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
    const matched = treatments.find(t => t.name === (apt.type || apt.treatment));
    const initialDuration = Number(apt.duration) || (matched?.duration ? Number(matched.duration) : 30);
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
    if (!editAptData.id) return;
    try {
      const [year, month, day] = editAptData.date.split('-').map(Number);
      const [hours, minutes] = editAptData.time.split(':').map(Number);
      const appointmentDate = new Date(year, month - 1, day, hours, minutes);

      const matchedTreatment = treatments.find(t => t.name === editAptData.type);
      const finalDuration = effectiveEditAptDuration;

      // 1. Strict Overlap / Collision Prevention: Block if another appointment or treatment is already occupying the slot
      const collision = checkScheduleCollision(editAptData.date, editAptData.time, finalDuration, appointments, editAptData.id);
      if (collision.hasConflict) {
        showToast(collision.message || 'No se pueden agendar 2 turnos en el mismo horario.', 'error');
        return;
      }

      // 2. Sobre Turno Detection: outside working hours qualifies as Sobre Turno
      const outsideCheck = checkIsOutsideWorkingHours(editAptData.date, editAptData.time, workingHours, finalDuration);
      const isOverturn = Boolean(editAptData.manualOverturn ? editAptData.isOverturn : (editAptData.isOverturn || outsideCheck.isOutside));
      const endTime = calculateEndTime(editAptData.time, finalDuration);

      await updateDoc(doc(db, 'appointments', editAptData.id), {
        date: editAptData.date,
        time: editAptData.time,
        endTime,
        duration: finalDuration,
        isOverturn,
        isOverturnTag: isOverturn ? 'Sobre Turno' : null,
        type: editAptData.type,
        treatment: editAptData.type,
        treatmentId: matchedTreatment?.id || '',
        notes: editAptData.notes || '',
        startTime: appointmentDate,
        updatedAt: serverTimestamp()
      });

      setIsEditModalOpen(false);
      showToast(isOverturn ? '⚡ Turno actualizado con etiqueta SOBRE TURNO' : 'Fecha y hora del turno actualizadas correctamente', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${editAptData.id}`);
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

  const selectedDateAppointments = appointments.filter(a => a.date === formatLocalDate(selectedDate));

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
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
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
            onClick={() => handleOpenNewAppointment()}
            className="px-3 sm:px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 sm:gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-xs uppercase tracking-wider shrink-0"
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
                        {dayAppointments.slice(0, 3).map((apt) => (
                          <span 
                            key={apt.id} 
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              apt.status === 'pendiente' ? "bg-amber-500" :
                              apt.status === 'confirmed' ? "bg-primary" :
                              apt.status === 'in-session' ? "bg-purple-600" :
                              apt.status === 'finished' ? "bg-emerald-600" :
                              apt.status === 'cancelado' ? "bg-red-500" :
                              "bg-on-surface-variant"
                            )} 
                          />
                        ))}
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
                          .map((apt) => (
                            <div 
                              key={apt.id} 
                              className={cn(
                                "w-full px-1.5 py-0.5 rounded text-[10px] font-bold truncate border flex items-center gap-1",
                                apt.isOverturn && "ring-1 ring-purple-400 bg-purple-50/80 text-purple-900 border-purple-200",
                                !apt.isOverturn && (
                                  apt.status === 'pendiente' ? "bg-amber-100/50 text-amber-700 border-amber-200" :
                                  apt.status === 'confirmed' ? "bg-primary-container/30 text-primary border-primary/20" :
                                  apt.status === 'in-session' ? "bg-tertiary-container/30 text-tertiary border-tertiary/20" :
                                  apt.status === 'finished' ? "bg-secondary-container/30 text-secondary border-secondary/20" :
                                  "bg-surface-dim text-on-surface-variant border-outline-variant"
                                )
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current" />
                              {apt.isOverturn && (
                                <span className="px-1 py-0.2 rounded bg-purple-200 text-purple-900 text-[8px] font-black uppercase shrink-0 flex items-center gap-0.5">
                                  <Zap size={7} className="fill-purple-700 text-purple-700" />
                                  Sobre Turno
                                </span>
                              )}
                              {apt.isPackageSession && <Package size={9} className="shrink-0 text-emerald-600" />}
                              <span className="truncate">{apt.patientName}</span>
                            </div>
                          ))
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
                        {appointments
                          .filter(a => a.date === formatLocalDate(dayDate))
                          .map((apt) => {
                            const [h, m] = apt.time.split(':').map(Number);
                            if (h < startHour || h > hours[hours.length - 1]) return null;
                            const duration = apt.duration || 30;
                            const calculatedEnd = apt.endTime || calculateEndTime(apt.time, duration);
                            return (
                              <div
                                key={apt.id}
                                onClick={() => handleAppointmentClick(apt)}
                                className={cn(
                                  "absolute left-1 right-1 p-1.5 sm:p-2 rounded-lg border-l-4 shadow-sm cursor-pointer z-10 transition-all hover:scale-[1.02] overflow-hidden",
                                  apt.isOverturn ? "ring-2 ring-purple-400 bg-purple-50/95 border-l-purple-600 text-purple-950" :
                                  apt.status === 'pendiente' ? "bg-amber-50 border-amber-400 text-amber-700" :
                                  apt.status === 'confirmed' ? "bg-primary-container/20 border-primary text-primary" : 
                                  apt.status === 'in-session' ? "bg-tertiary-container/20 border-tertiary text-tertiary" : 
                                  apt.status === 'finished' ? "bg-secondary-container/20 border-secondary text-secondary" :
                                  "bg-surface border-outline-variant text-on-surface-variant opacity-80"
                                )}
                                style={{
                                  top: `${((h - startHour) * 60 + m)}px`,
                                  height: `${Math.max(28, duration - 2)}px`
                                }}
                              >
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
                  {selectedDateAppointments.map((apt) => {
                    const [h, m] = apt.time.split(':').map(Number);
                    if (h < startHour || h > hours[hours.length - 1]) return null;
                    const duration = apt.duration || 30;
                    const calculatedEnd = apt.endTime || calculateEndTime(apt.time, duration);
                    return (
                      <motion.div
                        key={apt.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => handleAppointmentClick(apt)}
                        className={cn(
                          "absolute left-2 right-2 sm:left-4 sm:right-8 p-2.5 sm:p-4 rounded-xl border-l-[4px] sm:border-l-[6px] shadow-md cursor-pointer z-10 flex flex-col justify-center gap-1 transition-all hover:translate-x-1",
                          apt.isOverturn ? "ring-2 ring-purple-400 bg-purple-50/95 border-l-purple-600 text-purple-950 shadow-purple-900/10" :
                          apt.status === 'pendiente' ? "bg-amber-50 border-amber-400 text-amber-700 shadow-amber-950/5" :
                          apt.status === 'confirmed' ? "bg-primary-container/30 border-primary text-primary" : 
                          apt.status === 'in-session' ? "bg-tertiary-container/30 border-tertiary text-tertiary shadow-tertiary/10" : 
                          apt.status === 'finished' ? "bg-secondary-container/30 border-secondary text-secondary" :
                          "bg-surface border-outline-variant text-on-surface-variant opacity-80"
                        )}
                        style={{
                          top: `${((h - startHour) * 100 + (m / 60) * 100)}px`,
                          height: `${Math.max(48, ((duration) / 60) * 100 - 4)}px`
                        }}
                      >
                        <div className="flex justify-between items-center gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-wider opacity-80 truncate">
                              {apt.time} - {calculatedEnd} hs ({duration}m) • {apt.type || apt.treatment}
                            </span>
                            {apt.isOverturn && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300 flex items-center gap-1 shrink-0">
                                <Zap size={10} className="text-purple-600 fill-purple-600" />
                                Sobre Turno
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] sm:text-[10px] font-black bg-white/70 px-1.5 py-0.5 rounded capitalize shrink-0">{apt.status}</span>
                        </div>
                        <h4 className="text-[13px] sm:text-[16px] font-black tracking-tight truncate">{apt.patientName}</h4>
                      </motion.div>
                    );
                  })}
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
                  {selectedDateAppointments.length} {selectedDateAppointments.length === 1 ? 'turno agendado' : 'turnos agendados'}
                </span>
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
                <h4 className="text-sm font-black text-on-surface">No hay turnos agendados para este día</h4>
                <p className="text-xs text-on-surface-variant mt-1 max-w-sm mx-auto">
                  No se encontraron citas para el {new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(selectedDate)}. Seleccione otro día del calendario o presione el botón para agendar un turno.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenNewAppointment(formatLocalDate(selectedDate))}
                  className="mt-4 px-4 py-2 bg-white text-primary border border-primary/30 hover:bg-primary/5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Plus size={14} />
                  Agendar Turno para esta fecha
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {selectedDateAppointments.map((apt) => {
                  const phone = getPatientPhone(apt);
                  return (
                    <motion.div
                      key={apt.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 relative group bg-white shadow-xs hover:shadow-md",
                        apt.status === 'pendiente' ? "border-amber-300 hover:border-amber-400 bg-amber-50/15" :
                        apt.status === 'confirmed' ? "border-primary/30 hover:border-primary" :
                        apt.status === 'in-session' ? "border-tertiary/40 bg-tertiary-container/10" :
                        apt.status === 'finished' ? "border-secondary/40 bg-secondary-container/10" :
                        "border-outline-variant bg-surface/30"
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
                            apt.status === 'pendiente' ? "bg-amber-100 text-amber-800 border-amber-300" :
                            apt.status === 'confirmed' ? "bg-blue-100 text-blue-800 border-blue-300" :
                            apt.status === 'in-session' ? "bg-purple-100 text-purple-800 border-purple-300" :
                            apt.status === 'finished' ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                            apt.status === 'cancelado' ? "bg-red-100 text-red-800 border-red-300" :
                            "bg-orange-100 text-orange-800 border-orange-300"
                          )}>
                            {apt.status}
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
                              title="Abrir historia clínica del paciente en sesión"
                              className="px-2.5 py-1.5 rounded-lg bg-tertiary text-white hover:bg-tertiary/90 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer animate-pulse"
                            >
                              <Stethoscope size={13} />
                              <span>Historia Clínica</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditAppointment(apt, e)}
                            title="Reprogramar / Editar fecha y hora"
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            <Edit2 size={14} />
                          </button>
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                          {apt.time} - {apt.endTime || calculateEndTime(apt.time, apt.duration || 30)}
                        </span>
                        {apt.isOverturn && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-0.5">
                            <Zap size={9} className="text-purple-600 fill-purple-600" /> ST
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditAppointment(apt, e)}
                          title="Editar fecha y hora"
                          className="p-1 rounded-md text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
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
                      <span className="shrink-0">{apt.duration || 30}m</span>
                      {apt.isPackageSession && (
                        <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 flex items-center gap-0.5 ml-auto">
                          <Package size={9} /> Paquete ($0)
                        </span>
                      )}
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
                    onClick={() => handleOpenNewAppointment(formatLocalDate(selectedDate))}
                    className="mt-6 text-[10px] font-black text-primary uppercase underline tracking-widest"
                  >
                    Agendar Primero
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-outline-variant bg-surface-dim shrink-0">
              <button 
                onClick={() => handleOpenNewAppointment(formatLocalDate(selectedDate))}
                className="w-full py-3 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all"
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
        title="Agendar Nuevo Turno"
      >
        <form className="space-y-4" onSubmit={handleSaveAppointment}>
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
                  <PhoneInputArgentina
                    value={newPatientData.phone}
                    onChange={(val) => setNewPatientData({ ...newPatientData, phone: val })}
                    placeholder="Área + Número"
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
              <div className="relative" ref={patientSearchRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
                  <input 
                    type="text" 
                    placeholder="Buscar paciente por nombre o DNI..."
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
                              {p.idNumber && (
                                <span className="ml-2 font-mono text-[11px] text-on-surface-variant bg-surface px-1.5 py-0.5 rounded border border-outline-variant">
                                  DNI: {p.idNumber}
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
                onChange={(e) => setNewApt({ ...newApt, date: e.target.value })}
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
                setNewApt(prev => ({
                  ...prev,
                  type: selected,
                  duration: matched?.duration ? Number(matched.duration) : (prev.duration || 30)
                }));
              }}
            >
              <option value="">Seleccione tratamiento...</option>
              {treatments.map(t => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.duration || 30} min) {t.cost ? `— $${Number(t.cost).toLocaleString()}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ALERTA DE SUPERPOSICIÓN / COLISIÓN DE TURNOS */}
          {newAptCollision.hasConflict && (
            <div className="p-3.5 bg-red-50 border-2 border-red-300 rounded-xl space-y-1.5 text-red-950 animate-pulse">
              <div className="flex items-center gap-2 font-black text-red-700 text-xs">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>HORARIO BLOQUEADO — SUPERPOSICIÓN DE TURNOS</span>
              </div>
              <p className="text-[12px] font-semibold text-red-900 leading-snug">
                {newAptCollision.message}
              </p>
              <p className="text-[10px] text-red-700 font-bold uppercase tracking-wider">
                No se pueden agendar 2 turnos en el mismo horario. Cada tratamiento requiere su tiempo completo.
              </p>
            </div>
          )}

          {/* SUGERENCIAS DE HORARIOS LIBRES */}
          {newAptCollision.hasConflict && newAptSuggestedSlots.length > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Horarios disponibles sin superposición ({effectiveNewAptDuration} min):
                </span>
                <span className="text-[10px] text-emerald-700 font-bold">Clic para seleccionar</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {newAptSuggestedSlots.slice(0, 8).map(slot => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => setNewApt(prev => ({ ...prev, time: slot.time }))}
                    className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                  >
                    <span>{slot.time} hs</span>
                    {slot.isOverturn && <span className="text-[9px] text-purple-700 font-black">⚡ ST</span>}
                  </button>
                ))}
              </div>
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

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={() => setIsNewAppointmentOpen(false)}
              className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-wider"
            >
              CANCELAR
            </button>
            <button 
              type="submit"
              disabled={(!isCreatingNewPatient && !newApt.patientId) || newAptCollision.hasConflict}
              className={cn(
                "flex-1 px-4 py-2.5 text-white text-[12px] font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider",
                newAptCollision.hasConflict
                  ? "bg-red-600 opacity-60 cursor-not-allowed"
                  : isNewAptOverturn
                  ? "bg-purple-700 hover:bg-purple-800"
                  : "bg-primary hover:bg-primary/90"
              )}
            >
              {newAptCollision.hasConflict ? (
                <>
                  <AlertTriangle size={14} />
                  HORARIO OCUPADO
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
        title="Detalles del Turno"
      >
        {selectedAppointment && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-surface-bright rounded-xl border border-outline-variant">
              <div className="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center text-lg font-bold">
                {selectedAppointment.patientName.charAt(0)}
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-on-surface">{selectedAppointment.patientName}</h4>
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
                <button
                  type="button"
                  onClick={() => handleOpenEditAppointment(selectedAppointment)}
                  className="px-3 py-2 bg-primary text-white hover:bg-primary/90 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  <Edit2 size={13} />
                  Editar Fecha / Hora
                </button>
              </div>
            </div>

            {selectedAppointment.isOverturn && (
              <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-200 text-purple-900 flex items-center justify-center shrink-0">
                    <Zap size={16} className="fill-purple-700 text-purple-700" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-purple-900">Turno de Excepción</p>
                    <p className="text-[12px] font-bold text-purple-950">Atención registrada con etiqueta <strong>Sobre Turno</strong> (fuera del horario habitual)</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-purple-900 bg-white px-2.5 py-1 rounded-md border border-purple-300 shadow-2xs shrink-0">
                  ⚡ SOBRE TURNO
                </span>
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
                  if (selectedAppointment?.patientId) {
                    navigate(`/patients?id=${selectedAppointment.patientId}`);
                  }
                  setIsDetailModalOpen(false);
                }}
                className="px-4 py-2 bg-surface-variant text-on-surface text-[11px] font-bold rounded-lg hover:bg-surface-variant/80 border border-outline-variant transition-colors uppercase tracking-widest"
              >
                Ver Ficha
              </button>
              {selectedAppointment.status === 'in-session' ? (
                <button 
                  type="button"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleOpenClinicalHistory(selectedAppointment);
                  }}
                  className="flex-1 px-4 py-2 bg-tertiary text-white text-[11px] font-bold rounded-lg hover:bg-tertiary/90 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm animate-pulse"
                >
                  <Stethoscope size={13} />
                  Historia Clínica (En Sesión)
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={async () => {
                    await handleUpdateStatus('in-session');
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary/90 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Stethoscope size={13} />
                  Atender (Poner En Sesión)
                </button>
              )}
            </div>
          </div>
        )}
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
                setEditAptData(prev => ({
                  ...prev,
                  type: selected,
                  duration: matched?.duration ? Number(matched.duration) : (prev.duration || 30)
                }));
              }}
              className="w-full px-3 py-2 bg-surface rounded-lg border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
            >
              {treatments.length > 0 ? (
                treatments.map((t) => (
                  <option key={t.id} value={t.name}>{t.name} ({t.duration}m)</option>
                ))
              ) : (
                <option value="Check-up General">Check-up General (30m)</option>
              )}
            </select>
          </div>

          {/* ALERTA DE SUPERPOSICIÓN / COLISIÓN DE TURNOS */}
          {editAptCollision.hasConflict && (
            <div className="p-3.5 bg-red-50 border-2 border-red-300 rounded-xl space-y-1.5 text-red-950 animate-pulse">
              <div className="flex items-center gap-2 font-black text-red-700 text-xs">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>HORARIO BLOQUEADO — SUPERPOSICIÓN DE TURNOS</span>
              </div>
              <p className="text-[12px] font-semibold text-red-900 leading-snug">
                {editAptCollision.message}
              </p>
              <p className="text-[10px] text-red-700 font-bold uppercase tracking-wider">
                No se pueden agendar 2 turnos en el mismo horario. Cada tratamiento requiere su tiempo completo.
              </p>
            </div>
          )}

          {/* SUGERENCIAS DE HORARIOS LIBRES */}
          {editAptCollision.hasConflict && editAptSuggestedSlots.length > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Horarios disponibles sin superposición ({effectiveEditAptDuration} min):
                </span>
                <span className="text-[10px] text-emerald-700 font-bold">Clic para seleccionar</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {editAptSuggestedSlots.slice(0, 8).map(slot => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => setEditAptData(prev => ({ ...prev, time: slot.time }))}
                    className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                  >
                    <span>{slot.time} hs</span>
                    {slot.isOverturn && <span className="text-[9px] text-purple-700 font-black">⚡ ST</span>}
                  </button>
                ))}
              </div>
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
              disabled={editAptCollision.hasConflict}
              className={cn(
                "flex-1 px-4 py-2.5 text-white text-[12px] font-bold rounded-lg shadow-sm transition-all uppercase tracking-widest flex items-center justify-center gap-2",
                editAptCollision.hasConflict
                  ? "bg-red-600 opacity-60 cursor-not-allowed"
                  : isEditAptOverturn
                  ? "bg-purple-700 hover:bg-purple-800"
                  : "bg-primary hover:bg-primary/90"
              )}
            >
              {editAptCollision.hasConflict ? (
                <>
                  <AlertTriangle size={15} />
                  HORARIO OCUPADO
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
          onReminderSent={(aptId) => {
            showToast('Enlace de WhatsApp generado correctamente');
          }}
        />
      )}
    </div>
  );
}
