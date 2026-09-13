import React, { useState, useEffect } from 'react';
import { 
  FileText, Stethoscope, Save, Calendar, DollarSign, 
  Sparkles, CheckCircle2, Clock, History, AlertCircle, Package,
  User, Phone, ChevronRight, CalendarPlus, Plus, Trash2, Layers
} from 'lucide-react';
import { 
  collection, query, where, getDocs, doc, writeBatch, 
  serverTimestamp, increment, onSnapshot 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { PatientPackage } from '../types';
import { consumePackageSession } from '../lib/packageUtils';
import { formatPatientLastNameFirst, splitFullName } from '../lib/patientNameUtils';
import { cn } from '../lib/utils';

interface ClinicalHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any;
  patient: any;
  ownerId: string;
  treatments: any[];
  onSavedAndFinished?: (evolutionData: any) => void;
}

export function ClinicalHistoryModal({
  isOpen,
  onClose,
  appointment,
  patient,
  ownerId,
  treatments,
  onSavedAndFinished
}: ClinicalHistoryModalProps) {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [isSaving, setIsSaving] = useState(false);
  const [pastEvolutions, setPastEvolutions] = useState<any[]>([]);
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);

  // Multi-treatment state for evolution
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
      id: 'trt-modal-1',
      treatmentId: '',
      treatmentName: '',
      price: 0,
      isPackageSession: false,
      patientPackageId: '',
      packageName: ''
    }
  ]);

  // Evolution Form State
  const [evolutionData, setEvolutionData] = useState({
    treatment: '',
    treatmentId: '',
    date: new Date().toISOString().split('T')[0],
    paidAmount: 0,
    isPackageSession: false,
    patientPackageId: '',
    packageName: '',
    note: ''
  });

  const totalEvolutionPrice = React.useMemo(() => {
    return evolutionTreatments.reduce((sum, item) => {
      return sum + (item.isPackageSession ? 0 : Number(item.price || 0));
    }, 0);
  }, [evolutionTreatments]);

  const handleAddTreatmentRow = () => {
    const defaultTreatment = treatments.length > 0 ? treatments[0] : null;
    setEvolutionTreatments(prev => [
      ...prev,
      {
        id: `trt-m-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
      showToast('Debe registrar al menos un tratamiento en la evolución', 'warning');
      return;
    }
    setEvolutionTreatments(prev => prev.filter(t => t.id !== id));
  };

  const handleUpdateTreatmentRow = (id: string, updates: any) => {
    setEvolutionTreatments(prev => prev.map(t => {
      if (t.id !== id) return t;
      return { ...t, ...updates };
    }));
  };

  const handleTreatmentNameChange = (id: string, name: string) => {
    const matched = treatments.find(t => t.name === name || t.id === name);
    const trtName = matched ? matched.name : name;
    setEvolutionTreatments(prev => prev.map(t => {
      if (t.id !== id) return t;
      const newPrice = t.isPackageSession ? 0 : (matched?.cost !== undefined ? Number(matched.cost) : t.price);
      return {
        ...t,
        treatmentName: trtName,
        treatmentId: matched?.id || '',
        price: newPrice
      };
    }));
  };

  // Schedule Next Appointment / Follow-up State
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

  const currentDoctorName = profile?.name || user?.displayName || user?.email || 'Profesional Médico';

  // Calculate age helper
  const calculateAge = (birthDateString?: string) => {
    if (!birthDateString) return null;
    const today = new Date();
    const birth = new Date(birthDateString);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  };

  // Prepopulate form when appointment changes or opens
  useEffect(() => {
    if (!isOpen || !appointment) return;

    const matchedTreatment = treatments.find(
      t => t.name === (appointment.type || appointment.treatment) || t.id === appointment.treatmentId
    );

    if (Array.isArray(appointment.treatmentItems) && appointment.treatmentItems.length > 0) {
      setEvolutionTreatments(appointment.treatmentItems.map((it: any, idx: number) => ({
        id: it.id || `trt-modal-init-${idx}`,
        treatmentId: it.treatmentId || '',
        treatmentName: it.treatmentName || it.treatment || '',
        price: it.isPackageSession ? 0 : (typeof it.price === 'number' ? it.price : 0),
        isPackageSession: Boolean(it.isPackageSession),
        patientPackageId: it.patientPackageId || '',
        packageName: it.packageName || ''
      })));
    } else {
      const isPkg = Boolean(appointment.isPackageSession);
      const historicalPrice = isPkg ? 0 : (
        (typeof appointment.paidAmount === 'number' && !isNaN(appointment.paidAmount))
          ? appointment.paidAmount
          : (typeof appointment.cost === 'number' && !isNaN(appointment.cost))
            ? appointment.cost
            : (typeof appointment.price === 'number' && !isNaN(appointment.price))
              ? appointment.price
              : (matchedTreatment?.cost || 0)
      );

      setEvolutionTreatments([
        {
          id: 'trt-modal-1',
          treatmentId: appointment.treatmentId || matchedTreatment?.id || '',
          treatmentName: appointment.type || appointment.treatment || matchedTreatment?.name || (treatments[0]?.name || ''),
          price: historicalPrice,
          isPackageSession: isPkg,
          patientPackageId: appointment.patientPackageId || '',
          packageName: appointment.packageName || ''
        }
      ]);
    }

    setEvolutionData({
      treatment: appointment.type || appointment.treatment || matchedTreatment?.name || '',
      treatmentId: appointment.treatmentId || matchedTreatment?.id || '',
      date: appointment.date || new Date().toISOString().split('T')[0],
      paidAmount: 0,
      isPackageSession: false,
      patientPackageId: '',
      packageName: '',
      note: appointment.notes ? `Observaciones del turno: ${appointment.notes}\n\n` : ''
    });

    // Reset and prepare next appointment scheduling
    setScheduleNextApt(false);
    setNextAptData({
      date: getDateOffset(7),
      time: appointment.time || '10:00',
      treatment: appointment.type || appointment.treatment || 'Control / Seguimiento',
      duration: appointment.duration || 30,
      notes: '',
      status: 'pendiente'
    });

    setActiveTab('current');
  }, [isOpen, appointment, treatments]);

  // Load past evolutions and packages for this patient
  useEffect(() => {
    if (!isOpen || !patient?.id || !ownerId) return;

    // Past evolutions
    const evoQuery = query(
      collection(db, `patients/${patient.id}/evolutions`),
      where('userId', '==', ownerId)
    );

    const unsubscribe = onSnapshot(evoQuery, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
      setPastEvolutions(docs);
    }, (err) => {
      console.error('Error fetching past evolutions in modal:', err);
    });

    // Patient active packages
    const pkgQuery = query(
      collection(db, 'patient_packages'),
      where('userId', '==', ownerId),
      where('patientId', '==', patient.id)
    );

    getDocs(pkgQuery).then((snap) => {
      const pkgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PatientPackage))
        .filter(p => p.status === 'active' && (p.remainingSessions || 0) > 0);
      setPatientPackages(pkgs);
    }).catch(err => {
      console.error('Error fetching patient packages in modal:', err);
      setPatientPackages([]);
    });

    return () => unsubscribe();
  }, [isOpen, patient?.id, ownerId]);

  const pastEvolutionsTotalSpent = pastEvolutions.reduce((acc: number, entry: any) => {
    if (Array.isArray(entry.items) && entry.items.length > 0) {
      return acc + entry.items.reduce((sum: number, it: any) => sum + (it.isPackageSession ? 0 : Number(it.price || it.paidAmount || 0)), 0);
    }
    if (entry.isPackageSession) return acc;
    return acc + Number(entry.paidAmount ?? entry.cost ?? 0);
  }, 0);

  const selectedTreatmentObj = treatments.find(
    t => t.name === evolutionData.treatment || t.id === evolutionData.treatmentId
  );

  const handleSaveClinicalHistory = async () => {
    if (!appointment || !patient) return;
    const validTreatments = evolutionTreatments.filter(t => t.treatmentName && t.treatmentName.trim().length > 0);
    if (validTreatments.length === 0) {
      showToast('Por favor selecciona o indica al menos un tratamiento realizado', 'warning');
      return;
    }
    if (!evolutionData.note.trim()) {
      showToast('Por favor describe la evolución o notas clínicas de la sesión', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      // Consume package sessions for any treatments marked as package session
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
      const combinedTreatmentName = evolutionTreatments.map(t => t.treatmentName).join(' + ');

      const itemsPayload = evolutionTreatments.map(item => ({
        id: item.id,
        treatmentId: item.treatmentId || '',
        treatmentName: item.treatmentName,
        price: item.isPackageSession ? 0 : Number(item.price || 0),
        isPackageSession: Boolean(item.isPackageSession),
        patientPackageId: item.isPackageSession ? (item.patientPackageId || null) : null,
        packageName: item.isPackageSession ? (item.packageName || null) : null
      }));

      const isAnyPkgSession = evolutionTreatments.some(t => t.isPackageSession);
      const firstPkgTrt = evolutionTreatments.find(t => t.isPackageSession);

      const evolutionPayload = {
        id: newEvolutionRef.id,
        patientId: patient.id,
        patientName: patient.name || '',
        patientIdNumber: patient.idNumber || '',
        userId: ownerId,
        doctorId: user?.uid || '',
        doctor: currentDoctorName,
        doctorEmail: user?.email || '',
        appointmentId: appointment.id,
        treatment: combinedTreatmentName,
        treatmentId: evolutionTreatments[0]?.treatmentId || '',
        items: itemsPayload,
        cost: totalEvolutionPrice,
        paidAmount: totalEvolutionPrice,
        isPackageSession: isAnyPkgSession,
        patientPackageId: firstPkgTrt ? firstPkgTrt.patientPackageId : null,
        packageName: firstPkgTrt ? (firstPkgTrt.packageName || null) : null,
        note: evolutionData.note.trim(),
        date: attentionDate,
        status: 'Completed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Corroborate database: Save both in patient subcollection AND global collection
      batch.set(newEvolutionRef, evolutionPayload);
      batch.set(globalEvolutionRef, evolutionPayload);

      // Deduct materials from stock for each non-package treatment item
      for (const trtItem of evolutionTreatments) {
        if (trtItem.isPackageSession) continue;
        const matchedTrt = treatments.find(t => t.name === trtItem.treatmentName || t.id === trtItem.treatmentId);
        if (matchedTrt?.materials && matchedTrt.materials.length > 0) {
          for (const item of matchedTrt.materials) {
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
              reason: `Consumido en evolución: ${trtItem.treatmentName} para ${patient.name}`,
              date: serverTimestamp(),
              userId: ownerId
            });
          }
        }
      }

      // Update patient's last visit
      const patientRef = doc(db, 'patients', patient.id);
      batch.set(patientRef, {
        lastVisit: attentionDate,
        updatedAt: serverTimestamp(),
        userId: ownerId
      }, { merge: true });

      // CRITICAL REQUIREMENT: Mark appointment status as 'finished' (Finalizado)
      const aptRef = doc(db, 'appointments', appointment.id);
      batch.update(aptRef, {
        status: 'finished',
        cost: totalEvolutionPrice,
        price: totalEvolutionPrice,
        paidAmount: totalEvolutionPrice,
        treatment: combinedTreatmentName,
        type: combinedTreatmentName,
        treatmentItems: itemsPayload,
        isPackageSession: isAnyPkgSession,
        packageDiscounted: isAnyPkgSession ? true : false,
        evolutionId: newEvolutionRef.id,
        updatedAt: serverTimestamp()
      });

      // User request: Schedule new appointment inside the evolution
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
          patientName: patient.name || `${pFn} ${pLn}`.trim(),
          patientFirstName: pFn,
          patientLastName: pLn,
          patientPhone: patient.phone || '',
          phone: patient.phone || '',
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
          attendance: (patient.attendance || 0) + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        nextAptScheduled = true;
      }

      await batch.commit();

      if (nextAptScheduled) {
        showToast(`Historia clínica guardada, turno finalizado y próximo turno agendado (${nextAptData.date} a las ${nextAptData.time} hs)`, 'success');
      } else {
        showToast('Historia clínica guardada y turno finalizado exitosamente', 'success');
      }
      if (onSavedAndFinished) {
        onSavedAndFinished(evolutionPayload);
      }
      onClose();
    } catch (error) {
      console.error('Error saving clinical history:', error);
      handleFirestoreError(error, OperationType.WRITE, `appointments/${appointment?.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const patientDisplayName = patient ? formatPatientLastNameFirst(patient) : (appointment?.patientName || '');
  const patientAge = calculateAge(patient?.birthDate);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Historia Clínica — Atención en Sesión"
      className="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Header: Patient Banner with In-Session Status */}
        <div className="p-4 bg-surface-bright rounded-xl border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-tertiary-container text-tertiary flex items-center justify-center text-base font-black shrink-0 shadow-xs border border-tertiary/20">
              {patient?.lastName ? patient.lastName.charAt(0).toUpperCase() : patientDisplayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-on-surface">
                  {patientDisplayName}
                </h4>
              </div>
              <p className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                {patient?.idNumber && <span>DNI: {patient.idNumber}</span>}
                {patientAge !== null && <span>• {patientAge} años</span>}
                {patient?.gender && <span>• {patient.gender === 'Male' ? 'Masculino' : patient.gender === 'Female' ? 'Femenino' : patient.gender}</span>}
              </p>
              {patient?.phone && (
                <p className="text-[11px] text-on-surface-variant/80 flex items-center gap-1 mt-0.5">
                  <Phone size={11} className="text-emerald-600" />
                  {patient.phone}
                </p>
              )}
            </div>
          </div>

          <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-outline-variant/60 gap-1 shrink-0">
            {/* Live In-Session Indicator */}
            <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-tertiary/15 text-tertiary border border-tertiary/30 flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-tertiary inline-block animate-ping" />
              En Sesión
            </span>
            <span className="text-[10px] text-on-surface-variant font-medium">
              Turno: {appointment?.date} {appointment?.time ? `• ${appointment.time} hs` : ''}
            </span>
          </div>
        </div>

        {/* Tab Selector: Current Evolution vs Past Records */}
        <div className="flex items-center gap-2 border-b border-outline-variant">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px",
              activeTab === 'current'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Stethoscope size={14} />
            Evolución de la Sesión
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px",
              activeTab === 'history'
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <History size={14} />
            Historial Previo ({pastEvolutions.length})
          </button>
        </div>

        {/* Tab 1: Current Session Evolution Form */}
        {activeTab === 'current' && (
          <div className="space-y-4">
            {/* Fecha de atención y Profesional a cargo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Attention Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} className="text-primary" />
                    Fecha de Atención *
                  </span>
                </label>
                <input
                  type="date"
                  className="w-full px-2.5 py-2 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  value={evolutionData.date}
                  onChange={(e) => setEvolutionData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              {/* Doctor / Professional */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                  <span>Profesional a Cargo</span>
                  <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    Sesión activa
                  </span>
                </label>
                <div className="w-full px-2.5 py-2 bg-white/80 rounded-md border border-outline-variant flex items-center justify-between text-[12px] text-on-surface select-none">
                  <div className="flex items-center gap-2 truncate">
                    <User size={13} className="text-primary shrink-0" />
                    <span className="font-bold truncate">{currentDoctorName}</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/70 bg-surface px-1.5 py-0.5 rounded border border-outline-variant/50 shrink-0 ml-1">
                    {profile?.role === 'admin' ? 'Administrador' : 'Médico'}
                  </span>
                </div>
              </div>
            </div>

            {/* Múltiples Tratamientos del Turno */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={13} className="text-primary" />
                  Tratamientos Realizados en este Turno ({evolutionTreatments.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddTreatmentRow}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/15 rounded-md border border-primary/20 transition-all cursor-pointer shadow-2xs active:scale-95"
                  id="btn-modal-add-treatment-row"
                >
                  <Plus size={13} />
                  Agregar otro tratamiento
                </button>
              </div>

              {/* Filas de tratamientos */}
              <div className="space-y-2.5">
                {evolutionTreatments.map((row, index) => {
                  const rowTrt = treatments.find(t => t.name === row.treatmentName || t.id === row.treatmentId);
                  const hasMaterials = !row.isPackageSession && rowTrt && rowTrt.materials && rowTrt.materials.length > 0;
                  const activePackages = patientPackages.filter(p => p.status === 'active' && (p.remainingSessions || 0) > 0);

                  return (
                    <div 
                      key={row.id} 
                      className="p-3 bg-surface-bright rounded-xl border border-outline-variant hover:border-primary/30 transition-all space-y-2 shadow-2xs relative"
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
                            className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary font-medium"
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
                              <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1 rounded">Cubierto ($0)</span>
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
                                "w-full pl-6 pr-2.5 py-1.5 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:border-primary font-mono font-bold text-on-surface",
                                row.isPackageSession && "bg-surface-dim/40 cursor-not-allowed opacity-75 text-on-surface-variant"
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Paquetes Activos para esta fila */}
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
                            <span>Descontar sesión de paquete</span>
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
                              className="px-2 py-0.5 bg-white border border-secondary/40 rounded text-[11px] outline-none font-medium text-secondary"
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
                          <span>Descontará insumos: {rowTrt.materials.map((m: any) => `${m.qty || 1}x ${m.materialName || 'insumo'}`).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Resumen Total del Turno */}
              <div className="p-2.5 bg-tertiary-container/15 rounded-xl border border-tertiary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                <div className="text-xs text-on-surface">
                  <span className="font-bold">Total a facturar por esta visita:</span>{' '}
                  <span className="text-[11px] text-on-surface-variant">
                    ({evolutionTreatments.length} {evolutionTreatments.length === 1 ? 'tratamiento' : 'tratamientos'})
                  </span>
                </div>
                <div className="text-right flex items-baseline gap-1.5">
                  <span className="text-xs text-on-surface-variant font-medium">Monto Total:</span>
                  <span className="text-base font-extrabold text-emerald-700 font-mono">
                    ${Number(totalEvolutionPrice || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Clinical Evolution Textarea */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                <span>Evolución / Procedimiento y Observaciones Clínicas *</span>
                <span className="text-[9px] text-on-surface-variant font-normal">Requerido para el historial</span>
              </label>
              <textarea
                rows={4}
                required
                className="w-full p-3 bg-white border border-outline-variant rounded-xl text-[12px] leading-relaxed resize-none outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                placeholder="Describa detalladamente el procedimiento médico realizado, hallazgos clínicos, medicación aplicada, evolución de la patología y próximas indicaciones..."
                value={evolutionData.note}
                onChange={(e) => setEvolutionData(prev => ({ ...prev, note: e.target.value }))}
              />
            </div>

            {/* Agendar Próximo Turno / Control (Dentro de la Evolución) */}
            <div className={cn(
              "rounded-xl border transition-all p-3.5 space-y-3",
              scheduleNextApt 
                ? "bg-primary-container/15 border-primary/40 shadow-xs" 
                : "bg-surface border-outline-variant/70 hover:border-outline-variant"
            )}>
              <div className="flex items-center justify-between gap-2">
                <label 
                  htmlFor="schedule-next-apt-toggle"
                  className="flex items-center gap-2.5 cursor-pointer select-none"
                >
                  <input
                    id="schedule-next-apt-toggle"
                    type="checkbox"
                    checked={scheduleNextApt}
                    onChange={(e) => setScheduleNextApt(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant cursor-pointer"
                  />
                  <div className="flex items-center gap-2">
                    <CalendarPlus size={16} className={scheduleNextApt ? "text-primary" : "text-on-surface-variant"} />
                    <span className={cn(
                      "text-xs font-bold uppercase tracking-wider",
                      scheduleNextApt ? "text-primary font-black" : "text-on-surface font-semibold"
                    )}>
                      Agendar Próximo Turno / Control
                    </span>
                  </div>
                </label>

                {scheduleNextApt ? (
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Se creará en agenda al guardar
                  </span>
                ) : (
                  <span className="text-[10px] text-on-surface-variant/70">
                    Opcional
                  </span>
                )}
              </div>

              {scheduleNextApt && (
                <div className="pt-2 border-t border-primary/20 space-y-3">
                  {/* Presets de fecha rápida */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mr-1">
                      Atajos:
                    </span>
                    {[
                      { label: '+7 días (1 semana)', days: 7 },
                      { label: '+14 días (2 semanas)', days: 14 },
                      { label: '+21 días (3 semanas)', days: 21 },
                      { label: '+30 días (1 mes)', days: 30 },
                    ].map((preset) => {
                      const calculated = getDateOffset(preset.days);
                      const isSelected = nextAptData.date === calculated;
                      return (
                        <button
                          key={preset.days}
                          type="button"
                          onClick={() => setNextAptData(prev => ({ ...prev, date: calculated }))}
                          className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer",
                            isSelected
                              ? "bg-primary text-white border-primary shadow-xs"
                              : "bg-white text-on-surface-variant border-outline-variant hover:bg-surface-bright"
                          )}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Fecha */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center gap-1">
                        <Calendar size={11} className="text-primary" />
                        Fecha Próximo Turno *
                      </label>
                      <input
                        type="date"
                        required
                        className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        value={nextAptData.date}
                        onChange={(e) => setNextAptData(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>

                    {/* Hora */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center gap-1">
                        <Clock size={11} className="text-primary" />
                        Hora *
                      </label>
                      <input
                        type="time"
                        required
                        className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        value={nextAptData.time}
                        onChange={(e) => setNextAptData(prev => ({ ...prev, time: e.target.value }))}
                      />
                    </div>

                    {/* Duración */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center gap-1">
                        <Clock size={11} className="text-primary" />
                        Duración
                      </label>
                      <select
                        className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                        value={nextAptData.duration}
                        onChange={(e) => setNextAptData(prev => ({ ...prev, duration: Number(e.target.value) || 30 }))}
                      >
                        <option value={15}>15 minutos</option>
                        <option value={30}>30 minutos</option>
                        <option value={45}>45 minutos</option>
                        <option value={60}>60 minutos (1 h)</option>
                        <option value={90}>90 minutos (1.5 h)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Motivo / Tratamiento */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center gap-1">
                        <Stethoscope size={11} className="text-primary" />
                        Tratamiento / Motivo
                      </label>
                      <input
                        type="text"
                        list="modal-next-treatments-list"
                        placeholder="Ej: Control / Seguimiento o Tratamiento..."
                        className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        value={nextAptData.treatment}
                        onChange={(e) => setNextAptData(prev => ({ ...prev, treatment: e.target.value }))}
                      />
                      <datalist id="modal-next-treatments-list">
                        <option value="Control / Seguimiento" />
                        {treatments.map(t => (
                          <option key={t.id} value={t.name} />
                        ))}
                      </datalist>
                    </div>

                    {/* Notas del Próximo Turno */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase">
                        Indicaciones / Notas para la próxima visita
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Evaluar cicatrización, control de medicación..."
                        className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        value={nextAptData.notes}
                        onChange={(e) => setNextAptData(prev => ({ ...prev, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Past Evolutions of the Patient */}
        {activeTab === 'history' && (
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {pastEvolutions.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant space-y-2">
                <History size={32} className="mx-auto opacity-40 text-on-surface-variant" />
                <p className="text-xs font-semibold">No hay evoluciones clínicas previas registradas para este paciente.</p>
                <p className="text-[11px] opacity-75">Esta será su primera entrada en la historia clínica.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-2.5 bg-surface-bright border border-outline-variant rounded-xl text-xs shadow-2xs">
                  <span className="text-on-surface-variant font-medium">Total histórico acumulado en atenciones:</span>
                  <span className="font-extrabold text-emerald-700 font-mono text-sm">
                    ${pastEvolutionsTotalSpent.toLocaleString()}
                  </span>
                </div>
                {pastEvolutions.map((entry: any) => {
                  const entryTotal = Array.isArray(entry.items) && entry.items.length > 0
                    ? entry.items.reduce((sum: number, it: any) => sum + (it.isPackageSession ? 0 : Number(it.price || it.paidAmount || 0)), 0)
                    : Number(entry.cost ?? entry.paidAmount ?? 0);

                  return (
                    <div 
                      key={entry.id} 
                      className="p-3.5 bg-white border border-outline-variant rounded-xl space-y-2 relative overflow-hidden shadow-2xs"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                      <div className="flex justify-between items-start pl-1 gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                            {entry.date} {entry.doctor ? `• Dr. ${entry.doctor}` : ''}
                          </span>
                          <h5 className="text-[12px] font-black text-on-surface">{entry.treatment}</h5>
                        </div>
                        <div className="text-right shrink-0">
                          {entry.isPackageSession ? (
                            <span className="text-[9px] bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                              Paquete ($0)
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold font-mono text-emerald-700">
                              ${entryTotal.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Multi-treatments breakdown if items array exists */}
                      {Array.isArray(entry.items) && entry.items.length > 0 && (
                        <div className="pl-1 pt-1 border-t border-outline-variant/60 flex flex-wrap gap-1.5">
                          {entry.items.map((it: any, idx: number) => (
                            <span 
                              key={idx} 
                              className="text-[9px] bg-surface-bright border border-outline-variant/80 px-2 py-0.5 rounded font-medium flex items-center gap-1"
                            >
                              <span>{it.treatmentName || it.name}</span>
                              <span className="font-bold text-emerald-700">
                                {it.isPackageSession ? '(Paquete)' : `$${Number(it.price || it.paidAmount || 0).toLocaleString()}`}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-[11px] text-on-surface-variant/90 pl-1 leading-relaxed whitespace-pre-wrap">
                        {entry.note}
                      </p>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-outline-variant flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 border border-outline-variant text-[11px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-wider text-on-surface-variant cursor-pointer"
          >
            Cerrar (Mantener En Sesión)
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving || !evolutionData.treatment || !evolutionData.note.trim()}
              onClick={handleSaveClinicalHistory}
              className="w-full sm:w-auto px-5 py-2.5 bg-secondary text-white text-[11px] font-black rounded-lg shadow-sm uppercase hover:bg-secondary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isSaving ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Save size={14} />
                  <span>Guardar Historia Clínica y Finalizar Turno</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
