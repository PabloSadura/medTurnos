import { useState, useEffect } from 'react';
import { TrendingUp, Users, CalendarCheck, CreditCard, ArrowUpRight, ArrowDownRight, Clock, PieChart as PieChartIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

export function Dashboard() {
  const [revenueMode, setRevenueMode] = useState<'daily' | 'monthly'>('daily');
  const [stats, setStats] = useState([
    { id: 'patients', label: 'Pacientes Totales', value: '0', trend: '', icon: Users, color: 'bg-secondary-container text-secondary' },
    { id: 'appointments', label: 'Turnos Hoy', value: '0', trend: '', icon: CalendarCheck, color: 'bg-tertiary-container text-tertiary' },
    { id: 'inventory', label: 'Valor Inventario', value: '$0', trend: '', icon: CreditCard, color: 'bg-primary-container text-primary' },
    { id: 'revenue', label: 'Ingresos Hoy', value: '$0', trend: '', icon: TrendingUp, color: 'bg-error-container text-error' },
  ]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const unsubscribeTreatments = onSnapshot(query(collection(db, 'treatments'), where('userId', '==', userId)), (snapshot) => {
      setTreatments(snapshot.docs.map(doc => doc.data()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treatments'));

    const unsubscribePatients = onSnapshot(query(collection(db, 'patients'), where('userId', '==', userId)), (snapshot) => {
      const count = snapshot.size;
      setStats(prev => prev.map(s => s.id === 'patients' ? { ...s, value: count.toString() } : s));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    // Revenue and Appointments today
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7); // YYYY-MM

    const qRevenue = query(
      collection(db, 'appointments'), 
      where('userId', '==', userId)
    );
    
    const unsubscribeRevenue = onSnapshot(qRevenue, (snapshot) => {
      const allApps = snapshot.docs.map(d => d.data());
      // Filter by date range on client
      const filteredApps = allApps.filter(a => a.date >= monthStr + '-01');
      setAppointments(filteredApps);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    // Weekly activity
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const qWeekly = query(
      collection(db, 'appointments'), 
      where('userId', '==', userId)
    );
    const unsubscribeWeekly = onSnapshot(qWeekly, (snapshot) => {
      const dayMap: Record<string, number> = { 'Lun': 0, 'Mar': 0, 'Mie': 0, 'Jue': 0, 'Vie': 0, 'Sab': 0, 'Dom': 0 };
      const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        let date: Date;
        if (data.startTime?.toDate) date = data.startTime.toDate();
        else date = new Date(data.startTime);
        
        if (date >= sevenDaysAgo) {
          const dayName = days[date.getDay()];
          if (dayMap[dayName] !== undefined) dayMap[dayName]++;
        }
      });

      const reordered = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map(name => ({
        name,
        appointments: dayMap[name]
      }));
      setWeeklyActivity(reordered);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    // Inventory
    const unsubscribeInventory = onSnapshot(query(collection(db, 'stocks'), where('userId', '==', userId)), (snapshot) => {
      const totalValue = snapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        return acc + ((data.stock || 0) * (data.price || 0));
      }, 0);
      setStats(prev => prev.map(s => s.id === 'inventory' ? { ...s, value: `$${totalValue.toLocaleString()}` } : s));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stocks'));

    // Upcoming
    const qUpcoming = query(
      collection(db, 'appointments'),
      where('userId', '==', userId)
    );
    const unsubscribeUpcoming = onSnapshot(qUpcoming, (snapshot) => {
      const nowTs = now.getTime();
      const upcoming = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter((apt: any) => {
          const date = apt.startTime?.toDate ? apt.startTime.toDate() : new Date(apt.startTime);
          return date.getTime() >= nowTs;
        })
        .sort((a: any, b: any) => {
          const dateA = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime);
          const dateB = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
          return dateA.getTime() - dateB.getTime();
        })
        .slice(0, 6);

      setUpcomingAppointments(upcoming);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    return () => {
      unsubscribeRevenue();
      unsubscribeInventory();
      unsubscribeUpcoming();
      unsubscribeWeekly();
      unsubscribeTreatments();
      unsubscribePatients();
    };
  }, [auth.currentUser?.uid]); // Changed dependency to uid

  // Reactive updates for revenue and charts
  useEffect(() => {
    // Re-calculate everything when appointments or treatments change
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7);

    const todayApps = appointments.filter(a => a.date === todayStr);
    
    const dailyRevenue = todayApps.filter(a => a.status === 'finished').reduce((acc, app) => {
      const t = treatments.find(trait => trait.name === app.type);
      return acc + (t?.cost || 0);
    }, 0);

    const monthlyRevenue = appointments.filter(a => a.status === 'finished' && a.date.startsWith(monthStr)).reduce((acc, app) => {
      const t = treatments.find(trait => trait.name === app.type);
      return acc + (t?.cost || 0);
    }, 0);

    const statusCounts = appointments.reduce((acc: any, app) => {
      const s = app.status || 'pendiente';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const uniquePatientIds = new Set(appointments.map(a => a.patientId));

    const chartData = [
      { name: 'Finalizados', value: statusCounts['finished'] || 0, color: '#00478D' },
      { name: 'Pendientes', value: (statusCounts['pendiente'] || 0) + (statusCounts['confirmado'] || 0), color: '#7E91AF' },
      { name: 'Ausentes/Canc', value: (statusCounts['ausente'] || 0) + (statusCounts['cancelado'] || 0), color: '#BA1A1A' },
    ].filter(d => d.value > 0);
    
    setStatusData(chartData);

    setStats(prev => prev.map(s => {
      if (s.id === 'appointments') return { ...s, value: todayApps.length.toString() };
      if (s.id === 'revenue') {
        return { 
          ...s, 
          label: revenueMode === 'daily' ? 'Ingresos Hoy' : 'Ingresos Mensuales',
          value: `$${(revenueMode === 'daily' ? dailyRevenue : monthlyRevenue).toLocaleString()}` 
        };
      }
      return s;
    }));
  }, [appointments, treatments, revenueMode]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="headline-lg text-on-surface">Panel de Control</h1>
        <p className="body-md text-on-surface-variant">Monitoreo del rendimiento de la clínica y actividad de los pacientes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={stat.id === 'revenue' ? () => setRevenueMode(prev => prev === 'daily' ? 'monthly' : 'daily') : undefined}
            className={cn(
              "bg-white p-4 rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-all group",
              stat.id === 'revenue' ? "cursor-pointer ring-1 ring-transparent hover:ring-primary/20" : "cursor-default"
            )}
          >
            <div className="flex justify-between items-center mb-3">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant group-hover:text-primary transition-colors">
                {stat.label}
                {stat.id === 'revenue' && <span className="ml-1 text-[8px] opacity-40">(Click para cambiar)</span>}
              </p>
              <div className={`flex items-center gap-1 text-[11px] font-bold ${stat.trend.startsWith('+') ? 'text-primary' : stat.trend ? 'text-error' : 'hidden'}`}>
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
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyActivity}>
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
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-4">Estado de Turnos</h2>
          <div className="flex-1 h-[200px] w-full flex items-center justify-center">
            {statusData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={statusData}
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={5}
                   dataKey="value"
                 >
                   {statusData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.color} />
                   ))}
                 </Pie>
                 <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
               </PieChart>
             </ResponsiveContainer>
            ) : (
              <div className="text-center opacity-30">
                <PieChartIcon size={32} className="mx-auto mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Sin datos suficientes</p>
              </div>
            )}
          </div>
          <div className="space-y-2 mt-4">
            {statusData.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[11px] font-medium text-on-surface-variant">{item.name}</span>
                </div>
                <span className="text-[11px] font-bold text-on-surface">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
        <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-4">Próximos Turnos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcomingAppointments.map((apt) => (
            <div key={apt.id} className="flex gap-3 items-center p-3 bg-surface-bright rounded-lg border border-outline-variant/30 hover:border-primary/30 transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-primary text-[14px] font-bold shrink-0">
                {apt.patientName?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <h4 className="text-[12px] font-bold text-on-surface truncate">{apt.patientName}</h4>
                  <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary-container text-primary rounded-md">{apt.time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-on-surface-variant/70 uppercase font-black tracking-tight truncate">{apt.type}</p>
                </div>
              </div>
            </div>
          ))}
          {upcomingAppointments.length === 0 && !loading && (
            <div className="col-span-full text-center py-10 opacity-30">
              <CalendarCheck size={32} className="mx-auto mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Sin turnos pendientes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
