import { useState, useEffect } from 'react';
import { 
  Package, Plus, Search, DollarSign, Layers, Edit3, Trash2, 
  Save, AlertTriangle, X, Info, UserCheck, Sparkles, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from './Modal';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { useToast } from './Toast';
import { PackageDefinition, PackageItem } from '../types';
import { assignPackageToPatient } from '../lib/packageUtils';

interface PackagesManagerProps {
  ownerId: string;
  treatments: any[];
}

export function PackagesManager({ ownerId, treatments }: PackagesManagerProps) {
  const { showToast } = useToast();
  const [packages, setPackages] = useState<PackageDefinition[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals state
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | 'delete' | 'assign' | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageDefinition | null>(null);

  // Form state for creating / editing package
  const [packageName, setPackageName] = useState('');
  const [packagePrice, setPackagePrice] = useState<number>(0);
  const [packageDescription, setPackageDescription] = useState('');
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);
  
  // Staging new item in form
  const [selectedTreatmentId, setSelectedTreatmentId] = useState('');
  const [itemQuantity, setItemQuantity] = useState<number>(1);

  // Form state for assigning to patient
  const [assignPatientId, setAssignPatientId] = useState('');
  const [assignPricePaid, setAssignPricePaid] = useState<number>(0);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  // Load packages
  useEffect(() => {
    if (!ownerId) return;

    const q = query(
      collection(db, 'packages'),
      where('userId', '==', ownerId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PackageDefinition));
      setPackages(docs.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'packages'));

    // Load patients for assignment
    const pQ = query(
      collection(db, 'patients'),
      where('userId', '==', ownerId)
    );
    const unsubscribePatients = onSnapshot(pQ, (snapshot) => {
      const pDocs: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPatients(pDocs.sort((a, b) => ((a.name as string) || '').localeCompare((b.name as string) || '')));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    return () => {
      unsubscribe();
      unsubscribePatients();
    };
  }, [ownerId]);

  const handleOpenCreate = () => {
    setSelectedPackage(null);
    setPackageName('');
    setPackagePrice(0);
    setPackageDescription('');
    setPackageItems([]);
    setSelectedTreatmentId(treatments.length > 0 ? treatments[0].id : '');
    setItemQuantity(1);
    setActiveModal('create');
  };

  const handleOpenEdit = (pkg: PackageDefinition) => {
    setSelectedPackage(pkg);
    setPackageName(pkg.name);
    setPackagePrice(pkg.price || 0);
    setPackageDescription(pkg.description || '');
    setPackageItems([...(pkg.items || [])]);
    setSelectedTreatmentId(treatments.length > 0 ? treatments[0].id : '');
    setItemQuantity(1);
    setActiveModal('edit');
  };

  const handleOpenDelete = (pkg: PackageDefinition) => {
    setSelectedPackage(pkg);
    setActiveModal('delete');
  };

  const handleOpenAssign = (pkg: PackageDefinition) => {
    setSelectedPackage(pkg);
    setAssignPatientId(patients.length > 0 ? patients[0].id : '');
    setAssignPricePaid(pkg.price || 0);
    setPatientSearchTerm('');
    setActiveModal('assign');
  };

  const handleAddTreatmentItem = () => {
    if (!selectedTreatmentId) return;
    const treatment = treatments.find(t => t.id === selectedTreatmentId);
    if (!treatment) return;

    const existingIndex = packageItems.findIndex(it => it.treatmentId === selectedTreatmentId);
    if (existingIndex >= 0) {
      const updated = [...packageItems];
      updated[existingIndex].quantity += Math.max(1, itemQuantity);
      setPackageItems(updated);
    } else {
      setPackageItems([
        ...packageItems,
        {
          treatmentId: treatment.id,
          treatmentName: treatment.name,
          quantity: Math.max(1, itemQuantity)
        }
      ]);
    }
    setItemQuantity(1);
  };

  const handleRemoveItem = (index: number) => {
    setPackageItems(packageItems.filter((_, i) => i !== index));
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    const updated = [...packageItems];
    updated[index].quantity = newQty;
    setPackageItems(updated);
  };

  const totalSessionsInForm = packageItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const totalStandardValueInForm = packageItems.reduce((acc, it) => {
    const t = treatments.find(trait => trait.id === it.treatmentId || trait.name === it.treatmentName);
    return acc + ((t?.cost || 0) * (it.quantity || 0));
  }, 0);

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (packageItems.length === 0) {
      showToast('Debe agregar al menos un tratamiento al paquete', 'error');
      return;
    }

    try {
      const payload = {
        name: packageName.trim(),
        price: Number(packagePrice) || 0,
        description: packageDescription.trim(),
        items: packageItems,
        totalSessions: totalSessionsInForm,
        userId: ownerId,
        updatedAt: serverTimestamp()
      };

      if (selectedPackage) {
        await updateDoc(doc(db, 'packages', selectedPackage.id), payload);
        showToast('Paquete actualizado exitosamente');
      } else {
        await addDoc(collection(db, 'packages'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        showToast('Paquete creado exitosamente');
      }

      setActiveModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'packages');
    }
  };

  const handleDeletePackage = async () => {
    if (!selectedPackage) return;
    try {
      await deleteDoc(doc(db, 'packages', selectedPackage.id));
      setActiveModal(null);
      showToast('Paquete eliminado exitosamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `packages/${selectedPackage.id}`);
    }
  };

  const handleConfirmAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackage || !assignPatientId) {
      showToast('Seleccione un paciente para asignar el paquete', 'error');
      return;
    }

    const patient = patients.find(p => p.id === assignPatientId);
    if (!patient) return;

    try {
      await assignPackageToPatient(db, ownerId, patient, selectedPackage, assignPricePaid);
      setActiveModal(null);
      showToast(`Paquete "${selectedPackage.name}" asignado exitosamente a ${patient.name}`);
    } catch (error: any) {
      console.error(error);
      showToast('Error al asignar el paquete al paciente', 'error');
    }
  };

  const filteredPackages = packages.filter(pkg =>
    pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.items?.some(it => it.treatmentName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredPatientsForAssign = patients.filter(p =>
    p.name?.toLowerCase().includes(patientSearchTerm.toLowerCase()) ||
    p.idNumber?.toLowerCase().includes(patientSearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-white p-4 rounded-xl border border-outline-variant shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
          <input 
            type="text" 
            placeholder="Buscar paquetes por nombre o tratamiento..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button 
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider shrink-0"
        >
          <Plus size={16} />
          Nuevo Paquete
        </button>
      </div>

      {/* Packages Grid */}
      {filteredPackages.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-outline-variant rounded-2xl p-8">
          <div className="w-16 h-16 bg-primary-container/40 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={32} />
          </div>
          <h3 className="text-base font-bold text-on-surface mb-1">
            {searchTerm ? 'No se encontraron paquetes' : 'No hay paquetes de tratamientos creados'}
          </h3>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto mb-6">
            Cree combos o bonos con múltiples tratamientos (ej. 3 Limpiezas + 1 Blanqueamiento) a un precio fijo para que los pacientes puedan consumirlos en sus turnos sin costo adicional.
          </p>
          <button 
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-primary text-white rounded-lg text-xs font-bold inline-flex items-center gap-2 hover:bg-primary/90 shadow-sm"
          >
            <Plus size={16} />
            Crear Primer Paquete
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPackages.map((pkg) => {
            const totalItemsCount = (pkg.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
            const standardValue = (pkg.items || []).reduce((acc, it) => {
              const t = treatments.find(trait => trait.id === it.treatmentId || trait.name === it.treatmentName);
              return acc + ((t?.cost || 0) * (it.quantity || 0));
            }, 0);
            const savings = standardValue > pkg.price ? standardValue - pkg.price : 0;

            return (
              <div 
                key={pkg.id} 
                className="bg-white border border-outline-variant rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col group relative"
              >
                {/* Card Header */}
                <div className="p-5 pb-4 flex-1">
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-md text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wider">
                        <Layers size={13} />
                        {totalItemsCount} {totalItemsCount === 1 ? 'Sesión' : 'Sesiones'}
                      </span>
                      {savings > 0 && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                          Ahorro ${(savings).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenEdit(pkg)}
                        className="p-1.5 hover:bg-surface rounded-lg text-on-surface-variant transition-colors"
                        title="Editar Paquete"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        onClick={() => handleOpenDelete(pkg)}
                        className="p-1.5 hover:bg-error-container text-error rounded-lg transition-colors"
                        title="Eliminar Paquete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-on-surface mb-1 leading-snug">{pkg.name}</h3>
                  {pkg.description && (
                    <p className="text-[12px] text-on-surface-variant line-clamp-2 mb-3">{pkg.description}</p>
                  )}

                  {/* Price Row */}
                  <div className="flex items-baseline gap-2 mb-4 bg-surface-bright p-3 rounded-xl border border-outline-variant/60">
                    <span className="text-2xl font-black text-on-surface">
                      ${Number(pkg.price || 0).toLocaleString()}
                    </span>
                    {standardValue > 0 && standardValue !== pkg.price && (
                      <span className="text-xs text-on-surface-variant/70 line-through">
                        Valor normal: ${standardValue.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Included Treatments List */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                      Tratamientos Incluidos
                    </p>
                    <div className="space-y-1.5">
                      {(pkg.items || []).map((item, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between text-xs py-1 px-2.5 bg-surface rounded-lg border border-outline-variant/40"
                        >
                          <span className="font-medium text-on-surface truncate pr-2">
                            {item.treatmentName}
                          </span>
                          <span className="px-2 py-0.5 bg-primary-container/80 text-primary font-bold rounded text-[11px] shrink-0">
                            x{item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action: Vender / Asignar a Paciente */}
                <button 
                  onClick={() => handleOpenAssign(pkg)}
                  className="w-full border-t border-outline-variant bg-surface hover:bg-primary-container/30 px-4 py-3 flex items-center justify-between text-primary font-bold text-xs uppercase tracking-wider transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <UserCheck size={16} />
                    <span>Asignar / Vender a Paciente</span>
                  </div>
                  <ChevronRight size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Crear / Editar Paquete */}
      <Modal
        isOpen={activeModal === 'create' || activeModal === 'edit'}
        onClose={() => setActiveModal(null)}
        title={activeModal === 'create' ? 'Nuevo Paquete de Tratamientos' : 'Editar Paquete'}
        className="max-w-2xl"
      >
        <form className="space-y-5" onSubmit={handleSavePackage}>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Nombre del Paquete *
            </label>
            <input 
              type="text" 
              required
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              placeholder="Ej: Pack Sonrisa Plena (3 Limpiezas + 1 Blanqueamiento)" 
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                Precio Total del Paquete ($) *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={15} />
                <input 
                  type="number" 
                  min="0"
                  required
                  value={packagePrice || ''}
                  onChange={(e) => setPackagePrice(parseFloat(e.target.value) || 0)}
                  className="w-full pl-8 pr-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] font-bold outline-none focus:ring-1 focus:ring-primary" 
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                Descripción (Opcional)
              </label>
              <input 
                type="text"
                value={packageDescription}
                onChange={(e) => setPackageDescription(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="Ej: Incluye profilaxis completa y kit de mantenimiento"
              />
            </div>
          </div>

          {/* Selector de Tratamientos a incluir */}
          <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  Tratamientos Incluidos en el Paquete
                </h4>
                <p className="text-[11px] text-on-surface-variant">
                  Agregue los procedimientos y la cantidad de sesiones que tendrá el paciente.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-primary-container text-primary text-xs font-bold rounded-lg">
                Total: {totalSessionsInForm} {totalSessionsInForm === 1 ? 'Sesión' : 'Sesiones'}
              </span>
            </div>

            {/* Input para agregar tratamiento */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-1">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Tratamiento</label>
                <select
                  value={selectedTreatmentId}
                  onChange={(e) => setSelectedTreatmentId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Seleccionar Tratamiento --</option>
                  {treatments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (${Number(t.cost || 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-28 space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Cant. Sesiones</label>
                <input 
                  type="number"
                  min="1"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-white border border-outline-variant rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-primary text-center"
                />
              </div>

              <button 
                type="button"
                onClick={handleAddTreatmentItem}
                disabled={!selectedTreatmentId}
                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shrink-0"
              >
                <Plus size={15} />
                Agregar
              </button>
            </div>

            {/* Lista de tratamientos agregados */}
            <div className="space-y-2 pt-2">
              {packageItems.map((item, idx) => {
                const treatment = treatments.find(t => t.id === item.treatmentId || t.name === item.treatmentName);
                const unitCost = treatment?.cost || 0;
                const subtotal = unitCost * item.quantity;

                return (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-2.5 bg-white border border-outline-variant rounded-lg group"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-xs font-bold text-on-surface truncate">{item.treatmentName}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        ${unitCost.toLocaleString()} c/u • Subtotal catálogo: ${subtotal.toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1">
                        <button 
                          type="button" 
                          onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                          className="w-6 h-6 rounded bg-surface border border-outline-variant flex items-center justify-center text-xs font-bold hover:bg-outline-variant"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-on-surface">
                          {item.quantity}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                          className="w-6 h-6 rounded bg-surface border border-outline-variant flex items-center justify-center text-xs font-bold hover:bg-outline-variant"
                        >
                          +
                        </button>
                      </div>

                      <button 
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1 hover:bg-error-container text-error rounded transition-colors"
                        title="Quitar del paquete"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {packageItems.length === 0 && (
                <div className="text-center py-6 border border-dashed border-outline-variant rounded-lg text-on-surface-variant text-xs">
                  Aún no ha agregado ningún tratamiento a este paquete.
                </div>
              )}
            </div>

            {totalStandardValueInForm > 0 && (
              <div className="flex justify-between items-center text-xs pt-2 border-t border-outline-variant text-on-surface-variant">
                <span>Valor catálogo sumado: <b>${totalStandardValueInForm.toLocaleString()}</b></span>
                {packagePrice > 0 && totalStandardValueInForm > packagePrice && (
                  <span className="text-emerald-700 font-bold">
                    Ahorro para el paciente: ${(totalStandardValueInForm - packagePrice).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <button 
              type="button" 
              onClick={() => setActiveModal(null)} 
              className="flex-1 px-4 py-2 border border-outline-variant text-xs font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="flex-1 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Save size={16} />
              {activeModal === 'create' ? 'Guardar Paquete' : 'Actualizar Paquete'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Asignar Paquete a Paciente */}
      <Modal
        isOpen={activeModal === 'assign'}
        onClose={() => setActiveModal(null)}
        title={`Asignar Paquete: ${selectedPackage?.name}`}
        className="max-w-lg"
      >
        <form className="space-y-4" onSubmit={handleConfirmAssign}>
          <div className="p-3.5 bg-primary/5 rounded-xl border border-primary/20 flex items-start gap-3">
            <Sparkles className="text-primary shrink-0 mt-0.5" size={18} />
            <div className="text-xs text-on-surface">
              <p className="font-bold text-primary mb-0.5">Venta y Activación de Paquete</p>
              <p className="text-on-surface-variant leading-relaxed">
                Al asignar el paquete al paciente, sus sesiones quedan pre-pagadas. Cada vez que se registre un turno o atención, se descontará de la cantidad adquirida sin incrementar ingresos adicionales.
              </p>
            </div>
          </div>

          {/* Seleccionar Paciente */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Seleccionar Paciente *
            </label>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={14} />
                <input 
                  type="text" 
                  placeholder="Filtrar pacientes por nombre o DNI..." 
                  value={patientSearchTerm}
                  onChange={(e) => setPatientSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-surface border border-outline-variant rounded-lg text-xs outline-none"
                />
              </div>

              <select
                required
                value={assignPatientId}
                onChange={(e) => setAssignPatientId(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                size={5}
              >
                {filteredPatientsForAssign.map((p) => (
                  <option key={p.id} value={p.id} className="py-1">
                    {p.name} — DNI: {p.idNumber || 'Sin DNI'} {p.phone ? `(${p.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Precio cobrado */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Importe Cobrado al Paciente ($)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={15} />
              <input 
                type="number"
                min="0"
                required
                value={assignPricePaid}
                onChange={(e) => setAssignPricePaid(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="text-[10px] text-on-surface-variant">
              Importe abonado en la compra del paquete (las futuras sesiones asociadas tendrán costo $0).
            </p>
          </div>

          {/* Resumen del paquete */}
          {selectedPackage && (
            <div className="p-3 bg-surface rounded-xl border border-outline-variant text-xs space-y-2">
              <p className="font-bold text-on-surface">Sesiones que se acreditarán al paciente:</p>
              <div className="space-y-1">
                {(selectedPackage.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-on-surface-variant">
                    <span>• {it.treatmentName}</span>
                    <span className="font-bold text-primary">{it.quantity} {it.quantity === 1 ? 'sesión' : 'sesiones'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button 
              type="button" 
              onClick={() => setActiveModal(null)} 
              className="flex-1 px-4 py-2 border border-outline-variant text-xs font-bold rounded-lg hover:bg-surface uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={!assignPatientId}
              className="flex-1 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 shadow-sm uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} />
              Confirmar Asignación
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Confirmar Eliminación */}
      <Modal
        isOpen={activeModal === 'delete'}
        onClose={() => setActiveModal(null)}
        title="Confirmar Eliminación"
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={32} />
          </div>
          <p className="text-on-surface text-sm">
            ¿Está seguro de que desea eliminar el paquete <b>{selectedPackage?.name}</b>?
          </p>
          <p className="text-xs text-on-surface-variant">
            Esta acción no afectará a los paquetes que ya fueron comprados previamente por los pacientes.
          </p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 bg-surface border border-outline-variant rounded-lg text-xs font-bold hover:bg-outline-variant uppercase tracking-wider">
              Cancelar
            </button>
            <button onClick={handleDeletePackage} className="flex-1 px-4 py-2 bg-error text-white rounded-lg text-xs font-bold hover:bg-error/90 uppercase tracking-wider">
              Eliminar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
