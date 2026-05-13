import { useState } from 'react';
import { Stethoscope, Plus, Search, DollarSign, Clock, ChevronRight, Package, Edit3, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

const mockTreatments = [
  { id: '1', name: 'Dental Cleaning', cost: 120, duration: 45, category: 'General', stockLinked: 3 },
  { id: '2', name: 'Teeth Whitening', cost: 350, duration: 60, category: 'Cosmetic', stockLinked: 5 },
  { id: '3', name: 'Root Canal', cost: 800, duration: 90, category: 'Specialized', stockLinked: 12 },
  { id: '4', name: 'Filling Replacement', cost: 150, duration: 30, category: 'General', stockLinked: 4 },
];

export function Treatments() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Tratamientos y Servicios</h1>
          <p className="body-md text-on-surface-variant">Gestione procedimientos clínicos, precios y materiales asociados del inventario.</p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider">
          <Plus size={16} />
          Nuevo Tratamiento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockTreatments.map((treatment) => (
          <div key={treatment.id} className="bg-white border border-outline-variant rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden group flex flex-col">
            <div className="p-4 flex-1">
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 bg-primary-container text-primary rounded-lg">
                  <Stethoscope size={18} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1 hover:bg-surface rounded text-on-surface-variant"><Edit3 size={14} /></button>
                  <button className="p-1 hover:bg-error-container text-error rounded"><Trash2 size={14} /></button>
                </div>
              </div>
              
              <h3 className="text-[14px] font-bold text-on-surface mb-1">{treatment.name}</h3>
              <p className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant mb-4">{treatment.category}</p>
              
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

            <div className="border-t border-outline-variant bg-surface-bright px-4 py-2.5 flex justify-between items-center mt-auto">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <Package size={12} />
                <span className="text-[10px] font-bold uppercase tracking-tight">{treatment.stockLinked} Insumos</span>
              </div>
              <ChevronRight size={14} className="text-on-surface-variant group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
        
        <button className="border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center p-6 text-on-surface-variant hover:border-primary hover:text-primary transition-all bg-surface/30 min-h-[160px]">
          <Plus size={24} className="mb-2 opacity-50" />
          <span className="text-[11px] uppercase font-bold tracking-widest">Añadir Categoría</span>
        </button>
      </div>
    </div>
  );
}
