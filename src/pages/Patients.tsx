import { useState } from 'react';
import { Search, Plus, Filter, Download, MoreHorizontal, User, Phone, Mail, Calendar, Trash2, Edit2, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

const mockPatients = [
  { id: '1', name: 'Robert Fox', idNumber: '12.345.678', lastVisit: '2024-05-10', phone: '+1 234 567 890', email: 'robert@example.com', gender: 'Male', age: 34, status: 'active' },
  { id: '2', name: 'Jane Cooper', idNumber: '23.456.789', lastVisit: '2024-05-12', phone: '+1 234 567 891', email: 'jane@example.com', gender: 'Female', age: 28, status: 'active' },
  { id: '3', name: 'Wade Warren', idNumber: '34.567.890', lastVisit: '2024-04-28', phone: '+1 234 567 892', email: 'wade@example.com', gender: 'Male', age: 45, status: 'inactive' },
  { id: '4', name: 'Esther Howard', idNumber: '45.678.901', lastVisit: '2024-05-01', phone: '+1 234 567 893', email: 'esther@example.com', gender: 'Female', age: 31, status: 'active' },
];

export function Patients() {
  const [searchTerm, setSearchTerm] = useState('');

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
          <button className="px-4 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm">
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
              {mockPatients.map((patient) => (
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
                        <p className="text-[11px] text-on-surface-variant">{patient.gender}, {patient.age} años</p>
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
                      <button className="p-1.5 hover:bg-primary-container text-primary rounded transition-all" title="Historia Clínica">
                        <FileText size={14} />
                      </button>
                      <button className="p-1.5 hover:bg-surface-container-highest text-on-surface-variant rounded transition-all" title="Editar">
                        <Edit2 size={14} />
                      </button>
                      <button className="p-1.5 hover:bg-error-container text-error rounded transition-all" title="Eliminar">
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
          <p className="text-[11px] font-medium text-on-surface-variant">Mostrando <b>4</b> de <b>128</b> pacientes</p>
          <div className="flex items-center gap-1">
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant disabled:opacity-50" disabled>Ant.</button>
            <button className="px-2 py-1 bg-primary text-white rounded text-[10px] font-bold">1</button>
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant">2</button>
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant">Sig.</button>
          </div>
        </div>
      </div>
    </div>
  );
}
