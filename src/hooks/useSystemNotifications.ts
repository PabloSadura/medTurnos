import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface SystemNotification {
  id: string;
  type: 'stock' | 'invoice' | 'motivational';
  title: string;
  message: string;
  time: string;
  status: 'error' | 'warning' | 'motivation';
  link: string;
}

const MOTIVATIONAL_QUOTES = [
  'Cada paciente que atendés hoy es una oportunidad de transformar una vida con tu vocación y empatía.',
  'Tu dedicación y excelencia profesional construyen confianza y bienestar en cada consulta. ¡Gran jornada!',
  'El arte de curar y acompañar empieza con una sonrisa y una escucha atenta. ¡Éxitos en tus turnos de hoy!',
  'Un gran día en el consultorio se construye turno a turno. Tu compromiso marca la diferencia.',
  'La medicina y el cuidado de la salud son el puente entre la ciencia y la calidez humana. ¡Excelente día de trabajo!',
  'Detrás de cada turno programado hay alguien que confía en tu talento. ¡Que tengas una jornada extraordinaria!',
  'Tu esfuerzo diario impulsa el bienestar de tus pacientes. ¡Arrancá esta jornada de turnos con toda la energía!'
];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function useSystemNotifications() {
  const { ownerId, user } = useAuth();
  const [stockNotifications, setStockNotifications] = useState<SystemNotification[]>([]);
  const [invoiceNotifications, setInvoiceNotifications] = useState<SystemNotification[]>([]);
  const [motivationalNotifications, setMotivationalNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Set of read notification IDs persisted in localStorage per user
  const storageKey = user?.uid ? `medturnos_read_notifications_${user.uid}` : 'medturnos_read_notifications';
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {
      // Ignored
    }
    return new Set<string>();
  });

  // Reload read notifications if user changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setReadIds(new Set(JSON.parse(saved)));
      } else {
        setReadIds(new Set<string>());
      }
    } catch {
      setReadIds(new Set<string>());
    }
  }, [storageKey]);

  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // Ignored
      }
      return next;
    });
  };

  const markAllAsRead = (idsToMark?: string[]) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (idsToMark && idsToMark.length > 0) {
        idsToMark.forEach((id) => next.add(id));
      } else {
        notifications.forEach((n) => next.add(n.id));
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // Ignored
      }
      return next;
    });
  };

  const resetReadNotifications = () => {
    setReadIds(new Set<string>());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    if (!ownerId || !user) {
      setStockNotifications([]);
      setInvoiceNotifications([]);
      setMotivationalNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Notificaciones de Stock Bajo (stocks collection)
    const unsubscribeStock = onSnapshot(
      query(collection(db, 'stocks'), where('userId', '==', ownerId)),
      (stockSnap) => {
        const alerts: SystemNotification[] = stockSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((d) => Number(d.stock) <= Number(d.minStock))
          .map((d) => {
            const currentStock = Number(d.stock) || 0;
            const minRequired = Number(d.minStock) || 0;
            const isZero = currentStock <= 0;
            return {
              id: `stock-${d.id}`,
              type: 'stock' as const,
              title: isZero ? `Sin stock: ${d.name}` : `Stock bajo: ${d.name}`,
              message: `Quedan ${currentStock} ${d.unit || 'uds'} disponibles (mínimo requerido: ${minRequired}).`,
              time: isZero ? 'Reposición urgente' : 'Alerta de inventario',
              status: isZero ? ('error' as const) : ('warning' as const),
              link: '/inventory'
            };
          });
        setStockNotifications(alerts);
        setLoading(false);
      },
      (err) => {
        console.warn('Error listening to stock notifications:', err);
        setLoading(false);
      }
    );

    // 2. Notificaciones de Facturas Próximas a Vencer o Pendientes (solo lectura del documento del usuario)
    const unsubscribeInvoice = onSnapshot(
      doc(db, 'users', ownerId),
      (userSnap) => {
        const alerts: SystemNotification[] = [];
        const now = new Date();
        const currentDay = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthName = MONTH_NAMES[currentMonth];

        const data = userSnap.exists() ? userSnap.data() : {};
        const paymentStatus = data?.paymentStatus || 'al_dia';
        const planName = data?.billingDetails?.planName || data?.activePlanId || data?.planId || 'Profesional';

        if (paymentStatus === 'incumplido') {
          alerts.push({
            id: `invoice-overdue-${currentYear}-${currentMonth}`,
            type: 'invoice',
            title: 'Factura pendiente de pago',
            message: `Tu suscripción (Plan ${String(planName).toUpperCase()}) registra un saldo pendiente. Los vencimientos operan el día 15 de cada mes.`,
            time: `Vencimiento 15 de ${monthName}`,
            status: 'error',
            link: '/admin?tab=billing'
          });
        } else if (currentDay >= 8 && currentDay <= 15) {
          // Aviso preventivo dentro de los 7 días previos al vencimiento del día 15
          const daysRemaining = 15 - currentDay;
          alerts.push({
            id: `invoice-upcoming-${currentYear}-${currentMonth}`,
            type: 'invoice',
            title:
              daysRemaining === 0
                ? 'Tu factura vence hoy'
                : `Factura próxima a vencer (${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'})`,
            message:
              daysRemaining === 0
                ? `Hoy 15 de ${monthName} opera el vencimiento mensual del abono de tu Plan ${String(planName).toUpperCase()}.`
                : `El próximo 15 de ${monthName} vence el abono mensual de tu suscripción (Plan ${String(planName).toUpperCase()}).`,
            time: `Vence el 15 de ${monthName}`,
            status: 'warning',
            link: '/admin?tab=billing'
          });
        }

        setInvoiceNotifications(alerts);
      },
      (err) => {
        console.warn('Error listening to invoice notifications:', err);
      }
    );

    // 3. Notificaciones Motivacionales los días que hay turnos programados
    const unsubscribeAppointments = onSnapshot(
      query(collection(db, 'appointments'), where('userId', '==', ownerId)),
      (appSnap) => {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const todayAppointments = appSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((a) => {
            if (a.date !== todayStr) return false;
            const st = String(a.status || '').toLowerCase();
            return st !== 'cancelado' && st !== 'cancelled';
          });

        if (todayAppointments.length > 0) {
          const count = todayAppointments.length;
          const quote = MOTIVATIONAL_QUOTES[now.getDay() % MOTIVATIONAL_QUOTES.length];
          setMotivationalNotifications([
            {
              id: `motivational-${todayStr}`,
              type: 'motivational',
              title: `¡Jornada activa! Hoy tenés ${count} ${count === 1 ? 'turno programado' : 'turnos programados'}`,
              message: `«${quote}»`,
              time: 'Motivación para tus turnos de hoy',
              status: 'motivation',
              link: '/agenda'
            }
          ]);
        } else {
          setMotivationalNotifications([]);
        }
      },
      (err) => {
        console.warn('Error listening to appointments for motivational notifications:', err);
      }
    );

    return () => {
      unsubscribeStock();
      unsubscribeInvoice();
      unsubscribeAppointments();
    };
  }, [ownerId, user]);

  // Todas las notificaciones generadas
  const allNotifications: SystemNotification[] = [
    ...invoiceNotifications,
    ...stockNotifications,
    ...motivationalNotifications
  ];

  // Solo notificaciones no leídas activas para el contador y panel activo
  const notifications: SystemNotification[] = allNotifications.filter((n) => !readIds.has(n.id));

  // Notificaciones críticas de alerta no leídas
  const alertNotificationsCount = notifications.filter((n) => n.type === 'stock' || n.type === 'invoice').length;

  return {
    allNotifications,
    notifications,
    stockNotifications: stockNotifications.filter((n) => !readIds.has(n.id)),
    invoiceNotifications: invoiceNotifications.filter((n) => !readIds.has(n.id)),
    motivationalNotifications: motivationalNotifications.filter((n) => !readIds.has(n.id)),
    allStockNotifications: stockNotifications,
    allInvoiceNotifications: invoiceNotifications,
    allMotivationalNotifications: motivationalNotifications,
    readIds,
    isRead: (id: string) => readIds.has(id),
    markAsRead,
    markAllAsRead,
    resetReadNotifications,
    alertNotificationsCount,
    totalCount: notifications.length,
    hasNotifications: notifications.length > 0,
    hasCriticalAlerts: alertNotificationsCount > 0,
    loading
  };
}
