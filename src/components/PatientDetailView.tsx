import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, Camera, Package, Cloud, Plus, X, Save, Clock, Sparkles, 
  Layers, Link2, User, Phone, Mail, Trash2, Edit2, ArrowLeft, 
  CalendarPlus, CheckCircle2, AlertTriangle, TrendingUp, DollarSign,
  ChevronRight, CalendarClock, Search, Lock
} from 'lucide-react';
import { cn, calculateAge } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, onSnapshot, query, where, doc, 
  serverTimestamp, writeBatch, increment, getDocs, addDoc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { useToast } from './Toast';
import { PatientPackagesView } from './PatientPackagesView';
import { PatientDriveFiles } from './PatientDriveFiles';
import { PatientEvolutionPhotos } from './PatientEvolutionPhotos';
import { consumePackageSession } from '../lib/packageUtils';
import { checkEvolutionEditability } from '../lib/evolutionUtils';
import { PatientPackage } from '../types';
import { 
  splitFullName, formatPatientFullName, getPatientFirstName, 
  getPatientLastName, formatPatientLastNameFirst 
} from '../lib/patientNameUtils';
import { formatArgentinePhoneWithPrefix } from '../lib/phoneUtils';

interface PatientDetailViewProps {
  patient: any;
  ownerId: string;
  user: any;
  currentDoctorName: string;
  treatments: any[];
  onBack: () => void;
  onEdit: (patient: any) => void;
  onDelete: (patient: any) => void;
  targetAppointmentId?: string | null;
  initialTab?: 'evolutions' | 'photos' | 'packages' | 'drive';
  initialAddEntry?: boolean;
}

