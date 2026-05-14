import { useState, useEffect } from 'react';
import { Package, Plus, Search, AlertCircle, TrendingDown, RefreshCw, BarChart3, ChevronRight, Save, History, ArrowUpRight, ArrowDownRight, Edit3 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, orderBy, where } from 'firebase/firestore';

export function Inventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [activeModal, setActiveModal] = useState<'create' | 'adjust' | 'details' | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low'>('all');

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Suministros',
    stock: 0,
    minStock: 0,
    unit: 'pcs'
  });

  const [adjustmentData, setAdjustmentData] = useState({
    type: 'in' as 'in' | 'out',
    quantity: 0,
    reason: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'stocks'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        let status = 'normal';
        if (data.stock <= 0) status = 'out';
        else if (data.stock <= data.minStock) status = 'low';
        return { id: doc.id, ...data, status };
      });
      setInventory(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stocks'));

    return () => unsubscribe();
  }, []);

  const handleOpenModal = (type: 'create' | 'adjust' | 'details', item?: any) => {
    setSelectedItem(item || null);
    if (item) {
      setFormData({
        name: item.name,
        sku: item.sku,
        category: item.category,
        stock: item.stock,
        minStock: item.minStock,
        unit: item.unit
      });
    } else {
      setFormData({
        name: '',
        sku: '',
        category: 'Suministros',
        stock: 0,
        minStock: 0,
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
        await updateDoc(doc(db, 'stocks', selectedItem.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'stocks'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
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
      const newStock = adjustmentData.type === 'in' 
        ? selectedItem.stock + adjustmentData.quantity 
        : selectedItem.stock - adjustmentData.quantity;

      await updateDoc(doc(db, 'stocks', selectedItem.id), {
        stock: Math.max(0, newStock),
        updatedAt: serverTimestamp()
      });

      // Optionally log movement here in a subcollection
      
      setActiveModal(null);
      setAdjustmentData({ type: 'in', quantity: 0, reason: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `stocks/${selectedItem.id}`);
    }
  };

  const filteredInventory = inventory.filter(item => {
    const itemName = item.name || '';
    const itemSku = item.sku || '';
    const matchesSearch = itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         itemSku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === 'low' || item.status === 'out';
    return matchesSearch && matchesStatus;
  });

  const stats = {
    totalItems: inventory.length,
    lowStock: inventory.filter(i => i.status === 'low' || i.status === 'out').length,
    consumption: '+12%', // Mocked for now
    monthlyCost: '$2.4k'   // Mocked for now
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
          { label: 'Costo Mensual', value: stats.monthlyCost, icon: BarChart3, color: 'bg-secondary-container text-secondary' },
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
              placeholder="Buscar ítem o SKU..." 
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
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Categoría</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">En Stock</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface">
              {filteredInventory.map((item) => (
                <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                  <td className="px-6 py-3">
                    <p className="text-[13px] font-bold text-on-surface">{item.name}</p>
                    <p className="text-[10px] font-mono text-on-surface-variant uppercase">{item.sku}</p>
                  </td>
                  <td className="px-6 py-3 text-[11px] font-medium text-on-surface-variant">{item.category}</td>
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
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                      item.status === 'normal' ? 'bg-tertiary-container text-on-tertiary-container' :
                      item.status === 'low' ? 'bg-error-container text-error' :
                      'bg-error text-white shadow-sm'
                    )}>
                      {item.status.replace('-', ' ')}
                    </span>
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
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">SKU / Código</label>
              <input 
                type="text" 
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                placeholder="Ej: GL-001" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Categoría</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary"
              >
                <option>Suministros</option>
                <option>Descartables</option>
                <option>Medicamentos</option>
                <option>Equipamiento</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Inicial</label>
              <input 
                type="number" 
                required
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Mínimo</label>
              <input 
                type="number" 
                required
                value={formData.minStock}
                onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) })}
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
                placeholder="Pzs, cajas.." 
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
              <div className="bg-surface-bright p-4 rounded-xl border border-outline-variant grid grid-cols-2 gap-4 relative">
                <button 
                  onClick={() => setIsEditingStock(true)}
                  className="absolute top-2 right-2 p-1.5 hover:bg-surface rounded-lg text-primary transition-all text-[10px] font-bold uppercase flex items-center gap-1"
                >
                  <Edit3 size={12} /> Modificar
                </button>
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Estado Actual</p>
                  <h4 className="text-xl font-bold text-on-surface">{selectedItem?.stock} {selectedItem?.unit}</h4>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Mínimo Requerido</p>
                  <h4 className="text-sm font-bold text-on-surface">{selectedItem?.minStock} {selectedItem?.unit}</h4>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-on-surface">
                  <History size={16} className="text-primary" />
                  <h5 className="text-[11px] font-bold uppercase tracking-widest">Movimientos Recientes</h5>
                </div>
                
                <div className="space-y-2">
                  {[
                    { date: '10 Mayo, 2024', type: 'Entrada', qty: '+5', note: 'Reposición programada' },
                    { date: '08 Mayo, 2024', type: 'Salida', qty: '-2', note: 'Uso en Cirugía #104' },
                    { date: '05 Mayo, 2024', type: 'Salida', qty: '-1', note: 'Uso en Consulta #92' }
                  ].map((mov, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-white border border-outline-variant rounded-lg group hover:border-primary/50 transition-colors">
                      <div>
                        <p className="text-[12px] font-bold text-on-surface">{mov.note}</p>
                        <p className="text-[10px] text-on-surface-variant">{mov.date}</p>
                      </div>
                      <span className={cn(
                        "text-[12px] font-bold",
                        mov.qty.startsWith('+') ? 'text-primary' : 'text-error'
                      )}>
                        {mov.qty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button onClick={() => setActiveModal(null)} className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest">Cerrar</button>
              </div>
            </>
          ) : (
            <form className="space-y-4" onSubmit={handleSaveItem}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Actual</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">{selectedItem?.unit}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Stock Mínimo</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={formData.minStock}
                      onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" 
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">{selectedItem?.unit}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Motivo del Ajuste</label>
                <textarea rows={2} className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary resize-none" placeholder="Indique la razón de la corrección manual..." />
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
