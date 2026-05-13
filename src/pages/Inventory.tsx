import { useState } from 'react';
import { Package, Plus, Search, AlertCircle, TrendingDown, RefreshCw, BarChart3, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

const mockInventory = [
  { id: '1', name: 'Dental Resin A2', sku: 'DR-A2-001', stock: 12, minStock: 5, unit: 'pcs', category: 'Supplies', status: 'normal' },
  { id: '2', name: 'Latex Gloves (S)', sku: 'LG-S-042', stock: 3, minStock: 10, unit: 'boxes', category: 'Disposable', status: 'low' },
  { id: '3', name: 'Surgical Masks', sku: 'SM-001', stock: 0, minStock: 8, unit: 'boxes', category: 'Disposable', status: 'out' },
  { id: '4', name: 'Anesthetic Carpules', sku: 'AC-L-012', stock: 45, minStock: 20, unit: 'pcs', category: 'Medicine', status: 'normal' },
];

export function Inventory() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Inventario de Clínica</h1>
          <p className="body-md text-on-surface-variant">Seguimiento de niveles de stock, consumo de materiales y alertas de reposición.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-white border border-outline-variant rounded-md text-[11px] font-bold flex items-center gap-2 hover:bg-surface transition-all text-on-surface-variant uppercase tracking-wider">
            <RefreshCw size={14} />
            AJUSTAR STOCK
          </button>
          <button className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider">
            <Plus size={16} />
            NUEVO ÍTEM
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Ítems', value: '1,204', icon: Package, color: 'bg-primary-container text-primary' },
          { label: 'Stock Bajo', value: '14', icon: AlertCircle, color: 'bg-error-container text-error' },
          { label: 'Consumo', value: '+12%', icon: TrendingDown, color: 'bg-tertiary-container text-on-tertiary-container' },
          { label: 'Costo Mensual', value: '$2.4k', icon: BarChart3, color: 'bg-secondary-container text-secondary' },
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
              className="w-full pl-9 pr-4 py-1.5 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary text-[13px] outline-none" 
            />
          </div>
          <div className="flex gap-1">
            <button className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-surface text-on-surface-variant hover:bg-outline-variant transition-all">Todos</button>
            <button className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-error-container text-error hover:bg-error/10 transition-all">Stock Bajo</button>
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
              {mockInventory.map((item) => (
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
                    <button className="p-1.5 hover:bg-surface text-on-surface-variant rounded-md transition-all">
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
