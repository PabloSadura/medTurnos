import { useState, useEffect } from 'react';
import { Stethoscope, Plus, Search, DollarSign, Clock, ChevronRight, Package, Edit3, Trash2, Save, AlertTriangle, X, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, orderBy, where } from 'firebase/firestore';

export function Treatments() {
  const [treatments, setTreatments] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | 'delete' | 'materials' | null>(null);
  const [selectedTreatment, setSelectedTreatment] = useState<any>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [currentMaterials, setCurrentMaterials] = useState<any[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    cost: 0,
    duration: 30,
    materials: [] as any[]
  });

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const q = query(
      collection(db, 'treatments'), 
      where('userId', '==', userId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTreatments(docs.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treatments'));

    const invQ = query(
      collection(db, 'stocks'), 
      where('userId', '==', userId)
    );
    const unsubscribeInv = onSnapshot(invQ, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventory(docs.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stocks'));

    return () => {
      unsubscribe();
      unsubscribeInv();
    };
  }, [auth.currentUser?.uid]);

  const handleOpenModal = (type: 'create' | 'edit' | 'delete' | 'materials', treatment?: any) => {
    setSelectedTreatment(treatment || null);
    if (treatment) {
      setFormData({
        name: treatment.name,
        cost: treatment.cost,
        duration: treatment.duration,
        materials: treatment.materials || []
      });
      setCurrentMaterials(treatment.materials || []);
    } else {
      setFormData({
        name: '',
        cost: 0,
        duration: 30,
        materials: []
      });
      setCurrentMaterials([]);
    }
    setActiveModal(type);
    setIsLinking(false);
  };

  const handleSaveTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        materials: currentMaterials,
        updatedAt: serverTimestamp()
      };

      if (selectedTreatment) {
        await updateDoc(doc(db, 'treatments', selectedTreatment.id), data);
      } else {
        await addDoc(collection(db, 'treatments'), {
          ...data,
          userId: auth.currentUser?.uid,
          createdAt: serverTimestamp()
        });
      }
      setActiveModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'treatments');
    }
  };

  const handleDeleteTreatment = async () => {
    if (!selectedTreatment) return;
    try {
      await deleteDoc(doc(db, 'treatments', selectedTreatment.id));
      setActiveModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `treatments/${selectedTreatment.id}`);
    }
  };

  const addMaterial = (item: any) => {
    if (!currentMaterials.find(m => m.materialId === item.id)) {
      setCurrentMaterials([...currentMaterials, { 
        materialId: item.id, 
        qty: 1 
      }]);
    }
    setIsLinking(false);
  };

  const removeMaterial = (materialId: string) => {
    setCurrentMaterials(currentMaterials.filter(m => m.materialId !== materialId));
  };

  const updateMaterialQty = (materialId: string, qty: number) => {
    setCurrentMaterials(currentMaterials.map(m => m.materialId === materialId ? { ...m, qty } : m));
  };

  const filteredTreatments = treatments.filter(t => 
    t.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredInventory = inventory.filter(i => 
    i.name?.toLowerCase().includes(inventorySearch.toLowerCase()) &&
    !currentMaterials.find(cm => cm.materialId === i.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Tratamientos y Servicios</h1>
          <p className="body-md text-on-surface-variant">Gestione procedimientos clínicos, precios y materiales asociados del inventario.</p>
        </div>
        <button 
          onClick={() => handleOpenModal('create')}
          className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider"
        >
          <Plus size={16} />
          Nuevo Tratamiento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredTreatments.map((treatment) => (
          <div key={treatment.id} className="bg-white border border-outline-variant rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden group flex flex-col">
            <div className="p-4 flex-1">
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 bg-primary-container text-primary rounded-lg">
                  <Stethoscope size={18} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleOpenModal('edit', treatment)}
                    className="p-1 hover:bg-surface rounded text-on-surface-variant"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button 
                    onClick={() => handleOpenModal('delete', treatment)}
                    className="p-1 hover:bg-error-container text-error rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              <h3 className="text-[14px] font-bold text-on-surface mb-1">{treatment.name}</h3>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 text-on-surface">
                  <DollarSign size={14} className="text-tertiary" />
                  <span className="text-[13px] font-bold">${treatment.cost}</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <Clock size={14} className="text-secondary" />
                  <span className="text-[12px] font-medium">{treatment.duration} min</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => handleOpenModal('materials', treatment)}
              className="w-full border-t border-outline-variant bg-surface-bright px-4 py-2.5 flex justify-between items-center mt-auto hover:bg-surface transition-colors group/link"
            >
              <div className="flex items-center gap-1.5 text-on-surface-variant group-hover/link:text-primary transition-colors">
                <Package size={12} />
                <span className="text-[10px] font-bold uppercase tracking-tight">{treatment.materials?.length || 0} Materiales Vinculados</span>
              </div>
              <ChevronRight size={14} className="text-on-surface-variant group-hover/link:text-primary group-hover/link:translate-x-1 transition-all" />
            </button>
          </div>
        ))}
      </div>

      {/* Modals */}
      <Modal
        isOpen={activeModal === 'create' || activeModal === 'edit'}
        onClose={() => setActiveModal(null)}
        title={activeModal === 'create' ? 'Nuevo Tratamiento' : 'Editar Tratamiento'}
      >
        <form className="space-y-4" onSubmit={handleSaveTreatment}>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre del Tratamiento</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              placeholder="Ej: Limpieza Completa" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Costo ($)</label>
              <input 
                type="number" 
                required
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Duración (min)</label>
              <input 
                type="number" 
                required
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-widest flex items-center justify-center gap-2">
              <Save size={16} />
              {activeModal === 'create' ? 'Guardar' : 'Actualizar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={activeModal === 'materials'}
        onClose={() => setActiveModal(null)}
        title={`Materiales: ${selectedTreatment?.name}`}
        className="max-w-xl"
      >
        <div className="space-y-6">
          <div className="bg-surface p-4 rounded-xl border border-outline-variant flex items-start gap-4">
            <Info className="text-secondary shrink-0 mt-0.5" size={18} />
            <div>
              <h4 className="text-[12px] font-bold text-on-surface uppercase tracking-wider">Gestión de Materiales</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">Vincule materiales del inventario a este tratamiento para descontarlos automáticamente al ser realizado.</p>
            </div>
          </div>

          {!isLinking ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h5 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Materiales Vinculados</h5>
                <button 
                  onClick={() => setIsLinking(true)}
                  className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider flex items-center gap-1"
                >
                  <Plus size={12} /> Vincular Nuevo
                </button>
              </div>

              <div className="space-y-2">
                {currentMaterials.map((material) => {
                  const stockItem = inventory.find(i => i.id === material.materialId);
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={material.materialId} 
                      className="flex justify-between items-center p-3 bg-white border border-outline-variant rounded-lg group"
                    >
                      <div className="flex-1">
                        <p className="text-[13px] font-bold text-on-surface">{stockItem?.name || 'Cargando...'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tight">Cant por uso:</p>
                          <input 
                            type="number"
                            step="0.1"
                            value={material.qty}
                            onChange={(e) => updateMaterialQty(material.materialId, parseFloat(e.target.value))}
                            className="w-16 px-1 py-0.5 border border-outline-variant rounded text-[11px] font-bold bg-surface outline-none"
                          />
                          <span className="text-[10px] text-on-surface-variant font-bold uppercase">{stockItem?.unit}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => removeMaterial(material.materialId)}
                          className="p-1.5 hover:bg-error-container text-error rounded transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
                {currentMaterials.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-outline-variant rounded-xl opacity-50">
                    <Package size={24} className="mx-auto mb-2" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Sin materiales vinculados</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center">
                <h5 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Seleccionar Material del Inventario</h5>
                <button 
                  onClick={() => setIsLinking(false)}
                  className="text-[10px] font-bold text-on-surface-variant hover:underline uppercase"
                >
                  Atrás
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar en el inventario..." 
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                {filteredInventory.map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => addMaterial(item)}
                    className="w-full text-left p-3 rounded-lg hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all flex justify-between items-center group/item"
                  >
                    <div>
                      <span className="text-[13px] font-bold text-on-surface group-hover/item:text-primary transition-colors">{item.name}</span>
                      <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">{item.unit}</p>
                    </div>
                    <Plus size={14} className="text-primary opacity-0 group-hover/item:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <div className="pt-4 flex gap-3">
            <button 
              onClick={() => setActiveModal(null)} 
              className="flex-1 px-4 py-2 border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-surface transition-colors uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveTreatment}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-[12px] font-bold hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Save size={16} />
              Guardar Cambios
            </button>
          </div>
        </div>
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
          <p className="text-on-surface">¿Está seguro de que desea eliminar el tratamiento <b>{selectedTreatment?.name}</b>?</p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 bg-surface border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest">Cancelar</button>
            <button onClick={handleDeleteTreatment} className="flex-1 px-4 py-2 bg-error text-white rounded-lg text-[12px] font-bold hover:bg-error/90 transition-colors uppercase tracking-widest">Eliminar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
