import { useState } from 'react';
import { Search, Plus, Filter, Download, MoreHorizontal, User, Phone, Mail, Calendar, Trash2, Edit2, FileText, CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Modal } from '../components/Modal';

const mockPatients = [
  { id: '1', name: 'Robert Fox', idNumber: '12.345.678', lastVisit: '2024-05-10', phone: '+1 234 567 890', email: 'robert@example.com', gender: 'Male', age: 34, status: 'active' },
  { id: '2', name: 'Jane Cooper', idNumber: '23.456.789', lastVisit: '2024-05-12', phone: '+1 234 567 891', email: 'jane@example.com', gender: 'Female', age: 28, status: 'active' },
  { id: '3', name: 'Wade Warren', idNumber: '34.567.890', lastVisit: '2024-04-28', phone: '+1 234 567 892', email: 'wade@example.com', gender: 'Male', age: 45, status: 'inactive' },
  { id: '4', name: 'Esther Howard', idNumber: '45.678.901', lastVisit: '2024-05-01', phone: '+1 234 567 893', email: 'esther@example.com', gender: 'Female', age: 31, status: 'active' },
];

export function Patients() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | 'delete' | 'history' | 'add-entry' | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isAddingEntry, setIsAddingEntry] = useState(false);

  const handleOpenModal = (type: 'create' | 'edit' | 'delete' | 'history' | 'add-entry', patient?: any) => {
    setSelectedPatient(patient || null);
    setActiveModal(type === 'add-entry' ? 'history' : type);
    if (type === 'add-entry') setIsAddingEntry(true);
    if (type === 'history') setIsAddingEntry(false);
  };

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
          <p className="text-[11px] font-medium text-on-surface-variant">Mostrando <b>4</b> de <b>128</b> pacientes</p>
          <div className="flex items-center gap-1">
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant disabled:opacity-50" disabled>Ant.</button>
            <button className="px-2 py-1 bg-primary text-white rounded text-[10px] font-bold">1</button>
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant">2</button>
            <button className="px-2 py-1 bg-white border border-outline-variant rounded text-[10px] font-medium text-on-surface-variant">Sig.</button>
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
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setActiveModal(null); }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre Completo</label>
              <input type="text" defaultValue={selectedPatient?.name} className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" placeholder="Ej: Juan Pérez" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">DNI / Identificación</label>
              <input type="text" defaultValue={selectedPatient?.idNumber} className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" placeholder="Ej: 12.345.678" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Teléfono</label>
              <input type="tel" defaultValue={selectedPatient?.phone} className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" placeholder="+1 234 567 890" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Email</label>
              <input type="email" defaultValue={selectedPatient?.email} className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" placeholder="juan@example.com" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Género</label>
              <select className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" defaultValue={selectedPatient?.gender || 'Male'}>
                <option value="Male">Masculino</option>
                <option value="Female">Femenino</option>
                <option value="Other">Otro</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Edad</label>
              <input type="number" defaultValue={selectedPatient?.age} className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Estado</label>
              <select className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary" defaultValue={selectedPatient?.status || 'active'}>
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
          <p className="text-on-surface">¿Está seguro de que desea eliminar al paciente <b>{selectedPatient?.name}</b>? Esta acción no se puede deshacer.</p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 bg-surface border border-outline-variant rounded-lg text-[12px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest">Cancelar</button>
            <button onClick={() => setActiveModal(null)} className="flex-1 px-4 py-2 bg-error text-white rounded-lg text-[12px] font-bold hover:bg-error/90 transition-colors uppercase tracking-widest">Eliminar</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === 'history'}
        onClose={() => setActiveModal(null)}
        title={`Detalles del Paciente: ${selectedPatient?.name}`}
        className="max-w-2xl"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-surface-bright rounded-xl border border-outline-variant">
            <div className="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center text-lg font-bold">
              {selectedPatient?.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-on-surface">{selectedPatient?.name}</h4>
              <p className="text-[11px] text-on-surface-variant tracking-wide uppercase font-bold">{selectedPatient?.idNumber} • {selectedPatient?.gender} • {selectedPatient?.age} años</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                selectedPatient?.status === 'active' ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-dim text-on-surface-variant"
              )}>
                {selectedPatient?.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
              </span>
            </div>
          </div>

          {/* Attendance KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
              <CheckCircle2 size={16} className="text-primary mb-1" />
              <span className="text-[18px] font-bold text-on-surface">92%</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Asistencia</span>
            </div>
            <div className="p-3 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
              <AlertTriangle size={16} className="text-error mb-1" />
              <span className="text-[18px] font-bold text-on-surface">2</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Inasistencias</span>
            </div>
            <div className="p-3 bg-surface rounded-xl border border-outline-variant flex flex-col items-center">
              <Calendar size={16} className="text-secondary mb-1" />
              <span className="text-[18px] font-bold text-on-surface">3d</span>
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Última Visita</span>
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
                    <select className="w-full px-2 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] outline-none">
                      <option>Check-up</option>
                      <option>Limpieza</option>
                      <option>Consulta General</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase">Doctor</label>
                    <input type="text" className="w-full px-2 py-1.5 bg-white border border-outline-variant rounded-md text-[12px]" defaultValue="Dr. Smith" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase">Evolución / Notas</label>
                  <textarea rows={3} className="w-full px-2 py-1.5 bg-white border border-outline-variant rounded-md text-[12px] resize-none" placeholder="Describa el procedimiento..." />
                </div>
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => setIsAddingEntry(false)}
                    className="px-3 py-1 text-[11px] font-bold text-on-surface-variant uppercase"
                  >
                    Cancelar
                  </button>
                  <button className="px-3 py-1 bg-primary text-white text-[11px] font-bold rounded shadow-sm uppercase">
                    Guardar Entrada
                  </button>
                </div>
              </motion.div>
            )}
            
            <div className="space-y-3">
              {[
                { date: '2024-05-10', doctor: 'Dr. Smith', note: 'Paciente presenta mejoría en tratamiento de encías. Se recomienda continuar con higiene rigurosa.', treatment: 'Check-up', status: 'Completed' },
                { date: '2024-04-15', doctor: 'Dr. Wilson', note: 'Extracción de molar realizada sin complicaciones. Post-operatorio normal.', treatment: 'Surgery', status: 'Completed' },
              ].map((entry, idx) => (
                <div key={idx} className="p-3 bg-white border border-outline-variant rounded-lg space-y-2 relative overflow-hidden group hover:border-primary/50 transition-colors">
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
