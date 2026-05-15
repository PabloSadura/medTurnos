import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Filter, Download, MoreHorizontal, User, Phone, Mail, Calendar, Trash2, Edit2, FileText, CheckCircle2, AlertTriangle, Save, TrendingUp } from 'lucide-react';
import { cn, calculateAge } from '../lib/utils';
import { motion } from 'motion/react';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where, writeBatch, increment, getDocs } from 'firebase/firestore';
import { useToast } from '../components/Toast';

export function Patients() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | 'delete' | 'history' | 'add-entry' | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [patientStats, setPatientStats] = useState({
    attendance: 0,
    absences: 0,
    lastVisit: '-',
    nextApt: '-',
    totalSpent: 0
  });

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
    treatment: 'Check-up',
    doctor: 'Dr. Smith',
    note: ''
  });

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const q = query(
      collection(db, 'patients'), 
      where('userId', '==', userId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(docs.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    const treatmentsQ = query(collection(db, 'treatments'), where('userId', '==', userId));

    const unsubscribeTreatments = onSnapshot(treatmentsQ, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTreatments(docs.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treatments'));

    return () => {
      unsubscribe();
      unsubscribeTreatments();
    };
  }, [auth.currentUser?.uid]);

  // Handle URL param selection
  useEffect(() => {
    const patientId = searchParams.get('id');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        handleOpenModal('history', patient);
      }
    }
  }, [searchParams, patients]);

  useEffect(() => {
    if (selectedPatient && activeModal === 'history') {
      const userId = auth.currentUser?.uid;
      // Fetch evolutions
      const q = query(
        collection(db, `patients/${selectedPatient.id}/evolutions`), 
        where('userId', '==', userId)
      );
      const unsubscribeEvolutions = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEvolutions(docs.sort((a: any, b: any) => b.date.localeCompare(a.date)));
      }, (error) => handleFirestoreError(error, OperationType.LIST, `patients/${selectedPatient.id}/evolutions`));

      // Fetch appointments to calculate KPIs (only current user's)
      const appQ = query(
        collection(db, 'appointments'), 
        where('patientId', '==', selectedPatient.id),
        where('userId', '==', userId)
      );
      const unsubscribeApps = onSnapshot(appQ, (snapshot) => {
        const apps = snapshot.docs.map(doc => doc.data());
        const finished = apps.filter(a => a.status === 'finished');
        const attendedCount = finished.length;
        const total = apps.filter(a => a.status !== 'pendiente').length; // total that should have happened
        const absences = apps.filter(a => a.status === 'cancelado' || a.status === 'ausente').length;
        
        // Calculate Total Spent based on treatment prices
        // Since appointments don't store price directly yet, we'll try to find the treatment price
        // or we can use a default if not found. 
        // For now, let's assume treatments list is available.
        const spent = finished.reduce((acc, app) => {
          const treatment = treatments.find(t => t.name === app.type);
          return acc + (treatment?.cost || 0);
        }, 0);

        // Find last visit (finished)
        const sortedFinished = [...finished].sort((a, b) => b.date.localeCompare(a.date));
        const lastVisitDate = sortedFinished.length > 0 ? sortedFinished[0].date : '-';

        // Find next visit (pendiente or confirmado)
        const todayStr = new Date().toISOString().split('T')[0];
        const nextApts = apps.filter(a => (a.status === 'pendiente' || a.status === 'confirmado') && a.date >= todayStr);
        const sortedNext = [...nextApts].sort((a, b) => a.date.localeCompare(b.date));
        const nextVisitDate = sortedNext.length > 0 ? sortedNext[0].date : '-';

        setPatientStats({
          attendance: (attendedCount + absences) > 0 ? Math.round((attendedCount / (attendedCount + absences)) * 100) : 0,
          absences: absences,
          lastVisit: lastVisitDate,
          nextApt: nextVisitDate,
          totalSpent: spent
        });
      });

      return () => {
        unsubscribeEvolutions();
        unsubscribeApps();
      };
    }
  }, [selectedPatient, activeModal, treatments]);

  const handleOpenModal = (type: 'create' | 'edit' | 'delete' | 'history' | 'add-entry', patient?: any) => {
    setSelectedPatient(patient || null);
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
    if (type === 'add-entry') setIsAddingEntry(true);
    if (type === 'history') setIsAddingEntry(false);
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
          userId: auth.currentUser?.uid,
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
    if (!selectedPatient || !evolutionData.note) return;
    try {
      const batch = writeBatch(db);
      const evolutionPath = `patients/${selectedPatient.id}/evolutions`;
      
      const newEvolutionRef = doc(collection(db, evolutionPath));
      batch.set(newEvolutionRef, {
        ...evolutionData,
        patientId: selectedPatient.id,
        userId: auth.currentUser?.uid,
        date: new Date().toISOString().split('T')[0],
        status: 'Completed',
        createdAt: serverTimestamp()
      });

      // Deduct materials if treatment is selected
      const treatment = treatments.find(t => t.name === evolutionData.treatment);
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
            reason: `Consumido en evolución: ${evolutionData.treatment} para ${currentPatient.name}`,
            date: serverTimestamp(),
            userId: auth.currentUser?.uid
          });
        }
      }
      
      // Update patient's last visit
      const patientRef = doc(db, 'patients', selectedPatient.id);
      batch.set(patientRef, {
        lastVisit: new Date().toISOString().split('T')[0],
        updatedAt: serverTimestamp(),
        userId: auth.currentUser?.uid // Ensure it has a userId if it's created newly
      }, { merge: true });

      // Optional: If there's an appointment today for this patient with this treatment, mark it as finished
      // This helps avoid double deduction if they also manually mark it in Agenda later (since it won't be a transition from non-finished to finished)
      const todayStr = new Date().toISOString().split('T')[0];
      const appQ = query(
        collection(db, 'appointments'),
        where('patientId', '==', selectedPatient.id),
        where('date', '==', todayStr),
        where('status', '!=', 'finished'),
        where('userId', '==', auth.currentUser?.uid)
      );
      const snapshot = await getDocs(appQ);
      snapshot.forEach(appDoc => {
        batch.update(appDoc.ref, {
          status: 'finished',
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();

      setIsAddingEntry(false);
      setEvolutionData({ ...evolutionData, note: '' });
      showToast('Entrada de historial añadida correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `patients/${selectedPatient.id}/evolutions`);
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

          {/* Attendance KPIs */}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase">Tratamiento</label>
                    <select 
                      className="w-full px-2 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] outline-none"
                      value={evolutionData.treatment}
                      onChange={(e) => setEvolutionData({ ...evolutionData, treatment: e.target.value })}
                    >
                      <option value="">Seleccione...</option>
                      {treatments.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                      <option value="Check-up">Check-up</option>
                      <option value="Limpieza">Limpieza</option>
                      <option value="Consulta General">Consulta General</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase">Doctor</label>
                    <input 
                      type="text" 
                      className="w-full px-2 py-1.5 bg-white border border-outline-variant rounded-md text-[12px]" 
                      value={evolutionData.doctor}
                      onChange={(e) => setEvolutionData({ ...evolutionData, doctor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase">Evolución / Notas</label>
                  <textarea 
                    rows={3} 
                    className="w-full px-2 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] resize-none" 
                    placeholder="Describa el procedimiento..." 
                    value={evolutionData.note}
                    onChange={(e) => setEvolutionData({ ...evolutionData, note: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => setIsAddingEntry(false)}
                    className="px-3 py-1 text-[11px] font-bold text-on-surface-variant uppercase"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleAddEvolution}
                    className="px-3 py-1 bg-primary text-white text-[11px] font-bold rounded shadow-sm uppercase"
                  >
                    Guardar Entrada
                  </button>
                </div>
              </motion.div>
            )}
            
            <div className="space-y-3">
              {evolutions.map((entry) => (
                <div key={entry.id} className="p-3 bg-white border border-outline-variant rounded-lg space-y-2 relative overflow-hidden group hover:border-primary/50 transition-colors">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary"></div>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{entry.date}</span>
                      <h6 className="text-[12px] font-bold text-on-surface mt-1">{entry.treatment}</h6>
                    </div>
                    <span className="text-[9px] font-bold bg-surface px-1.5 py-0.5 rounded text-on-surface-variant uppercase border border-outline-variant/30">{entry.status}</span>
                  </div>
                  <p className="text-[12px] text-on-surface">{entry.note}</p>
                  <div className="flex items-center gap-2 pt-1 border-t border-surface">
                     <User size={10} className="text-on-surface-variant opacity-50" />
                     <p className="text-[10px] font-medium text-on-surface-variant italic">{entry.doctor}</p>
                  </div>
                </div>
              ))}
              {evolutions.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-outline-variant rounded-xl opacity-50">
                  <FileText size={24} className="mx-auto mb-2 text-on-surface-variant" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Sin evoluciones registradas</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4">
            <button onClick={() => setActiveModal(null)} className="w-full px-4 py-2 border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-surface transition-colors uppercase tracking-widest">Cerrar Historial</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
