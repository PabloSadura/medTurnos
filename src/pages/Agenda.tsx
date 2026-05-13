import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Plus, Filter, User, MoreVertical } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8:00 to 18:00
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const mockAppointments = [
  { id: 1, name: 'Robert Fox', type: 'Check-up', time: '09:00', duration: 30, status: 'confirmed', day: 'Monday' },
  { id: 2, name: 'Jenny Wilson', type: 'Root Canal', time: '11:30', duration: 60, status: 'in-session', day: 'Monday' },
  { id: 3, name: 'Guy Hawkins', type: 'Cleaning', time: '14:00', duration: 45, status: 'finished', day: 'Monday' },
];

export function Agenda() {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Agenda & Calendar</h1>
          <p className="body-md text-on-surface-variant">Manage your medical schedule and patient bookings.</p>
        </div>
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
              { label: 'Emergency', color: 'bg-error' },
              { label: 'Consultation', color: 'bg-tertiary' },
              { label: 'Follow-up', color: 'bg-secondary' },
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
              <h2 className="text-sm font-bold text-on-surface">Monday, May 13th 2024</h2>
            </div>
            <div className="flex gap-1">
              <button className="p-1.5 hover:bg-surface rounded text-on-surface-variant"><Filter size={16} /></button>
              <button className="p-1.5 hover:bg-surface rounded text-on-surface-variant"><MoreVertical size={16} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
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
              
              {/* Add current time indicator */}
              <div 
                className="absolute left-[60px] right-0 h-px bg-error z-20 pointer-events-none before:content-[''] before:absolute before:-left-1 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:bg-error before:rounded-full"
                style={{ top: '42%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
