import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Plus, Filter, User, MoreVertical, Search, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';

const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8:00 to 18:00
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const mockAppointments = [
  { id: 1, name: 'Robert Fox', type: 'Check-up', time: '09:00', duration: 30, status: 'confirmed', day: 'Monday' },
  { id: 2, name: 'Jenny Wilson', type: 'Root Canal', time: '11:30', duration: 60, status: 'in-session', day: 'Monday' },
  { id: 3, name: 'Guy Hawkins', type: 'Cleaning', time: '14:00', duration: 45, status: 'finished', day: 'Monday' },
];

export function Agenda() {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Agenda & Calendario</h1>
          <p className="body-md text-on-surface-variant">Gestione sus horarios y reservas de pacientes.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-outline-variant shadow-sm">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-4 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest transition-all",
                  view === v ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface"
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsNewAppointmentOpen(true)}
            className="px-4 py-2 bg-primary text-white rounded-lg text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-sm uppercase tracking-wider"
          >
            <Plus size={16} />
            Nuevo Turno
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm h-fit">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-on-surface">Calendario</h3>
            <div className="flex gap-1">
              <button className="p-1 hover:bg-surface rounded border border-outline-variant text-on-surface-variant"><ChevronLeft size={14} /></button>
              <button className="p-1 hover:bg-surface rounded border border-outline-variant text-on-surface-variant"><ChevronRight size={14} /></button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i} className="text-[10px] text-on-surface-variant py-1 font-bold">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                className={cn(
                  "p-1.5 rounded text-[11px] font-medium transition-all",
                  d === 13 ? "bg-primary text-white font-bold shadow-sm" : "text-on-surface hover:bg-surface"
                )}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-surface space-y-3">
            <h4 className="text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Filtros</h4>
            {[
              { label: 'Check-up', color: 'bg-primary' },
              { label: 'Emergencia', color: 'bg-error' },
              { label: 'Consulta', color: 'bg-tertiary' },
              { label: 'Seguimiento', color: 'bg-secondary' },
            ].map((f) => (
              <label key={f.label} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" defaultChecked className="w-3 h-3 rounded border-outline-variant text-primary focus:ring-primary" />
                <div className={cn("w-2 h-2 rounded-full", f.color)}></div>
                <span className="text-[12px] text-on-surface-variant group-hover:text-primary transition-colors">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col h-[700px]">
          <div className="bg-surface-bright px-6 py-3 border-b border-outline-variant flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-on-surface">
                {view === 'day' ? 'Lunes, 13 de Mayo 2024' : view === 'week' ? 'Semana del 13 Mayo - 19 Mayo' : 'Mayo 2024'}
              </h2>
            </div>
            <div className="flex gap-1">
              <button className="p-1.5 hover:bg-surface rounded text-on-surface-variant"><Filter size={16} /></button>
              <button className="p-1.5 hover:bg-surface rounded text-on-surface-variant"><MoreVertical size={16} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {view === 'day' ? (
              <div className="grid grid-cols-[60px_1fr] min-h-full">
                {hours.map((hour) => (
                  <div key={hour} className="contents">
                    <div className="py-8 px-2 text-right border-r border-outline-variant bg-surface-bright">
                      <span className="text-[10px] font-bold text-on-surface-variant">{hour}:00</span>
                    </div>
                    <div className="relative border-b border-surface p-1 min-h-[100px] hover:bg-surface/30 transition-colors">
                      {mockAppointments.filter(a => parseInt(a.time.split(':')[0]) === hour).map((apt) => (
                        <motion.div
                          key={apt.id}
                          layoutId={`apt-${apt.id}`}
                          className={cn(
                            "absolute inset-x-2 p-2 rounded border-l-2 shadow-sm cursor-pointer group hover:shadow-md transition-all z-10",
                            apt.status === 'confirmed' ? "bg-primary-container/40 border-primary text-primary" : 
                            apt.status === 'in-session' ? "bg-tertiary-container/40 border-tertiary text-tertiary" : 
                            "bg-surface border-outline-variant text-on-surface-variant opacity-80"
                          )}
                          style={{
                            top: `${(parseInt(apt.time.split(':')[1]) / 60) * 100}%`,
                            height: `${(apt.duration / 60) * 100}px`
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold truncate">{apt.name}</p>
                              <p className="text-[9px] uppercase font-bold opacity-80 mt-0.5">{apt.type} • {apt.duration}m</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
                <div 
                  className="absolute left-[60px] right-0 h-px bg-error z-20 pointer-events-none before:content-[''] before:absolute before:-left-1 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:bg-error before:rounded-full"
                  style={{ top: '42%' }}
                />
              </div>
            ) : view === 'week' ? (
              <div className="grid grid-cols-[60px_repeat(7,1fr)] min-h-full">
                <div className="bg-surface-bright border-r border-outline-variant"></div>
                {days.map((day) => (
                  <div key={day} className="bg-surface-bright border-b border-r border-outline-variant py-2 px-1 text-center">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">{day}</span>
                  </div>
                ))}
                {hours.map((hour) => (
                  <div key={hour} className="contents">
                    <div className="py-4 px-1 text-right border-r border-outline-variant bg-surface-bright">
                      <span className="text-[10px] font-bold text-on-surface-variant">{hour}:00</span>
                    </div>
                    {days.map((day) => (
                      <div key={`${day}-${hour}`} className="border-b border-r border-surface min-h-[60px] hover:bg-surface/30 transition-colors">
                        {mockAppointments.filter(a => a.day === day && parseInt(a.time.split(':')[0]) === hour).map((apt) => (
                          <div key={apt.id} className="m-0.5 p-1 rounded bg-primary-container/40 border-l-2 border-primary text-[10px] font-bold text-primary truncate">
                            {apt.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 grid-rows-5 h-full">
                {days.map((day) => (
                  <div key={day} className="bg-surface-bright border-b border-r border-outline-variant py-2 text-center uppercase text-[10px] font-bold text-on-surface-variant">
                    {day.substring(0, 3)}
                  </div>
                ))}
                {Array.from({ length: 35 }, (_, i) => i - 3).map((d, i) => (
                  <div key={i} className="border-b border-r border-surface p-2 hover:bg-surface transition-colors">
                    <span className={cn(
                      "text-[11px] font-bold",
                      d > 0 && d <= 31 ? "text-on-surface" : "text-on-surface-variant opacity-30"
                    )}>
                      {d > 0 && d <= 31 ? d : d <= 0 ? 30 + d : d - 31}
                    </span>
                    {d === 13 && (
                      <div className="mt-1 space-y-1">
                        <div className="p-1 rounded bg-primary-container text-primary text-[9px] font-bold truncate">3 Turnos</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isNewAppointmentOpen} 
        onClose={() => setIsNewAppointmentOpen(false)} 
        title="Agendar Nuevo Turno"
      >
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setIsNewAppointmentOpen(false); }}>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Paciente</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input 
                type="text" 
                placeholder="Buscar paciente..."
                className="w-full pl-9 pr-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]"
                defaultValue="2024-05-13"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Hora</label>
              <input 
                type="time" 
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]"
                defaultValue="09:00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Tratamiento</label>
            <select className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px]">
              <option>Check-up General</option>
              <option>Limpieza Dental</option>
              <option>Tratamiento de Conducto</option>
              <option>Ortodoncia</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Notas</label>
            <textarea 
              rows={3}
              placeholder="Agregar observaciones..."
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary outline-none text-[13px] resize-none"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={() => setIsNewAppointmentOpen(false)}
              className="flex-1 px-4 py-2 border border-outline-variant text-[12px] font-bold rounded-lg hover:bg-surface transition-colors"
            >
              CANCELAR
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90 shadow-sm transition-colors"
            >
              GUARDAR TURNO
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
