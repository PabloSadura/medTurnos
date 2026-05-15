import { useState, useEffect } from 'react';
import { MessageSquare, CalendarClock, History, Settings, Send, CheckCircle2, AlertCircle, Clock, Info, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, getDoc, doc, setDoc, serverTimestamp, limit, addDoc } from 'firebase/firestore';

export function Reminders() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  
  const [settings, setSettings] = useState<any>({
    template: 'Hola {nombre}, te recordamos tu turno el {fecha} a las {hora}. ¡Te esperamos!',
    botEnabled: false,
    rules: [
      { label: '24h Antes (Recordatorio)', active: true },
      { label: '1h Antes (Alerta Final)', active: true },
      { label: 'Seguimiento (Post 2 días)', active: false },
      { label: 'Saludo Cumpleaños', active: true },
    ]
  });

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Fetch settings
    const unsubscribeSettings = onSnapshot(query(collection(db, 'reminder_settings'), where('userId', '==', userId), limit(1)), (snapshot) => {
      if (!snapshot.empty) {
        setSettings(snapshot.docs[0].data());
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reminder_settings'));

    // Sync patients for enrichment
    const unsubscribePatients = onSnapshot(query(collection(db, 'patients'), where('userId', '==', userId)), (snapshot) => {
      const pMap: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        pMap[doc.id] = doc.data();
      });
      setPatients(pMap);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    // Fetch upcoming appointments
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'appointments'),
      where('userId', '==', userId)
    );

    const unsubscribeApps = onSnapshot(q, (snapshot) => {
      const allApps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const nowTs = now.getTime();
      const tomorrowTs = tomorrow.getTime();
      
      const filtered = allApps.filter((app: any) => {
        const appTs = app.startTime?.seconds ? app.startTime.seconds * 1000 : new Date(app.date + 'T' + app.time).getTime();
        return appTs >= nowTs && appTs <= tomorrowTs;
      }).sort((a: any, b: any) => {
        const aTs = a.startTime?.seconds || new Date(a.date + 'T' + a.time).getTime() / 1000;
        const bTs = b.startTime?.seconds || new Date(b.date + 'T' + b.time).getTime() / 1000;
        return aTs - bTs;
      });

      setAppointments(filtered);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    return () => {
      unsubscribeSettings();
      unsubscribePatients();
      unsubscribeApps();
    };
  }, [auth.currentUser?.uid]);

  const reminders = appointments.map((app: any) => {
    const patientData = app.patientId ? patients[app.patientId] : null;
    const patientName = patientData?.name || app.patientName || 'Paciente Desconocido';
    const patientPhone = patientData?.phone || '';
    
    // Convert Firestore Timestamp to Date reliably
    let date: Date;
    if (app.startTime?.toDate) {
      date = app.startTime.toDate();
    } else if (app.startTime instanceof Date) {
      date = app.startTime;
    } else if (typeof app.startTime === 'string') {
      date = new Date(app.startTime);
    } else if (app.date && app.time) {
      date = new Date(`${app.date}T${app.time}`);
    } else {
      date = new Date();
    }

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isToday = date.toDateString() === new Date().toDateString();
    const dateStr = isToday ? 'Hoy' : 'Mañana';
    
    // Process template
    let message = settings.template || 'Hola {nombre}, te recordamos tu turno el {fecha} a las {hora} para su {tratamiento}. ¡Te esperamos!';
    message = message.replace(/{nombre}/g, patientName);
    message = message.replace(/{fecha}/g, dateStr);
    message = message.replace(/{hora}/g, timeStr);
    message = message.replace(/{tratamiento}/g, app.type || 'consulta');
    
    return {
      id: app.id,
      patient: patientName,
      phone: patientPhone,
      time: timeStr,
      date: dateStr,
      status: app.status || 'pendiente',
      message
    };
  });

  const handleSendWhatsApp = async (reminder: any) => {
    if (!reminder.phone) {
      alert('El paciente no tiene un número de teléfono registrado.');
      return;
    }

    if (settings.botEnabled) {
      // Auto-send via Meta API
      setSendingId(reminder.id);
      try {
        const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: reminder.phone,
            message: reminder.message
          })
        });

        const result = await response.json();
        
        // Log the message attempt
        await addDoc(collection(db, 'whatsapp_logs'), {
          to: reminder.phone,
          patientName: reminder.patient,
          message: reminder.message,
          status: response.ok ? 'success' : 'error',
          error: response.ok ? null : (result.error || 'Unknown error'),
          userId: auth.currentUser?.uid,
          createdAt: serverTimestamp()
        });

        if (!response.ok) throw new Error(result.error || 'Failed to send message');
        
        alert('Mensaje enviado exitosamente vía Meta API');
      } catch (error: any) {
        console.error(error);
        alert(`Error al enviar mensaje: ${error.message}. Asegúrate de que las credenciales de Meta estén configuradas.`);
      } finally {
        setSendingId(null);
      }
    } else {
      // Manual send via wa.me link
      const cleanPhone = reminder.phone.replace(/\D/g, '');
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminder.message)}`;
      
      // Log manual send
      await addDoc(collection(db, 'whatsapp_logs'), {
        to: reminder.phone,
        patientName: reminder.patient,
        message: reminder.message,
        status: 'success',
        userId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        method: 'manual'
      });

      window.open(url, '_blank');
    }
  };

  const handleSaveSettings = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(db, 'reminder_settings', userId), {
        ...settings,
        userId,
        updatedAt: serverTimestamp()
      });
      setIsSettingsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reminder_settings');
    }
  };

  const toggleRule = (index: number) => {
    const newRules = [...settings.rules];
    newRules[index].active = !newRules[index].active;
    setSettings({ ...settings, rules: newRules });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Recordatorios de WhatsApp</h1>
          <p className="body-md text-on-surface-variant">Configure y envíe recordatorios automáticos a sus pacientes.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 bg-white border border-outline-variant text-[11px] font-bold text-on-surface-variant rounded-md flex items-center gap-2 hover:bg-surface transition-all uppercase tracking-wider"
          >
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
                      disabled={sendingId === msg.id}
                      className={cn(
                        "ml-3 p-2 text-white rounded-lg transition-all hover:scale-105 active:scale-95 shadow-sm",
                        sendingId === msg.id ? "bg-primary-container text-primary opacity-50" : "bg-[#25D366] opacity-100 md:opacity-0 group-hover:opacity-100 group-hover/btn:opacity-100"
                      )}
                      title={settings.botEnabled ? "Enviar vía Meta API" : "Enviar WhatsApp Manual"}
                    >
                      {sendingId === msg.id ? <Clock size={14} className="animate-spin" /> : <Send size={14} />}
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
              <MessageSquare className={cn(settings.botEnabled ? "text-primary" : "text-on-surface-variant")} size={18} />
              <h3 className="text-sm font-bold text-on-surface">Bot de WhatsApp</h3>
              <div className="ml-auto flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", settings.botEnabled ? "bg-primary animate-pulse" : "bg-on-surface-variant/30")}></div>
                <span className={cn("text-[10px] font-black", settings.botEnabled ? "text-primary" : "text-on-surface-variant/50")}>
                  {settings.botEnabled ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
            </div>
            <div className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  <span>Límite Diario</span>
                  <span>{settings.botEnabled ? '0 / 1,000' : 'Desactivado'}</span>
                </div>
                <div className="w-full h-1 bg-primary/10 rounded-full overflow-hidden">
                  <div className={cn("h-full bg-primary rounded-full", settings.botEnabled ? "w-[0%]" : "w-0")}></div>
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant/70 leading-relaxed">
                {settings.botEnabled 
                  ? "El bot está sincronizado y enviando recordatorios automáticamente usando Meta API." 
                  : "Active el bot en configuración para envíos automáticos."}
              </p>
              <button 
                onClick={() => setSettings({ ...settings, botEnabled: !settings.botEnabled })}
                className={cn(
                  "w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  settings.botEnabled ? "bg-white border border-primary text-primary" : "bg-primary text-white"
                )}
              >
                {settings.botEnabled ? "Desactivar Bot" : "Activar Bot"}
              </button>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-on-surface">Reglas de Envío</h3>
            <div className="space-y-3">
              {settings.rules.map((rule: any, idx: number) => (
                <div key={rule.label} className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-on-surface-variant">{rule.label}</span>
                  <div 
                    onClick={() => toggleRule(idx)}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-colors cursor-pointer",
                      rule.active ? "bg-primary" : "bg-surface-dim"
                    )}
                  >
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

      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Configuración de Recordatorios"
        className="max-w-md"
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-surface-bright rounded-xl border border-outline-variant">
              <div>
                <h4 className="text-sm font-bold text-on-surface">Meta WhatsApp API</h4>
                <p className="text-[11px] text-on-surface-variant">Envío automático (Bot)</p>
              </div>
              <button 
                onClick={() => setSettings({ ...settings, botEnabled: !settings.botEnabled })}
                className="text-primary"
              >
                {settings.botEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-on-surface-variant/30" />}
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest pl-1">Mensaje Predeterminado</label>
                <div className="group relative">
                  <Info size={12} className="text-primary cursor-help" />
                  <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-on-surface text-surface text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl pointer-events-none">
                    Variables disponibles:<br/>
                    <b>{`{nombre}`}</b>, <b>{`{fecha}`}</b>, <b>{`{hora}`}</b>, <b>{`{tratamiento}`}</b>
                  </div>
                </div>
              </div>
              <textarea 
                rows={4}
                value={settings.template}
                onChange={(e) => setSettings({ ...settings, template: e.target.value })}
                className="w-full px-4 py-3 bg-white border border-outline-variant rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                placeholder="Hola {nombre}, te recordamos..."
              />
              <div className="flex gap-1 flex-wrap">
                {['{nombre}', '{fecha}', '{hora}', '{tratamiento}'].map(v => (
                  <button 
                    key={v}
                    onClick={() => setSettings({ ...settings, template: settings.template + ' ' + v })}
                    className="px-2 py-0.5 bg-surface text-[9px] font-bold rounded border border-outline-variant hover:border-primary"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
            <div className="flex items-center gap-2 mb-2 text-primary">
              <AlertCircle size={14} />
              <h5 className="text-[11px] font-bold uppercase tracking-wider">Nota de Integración</h5>
            </div>
            <p className="text-[10px] text-on-surface-variant/80 leading-relaxed">
              La integración con Meta API requiere configurar el Access Token y Phone ID en el panel de administrador. Los mensajes se envían de forma segura a través de nuestros servidores.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="flex-1 px-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-[12px] font-bold hover:bg-outline-variant transition-colors uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveSettings}
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-[12px] font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              <Save size={14} />
              Guardar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
