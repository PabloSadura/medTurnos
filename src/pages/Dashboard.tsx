import { useState, useEffect } from 'react';
import { TrendingUp, Users, CalendarCheck, CreditCard, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';

export function Dashboard() {
  const [stats, setStats] = useState([
    { label: 'Pacientes Totales', value: '0', trend: '+0%', icon: Users, color: 'bg-secondary-container text-secondary' },
    { label: 'Turnos Hoy', value: '0', trend: '+0%', icon: CalendarCheck, color: 'bg-tertiary-container text-tertiary' },
    { label: 'Tratamientos', value: '0', trend: '+0%', icon: CreditCard, color: 'bg-primary-container text-primary' },
    { label: 'Tiempo Promedio', value: '30m', trend: '+0%', icon: Clock, color: 'bg-error-container text-error' },
  ]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Patients count
    const unsubscribePatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
      setStats(prev => {
        const next = [...prev];
        next[0].value = snapshot.size.toString();
        return next;
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    // Today's appointments
    const today = new Date().toISOString().split('T')[0];
    const qToday = query(collection(db, 'appointments'), where('date', '==', today));
    const unsubscribeToday = onSnapshot(qToday, (snapshot) => {
      setStats(prev => {
        const next = [...prev];
        next[1].value = snapshot.size.toString();
        return next;
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    // Treatments count
    const unsubscribeTreatments = onSnapshot(collection(db, 'treatments'), (snapshot) => {
      setStats(prev => {
        const next = [...prev];
        next[2].value = snapshot.size.toString();
        return next;
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treatments'));

    // Upcoming appointments
    const now = new Date();
    const qUpcoming = query(
      collection(db, 'appointments'),
      where('startTime', '>=', now),
      orderBy('startTime', 'asc'),
      limit(6)
    );
    const unsubscribeUpcoming = onSnapshot(qUpcoming, (snapshot) => {
      setUpcomingAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    return () => {
      unsubscribePatients();
      unsubscribeToday();
      unsubscribeTreatments();
      unsubscribeUpcoming();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="headline-lg text-on-surface">Panel de Control</h1>
        <p className="body-md text-on-surface-variant">Monitoreo del rendimiento de la clínica y actividad de los pacientes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-4 rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex justify-between items-center mb-3">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant group-hover:text-primary transition-colors">{stat.label}</p>
              <div className={`flex items-center gap-1 text-[11px] font-bold ${stat.trend.startsWith('+') ? 'text-primary' : 'text-error'}`}>
                {stat.trend}
                {stat.trend.startsWith('+') ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              </div>
            </div>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-bold text-on-surface tracking-tighter">{stat.value}</h3>
              <div className={cn("p-2 rounded-lg", stat.color)}>
                <stat.icon size={18} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">Actividad Semanal</h2>
              <p className="text-[11px] text-on-surface-variant">Volumen de pacientes en los últimos días.</p>
            </div>
            <select className="bg-surface-bright border border-outline-variant rounded-md text-[11px] font-black uppercase tracking-wider px-3 py-1.5 focus:ring-1 focus:ring-primary outline-none">
              <option>Últimos 7 días</option>
              <option>Últimos 30 días</option>
            </select>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[
                { name: 'Mon', appointments: 12 },
                { name: 'Tue', appointments: 18 },
                { name: 'Wed', appointments: 15 },
                { name: 'Thu', appointments: 22 },
                { name: 'Fri', appointments: 25 },
                { name: 'Sat', appointments: 10 },
                { name: 'Sun', appointments: 5 },
              ]}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00478D" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#00478D" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '11px', fontWeight: 'bold' }}
                  cursor={{ stroke: '#00478D', strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="appointments" stroke="#00478D" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col">
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-4">Próximos Turnos</h2>
          <div className="flex-1 space-y-3">
            {upcomingAppointments.map((apt) => (
              <div key={apt.id} className="flex gap-3 group cursor-pointer items-center p-2 hover:bg-surface rounded-lg transition-colors border border-transparent hover:border-outline-variant/30">
                <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-primary text-[12px] font-bold shrink-0 border border-outline-variant">
                  {apt.patientName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[12px] font-bold text-on-surface truncate">{apt.patientName}</h4>
                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary-container text-primary rounded-md">{apt.time}</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant/70 uppercase font-black tracking-tight truncate">{apt.type}</p>
                </div>
              </div>
            ))}
            {upcomingAppointments.length === 0 && !loading && (
              <div className="text-center py-10 opacity-30">
                <CalendarCheck size={32} className="mx-auto mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Sin turnos pendientes</p>
              </div>
            )}
          </div>
          <button className="w-full mt-4 py-2 text-[11px] font-black text-primary bg-primary/5 rounded-md hover:bg-primary/10 transition-all uppercase tracking-[0.2em] border border-primary/20">
            Ver Agenda Completa
          </button>
        </div>
      </div>
    </div>
  );
}
