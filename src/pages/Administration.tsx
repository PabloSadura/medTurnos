import { useState, useEffect } from 'react';
import { 
  Settings, Users, Shield, Database, Bell, Layout, CreditCard, 
  ChevronRight, Plus, Trash2, Download, CheckCircle2, AlertCircle,
  Palette, Smartphone, Mail, Eye, Save, ExternalLink, MessageSquare,
  Lock, Unlock, ChevronDown, UserPlus, Calendar, Gift, Award,
  Percent, Sparkles, RefreshCw, Tag, Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, getDoc, 
  getDocs, orderBy, serverTimestamp, addDoc, deleteDoc, limit, setDoc 
} from 'firebase/firestore';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { comparePatientsByLastName } from '../lib/patientNameUtils';
import { syncSingleUserPlan } from '../lib/planSyncService';
import { apiFetch } from '../lib/apiClient';
import { validatePassword } from '../lib/security';

type AdminTab = 'overview' | 'users' | 'notifications' | 'backup' | 'theme' | 'billing';

const AVAILABLE_MODULES = [
  { id: 'dashboard', label: 'Panel Principal (Dashboard)' },
  { id: 'agenda', label: 'Agenda / Turnos' },
  { id: 'patients', label: 'Pacientes' },
  { id: 'treatments', label: 'Tratamientos / Precios' },
  { id: 'inventory', label: 'Inventario / Stock' },
  { id: 'reminders', label: 'Recordatorios de Turnos' },
  { id: 'admin', label: 'Administración del Sistema' },
];

