import { useState, useEffect } from 'react';
import { 
  Settings, Users, Shield, Database, Bell, Layout, CreditCard, 
  ChevronRight, Plus, Trash2, Download, CheckCircle2, AlertCircle,
  Palette, Smartphone, Mail, Eye, Save, ExternalLink, MessageSquare,
  Lock, Unlock, ChevronDown, UserPlus
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, getDoc, 
  getDocs, orderBy, serverTimestamp, addDoc, deleteDoc, limit 
} from 'firebase/firestore';
import { useToast } from '../components/Toast';

type AdminTab = 'overview' | 'users' | 'notifications' | 'backup' | 'theme' | 'billing';

const AVAILABLE_MODULES = [
  { id: 'agenda', label: 'Agenda / Turnos' },
  { id: 'patients', label: 'Pacientes' },
  { id: 'inventory', label: 'Inventario / Stock' },
  { id: 'billing', label: 'Facturación / Caja' },
  { id: 'reminders', label: 'Recordatorios WhatsApp' },
];

export function Administration() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [patientsCount, setPatientsCount] = useState(0);
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);
  
  // Forms
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Secretary',
    permissions: ['agenda', 'patients'] as string[],
    status: 'Activo'
  });

  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('#00478D');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Fetch Patients Count
    const unsubscribePatients = onSnapshot(query(collection(db, 'patients'), where('userId', '==', userId)), (snapshot) => {
      setPatientsCount(snapshot.size);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    // Fetch Appointments Count
    const unsubscribeApps = onSnapshot(query(collection(db, 'appointments'), where('userId', '==', userId)), (snapshot) => {
      setAppointmentsCount(snapshot.size);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    // Fetch Staff
    const unsubscribeStaff = onSnapshot(query(collection(db, 'staff'), where('userId', '==', userId)), (snapshot) => {
      setStaff(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'staff'));

    // Fetch Real Notifications
    // 1. WhatsApp Logs
    const unsubscribeLogs = onSnapshot(
      query(collection(db, 'whatsapp_logs'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(10)),
      (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'whatsapp',
          message: `${doc.data().status === 'success' ? 'Enviado a' : 'Error enviando a'} ${doc.data().patientName || doc.data().to}`,
          time: doc.data().createdAt?.toDate() ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(doc.data().createdAt.toDate()) : 'Reciente',
          status: doc.data().status,
          fullMessage: doc.data().message
        }));
        
        // 2. Stock Alerts
        getDocs(query(collection(db, 'stocks'), where('userId', '==', userId))).then(stockSnap => {
          const alerts = stockSnap.docs
            .map(d => d.data())
            .filter(d => d.stock <= d.minStock)
            .map((d, index) => ({
              id: `stock-${index}`,
              type: 'stock',
              message: `Stock crítico: ${d.name} (${d.stock} ${d.unit || 'uds'})`,
              time: 'Alerta Activa',
              status: 'warning'
            }));
          
          setNotifications([...alerts, ...logs]);
        });
      },
      (error) => {
        if (error.message.includes('requires an index')) {
          const match = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
          if (match) setIndexErrorUrl(match[0]);
        }
        handleFirestoreError(error, OperationType.LIST, 'whatsapp_logs');
      }
    );

    // Load theme from profile
    getDoc(doc(db, 'users', userId)).then(docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.primaryColor) setSelectedTheme(data.primaryColor);
        if (data.darkMode !== undefined) setIsDarkMode(data.darkMode);
      }
    });

    return () => {
      unsubscribePatients();
      unsubscribeApps();
      unsubscribeStaff();
      unsubscribeLogs();
    };
  }, []);

  const handleSaveUser = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    if (!selectedUser && !userForm.password) {
      showToast('La contraseña es obligatoria para nuevos usuarios', 'error');
      return;
    }

    try {
      const response = await fetch('/api/staff/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...userForm,
          userId,
          staffId: selectedUser?.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error managing user');
      }

      setIsUserModalOpen(false);
      setSelectedUser(null);
      resetUserForm();
      showToast(selectedUser ? 'Usuario actualizado' : 'Usuario creado y acceso configurado');
    } catch (error: any) {
      showToast(error.message, 'error');
      console.error(error);
    }
  };

  const resetUserForm = () => {
    setUserForm({
      name: '',
      email: '',
      password: '',
      role: 'Secretary',
      permissions: ['agenda', 'patients'],
      status: 'Activo'
    });
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este acceso? El usuario ya no podrá ingresar al sistema.')) return;
    try {
      await deleteDoc(doc(db, 'staff', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'staff');
    }
  };

  const handleToggleModule = (moduleId: string) => {
    const next = userForm.permissions.includes(moduleId)
      ? userForm.permissions.filter(p => p !== moduleId)
      : [...userForm.permissions, moduleId];
    setUserForm({ ...userForm, permissions: next });
  };

  const handleExportData = async (type: 'json' | 'csv') => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const pSnap = await getDocs(query(collection(db, 'patients'), where('userId', '==', userId)));
      const aSnap = await getDocs(query(collection(db, 'appointments'), where('userId', '==', userId)));

      const patients = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const appointments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const data = { patients, appointments, exportedAt: new Date().toISOString() };

      if (type === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_clinica_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
      } else {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Pacientes\nNombre,Documento,Telefono\n";
        patients.forEach((p: any) => {
          csvContent += `${(p.name || '').replace(/,/g, '')},${p.idNumber || ''},${p.phone || ''}\n`;
        });
        csvContent += "\nCitas\nFecha,Hora,Paciente,Tipo\n";
        appointments.forEach((a: any) => {
          csvContent += `${a.date},${a.time},${(a.patientName || '').replace(/,/g, '')},${a.type}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `clinica_data_${new Date().toISOString().split('T')[0]}.csv`);
        link.click();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveTheme = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await updateDoc(doc(db, 'users', userId), {
        primaryColor: selectedTheme,
        darkMode: isDarkMode,
        updatedAt: serverTimestamp()
      });
      
      // Apply theme immediately to document
      document.documentElement.classList.toggle('dark', isDarkMode);
      document.documentElement.style.setProperty('--color-primary', selectedTheme);
      
      showToast('Configuración guardada exitosamente.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const themes = [
    { name: 'Azul Médico (Default)', color: '#00478D' },
    { name: 'Bosque Sanador', color: '#1B5E20' },
    { name: 'Cuidado Dental', color: '#00796B' },
    { name: 'Fucsia Moderno', color: '#880E4F' },
    { name: 'Gris Ejecutivo', color: '#263238' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="headline-lg text-on-surface">Administración del Sistema</h1>
          <p className="body-md text-on-surface-variant">Parámetros globales de la clínica y gestión de personal.</p>
        </div>
      </div>

      <div className="flex bg-white border border-outline-variant p-1 rounded-xl overflow-x-auto scrollbar-none gap-1">
        {(['overview', 'users', 'notifications', 'backup', 'theme', 'billing'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all whitespace-nowrap",
              activeTab === tab 
                ? "bg-primary text-white shadow-md shadow-primary/20" 
                : "text-on-surface-variant hover:bg-surface"
            )}
          >
            {tab === 'overview' && 'General'}
            {tab === 'users' && 'Usuarios'}
            {tab === 'notifications' && 'Notificaciones'}
            {tab === 'backup' && 'Respaldos'}
            {tab === 'theme' && 'Personalización'}
            {tab === 'billing' && 'Facturación'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { label: 'Usuarios y Permisos', desc: `${staff.length} miembros registrados.`, icon: Users, tab: 'users' as const },
                { label: 'Notificaciones Recientes', desc: `${notifications.length} eventos registrados hoy.`, icon: Bell, tab: 'notifications' as const },
                { label: 'Copias de Seguridad', desc: `${patientsCount} pacientes y ${appointmentsCount} turnos listos.`, icon: Database, tab: 'backup' as const },
                { label: 'Personalización', desc: 'Identidad visual y temas.', icon: Layout, tab: 'theme' as const },
                { label: 'Facturación', desc: 'Plan Profesional Activo.', icon: CreditCard, tab: 'billing' as const },
                { label: 'Seguridad', desc: 'Control de acceso biométrico inactivo.', icon: Shield, tab: 'overview' as const },
              ].map((item) => (
                <div 
                  key={item.label}
                  onClick={() => setActiveTab(item.tab)}
                  className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="p-3 bg-surface rounded-xl mb-4 group-hover:bg-primary/5 transition-colors w-fit">
                    <item.icon size={24} className="text-primary" />
                  </div>
                  <h3 className="text-[14px] font-black text-on-surface mb-1">{item.label}</h3>
                  <p className="text-[11px] text-on-surface-variant">{item.desc}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Gestión de Personal</h3>
                <button 
                  onClick={() => {
                    resetUserForm();
                    setSelectedUser(null);
                    setIsUserModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-primary/90 transition-all font-sans"
                >
                  <Plus size={14} />
                  Invitar Secretario
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-bright border-b border-outline-variant">
                    <tr>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Nombre</th>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Rol</th>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface">
                    {staff.map((p) => (
                      <tr key={p.id} className="hover:bg-surface/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold text-xs">
                              {p.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-on-surface">{p.name}</p>
                              <p className="text-[11px] text-on-surface-variant">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium px-2 py-0.5 bg-surface rounded-full text-on-surface-variant w-fit">
                              {p.role}
                            </span>
                            <div className="flex gap-1">
                              {p.permissions?.slice(0, 2).map((perm: string) => (
                                <span key={perm} className="text-[8px] bg-primary/5 text-primary px-1 rounded border border-primary/10">
                                  {AVAILABLE_MODULES.find(m => m.id === perm)?.label || perm}
                                </span>
                              ))}
                              {p.permissions?.length > 2 && <span className="text-[8px] text-on-surface-variant">+{p.permissions.length - 2}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter",
                            p.status === 'Activo' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-dim text-on-surface-variant'
                          )}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                setSelectedUser(p);
                                setUserForm({
                                  name: p.name,
                                  email: p.email,
                                  password: '',
                                  role: p.role,
                                  permissions: p.permissions || [],
                                  status: p.status
                                });
                                setIsUserModalOpen(true);
                              }}
                              className="p-1.5 hover:bg-surface rounded-lg text-on-surface-variant transition-colors"
                              title="Editar"
                            >
                              <Settings size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteStaff(p.id)}
                              className="p-1.5 hover:bg-error-container/20 rounded-lg text-error transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {staff.length === 0 && !loading && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant">
                          <UserPlus size={40} className="mx-auto mb-3 opacity-20" />
                          <p className="text-sm font-bold uppercase tracking-widest opacity-40">No hay personal registrado</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
                  <h3 className="text-sm font-bold text-on-surface mb-4 uppercase tracking-wider flex items-center gap-2">
                    <Bell size={18} className="text-primary" />
                    Alertas de Stock
                  </h3>
                  <div className="space-y-3">
                    {notifications.filter(n => n.type === 'stock').map(n => (
                      <div key={n.id} className="p-3 bg-error-container/5 border border-error/10 rounded-lg flex gap-3">
                        <AlertCircle className="text-error mt-0.5" size={16} />
                        <div>
                          <p className="text-[12px] font-medium text-on-surface leading-tight">{n.message}</p>
                          <p className="text-[10px] text-on-surface-variant mt-1">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
                  <h3 className="text-sm font-bold text-on-surface mb-4 uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare size={18} className="text-tertiary" />
                    Logs de WhatsApp
                  </h3>
                  <div className="space-y-3">
                    {indexErrorUrl && (
                      <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl mb-4">
                        <div className="flex gap-3">
                          <AlertCircle className="text-orange-600 shrink-0" size={18} />
                          <div>
                            <p className="text-[12px] font-bold text-orange-900 mb-1">Indexación requerida</p>
                            <p className="text-[11px] text-orange-800 leading-relaxed mb-3">
                              Para ver el historial de mensajes, debe activar un índice en Firebase. Haga clic en el botón de abajo y luego en "Crear índice". Esto puede tardar unos minutos.
                            </p>
                            <a 
                              href={indexErrorUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-orange-700 transition-all font-sans"
                            >
                              <ExternalLink size={12} />
                              Activar Índice
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                    {notifications.filter(n => n.type === 'whatsapp').map(n => (
                      <div key={n.id} className={cn(
                        "p-3 border rounded-lg flex gap-3",
                        n.status === 'success' ? 'bg-tertiary-container/5 border-tertiary/10' : 'bg-error-container/5 border-error/10'
                      )}>
                        {n.status === 'success' ? <CheckCircle2 className="text-tertiary mt-0.5" size={16} /> : <AlertCircle className="text-error mt-0.5" size={16} />}
                        <div>
                          <p className="text-[12px] font-medium text-on-surface leading-tight">{n.message}</p>
                          <p className="text-[10px] text-on-surface-variant mt-1">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="bg-white p-8 rounded-xl border border-outline-variant shadow-sm text-center">
              <div className="w-16 h-16 bg-primary/5 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Database size={32} />
              </div>
              <h3 className="text-lg font-black text-on-surface mb-2">Respaldo Total de Datos</h3>
              <p className="text-on-surface-variant text-sm mb-8 max-w-md mx-auto">
                Exporte toda la información de su clínica (pacientes, agenda, tratamientos e inventario) en formatos estandarizados.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => handleExportData('json')}
                  className="flex items-center justify-center gap-3 px-6 py-3 bg-surface border border-outline-variant rounded-xl text-[12px] font-bold uppercase tracking-widest hover:bg-outline-variant transition-all hover:scale-105 active:scale-95"
                >
                  <Download size={18} />
                  Exportar JSON (Full)
                </button>
                <button 
                  onClick={() => handleExportData('csv')}
                  className="flex items-center justify-center gap-3 px-6 py-3 bg-primary text-white rounded-xl text-[12px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
                >
                  <Download size={18} />
                  Exportar CSV (Resumen)
                </button>
              </div>
            </div>
          )}

          {activeTab === 'theme' && (
            <div className="bg-white p-8 rounded-xl border border-outline-variant shadow-sm">
              <div className="flex items-center gap-2 mb-8">
                <Palette className="text-primary" size={24} />
                <h3 className="text-lg font-black text-on-surface uppercase tracking-tighter">Identidad Visual</h3>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest pl-1">Modo de Pantalla</label>
                    <div className="flex bg-surface-bright border border-outline-variant rounded-xl p-1 w-fit">
                      <button 
                        onClick={() => setIsDarkMode(false)}
                        className={cn(
                          "px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                          !isDarkMode ? "bg-white text-primary shadow-sm" : "text-on-surface-variant"
                        )}
                      >
                        Claro
                      </button>
                      <button 
                        onClick={() => setIsDarkMode(true)}
                        className={cn(
                          "px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                          isDarkMode ? "bg-white text-primary shadow-sm" : "text-on-surface-variant"
                        )}
                      >
                        Oscuro
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest pl-1">Color Principal</label>
                    <div className="grid grid-cols-5 gap-3">
                      {themes.map((t) => (
                        <button
                          key={t.color}
                          onClick={() => setSelectedTheme(t.color)}
                          className={cn(
                            "w-full aspect-square rounded-full border-4 transition-all",
                            selectedTheme === t.color ? "border-primary scale-110 shadow-lg" : "border-transparent"
                          )}
                          style={{ backgroundColor: t.color }}
                          title={t.name}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest pl-1">Vista Previa</label>
                    <div className="p-4 rounded-xl border border-outline-variant bg-surface-bright space-y-3">
                      <div className="h-4 w-24 rounded-full opacity-20" style={{ backgroundColor: selectedTheme }}></div>
                      <div className="flex gap-2">
                        <div className="h-8 flex-1 rounded-lg shadow-sm" style={{ backgroundColor: selectedTheme }}></div>
                        <div className="h-8 flex-1 rounded-lg border border-outline-variant"></div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveTheme}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-primary text-white rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] font-sans"
                  >
                    <Save size={18} />
                    Guardar Cambios
                  </button>
                </div>

                <div className="bg-surface-bright rounded-2xl p-8 border border-outline-variant relative overflow-hidden flex flex-col items-center justify-center text-center">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full"></div>
                  <Layout size={48} className="text-on-surface-variant opacity-20 mb-4" />
                  <h4 className="text-sm font-bold text-on-surface">Marca Blanca</h4>
                  <p className="text-[11px] text-on-surface-variant mt-1">Cargue su propio LOGO para que aparezca en los recordatorios y panel de pacientes.</p>
                  <button className="mt-6 px-4 py-2 bg-white border border-outline-variant rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-outline-variant transition-colors font-sans">
                    Subir Logo
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-xl border border-primary/20 bg-primary/5 shadow-sm flex flex-col md:flex-row items-center gap-8">
                <div className="w-20 h-20 bg-primary text-white rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20">
                  <CreditCard size={40} />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="flex flex-col md:flex-row md:items-baseline gap-2 mb-1">
                    <h3 className="text-xl font-black text-on-surface">Plan Professional</h3>
                    <span className="text-[11px] font-bold bg-primary text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">Activo</span>
                  </div>
                  <p className="text-sm text-on-surface-variant font-sans">Suscripción anual - Próxima renovación: 15 de Junio, 2026</p>
                  <div className="mt-4 flex items-center justify-center md:justify-start gap-6 font-sans">
                    <div>
                      <p className="text-[20px] font-bold text-on-surface">$49</p>
                      <p className="text-[10px] text-on-surface-variant uppercase font-black">Al Mes</p>
                    </div>
                    <div className="h-8 w-[1px] bg-outline-variant"></div>
                    <div>
                      <p className="text-[20px] font-bold text-on-surface">1,000</p>
                      <p className="text-[10px] text-on-surface-variant uppercase font-black">WhatsApps Incl.</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 w-full md:w-auto font-sans">
                  <button className="px-6 py-2.5 bg-primary text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all">Cambiar Plan</button>
                  <button className="px-6 py-2.5 bg-white border border-outline-variant rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-surface transition-all">Ver Facturas</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
                {[
                  { label: 'Método de Pago', value: 'Visa ending in 4242', icon: CreditCard },
                  { label: 'Cuotas Adicionales', value: '$0.05 / msj extra', icon: Bell },
                  { label: 'Soporte VIP', value: 'Disponible 24/7', icon: Smartphone },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">{stat.label}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-on-surface">{stat.value}</p>
                      <stat.icon size={16} className="text-on-surface-variant/40" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Staff Modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title={selectedUser ? "Editar Acceso" : "Nuevo Acceso"}
        className="max-w-md font-sans"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Nombre Completo</label>
            <input 
              type="text"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all"
              placeholder="Ej. Marta Rodriguez"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Email de Acceso</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
              <input 
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all"
                placeholder="email@ejemplo.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              {selectedUser ? "Cambiar Contraseña (dejar vacío para mantener)" : "Contraseña de Acceso"}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
              <input 
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Rol</label>
              <select 
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all appearance-none"
              >
                <option value="Secretary">Secretaria</option>
                <option value="Admin">Administrador</option>
                <option value="Professional">Profesional</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Estado</label>
              <select 
                value={userForm.status}
                onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all appearance-none"
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className="text-primary" />
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Permisos de Acceso</label>
            </div>
            <div className="grid grid-cols-1 gap-2 p-3 bg-surface-bright rounded-xl border border-outline-variant">
              {AVAILABLE_MODULES.map((module) => (
                <div 
                  key={module.id} 
                  onClick={() => handleToggleModule(module.id)}
                  className="flex items-center justify-between p-2 hover:bg-surface rounded-lg cursor-pointer transition-colors"
                >
                  <span className="text-[12px] font-bold text-on-surface">{module.label}</span>
                  <div className={cn(
                    "w-10 h-5 rounded-full relative transition-colors",
                    userForm.permissions.includes(module.id) ? "bg-primary" : "bg-surface-dim"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      userForm.permissions.includes(module.id) ? "right-1" : "left-1"
                    )}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => setIsUserModalOpen(false)}
              className="flex-1 py-2.5 bg-surface border border-outline-variant rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-outline-variant transition-all transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveUser}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              <Save size={14} />
              {selectedUser ? "Actualizar" : "Crear Acceso"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

