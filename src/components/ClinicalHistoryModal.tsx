import React, { useState, useEffect } from 'react';
import { 
  FileText, Stethoscope, Save, Calendar, DollarSign, 
  Sparkles, CheckCircle2, Clock, History, AlertCircle, Package,
  User, Phone, ChevronRight, CalendarPlus
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

    setEvolutionData({
      treatment: appointment.type || appointment.treatment || matchedTreatment?.name || '',
      treatmentId: appointment.treatmentId || matchedTreatment?.id || '',
      date: appointment.date || new Date().toISOString().split('T')[0],
      paidAmount: historicalPrice,
      isPackageSession: isPkg,
      patientPackageId: appointment.patientPackageId || '',
      packageName: appointment.packageName || '',
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

  const selectedTreatmentObj = treatments.find(
    t => t.name === evolutionData.treatment || t.id === evolutionData.treatmentId
  );

  const handleSaveClinicalHistory = async () => {
    if (!appointment || !patient) return;
    if (!evolutionData.treatment.trim()) {
      showToast('Por favor selecciona o indica el tratamiento realizado', 'warning');
      return;
    }
    if (!evolutionData.note.trim()) {
      showToast('Por favor describe la evolución o notas clínicas de la sesión', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const isPkgSession = Boolean(evolutionData.isPackageSession && evolutionData.patientPackageId);

      // If package session, deduct from package atomically
      if (isPkgSession && evolutionData.patientPackageId) {
        await consumePackageSession(
          db,
          evolutionData.patientPackageId,
          evolutionData.treatment,
          ownerId,
          patient.name
        );
      }

      const batch = writeBatch(db);
      const evolutionPath = `patients/${patient.id}/evolutions`;
      const newEvolutionRef = doc(collection(db, evolutionPath));
      const globalEvolutionRef = doc(db, 'evolutions', newEvolutionRef.id);

      const attentionDate = evolutionData.date || new Date().toISOString().split('T')[0];
      const paidValue = isPkgSession ? 0 : (
        (typeof evolutionData.paidAmount === 'number' && !isNaN(evolutionData.paidAmount))
          ? Number(evolutionData.paidAmount)
          : (selectedTreatmentObj?.cost || 0)
      );

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
        treatment: evolutionData.treatment,
        treatmentId: selectedTreatmentObj?.id || evolutionData.treatmentId || '',
        cost: paidValue,
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

      // Corroborate database: Save both in patient subcollection AND global collection
      batch.set(newEvolutionRef, evolutionPayload);
      batch.set(globalEvolutionRef, evolutionPayload);

      // Deduct materials from stock if treatment has materials linked (only for non-package; package sessions are handled atomically above)
      if (!isPkgSession && selectedTreatmentObj?.materials && selectedTreatmentObj.materials.length > 0) {
        for (const item of selectedTreatmentObj.materials) {
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
            reason: `Consumido en evolución: ${evolutionData.treatment} para ${patient.name}`,
            date: serverTimestamp(),
            userId: ownerId
          });
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
        cost: paidValue,
        price: paidValue,
        paidAmount: paidValue,
        isPackageSession: isPkgSession,
        packageDiscounted: isPkgSession ? true : false,
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
            {/* Package coverage prompt if patient has packages */}
            {patientPackages.length > 0 && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles size={13} className="text-amber-600" />
                    ¿Cubrir con sesión de Paquete Adquirido?
                  </label>
                  {evolutionData.isPackageSession && (
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                      Costo $0 (Abonado previamente)
                    </span>
                  )}
                </div>

                <select
                  className="w-full px-2.5 py-1.5 bg-white border border-amber-400 rounded-md text-[12px] font-bold text-on-surface outline-none focus:ring-1 focus:ring-amber-500"
                  value={
                    evolutionData.isPackageSession
                      ? `${evolutionData.patientPackageId}:::${evolutionData.treatment}`
                      : 'none'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'none') {
                      const curTreatment = treatments.find(t => t.name === evolutionData.treatment);
                      setEvolutionData(prev => ({
                        ...prev,
                        isPackageSession: false,
                        patientPackageId: '',
                        packageName: '',
                        paidAmount: curTreatment?.cost || 0
                      }));
                    } else {
                      const [pkgId, treatName] = val.split(':::');
                      const foundPkg = patientPackages.find(p => p.id === pkgId);
                      const curTreatment = treatments.find(t => t.name === treatName);
                      setEvolutionData(prev => ({
                        ...prev,
                        isPackageSession: true,
                        patientPackageId: pkgId,
                        packageName: foundPkg?.packageName || 'Paquete',
                        treatment: treatName,
                        treatmentId: curTreatment?.id || '',
                        paidAmount: 0
                      }));
                    }
                  }}
                >
                  <option value="none">No usar paquete (cobro individual / habitual)</option>
                  {patientPackages.flatMap(pkg => 
                    (pkg.items || [])
                      .filter(item => item.remainingQuantity > 0)
                      .map((item, idx) => (
                        <option key={`${pkg.id}-${idx}`} value={`${pkg.id}:::${item.treatmentName}`}>
                          🎁 [{pkg.packageName}] {item.treatmentName} ({item.remainingQuantity} restantes) — $0
                        </option>
                      ))
                  )}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Treatment Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Stethoscope size={11} className="text-primary" />
                    Tratamiento Realizado
                  </span>
                  {evolutionData.isPackageSession && (
                    <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Sesión de Paquete
                    </span>
                  )}
                </label>
                <select
                  className="w-full px-2.5 py-2 bg-white border border-outline-variant rounded-md text-[12px] font-medium text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={evolutionData.treatment}
                  onChange={(e) => {
                    const selected = treatments.find(t => t.name === e.target.value);
                    setEvolutionData(prev => ({
                      ...prev,
                      treatment: e.target.value,
                      treatmentId: selected?.id || '',
                      paidAmount: prev.isPackageSession ? 0 : (selected?.cost !== undefined ? selected.cost : prev.paidAmount)
                    }));
                  }}
                >
                  <option value="">-- Seleccionar Tratamiento --</option>
                  {treatments.map(t => (
                    <option key={t.id} value={t.name}>
                      {t.name} {t.duration ? `• ${t.duration} min` : ''}
                    </option>
                  ))}
                  {evolutionData.treatment && !treatments.some(t => t.name === evolutionData.treatment) && (
                    <option value={evolutionData.treatment}>
                      {evolutionData.treatment} (del turno)
                    </option>
                  )}
                </select>
              </div>

              {/* Attention Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} className="text-primary" />
                    Fecha de Atención
                  </span>
                </label>
                <input
                  type="date"
                  className="w-full px-2.5 py-2 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  value={evolutionData.date}
                  onChange={(e) => setEvolutionData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Cost / Paid Amount */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <DollarSign size={11} className="text-emerald-600" />
                    Monto Cobrado / Abonado ($)
                  </span>
                  {evolutionData.isPackageSession && (
                    <span className="text-[9px] text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                      Pre-abonado ($0)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold text-[12px]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={evolutionData.isPackageSession}
                    placeholder="0"
                    className={cn(
                      "w-full pl-6 pr-3 py-1.5 bg-white border border-outline-variant rounded-md text-[13px] font-bold outline-none focus:border-primary focus:ring-1 focus:ring-primary",
                      evolutionData.isPackageSession 
                        ? "bg-emerald-50/50 text-emerald-700 cursor-not-allowed border-emerald-300"
                        : "text-emerald-800"
                    )}
                    value={evolutionData.paidAmount}
                    onChange={(e) => setEvolutionData(prev => ({ ...prev, paidAmount: Number(e.target.value) || 0 }))}
                  />
                </div>
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
                <div className="w-full px-2.5 py-1.5 bg-white/80 rounded-md border border-outline-variant flex items-center justify-between text-[12px] text-on-surface select-none">
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

            {/* Materials Preview if Treatment uses stock materials */}
            {selectedTreatmentObj?.materials && selectedTreatmentObj.materials.length > 0 && !evolutionData.isPackageSession && (
              <div className="p-2.5 bg-surface-bright rounded-lg border border-outline-variant flex items-center gap-2 text-xs text-on-surface-variant">
                <Package size={13} className="text-primary shrink-0" />
                <span>
                  <strong>Insumos que se descontarán del stock:</strong>{' '}
                  {selectedTreatmentObj.materials.map((m: any, idx: number) => (
                    <span key={idx} className="inline-block bg-surface px-1.5 py-0.5 rounded border border-outline-variant text-[11px] font-semibold text-on-surface mr-1">
                      {m.qty || m.quantity || 1}x {m.materialName || m.name || 'Insumo'}
                    </span>
                  ))}
                </span>
              </div>
            )}

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
              pastEvolutions.map((entry) => (
                <div 
                  key={entry.id} 
                  className="p-3.5 bg-white border border-outline-variant rounded-xl space-y-1.5 relative overflow-hidden shadow-2xs"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  <div className="flex justify-between items-start pl-1">
                    <div>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                        {entry.date} {entry.doctor ? `• Dr. ${entry.doctor}` : ''}
                      </span>
                      <h5 className="text-[12px] font-black text-on-surface">{entry.treatment}</h5>
                    </div>
                    <div className="text-right">
                      {entry.isPackageSession ? (
                        <span className="text-[9px] bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                          Paquete ($0)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700">
                          ${Number(entry.cost ?? entry.paidAmount ?? 0).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant/90 pl-1 leading-relaxed whitespace-pre-wrap">
                    {entry.note}
                  </p>
                </div>
              ))
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