export function Administration() {
  const { showToast } = useToast();
  const { ownerId, profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [patientsCount, setPatientsCount] = useState(0);
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Plans & Billing Management
  const [dbPlans, setDbPlans] = useState<any[]>([]);
  const [activePlan, setActivePlan] = useState<any>({ name: 'Cargando Plan...', price: 0 });
  const [isPlanSelectorOpen, setIsPlanSelectorOpen] = useState(false);
  const [userPaymentStatus, setUserPaymentStatus] = useState<'al_dia' | 'incumplido'>('al_dia');
  const [isRefreshingBilling, setIsRefreshingBilling] = useState(false);
  const [userBilling, setUserBilling] = useState<{
    basePrice: number;
    totalDiscount: number;
    finalPrice: number;
    hasDiscount: boolean;
    bonificaciones: any[];
    planName: string;
    lastSyncedAt?: string;
  }>({
    basePrice: 0,
    totalDiscount: 0,
    finalPrice: 0,
    hasDiscount: false,
    bonificaciones: [],
    planName: 'Plan Profesional'
  });

  const getDueDateInfo = () => {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let dueMonth = currentMonth;
    let dueYear = currentYear;
    if (currentDay > 15) {
      dueMonth = currentMonth + 1;
      if (dueMonth > 11) {
        dueMonth = 0;
        dueYear += 1;
      }
    }

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    return {
      dayText: '15 de cada mes',
      nextDueText: `15 de ${monthNames[dueMonth]}, ${dueYear}`,
      monthName: monthNames[dueMonth],
      year: dueYear
    };
  };
  
  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);
  
  // Forms
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'secretary',
    permissions: ['agenda', 'patients'] as string[],
    status: 'Activo'
  });

  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('#00478D');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (!ownerId) return;

    // Fetch Patients Count
    const unsubscribePatients = onSnapshot(query(collection(db, 'patients'), where('userId', '==', ownerId)), (snapshot) => {
      setPatientsCount(snapshot.size);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));

    // Fetch Appointments Count
    const unsubscribeApps = onSnapshot(query(collection(db, 'appointments'), where('userId', '==', ownerId)), (snapshot) => {
      setAppointmentsCount(snapshot.size);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    // Fetch Staff
    const unsubscribeStaff = onSnapshot(query(collection(db, 'staff'), where('userId', '==', ownerId)), (snapshot) => {
      setStaff(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'staff'));

    // Fetch Real Notifications (Stock Alerts)
    const unsubscribeStock = onSnapshot(
      query(collection(db, 'stocks'), where('userId', '==', ownerId)),
      (stockSnap) => {
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
        setNotifications(alerts);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'stocks')
    );

    let unsubscribeUser = () => {};

    // Fetch Platform Plans and user choice
    getDocs(collection(db, 'plans')).then(qSnap => {
      let list: any[] = [];
      qSnap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort
      const orderMap: Record<string, number> = { 'basico': 1, 'plus': 2, 'premium': 3 };
      list.sort((a, b) => (orderMap[a.id] || 99) - (orderMap[b.id] || 99));
      setDbPlans(list);

      // Load theme, plan, and billing details from profile in real time
      unsubscribeUser = onSnapshot(doc(db, 'users', ownerId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.primaryColor) setSelectedTheme(data.primaryColor);
          if (data.darkMode !== undefined) setIsDarkMode(data.darkMode);
          if (data.paymentStatus) setUserPaymentStatus(data.paymentStatus);
          
          const activePlanKey = (data.activePlanId || data.planId || 'plus').toLowerCase();
          const userPlan = list.find(p => p.id.toLowerCase() === activePlanKey) || list.find(l => l.id === 'plus') || list[0] || { name: 'Plus', price: 40000, usersLimit: 3, secretariesLimit: 2 };
          setActivePlan(userPlan);

          // Extract or compute bonificaciones granted by administrator or referrals
          const catalogPrice = Number(userPlan.price) || 0;
          let bonos: any[] = [];

          if (Array.isArray(data.billingDetails?.bonificaciones) && data.billingDetails.bonificaciones.length > 0) {
            bonos = [...data.billingDetails.bonificaciones];
          }

          // Welcome discount for referred user
          if (data.referralInfo?.isReferred && data.referralDiscount?.active !== false && !bonos.some(b => b.source === 'referral_welcome')) {
            const dType = data.referralInfo.discountType || 'percent';
            const dVal = Number(data.referralInfo.discountValue) || 20;
            const bPrice = Number(data.basePlanPrice) || catalogPrice;
            const dAmount = dType === 'percent' ? Math.round(((bPrice * dVal) / 100) * 100) / 100 : Math.min(bPrice, dVal);
            bonos.push({
              id: 'ref-welcome-client',
              title: 'Descuento de Bienvenida por Referido',
              source: 'referral_welcome',
              discountType: dType,
              discountValue: dVal,
              discountAmount: dAmount,
              description: `Bonificación del ${dVal}${dType === 'percent' ? '%' : '$'} (Referido por ${data.referralInfo.referrerName || data.referralInfo.referrerEmail || 'Colega'})`,
              beneficiaryType: 'referred'
            });
          }

          // Referrer reward discount
          if (data.referralReward?.hasReward && Number(data.referralReward.discountValue) > 0 && !bonos.some(b => b.source === 'referral_reward')) {
            const dType = data.referralReward.discountType || 'percent';
            const dVal = Number(data.referralReward.discountValue) || 15;
            const bPrice = Number(data.basePlanPrice) || catalogPrice;
            const dAmount = dType === 'percent' ? Math.round(((bPrice * dVal) / 100) * 100) / 100 : Math.min(bPrice, dVal);
            bonos.push({
              id: 'ref-reward-client',
              title: 'Recompensa por Colega Referido',
              source: 'referral_reward',
              discountType: dType,
              discountValue: dVal,
              discountAmount: dAmount,
              description: `Bonificación del ${dVal}${dType === 'percent' ? '%' : '$'} por recomendar a ${data.referralReward.rewardFromUserName || 'Colega'}`,
              beneficiaryType: 'referrer'
            });
          }

          // Custom / Administrative bonus granted by administrator
          if (data.customBonus?.active && Number(data.customBonus.discountValue) > 0 && !bonos.some(b => b.source === 'custom_bonus')) {
            const dType = data.customBonus.discountType || 'percent';
            const dVal = Number(data.customBonus.discountValue) || 0;
            const bPrice = Number(data.basePlanPrice) || catalogPrice;
            const dAmount = dType === 'percent' ? Math.round(((bPrice * dVal) / 100) * 100) / 100 : Math.min(bPrice, dVal);
            bonos.push({
              id: 'custom-bonus-client',
              title: data.customBonus.title || 'Bonificación Especial Otorgada por el Administrador',
              source: 'custom_bonus',
              discountType: dType,
              discountValue: dVal,
              discountAmount: dAmount,
              description: data.customBonus.reason || data.customBonus.description || `Bonificación del ${dVal}${dType === 'percent' ? '%' : '$'} otorgada por la administración del sistema`,
              beneficiaryType: 'manual'
            });
          }

          // Check if there are raw bonificaciones in user document
          if (Array.isArray(data.bonificaciones)) {
            data.bonificaciones.forEach((rawB: any) => {
              if (rawB && !bonos.some(b => b.id === rawB.id)) {
                bonos.push(rawB);
              }
            });
          }

          const baseP = Number(data.basePlanPrice ?? data.billingDetails?.basePrice ?? catalogPrice);
          const totalBonosSum = bonos.reduce((s, b) => s + (Number(b.discountAmount) || 0), 0);
          const totalDisc = Math.min(baseP, Math.round(Number(data.discountApplied ?? data.billingDetails?.totalDiscount ?? totalBonosSum) * 100) / 100);
          
          let finalP = baseP - totalDisc;
          if (data.planPrice !== undefined) {
            finalP = Number(data.planPrice);
          } else if (data.billingDetails?.finalPrice !== undefined) {
            finalP = Number(data.billingDetails.finalPrice);
          }
          finalP = Math.max(0, Math.round(finalP * 100) / 100);

          setUserBilling({
            basePrice: baseP,
            totalDiscount: totalDisc,
            finalPrice: finalP,
            hasDiscount: totalDisc > 0 || bonos.length > 0,
            bonificaciones: bonos,
            planName: userPlan.name || data.billingDetails?.planName || 'Profesional',
            lastSyncedAt: data.billingDetails?.syncedAt || data.updatedAt
          });
        }
      }, (error) => console.warn("Failed listening to user doc:", error));
    }).catch(err => {
      console.warn("Failed fetching plans, using local placeholder plan:", err);
    });

    return () => {
      unsubscribePatients();
      unsubscribeApps();
      unsubscribeStaff();
      unsubscribeStock();
      unsubscribeUser();
    };
  }, [ownerId]);

  const handleSaveUser = async () => {
    if (!ownerId) return;

    // Non-admins can only create or manage 'secretary'
    const targetRole = isAdmin ? (userForm.role || 'secretary').toLowerCase() : 'secretary';

    const isBecomingSecretary = targetRole === 'secretary';
    const wasSecretary = selectedUser?.role?.toLowerCase() === 'secretary';

    if (isBecomingSecretary && !wasSecretary) {
      const currentSecretariesCount = staff.filter(s => s.role?.toLowerCase() === 'secretary').length;
      const maxSecretaries = activePlan?.secretariesLimit || 0;
      if (currentSecretariesCount >= maxSecretaries) {
        showToast(`Tu plan actual (${activePlan?.name || 'Básico'}) permite un máximo de ${maxSecretaries} ${maxSecretaries === 1 ? 'Secretaria' : 'Secretarias'}. Por favor actualiza tu plan en la pestaña Facturación.`, 'error');
        return;
      }
    }

    if (!selectedUser && !userForm.password) {
      showToast('La contraseña es obligatoria para nuevos usuarios', 'error');
      return;
    }

    if (userForm.password) {
      const pwdRes = validatePassword(userForm.password);
      if (!pwdRes.isValid) {
        showToast(pwdRes.feedback[0] || 'La contraseña no cumple con los requisitos de seguridad (mínimo 12 caracteres, mayúsculas, minúsculas, números y símbolos).', 'error');
        return;
      }
    }

    // Sanitize permissions: professionals cannot grant 'admin' permission
    const sanitizedPermissions = isAdmin 
      ? userForm.permissions 
      : userForm.permissions.filter(p => p !== 'admin');

    try {
      const { ok, status, data: result } = await apiFetch('/api/staff/manage', {
        method: 'POST',
        body: JSON.stringify({
          ...userForm,
          role: targetRole,
          permissions: sanitizedPermissions,
          userId: ownerId,
          staffId: selectedUser?.id
        })
      });

      if (!ok) {
        throw new Error(result?.error || 'Error al procesar la cuenta');
      }

      const authUid = result.uid;

      if (result.warning) {
        showToast(result.warning, 'info');
      }

      // Now sync with Firestore staff collection client-side first so relational checking succeeds
      if (selectedUser) {
        await updateDoc(doc(db, 'staff', selectedUser.id), {
          ...userForm,
          role: targetRole,
          permissions: sanitizedPermissions,
          authUid,
          updatedAt: serverTimestamp()
        });
      } else {
        // Use authUid as doc ID for easier lookup in rules
        await setDoc(doc(db, 'staff', authUid), {
          ...userForm,
          role: targetRole,
          permissions: sanitizedPermissions,
          authUid,
          userId: ownerId,
          createdAt: serverTimestamp()
        });
      }

      // Sync with users collection (Role, basic info, and status)
      await setDoc(doc(db, 'users', authUid), {
        name: userForm.name,
        email: userForm.email,
        role: targetRole,
        status: userForm.status,
        userId: ownerId,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setIsUserModalOpen(false);
      setSelectedUser(null);
      resetUserForm();
      showToast(selectedUser 
        ? (isAdmin ? 'Usuario actualizado' : 'Secretaria actualizada') 
        : (isAdmin ? 'Usuario creado y acceso configurado' : 'Secretaria creada y acceso configurado')
      );
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
      role: 'secretary',
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

  const handleToggleStaffStatus = async (user: any) => {
    const isCurrentlyActive = user.status === 'Activo';
    const newStatus = isCurrentlyActive ? 'Inactivo' : 'Activo';
    try {
      await updateDoc(doc(db, 'staff', user.id), {
        status: newStatus
      });
      try {
        await setDoc(doc(db, 'users', user.id), {
          status: newStatus,
          isBlocked: newStatus !== 'Activo',
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (_) {}

      showToast(
        newStatus === 'Activo'
          ? `Acceso de ${user.name} REACTIVADO exitosamente`
          : `Acceso de ${user.name} BLOQUEADO exitosamente`,
        newStatus === 'Activo' ? 'success' : 'info'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'staff');
    }
  };

  const handleToggleModule = (moduleId: string) => {
    const next = userForm.permissions.includes(moduleId)
      ? userForm.permissions.filter(p => p !== moduleId)
      : [...userForm.permissions, moduleId];
    setUserForm({ ...userForm, permissions: next });
  };

  const handleExportData = async (type: 'json' | 'csv') => {
    if (!ownerId) return;

    try {
      const pSnap = await getDocs(query(collection(db, 'patients'), where('userId', '==', ownerId)));
      const aSnap = await getDocs(query(collection(db, 'appointments'), where('userId', '==', ownerId)));

      const patients = pSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(comparePatientsByLastName);
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
    if (!ownerId) return;

    try {
      await updateDoc(doc(db, 'users', ownerId), {
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

  const handleRefreshBilling = async () => {
    if (!ownerId) return;
    setIsRefreshingBilling(true);
    try {
      const billing = await syncSingleUserPlan(db, ownerId);
      showToast(
        billing.hasDiscount 
          ? `Facturación actualizada: Plan ${billing.planName}, Abono bonificado: $${billing.finalPrice.toLocaleString()}/mes (-$${billing.totalDiscount.toLocaleString()})`
          : `Facturación actualizada: Plan ${billing.planName}, Abono: $${billing.finalPrice.toLocaleString()}/mes`,
        'success'
      );
    } catch (err: any) {
      showToast('No se pudo sincronizar facturación: ' + err.message, 'error');
    } finally {
      setIsRefreshingBilling(false);
    }
  };

  const handleSelectPlan = async (plan: any) => {
    if (!ownerId) return;
    try {
      await updateDoc(doc(db, 'users', ownerId), {
        activePlanId: plan.id,
        planId: plan.id
      });
      setActivePlan(plan);
      try {
        await syncSingleUserPlan(db, ownerId, plan.id);
      } catch (_) {}
      showToast(`Plan cambiado a ${plan.name} exitosamente`, 'success');
      setIsPlanSelectorOpen(false);
    } catch (e: any) {
      showToast('Error al cambiar plan: ' + e.message, 'error');
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
            <div className="space-y-6">
              {/* Plan Convenido Card */}
              <div className="bg-gradient-to-r from-primary/5 to-tertiary/5 border border-outline-variant rounded-xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-0.5 rounded-full font-sans">
                        Suscripción Convenida
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest bg-tertiary-container text-on-tertiary-container px-2.5 py-0.5 rounded-full font-sans">
                        Plan Activo
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-on-surface">Plan {activePlan?.name || 'Profesional'}</h3>
                    <p className="text-xs text-on-surface-variant font-sans">
                      Este plan define la disponibilidad de recursos y accesos para tu equipo de la clínica.
                    </p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('billing')}
                    className="self-start sm:self-center px-4 py-2 bg-primary text-white font-bold text-[10px] uppercase tracking-widest rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer font-sans"
                  >
                    <CreditCard size={12} />
                    Cambiar Plan / Facturación
                  </button>
                </div>
                
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 border-t border-outline-variant bg-white/40 p-4 rounded-xl font-sans">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">Valor del Abono Mensual</p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-[16px] font-extrabold text-on-surface">
                        ${(userBilling.hasDiscount ? userBilling.finalPrice : (activePlan?.price || 0)).toLocaleString()} / mes
                      </p>
                      {userBilling.hasDiscount && (
                        <span className="text-[11px] font-bold text-on-surface-variant line-through">
                          ${userBilling.basePrice.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {userBilling.hasDiscount && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mt-0.5">
                        <Gift size={10} /> -${userBilling.totalDiscount.toLocaleString()} Bonificado
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">Secretarias Permitidas</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-[16px] font-extrabold text-on-surface">
                        {staff.filter(s => s.role?.toLowerCase() === 'secretary').length} de {activePlan?.secretariesLimit || 0}
                      </p>
                      <span className="text-[10px] text-on-surface-variant/80">creadas</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">Usuarios Máximos (Médicos)</p>
                    <p className="text-[16px] font-extrabold text-on-surface">{activePlan?.usersLimit || 1}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant font-sans">Estado de la Cuenta</p>
                    <p className="text-[16px] font-extrabold text-secondary">Activo y Operativo</p>
                  </div>
                </div>
              </div>

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
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">
                    {isAdmin ? "Gestión de Personal y Equipo" : "Gestión de Secretarias"}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant font-sans flex items-center gap-1.5">
                    Límite del Plan: <strong className="text-on-surface font-extrabold">{staff.filter(s => s.role?.toLowerCase() === 'secretary').length} de {activePlan?.secretariesLimit || 0}</strong> Secretarias registradas.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    resetUserForm();
                    setSelectedUser(null);
                    setIsUserModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-1.5 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-primary/90 transition-all font-sans cursor-pointer w-full sm:w-auto"
                >
                  <Plus size={14} />
                  {isAdmin ? "Invitar Usuario" : "Invitar Secretaria"}
                </button>
              </div>

              {/* Mobile Cards View */}
              <div className="block md:hidden divide-y divide-outline-variant/40">
                {staff.map((p) => (
                  <div key={p.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-on-surface truncate">{p.name}</p>
                          <p className="text-xs text-on-surface-variant truncate">{p.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => handleToggleStaffStatus(p)}
                          className={cn(
                            "p-2 rounded-lg transition-colors cursor-pointer",
                            p.status === 'Activo'
                              ? "hover:bg-error-container/20 text-error"
                              : "hover:bg-tertiary-container/20 text-tertiary"
                          )}
                          title={p.status === 'Activo' ? 'Bloquear acceso' : 'Reactivar acceso'}
                        >
                          {p.status === 'Activo' ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedUser(p);
                            setUserForm({
                              name: p.name,
                              email: p.email,
                              password: '',
                              role: isAdmin ? (p.role || 'secretary') : 'secretary',
                              permissions: p.permissions || [],
                              status: p.status
                            });
                            setIsUserModalOpen(true);
                          }}
                          className="p-2 hover:bg-surface rounded-lg text-on-surface-variant transition-colors"
                          title="Editar"
                        >
                          <Settings size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteStaff(p.id)}
                          className="p-2 hover:bg-error-container/20 rounded-lg text-error transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-outline-variant/30 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium px-2 py-0.5 bg-surface rounded-full text-on-surface-variant">
                          {p.role}
                        </span>
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter",
                          p.status === 'Activo' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-dim text-on-surface-variant'
                        )}>
                          {p.status}
                        </span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {p.permissions?.slice(0, 2).map((perm: string) => (
                          <span key={perm} className="text-[8px] bg-primary/5 text-primary px-1 rounded border border-primary/10">
                            {AVAILABLE_MODULES.find(m => m.id === perm)?.label || perm}
                          </span>
                        ))}
                        {p.permissions?.length > 2 && <span className="text-[8px] text-on-surface-variant">+{p.permissions.length - 2}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {staff.length === 0 && !loading && (
                  <div className="p-8 text-center text-on-surface-variant">
                    <UserPlus size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-bold uppercase tracking-widest opacity-40">No hay personal registrado</p>
                  </div>
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
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
                                  role: isAdmin ? (p.role || 'secretary') : 'secretary',
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
                    <Shield size={18} className="text-secondary" />
                    Estado del Sistema
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-secondary-container/10 border border-secondary/20 rounded-lg flex items-center gap-3">
                      <CheckCircle2 className="text-secondary shrink-0" size={18} />
                      <div>
                        <p className="text-[12px] font-bold text-on-surface">Base de datos sincronizada</p>
                        <p className="text-[10px] text-on-surface-variant">Conexión activa y segura en la nube con Firestore.</p>
                      </div>
                    </div>
                    <div className="p-3 bg-primary-container/10 border border-primary/20 rounded-lg flex items-center gap-3">
                      <Users className="text-primary shrink-0" size={18} />
                      <div>
                        <p className="text-[12px] font-bold text-on-surface">Control de accesos y personal</p>
                        <p className="text-[10px] text-on-surface-variant">Gestión de roles y permisos del equipo.</p>
                      </div>
                    </div>
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
              {userPaymentStatus === 'incumplido' && (
                <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-error shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-error">Aviso de Facturación: Pago Pendiente</h4>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      Se registra un pago pendiente correspondiente al abono mensual. Recordamos que los vencimientos operan los <strong>días 15 de cada mes</strong>. Por favor, comuníquese con el administrador del sistema para regularizar su cuenta y evitar la suspensión del servicio.
                    </p>
                  </div>
                </div>
              )}

              {/* Plan Disponible Card */}
              <div className="bg-white p-6 sm:p-8 rounded-xl border border-primary/20 bg-primary/5 shadow-sm flex flex-col md:flex-row items-center gap-8">
                <div className="w-20 h-20 bg-primary text-white rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 shrink-0">
                  <CreditCard size={40} />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="flex flex-col md:flex-row md:items-baseline gap-2 mb-1">
                    <h3 className="text-xl font-black text-on-surface">Plan {userBilling.planName || activePlan?.name || 'Profesional'}</h3>
                    <span className="text-[11px] font-bold bg-primary text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">Plan Activo</span>
                    {userBilling.hasDiscount && (
                      <span className="text-[11px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-1 w-fit mx-auto md:mx-0">
                        <Sparkles size={11} /> Con Bonificación
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-on-surface-variant font-sans">
                    Vencimiento de la suscripción: <strong className="text-on-surface font-bold">los días 15 de cada mes</strong>
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-6 font-sans">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-[24px] font-black text-on-surface">
                          ${(userBilling.hasDiscount ? userBilling.finalPrice : (activePlan?.price || 0)).toLocaleString()}
                        </p>
                        {userBilling.hasDiscount && (
                          <span className="text-xs font-bold text-on-surface-variant line-through">
                            ${userBilling.basePrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-on-surface-variant uppercase font-black">
                        {userBilling.hasDiscount ? "Al Mes (Con Bonificación)" : "Al Mes"}
                      </p>
                    </div>
                    <div className="h-8 w-[1px] bg-outline-variant hidden sm:block"></div>
                    <div>
                      <p className="text-[20px] font-bold text-on-surface">{activePlan?.usersLimit || 1}</p>
                      <p className="text-[10px] text-on-surface-variant uppercase font-black">Usuarios Prof.</p>
                    </div>
                    <div className="h-8 w-[1px] bg-outline-variant hidden sm:block"></div>
                    <div>
                      <p className="text-[20px] font-bold text-on-surface">{activePlan?.secretariesLimit || 1}</p>
                      <p className="text-[10px] text-on-surface-variant uppercase font-black">Secretarias</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 w-full md:w-auto font-sans">
                  <button 
                    onClick={() => setIsPlanSelectorOpen(true)}
                    className="px-6 py-2.5 bg-primary text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all cursor-pointer shadow-sm text-center"
                  >
                    Cambiar Plan
                  </button>
                  <button 
                    onClick={handleRefreshBilling}
                    disabled={isRefreshingBilling}
                    className="px-4 py-2 bg-white border border-outline-variant text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={cn(isRefreshingBilling && "animate-spin text-primary")} />
                    {isRefreshingBilling ? "Actualizando..." : "Actualizar Facturación"}
                  </button>
                </div>
              </div>

              {/* Bonificaciones y Descuentos Otorgados por la Administración */}
              {userBilling.hasDiscount ? (
                <div className="bg-white border-2 border-emerald-500/20 rounded-2xl p-6 shadow-sm overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-outline-variant/60">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
                        <Gift size={20} />
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold text-on-surface flex items-center gap-2">
                          Bonificaciones y Descuentos Otorgados por la Administración
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Activo
                          </span>
                        </h4>
                        <p className="text-xs text-on-surface-variant font-sans">
                          Descuentos especiales aplicados directamente por el administrador sobre tu suscripción mensual.
                        </p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <span className="text-[10px] uppercase font-black tracking-widest text-emerald-700 block">Ahorro Mensual</span>
                      <span className="text-lg font-black text-emerald-700">-${userBilling.totalDiscount.toLocaleString()} / mes</span>
                    </div>
                  </div>

                  {/* List of Bonificaciones */}
                  <div className="mt-5 space-y-3 font-sans">
                    {userBilling.bonificaciones.map((bono: any, idx: number) => {
                      const isReferralWelcome = bono.source === 'referral_welcome';
                      const isReferralReward = bono.source === 'referral_reward';
                      const isManualBonus = bono.source === 'custom_bonus' || bono.beneficiaryType === 'manual';

                      return (
                        <div 
                          key={bono.id || idx}
                          className="bg-surface/50 border border-outline-variant/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-emerald-300 transition-colors"
                        >
                          <div className="flex items-start gap-3.5">
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                              isReferralWelcome ? "bg-blue-100 text-blue-700" :
                              isReferralReward ? "bg-purple-100 text-purple-700" :
                              "bg-emerald-100 text-emerald-700"
                            )}>
                              {isReferralWelcome ? <Sparkles size={18} /> :
                               isReferralReward ? <Award size={18} /> :
                               <Tag size={18} />}
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="text-sm font-bold text-on-surface">{bono.title}</h5>
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                                  isReferralWelcome ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                  isReferralReward ? "bg-purple-50 text-purple-700 border border-purple-200" :
                                  "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                )}>
                                  {isReferralWelcome ? "Colega Referido" :
                                   isReferralReward ? "Recompensa por Recomendar" :
                                   "Bonificación Administrativa"}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface-variant leading-relaxed">
                                {bono.description}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 pt-0.5">
                                <CheckCircle2 size={13} />
                                <span>Aplicado directamente en tu abono mensual</span>
                              </div>
                            </div>
                          </div>

                          <div className="sm:text-right shrink-0 bg-white/80 sm:bg-transparent p-2.5 sm:p-0 rounded-lg border sm:border-0 border-outline-variant/50">
                            <div className="text-sm font-black text-emerald-700">
                              -${(Number(bono.discountAmount) || 0).toLocaleString()}
                            </div>
                            <div className="text-[10px] font-bold text-on-surface-variant uppercase">
                              {bono.discountValue}{bono.discountType === 'percent' ? '% de descuento' : ' fijos bonificados'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumen Financiero del Abono */}
                  <div className="mt-5 pt-5 border-t border-outline-variant/60 bg-emerald-50/40 -mx-6 -mb-6 p-6 font-sans">
                    <h5 className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                      Liquidación del Abono Mensual
                    </h5>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center text-on-surface-variant">
                        <span>Precio base de lista ({userBilling.planName || 'Plan'}):</span>
                        <span className="font-semibold">${userBilling.basePrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-700 font-medium">
                        <span className="flex items-center gap-1">
                          <Gift size={12} /> Total de bonificaciones y descuentos aplicados:
                        </span>
                        <span className="font-bold">-${userBilling.totalDiscount.toLocaleString()}</span>
                      </div>
                      <div className="pt-2 border-t border-outline-variant flex justify-between items-center text-sm">
                        <span className="font-extrabold text-on-surface">Total mensual a abonar:</span>
                        <div className="text-right">
                          <span className="font-black text-primary text-base">${userBilling.finalPrice.toLocaleString()}</span>
                          <span className="text-[10px] text-on-surface-variant block uppercase font-bold">Vence el 15 de cada mes</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Banner informativo si no tiene descuento activo */
                <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-sans">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Gift size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-on-surface">Programa de Bonificaciones y Referidos</h4>
                      <p className="text-xs text-on-surface-variant mt-0.5 max-w-2xl">
                        Recomendá TurneroWeb a otros profesionales médicos para obtener descuentos automáticos y bonificaciones acumulables en tu suscripción mensual. Las bonificaciones otorgadas por la administración se reflejan directamente aquí.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Vencimiento y Estado de Pago */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
                <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Vencimiento del Servicio</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-on-surface">{getDueDateInfo().dayText}</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">Próximo: {getDueDateInfo().nextDueText}</p>
                    </div>
                    <Calendar size={20} className="text-primary" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Estado de Pago</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn(
                        "text-sm font-bold",
                        userPaymentStatus === 'incumplido' ? "text-error" : "text-tertiary"
                      )}>
                        {userPaymentStatus === 'incumplido' ? "Pago Incumplido" : "Al Día"}
                      </p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        {userPaymentStatus === 'incumplido' ? "Regularización pendiente" : "Abono regularizado"}
                      </p>
                    </div>
                    {userPaymentStatus === 'incumplido' ? (
                      <AlertCircle size={20} className="text-error" />
                    ) : (
                      <CheckCircle2 size={20} className="text-tertiary" />
                    )}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-outline-variant shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Soporte de Plataforma</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-on-surface">Atención 24/7</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">Asistencia y asesoramiento</p>
                    </div>
                    <Smartphone size={20} className="text-on-surface-variant/40" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Staff Modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title={
          isAdmin 
            ? (selectedUser ? "Editar Acceso" : "Nuevo Acceso")
            : (selectedUser ? "Editar Secretaria" : "Nueva Secretaria")
        }
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
              placeholder={isAdmin ? "Ej. Marta Rodriguez" : "Ej. Secretaria María Gómez"}
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
                placeholder="secretaria@ejemplo.com"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Rol</label>
              {isAdmin ? (
                <select 
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-xl text-sm outline-none focus:border-primary transition-all appearance-none"
                >
                  <option value="secretary">Secretaría</option>
                  <option value="admin">Administrador</option>
                  <option value="medico">Médico / Profesional</option>
                </select>
              ) : (
                <div className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-sm font-semibold text-on-surface flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0"></span>
                    Secretaría
                  </span>
                  <span className="text-[9px] uppercase font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full tracking-wider">
                    Exclusivo
                  </span>
                </div>
              )}
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
              {(isAdmin ? AVAILABLE_MODULES : AVAILABLE_MODULES.filter(m => m.id !== 'admin')).map((module) => (
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
              {selectedUser ? "Actualizar" : (isAdmin ? "Crear Acceso" : "Crear Secretaria")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Plan Selection Modal */}
      <Modal
        isOpen={isPlanSelectorOpen}
        onClose={() => setIsPlanSelectorOpen(false)}
        title="Cambiar Plan de Suscripción"
        className="max-w-4xl font-sans"
      >
        <div className="space-y-6">
          <p className="text-sm text-on-surface-variant">Selecciona el plan que mejor se adapte al volumen de tu clínica y equipo. El límite de usuarios y secretarias se aplicará de inmediato.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dbPlans.map((plan) => {
              const isCurrent = plan.id === activePlan?.id;
              return (
                <div 
                  key={plan.id} 
                  className={cn(
                    "border rounded-2xl p-6 flex flex-col justify-between transition-all",
                    isCurrent 
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-md" 
                      : "border-outline-variant hover:border-primary/50 shadow-sm bg-white"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-extrabold text-on-surface text-lg">{plan.name}</h4>
                      {isCurrent && (
                        <span className="text-[9px] font-bold bg-primary text-white px-2 py-0.5 rounded-full uppercase">Activo</span>
                      )}
                    </div>
                    
                    <div className="mb-4">
                      <span className="text-3xl font-black text-on-surface">${plan.price}</span>
                      <span className="text-xs text-on-surface-variant font-medium"> / mes</span>
                    </div>

                    <ul className="space-y-3 mb-6 text-xs text-on-surface-variant font-medium">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        <span>{plan.usersLimit} {plan.usersLimit === 1 ? 'Usuario Profesional' : 'Usuarios Profesionales'}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        <span>{plan.secretariesLimit} {plan.secretariesLimit === 1 ? 'Secretaria' : 'Secretarias'} por usuario</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        <span>Gestión integral de turnos y pacientes</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        <span>Soporte estándar</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    disabled={isCurrent}
                    onClick={() => handleSelectPlan(plan)}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all cursor-pointer",
                      isCurrent
                        ? "bg-outline-variant text-on-surface-variant/50 cursor-not-allowed"
                        : "bg-primary text-white hover:bg-primary/95 shadow-sm hover:shadow-md"
                    )}
                  >
                    {isCurrent ? 'Plan Actual' : 'Seleccionar Plan'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
            <button 
              onClick={() => setIsPlanSelectorOpen(false)}
              className="px-6 py-2 bg-surface hover:bg-outline-variant border border-outline-variant rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

