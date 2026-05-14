import { useState, useEffect } from 'react';
import { Package, Plus, Search, AlertCircle, TrendingDown, RefreshCw, BarChart3, ChevronRight, Save, History, ArrowUpRight, ArrowDownRight, Edit3 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, writeBatch } from 'firebase/firestore';

export function Inventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [activeModal, setActiveModal] = useState<'create' | 'adjust' | 'details' | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low'>('all');

  const [formData, setFormData] = useState({
    name: '',
    stock: 0,
    minStock: 0,
    price: 0,
    unit: 'pcs'
  });

  const [adjustmentData, setAdjustmentData] = useState({
    type: 'in' as 'in' | 'out',
    quantity: 0,
    reason: ''
  });

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const q = query(
      collection(db, 'stocks'), 
      where('userId', '==', userId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        let status = 'normal';
        if (data.stock <= 0) status = 'out';
        else if (data.stock <= data.minStock) status = 'low';
        return { id: doc.id, ...data, status };
      }).sort((a: any, b: any) => a.name.localeCompare(b.name));
      setInventory(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stocks'));

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    if (selectedItem && activeModal === 'details') {
      const q = query(
        collection(db, `stocks/${selectedItem.id}/movements`),
        where('userId', '==', auth.currentUser?.uid),
        orderBy('date', 'desc')
      );
      const unsubscribeM = onSnapshot(q, (snapshot) => {
        setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, `stocks/${selectedItem.id}/movements`));
      return () => unsubscribeM();
    } else {
      setMovements([]);
    }
  }, [selectedItem, activeModal]);

  const handleOpenModal = (type: 'create' | 'adjust' | 'details', item?: any) => {
    setSelectedItem(item || null);
    if (item) {
      setFormData({
        name: item.name,
        stock: item.stock,
        minStock: item.minStock,
        price: item.price || 0,
        unit: item.unit
      });
    } else {
      setFormData({
        name: '',
        stock: 0,
        minStock: 0,
        price: 0,
        unit: 'pcs'
      });
    }
    setActiveModal(type);
    setIsEditingStock(false);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedItem) {
        const batch = writeBatch(db);
        const itemRef = doc(db, 'stocks', selectedItem.id);
        
        batch.update(itemRef, {
          ...formData,
          updatedAt: serverTimestamp()
        });

        if (formData.stock !== selectedItem.stock) {
          const diff = formData.stock - selectedItem.stock;
          const movementRef = doc(collection(db, `stocks/${selectedItem.id}/movements`));
          batch.set(movementRef, {
            type: diff > 0 ? 'in' : 'out',
            quantity: Math.abs(diff),
            reason: 'Corrección manual de stock',
            date: serverTimestamp(),
            userId: auth.currentUser?.uid
          });
        }

        await batch.commit();
      } else {
        const docRef = await addDoc(collection(db, 'stocks'), {
          ...formData,
          userId: auth.currentUser?.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Initial movement
        if (formData.stock > 0) {
          await addDoc(collection(db, `stocks/${docRef.id}/movements`), {
            type: 'in',
            quantity: formData.stock,
            reason: 'Stock inicial',
            date: serverTimestamp(),
            userId: auth.currentUser?.uid
          });
        }
      }
      setActiveModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'stocks');
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      const batch = writeBatch(db);
      const newStock = adjustmentData.type === 'in' 
        ? selectedItem.stock + adjustmentData.quantity 
        : selectedItem.stock - adjustmentData.quantity;

      const stockRef = doc(db, 'stocks', selectedItem.id);
      batch.update(stockRef, {
        stock: Math.max(0, newStock),
        updatedAt: serverTimestamp()
      });

      // Log movement in subcollection
      const movementRef = doc(collection(db, `stocks/${selectedItem.id}/movements`));
      batch.set(movementRef, {
        type: adjustmentData.type,
        quantity: adjustmentData.quantity,
        reason: adjustmentData.reason || (adjustmentData.type === 'in' ? 'Entrada manual' : 'Salida manual'),
        date: serverTimestamp(),
        userId: auth.currentUser?.uid
      });
      
      await batch.commit();
      
      setActiveModal(null);
      setAdjustmentData({ type: 'in', quantity: 0, reason: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `stocks/${selectedItem.id}`);
    }
  };

  const filteredInventory = inventory.filter(item => {
    const itemName = item.name || '';
    const matchesSearch = itemName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === 'low' || item.status === 'out';
    return matchesSearch && matchesStatus;
  });

  const stats = {
    totalItems: inventory.length,
    lowStock: inventory.filter(i => i.status === 'low' || i.status === 'out').length,
    consumption: '+12%', // Mocked for now
    totalValue: inventory.reduce((acc, curr) => acc + (curr.stock * (curr.price || 0)), 0)
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Inventario de Clínica</h1>
          <p className="body-md text-on-surface-variant">Seguimiento de niveles de stock, consumo de materiales y alertas de reposición.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => handleOpenModal('adjust')}
            className="px-3 py-1.5 bg-white border border-outline-variant rounded-md text-[11px] font-bold flex items-center gap-2 hover:bg-surface transition-all text-on-surface-variant uppercase tracking-wider"
          >
            <RefreshCw size={14} />
            AJUSTAR STOCK
          </button>
          <button 
            onClick={() => handleOpenModal('create')}
            className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider"
          >
            <Plus size={16} />
            NUEVO ÍTEM
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Ítems', value: stats.totalItems, icon: Package, color: 'bg-primary-container text-primary' },
          { label: 'Stock Bajo', value: stats.lowStock, icon: AlertCircle, color: 'bg-error-container text-error' },
          { label: 'Consumo', value: stats.consumption, icon: TrendingDown, color: 'bg-tertiary-container text-on-tertiary-container' },
          { label: 'Valor Total', value: `$${stats.totalValue.toLocaleString()}`, icon: BarChart3, color: 'bg-secondary-container text-secondary' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-4 rounded-xl border border-outline-variant shadow-sm flex items-center gap-4">
            <div className={cn("p-2 rounded-lg", stat.color)}>
              <stat.icon size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{stat.label}</p>
              <h3 className="text-lg font-bold text-on-surface">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-outline-variant flex justify-between items-center bg-white">
          <div className="relative w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input 
              type="text" 
              placeholder="Buscar producto..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary text-[13px] outline-none" 
            />
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider",
                statusFilter === 'all' ? "bg-primary text-white" : "bg-surface text-on-surface-variant hover:bg-outline-variant"
              )}
            >
              Todos
            </button>
            <button 
              onClick={() => setStatusFilter('low')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider",
                statusFilter === 'low' ? "bg-error text-white" : "bg-error-container text-error hover:bg-error/10"
              )}
            >
              Stock Bajo
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-bright border-b border-outline-variant">
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Producto</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">En Stock</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Precio</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface">
              {filteredInventory.map((item) => (
                <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                  <td className="px-6 py-3">
                    <p className="text-[13px] font-bold text-on-surface">{item.name}</p>
                  </td>

                  <td className="px-6 py-3">
                    <div className="flex flex-col gap-1 w-24">
                      <div className="flex justify-between items-end">
                        <span className="text-[12px] font-bold text-on-surface">{item.stock} {item.unit}</span>
                      </div>
                      <div className="w-full h-1 bg-surface-dim rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full", 
                            item.status === 'out' ? 'w-0' : 
                            item.status === 'low' ? 'bg-error w-1/4' : 
                            'bg-primary w-2/3'
                          )}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <p className="text-[12px] font-bold text-on-surface">${(item.price || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-on-surface-variant">Valor: ${(item.stock * (item.price || 0)).toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button 
                      onClick={() => handleOpenModal('details', item)}
                      className="p-1.5 hover:bg-surface text-on-surface-variant rounded-md transition-all"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={activeModal === 'create'}
        onClose={() => setActiveModal(null)}
        title={selectedItem ? "Editar Ítem" : "Agregar Nuevo Ítem"}
      >
        <form className="space-y-4" onSubmit={handleSaveItem}>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre del Producto</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              placeholder="Ej: Guantes de Látex" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Inicial</label>
              <input 
                type="number" 
                required
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Precio Unitario ($)</label>
              <input 
                type="number" 
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Mínimo Stock</label>
              <input 
                type="number" 
                required
                value={formData.minStock}
                onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Unidad</label>
              <input 
                type="text" 
                required
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="Ej: Pzs, Cajas" 
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-widest">Guardar</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={activeModal === 'adjust'}
        onClose={() => setActiveModal(null)}
        title="Ajustar Stock"
      >
        <form className="space-y-4" onSubmit={handleAdjustStock}>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</label>
            <select 
              value={selectedItem?.id}
              onChange={(e) => setSelectedItem(inventory.find(i => i.id === e.target.value))}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Seleccione un producto</option>
              {inventory.map(item => (
                <option key={item.id} value={item.id}>{item.name} ({item.stock} {item.unit})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Tipo de Ajuste</label>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setAdjustmentData({ ...adjustmentData, type: 'in' })}
                  className={cn(
                    "flex-1 py-2 flex items-center justify-center gap-1.5 rounded-lg border text-[12px] font-bold",
                    adjustmentData.type === 'in' ? "border-primary bg-primary/10 text-primary" : "border-outline-variant hover:bg-surface text-on-surface-variant"
                  )}
                >
                  <ArrowUpRight size={14} /> ENTRADA
                </button>
                <button 
                  type="button" 
                  onClick={() => setAdjustmentData({ ...adjustmentData, type: 'out' })}
                  className={cn(
                    "flex-1 py-2 flex items-center justify-center gap-1.5 rounded-lg border text-[12px] font-bold",
                    adjustmentData.type === 'out' ? "border-primary bg-primary/10 text-primary" : "border-outline-variant hover:bg-surface text-on-surface-variant"
                  )}
                >
                  <ArrowDownRight size={14} /> SALIDA
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Cantidad</label>
              <input 
                type="number" 
                required
                value={adjustmentData.quantity}
                onChange={(e) => setAdjustmentData({ ...adjustmentData, quantity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="0" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Motivo</label>
            <textarea 
              rows={2} 
              value={adjustmentData.reason}
              onChange={(e) => setAdjustmentData({ ...adjustmentData, reason: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary resize-none" 
              placeholder="Ej: Compra a proveedor, descarte por vencimiento..." 
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-widest">Confirmar</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={activeModal === 'details'}
        onClose={() => setActiveModal(null)}
        title={isEditingStock ? `Editar Stock: ${selectedItem?.name}` : `Detalle de Stock: ${selectedItem?.name}`}
      >
        <div className="space-y-6">
          {!isEditingStock ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Resumen de Inventario</h4>
                <button 
                  onClick={() => setIsEditingStock(true)}
                  className="p-1.5 px-3 hover:bg-primary/10 rounded-lg text-primary transition-all text-[11px] font-bold uppercase flex items-center gap-1.5 border border-primary/20"
                >
                  <Edit3 size={14} /> Modificar Datos
                </button>
              </div>
              <div className="bg-surface-bright p-4 rounded-xl border border-outline-variant grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Estado Actual</p>
                  <h4 className="text-xl font-bold text-on-surface">{selectedItem?.stock} {selectedItem?.unit}</h4>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Valor Total</p>
                  <h4 className="text-xl font-bold text-primary">${(selectedItem?.stock * (selectedItem?.price || 0)).toLocaleString()}</h4>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Precio Unitario</p>
                  <h4 className="text-sm font-bold text-on-surface">${(selectedItem?.price || 0).toLocaleString()}</h4>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Mínimo</p>
                  <h4 className="text-sm font-bold text-on-surface">{selectedItem?.minStock} {selectedItem?.unit}</h4>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-on-surface">
                  <History size={16} className="text-primary" />
                  <h5 className="text-[11px] font-bold uppercase tracking-widest">Movimientos Recientes</h5>
                </div>
                
                <div className="space-y-2">
                  {movements.map((mov, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-white border border-outline-variant rounded-lg group hover:border-primary/50 transition-colors">
                      <div>
                        <p className="text-[12px] font-bold text-on-surface">{mov.reason}</p>
                        <p className="text-[10px] text-on-surface-variant">
                          {mov.date?.toDate ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(mov.date.toDate()) : 'Reciente...'}
                        </p>
                      </div>
                      <span className={cn(
                        "text-[12px] font-bold",
                        mov.type === 'in' ? 'text-primary' : 'text-error'
                      )}>
                        {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                      </span>
                    </div>
                  ))}
                  {movements.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-outline-variant rounded-xl opacity-50">
                      <History size={24} className="mx-auto mb-2 text-on-surface-variant" />
                      <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Sin movimientos registrados</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button onClick={() => setActiveModal(null)} className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest">Cerrar</button>
              </div>
            </>
          ) : (
            <form className="space-y-4" onSubmit={handleSaveItem}>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre del Producto</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Actual</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">{selectedItem?.unit}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Precio Unitario ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Mínimo</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={formData.minStock}
                      onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">{selectedItem?.unit}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Unidad</label>
                  <input 
                    type="text" 
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Notas / Motivo</label>
                <textarea rows={2} className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary resize-none" placeholder="Indique la razón de la corrección..." />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsEditingStock(false)} className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest">Atrás</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-widest flex items-center justify-center gap-2">
                  <Save size={14} /> Guardar Cambios
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}