export function PatientDetailView({
  patient,
  ownerId,
  user,
  currentDoctorName,
  treatments,
  onBack,
  onEdit,
  onDelete,
  targetAppointmentId,
  initialTab = 'evolutions',
  initialAddEntry = false
}: PatientDetailViewProps) {
  const { showToast } = useToast();

  const [patientDetailTab, setPatientDetailTab] = useState<'evolutions' | 'photos' | 'packages' | 'drive'>(initialTab);
  const [isAddingEntry, setIsAddingEntry] = useState(initialAddEntry);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);
  const [patientAppointments, setPatientAppointments] = useState<any[]>([]);
  const [editingEvolution, setEditingEvolution] = useState<any | null>(null);

  // Automatically open evolution entry if navigated from appointment or requested
  useEffect(() => {
    if (initialAddEntry || targetAppointmentId) {
      setIsAddingEntry(true);
      setPatientDetailTab('evolutions');
    }
  }, [initialAddEntry, targetAppointmentId]);
  const [patientStats, setPatientStats] = useState({
    attendance: 0,
    absences: 0,
    lastVisit: '-',
    nextApt: '-',
    totalSpent: 0,
    turnosSpent: 0,
    packagesSpent: 0
  });

  const getFutureDate = (daysToAdd: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [evolutionTreatments, setEvolutionTreatments] = useState<Array<{
    id: string;
    treatmentId: string;
    treatmentName: string;
    price: number;
    isPackageSession?: boolean;
    patientPackageId?: string;
    packageName?: string;
  }>>([
    {
      id: 'trt-default-1',
      treatmentId: '',
      treatmentName: '',
      price: 0,
      isPackageSession: false,
      patientPackageId: '',
      packageName: ''
    }
  ]);

  const [evolutionData, setEvolutionData] = useState({
    treatment: '',
    treatmentId: '',
    note: '',
    date: new Date().toISOString().split('T')[0],
    appointmentId: '',
    paidAmount: 0,
    isPackageSession: false,
    patientPackageId: '',
    packageName: ''
  });

  const totalEvolutionPrice = useMemo(() => {
    return evolutionTreatments.reduce((sum, item) => {
      return sum + (item.isPackageSession ? 0 : Number(item.price || 0));
    }, 0);
  }, [evolutionTreatments]);

  const handleAddTreatmentRow = () => {
    const defaultTreatment = treatments.length > 0 ? treatments[0] : null;
    setEvolutionTreatments(prev => [
      ...prev,
      {
        id: `trt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        treatmentId: defaultTreatment?.id || '',
        treatmentName: defaultTreatment?.name || '',
        price: defaultTreatment?.cost !== undefined ? Number(defaultTreatment.cost) : 0,
        isPackageSession: false,
        patientPackageId: '',
        packageName: ''
      }
    ]);
  };

  const handleRemoveTreatmentRow = (id: string) => {
    if (evolutionTreatments.length <= 1) {
      showToast('Debe haber al menos un tratamiento en la evolución');
      return;
    }
    setEvolutionTreatments(prev => prev.filter(t => t.id !== id));
  };

  const handleUpdateTreatmentRow = (id: string, updates: any) => {
    setEvolutionTreatments(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
  };

  const handleTreatmentNameChange = (id: string, newName: string) => {
    const trtObj = treatments.find(t => t.name === newName);
    setEvolutionTreatments(prev => prev.map(t => {
      if (t.id !== id) return t;
      return {
        ...t,
        treatmentName: newName,
        treatmentId: trtObj?.id || '',
        price: t.isPackageSession ? 0 : (trtObj?.cost !== undefined ? Number(trtObj.cost) : t.price)
      };
    }));
  };

  const [scheduleNextApt, setScheduleNextApt] = useState(false);
  const [nextAptData, setNextAptData] = useState({
    date: getFutureDate(7),
    time: '10:00',
    treatment: '',
    treatmentId: '',
    notes: ''
  });

  // Subscribe to evolutions, appointments & packages
  useEffect(() => {
    if (!patient?.id || !ownerId) return;

    // Fetch evolutions
    const q = query(
      collection(db, `patients/${patient.id}/evolutions`),
      where('userId', '==', ownerId)
    );
    const unsubscribeEvolutions = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvolutions(docs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || '')));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `patients/${patient.id}/evolutions`));

    // Fetch appointments to calculate KPIs and link with evolutions
    const appQ = query(
      collection(db, 'appointments'),
      where('userId', '==', ownerId)
    );
    const unsubscribeApps = onSnapshot(appQ, (snapshot) => {
      const allApps: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const apps: any[] = allApps.filter((a: any) => a.patientId === patient.id);

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
          appointmentId: targetAppointmentId ? targetApt.id : (prev.appointmentId || targetApt.id),
          date: targetAppointmentId ? (targetApt.date || todayStr) : (prev.appointmentId ? prev.date : (targetApt.date || todayStr)),
          treatment: targetAppointmentId ? (targetApt.type || targetApt.treatment || (treatments[0]?.name || '')) : (prev.appointmentId ? prev.treatment : (targetApt.type || targetApt.treatment || (treatments[0]?.name || ''))),
          treatmentId: targetAppointmentId ? (targetApt.treatmentId || matchedTreatment?.id || '') : (prev.appointmentId ? prev.treatmentId : (targetApt.treatmentId || matchedTreatment?.id || '')),
          paidAmount: targetAppointmentId ? historicalPrice : (prev.appointmentId ? prev.paidAmount : historicalPrice),
          isPackageSession: isTargetPkg,
          patientPackageId: targetApt.patientPackageId || '',
          packageName: targetApt.packageName || ''
        }));

        setEvolutionTreatments(prev => {
          if (!targetAppointmentId && prev.length > 0 && prev[0].treatmentName) return prev;
          if (targetApt.treatmentItems && Array.isArray(targetApt.treatmentItems) && targetApt.treatmentItems.length > 0) {
            return targetApt.treatmentItems.map((it: any, idx: number) => ({
              id: `trt-apt-${idx}`,
              treatmentId: it.treatmentId || '',
              treatmentName: it.treatmentName || it.treatment || '',
              price: Number(it.price || it.paidAmount || 0),
              isPackageSession: Boolean(it.isPackageSession),
              patientPackageId: it.patientPackageId || '',
              packageName: it.packageName || ''
            }));
          }
          return [{
            id: 'trt-apt-0',
            treatmentId: targetApt.treatmentId || matchedTreatment?.id || treatments[0]?.id || '',
            treatmentName: targetApt.type || targetApt.treatment || matchedTreatment?.name || treatments[0]?.name || '',
            price: historicalPrice,
            isPackageSession: isTargetPkg,
            patientPackageId: targetApt.patientPackageId || '',
            packageName: targetApt.packageName || ''
          }];
        });
      } else if (treatments.length > 0) {
        setEvolutionTreatments(prev => {
          if (prev.length > 0 && prev[0].treatmentName) return prev;
          return [{
            id: 'trt-default-1',
            treatmentId: treatments[0]?.id || '',
            treatmentName: treatments[0]?.name || '',
            price: treatments[0]?.cost !== undefined ? Number(treatments[0].cost) : 0,
            isPackageSession: false,
            patientPackageId: '',
            packageName: ''
          }];
        });
      }
    });

    // Subscribe to patient packages
    const pkgQ = query(
      collection(db, 'patient_packages'),
      where('userId', '==', ownerId),
      where('patientId', '==', patient.id)
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
  }, [patient?.id, treatments, targetAppointmentId, ownerId]);

  // Dynamically calculate Patient KPIs & Total Spending across all turnos and evolutions
  // (Including past months, manual evolutions, multiple treatments, and packages)
  useEffect(() => {
    // 1. Calculate spending on all registered clinical evolutions
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
    // Lo que el paciente fue gastando es ÚNICAMENTE el total de cada evolución y el paquete adquirido:
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
  }, [patientAppointments, evolutions, patientPackages, treatments]);

  const handleSelectAppointmentForEvolution = (aptId: string) => {
    if (!aptId || aptId === 'manual') {
      const defaultTreatment = treatments.length > 0 ? treatments[0] : null;
      setEvolutionData(prev => ({
        ...prev,
        appointmentId: '',
        date: new Date().toISOString().split('T')[0],
        treatment: prev.treatment || (defaultTreatment ? defaultTreatment.name : ''),
        treatmentId: prev.treatmentId || (defaultTreatment ? defaultTreatment.id : ''),
        paidAmount: defaultTreatment?.cost || 0,
        isPackageSession: false,
        patientPackageId: '',
        packageName: ''
      }));
      setEvolutionTreatments([{
        id: `trt-${Date.now()}`,
        treatmentId: defaultTreatment?.id || '',
        treatmentName: defaultTreatment?.name || '',
        price: defaultTreatment?.cost !== undefined ? Number(defaultTreatment.cost) : 0,
        isPackageSession: false,
        patientPackageId: '',
        packageName: ''
      }]);
      return;
    }

    const apt = patientAppointments.find(a => a.id === aptId);
    if (!apt) return;

    const matchedTreatment = treatments.find(t => t.name === (apt.type || apt.treatment) || t.id === apt.treatmentId);
    const isTargetPkg = Boolean(apt.isPackageSession);
    const historicalPrice = isTargetPkg ? 0 : (
      (typeof apt.paidAmount === 'number' && !isNaN(apt.paidAmount))
        ? apt.paidAmount
        : (typeof apt.cost === 'number' && !isNaN(apt.cost))
          ? apt.cost
          : (typeof apt.price === 'number' && !isNaN(apt.price))
            ? apt.price
            : (matchedTreatment?.cost || 0)
    );

    setEvolutionData(prev => ({
      ...prev,
      appointmentId: apt.id,
      date: apt.date || prev.date,
      treatment: apt.type || apt.treatment || prev.treatment || (treatments[0]?.name || ''),
      treatmentId: apt.treatmentId || matchedTreatment?.id || '',
      paidAmount: historicalPrice,
      isPackageSession: isTargetPkg,
      patientPackageId: apt.patientPackageId || '',
      packageName: apt.packageName || ''
    }));

    if (apt.treatmentItems && Array.isArray(apt.treatmentItems) && apt.treatmentItems.length > 0) {
      setEvolutionTreatments(apt.treatmentItems.map((it: any, idx: number) => ({
        id: `trt-sel-${idx}-${Date.now()}`,
        treatmentId: it.treatmentId || '',
        treatmentName: it.treatmentName || it.treatment || '',
        price: Number(it.price || it.paidAmount || 0),
        isPackageSession: Boolean(it.isPackageSession),
        patientPackageId: it.patientPackageId || '',
        packageName: it.packageName || ''
      })));
    } else {
      setEvolutionTreatments([{
        id: `trt-sel-0-${Date.now()}`,
        treatmentId: apt.treatmentId || matchedTreatment?.id || treatments[0]?.id || '',
        treatmentName: apt.type || apt.treatment || matchedTreatment?.name || (treatments[0]?.name || ''),
        price: historicalPrice,
        isPackageSession: isTargetPkg,
        patientPackageId: apt.patientPackageId || '',
        packageName: apt.packageName || ''
      }]);
    }
  };

  const handleCancelEdit = () => {
    setEditingEvolution(null);
    const defaultTreatment = treatments[0] || null;
    setEvolutionTreatments([{
      id: `trt-${Date.now()}`,
      treatmentId: defaultTreatment?.id || '',
      treatmentName: defaultTreatment?.name || '',
      price: defaultTreatment?.cost !== undefined ? Number(defaultTreatment.cost) : 0,
      isPackageSession: false,
      patientPackageId: '',
      packageName: ''
    }]);
    setEvolutionData({
      treatment: defaultTreatment?.name || '',
      treatmentId: defaultTreatment?.id || '',
      note: '',
      date: new Date().toISOString().split('T')[0],
      appointmentId: '',
      paidAmount: defaultTreatment?.cost || 0,
      isPackageSession: false,
      patientPackageId: '',
      packageName: ''
    });
  };

  const handleStartEditEvolution = (entry: any) => {
    const editability = checkEvolutionEditability(entry);
    if (!editability.canEdit) {
      showToast('No es posible editar: esta evolución fue registrada hace más de 24 horas y no permite modificaciones.', 'error');
      return;
    }

    setEditingEvolution(entry);
    setIsAddingEntry(true);
    setPatientDetailTab('evolutions');

    setEvolutionData({
      treatment: entry.treatment || '',
      treatmentId: entry.treatmentId || '',
      note: entry.note || '',
      date: entry.date || new Date().toISOString().split('T')[0],
      appointmentId: entry.appointmentId || '',
      paidAmount: typeof entry.paidAmount === 'number' ? entry.paidAmount : (entry.cost || 0),
      isPackageSession: Boolean(entry.isPackageSession),
      patientPackageId: entry.patientPackageId || '',
      packageName: entry.packageName || ''
    });

    if (Array.isArray(entry.items) && entry.items.length > 0) {
      setEvolutionTreatments(entry.items.map((it: any, idx: number) => ({
        id: `trt-edit-${idx}-${Date.now()}`,
        treatmentId: it.treatmentId || '',
        treatmentName: it.treatmentName || it.treatment || '',
        price: it.isPackageSession ? 0 : Number(it.price || 0),
        isPackageSession: Boolean(it.isPackageSession),
        patientPackageId: it.patientPackageId || '',
        packageName: it.packageName || ''
      })));
    } else {
      setEvolutionTreatments([{
        id: `trt-edit-0-${Date.now()}`,
        treatmentId: entry.treatmentId || '',
        treatmentName: entry.treatment || (treatments[0]?.name || ''),
        price: entry.isPackageSession ? 0 : Number(entry.paidAmount ?? entry.cost ?? 0),
        isPackageSession: Boolean(entry.isPackageSession),
        patientPackageId: entry.patientPackageId || '',
        packageName: entry.packageName || ''
      }]);
    }

    setTimeout(() => {
      const container = document.getElementById('evolution-form-container');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const handleAddEvolution = async () => {
    if (!patient) return;
    if (evolutionTreatments.length === 0) {
      showToast('Por favor añade al menos un tratamiento a la evolución');
      return;
    }
    const hasEmpty = evolutionTreatments.some(t => !t.treatmentName.trim());
    if (hasEmpty) {
      showToast('Por favor selecciona el nombre del tratamiento para cada ítem');
      return;
    }
    if (!evolutionData.note.trim()) {
      showToast('Por favor describe la nota o procedimiento de la evolución');
      return;
    }

    // Edición de evolución existente dentro del plazo de 24 horas
    if (editingEvolution) {
      const editability = checkEvolutionEditability(editingEvolution);
      if (!editability.canEdit) {
        showToast('No se puede guardar: el plazo de 24 horas para modificar esta evolución ha expirado.', 'error');
        return;
      }

      try {
        const batch = writeBatch(db);
        const evolutionPath = `patients/${patient.id}/evolutions`;
        const evoRef = doc(db, evolutionPath, editingEvolution.id);
        const globalEvolutionRef = doc(db, 'evolutions', editingEvolution.id);

        const attentionDate = evolutionData.date || new Date().toISOString().split('T')[0];
        const totalPaid = evolutionTreatments.reduce(
          (sum, item) => sum + (item.isPackageSession ? 0 : Number(item.price || 0)),
          0
        );
        const combinedTreatmentName = evolutionTreatments.map(t => t.treatmentName).join(' + ');

        const itemsPayload = evolutionTreatments.map(t => ({
          treatmentId: t.treatmentId || '',
          treatmentName: t.treatmentName,
          price: t.isPackageSession ? 0 : Number(t.price || 0),
          isPackageSession: Boolean(t.isPackageSession),
          patientPackageId: t.patientPackageId || null,
          packageName: t.packageName || null
        }));

        const isAllPackages = evolutionTreatments.every(t => t.isPackageSession);
        const firstPkg = evolutionTreatments.find(t => t.isPackageSession);

        const updatePayload: any = {
          treatment: combinedTreatmentName,
          treatmentId: evolutionTreatments[0]?.treatmentId || '',
          items: itemsPayload,
          cost: totalPaid,
          paidAmount: totalPaid,
          isPackageSession: isAllPackages,
          patientPackageId: firstPkg?.patientPackageId || null,
          packageName: firstPkg?.packageName || null,
          note: evolutionData.note.trim(),
          date: attentionDate,
          appointmentId: evolutionData.appointmentId || null,
          updatedAt: serverTimestamp(),
          lastEditedAt: serverTimestamp(),
          lastEditedBy: currentDoctorName
        };

        batch.update(evoRef, updatePayload);
        batch.update(globalEvolutionRef, updatePayload);

        // Si estaba vinculada a un turno, actualizar costo y tratamiento en el turno
        if (evolutionData.appointmentId) {
          batch.update(doc(db, 'appointments', evolutionData.appointmentId), {
            cost: totalPaid,
            price: totalPaid,
            paidAmount: totalPaid,
            treatment: combinedTreatmentName,
            type: combinedTreatmentName,
            treatmentItems: itemsPayload,
            updatedAt: serverTimestamp()
          });
        }

        await batch.commit();

        showToast('Evolución clínica modificada exitosamente');
        handleCancelEdit();
        return;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `patients/${patient.id}/evolutions/${editingEvolution.id}`);
        return;
      }
    }

    try {
      // Consume package sessions for rows that use a package
      for (const item of evolutionTreatments) {
        if (item.isPackageSession && item.patientPackageId) {
          await consumePackageSession(
            db,
            item.patientPackageId,
            item.treatmentName,
            ownerId,
            patient.name
          );
        }
      }

      const batch = writeBatch(db);
      const evolutionPath = `patients/${patient.id}/evolutions`;
      const newEvolutionRef = doc(collection(db, evolutionPath));
      const globalEvolutionRef = doc(db, 'evolutions', newEvolutionRef.id);

      const attentionDate = evolutionData.date || new Date().toISOString().split('T')[0];
      const totalPaid = evolutionTreatments.reduce(
        (sum, item) => sum + (item.isPackageSession ? 0 : Number(item.price || 0)),
        0
      );
      const combinedTreatmentName = evolutionTreatments.map(t => t.treatmentName).join(' + ');

      const itemsPayload = evolutionTreatments.map(t => ({
        treatmentId: t.treatmentId || '',
        treatmentName: t.treatmentName,
        price: t.isPackageSession ? 0 : Number(t.price || 0),
        isPackageSession: Boolean(t.isPackageSession),
        patientPackageId: t.patientPackageId || null,
        packageName: t.packageName || null
      }));

      const isAllPackages = evolutionTreatments.every(t => t.isPackageSession);
      const firstPkg = evolutionTreatments.find(t => t.isPackageSession);

      const evolutionPayload = {
        id: newEvolutionRef.id,
        patientId: patient.id,
        patientName: patient.name || '',
        patientIdNumber: patient.idNumber || '',
        userId: ownerId,
        doctorId: user?.uid || '',
        doctor: currentDoctorName,
        doctorEmail: user?.email || '',
        appointmentId: evolutionData.appointmentId || null,
        treatment: combinedTreatmentName,
        treatmentId: evolutionTreatments[0]?.treatmentId || '',
        items: itemsPayload,
        cost: totalPaid,
        paidAmount: totalPaid,
        isPackageSession: isAllPackages,
        patientPackageId: firstPkg?.patientPackageId || null,
        packageName: firstPkg?.packageName || null,
        note: evolutionData.note.trim(),
        date: attentionDate,
        status: 'Completed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      batch.set(newEvolutionRef, evolutionPayload);
      batch.set(globalEvolutionRef, evolutionPayload);

      // Deduct materials from stock for each treatment item (non-package)
      for (const item of evolutionTreatments) {
        if (!item.isPackageSession) {
          const trtObj = treatments.find(t => t.name === item.treatmentName || t.id === item.treatmentId);
          if (trtObj && trtObj.materials && trtObj.materials.length > 0) {
            for (const mat of trtObj.materials) {
              const matId = mat.materialId || mat.id;
              const qty = Number(mat.qty || mat.quantity || 0);
              if (!matId || qty <= 0) continue;

              const stockRef = doc(db, 'stocks', matId);
              batch.update(stockRef, {
                stock: increment(-qty),
                updatedAt: serverTimestamp()
              });

              const movementRef = doc(collection(db, `stocks/${matId}/movements`));
              batch.set(movementRef, {
                type: 'out',
                quantity: qty,
                reason: `Consumido en evolución: ${item.treatmentName} para ${patient.name}`,
                date: serverTimestamp(),
                userId: ownerId
              });
            }
          }
        }
      }

      const patientRef = doc(db, 'patients', patient.id);
      batch.set(patientRef, {
        lastVisit: attentionDate,
        updatedAt: serverTimestamp(),
        userId: ownerId
      }, { merge: true });

      if (evolutionData.appointmentId) {
        batch.update(doc(db, 'appointments', evolutionData.appointmentId), {
          status: 'finished',
          cost: totalPaid,
          price: totalPaid,
          paidAmount: totalPaid,
          treatment: combinedTreatmentName,
          type: combinedTreatmentName,
          treatmentItems: itemsPayload,
          evolutionId: newEvolutionRef.id,
          updatedAt: serverTimestamp()
        });
      }

      patientAppointments.forEach((app: any) => {
        if (
          app.id !== evolutionData.appointmentId &&
          app.date === attentionDate &&
          app.status !== 'finished'
        ) {
          batch.update(doc(db, 'appointments', app.id), {
            status: 'finished',
            cost: totalPaid,
            price: totalPaid,
            paidAmount: totalPaid,
            treatment: combinedTreatmentName,
            type: combinedTreatmentName,
            treatmentItems: itemsPayload,
            evolutionId: newEvolutionRef.id,
            updatedAt: serverTimestamp()
          });
        }
      });

      let nextAptScheduled = false;
      if (scheduleNextApt && nextAptData.date && nextAptData.time) {
        const [nextYear, nextMonth, nextDay] = nextAptData.date.split('-').map(Number);
        const [nextH, nextM] = nextAptData.time.split(':').map(Number);
        const nextStartDate = new Date(nextYear, nextMonth - 1, nextDay, nextH, nextM);

        const nextMatchedTreatment = treatments.find(t => t.name === nextAptData.treatment);
        const nextPrice = nextMatchedTreatment?.cost ? Number(nextMatchedTreatment.cost) : 0;

        const parsed = splitFullName(patient.name || '');
        const pFn = patient.firstName || parsed.firstName || '';
        const pLn = patient.lastName || parsed.lastName || '';

        const newAptRef = doc(collection(db, 'appointments'));
        batch.set(newAptRef, {
          id: newAptRef.id,
          patientId: patient.id,
          patientName: patient.name || '',
          patientFirstName: pFn,
          patientLastName: pLn,
          patientPhone: patient.phone || '',
          doctor: currentDoctorName,
          doctorId: user?.uid || '',
          doctorEmail: user?.email || '',
          date: nextAptData.date,
          time: nextAptData.time,
          treatment: nextAptData.treatment || combinedTreatmentName,
          treatmentId: nextAptData.treatmentId || evolutionTreatments[0]?.treatmentId || '',
          type: nextAptData.treatment || combinedTreatmentName,
          cost: nextPrice,
          price: nextPrice,
          paidAmount: nextPrice,
          notes: nextAptData.notes ? `Programado desde evolución: ${nextAptData.notes}` : `Programado tras evolución de ${combinedTreatmentName}`,
          status: 'confirmado',
          startDate: nextStartDate,
          userId: ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        nextAptScheduled = true;
      }

      await batch.commit();

      const defaultTreatment = treatments[0];
      setEvolutionTreatments([{
        id: `trt-${Date.now()}`,
        treatmentId: defaultTreatment?.id || '',
        treatmentName: defaultTreatment?.name || '',
        price: defaultTreatment?.cost !== undefined ? Number(defaultTreatment.cost) : 0,
        isPackageSession: false,
        patientPackageId: '',
        packageName: ''
      }]);
      setEvolutionData({
        treatment: treatments[0]?.name || '',
        treatmentId: treatments[0]?.id || '',
        note: '',
        date: new Date().toISOString().split('T')[0],
        appointmentId: '',
        paidAmount: treatments[0]?.cost || 0,
        isPackageSession: false,
        patientPackageId: '',
        packageName: ''
      });
      setScheduleNextApt(false);
      setNextAptData({
        date: getFutureDate(7),
        time: '10:00',
        treatment: '',
        treatmentId: '',
        notes: ''
      });
      setIsAddingEntry(false);

      if (nextAptScheduled) {
        showToast('Evolución guardada y próximo turno agendado exitosamente');
      } else {
        showToast('Evolución clínica añadida con éxito');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `patients/${patient.id}/evolutions`);
    }
  };

  const handleDeleteEvolution = async (evolutionOrId: any) => {
    const evoObj = typeof evolutionOrId === 'string' 
      ? evolutions.find(e => e.id === evolutionOrId) 
      : evolutionOrId;
    const evoId = typeof evolutionOrId === 'string' ? evolutionOrId : evolutionOrId?.id;

    if (evoObj) {
      const editability = checkEvolutionEditability(evoObj);
      if (!editability.canEdit) {
        showToast('No es posible eliminar: esta evolución fue registrada hace más de 24 horas y se encuentra archivada y protegida.', 'error');
        return;
      }
    }

    if (!window.confirm('¿Está seguro de que desea eliminar esta evolución?')) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, `patients/${patient.id}/evolutions`, evoId));
      batch.delete(doc(db, 'evolutions', evoId));
      await batch.commit();
      showToast('Evolución eliminada con éxito');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${patient.id}/evolutions/${evoId}`);
    }
  };

  const displayName = useMemo(() => {
    const ln = patient?.lastName || getPatientLastName(patient);
    const fn = patient?.firstName || getPatientFirstName(patient);
    if (ln) {
      return (
        <>
          <span className="font-extrabold">{ln}</span>
          {fn && fn !== 'Paciente' && <span className="font-medium text-on-surface-variant">, {fn}</span>}
        </>
      );
    }
    return formatPatientLastNameFirst(patient);
  }, [patient]);

  const renderEvolutionCard = (entry: any, compact: boolean = false) => {
    const hasItems = Array.isArray(entry.items) && entry.items.length > 0;
    const hasMaterials = !entry.isPackageSession && (
      hasItems
        ? entry.items.some((it: any) => {
            const trt = treatments.find(t => t.name === (it.treatmentName || it.treatment) || t.id === it.treatmentId);
            return trt && trt.materials && trt.materials.length > 0;
          })
        : (() => {
            const treatmentObj = treatments.find(t => t.name === entry.treatment || t.id === entry.treatmentId);
            return treatmentObj && treatmentObj.materials && treatmentObj.materials.length > 0;
          })()
    );
    const editability = checkEvolutionEditability(entry);
    const isCurrentlyEditing = editingEvolution?.id === entry.id;

    return (
      <div 
        key={entry.id} 
        className={cn(
          "bg-surface rounded-xl border space-y-2 relative group transition-all shadow-2xs",
          isCurrentlyEditing 
            ? "border-amber-500/80 ring-2 ring-amber-500/20 bg-amber-50/20" 
            : "border-outline-variant hover:border-primary/40",
          compact ? "p-3 text-xs" : "p-4 space-y-2.5"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-on-surface font-mono">{entry.date}</span>

            {/* Badge de estado de edición (24 Horas) */}
            {editability.canEdit ? (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-amber-800 bg-amber-500/15 border border-amber-500/30 shadow-2xs"
                title={`Esta evolución puede modificarse porque fue registrada hace menos de 24 horas. Restan ~${editability.remainingHours}h ${editability.remainingMinutes}m.`}
              >
                <Clock size={10} className="text-amber-600" />
                <span>Editable ({editability.remainingHours > 0 ? `quedan ~${editability.remainingHours}h` : `${editability.remainingMinutes} min`})</span>
              </span>
            ) : (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium text-on-surface-variant/70 bg-surface-bright border border-outline-variant/60"
                title="Edición bloqueada: Las notas de evolución clínica no pueden modificarse trascurridas 24 horas del registro por seguridad y auditoría médica."
              >
                <Lock size={9} />
                <span>Edición cerrada (+24h)</span>
              </span>
            )}
            
            {hasItems ? (
              <>
                {entry.items.map((item: any, idx: number) => (
                  <span 
                    key={idx} 
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20"
                  >
                    <span>{item.treatmentName || item.treatment}</span>
                    {item.isPackageSession ? (
                      <span className="text-[9px] text-secondary font-bold">({item.packageName || 'Paquete'})</span>
                    ) : (
                      <span className="text-[9px] font-mono text-tertiary font-bold">${Number(item.price ?? 0).toLocaleString()}</span>
                    )}
                  </span>
                ))}
                {entry.items.length > 1 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono text-tertiary bg-tertiary/10 border border-tertiary/30">
                    Total: ${Number(entry.paidAmount ?? entry.cost ?? 0).toLocaleString()}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  {entry.treatment}
                </span>
                {entry.isPackageSession ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary/15 text-secondary border border-secondary/30 flex items-center gap-1">
                    <Package size={10} />
                    {entry.packageName ? `Paquete: ${entry.packageName}` : 'Sesión de Paquete'}
                  </span>
                ) : null}
                {typeof entry.paidAmount === 'number' && !isNaN(entry.paidAmount) && !entry.isPackageSession && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono text-tertiary bg-tertiary/10 border border-tertiary/20">
                    ${entry.paidAmount.toLocaleString()}
                  </span>
                )}
              </>
            )}

            {hasMaterials && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary/10 text-secondary border border-secondary/20 flex items-center gap-1">
                <Layers size={10} />
                Materiales descontados
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {editability.canEdit ? (
              <button
                type="button"
                onClick={() => handleStartEditEvolution(entry)}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer shadow-2xs active:scale-95",
                  isCurrentlyEditing
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : "text-primary bg-primary/10 hover:bg-primary/20 border border-primary/25"
                )}
                title="Editar evolución dentro de las 24 horas permitidas"
              >
                <Edit2 size={11} />
                <span>{isCurrentlyEditing ? 'Editando...' : 'Editar'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-on-surface-variant/50 bg-surface-bright border border-outline-variant/40 rounded-md cursor-not-allowed"
                title="Superó el plazo máximo de 24 horas para modificaciones"
              >
                <Lock size={10} />
                <span className="hidden sm:inline">No editable</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleDeleteEvolution(entry)}
              className={cn(
                "p-1 rounded transition-all cursor-pointer",
                editability.canEdit
                  ? "opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error hover:bg-error-container"
                  : "opacity-0 group-hover:opacity-60 text-on-surface-variant/40 hover:text-on-surface-variant cursor-not-allowed"
              )}
              title={editability.canEdit ? "Eliminar evolución" : "No eliminable (registro archivado tras 24hs)"}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <p className="text-[12px] text-on-surface leading-relaxed pl-1 whitespace-pre-wrap">{entry.note}</p>

        <div className="flex items-center justify-between pt-1.5 border-t border-outline-variant/40 pl-1 text-[10px] text-on-surface-variant">
          <div className="flex items-center gap-1.5 flex-wrap">
            <User size={11} className="text-primary" />
            <p className="font-semibold">{entry.doctor}</p>
            {entry.lastEditedBy && (
              <span className="text-[9px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Editado por {entry.lastEditedBy}
              </span>
            )}
          </div>
          {entry.doctorEmail && (
            <span className="text-[9px] text-on-surface-variant/60 truncate max-w-[150px]">{entry.doctorEmail}</span>
          )}
        </div>
      </div>
    );
  };

  const filteredEvolutions = useMemo(() => {
    if (!historySearchTerm.trim()) return evolutions;
    const term = historySearchTerm.toLowerCase();
    return evolutions.filter((e: any) => 
      (e.treatment || '').toLowerCase().includes(term) ||
      (e.note || '').toLowerCase().includes(term) ||
      (e.doctor || '').toLowerCase().includes(term) ||
      (e.date || '').includes(term) ||
      (Array.isArray(e.items) && e.items.some((it: any) => (it.treatmentName || '').toLowerCase().includes(term)))
    );
  }, [evolutions, historySearchTerm]);

  const renderEvolutionsList = (compact: boolean = false) => {
    const listToRender = compact && historySearchTerm.trim() ? filteredEvolutions : evolutions;

    return (
      <div className="space-y-3">
        {listToRender.map((entry) => renderEvolutionCard(entry, compact))}
        {listToRender.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-outline-variant rounded-xl opacity-60">
            <FileText size={24} className="mx-auto mb-2 text-on-surface-variant" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
              {historySearchTerm.trim() ? 'Sin coincidencias en el historial' : 'Sin evoluciones registradas'}
            </p>
            <p className="text-[10px] text-on-surface-variant/70 mt-1">
              {historySearchTerm.trim() ? 'Prueba con otro término de búsqueda.' : 'Usa el formulario para registrar la primera evolución clínica del paciente.'}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderEvolutionForm = () => {
    const activePackages = patientPackages.filter(p => p.status === 'active' && p.remainingSessions > 0);

    return (
      <div id="evolution-form-container" className="p-4.5 bg-surface rounded-xl border border-primary/30 space-y-4 shadow-sm animate-in fade-in duration-200 h-full flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-outline-variant pb-2.5 shrink-0">
          <div className="flex items-center gap-2">
            {editingEvolution ? (
              <Edit2 size={15} className="text-amber-600" />
            ) : (
              <Sparkles size={14} className="text-primary" />
            )}
            <span className="text-[12px] font-bold text-on-surface uppercase tracking-wider">
              {editingEvolution ? 'Modificar Evolución Clínica' : 'Registrar Evolución Clínica'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {editingEvolution && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-[11px] font-bold text-on-surface-variant hover:text-error px-2 py-0.5 rounded border border-outline-variant hover:border-error/30 transition-colors flex items-center gap-1 cursor-pointer"
                title="Descartar cambios y volver al modo de nueva evolución"
              >
                <X size={12} />
                <span>Cancelar edición</span>
              </button>
            )}
            <span className="text-[10px] text-on-surface-variant bg-surface-bright px-2 py-0.5 rounded border border-outline-variant font-medium">
              Atendido por: <b>{currentDoctorName}</b>
            </span>
          </div>
        </div>

        {editingEvolution && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg flex items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-amber-600 shrink-0" />
              <span>
                <b>Modo Edición:</b> Modificando registro ({checkEvolutionEditability(editingEvolution).message}). Pasadas 24hs la edición quedará cerrada.
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-[11px] font-bold text-amber-800 underline hover:no-underline shrink-0 cursor-pointer"
            >
              Volver a nueva
            </button>
          </div>
        )}

        {/* Vincular con Turno Agendado y Fecha */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-8 space-y-1.5">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
              <Link2 size={12} className="text-primary" />
              Vincular con Turno de Agenda (Opcional)
            </label>
            <select
              value={evolutionData.appointmentId || 'manual'}
              onChange={(e) => handleSelectAppointmentForEvolution(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary font-medium"
            >
              <option value="manual">-- Registro Manual (Sin turno vinculado) --</option>
              {patientAppointments.length > 0 ? (
                <optgroup label="Turnos del Paciente">
                  {patientAppointments.map(apt => {
                    const aptLabel = `${apt.date} ${apt.time || ''} - ${apt.type || apt.treatment || 'Consulta'} (${apt.status})`;
                    return (
                      <option key={apt.id} value={apt.id}>
                        {aptLabel} {apt.isPackageSession ? '[Paquete]' : ''}
                      </option>
                    );
                  })}
                </optgroup>
              ) : (
                <option disabled value="">No hay turnos registrados para este paciente</option>
              )}
            </select>
          </div>

          <div className="sm:col-span-4 space-y-1.5">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Fecha de Atención *
            </label>
            <input
              type="date"
              value={evolutionData.date}
              onChange={(e) => setEvolutionData({ ...evolutionData, date: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary font-medium"
            />
          </div>
        </div>

        {/* Sección de Múltiples Tratamientos en el Turno */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} className="text-primary" />
              Tratamientos Realizados en este Turno ({evolutionTreatments.length})
            </label>
            <button
              type="button"
              onClick={handleAddTreatmentRow}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/15 rounded-md border border-primary/20 transition-all cursor-pointer shadow-2xs active:scale-95"
              id="btn-add-treatment-row"
            >
              <Plus size={13} />
              Agregar otro tratamiento
            </button>
          </div>

          {/* Filas de Tratamientos con Importes Individuales */}
          <div className="space-y-2.5">
            {evolutionTreatments.map((row, index) => {
              const rowTrt = treatments.find(t => t.name === row.treatmentName || t.id === row.treatmentId);
              const hasMaterials = !row.isPackageSession && rowTrt && rowTrt.materials && rowTrt.materials.length > 0;

              return (
                <div 
                  key={row.id} 
                  className="p-3 bg-surface-bright rounded-xl border border-outline-variant hover:border-primary/30 transition-all space-y-2.5 shadow-2xs relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-on-surface flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-extrabold flex items-center justify-center">
                        {index + 1}
                      </span>
                      Tratamiento #{index + 1}
                    </span>

                    {evolutionTreatments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTreatmentRow(row.id)}
                        className="p-1 text-on-surface-variant hover:text-error hover:bg-error-container/40 rounded transition-colors cursor-pointer"
                        title="Quitar este tratamiento del turno"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                    {/* Selector de Tratamiento */}
                    <div className="sm:col-span-7 space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Procedimiento / Tratamiento *
                      </label>
                      <select
                        value={row.treatmentName}
                        onChange={(e) => handleTreatmentNameChange(row.id, e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary font-medium"
                      >
                        <option value="">-- Seleccionar Tratamiento --</option>
                        {treatments.map(t => (
                          <option key={t.id} value={t.name}>
                            {t.name} (Catálogo: ${Number(t.cost || 0).toLocaleString()})
                          </option>
                        ))}
                        {row.treatmentName && !treatments.some(t => t.name === row.treatmentName) && (
                          <option value={row.treatmentName}>{row.treatmentName}</option>
                        )}
                      </select>
                    </div>

                    {/* Importe Tipeable para este Tratamiento */}
                    <div className="sm:col-span-5 space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-between">
                        <span>Importe a Cobrar ($) *</span>
                        {row.isPackageSession && (
                          <span className="text-[9px] text-secondary font-bold">Cubierto ($0)</span>
                        )}
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">$</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          disabled={row.isPackageSession}
                          value={row.price}
                          onChange={(e) => handleUpdateTreatmentRow(row.id, { price: Number(e.target.value) || 0 })}
                          placeholder="0"
                          className={cn(
                            "w-full pl-6 pr-3 py-2 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary font-mono font-bold text-on-surface",
                            row.isPackageSession && "bg-surface-dim/40 cursor-not-allowed opacity-75 text-on-surface-variant"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Opciones de Paquete para esta fila (si el paciente tiene paquetes activos) */}
                  {activePackages.length > 0 && (
                    <div className="pt-1.5 border-t border-outline-variant/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-secondary flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(row.isPackageSession)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const defaultPkg = activePackages[0];
                            handleUpdateTreatmentRow(row.id, {
                              isPackageSession: checked,
                              patientPackageId: checked ? defaultPkg.id : '',
                              packageName: checked ? defaultPkg.packageName : '',
                              price: checked ? 0 : (rowTrt?.cost || 0)
                            });
                          }}
                          className="rounded border-outline-variant text-secondary focus:ring-secondary"
                        />
                        <span>Descontar sesión de paquete de este paciente</span>
                      </label>

                      {row.isPackageSession && (
                        <select
                          value={row.patientPackageId}
                          onChange={(e) => {
                            const pkgId = e.target.value;
                            const foundPkg = activePackages.find(p => p.id === pkgId);
                            handleUpdateTreatmentRow(row.id, {
                              patientPackageId: pkgId,
                              packageName: foundPkg?.packageName || '',
                              price: 0
                            });
                          }}
                          className="px-2 py-1 bg-white border border-secondary/40 rounded text-[11px] outline-none font-medium text-secondary"
                        >
                          {activePackages.map(pkg => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.packageName} ({pkg.remainingSessions} disp.)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {hasMaterials && (
                    <div className="text-[10px] text-on-surface-variant/80 flex items-center gap-1">
                      <Layers size={11} className="text-secondary shrink-0" />
                      <span>Descontará materiales: {rowTrt.materials.map((m: any) => `${m.qty || 1}x ${m.materialName || 'insumo'}`).join(', ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Resumen Total del Turno */}
          <div className="p-3 bg-tertiary-container/15 rounded-xl border border-tertiary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
            <div className="text-xs text-on-surface">
              <span className="font-bold text-tertiary block sm:inline">Total del Turno:</span>{' '}
              {evolutionTreatments.length > 1 ? (
                <span className="text-[11px] text-on-surface-variant font-mono">
                  {evolutionTreatments.map(t => `${t.treatmentName || 'Tratamiento'}: $${(t.isPackageSession ? 0 : Number(t.price || 0)).toLocaleString()}`).join(' + ')}
                </span>
              ) : (
                <span className="text-[11px] text-on-surface-variant">Suma total de los tratamientos realizados</span>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-base font-extrabold font-mono text-tertiary">
                ${totalEvolutionPrice.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Nota Clínica */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
            Procedimiento / Nota Clínica *
          </label>
          <textarea
            value={evolutionData.note}
            onChange={(e) => setEvolutionData({ ...evolutionData, note: e.target.value })}
            placeholder="Describe los procedimientos realizados, materiales usados, observaciones clínicas, dosis..."
            rows={3}
            className="w-full p-3 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary resize-none leading-relaxed"
          />
        </div>

        {/* Opción para agendar el próximo turno */}
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleNextApt}
              onChange={(e) => setScheduleNextApt(e.target.checked)}
              className="rounded border-outline-variant text-primary focus:ring-primary"
            />
            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
              <CalendarClock size={14} />
              Agendar próximo turno para este paciente
            </span>
          </label>

          {scheduleNextApt && (
            <div className="space-y-3 pt-2 border-t border-primary/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Fecha del Turno</label>
                  <input
                    type="date"
                    value={nextAptData.date}
                    onChange={(e) => setNextAptData({ ...nextAptData, date: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-xs outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Horario</label>
                  <input
                    type="time"
                    value={nextAptData.time}
                    onChange={(e) => setNextAptData({ ...nextAptData, time: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Tratamiento a Realizar</label>
                <select
                  value={nextAptData.treatment || (evolutionTreatments[0]?.treatmentName || '')}
                  onChange={(e) => setNextAptData({ ...nextAptData, treatment: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-xs outline-none focus:border-primary font-medium"
                >
                  <option value="">-- Mismo tratamiento o selecciona otro --</option>
                  {treatments.map(t => (
                    <option key={t.id} value={t.name}>{t.name} (${Number(t.cost || 0).toLocaleString()})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Notas para la próxima cita (Opcional)</label>
                <input
                  type="text"
                  value={nextAptData.notes}
                  onChange={(e) => setNextAptData({ ...nextAptData, notes: e.target.value })}
                  placeholder="Ej: Control de sutura, traer estudios..."
                  className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-xs outline-none focus:border-primary"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 mt-auto border-t border-outline-variant/60 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (editingEvolution) {
                handleCancelEdit();
              }
              setIsAddingEntry(false);
            }}
            className="px-3.5 py-2 border border-outline-variant rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-bright transition-colors cursor-pointer"
          >
            {editingEvolution ? 'Cancelar Edición' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={handleAddEvolution}
            className={cn(
              "px-5 py-2 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95",
              editingEvolution ? "bg-amber-600 hover:bg-amber-700" : "bg-primary hover:bg-primary/90"
            )}
            id="btn-save-evolution"
          >
            <Save size={13} />
            {editingEvolution
              ? `Guardar Cambios (${totalEvolutionPrice > 0 ? `$${totalEvolutionPrice.toLocaleString()}` : 'Sesión de paquete'})`
              : `Guardar Evolución (${evolutionTreatments.length > 1 ? `${evolutionTreatments.length} tratamientos` : '1 tratamiento'} • $${totalEvolutionPrice.toLocaleString()})`}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="divide-y divide-outline-variant/60">
      {/* Barra superior de navegación y acciones rápidas */}
      <div className="px-6 py-4 bg-surface-bright/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-surface border border-outline-variant rounded-lg text-xs font-bold text-on-surface transition-all cursor-pointer shadow-2xs hover:border-primary/50 group w-fit"
          id="btn-back-to-patients-top"
        >
          <ArrowLeft size={16} className="text-primary group-hover:-translate-x-1 transition-transform" />
          <span>Volver al menú de pacientes</span>
        </button>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Link
            to={`/agenda?patientId=${patient?.id}&patientName=${encodeURIComponent(patient?.name || '')}`}
            className="px-3.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            id="btn-schedule-patient"
          >
            <CalendarPlus size={14} />
            <span>Agendar Turno</span>
          </Link>
          <button
            type="button"
            onClick={() => onEdit(patient)}
            className="px-3 py-1.5 bg-white border border-outline-variant hover:bg-surface rounded-lg text-xs font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Editar datos del paciente"
            id="btn-edit-patient"
          >
            <Edit2 size={13} />
            <span>Editar</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(patient)}
            className="px-3 py-1.5 bg-white border border-error/20 hover:bg-error-container text-error rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Eliminar paciente"
            id="btn-delete-patient"
          >
            <Trash2 size={13} />
            <span>Eliminar</span>
          </button>
        </div>
      </div>

      {/* Contenido principal del paciente */}
      <div className="p-6 space-y-6">
        {/* Banner de datos del paciente */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-surface-bright rounded-xl border border-outline-variant">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-container text-primary flex items-center justify-center text-xl font-bold shrink-0 shadow-2xs">
              {(getPatientLastName(patient) || patient?.name || 'P').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-on-surface">
                  {displayName}
                </h3>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  patient?.status === 'active' ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-dim text-on-surface-variant"
                )}>
                  {patient?.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                {patient?.gender === 'Female' ? 'Femenino' : patient?.gender === 'Male' ? 'Masculino' : 'Otro'} • {calculateAge(patient?.birthDate)} años {patient?.birthDate ? `(${patient.birthDate})` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-on-surface-variant">
                <div className="flex items-center gap-1.5">
                  <Phone size={13} className="text-primary/70 shrink-0" />
                  <span className="font-mono font-medium">{formatArgentinePhoneWithPrefix(patient?.phone) || 'Sin teléfono'}</span>
                </div>
                {patient?.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={13} className="text-secondary/70 shrink-0" />
                    <span>{patient.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Attendance & Financial KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
            <CheckCircle2 size={16} className="text-tertiary mb-1" />
            <span className="text-[18px] font-bold text-on-surface">{patientStats.attendance}%</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Asistencia</span>
          </div>
          <div className="p-3.5 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
            <AlertTriangle size={16} className="text-error mb-1" />
            <span className="text-[18px] font-bold text-on-surface">{patientStats.absences}</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Faltas</span>
          </div>
          <div className="p-3.5 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
            <Clock size={16} className="text-primary mb-1" />
            <span className="text-[13px] font-bold text-on-surface truncate w-full text-center">{patientStats.nextApt}</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Próximo Turno</span>
          </div>
          <div className="p-3.5 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
            <TrendingUp size={16} className="text-secondary mb-1" />
            <span className="text-[14px] font-extrabold text-on-surface">${patientStats.totalSpent.toLocaleString()}</span>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Total Invertido</span>
            {patientStats.packagesSpent > 0 ? (
              <span className="text-[9px] text-on-surface-variant font-medium mt-0.5 text-center">
                ${patientStats.turnosSpent.toLocaleString()} turnos • ${patientStats.packagesSpent.toLocaleString()} paq.
              </span>
            ) : (
              <span className="text-[9px] text-on-surface-variant font-medium mt-0.5 text-center">
                ${patientStats.turnosSpent.toLocaleString()} en atenciones
              </span>
            )}
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-2 border-b border-outline-variant overflow-x-auto">
          <button
            type="button"
            id="tab-patient-evolutions"
            onClick={() => setPatientDetailTab('evolutions')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px whitespace-nowrap cursor-pointer",
              patientDetailTab === 'evolutions'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <FileText size={14} />
            Evoluciones ({evolutions.length})
          </button>

          <button
            type="button"
            id="tab-patient-photos"
            onClick={() => setPatientDetailTab('photos')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px whitespace-nowrap cursor-pointer",
              patientDetailTab === 'photos'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Camera size={14} />
            Antes y Después (Fotos)
          </button>

          <button
            type="button"
            id="tab-patient-packages"
            onClick={() => setPatientDetailTab('packages')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px whitespace-nowrap cursor-pointer",
              patientDetailTab === 'packages'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Package size={14} />
            Paquetes Adquiridos ({patientPackages.length})
          </button>

          <button
            type="button"
            id="tab-patient-drive"
            onClick={() => setPatientDetailTab('drive')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px whitespace-nowrap cursor-pointer",
              patientDetailTab === 'drive'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Cloud size={14} />
            Archivos y Google Drive
          </button>
        </div>

        {/* Tab content */}
        {patientDetailTab === 'photos' && (
          <PatientEvolutionPhotos 
            patient={patient}
            ownerId={ownerId}
            treatments={treatments}
          />
        )}

        {patientDetailTab === 'packages' && (
          <PatientPackagesView
            patient={patient}
            ownerId={ownerId}
          />
        )}

        {patientDetailTab === 'drive' && (
          <PatientDriveFiles
            patient={patient}
            evolutions={evolutions}
            doctorName={currentDoctorName}
          />
        )}

        {patientDetailTab === 'evolutions' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-bright p-3.5 rounded-xl border border-outline-variant">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h5 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} className="text-primary" />
                    <span>Evoluciones Clínicas</span>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {evolutions.length}
                    </span>
                  </h5>
                  <span className="text-[10px] font-bold font-mono text-tertiary bg-tertiary/10 border border-tertiary/20 px-2 py-0.5 rounded-md">
                    Total Atenciones / Turnos: ${patientStats.turnosSpent.toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  {isAddingEntry 
                    ? "Historial clínico visible a la izquierda para consulta y referencia continua."
                    : "Registro cronológico de consultas, tratamientos realizados y notas médicas. Suma automáticamente todo lo abonado en cada turno."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isAddingEntry) {
                    setIsAddingEntry(false);
                    if (editingEvolution) handleCancelEdit();
                  } else {
                    setIsAddingEntry(true);
                  }
                }}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0",
                  isAddingEntry 
                    ? "bg-white border border-outline-variant text-on-surface-variant hover:text-error hover:border-error/30" 
                    : "bg-primary text-white hover:bg-primary/90"
                )}
                id="btn-toggle-add-evolution"
              >
                {isAddingEntry ? <X size={13} /> : <Plus size={13} />}
                {isAddingEntry ? (editingEvolution ? 'Cancelar Edición' : 'Cerrar Formulario') : 'Añadir Entrada'}
              </button>
            </div>

            {/* Si está añadiendo una entrada: vista lado a lado (historial a la izquierda, formulario a la derecha) */}
            {isAddingEntry ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Columna Izquierda: Historial para no perder visibilidad mientras se añade la nueva evolución - Ocupa todo el alto del contenedor */}
                <div className="lg:col-span-5 flex flex-col bg-surface rounded-xl border border-outline-variant p-4 shadow-2xs lg:sticky lg:top-4 h-[750px] lg:h-[calc(100vh-140px)] min-h-[600px] overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-outline-variant shrink-0">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="text-primary" />
                      <span className="text-[12px] font-bold text-on-surface uppercase tracking-wider">
                        Historial Previo
                      </span>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {evolutions.length}
                      </span>
                    </div>
                    <span className="text-[10px] text-tertiary font-bold font-mono bg-tertiary/10 px-2 py-0.5 rounded border border-tertiary/20">
                      Total: ${patientStats.turnosSpent.toLocaleString()}
                    </span>
                  </div>

                  {evolutions.length > 2 && (
                    <div className="relative mt-2.5 mb-1 shrink-0">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                      <input
                        type="text"
                        placeholder="Buscar en historial previo..."
                        value={historySearchTerm}
                        onChange={(e) => setHistorySearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-surface-bright border border-outline-variant rounded-lg text-xs outline-none focus:border-primary font-medium placeholder:text-on-surface-variant/60"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 space-y-3 mt-2.5">
                    {renderEvolutionsList(true)}
                  </div>
                </div>

                {/* Columna Derecha: Formulario para registrar la nueva evolución */}
                <div className="lg:col-span-7 h-full">
                  {renderEvolutionForm()}
                </div>
              </div>
            ) : (
              /* Vista estándar de ancho completo cuando no se está añadiendo una entrada */
              <div className="space-y-3">
                {renderEvolutionsList(false)}
              </div>
            )}
          </div>
        )}

        {/* Opción inferior para volver al menú de pacientes general */}
        <div className="pt-6 border-t border-outline-variant/60 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface hover:bg-outline-variant/40 border border-outline-variant rounded-lg text-xs font-bold text-on-surface transition-colors cursor-pointer group"
            id="btn-back-to-patients-bottom"
          >
            <ArrowLeft size={16} className="text-primary group-hover:-translate-x-1 transition-transform" />
            <span>Volver al menú de pacientes general</span>
          </button>
          <span className="text-[11px] text-on-surface-variant font-medium">
            {evolutions.length} evolución{evolutions.length === 1 ? '' : 'es'} registrada{evolutions.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
