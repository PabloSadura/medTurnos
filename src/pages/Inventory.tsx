import { useState, useEffect, useMemo } from 'react';
import { Package, Plus, Search, AlertCircle, TrendingDown, RefreshCw, BarChart3, ChevronRight, Save, History, ArrowUpRight, ArrowDownRight, Edit3, Trash2, Layers, AlertTriangle, Filter, Calendar, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, where, writeBatch, deleteDoc, getDocs } from 'firebase/firestore';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';

export function Inventory() {
  const { showToast } = useToast();
  const { ownerId } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [activeModal, setActiveModal] = useState<'create' | 'adjust' | 'details' | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low'>('all');
  const [activeTab, setActiveTab] = useState<'items' | 'movements'>('items');

  // Real Movements Audit State
  const [globalMovements, setGlobalMovements] = useState<any[]>([]);
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [totalConsumedStats, setTotalConsumedStats] = useState({
    unitsOut: 0,
    countOut: 0,
    valueOut: 0
  });

  const [formData, setFormData] = useState({
    name: '',
    stock: 0,
    minStock: 0,
    price: 0,
    unit: 'unidades'
  });

  const [adjustmentData, setAdjustmentData] = useState({
    type: 'in' as 'in' | 'out',
    quantity: 0,
    reason: ''
  });

  useEffect(() => {
    if (!ownerId) return;

    const q = query(
      collection(db, 'stocks'), 
      where('userId', '==', ownerId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        let status = 'normal';
        if (data.stock <= 0) status = 'out';
        else if (data.stock <= data.minStock) status = 'low';
        return { id: doc.id, ...data, status };
      }).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setInventory(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stocks'));

    return () => unsubscribe();
  }, [ownerId]);

  // Load real global movements across all inventory items from Firestore
  useEffect(() => {
    if (!ownerId || inventory.length === 0) {
      setTotalConsumedStats({ unitsOut: 0, countOut: 0, valueOut: 0 });
      setGlobalMovements([]);
      return;
    }

    let isMounted = true;

    const loadGlobalMovements = async () => {
      try {
        const itemPromises = inventory.map(async (item) => {
          try {
            const snap = await getDocs(collection(db, 'stocks', item.id, 'movements'));
            return snap.docs.map(docSnap => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                stockId: item.id,
                stockName: item.name || 'Material',
                stockUnit: item.unit || 'uds',
                stockPrice: item.price || 0,
                ...d
              };
            });
          } catch (err) {
            return [];
          }
        });

        const results = await Promise.all(itemPromises);
        if (!isMounted) return;

        const all: any[] = results.flat().sort((a: any, b: any) => {
          const timeA = a.date?.toDate ? a.date.toDate().getTime() : (a.date ? new Date(a.date).getTime() : 0);
          const timeB = b.date?.toDate ? b.date.toDate().getTime() : (b.date ? new Date(b.date).getTime() : 0);
          return timeB - timeA;
        });

        let uOut = 0;
        let cOut = 0;
        let vOut = 0;

        for (const m of all) {
          if (m.type === 'out') {
            const q = Number(m.quantity) || 0;
            uOut += q;
            cOut += 1;
            vOut += q * (m.stockPrice || 0);
          }
        }

        setGlobalMovements(all);
        setTotalConsumedStats({ unitsOut: uOut, countOut: cOut, valueOut: vOut });
      } catch (e) {
        console.error("Error fetching inventory movements:", e);
      }
    };

    loadGlobalMovements();

    return () => {
      isMounted = false;
    };
  }, [ownerId, inventory]);

  // Real movements for single selected item
  useEffect(() => {
    if (selectedItem && activeModal === 'details') {
      const q = query(
        collection(db, `stocks/${selectedItem.id}/movements`)
      );
      const unsubscribeM = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        docs.sort((a, b) => {
          const tA = a.date?.toDate ? a.date.toDate().getTime() : (a.date ? new Date(a.date).getTime() : 0);
          const tB = b.date?.toDate ? b.date.toDate().getTime() : (b.date ? new Date(b.date).getTime() : 0);
          return tB - tA;
        });
        setMovements(docs);
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
        name: item.name || '',
        stock: Number(item.stock) || 0,
        minStock: Number(item.minStock) || 0,
        price: Number(item.price) || 0,
        unit: item.unit || 'unidades'
      });
    } else {
      setFormData({
        name: '',
        stock: 0,
        minStock: 0,
        price: 0,
        unit: 'unidades'
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
          name: formData.name.trim(),
          stock: Number(formData.stock) || 0,
          minStock: Number(formData.minStock) || 0,
          price: Number(formData.price) || 0,
          unit: formData.unit.trim() || 'unidades',
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
            userId: ownerId
          });
        }

        await batch.commit();
      } else {
        const docRef = await addDoc(collection(db, 'stocks'), {
          name: formData.name.trim(),
          stock: Number(formData.stock) || 0,
          minStock: Number(formData.minStock) || 0,
          price: Number(formData.price) || 0,
          unit: formData.unit.trim() || 'unidades',
          userId: ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Initial movement
        if (formData.stock > 0) {
          await addDoc(collection(db, `stocks/${docRef.id}/movements`), {
            type: 'in',
            quantity: Number(formData.stock),
            reason: 'Stock inicial en base de datos',
            date: serverTimestamp(),
            userId: ownerId
          });
        }
      }
      setActiveModal(null);
      showToast(selectedItem ? 'Ítem actualizado exitosamente' : 'Ítem creado exitosamente', 'success');
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
        ? (selectedItem.stock || 0) + (adjustmentData.quantity || 0) 
        : (selectedItem.stock || 0) - (adjustmentData.quantity || 0);

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
        userId: ownerId
      });
      
      await batch.commit();
      
      setActiveModal(null);
      setAdjustmentData({ type: 'in', quantity: 0, reason: '' });
      showToast('Stock ajustado y registrado correctamente en la base de datos', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `stocks/${selectedItem.id}`);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      // 1. Delete associated movements subcollection
      try {
        const movSnap = await getDocs(collection(db, 'stocks', itemToDelete.id, 'movements'));
        const batch = writeBatch(db);
        movSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } catch (e) {
        console.warn("Could not delete movements subcollection:", e);
      }

      // 2. Delete main stock document
      await deleteDoc(doc(db, 'stocks', itemToDelete.id));

      if (selectedItem?.id === itemToDelete.id) {
        setActiveModal(null);
        setSelectedItem(null);
      }
      setItemToDelete(null);
      showToast('Producto eliminado del inventario en la base de datos', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `stocks/${itemToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const itemName = item.name || '';
      const matchesSearch = itemName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.status === 'low' || item.status === 'out';
      return matchesSearch && matchesStatus;
    });
  }, [inventory, searchTerm, statusFilter]);

  const filteredMovements = useMemo(() => {
    return globalMovements.filter(m => {
      const matchesSearch = 
        (m.stockName || '').toLowerCase().includes(movementSearch.toLowerCase()) ||
        (m.reason || '').toLowerCase().includes(movementSearch.toLowerCase());
      const matchesType = movementTypeFilter === 'all' || m.type === movementTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [globalMovements, movementSearch, movementTypeFilter]);

  // Real statistics derived purely from database documents
  const stats = useMemo(() => {
    return {
      totalItems: inventory.length,
      lowStock: inventory.filter(i => i.status === 'low' || i.status === 'out').length,
      unitsConsumed: totalConsumedStats.unitsOut,
      countConsumed: totalConsumedStats.countOut,
      valueConsumed: totalConsumedStats.valueOut,
      totalValue: inventory.reduce((acc, curr) => acc + ((Number(curr.stock) || 0) * (Number(curr.price) || 0)), 0)
    };
  }, [inventory, totalConsumedStats]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Inventario de Clínica</h1>
          <p className="body-md text-on-surface-variant">Seguimiento de niveles de stock, consumo de materiales y alertas de reposición.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => handleOpenModal('adjust')}
            className="px-3 py-2 bg-white border border-outline-variant rounded-md text-[11px] font-bold flex items-center gap-2 hover:bg-surface transition-all text-on-surface-variant uppercase tracking-wider"
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { 
            label: 'Total Ítems', 
            value: stats.totalItems, 
            sub: `${stats.totalItems} productos en catálogo`,
            icon: Package, 
            color: 'bg-primary-container text-primary' 
          },
          { 
            label: 'Stock Bajo', 
            value: stats.lowStock, 
            sub: stats.lowStock > 0 ? 'Requiere reposición' : 'Stock en orden',
            icon: AlertCircle, 
            color: stats.lowStock > 0 ? 'bg-error-container text-error' : 'bg-emerald-50 text-emerald-700' 
          },
          { 
            label: 'Consumo Registrado', 
            value: `${stats.unitsConsumed.toLocaleString()} ${stats.unitsConsumed === 1 ? 'ud.' : 'uds.'}`, 
            sub: stats.countConsumed > 0 ? `${stats.countConsumed} movimientos de salida` : 'Sin salidas registradas',
            icon: TrendingDown, 
            color: 'bg-amber-50 text-amber-700' 
          },
          { 
            label: 'Valor Total', 
            value: `$${stats.totalValue.toLocaleString('es-AR')}`, 
            sub: 'Valor de reposición en base',
            icon: BarChart3, 
            color: 'bg-secondary-container text-secondary' 
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-3.5 sm:p-4 rounded-xl border border-outline-variant shadow-sm flex items-center gap-3 sm:gap-4 min-w-0">
            <div className={cn("p-2 rounded-lg shrink-0", stat.color)}>
              <stat.icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant truncate">{stat.label}</p>
              <h3 className="text-base sm:text-lg font-bold text-on-surface truncate">{stat.value}</h3>
              <p className="text-[10px] text-on-surface-variant/80 truncate mt-0.5">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View Mode Tabs */}
      <div className="flex border-b border-outline-variant gap-4 sm:gap-8 overflow-x-auto">
        <button
          onClick={() => setActiveTab('items')}
          className={cn(
            "pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'items' 
              ? "border-primary text-primary" 
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Package size={16} />
          Productos en Stock ({inventory.length})
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={cn(
            "pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'movements' 
              ? "border-primary text-primary" 
              : "border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Activity size={16} />
          Historial de Movimientos ({globalMovements.length})
        </button>
      </div>

      {/* Tab: Items in Stock */}
      {activeTab === 'items' && (
        <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="p-3 sm:px-6 sm:py-3 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input 
                type="text" 
                placeholder="Buscar producto..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 sm:py-1.5 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary text-[13px] outline-none" 
              />
            </div>
            <div className="flex gap-1.5 self-start sm:self-auto">
              <button 
                onClick={() => setStatusFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer",
                  statusFilter === 'all' ? "bg-primary text-white" : "bg-surface text-on-surface-variant hover:bg-outline-variant"
                )}
              >
                Todos ({inventory.length})
              </button>
              <button 
                onClick={() => setStatusFilter('low')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer",
                  statusFilter === 'low' ? "bg-error text-white" : "bg-error-container text-error hover:bg-error/10"
                )}
              >
                Stock Bajo ({inventory.filter(i => i.status === 'low' || i.status === 'out').length})
              </button>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="block md:hidden divide-y divide-outline-variant/50">
            {filteredInventory.map((item) => (
              <div 
                key={item.id} 
                className="p-4 hover:bg-surface/50 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div onClick={() => handleOpenModal('details', item)} className="cursor-pointer flex-1 mr-2">
                    <h4 className="text-sm font-bold text-on-surface">{item.name}</h4>
                    <p className="text-xs font-semibold text-primary mt-0.5">${(item.price || 0).toLocaleString('es-AR')} <span className="text-[10px] text-on-surface-variant font-normal">/ {item.unit}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      item.status === 'out' ? "bg-error-container text-error" :
                      item.status === 'low' ? "bg-amber-100 text-amber-800" :
                      "bg-emerald-50 text-emerald-700"
                    )}>
                      {item.status === 'out' ? 'Agotado' : item.status === 'low' ? 'Bajo' : 'OK'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete(item);
                      }}
                      title="Eliminar producto"
                      className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/50 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button 
                      onClick={() => handleOpenModal('details', item)}
                      className="p-1 text-on-surface-variant hover:text-primary cursor-pointer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div 
                  onClick={() => handleOpenModal('details', item)}
                  className="flex items-center justify-between text-xs text-on-surface-variant mt-2 pt-2 border-t border-outline-variant/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-on-surface">{item.stock} {item.unit}</span>
                    <div className="w-20 h-1.5 bg-surface-dim rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full", 
                          item.status === 'out' ? 'w-0' : 
                          item.status === 'low' ? 'bg-error w-1/4' : 
                          'bg-primary w-2/3'
                        )}
                      ></div>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-on-surface-variant">
                    Valor: ${(item.stock * (item.price || 0)).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            ))}
            {filteredInventory.length === 0 && (
              <div className="p-8 text-center text-on-surface-variant text-xs font-bold">
                No se encontraron productos registrados en la base de datos.
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-bright border-b border-outline-variant">
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">En Stock</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Precio Unitario</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Valor Total</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface">
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold text-on-surface">{item.name}</p>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          item.status === 'out' ? "bg-error-container text-error" :
                          item.status === 'low' ? "bg-amber-100 text-amber-800" :
                          "bg-emerald-50 text-emerald-700"
                        )}>
                          {item.status === 'out' ? 'Agotado' : item.status === 'low' ? 'Bajo' : 'OK'}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-1 w-28">
                        <div className="flex justify-between items-end">
                          <span className="text-[12px] font-bold text-on-surface">{item.stock} {item.unit}</span>
                          <span className="text-[10px] text-on-surface-variant">mín: {item.minStock}</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-dim rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all", 
                              item.status === 'out' ? 'w-0' : 
                              item.status === 'low' ? 'bg-error w-1/4' : 
                              'bg-primary w-2/3'
                            )}
                          ></div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-3">
                      <p className="text-[12px] font-bold text-on-surface">${(item.price || 0).toLocaleString('es-AR')}</p>
                      <p className="text-[10px] text-on-surface-variant">por {item.unit}</p>
                    </td>

                    <td className="px-6 py-3">
                      <p className="text-[12px] font-bold text-primary">${((item.stock || 0) * (item.price || 0)).toLocaleString('es-AR')}</p>
                    </td>

                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => handleOpenModal('details', item)}
                          title="Ver detalle y movimientos"
                          className="p-1.5 hover:bg-surface text-on-surface-variant hover:text-primary rounded-md transition-all cursor-pointer"
                        >
                          <ChevronRight size={16} />
                        </button>
                        <button 
                          onClick={() => setItemToDelete(item)}
                          title="Eliminar producto de la base de datos"
                          className="p-1.5 hover:bg-error-container/50 text-on-surface-variant hover:text-error rounded-md transition-all cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredInventory.length === 0 && (
              <div className="p-10 text-center text-on-surface-variant">
                <Package size={32} className="mx-auto mb-2 text-on-surface-variant/40" />
                <p className="text-xs font-bold uppercase tracking-wider">No hay productos en inventario</p>
                <p className="text-[11px] text-on-surface-variant/80 mt-1">Crea nuevos insumos con el botón "Nuevo Ítem" para comenzar a registrar tu stock.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Real Movements Audit History */}
      {activeTab === 'movements' && (
        <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="p-3 sm:px-6 sm:py-3 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input 
                type="text" 
                placeholder="Buscar por producto o motivo..." 
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 sm:py-1.5 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary text-[13px] outline-none" 
              />
            </div>
            <div className="flex gap-1.5 self-start sm:self-auto">
              <button 
                onClick={() => setMovementTypeFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer",
                  movementTypeFilter === 'all' ? "bg-primary text-white" : "bg-surface text-on-surface-variant hover:bg-outline-variant"
                )}
              >
                Todos ({globalMovements.length})
              </button>
              <button 
                onClick={() => setMovementTypeFilter('out')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer",
                  movementTypeFilter === 'out' ? "bg-error text-white" : "bg-error-container text-error hover:bg-error/10"
                )}
              >
                Salidas ({globalMovements.filter(m => m.type === 'out').length})
              </button>
              <button 
                onClick={() => setMovementTypeFilter('in')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer",
                  movementTypeFilter === 'in' ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                Entradas ({globalMovements.filter(m => m.type === 'in').length})
              </button>
            </div>
          </div>

          <div className="divide-y divide-surface">
            {filteredMovements.map((mov) => {
              const dateStr = mov.date?.toDate 
                ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(mov.date.toDate())
                : (mov.date ? String(mov.date) : 'Reciente...');

              return (
                <div key={mov.id} className="p-4 hover:bg-surface/40 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-lg shrink-0 mt-0.5",
                      mov.type === 'in' ? "bg-emerald-50 text-emerald-700" : "bg-error-container text-error"
                    )}>
                      {mov.type === 'in' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-on-surface">{mov.stockName}</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          mov.type === 'in' ? "bg-emerald-50 text-emerald-700" : "bg-error-container text-error"
                        )}>
                          {mov.type === 'in' ? 'Entrada / Ingreso' : 'Salida / Consumo'}
                        </span>
                      </div>
                      <p className="text-[12px] text-on-surface mt-0.5">{mov.reason || 'Sin motivo detallado'}</p>
                      <p className="text-[10px] text-on-surface-variant flex items-center gap-1 mt-1">
                        <Calendar size={11} /> {dateStr}
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right pl-11 sm:pl-0">
                    <span className={cn(
                      "text-base font-bold",
                      mov.type === 'in' ? "text-emerald-600" : "text-error"
                    )}>
                      {mov.type === 'in' ? '+' : '-'}{mov.quantity} {mov.stockUnit}
                    </span>
                    {mov.stockPrice > 0 && (
                      <p className="text-[10px] text-on-surface-variant font-medium">
                        ${(Number(mov.quantity) * mov.stockPrice).toLocaleString('es-AR')} valorizado
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredMovements.length === 0 && (
              <div className="p-12 text-center text-on-surface-variant">
                <History size={36} className="mx-auto mb-2 text-on-surface-variant/40" />
                <p className="text-xs font-bold uppercase tracking-wider">No se encontraron movimientos registrados</p>
                <p className="text-[11px] text-on-surface-variant/80 mt-1 max-w-md mx-auto">
                  Los movimientos se generan automáticamente al atender turnos, registrar evoluciones de pacientes, descontar paquetes o realizar ajustes manuales.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

              <div className="pt-4 space-y-2">
                <button onClick={() => setActiveModal(null)} className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest cursor-pointer">Cerrar</button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setItemToDelete(selectedItem);
                  }}
                  className="w-full py-2 px-3 rounded-lg border border-error/30 text-error hover:bg-error-container/40 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} /> Eliminar Producto de la Base de Datos
                </button>
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

      {/* Modal: Confirm Delete Stock Item */}
      <Modal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title="Eliminar Producto del Inventario"
      >
        <div className="space-y-4">
          <div className="p-4 bg-error-container/40 rounded-xl border border-error/20 flex items-start gap-3">
            <AlertTriangle className="text-error shrink-0 mt-0.5" size={20} />
            <div className="text-xs text-on-surface leading-relaxed">
              <p className="font-bold mb-1">¿Está seguro de eliminar "{itemToDelete?.name}"?</p>
              <p className="text-on-surface-variant">
                Esta acción borrará permanentemente este producto y sus movimientos históricos de la base de datos de la clínica.
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setItemToDelete(null)}
              className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors uppercase tracking-widest cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteItem}
              className="flex-1 px-4 py-2 bg-error text-white text-[12px] font-bold rounded-lg hover:bg-error/90 shadow-sm transition-colors uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
            >
              {isDeleting ? <RefreshCw className="animate-spin" size={14} /> : <Trash2 size={14} />}
              {isDeleting ? 'Eliminando...' : 'Eliminar Registro'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
