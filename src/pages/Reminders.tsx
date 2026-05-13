import { MessageSquare, CalendarClock, History, Settings, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

const notifications = [
  { id: 1, type: 'WhatsApp', patient: 'Theresa Webb', time: '10:00 AM', status: 'Sent', date: 'Upcoming', message: 'Hi Theresa! Remember your appointment today...' },
  { id: 2, type: 'WhatsApp', patient: 'Courtney Henry', time: '11:45 AM', status: 'Pending', date: 'Upcoming', message: 'Hello Courtney, your consultation starts in 1 hour.' },
  { id: 3, type: 'WhatsApp', patient: 'Eleanor Pena', time: 'Yesterday', status: 'Delivered', date: 'Past', message: 'Thanks for visiting us yesterday! How are you feeling?' },
];

export function Reminders() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Recordatorios Automáticos</h1>
          <p className="body-md text-on-surface-variant">Configure y monitoree las notificaciones de WhatsApp y Email para pacientes.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-white border border-outline-variant text-[11px] font-bold text-on-surface-variant rounded-md flex items-center gap-2 hover:bg-surface transition-all uppercase tracking-wider">
            <Settings size={14} />
            Configurar Bot
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
              <h3 className="text-sm font-bold text-on-surface">Cola de Mensajes Activa</h3>
              <span className="text-[10px] font-bold bg-primary-container text-primary px-2 py-0.5 rounded uppercase">12 Pendientes</span>
            </div>
            
            <div className="divide-y divide-surface">
              {notifications.map((msg) => (
                <div key={msg.id} className="p-4 hover:bg-surface/50 transition-colors group cursor-pointer">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#25D366]/10 text-[#25D366] rounded-full flex items-center justify-center">
                        <MessageSquare size={14} />
                      </div>
                      <div>
                        <h4 className="text-[13px] font-bold text-on-surface">{msg.patient}</h4>
                        <p className="text-[10px] uppercase font-bold text-on-surface-variant opacity-60">{msg.date} • {msg.time}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1 text-[10px] font-black uppercase tracking-wider",
                      msg.status === 'Sent' ? 'text-primary' : msg.status === 'Pending' ? 'text-on-surface-variant/40' : 'text-tertiary'
                    )}>
                      {msg.status === 'Sent' && <CheckCircle2 size={12} />}
                      {msg.status === 'Pending' && <Clock size={12} />}
                      {msg.status === 'Delivered' && <CheckCircle2 size={12} className="text-tertiary" />}
                      {msg.status}
                    </div>
                  </div>
                  <p className="text-[12px] text-on-surface-variant italic bg-surface-bright px-3 py-2 rounded-lg border border-surface">"{msg.message}"</p>
                </div>
              ))}
            </div>
            <button className="w-full py-2 bg-white text-[11px] text-primary hover:bg-surface transition-all uppercase font-bold border-t border-outline-variant tracking-widest">
              Ver Historial Completo
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-primary/20 bg-primary/5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <MessageSquare className="text-primary" size={18} />
              <h3 className="text-sm font-bold text-on-surface">Bot de WhatsApp</h3>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <span className="text-[10px] font-black text-primary">ACTIVO</span>
              </div>
            </div>
            <div className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  <span>Límite Diario</span>
                  <span>458 / 5,000</span>
                </div>
                <div className="w-full h-1 bg-primary/10 rounded-full overflow-hidden">
                  <div className="w-[10%] h-full bg-primary rounded-full"></div>
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant/70 leading-relaxed">El bot está sincronizado y enviando recordatorios automáticamente.</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-on-surface">Reglas de Envío</h3>
            <div className="space-y-3">
              {[
                { label: '24h Antes (Recordatorio)', active: true },
                { label: '1h Antes (Alerta Final)', active: true },
                { label: 'Seguimiento (Post 2 días)', active: false },
                { label: 'Saludo Cumpleaños', active: true },
              ].map((rule) => (
                <div key={rule.label} className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-on-surface-variant">{rule.label}</span>
                  <div className={cn(
                    "w-8 h-4 rounded-full relative transition-colors cursor-pointer",
                    rule.active ? "bg-primary" : "bg-surface-dim"
                  )}>
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                      rule.active ? "right-0.5" : "left-0.5"
                    )}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
