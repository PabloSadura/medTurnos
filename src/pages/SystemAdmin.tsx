import { useState, useEffect } from 'react';
import { 
  Users, Shield, LayoutDashboard, Settings, Mail, Plus, 
  Trash2, Save, UserCheck, UserMinus, Clock, Activity,
  ChevronRight, Search, Filter, MoreVertical, CreditCard,
  Smartphone, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, deleteDoc, serverTimestamp, collection, getDocs, setDoc } from 'firebase/firestore';

export function SystemAdmin() {
  const { showToast } = useToast();
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'plans'>('users');
  
  // Plans states
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    usersLimit: 1,
    secretariesLimit: 1,
    whatsappCredit: 100,
    price: 19
  });
  
  // Modal & Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProf, setSelectedProf] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'medico',
    status: 'Activo',
    activePlanId: 'plus'
  });

  useEffect(() => {
    fetchProfessionals();
    fetchPlans();
  }, []);

  const fetchProfessionals = async () => {
    try {
      const qSnapshot = await getDocs(collection(db, 'users'));
      const list: any[] = [];
      qSnapshot.forEach((doc) => {
        const u = doc.data();
        if (u.role !== 'admin') {
          list.push({ id: doc.id, ...u });
        }
      });
      setProfessionals(list);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      setPlansLoading(true);
      const qSnapshot = await getDocs(collection(db, 'plans'));
      let list: any[] = [];
      qSnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });

      if (list.length === 0) {
        // Seeding database with default values if none exist yet
        const defaultPlans = [
          { id: 'basico', name: 'Básicos', usersLimit: 1, secretariesLimit: 1, whatsappCredit: 100, price: 19 },
          { id: 'plus', name: 'Plus', usersLimit: 3, secretariesLimit: 2, whatsappCredit: 500, price: 39 },
          { id: 'premium', name: 'Premium', usersLimit: 10, secretariesLimit: 5, whatsappCredit: 2000, price: 79 }
        ];

        for (const p of defaultPlans) {
          await setDoc(doc(db, 'plans', p.id), {
            name: p.name,
            usersLimit: p.usersLimit,
            secretariesLimit: p.secretariesLimit,
            whatsappCredit: p.whatsappCredit,
            price: p.price,
            updatedAt: serverTimestamp()
          });
        }

        list = defaultPlans;
      }

      // Sort to guarantee 'basico', 'plus', 'premium' order
      const orderMap: Record<string, number> = { 'basico': 1, 'plus': 2, 'premium': 3 };
      list.sort((a, b) => (orderMap[a.id] || 99) - (orderMap[b.id] || 99));

      setPlans(list);
    } catch (error: any) {
      console.error("Error fetching/seeding plans:", error);
      showToast('Error al cargar planes: ' + error.message, 'error');
    } finally {
      setPlansLoading(false);
    }
  };

  const handleEditPlan = (plan: any) => {
    setSelectedPlan(plan);
    setPlanForm({
      name: plan.name || '',
      usersLimit: Number(plan.usersLimit) || 1,
      secretariesLimit: Number(plan.secretariesLimit) || 1,
      whatsappCredit: Number(plan.whatsappCredit) || 0,
      price: Number(plan.price) || 0
    });
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = async () => {
    if (!selectedPlan) return;
    try {
      await setDoc(doc(db, 'plans', selectedPlan.id), {
        name: planForm.name,
        usersLimit: Number(planForm.usersLimit),
        secretariesLimit: Number(planForm.secretariesLimit),
        whatsappCredit: Number(planForm.whatsappCredit),
        price: Number(planForm.price),
        updatedAt: serverTimestamp()
      }, { merge: true });

      showToast(`Plan ${planForm.name} actualizado exitosamente`, 'success');
      setIsPlanModalOpen(false);
      fetchPlans();
    } catch (error: any) {
      showToast('Error al guardar el plan: ' + error.message, 'error');
    }
  };

  const handleSaveProf = async () => {
    if (!selectedProf && !form.password) {
      showToast('La contraseña es obligatoria para nuevos usuarios', 'error');
      return;
    }

    try {
      const targetId = selectedProf?.id || doc(collection(db, 'users')).id;

      // Use the exact same /api/staff/manage service endpoint
      const res = await fetch('/api/staff/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name,
          role: form.role,
          permissions: form.role === 'medico' ? ['all'] : [],
          status: form.status,
          userId: targetId, // Use target ID as userId (required field for staff/manage)
          staffId: selectedProf?.id
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al guardar profesional');
      }

      const data = await res.json();
      const authUid = data.uid;

      if (data.warning) {
        showToast(data.warning, 'info');
      }

      // Sync user data to users collection client-side
      await setDoc(doc(db, 'users', authUid), {
        name: form.name,
        email: form.email,
        role: form.role,
        status: form.status,
        activePlanId: form.activePlanId || 'plus',
        planId: form.activePlanId || 'plus',
        updatedAt: serverTimestamp()
      }, { merge: true });

      showToast(selectedProf ? 'Usuario actualizado exitosamente' : 'Nuevo usuario creado exitosamente');
      setIsModalOpen(false);
      fetchProfessionals();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleDeleteProf = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este profesional? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      showToast('Profesional eliminado del sistema');
      fetchProfessionals();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const filteredProfs = professionals.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = [
    { label: 'Usuarios Activos', value: professionals.filter(p => p.status === 'active' || p.status === 'Activo').length, icon: UserCheck, color: 'text-tertiary bg-tertiary/10' },
    { label: 'Usuarios Inactivos', value: professionals.filter(p => p.status !== 'active' && p.status !== 'Activo').length, icon: UserMinus, color: 'text-error bg-error/10' },
    { label: 'Total Registros', value: professionals.length, icon: Users, color: 'text-primary bg-primary/10' },
    { label: 'Tiempo Promedio Uso', value: '2.4hs', icon: Clock, color: 'text-secondary bg-secondary/10' },
  ];

  const chartData = [
    { name: 'Lun', users: 12 },
    { name: 'Mar', users: 15 },
    { name: 'Mie', users: 18 },
    { name: 'Jue', users: 14 },
    { name: 'Vie', users: 22 },
    { name: 'Sab', users: 10 },
    { name: 'Dom', users: 5 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Administración del Sistema</h1>
          <p className="body-md text-on-surface-variant">Vista global de usuarios, planes y configuración central de la plataforma.</p>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex border-b border-outline-variant gap-2">
        <button
          onClick={() => setActiveAdminTab('users')}
          className={cn(
            "px-6 py-3 text-[11px] font-bold uppercase tracking-widest border-b-2 font-sans transition-all cursor-pointer",
            activeAdminTab === 'users'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant"
          )}
        >
          Usuarios y Estadísticas
        </button>
        <button
          onClick={() => setActiveAdminTab('plans')}
          className={cn(
            "px-6 py-3 text-[11px] font-bold uppercase tracking-widest border-b-2 font-sans transition-all cursor-pointer",
            activeAdminTab === 'plans'
              ? "border-primary text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant"
          )}
        >
          Configuración de Planes
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeAdminTab === 'users' ? (
          <motion.div
            key="users-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, i) => (
                <div key={i} className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn("p-2 rounded-lg", stat.color)}>
                      <stat.icon size={18} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant">{stat.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-on-surface">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* KPI: Cantidad de Profesionales por Plan Contratado */}
            <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant">Profesionales Contratados por Plan</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {plans.map((p) => {
                  const count = professionals.filter(prof => {
                    const currentPlanId = prof.activePlanId || prof.planId || 'plus';
                    return currentPlanId === p.id;
                  }).length;
                  
                  return (
                    <div key={p.id} className="bg-surface/40 p-4 rounded-xl border border-outline-variant flex items-center justify-between hover:bg-surface/80 transition-all">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Plan {p.name}</p>
                        <p className="text-2xl font-black text-on-surface mt-1">{count}</p>
                        <p className="text-[10px] text-on-surface-variant/80 font-sans mt-0.5">${p.price || 0}/mes</p>
                      </div>
                      <div className={cn(
                        "p-2.5 rounded-lg",
                        p.id === 'basico' ? "text-slate-600 bg-slate-100" :
                        p.id === 'plus' ? "text-primary bg-primary/10" :
                        "text-amber-600 bg-amber-50"
                      )}>
                        <CreditCard size={18} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
                <h3 className="text-sm font-bold text-on-surface mb-6 uppercase tracking-wider flex items-center gap-2">
                  <Activity size={18} className="text-primary" />
                  Uso del Sistema Semanal
                </h3>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00478D" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#00478D" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="users" stroke="#00478D" strokeWidth={2} fill="url(#adminGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
                <h3 className="text-sm font-bold text-on-surface mb-6 uppercase tracking-wider">
                  Distribución por Rol
                </h3>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { role: 'Médicos', count: professionals.filter(p => !p.role || p.role === 'medico').length },
                      { role: 'Secretarias', count: professionals.filter(p => p.role === 'secretary').length },
                      { role: 'S. Admins', count: professionals.filter(p => p.role === 'admin').length },
                    ]}>
                      <XAxis dataKey="role" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#00478D" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Distribución por Plan de Suscripción */}
              <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-on-surface mb-1 uppercase tracking-wider">
                    Planes de Profesionales
                  </h3>
                  <p className="text-[10px] text-on-surface-variant mb-6 font-sans">Suscripciones activas cargadas por médicos de la plataforma.</p>
                </div>
                <div className="space-y-4 font-sans flex-1 flex flex-col justify-center">
                  {plans.map((p) => {
                    const count = professionals.filter(prof => {
                      const currentPlanId = prof.activePlanId || prof.planId || 'plus';
                      return currentPlanId === p.id;
                    }).length;
                    const totalMedicos = professionals.filter(prof => !prof.role || prof.role === 'medico').length || 1;
                    const percentage = (count / totalMedicos) * 100;
                    
                    return (
                      <div key={p.id} className="space-y-1.5 cursor-default">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-bold text-on-surface">Plan {p.name}</span>
                          <span className="text-xs font-semibold text-on-surface-variant">
                            {count} {count === 1 ? 'médico' : 'médicos'} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="w-full bg-surface-variant/30 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full transition-all duration-500" 
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: p.id === 'basico' ? '#64748B' : p.id === 'plus' ? '#00478D' : '#D97706'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Gestión de Usuarios</h3>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
                    <input 
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-surface-bright border border-outline-variant rounded-lg text-sm outline-none focus:border-primary transition-all font-sans"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedProf(null);
                      setForm({ name: '', email: '', password: '', role: 'medico', status: 'Activo', activePlanId: 'plus' });
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-[11px] font-bold uppercase tracking-widest rounded-lg hover:bg-primary/90 transition-all font-sans whitespace-nowrap cursor-pointer"
                  >
                    <Plus size={14} />
                    Añadir Usuario
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans">
                  <thead className="bg-surface-bright border-b border-outline-variant">
                    <tr>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Usuario</th>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Rol</th>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Ult. Acceso</th>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface">
                    {filteredProfs.map((p) => (
                      <tr key={p.id} className="hover:bg-surface/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary-container text-primary flex items-center justify-center font-bold text-sm">
                              {p.name?.charAt(0) || p.email?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-on-surface">{p.name || 'Sin nombre'}</p>
                              <p className="text-[11px] text-on-surface-variant">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-surface rounded-full text-on-surface-variant uppercase tracking-tighter">
                            {p.role === 'medico' ? 'Profesional' : p.role === 'secretary' ? 'Secretaria' : 'Admin'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              (p.status === 'Activo' || p.status === 'active') ? "bg-tertiary" : "bg-error"
                            )} />
                            <span className="text-[11px] font-medium text-on-surface">{p.status || 'Activo'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[11px] text-on-surface-variant">Hoy, 10:45 AM</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                setSelectedProf(p);
                                setForm({
                                  name: p.name || '',
                                  email: p.email || '',
                                  password: '',
                                  role: p.role || 'medico',
                                  status: p.status || 'Activo',
                                  activePlanId: p.activePlanId || 'plus'
                                });
                                setIsModalOpen(true);
                              }}
                              className="p-1.5 hover:bg-surface rounded-lg text-on-surface-variant transition-colors cursor-pointer"
                            >
                              <Settings size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteProf(p.id)}
                              className="p-1.5 hover:bg-error-container/20 rounded-lg text-error transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredProfs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant">
                          No se encontraron profesionales registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="plans-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Tipos de Planes de la Plataforma</h3>
                <p className="text-[11px] text-on-surface-variant">Configure los límites operacionales, cantidad de secretarias, mensajería de WhatsApp e importes mensuales de cada plan.</p>
              </div>
              {plansLoading && (
                <div className="text-xs text-primary font-bold animate-pulse">Cargando planes...</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
              {plans.map((p) => {
                const isPopular = p.id === 'plus';
                return (
                  <div 
                    key={p.id} 
                    className={cn(
                      "bg-white rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden",
                      isPopular 
                        ? "border-primary shadow-md scale-100 md:scale-[1.02]" 
                        : "border-outline-variant shadow-sm hover:shadow-md"
                    )}
                  >
                    {isPopular && (
                      <div className="absolute top-0 right-0 bg-primary text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-sm">
                        Popular
                      </div>
                    )}
                    
                    <div className="p-6 space-y-6">
                      {/* Plan Header */}
                      <div className="space-y-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                          p.id === 'basico' ? "bg-slate-100 text-slate-700" :
                          p.id === 'plus' ? "bg-primary-container text-primary" :
                          "bg-amber-100 text-amber-800"
                        )}>
                          Plan {p.name}
                        </span>
                        <div className="flex items-baseline gap-1 pt-2">
                          <span className="text-3xl font-black text-on-surface">${p.price || 0}</span>
                          <span className="text-xs text-on-surface-variant font-medium">/ mes</span>
                        </div>
                      </div>

                      <div className="h-[1px] bg-outline-variant"></div>

                      {/* Plan Characteristics */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-on-surface-variant">
                            <Users size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-tight text-on-surface-variant">Cantidad de Usuarios</p>
                            <p className="text-xs font-bold text-on-surface">{p.usersLimit || 1} {p.usersLimit === 1 ? 'Usuario profesional' : 'Usuarios profesionales'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-on-surface-variant">
                            <Shield size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-tight text-on-surface-variant">Secretarias por Usuario</p>
                            <p className="text-xs font-bold text-on-surface">{p.secretariesLimit || 1} {p.secretariesLimit === 1 ? 'Secretaria' : 'Secretarias'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-on-surface-variant">
                            <Smartphone size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-tight text-on-surface-variant">Crédito de WhatsApp</p>
                            <p className="text-xs font-bold text-on-surface">{p.whatsappCredit || 0} mensajes/mes incluidos</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-on-surface-variant">
                            <CreditCard size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-tight text-on-surface-variant">Importe del Plan</p>
                            <p className="text-xs font-bold text-on-surface">${p.price || 0} USD mensuales</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 pt-0">
                      <button 
                        onClick={() => handleEditPlan(p)}
                        className={cn(
                          "w-full py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer",
                          isPopular
                            ? "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/10"
                            : "bg-surface border border-outline-variant text-on-surface hover:bg-outline-variant"
                        )}
                      >
                        <Settings size={12} />
                        Configurar Plan {p.name}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Management Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedProf ? "Editar Profesional" : "Alta de Profesional"}
        className="max-w-md font-sans"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Nombre Completo</label>
            <input 
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
              placeholder="Dr. Juan Perez"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Email</label>
            <input 
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
              placeholder="email@ejemplo.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              {selectedProf ? "Nueva Contraseña (opcional)" : "Contraseña"}
            </label>
            <input 
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
              placeholder="••••••••"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Rol</label>
              <select 
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none"
              >
                <option value="medico">Médico / Profesional</option>
                <option value="secretary">Secretaría / Staff</option>
                <option value="admin">Administrador Sistema</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Estado</label>
              <select 
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none"
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Plan Asociado</label>
            <select 
              value={form.activePlanId}
              onChange={(e) => setForm({ ...form, activePlanId: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>Plan {p.name} (${p.price || 0}/mes)</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2.5 bg-surface border border-outline-variant rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-outline-variant transition-all font-sans cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveProf}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all flex items-center justify-center gap-2 font-sans cursor-pointer"
            >
              <Save size={14} />
              {selectedProf ? "Actualizar" : "Crear Alta"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Plan Specific Configuration Modal */}
      <Modal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        title={`Configurar Plan ${selectedPlan?.name || ''}`}
        className="max-w-md font-sans"
      >
        <div className="space-y-4">
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Modifique los límites operacionales y costos comerciales para el nivel de suscripción y uso de la plataforma.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Nombre del Plan</label>
            <input 
              type="text"
              value={planForm.name}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
              placeholder="e.g. Básico"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Profesionales Máx.</label>
              <input 
                type="number"
                min="1"
                value={planForm.usersLimit}
                onChange={(e) => setPlanForm({ ...planForm, usersLimit: Number(e.target.value) })}
                className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Secretarias por Prof.</label>
              <input 
                type="number"
                min="1"
                value={planForm.secretariesLimit}
                onChange={(e) => setPlanForm({ ...planForm, secretariesLimit: Number(e.target.value) })}
                className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">WhatsApps Incl.</label>
              <input 
                type="number"
                min="0"
                value={planForm.whatsappCredit}
                onChange={(e) => setPlanForm({ ...planForm, whatsappCredit: Number(e.target.value) })}
                className="w-full px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest font-bold text-primary">Importe / mes ($)</label>
              <input 
                type="number"
                min="0"
                value={planForm.price}
                onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })}
                className="w-full px-4 py-2 bg-white border border-primary/30 rounded-xl text-sm outline-none focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsPlanModalOpen(false)}
              className="flex-1 py-2.5 bg-surface border border-outline-variant rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-outline-variant transition-all font-sans cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSavePlan}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all flex items-center justify-center gap-2 font-sans cursor-pointer"
            >
              <Check size={14} />
              Guardar Cambios
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
