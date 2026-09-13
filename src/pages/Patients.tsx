import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search, Plus, Filter, Download, MoreHorizontal, User, Phone, Mail, Calendar, Trash2, Edit2, FileText, CheckCircle2, AlertTriangle, Save, TrendingUp, Stethoscope, CalendarClock, DollarSign, Clock, Link2, Package, Layers, Sparkles, Cloud, Split, Camera, Image, CalendarPlus, ArrowLeft, ChevronRight } from 'lucide-react';
import { cn, calculateAge } from '../lib/utils';
import { motion } from 'motion/react';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where, writeBatch, increment, getDocs } from 'firebase/firestore';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { PatientDetailView } from '../components/PatientDetailView';
import { PatientPackagesView } from '../components/PatientPackagesView';
import { PatientDriveFiles } from '../components/PatientDriveFiles';
import { PatientEvolutionPhotos } from '../components/PatientEvolutionPhotos';
import { consumePackageSession } from '../lib/packageUtils';
import { PatientPackage } from '../types';
import { splitFullName, formatPatientFullName, getPatientFirstName, getPatientLastName, comparePatientsByLastName, formatPatientLastNameFirst } from '../lib/patientNameUtils';
import { PhoneInputArgentina } from '../components/PhoneInputArgentina';
import { formatArgentinePhoneWithPrefix } from '../lib/phoneUtils';

