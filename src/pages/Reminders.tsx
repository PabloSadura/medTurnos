import { useState, useEffect } from 'react';
import { MessageSquare, CalendarClock, History, Settings, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, getDoc, doc } from 'firebase/firestore';

export function Reminders() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch upcoming appointments for today and tomorrow
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'appointments'),
      where('startTime', '>=', now),
      where('startTime', '<=', tomorrow),
      orderBy('startTime', 'asc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Enrich with patient data
      const enriched = await Promise.all(appointments.map(async (app: any) => {
        let patientName = 'Unknown Patient';
        let patientPhone = '';
        if (app.patientId) {
          const pDoc = await getDoc(doc(db, 'patients', app.patientId));
          if (pDoc.exists()) {
            const pData = pDoc.data();
            patientName = pData.name;
            patientPhone = pData.phone;
          }
        }
        
        const date = app.startTime?.toDate() || new Date();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow';
        
        const message = `Hola ${patientName}, te recordamos tu turno el ${dateStr} a las ${timeStr}. ¡Te esperamos!`;
        
        return {
          id: app.id,
          patient: patientName,
          phone: patientPhone,
          time: timeStr,
          date: dateStr,
          status: app.status || 'Pending',
          message
        };
      }));

      setReminders(enriched);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    return () => unsubscribe();
  }, []);

  const handleSendWhatsApp = (reminder: any) => {
    if (!reminder.phone) {
      alert('El paciente no tiene un número de teléfono registrado.');
      return;
    }
    // Clean phone number (remove +, spaces, etc)
    const cleanPhone = reminder.phone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminder.message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Recordatorios de WhatsApp</h1>
          <p className="body-md text-on-surface-variant">Monitoree y envíe recordatorios manuales a sus pacientes.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-white border border-outline-variant text-[11px] font-bold text-on-surface-variant rounded-md flex items-center gap-2 hover:bg-surface transition-all uppercase tracking-wider">
            <Settings size={14} />
            Configuración
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
              <h3 className="text-sm font-bold text-on-surface">Cola de Recordatorios</h3>
              <span className="text-[10px] font-bold bg-primary-container text-primary px-2 py-0.5 rounded uppercase">{reminders.length} Pendientes</span>
            </div>
            
            <div className="divide-y divide-surface">
              {reminders.map((msg) => (
                <div key={msg.id} className="p-4 hover:bg-surface/50 transition-colors group">
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
                      msg.status === 'confirmed' ? 'text-primary' : 'text-on-surface-variant/40'
                    )}>
                      {msg.status === 'confirmed' && <CheckCircle2 size={12} />}
                      {msg.status === 'pending' && <Clock size={12} />}
                      {msg.status}
                    </div>
                  </div>
                  <div className="flex justify-between items-center group/btn">
                    <p className="text-[12px] text-on-surface-variant italic bg-surface-bright px-3 py-2 rounded-lg border border-surface flex-1">"{msg.message}"</p>
                    <button 
                      onClick={() => handleSendWhatsApp(msg)}
                      className="ml-3 p-2 bg-[#25D366] text-white rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 group-hover/btn:opacity-100 transition-all hover:scale-105 active:scale-95 shadow-sm"
                      title="Enviar WhatsApp"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {reminders.length === 0 && !loading && (
                <div className="p-12 text-center text-on-surface-variant">
                  <CalendarClock size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest opacity-40">No hay recordatorios próximos</p>
                </div>
              )}
            </div>
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
