import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Plus, Filter, Download, MoreHorizontal, User, Phone, Mail, Calendar, Trash2, Edit2, FileText, CheckCircle2, AlertTriangle, Save, TrendingUp, Stethoscope, CalendarClock, DollarSign, Clock, Link2, Package, Layers, Sparkles } from 'lucide-react';
import { cn, calculateAge } from '../lib/utils';
import { motion } from 'motion/react';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where, writeBatch, increment, getDocs } from 'firebase/firestore';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { PatientPackagesView } from '../components/PatientPackagesView';
import { consumePackageSession } from '../lib/packageUtils';
import { PatientPackage } from '../types';

export function Patients() {
  const { showToast } = useToast();
  const { ownerId, user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | 'delete' | 'history' | 'add-entry' | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [patientDetailTab, setPatientDetailTab] = useState<'evolutions' | 'packages'>('evolutions');
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
    totalSpent: 0
  });

  // Doctor is strictly the logged-in user
  const currentDoctorName = (profile?.name && profile.name.trim())
    ? profile.name.trim()
    : (user?.displayName && user.displayName.trim())
      ? user.displayName.trim()
      : (user?.email ? `Dr. ${user.email.split('@')[0]}` : 'Dr. Profesional');

  // Form states
  const [formData, setFormData] = useState({
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

  useEffect(() => {
    if (!ownerId) return;

    const q = query(
      collection(db, 'patients'), 
      where('userId', '==', ownerId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(docs.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
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
        handleOpenModal(action === 'add-entry' ? 'add-entry' : 'history', patient, appointmentId || undefined);
      }
    }
  }, [searchParams, patients]);

  useEffect(() => {
    if (selectedPatient && activeModal === 'history' && ownerId) {
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

        const finished: any[] = apps.filter((a: any) => a.status === 'finished');
        const attendedCount = finished.length;
        const total = apps.filter((a: any) => a.status !== 'pendiente').length;
        const absences = apps.filter((a: any) => a.status === 'cancelado' || a.status === 'ausente').length;
        
        // Calculate Total Spent based on actual historical prices paid at the time,
        // excluding sessions covered by a package (since package price was paid upon package purchase)
        const appointmentsSpent = finished.reduce((acc: number, app: any) => {
          if (app.isPackageSession) return acc;
          const historicalCost = (typeof app.paidAmount === 'number' && !isNaN(app.paidAmount))
            ? app.paidAmount
            : (typeof app.cost === 'number' && !isNaN(app.cost))
              ? app.cost
              : (typeof app.price === 'number' && !isNaN(app.price))
                ? app.price
                : (treatments.find(t => t.name === app.type)?.cost || 0);
          return acc + historicalCost;
        }, 0);

        // Find last visit (finished)
        const sortedFinished = [...finished].sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
        const lastVisitDate = sortedFinished.length > 0 ? sortedFinished[0].date : '-';

        // Find next visit (pendiente or confirmado)
        const todayStr = new Date().toISOString().split('T')[0];
        const nextApts = apps.filter((a: any) => (a.status === 'pendiente' || a.status === 'confirmado') && a.date >= todayStr);
        const sortedNext = [...nextApts].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
        const nextVisitDate = sortedNext.length > 0 ? sortedNext[0].date : '-';

        setPatientStats({
          attendance: (attendedCount + absences) > 0 ? Math.round((attendedCount / (attendedCount + absences)) * 100) : 0,
          absences: absences,
          lastVisit: lastVisitDate,
          nextApt: nextVisitDate,
          totalSpent: appointmentsSpent
        });

        // If target appointment was passed via URL or state, or if there is an appointment today, link it
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
        where('patientId', '==', selectedPatient.id)
      );
      const unsubscribePackages = onSnapshot(pkgQ, (snapshot) => {
        const pDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PatientPackage));
        setPatientPackages(pDocs);
      });

      return () => {
        unsubscribeEvolutions();
        unsubscribeApps();
        unsubscribePackages();
      };
    }
  }, [selectedPatient, activeModal, treatments, targetAppointmentId, ownerId]);

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

  const handleOpenModal = (type: 'create' | 'edit' | 'delete' | 'history' | 'add-entry', patient?: any, initialAppointmentId?: string) => {
    setSelectedPatient(patient || null);
    if (initialAppointmentId) {
      setTargetAppointmentId(initialAppointmentId);
    }
    if (patient) {
      setFormData({
        name: patient.name,
        idNumber: patient.idNumber,
        phone: patient.phone || '',
        email: patient.email || '',
        gender: patient.gender || 'Male',
        birthDate: patient.birthDate || '',
        status: patient.status || 'active'
      });
    } else {
      setFormData({
        name: '',
        idNumber: '',
        phone: '',
        email: '',
        gender: 'Male',
        birthDate: '',
        status: 'active'
      });
    }
    setActiveModal(type === 'add-entry' ? 'history' : type);
    if (type === 'add-entry') {
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
    }
    if (type === 'history') {
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
    }
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
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
      if (isPkgSession && evolutionData.patientPackageId) {
        await consumePackageSession(db, evolutionData.patientPackageId, evolutionData.treatment);
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

      // Deduct materials if treatment has materials linked
      if (treatment && treatment.materials && treatment.materials.length > 0) {
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

      await batch.commit();

      setIsAddingEntry(false);
      setTargetAppointmentId(null);
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
      showToast(isPkgSession ? 'Evolución guardada y sesión descontada del paquete ($0 adicional)' : 'Evolución clínica guardada exitosamente en la base de datos');
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

  const filteredPatients = patients.filter(p => {
    const nameMatch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const idMatch = p.idNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const phoneMatch = p.phone?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    return nameMatch || idMatch || phoneMatch;
  });

  const currentPatient = patients.find(p => p.id === selectedPatient?.id) || selectedPatient;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Gestión de Pacientes</h1>
          <p className="body-md text-on-surface-variant">Listado completo de pacientes registrados y sus historias clínicas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 bg-white border border-outline-variant rounded-md text-[11px] font-bold flex items-center gap-2 hover:bg-surface transition-all text-on-surface-variant">
            <Download size={14} />
            EXPORTAR
          </button>
          <button 
            onClick={() => handleOpenModal('create')}
            className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
          >
            <Plus size={16} />
            NUEVO PACIENTE
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
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

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-bright border-b border-outline-variant">
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Identificación</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Última Visita</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface">
              {filteredPatients.map((patient) => (
                <motion.tr 
                  key={patient.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-surface/50 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-primary text-[12px] font-bold shrink-0">
                        {patient.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-on-surface truncate">{patient.name}</p>
                        <p className="text-[11px] text-on-surface-variant">{patient.gender}, {calculateAge(patient.birthDate)} años</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-[12px] text-on-surface font-mono">{patient.idNumber}</td>
                  <td className="px-6 py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <Phone size={12} className="text-primary/60 shrink-0" />
                        <span className="text-[11px] font-medium">{patient.phone}</span>
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
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleOpenModal('history', patient); }}
                        className="p-1.5 hover:bg-primary-container text-primary rounded transition-all" 
                        title="Historia Clínica"
                      >
                        <FileText size={14} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleOpenModal('edit', patient); }}
                        className="p-1.5 hover:bg-surface-container-highest text-on-surface-variant rounded transition-all" 
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleOpenModal('delete', patient); }}
                        className="p-1.5 hover:bg-error-container text-error rounded transition-all" 
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
      </div>

      {/* Modals */}
      <Modal
        isOpen={activeModal === 'create' || activeModal === 'edit'}
        onClose={() => setActiveModal(null)}
        title={activeModal === 'create' ? 'Registrar Nuevo Paciente' : 'Editar Paciente'}
        className="max-w-xl"
      >
        <form className="space-y-4" onSubmit={handleSavePatient}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre Completo</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="Ej: Juan Pérez" 
              />
            </div>
            <div className="space-y-2">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Teléfono</label>
              <input 
                type="tel" 
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="+1 234 567 890" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Email</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="juan@example.com" 
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha de Nacimiento</label>
              <input 
                type="date" 
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
            <div className="space-y-2">
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

      <Modal
        isOpen={activeModal === 'history'}
        onClose={() => setActiveModal(null)}
        title={`Detalles del Paciente: ${currentPatient?.name}`}
        className="max-w-2xl"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-surface-bright rounded-xl border border-outline-variant">
            <div className="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center text-lg font-bold">
              {currentPatient?.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-on-surface">{currentPatient?.name}</h4>
              <p className="text-[11px] text-on-surface-variant tracking-wide uppercase font-bold">{currentPatient?.idNumber} • {currentPatient?.gender} • {calculateAge(currentPatient?.birthDate)} años</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                currentPatient?.status === 'active' ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-dim text-on-surface-variant"
              )}>
                {currentPatient?.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
              </span>
            </div>
          </div>

          {/* Attendance & Financial KPIs */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
              <CheckCircle2 size={16} className="text-tertiary mb-1" />
              <span className="text-[18px] font-bold text-on-surface">{patientStats.attendance}%</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Asistencia</span>
            </div>
            <div className="p-3 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
              <AlertTriangle size={16} className="text-error mb-1" />
              <span className="text-[18px] font-bold text-on-surface">{patientStats.absences}</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Faltas</span>
            </div>
            <div className="p-3 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
              <Plus size={16} className="text-primary mb-1" />
              <span className="text-[13px] font-bold text-on-surface truncate w-full text-center">{patientStats.nextApt}</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Próximo Turno</span>
            </div>
            <div className="p-3 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
              <TrendingUp size={16} className="text-secondary mb-1" />
              <span className="text-[13px] font-bold text-on-surface">${patientStats.totalSpent.toLocaleString()}</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Total Invertido</span>
            </div>
          </div>

          {/* Sub-tabs: Evoluciones vs Paquetes */}
          <div className="flex items-center gap-2 border-b border-outline-variant">
            <button
              type="button"
              onClick={() => setPatientDetailTab('evolutions')}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px",
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
              onClick={() => setPatientDetailTab('packages')}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-px",
                patientDetailTab === 'packages'
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              )}
            >
              <Package size={14} />
              Paquetes Adquiridos ({patientPackages.length})
            </button>
          </div>

          {patientDetailTab === 'packages' ? (
            <PatientPackagesView 
              patient={currentPatient || selectedPatient} 
              ownerId={ownerId} 
            />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h5 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Evoluciones y Tratamientos</h5>
                <button 
                  onClick={() => setIsAddingEntry(!isAddingEntry)}
                  className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider flex items-center gap-1"
                >
                  {isAddingEntry ? 'Cerrar Formulario' : <><Plus size={12} /> Añadir Entrada</>}
                </button>
              </div>

              {isAddingEntry && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="p-4 bg-primary-container/20 rounded-xl border border-primary/20 space-y-3"
                >
                  {/* Selector de Turno / Atención */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CalendarClock size={12} className="text-primary" />
                        Turno / Cita de Atención
                      </span>
                      {evolutionData.appointmentId ? (
                        <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                          <Link2 size={10} />
                          Turno Vinculado
                        </span>
                      ) : (
                        <span className="text-[9px] text-on-surface-variant font-medium">
                          Atención directa / Manual
                        </span>
                      )}
                    </label>
                    <select
                      id="evolution-appointment-select"
                      className="w-full px-2.5 py-2 bg-white border border-outline-variant rounded-md text-[12px] font-medium text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      value={evolutionData.appointmentId}
                      onChange={(e) => handleSelectAppointmentForEvolution(e.target.value)}
                    >
                      {patientAppointments.length > 0 ? (
                        <>
                          <option value="">-- Seleccionar Turno del Paciente --</option>
                          {patientAppointments.map(apt => {
                            const isPkg = Boolean(apt.isPackageSession);
                            const aptCost = isPkg ? 0 : (
                              typeof apt.cost === 'number' && !isNaN(apt.cost)
                                ? apt.cost
                                : (typeof apt.price === 'number' && !isNaN(apt.price))
                                  ? apt.price
                                  : (treatments.find(t => t.name === apt.type)?.cost || 0)
                            );
                            return (
                              <option key={apt.id} value={apt.id}>
                                {apt.date} {apt.time ? `(${apt.time} hs)` : ''} • {apt.type || apt.treatment || 'Consulta'} • {isPkg ? 'Paquete ($0)' : `$${aptCost.toLocaleString()}`} • [{apt.status || 'pendiente'}]
                              </option>
                            );
                          })}
                          <option value="manual">-- Registrar atención directa (sin turno) --</option>
                        </>
                      ) : (
                        <option value="manual">-- Sin turnos previos (atención directa en consultorio) --</option>
                      )}
                    </select>
                  </div>

                  {/* Cobertura de Paquete: Si el paciente tiene paquetes activos con sesiones disponibles */}
                  {patientPackages.some(p => p.status === 'active' && p.remainingSessions > 0) && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
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
                            setEvolutionData({
                              ...evolutionData,
                              isPackageSession: false,
                              patientPackageId: '',
                              packageName: '',
                              paidAmount: curTreatment?.cost || 0
                            });
                          } else {
                            const [pkgId, treatName] = val.split(':::');
                            const foundPkg = patientPackages.find(p => p.id === pkgId);
                            const curTreatment = treatments.find(t => t.name === treatName);
                            setEvolutionData({
                              ...evolutionData,
                              isPackageSession: true,
                              patientPackageId: pkgId,
                              packageName: foundPkg?.packageName || 'Paquete',
                              treatment: treatName,
                              treatmentId: curTreatment?.id || '',
                              paidAmount: 0
                            });
                          }
                        }}
                      >
                        <option value="none">No usar paquete (cobro individual habitual)</option>
                        {patientPackages
                          .filter(p => p.status === 'active' && p.remainingSessions > 0)
                          .flatMap(pkg => 
                            (pkg.items || [])
                              .filter(item => item.remainingQuantity > 0)
                              .map((item, idx) => (
                                <option key={`${pkg.id}-${idx}`} value={`${pkg.id}:::${item.treatmentName}`}>
                                  🎁 [{pkg.packageName}] {item.treatmentName} ({item.remainingQuantity} restantes) — $0
                                </option>
                              ))
                          )}
                      </select>
                      <p className="text-[10px] text-amber-800 leading-tight">
                        Al seleccionar un tratamiento de paquete, se descontará 1 sesión de la cantidad adquirida y el valor a abonar será $0.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                        id="evolution-treatment-select"
                        className="w-full px-2.5 py-2 bg-white border border-outline-variant rounded-md text-[12px] font-medium text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        value={evolutionData.treatment}
                        onChange={(e) => {
                          const t = treatments.find(item => item.name === e.target.value);
                          setEvolutionData({ 
                            ...evolutionData, 
                            treatment: e.target.value,
                            treatmentId: t?.id || '',
                            // If package session is active, keep paidAmount as 0
                            paidAmount: evolutionData.isPackageSession 
                              ? 0 
                              : (!evolutionData.appointmentId && t?.cost !== undefined ? t.cost : evolutionData.paidAmount)
                          });
                        }}
                      >
                        <option value="">-- Seleccionar Tratamiento --</option>
                        {treatments.map(t => (
                          <option key={t.id} value={t.name}>
                            {t.name} {t.duration ? `• ${t.duration} min` : ''}
                          </option>
                        ))}
                        {/* Preserve custom treatment name from appointment if not in catalog */}
                        {evolutionData.treatment && !treatments.some(t => t.name === evolutionData.treatment) && (
                          <option value={evolutionData.treatment}>
                            {evolutionData.treatment} (del turno)
                          </option>
                        )}
                      </select>
                      {treatments.length === 0 && (
                        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-900 flex items-center justify-between mt-1">
                          <span>No tienes tratamientos registrados.</span>
                          <Link to="/treatments" className="font-bold text-primary underline ml-1">
                            Ir a Tratamientos
                          </Link>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} className="text-primary" />
                          Fecha de Atención
                        </span>
                        {evolutionData.appointmentId && (
                          <span className="text-[9px] text-primary font-semibold">Fecha del turno</span>
                        )}
                      </label>
                      <input 
                        type="date" 
                        className="w-full px-2.5 py-2 bg-white border border-outline-variant rounded-md text-[12px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        value={evolutionData.date}
                        onChange={(e) => setEvolutionData({ ...evolutionData, date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <DollarSign size={11} className="text-emerald-600" />
                          Valor pagado en su momento ($)
                        </span>
                        {evolutionData.isPackageSession ? (
                          <span className="text-[9px] text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                            Pre-abonado ($0)
                          </span>
                        ) : (
                          <span className="text-[9px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Histórico
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
                          onChange={(e) => setEvolutionData({ ...evolutionData, paidAmount: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <p className="text-[9px] text-on-surface-variant leading-tight">
                        {evolutionData.isPackageSession 
                          ? "Cubierto por paquete de tratamientos. No sumará ingresos adicionales ya que fue abonado en la compra del paquete."
                          : "Valor abonado en la fecha del turno. No se modifica si cambia el precio actual del catálogo."}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase flex items-center justify-between">
                        <span>Doctor / Profesional a Cargo</span>
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

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase">Evolución / Notas Clínicas</label>
                    <textarea 
                      rows={3} 
                      className="w-full px-2.5 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] resize-none outline-none focus:border-primary focus:ring-1 focus:ring-primary" 
                      placeholder="Describa el procedimiento realizado, hallazgos clínicos y observaciones del paciente..." 
                      value={evolutionData.note}
                      onChange={(e) => setEvolutionData({ ...evolutionData, note: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button 
                      onClick={() => setIsAddingEntry(false)}
                      className="px-3 py-1.5 text-[11px] font-bold text-on-surface-variant uppercase hover:bg-surface rounded transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleAddEvolution}
                      disabled={!evolutionData.treatment || !evolutionData.note.trim()}
                      className="px-4 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg shadow-sm uppercase hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                    >
                      <Save size={13} />
                      Guardar Evolución
                    </button>
                  </div>
                </motion.div>
              )}
            
            <div className="space-y-3">
              {evolutions.map((entry) => {
                const paidValue = Number(entry.cost ?? entry.paidAmount ?? 0);
                return (
                  <div key={entry.id} className="p-3.5 bg-white border border-outline-variant rounded-xl space-y-2 relative overflow-hidden group hover:border-primary/50 transition-all shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
                    <div className="flex justify-between items-start pl-1">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
                            <Calendar size={10} />
                            {entry.date}
                          </span>
                          {paidValue > 0 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-0.5" title="Valor pagado en su momento">
                              <DollarSign size={10} />
                              Abonado: ${paidValue.toLocaleString()}
                            </span>
                          )}
                          {entry.isPackageSession && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 flex items-center gap-1" title="Sesión cubierta por paquete previamente abonado">
                              <Package size={10} />
                              Paquete {entry.packageName ? `(${entry.packageName})` : ''} • $0
                            </span>
                          )}
                          {entry.appointmentId && (
                            <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 flex items-center gap-1">
                              <Link2 size={9} />
                              Turno Vinculado
                            </span>
                          )}
                        </div>
                        <h6 className="text-[13px] font-bold text-on-surface mt-1 flex items-center gap-1.5">
                          <Stethoscope size={13} className="text-primary/70 shrink-0" />
                          {entry.treatment}
                        </h6>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold bg-surface px-2 py-0.5 rounded text-on-surface-variant uppercase border border-outline-variant/30">
                          {entry.status || 'Completado'}
                        </span>
                        <button
                          onClick={() => handleDeleteEvolution(entry.id)}
                          className="p-1 text-on-surface-variant/40 hover:text-error hover:bg-error/10 rounded transition-colors"
                          title="Eliminar evolución"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[12px] text-on-surface leading-relaxed pl-1 whitespace-pre-wrap">{entry.note}</p>
                    <div className="flex items-center justify-between pt-1.5 border-t border-surface pl-1">
                      <div className="flex items-center gap-1.5 text-on-surface-variant">
                        <User size={11} className="text-primary" />
                        <p className="text-[10px] font-semibold">{entry.doctor}</p>
                      </div>
                      {entry.doctorEmail && (
                        <span className="text-[9px] text-on-surface-variant/60">{entry.doctorEmail}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {evolutions.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-outline-variant rounded-xl opacity-60">
                  <FileText size={24} className="mx-auto mb-2 text-on-surface-variant" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Sin evoluciones registradas</p>
                  <p className="text-[10px] text-on-surface-variant/70 mt-1">Haz clic en &quot;Añadir Entrada&quot; para registrar la primera evolución clínica del paciente.</p>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="pt-4">
            <button onClick={() => setActiveModal(null)} className="w-full px-4 py-2 border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-surface transition-colors uppercase tracking-widest">Cerrar Historial</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