export function Patients() {
  const { showToast } = useToast();
  const { ownerId, user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [patientDetailTab, setPatientDetailTab] = useState<'evolutions' | 'photos' | 'packages' | 'drive'>('evolutions');
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [patientAppointments, setPatientAppointments] = useState<any[]>([]);
  const [targetAppointmentId, setTargetAppointmentId] = useState<string | null>(null);
  const [patientStats, setPatientStats] = useState({
    attendance: 0,
    absences: 0,
    lastVisit: '-',
    nextApt: '-',
    totalSpent: 0,
    turnosSpent: 0,
    packagesSpent: 0
  });

  // Doctor is strictly the logged-in user
  const currentDoctorName = (profile?.name && profile.name.trim())
    ? profile.name.trim()
    : (user?.displayName && user.displayName.trim())
      ? user.displayName.trim()
      : (user?.email ? `Dr. ${user.email.split('@')[0]}` : 'Dr. Profesional');

  // Form states
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    name: '',
    idNumber: '',
    phone: '',
    email: '',
    gender: 'Male',
    birthDate: '',
    status: 'active'
  });

  const [evolutionData, setEvolutionData] = useState({
    appointmentId: '',
    treatment: '',
    treatmentId: '',
    date: new Date().toISOString().split('T')[0],
    paidAmount: 0,
    note: '',
    status: 'Completed',
    isPackageSession: false,
    patientPackageId: '',
    packageName: ''
  });

  // Schedule Next Appointment State (Within Evolution)
  const [scheduleNextApt, setScheduleNextApt] = useState(false);
  const [nextAptData, setNextAptData] = useState({
    date: '',
    time: '10:00',
    treatment: 'Control / Seguimiento',
    duration: 30,
    notes: '',
    status: 'pendiente'
  });

  const getDateOffset = (daysToAdd: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    if (!ownerId) return;

    const q = query(
      collection(db, 'patients'), 
      where('userId', '==', ownerId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(docs.sort(comparePatientsByLastName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    const treatmentsQ = query(collection(db, 'treatments'), where('userId', '==', ownerId));

    const unsubscribeTreatments = onSnapshot(treatmentsQ, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTreatments(docs.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treatments'));

    return () => {
      unsubscribe();
      unsubscribeTreatments();
    };
  }, [ownerId]);

  // Handle URL param selection
  useEffect(() => {
    const patientId = searchParams.get('id');
    const appointmentId = searchParams.get('appointmentId');
    const action = searchParams.get('action');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        const modalType = (action === 'add-entry' || appointmentId) ? 'add-entry' : action === 'drive' ? 'drive' : action === 'photos' ? 'photos' : 'history';
        handleOpenModal(modalType, patient, appointmentId || undefined);
      }
    }
  }, [searchParams, patients]);

  useEffect(() => {
    if (selectedPatient && ownerId) {
      // Fetch evolutions
      const q = query(
        collection(db, `patients/${selectedPatient.id}/evolutions`), 
        where('userId', '==', ownerId)
      );
      const unsubscribeEvolutions = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEvolutions(docs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || '')));
      }, (error) => handleFirestoreError(error, OperationType.LIST, `patients/${selectedPatient.id}/evolutions`));

      // Fetch appointments to calculate KPIs and link with evolutions
      const appQ = query(
        collection(db, 'appointments'), 
        where('userId', '==', ownerId)
      );
      const unsubscribeApps = onSnapshot(appQ, (snapshot) => {
        const allApps: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const apps: any[] = allApps.filter((a: any) => a.patientId === selectedPatient.id);
        
        // Sort newest first
        apps.sort((a: any, b: any) => {
          const dateCmp = (b.date || '').localeCompare(a.date || '');
          if (dateCmp !== 0) return dateCmp;
          return (b.time || '').localeCompare(a.time || '');
        });
        setPatientAppointments(apps);

        const todayStr = new Date().toISOString().split('T')[0];
        const targetApt = targetAppointmentId 
          ? apps.find((a: any) => a.id === targetAppointmentId)
          : (apps.find((a: any) => a.date === todayStr) || (apps.length > 0 ? apps[0] : null));

        if (targetApt) {
          const matchedTreatment = treatments.find(t => t.name === (targetApt.type || targetApt.treatment) || t.id === targetApt.treatmentId);
          const isTargetPkg = Boolean(targetApt.isPackageSession);
          const historicalPrice = isTargetPkg ? 0 : (
            (typeof targetApt.cost === 'number' && !isNaN(targetApt.cost))
              ? targetApt.cost
              : (typeof targetApt.price === 'number' && !isNaN(targetApt.price))
                ? targetApt.price
                : (matchedTreatment?.cost || 0)
          );

          setEvolutionData(prev => ({
            ...prev,
            appointmentId: prev.appointmentId || targetApt.id,
            date: prev.appointmentId ? prev.date : (targetApt.date || todayStr),
            treatment: prev.appointmentId ? prev.treatment : (targetApt.type || targetApt.treatment || (treatments[0]?.name || '')),
            treatmentId: prev.appointmentId ? prev.treatmentId : (targetApt.treatmentId || matchedTreatment?.id || ''),
            paidAmount: prev.appointmentId ? prev.paidAmount : historicalPrice,
            isPackageSession: isTargetPkg,
            patientPackageId: targetApt.patientPackageId || '',
            packageName: targetApt.packageName || ''
          }));
        }
      });

      // Subscribe to patient's packages
      const pkgQ = query(
        collection(db, 'patient_packages'),
        where('userId', '==', ownerId),
        where('patientId', '==', selectedPatient.id)
      );
      const unsubscribePackages = onSnapshot(pkgQ, (snapshot) => {
        const pDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PatientPackage));
        setPatientPackages(pDocs);
      }, (error) => {
        console.error('Error listening to patient packages:', error);
      });

      return () => {
        unsubscribeEvolutions();
        unsubscribeApps();
        unsubscribePackages();
      };
    }
  }, [selectedPatient, treatments, targetAppointmentId, ownerId]);

  // Dynamically calculate Patient KPIs & Total Spending across all turnos, evolutions, and packages
  useEffect(() => {
    if (!selectedPatient) return;

    // 1. Calculate spending on all registered clinical evolutions (including past months and standalone)
    const evolutionsSpent = evolutions.reduce((acc: number, ev: any) => {
      if (Array.isArray(ev.items) && ev.items.length > 0) {
        const itemsTotal = ev.items.reduce((sum: number, it: any) => {
          if (it.isPackageSession) return sum;
          return sum + Number(it.price || it.paidAmount || 0);
        }, 0);
        return acc + itemsTotal;
      }
      if (ev.isPackageSession) return acc;
      const historicalCost = (typeof ev.paidAmount === 'number' && !isNaN(ev.paidAmount))
        ? ev.paidAmount
        : (typeof ev.cost === 'number' && !isNaN(ev.cost))
          ? ev.cost
          : (treatments.find(t => t.name === (ev.treatment || ev.type) || t.id === ev.treatmentId)?.cost || 0);
      return acc + Number(historicalCost || 0);
    }, 0);

    // 2. Add packages/bonos purchased by the patient
    const packagesSpent = patientPackages.reduce((acc: number, p: any) => acc + (Number(p.pricePaid) || 0), 0);

    // Turnos dados pendientes o no finalizados NUNCA se suman.
    // Lo que el paciente gastó es ÚNICAMENTE el total de cada evolución y el paquete adquirido:
    const totalSpent = evolutionsSpent + packagesSpent;

    // Attended visits (unique dates/IDs between evolutions and finished appointments)
    const finishedApps = patientAppointments.filter((a: any) => a.status === 'finished');
    const attendedVisitsSet = new Set([
      ...finishedApps.map((a: any) => a.date || a.id),
      ...evolutions.map((e: any) => e.date || e.id)
    ]);
    const attendedCount = attendedVisitsSet.size;
    const absences = patientAppointments.filter((a: any) => a.status === 'cancelado' || a.status === 'ausente').length;

    // Last visit (most recent date between evolutions and finished appointments)
    const allVisitDates = [
      ...finishedApps.map((a: any) => a.date),
      ...evolutions.map((e: any) => e.date)
    ].filter(Boolean);
    allVisitDates.sort((a, b) => b.localeCompare(a));
    const lastVisitDate = allVisitDates.length > 0 ? allVisitDates[0] : '-';

    // Next appointment
    const todayStr = new Date().toISOString().split('T')[0];
    const nextApts = patientAppointments.filter((a: any) => (a.status === 'pendiente' || a.status === 'confirmado') && a.date >= todayStr);
    const sortedNext = [...nextApts].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    const nextVisitDate = sortedNext.length > 0 ? `${sortedNext[0].date} ${sortedNext[0].time || ''}`.trim() : '-';

    setPatientStats({
      attendance: (attendedCount + absences) > 0 ? Math.round((attendedCount / (attendedCount + absences)) * 100) : 0,
      absences: absences,
      lastVisit: lastVisitDate,
      nextApt: nextVisitDate,
      totalSpent: totalSpent,
      turnosSpent: evolutionsSpent,
      packagesSpent: packagesSpent
    });
  }, [selectedPatient, patientAppointments, evolutions, patientPackages, treatments]);

  const handleSelectAppointmentForEvolution = (aptId: string) => {
    if (!aptId || aptId === 'manual') {
      const defaultTreatment = treatments.length > 0 ? treatments[0] : null;
      setEvolutionData(prev => ({
        ...prev,
        appointmentId: '',
        date: new Date().toISOString().split('T')[0],
        treatment: prev.treatment || (defaultTreatment ? defaultTreatment.name : ''),
        treatmentId: prev.treatmentId || (defaultTreatment ? defaultTreatment.id : ''),
        paidAmount: prev.isPackageSession ? 0 : (prev.paidAmount > 0 ? prev.paidAmount : (defaultTreatment?.cost || 0))
      }));
      return;
    }

    const apt = patientAppointments.find(a => a.id === aptId);
    if (!apt) return;

    const isPkg = Boolean(apt.isPackageSession);
    const matchedTreatment = treatments.find(t => t.name === (apt.type || apt.treatment) || t.id === apt.treatmentId);
    const historicalPrice = isPkg ? 0 : (
      (typeof apt.cost === 'number' && !isNaN(apt.cost))
        ? apt.cost
        : (typeof apt.price === 'number' && !isNaN(apt.price))
          ? apt.price
          : (typeof apt.treatmentCost === 'number' && !isNaN(apt.treatmentCost))
            ? apt.treatmentCost
            : (matchedTreatment?.cost || 0)
    );

    setEvolutionData(prev => ({
      ...prev,
      appointmentId: apt.id,
      date: apt.date || prev.date,
      treatment: apt.type || apt.treatment || prev.treatment,
      treatmentId: apt.treatmentId || matchedTreatment?.id || '',
      paidAmount: historicalPrice,
      isPackageSession: isPkg,
      patientPackageId: apt.patientPackageId || '',
      packageName: apt.packageName || ''
    }));
  };

  const handleSelectPatient = (patient: any) => {
    setSelectedPatient(patient);
    setPatientDetailTab('evolutions');
    setIsAddingEntry(false);
    setTargetAppointmentId(null);
  };

  const handleBackToGeneralList = () => {
    setSelectedPatient(null);
    setIsAddingEntry(false);
    setTargetAppointmentId(null);
    if (searchParams.get('id')) {
      navigate('/patients', { replace: true });
    }
  };

  const handleOpenModal = (type: 'create' | 'edit' | 'delete' | 'history' | 'add-entry' | 'drive' | 'photos', patient?: any, initialAppointmentId?: string) => {
    if (type === 'create') {
      setSelectedPatient(null);
      setFormData({
        firstName: '',
        lastName: '',
        name: '',
        idNumber: '',
        phone: '',
        email: '',
        gender: 'Male',
        birthDate: '',
        status: 'active'
      });
      setActiveModal('create');
      return;
    }

    if (patient) {
      setSelectedPatient(patient);
      const parsed = splitFullName(patient.name || '');
      const fn = patient.firstName || parsed.firstName;
      const ln = patient.lastName || parsed.lastName;
      setFormData({
        firstName: fn,
        lastName: ln,
        name: patient.name || formatPatientFullName(fn, ln),
        idNumber: patient.idNumber || '',
        phone: patient.phone || '',
        email: patient.email || '',
        gender: patient.gender || 'Male',
        birthDate: patient.birthDate || '',
        status: patient.status || 'active'
      });
    }

    if (initialAppointmentId) {
      setTargetAppointmentId(initialAppointmentId);
    }

    if (type === 'edit') {
      setActiveModal('edit');
      return;
    }

    if (type === 'delete') {
      setActiveModal('delete');
      return;
    }

    // Inline detail views (no modal)
    setActiveModal(null);

    if (type === 'photos') {
      setPatientDetailTab('photos');
      setIsAddingEntry(false);
      return;
    }

    if (type === 'drive') {
      setPatientDetailTab('drive');
      setIsAddingEntry(false);
      return;
    }

    if (type === 'add-entry') {
      setPatientDetailTab('evolutions');
      setIsAddingEntry(true);
      const todayStr = new Date().toISOString().split('T')[0];
      setEvolutionData(prev => ({
        ...prev,
        treatment: prev.treatment || (treatments.length > 0 ? treatments[0].name : ''),
        treatmentId: prev.treatmentId || (treatments.length > 0 ? treatments[0].id : ''),
        date: todayStr,
        note: '',
        paidAmount: prev.paidAmount || (treatments.length > 0 ? (treatments[0].cost || 0) : 0)
      }));
      return;
    }

    if (type === 'history') {
      setPatientDetailTab('evolutions');
      setIsAddingEntry(false);
      const todayStr = new Date().toISOString().split('T')[0];
      setEvolutionData(prev => ({
        ...prev,
        treatment: prev.treatment || (treatments.length > 0 ? treatments[0].name : ''),
        treatmentId: prev.treatmentId || (treatments.length > 0 ? treatments[0].id : ''),
        date: todayStr,
        note: '',
        paidAmount: prev.paidAmount || (treatments.length > 0 ? (treatments[0].cost || 0) : 0)
      }));
      return;
    }
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fn = formData.firstName.trim();
      const ln = formData.lastName.trim();
      const fullName = formatPatientFullName(fn, ln, formData.name);

      const data = {
        ...formData,
        firstName: fn,
        lastName: ln,
        name: fullName,
        updatedAt: serverTimestamp()
      };

      if (activeModal === 'edit' && selectedPatient) {
        await updateDoc(doc(db, 'patients', selectedPatient.id), data);
      } else {
        await addDoc(collection(db, 'patients'), {
          ...data,
          userId: ownerId,
          createdAt: serverTimestamp(),
          lastVisit: '-'
        });
      }
      setActiveModal(null);
      showToast(selectedPatient ? 'Paciente actualizado exitosamente' : 'Paciente registrado exitosamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'patients');
    }
  };

  const handleDeletePatient = async () => {
    if (!selectedPatient) return;
    try {
      await deleteDoc(doc(db, 'patients', selectedPatient.id));
      setActiveModal(null);
      setSelectedPatient(null);
      showToast('Paciente eliminado exitosamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${selectedPatient.id}`);
    }
  };

  const handleAddEvolution = async () => {
    if (!selectedPatient) return;
    if (!evolutionData.treatment) {
      showToast('Por favor selecciona un tratamiento para la evolución');
      return;
    }
    if (!evolutionData.note.trim()) {
      showToast('Por favor describe la nota o procedimiento de la evolución');
      return;
    }

    try {
      const isPkgSession = Boolean(evolutionData.isPackageSession && evolutionData.patientPackageId);

      // If this evolution is covered by a patient package, deduct the session from the package
      // (This atomically deducts the package session and its linked treatment materials)
      if (isPkgSession && evolutionData.patientPackageId) {
        await consumePackageSession(
          db, 
          evolutionData.patientPackageId, 
          evolutionData.treatment,
          ownerId,
          selectedPatient.name
        );
      }

      const batch = writeBatch(db);
      const evolutionPath = `patients/${selectedPatient.id}/evolutions`;
      const newEvolutionRef = doc(collection(db, evolutionPath));
      const globalEvolutionRef = doc(db, 'evolutions', newEvolutionRef.id);

      const treatment = treatments.find(t => t.name === evolutionData.treatment || t.id === evolutionData.treatmentId);
      const attentionDate = evolutionData.date || new Date().toISOString().split('T')[0];
      const paidValue = isPkgSession ? 0 : (
        (typeof evolutionData.paidAmount === 'number' && !isNaN(evolutionData.paidAmount))
          ? Number(evolutionData.paidAmount)
          : (treatment?.cost || 0)
      );

      const evolutionPayload = {
        id: newEvolutionRef.id,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name || '',
        patientIdNumber: selectedPatient.idNumber || '',
        userId: ownerId,
        doctorId: user?.uid || '',
        doctor: currentDoctorName,
        doctorEmail: user?.email || '',
        appointmentId: evolutionData.appointmentId || null,
        treatment: evolutionData.treatment,
        treatmentId: treatment?.id || evolutionData.treatmentId || '',
        cost: paidValue, // Valor que se pagó en su momento (preservado sin tomar el valor actual del tratamiento)
        paidAmount: paidValue,
        isPackageSession: isPkgSession,
        patientPackageId: isPkgSession ? evolutionData.patientPackageId : null,
        packageName: isPkgSession ? (evolutionData.packageName || null) : null,
        note: evolutionData.note.trim(),
        date: attentionDate,
        status: 'Completed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Corroborate database: Save both in patient subcollection AND global evolutions collection
      batch.set(newEvolutionRef, evolutionPayload);
      batch.set(globalEvolutionRef, evolutionPayload);

      // Deduct materials if treatment has materials linked (only for non-package evolutions; package sessions are handled atomically above)
      if (!isPkgSession && treatment && treatment.materials && treatment.materials.length > 0) {
        for (const item of treatment.materials) {
          const matId = item.materialId || item.id;
          const qty = Number(item.qty || item.quantity || 0);
          if (!matId || qty <= 0) continue;

          const stockRef = doc(db, 'stocks', matId);
          batch.update(stockRef, {
            stock: increment(-qty),
            updatedAt: serverTimestamp()
          });

          // Record movement
          const movementRef = doc(collection(db, `stocks/${matId}/movements`));
          batch.set(movementRef, {
            type: 'out',
            quantity: qty,
            reason: `Consumido en evolución: ${evolutionData.treatment} para ${selectedPatient.name}`,
            date: serverTimestamp(),
            userId: ownerId
          });
        }
      }
      
      // Update patient's last visit
      const patientRef = doc(db, 'patients', selectedPatient.id);
      batch.set(patientRef, {
        lastVisit: attentionDate,
        updatedAt: serverTimestamp(),
        userId: ownerId
      }, { merge: true });

      // If linked to an appointment, mark it as finished and update cost with the amount paid at the time
      if (evolutionData.appointmentId) {
        batch.update(doc(db, 'appointments', evolutionData.appointmentId), {
          status: 'finished',
          cost: paidValue,
          price: paidValue,
          paidAmount: paidValue,
          isPackageSession: isPkgSession,
          packageDiscounted: isPkgSession ? true : false,
          evolutionId: newEvolutionRef.id,
          updatedAt: serverTimestamp()
        });
      }

      // Also update any other appointment for this patient on this date that wasn't finished
      patientAppointments.forEach((app: any) => {
        if (
          app.id !== evolutionData.appointmentId &&
          app.date === attentionDate &&
          app.status !== 'finished'
        ) {
          batch.update(doc(db, 'appointments', app.id), {
            status: 'finished',
            cost: paidValue,
            price: paidValue,
            paidAmount: paidValue,
            isPackageSession: isPkgSession,
            packageDiscounted: isPkgSession ? true : false,
            evolutionId: newEvolutionRef.id,
            updatedAt: serverTimestamp()
          });
        }
      });

      // User request: Schedule new appointment inside the evolution
      let nextAptScheduled = false;
      if (scheduleNextApt && nextAptData.date && nextAptData.time) {
        const [nextYear, nextMonth, nextDay] = nextAptData.date.split('-').map(Number);
        const [nextH, nextM] = nextAptData.time.split(':').map(Number);
        const nextStartDate = new Date(nextYear, nextMonth - 1, nextDay, nextH, nextM);

        const nextMatchedTreatment = treatments.find(t => t.name === nextAptData.treatment);
        const nextPrice = nextMatchedTreatment?.cost ? Number(nextMatchedTreatment.cost) : 0;

        const parsed = splitFullName(selectedPatient.name || '');
        const pFn = selectedPatient.firstName || parsed.firstName || '';
        const pLn = selectedPatient.lastName || parsed.lastName || '';

        const newAptRef = doc(collection(db, 'appointments'));
        batch.set(newAptRef, {
          id: newAptRef.id,
          patientId: selectedPatient.id,
          patientName: selectedPatient.name || `${pFn} ${pLn}`.trim(),
          patientFirstName: pFn,
          patientLastName: pLn,
          patientPhone: selectedPatient.phone || '',
          phone: selectedPatient.phone || '',
          date: nextAptData.date,
          time: nextAptData.time,
          startTime: nextStartDate,
          type: nextAptData.treatment || 'Control / Seguimiento',
          treatment: nextAptData.treatment || 'Control / Seguimiento',
          treatmentId: nextMatchedTreatment?.id || '',
          cost: nextPrice,
          price: nextPrice,
          paidAmount: nextPrice,
          notes: nextAptData.notes || '',
          duration: Number(nextAptData.duration) || nextMatchedTreatment?.duration || 30,
          status: 'pendiente',
          userId: ownerId,
          attendance: (selectedPatient.attendance || 0) + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        nextAptScheduled = true;
      }

      await batch.commit();

      setIsAddingEntry(false);
      setTargetAppointmentId(null);
      setScheduleNextApt(false);
      setEvolutionData({
        appointmentId: '',
        treatment: treatments.length > 0 ? treatments[0].name : '',
        treatmentId: treatments.length > 0 ? treatments[0].id : '',
        date: new Date().toISOString().split('T')[0],
        paidAmount: treatments.length > 0 ? (treatments[0].cost || 0) : 0,
        note: '',
        status: 'Completed',
        isPackageSession: false,
        patientPackageId: '',
        packageName: ''
      });
      if (nextAptScheduled) {
        showToast(`Evolución guardada y próximo turno agendado (${nextAptData.date} ${nextAptData.time} hs)`, 'success');
      } else {
        showToast(isPkgSession ? 'Evolución guardada y sesión descontada del paquete ($0 adicional)' : 'Evolución clínica guardada exitosamente en la base de datos');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `patients/${selectedPatient.id}/evolutions`);
    }
  };

  const handleDeleteEvolution = async (evolutionId: string) => {
    if (!selectedPatient) return;
    if (!window.confirm('¿Deseas eliminar este registro de evolución?')) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, `patients/${selectedPatient.id}/evolutions`, evolutionId));
      batch.delete(doc(db, 'evolutions', evolutionId));
      await batch.commit();
      showToast('Evolución eliminada exitosamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${selectedPatient.id}/evolutions/${evolutionId}`);
    }
  };

  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const result = patients.filter(p => {
      if (!term) return true;
      const nameMatch = p.name?.toLowerCase().includes(term) || false;
      const firstNameMatch = p.firstName?.toLowerCase().includes(term) || false;
      const lastNameMatch = p.lastName?.toLowerCase().includes(term) || false;
      const idMatch = p.idNumber?.toLowerCase().includes(term) || false;
      const phoneMatch = p.phone?.toLowerCase().includes(term) || false;
      return nameMatch || firstNameMatch || lastNameMatch || idMatch || phoneMatch;
    });
    return result.sort(comparePatientsByLastName);
  }, [patients, searchTerm]);

  const currentPatient = patients.find(p => p.id === selectedPatient?.id) || selectedPatient;

  const handleExportPatients = () => {
    if (patients.length === 0) {
      showToast('No hay pacientes para exportar');
      return;
    }
    const headers = ['Apellido', 'Nombre', 'DNI', 'Teléfono', 'Email', 'Género', 'Fecha Nacimiento', 'Estado'];
    const rows = patients.map(p => {
      const ln = p.lastName || getPatientLastName(p);
      const fn = p.firstName || getPatientFirstName(p);
      return [
        `"${(ln || '').replace(/"/g, '""')}"`,
        `"${(fn || '').replace(/"/g, '""')}"`,
        `"${(p.idNumber || '').replace(/"/g, '""')}"`,
        `"${(p.phone || '').replace(/"/g, '""')}"`,
        `"${(p.email || '').replace(/"/g, '""')}"`,
        `"${(p.gender || '').replace(/"/g, '""')}"`,
        `"${(p.birthDate || '').replace(/"/g, '""')}"`,
        `"${(p.status || 'active').replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pacientes_ordenados_por_apellido_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Lista de pacientes exportada exitosamente');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          {selectedPatient ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBackToGeneralList}
                className="p-2 bg-white hover:bg-surface border border-outline-variant rounded-lg text-on-surface-variant hover:text-primary transition-all cursor-pointer shadow-2xs group"
                title="Volver al menú de pacientes general"
                id="btn-back-header"
              >
                <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <div>
                <h1 className="headline-lg text-on-surface flex items-center gap-2">
                  <span>{currentPatient?.name || 'Paciente'}</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                    currentPatient?.status === 'active' ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-dim text-on-surface-variant"
                  )}>
                    {currentPatient?.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </h1>
                <p className="body-md text-on-surface-variant">Ficha clínica y detalle completo del paciente.</p>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="headline-lg text-on-surface">Gestión de Pacientes</h1>
              <p className="body-md text-on-surface-variant">Listado completo de pacientes registrados y sus historias clínicas.</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedPatient ? (
            <button
              type="button"
              onClick={handleBackToGeneralList}
              className="px-3.5 py-2 bg-white border border-outline-variant rounded-lg text-xs font-bold text-on-surface-variant hover:text-primary hover:bg-surface transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs group"
              id="btn-back-top-right"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              VOLVER AL MENÚ DE PACIENTES
            </button>
          ) : (
            <>
              <button 
                onClick={handleExportPatients}
                className="px-3 py-1.5 bg-white border border-outline-variant rounded-md text-[11px] font-bold flex items-center gap-2 hover:bg-surface transition-all text-on-surface-variant cursor-pointer active:scale-95"
                title="Exportar lista ordenada por apellido a CSV"
              >
                <Download size={14} />
                EXPORTAR CSV
              </button>
              <button 
                onClick={() => handleOpenModal('create')}
                className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
              >
                <Plus size={16} />
                NUEVO PACIENTE
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        {selectedPatient ? (
          <PatientDetailView
            patient={currentPatient}
            ownerId={ownerId}
            user={user}
            currentDoctorName={currentDoctorName}
            treatments={treatments}
            onBack={handleBackToGeneralList}
            onEdit={(p) => handleOpenModal('edit', p)}
            onDelete={(p) => handleOpenModal('delete', p)}
            targetAppointmentId={targetAppointmentId}
            initialTab={patientDetailTab}
            initialAddEntry={isAddingEntry}
          />
        ) : (
          <>
            <div className="px-6 py-4 border-b border-outline-variant flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input 
              type="text" 
              placeholder="Buscar por nombre, DNI o teléfono..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary text-[13px] outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface transition-all">
              <Filter size={14} />
            </button>
          </div>
        </div>

        {/* Mobile Patient Cards (< md) */}
        <div className="block md:hidden divide-y divide-outline-variant/60">
          {filteredPatients.length === 0 ? (
            <div className="p-8 text-center text-xs text-on-surface-variant">
              No se encontraron pacientes.
            </div>
          ) : (
            filteredPatients.map((patient) => (
              <div 
                key={patient.id}
                onClick={() => handleSelectPatient(patient)}
                className="p-4 bg-white hover:bg-primary/5 transition-colors flex flex-col gap-3 cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary-container text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      {(getPatientLastName(patient) || patient.name || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">
                        {(() => {
                          const ln = patient.lastName || getPatientLastName(patient);
                          const fn = patient.firstName || getPatientFirstName(patient);
                          if (ln) {
                            return (
                              <>
                                <span className="font-extrabold">{ln}</span>
                                {fn && fn !== 'Paciente' && <span className="font-medium text-on-surface-variant">, {fn}</span>}
                              </>
                            );
                          }
                          return formatPatientLastNameFirst(patient);
                        })()}
                      </p>
                      <p className="text-[11px] text-on-surface-variant font-medium">
                        DNI: <span className="font-mono text-on-surface">{patient.idNumber}</span> • {calculateAge(patient.birthDate)} años
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                      patient.status === 'active' ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-dim text-on-surface-variant"
                    )}>
                      {patient.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                    <ChevronRight size={16} className="text-on-surface-variant/40" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant pt-1 border-t border-outline-variant/40">
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone size={12} className="text-primary/70 shrink-0" />
                    <span className="truncate font-mono">{formatArgentinePhoneWithPrefix(patient.phone) || 'Sin teléfono'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Calendar size={12} className="text-secondary/70 shrink-0" />
                    <span className="truncate">Última: {patient.lastVisit}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-bright border-b border-outline-variant">
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <span>Paciente (Apellido, Nombre)</span>
                    <span className="px-1.5 py-0.5 text-[9px] bg-primary/10 text-primary rounded font-bold tracking-normal">
                      A-Z
                    </span>
                  </div>
                </th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Identificación</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Última Visita</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-right w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface">
              {filteredPatients.map((patient) => (
                <motion.tr 
                  key={patient.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => handleSelectPatient(patient)}
                  className="hover:bg-primary/5 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-primary text-[12px] font-bold shrink-0">
                        {(getPatientLastName(patient) || patient.name || 'P').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                          {(() => {
                            const ln = patient.lastName || getPatientLastName(patient);
                            const fn = patient.firstName || getPatientFirstName(patient);
                            if (ln) {
                              return (
                                <>
                                  <span className="font-extrabold text-on-surface group-hover:text-primary">{ln}</span>
                                  {fn && fn !== 'Paciente' && <span className="font-medium text-on-surface-variant">, {fn}</span>}
                                </>
                              );
                            }
                            return formatPatientLastNameFirst(patient);
                          })()}
                        </p>
                        <p className="text-[11px] text-on-surface-variant">{patient.gender}, {calculateAge(patient.birthDate)} años</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-[12px] text-on-surface font-mono">{patient.idNumber}</td>
                  <td className="px-6 py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <Phone size={12} className="text-primary/60 shrink-0" />
                        <span className="text-[11px] font-medium font-mono">{formatArgentinePhoneWithPrefix(patient.phone) || 'Sin teléfono'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <Mail size={12} className="text-secondary/60 shrink-0" />
                        <span className="text-[11px] font-medium truncate max-w-[150px]">{patient.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <Calendar size={12} className="shrink-0" />
                      <span className="text-[11px] font-medium">{patient.lastVisit}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-block",
                      patient.status === 'active' ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-dim text-on-surface-variant"
                    )}>
                      {patient.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-on-surface-variant/40 group-hover:text-primary transition-colors">
                    <ChevronRight size={16} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="px-6 py-3 border-t border-outline-variant flex justify-between items-center bg-surface-bright">
          <p className="text-[11px] font-medium text-on-surface-variant">Mostrando <b>{filteredPatients.length}</b> de <b>{patients.length}</b> pacientes</p>
          <div className="flex items-center gap-1">
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant disabled:opacity-50" disabled>Ant.</button>
            <button className="px-2 py-1 bg-primary text-white rounded text-[10px] font-bold">1</button>
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant disabled:opacity-50" disabled>Sig.</button>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Modals */}
      <Modal
        isOpen={activeModal === 'create' || activeModal === 'edit'}
        onClose={() => setActiveModal(null)}
        title={activeModal === 'create' ? 'Registrar Nuevo Paciente' : 'Editar Paciente'}
        className="max-w-xl"
      >
        <form className="space-y-4" onSubmit={handleSavePatient}>
          {/* Nombre y Apellido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                Nombre *
              </label>
              <input 
                type="text" 
                required
                value={formData.firstName}
                onChange={(e) => {
                  const fn = e.target.value;
                  setFormData({
                    ...formData,
                    firstName: fn,
                    name: formatPatientFullName(fn, formData.lastName)
                  });
                }}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="Ej: Juan" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                Apellido *
              </label>
              <input 
                type="text" 
                required
                value={formData.lastName}
                onChange={(e) => {
                  const ln = e.target.value;
                  setFormData({
                    ...formData,
                    lastName: ln,
                    name: formatPatientFullName(formData.firstName, ln)
                  });
                }}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="Ej: Pérez" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">DNI / Identificación</label>
              <input 
                type="text" 
                required
                value={formData.idNumber}
                onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="Ej: 12.345.678" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center justify-between">
                <span>Teléfono / WhatsApp</span>
                <span className="text-[10px] text-primary font-semibold">Prefijo fijo +54 9</span>
              </label>
              <PhoneInputArgentina
                value={formData.phone}
                onChange={(val) => setFormData({ ...formData, phone: val })}
                showHelperText
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Email</label>
            <input 
              type="email" 
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              placeholder="juan@example.com" 
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Género</label>
              <select 
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              >
                <option value="Male">Masculino</option>
                <option value="Female">Femenino</option>
                <option value="Other">Otro</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha de Nacimiento</label>
              <input 
                type="date" 
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Estado</label>
              <select 
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-widest flex items-center justify-center gap-2">
              <Save size={16} />
              {activeModal === 'create' ? 'Guardar Paciente' : 'Actualizar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={activeModal === 'delete'}
        onClose={() => setActiveModal(null)}
        title="Confirmar Eliminación"
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={32} />
          </div>
          <p className="text-on-surface">¿Está seguro de que desea eliminar al paciente <b>{currentPatient?.name}</b>? Esta acción no se puede deshacer.</p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 bg-surface border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest">Cancelar</button>
            <button onClick={handleDeletePatient} className="flex-1 px-4 py-2 bg-error text-white rounded-lg text-[12px] font-bold hover:bg-error/90 transition-colors uppercase tracking-widest">Eliminar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
