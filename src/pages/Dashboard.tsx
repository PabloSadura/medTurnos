import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  Users, 
  CalendarCheck, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  PieChart as PieChartIcon, 
  Edit2, 
  CalendarClock, 
  CheckCircle2,
  Calendar,
  BarChart3,
  ChevronDown,
  Activity,
  Check,
  AlertCircle,
  XCircle,
  Percent,
  DollarSign,
  Package,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, updateDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import {
  MONTHS_ES,
  getAppointmentDateString,
  normalizeStatus,
  getAppointmentRevenue,
  formatMonthLabel,
  generatePastMonths,
  getMonthsBetween,
  computeMonthlyEvolution
} from '../lib/dashboardUtils';

type TimeframePreset = '1m' | '3m' | '6m' | '12m' | 'specific' | 'custom';
type EvolutionMetric = 'patients' | 'revenue' | 'status';
type ChartDisplayType = 'area' | 'bar';
type SingleMonthGranularity = 'days' | 'weekdays';

export function Dashboard() {
  const { ownerId } = useAuth();
  const { showToast } = useToast();

  // Evolution Timeframe Controls
  const [timeframeMode, setTimeframeMode] = useState<TimeframePreset>('3m');
  const [evolutionMetric, setEvolutionMetric] = useState<EvolutionMetric>('patients');
  const [chartType, setChartType] = useState<ChartDisplayType>('area');
  const [singleMonthGranularity, setSingleMonthGranularity] = useState<SingleMonthGranularity>('days');
  const [showTable, setShowTable] = useState(true);

  // Specific / Custom Month controls
  const now = useMemo(() => new Date(), []);
  const currentYearMonth = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [now]);

  const [specificMonth, setSpecificMonth] = useState<string>(currentYearMonth);
  const [customStartMonth, setCustomStartMonth] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [customEndMonth, setCustomEndMonth] = useState<string>(currentYearMonth);

  // Edit Appointment Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editData, setEditData] = useState({ id: '', patientName: '', date: '', time: '', type: '', notes: '' });

  // Data from Firestore
  const [rawAppointments, setRawAppointments] = useState<any[]>([]);
  const [rawEvolutions, setRawEvolutions] = useState<any[]>([]);
  const [rawPatientPackages, setRawPatientPackages] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [totalPatientsCount, setTotalPatientsCount] = useState<number>(0);
  const [inventoryTotalValue, setInventoryTotalValue] = useState<number>(0);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to Firestore collections
  useEffect(() => {
    if (!ownerId) return;

    // Treatments
    const unsubscribeTreatments = onSnapshot(
      query(collection(db, 'treatments'), where('userId', '==', ownerId)),
      (snapshot) => {
        setTreatments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'treatments')
    );

    // Evolutions (clinical attentions with exact historic paid amounts)
    const unsubscribeEvolutions = onSnapshot(
      query(collection(db, 'evolutions'), where('userId', '==', ownerId)),
      (snapshot) => {
        setRawEvolutions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'evolutions')
    );

    // Patient Packages (Purchases of packages and bonos)
    const unsubscribePackages = onSnapshot(
      query(collection(db, 'patient_packages'), where('userId', '==', ownerId)),
      (snapshot) => {
        setRawPatientPackages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'patient_packages')
    );

    // Total Patients registered
    const unsubscribePatients = onSnapshot(
      query(collection(db, 'patients'), where('userId', '==', ownerId)),
      (snapshot) => {
        setTotalPatientsCount(snapshot.size);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'patients')
    );

    // Inventory Value
    const unsubscribeInventory = onSnapshot(
      query(collection(db, 'stocks'), where('userId', '==', ownerId)),
      (snapshot) => {
        const total = snapshot.docs.reduce((acc, docSnap) => {
          const d = docSnap.data();
          return acc + ((d.stock || 0) * (d.price || 0));
        }, 0);
        setInventoryTotalValue(total);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'stocks')
    );

    // All user appointments (for full historical analysis)
    const unsubscribeAppointments = onSnapshot(
      query(collection(db, 'appointments'), where('userId', '==', ownerId)),
      (snapshot) => {
        const apps = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));
        setRawAppointments(apps);

        // Calculate Upcoming Appointments
        const nowTs = Date.now();
        const upcoming = apps
          .filter((apt: any) => {
            let aptTs = 0;
            if (apt.startTime?.toDate) {
              aptTs = apt.startTime.toDate().getTime();
            } else if (apt.startTime) {
              aptTs = new Date(apt.startTime).getTime();
            } else if (apt.date) {
              aptTs = new Date(`${apt.date}T${apt.time || '00:00'}`).getTime();
            }
            return aptTs >= nowTs;
          })
          .sort((a: any, b: any) => {
            const dateA = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime || a.date);
            const dateB = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime || b.date);
            return dateA.getTime() - dateB.getTime();
          })
          .slice(0, 6);

        setUpcomingAppointments(upcoming);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'appointments')
    );

    return () => {
      unsubscribeTreatments();
      unsubscribeEvolutions();
      unsubscribePackages();
      unsubscribePatients();
      unsubscribeInventory();
      unsubscribeAppointments();
    };
  }, [ownerId]);

  // Auto-freeze historical price on legacy finished appointments without stored cost,
  // so future treatment price edits in the catalog never alter past records.
  useEffect(() => {
    if (!ownerId || rawAppointments.length === 0 || treatments.length === 0) return;
    
    const unfreezedFinished = rawAppointments.filter(app => {
      const isFinished = normalizeStatus(app.status) === 'finished';
      const hasStoredCost = (typeof app.cost === 'number' && !isNaN(app.cost)) ||
                            (typeof app.price === 'number' && !isNaN(app.price)) ||
                            (typeof app.paidAmount === 'number' && !isNaN(app.paidAmount));
      return isFinished && !hasStoredCost;
    });

    if (unfreezedFinished.length === 0) return;

    const batch = writeBatch(db);
    let count = 0;
    unfreezedFinished.forEach(app => {
      const matchingEvo = rawEvolutions.find(ev => 
        (app.evolutionId && ev.id === app.evolutionId) ||
        (ev.appointmentId && ev.appointmentId === app.id) ||
        (ev.patientId && app.patientId && ev.patientId === app.patientId && ev.date && app.date && ev.date === app.date)
      );
      const evoPaid = matchingEvo ? (matchingEvo.paidAmount ?? matchingEvo.cost) : null;
      const t = treatments.find(trait => trait.name === app.type || trait.name === app.treatment);
      const amountToFreeze = (typeof evoPaid === 'number' && !isNaN(evoPaid)) 
        ? evoPaid 
        : (t?.cost ? Number(t.cost) : 0);

      batch.update(doc(db, 'appointments', app.id), {
        cost: amountToFreeze,
        price: amountToFreeze,
        paidAmount: amountToFreeze,
        updatedAt: serverTimestamp()
      });
      count++;
    });

    if (count > 0) {
      batch.commit().catch(err => console.warn('Could not auto-freeze historical costs:', err));
    }
  }, [ownerId, rawAppointments, rawEvolutions, treatments]);

  // Determine list of available months in data for dropdown selection
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    rawAppointments.forEach(a => {
      const dateStr = getAppointmentDateString(a);
      if (dateStr && dateStr.length >= 7) {
        monthSet.add(dateStr.substring(0, 7));
      }
    });

    rawEvolutions.forEach(ev => {
      const d = ev.date || (ev.createdAt?.toDate ? ev.createdAt.toDate().toISOString().split('T')[0] : '');
      if (d && d.length >= 7) {
        monthSet.add(d.substring(0, 7));
      }
    });

    rawPatientPackages.forEach(pkg => {
      const d = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
      if (d && d.length >= 7) {
        monthSet.add(d.substring(0, 7));
      }
    });

    // Ensure at least past 12 months are in the list
    const past12 = generatePastMonths(12, now);
    past12.forEach(m => monthSet.add(m));

    return Array.from(monthSet).sort().reverse(); // Newest first
  }, [rawAppointments, rawEvolutions, rawPatientPackages, now]);

  // Compute selected months based on active timeframe
  const selectedMonths = useMemo(() => {
    if (timeframeMode === '1m') {
      return [currentYearMonth];
    }
    if (timeframeMode === '3m') {
      return generatePastMonths(3, now);
    }
    if (timeframeMode === '6m') {
      return generatePastMonths(6, now);
    }
    if (timeframeMode === '12m') {
      return generatePastMonths(12, now);
    }
    if (timeframeMode === 'specific') {
      return [specificMonth || currentYearMonth];
    }
    if (timeframeMode === 'custom') {
      return getMonthsBetween(customStartMonth, customEndMonth);
    }
    return [currentYearMonth];
  }, [timeframeMode, currentYearMonth, specificMonth, customStartMonth, customEndMonth, now]);

  // Label describing the selected timeframe
  const timeframeLabel = useMemo(() => {
    if (selectedMonths.length === 1) {
      return formatMonthLabel(selectedMonths[0], 'full');
    }
    if (selectedMonths.length > 1) {
      const first = formatMonthLabel(selectedMonths[0], 'full');
      const last = formatMonthLabel(selectedMonths[selectedMonths.length - 1], 'full');
      return `${first} — ${last} (${selectedMonths.length} meses)`;
    }
    return 'Período seleccionado';
  }, [selectedMonths]);

  // Monthly Evolution Data
  const monthlyEvolutionData = useMemo(() => {
    return computeMonthlyEvolution(selectedMonths, rawAppointments, treatments, rawEvolutions, rawPatientPackages);
  }, [selectedMonths, rawAppointments, treatments, rawEvolutions, rawPatientPackages]);

  // Single-month daily/weekly breakdown data
  const singleMonthData = useMemo(() => {
    if (selectedMonths.length !== 1) return [];
    const ym = selectedMonths[0];
    const [yearStr, monthStr] = ym.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const monthApps = rawAppointments.filter(a => {
      const d = getAppointmentDateString(a);
      return d.startsWith(ym);
    });

    const monthEvolutions = rawEvolutions.filter(ev => {
      const d = ev.date || (ev.createdAt?.toDate ? ev.createdAt.toDate().toISOString().split('T')[0] : '');
      return typeof d === 'string' && d.startsWith(ym);
    });

    const monthPackages = rawPatientPackages.filter(pkg => {
      const d = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
      return typeof d === 'string' && d.startsWith(ym);
    });

    const standaloneEvolutions = monthEvolutions.filter(ev => {
      const isLinkedToAnyApp = monthApps.some(a => 
        (ev.appointmentId && a.id === ev.appointmentId) || 
        (a.evolutionId && a.evolutionId === ev.id) || 
        (a.patientId && ev.patientId && a.patientId === ev.patientId && a.date === ev.date)
      );
      return !isLinkedToAnyApp;
    });

    if (singleMonthGranularity === 'weekdays') {
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const dayCount: Record<string, { appointments: number; finished: number; appointmentsRevenue: number; packagesRevenue: number; revenue: number }> = {
        'Lun': { appointments: 0, finished: 0, appointmentsRevenue: 0, packagesRevenue: 0, revenue: 0 },
        'Mar': { appointments: 0, finished: 0, appointmentsRevenue: 0, packagesRevenue: 0, revenue: 0 },
        'Mié': { appointments: 0, finished: 0, appointmentsRevenue: 0, packagesRevenue: 0, revenue: 0 },
        'Jue': { appointments: 0, finished: 0, appointmentsRevenue: 0, packagesRevenue: 0, revenue: 0 },
        'Vie': { appointments: 0, finished: 0, appointmentsRevenue: 0, packagesRevenue: 0, revenue: 0 },
        'Sáb': { appointments: 0, finished: 0, appointmentsRevenue: 0, packagesRevenue: 0, revenue: 0 },
        'Dom': { appointments: 0, finished: 0, appointmentsRevenue: 0, packagesRevenue: 0, revenue: 0 },
      };

      monthApps.forEach(app => {
        const dStr = getAppointmentDateString(app);
        const [y, m, d] = dStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayName = days[dateObj.getDay()];
        if (dayCount[dayName]) {
          dayCount[dayName].appointments++;
          const st = normalizeStatus(app.status);
          if (st === 'finished') {
            dayCount[dayName].finished++;
            const rev = getAppointmentRevenue(app, treatments, monthEvolutions);
            dayCount[dayName].appointmentsRevenue += rev;
            dayCount[dayName].revenue += rev;
          }
        }
      });

      // Add standalone clinical attentions to weekday counts
      standaloneEvolutions.forEach(ev => {
        const dStr = ev.date || '';
        if (dStr) {
          const [y, m, d] = dStr.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          const dayName = days[dateObj.getDay()];
          if (dayCount[dayName]) {
            dayCount[dayName].appointments++;
            dayCount[dayName].finished++;
            const evPaid = (typeof ev.paidAmount === 'number' && !isNaN(ev.paidAmount))
              ? ev.paidAmount
              : (typeof ev.cost === 'number' && !isNaN(ev.cost))
                ? ev.cost
                : 0;
            dayCount[dayName].appointmentsRevenue += evPaid;
            dayCount[dayName].revenue += evPaid;
          }
        }
      });

      // Add package purchases to weekday counts
      monthPackages.forEach(pkg => {
        const dStr = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
        if (dStr) {
          const [y, m, d] = dStr.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          const dayName = days[dateObj.getDay()];
          if (dayCount[dayName]) {
            const pkgPrice = Number(pkg.pricePaid) || 0;
            dayCount[dayName].packagesRevenue += pkgPrice;
            dayCount[dayName].revenue += pkgPrice;
          }
        }
      });

      return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(name => ({
        name,
        totalAppointments: dayCount[name].appointments,
        finished: dayCount[name].finished,
        appointmentsRevenue: dayCount[name].appointmentsRevenue,
        packagesRevenue: dayCount[name].packagesRevenue,
        revenue: dayCount[name].revenue,
      }));
    }

    // Default: By Days of the month
    const result = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayFormatted = String(day).padStart(2, '0');
      const dateStr = `${ym}-${dayFormatted}`;
      const dayApps = monthApps.filter(a => getAppointmentDateString(a) === dateStr);
      const dayStandaloneEvolutions = standaloneEvolutions.filter(ev => ev.date === dateStr);
      const dayPackages = monthPackages.filter(pkg => {
        const d = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
        return d === dateStr;
      });

      const totalApps = dayApps.length + dayStandaloneEvolutions.length;
      let finished = 0;
      let pending = 0;
      let absent = 0;
      let canceled = 0;
      let appointmentsRevenue = 0;

      dayApps.forEach(app => {
        const st = normalizeStatus(app.status);
        if (st === 'finished') {
          finished++;
          appointmentsRevenue += getAppointmentRevenue(app, treatments, monthEvolutions);
        } else if (st === 'absent') {
          absent++;
        } else if (st === 'canceled') {
          canceled++;
        } else {
          pending++;
        }
      });

      dayStandaloneEvolutions.forEach(ev => {
        finished++;
        const evPaid = (typeof ev.paidAmount === 'number' && !isNaN(ev.paidAmount))
          ? ev.paidAmount
          : (typeof ev.cost === 'number' && !isNaN(ev.cost))
            ? ev.cost
            : 0;
        appointmentsRevenue += evPaid;
      });

      const packagesRevenue = dayPackages.reduce((acc, p) => acc + (Number(p.pricePaid) || 0), 0);
      const totalDayRevenue = appointmentsRevenue + packagesRevenue;

      result.push({
        name: `Día ${dayFormatted}`,
        day: dayFormatted,
        totalAppointments: totalApps,
        uniquePatients: new Set([
          ...dayApps.map(a => a.patientId || a.patientName || a.id),
          ...dayStandaloneEvolutions.map(ev => ev.patientId || ev.patientName || ev.id),
          ...dayPackages.map(p => p.patientId || p.patientName || p.id)
        ]).size,
        finished,
        pending,
        absent,
        canceled,
        appointmentsRevenue,
        packagesRevenue,
        packagesCount: dayPackages.length,
        revenue: totalDayRevenue
      });
    }
    return result;
  }, [selectedMonths, rawAppointments, rawEvolutions, rawPatientPackages, treatments, singleMonthGranularity]);

  // Aggregated KPIs for the selected period
  const periodSummary = useMemo(() => {
    let totalAppointments = 0;
    let totalFinished = 0;
    let totalAbsent = 0;
    let totalCanceled = 0;
    let totalPending = 0;
    let totalRevenue = 0;
    let packagesRevenue = 0;
    let packagesCount = 0;
    let appointmentsRevenue = 0;
    const uniquePatientIds = new Set<string>();

    monthlyEvolutionData.forEach(m => {
      totalAppointments += m.totalAppointments;
      totalFinished += m.finished;
      totalAbsent += m.absent;
      totalCanceled += m.canceled;
      totalPending += m.pending;
      totalRevenue += m.revenue;
      packagesRevenue += m.packagesRevenue;
      packagesCount += m.packagesCount;
      appointmentsRevenue += m.appointmentsRevenue;
    });

    // Count distinct patients seen across the whole period (from appointments, evolutions, and packages)
    rawAppointments.forEach(app => {
      const dStr = getAppointmentDateString(app);
      if (dStr && selectedMonths.some(m => dStr.startsWith(m))) {
        const pid = app.patientId || app.patientName || app.id;
        if (pid) uniquePatientIds.add(pid);
      }
    });

    rawEvolutions.forEach(ev => {
      const dStr = ev.date || (ev.createdAt?.toDate ? ev.createdAt.toDate().toISOString().split('T')[0] : '');
      if (dStr && selectedMonths.some(m => dStr.startsWith(m))) {
        const pid = ev.patientId || ev.patientName || ev.id;
        if (pid) uniquePatientIds.add(pid);
      }
    });

    rawPatientPackages.forEach(pkg => {
      const dStr = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
      if (dStr && selectedMonths.some(m => dStr.startsWith(m))) {
        const pid = pkg.patientId || pkg.patientName || pkg.id;
        if (pid) uniquePatientIds.add(pid);
      }
    });

    const attendanceRate = totalAppointments > 0 ? Math.round((totalFinished / totalAppointments) * 100) : 0;
    const absentRate = totalAppointments > 0 ? Math.round((totalAbsent / totalAppointments) * 100) : 0;
    const avgMonthlyRevenue = selectedMonths.length > 0 ? Math.round(totalRevenue / selectedMonths.length) : 0;
    const avgMonthlyAppointments = selectedMonths.length > 0 ? Math.round(totalAppointments / selectedMonths.length) : 0;

    // Today specific stats
    const todayStr = now.toISOString().split('T')[0];
    const todayApps = rawAppointments.filter(a => getAppointmentDateString(a) === todayStr);
    const todayEvolutions = rawEvolutions.filter(ev => {
      const d = ev.date || (ev.createdAt?.toDate ? ev.createdAt.toDate().toISOString().split('T')[0] : '');
      return d === todayStr;
    });
    const todayPackages = rawPatientPackages.filter(pkg => {
      const d = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
      return d === todayStr;
    });

    const todayStandaloneEvolutions = todayEvolutions.filter(ev => {
      return !todayApps.some(a => 
        (ev.appointmentId && a.id === ev.appointmentId) || 
        (a.evolutionId && a.evolutionId === ev.id) || 
        (a.patientId && ev.patientId && a.patientId === ev.patientId && a.date === ev.date)
      );
    });

    const todayAppsRevenue = todayApps
      .filter(a => normalizeStatus(a.status) === 'finished')
      .reduce((acc, a) => acc + getAppointmentRevenue(a, treatments, todayEvolutions), 0);

    const todayStandaloneRevenue = todayStandaloneEvolutions.reduce((acc, ev) => {
      const p = (typeof ev.paidAmount === 'number' && !isNaN(ev.paidAmount))
        ? ev.paidAmount
        : (typeof ev.cost === 'number' && !isNaN(ev.cost))
          ? ev.cost
          : 0;
      return acc + p;
    }, 0);

    const todayPackagesRevenue = todayPackages.reduce((acc, p) => acc + (Number(p.pricePaid) || 0), 0);

    const todayFinished = todayApps.filter(a => normalizeStatus(a.status) === 'finished').length + todayStandaloneEvolutions.length;
    const todayAppointments = todayApps.length + todayStandaloneEvolutions.length;
    const todayRevenue = todayAppsRevenue + todayStandaloneRevenue + todayPackagesRevenue;

    return {
      totalAppointments,
      totalFinished,
      totalAbsent,
      totalCanceled,
      totalPending,
      totalRevenue,
      appointmentsRevenue,
      packagesRevenue,
      packagesCount,
      uniquePatients: uniquePatientIds.size,
      attendanceRate,
      absentRate,
      avgMonthlyRevenue,
      avgMonthlyAppointments,
      todayAppointments,
      todayFinished,
      todayRevenue,
      todayPackagesRevenue,
      todayPackagesCount: todayPackages.length
    };
  }, [monthlyEvolutionData, rawAppointments, rawEvolutions, rawPatientPackages, selectedMonths, now, treatments]);

  // Packages purchased in the selected period
  const periodPackages = useMemo(() => {
    return rawPatientPackages
      .filter(pkg => {
        const d = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
        return typeof d === 'string' && selectedMonths.some(m => d.startsWith(m));
      })
      .sort((a, b) => {
        const dateA = a.purchaseDate || '';
        const dateB = b.purchaseDate || '';
        return dateB.localeCompare(dateA);
      });
  }, [rawPatientPackages, selectedMonths]);

  // Donut chart status data for selected period
  const statusPieData = useMemo(() => {
    const list = [
      { name: 'Finalizados', value: periodSummary.totalFinished, color: '#16A34A' },
      { name: 'Pendientes / Conf.', value: periodSummary.totalPending, color: '#0284C7' },
      { name: 'Ausentes', value: periodSummary.totalAbsent, color: '#EA580C' },
      { name: 'Cancelados', value: periodSummary.totalCanceled, color: '#DC2626' },
    ];
    return list.filter(item => item.value > 0);
  }, [periodSummary]);

  // Handler for opening reschedule modal
  const handleOpenEdit = (apt: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditData({
      id: apt.id,
      patientName: apt.patientName || '',
      date: apt.date || now.toISOString().split('T')[0],
      time: apt.time || '09:00',
      type: apt.type || 'Consulta General / Diagnóstico',
      notes: apt.notes || ''
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData.id) return;
    try {
      const [year, month, day] = editData.date.split('-').map(Number);
      const [hours, minutes] = editData.time.split(':').map(Number);
      const appointmentDate = new Date(year, month - 1, day, hours, minutes);

      await updateDoc(doc(db, 'appointments', editData.id), {
        date: editData.date,
        time: editData.time,
        type: editData.type,
        notes: editData.notes || '',
        startTime: appointmentDate,
        updatedAt: serverTimestamp()
      });

      setIsEditModalOpen(false);
      showToast('Turno reprogramado exitosamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${editData.id}`);
    }
  };

  const chartData = selectedMonths.length === 1 ? singleMonthData : monthlyEvolutionData;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Range Selection */}
      <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-on-surface tracking-tight">Panel de Control y Evolución</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                Histórico
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-medium mt-1">
              Monitoreo y evolución de atención médica, pacientes, ingresos y estados a lo largo del tiempo.
            </p>
          </div>

          {/* Active Period Badge */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-surface rounded-xl border border-outline-variant self-start md:self-center">
            <Calendar size={15} className="text-primary shrink-0" />
            <div className="text-left">
              <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant block leading-none">
                Período en Pantalla
              </span>
              <span className="text-xs font-bold text-on-surface">
                {timeframeLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Multi-Month Selector Buttons */}
        <div className="pt-2 border-t border-outline-variant/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-surface p-1 rounded-xl border border-outline-variant">
            <button
              type="button"
              onClick={() => setTimeframeMode('1m')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                timeframeMode === '1m'
                  ? "bg-white text-primary shadow-sm font-black"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Mes Actual
            </button>
            <button
              type="button"
              onClick={() => setTimeframeMode('3m')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                timeframeMode === '3m'
                  ? "bg-white text-primary shadow-sm font-black"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Últimos 3 Meses
            </button>
            <button
              type="button"
              onClick={() => setTimeframeMode('6m')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                timeframeMode === '6m'
                  ? "bg-white text-primary shadow-sm font-black"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Últimos 6 Meses
            </button>
            <button
              type="button"
              onClick={() => setTimeframeMode('12m')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                timeframeMode === '12m'
                  ? "bg-white text-primary shadow-sm font-black"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Últimos 12 Meses
            </button>
            <button
              type="button"
              onClick={() => setTimeframeMode('specific')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                timeframeMode === 'specific'
                  ? "bg-white text-primary shadow-sm font-black"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Mes Específico
            </button>
            <button
              type="button"
              onClick={() => setTimeframeMode('custom')}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                timeframeMode === 'custom'
                  ? "bg-white text-primary shadow-sm font-black"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Rango de Meses
            </button>
          </div>

          {/* Sub-selector for specific or custom range */}
          <div className="flex items-center gap-2">
            {timeframeMode === 'specific' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface-variant">Seleccionar mes:</span>
                <select
                  value={specificMonth}
                  onChange={(e) => setSpecificMonth(e.target.value)}
                  className="px-3 py-1.5 bg-surface border border-outline-variant rounded-xl text-xs font-bold text-on-surface outline-none focus:border-primary cursor-pointer"
                >
                  {availableMonths.map((ym) => (
                    <option key={ym} value={ym}>
                      {formatMonthLabel(ym, 'full')} {ym === currentYearMonth ? '(Actual)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {timeframeMode === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant">Desde:</span>
                  <select
                    value={customStartMonth}
                    onChange={(e) => setCustomStartMonth(e.target.value)}
                    className="px-2.5 py-1.5 bg-surface border border-outline-variant rounded-xl text-xs font-bold text-on-surface outline-none focus:border-primary cursor-pointer"
                  >
                    {availableMonths.map((ym) => (
                      <option key={ym} value={ym}>
                        {formatMonthLabel(ym, 'short')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant">Hasta:</span>
                  <select
                    value={customEndMonth}
                    onChange={(e) => setCustomEndMonth(e.target.value)}
                    className="px-2.5 py-1.5 bg-surface border border-outline-variant rounded-xl text-xs font-bold text-on-surface outline-none focus:border-primary cursor-pointer"
                  >
                    {availableMonths.map((ym) => (
                      <option key={ym} value={ym}>
                        {formatMonthLabel(ym, 'short')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards for the Selected Period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pacientes Únicos Atendidos */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Pacientes en el Período
              </p>
              <h3 className="text-2xl font-black text-on-surface mt-1">
                {periodSummary.uniquePatients.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
              <Users size={20} />
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <span className="text-on-surface-variant font-medium">Base registrada</span>
            <span className="font-bold text-on-surface">{totalPatientsCount} pacientes</span>
          </div>
        </motion.div>

        {/* Card 2: Turnos Totales en el Período */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Turnos en el Período
              </p>
              <h3 className="text-2xl font-black text-on-surface mt-1">
                {periodSummary.totalAppointments.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
              <CalendarCheck size={20} />
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <span className="text-on-surface-variant font-medium">Finalizados</span>
            <span className="font-bold text-emerald-600">
              {periodSummary.totalFinished} ({periodSummary.attendanceRate}%)
            </span>
          </div>
        </motion.div>

        {/* Card 3: Ingresos Totales del Período */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Ingresos del Período
                </p>
                <h3 className="text-2xl font-black text-emerald-700 mt-1">
                  ${periodSummary.totalRevenue.toLocaleString('es-AR')}
                </h3>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="space-y-1 my-2 text-[11px] bg-surface-bright/70 p-2 rounded-xl border border-outline-variant/50">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant font-medium">Turnos / Consultas:</span>
                <span className="font-bold text-on-surface">
                  ${periodSummary.appointmentsRevenue.toLocaleString('es-AR')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-amber-800 font-medium flex items-center gap-1">
                  <Package size={12} className="text-amber-600" /> Bonos y Paquetes:
                </span>
                <span className="font-bold text-amber-700">
                  ${periodSummary.packagesRevenue.toLocaleString('es-AR')} <span className="font-normal text-[10px] text-amber-900/80">({periodSummary.packagesCount})</span>
                </span>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <span className="text-on-surface-variant font-medium">Promedio mensual</span>
            <span className="font-bold text-on-surface">
              ${periodSummary.avgMonthlyRevenue.toLocaleString('es-AR')}/mes
            </span>
          </div>
        </motion.div>

        {/* Card 4: Tasa de Asistencia / Efectividad */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Tasa de Asistencia
              </p>
              <h3 className="text-2xl font-black text-primary mt-1">
                {periodSummary.attendanceRate}%
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Activity size={20} />
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px]">
            <span className="text-on-surface-variant font-medium">Ausencias / Canc.</span>
            <span className="font-bold text-rose-600">
              {periodSummary.totalAbsent + periodSummary.totalCanceled} turnos
            </span>
          </div>
        </motion.div>
      </div>

      {/* Daily Pulse Mini-Bar */}
      <div className="bg-surface-bright px-4 py-2.5 rounded-xl border border-outline-variant flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-black text-on-surface uppercase tracking-wider text-[11px]">Actividad de Hoy:</span>
          <span className="text-on-surface-variant font-semibold">
            {periodSummary.todayAppointments} {periodSummary.todayAppointments === 1 ? 'turno' : 'turnos'} agendados
          </span>
          <span className="text-on-surface-variant opacity-40">•</span>
          <span className="text-emerald-700 font-bold">
            ${periodSummary.todayRevenue.toLocaleString('es-AR')} recaudados
          </span>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant font-medium text-[11px]">
          <Clock size={13} className="text-primary" />
          <span>Valor de inventario disponible: <strong>${inventoryTotalValue.toLocaleString('es-AR')}</strong></span>
        </div>
      </div>

      {/* Main Evolution Section: Chart & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Evolution Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 size={17} className="text-primary" />
                  Evolución de Atención
                </h2>
                <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  {evolutionMetric === 'patients' ? 'Pacientes y Turnos' : evolutionMetric === 'revenue' ? 'Ingresos ($)' : 'Estados de Citas'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {selectedMonths.length > 1 
                  ? `Comparativa cronológica mes a mes a lo largo de ${selectedMonths.length} meses.`
                  : `Desglose detallado del mes de ${formatMonthLabel(selectedMonths[0], 'full')}.`
                }
              </p>
            </div>

            {/* Metric Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-surface p-1 rounded-xl border border-outline-variant">
              <button
                type="button"
                onClick={() => setEvolutionMetric('patients')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                  evolutionMetric === 'patients'
                    ? "bg-white text-primary shadow-sm font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                Pacientes
              </button>
              <button
                type="button"
                onClick={() => setEvolutionMetric('revenue')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                  evolutionMetric === 'revenue'
                    ? "bg-white text-emerald-700 shadow-sm font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                Ingresos ($)
              </button>
              <button
                type="button"
                onClick={() => setEvolutionMetric('status')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                  evolutionMetric === 'status'
                    ? "bg-white text-indigo-700 shadow-sm font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                Estados
              </button>
            </div>
          </div>

          {/* Sub-toolbar: Chart Type & Granularity (if 1 month) */}
          <div className="flex items-center justify-between border-b border-outline-variant/50 pb-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Formato:</span>
              <div className="flex bg-surface-bright rounded-lg p-0.5 border border-outline-variant">
                <button
                  type="button"
                  onClick={() => setChartType('area')}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer",
                    chartType === 'area' ? "bg-white text-primary shadow-xs font-black" : "text-on-surface-variant"
                  )}
                >
                  Área Continua
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer",
                    chartType === 'bar' ? "bg-white text-primary shadow-xs font-black" : "text-on-surface-variant"
                  )}
                >
                  Barras
                </button>
              </div>
            </div>

            {selectedMonths.length === 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-on-surface-variant">Agrupar por:</span>
                <select
                  value={singleMonthGranularity}
                  onChange={(e) => setSingleMonthGranularity(e.target.value as SingleMonthGranularity)}
                  className="px-2 py-1 bg-surface border border-outline-variant rounded-lg text-xs font-bold text-on-surface outline-none cursor-pointer"
                >
                  <option value="days">Días del Mes</option>
                  <option value="weekdays">Días de la Semana</option>
                </select>
              </div>
            )}
          </div>

          {/* Recharts Area / Bar Chart */}
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00478D" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00478D" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16A34A" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#16A34A" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorSky" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorOrange" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EA580C" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    dy={8}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => evolutionMetric === 'revenue' ? `$${(val / 1000).toFixed(0)}k` : val}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: '1px solid #E2E8F0', 
                      boxShadow: '0 8px 24px rgba(0,0,0,0.08)', 
                      fontSize: '12px', 
                      fontWeight: 700 
                    }}
                    formatter={(value: any, name: any) => {
                      if (name === 'revenue' || name === 'Ingresos ($)' || name === 'Ingresos Totales ($)') {
                        return [`$${Number(value).toLocaleString('es-AR')}`, 'Ingresos Totales'];
                      }
                      if (name === 'appointmentsRevenue' || name === 'Turnos / Consultas ($)') {
                        return [`$${Number(value).toLocaleString('es-AR')}`, 'Turnos / Consultas'];
                      }
                      if (name === 'packagesRevenue' || name === 'Bonos y Paquetes ($)') {
                        return [`$${Number(value).toLocaleString('es-AR')}`, 'Bonos y Paquetes'];
                      }
                      if (name === 'avgTicket' || name === 'Ticket Promedio') {
                        return [`$${Number(value).toLocaleString('es-AR')}`, 'Ticket Promedio'];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 600 }} 
                  />

                  {evolutionMetric === 'patients' && (
                    <>
                      <Area 
                        type="monotone" 
                        dataKey="totalAppointments" 
                        name="Turnos Totales" 
                        stroke="#00478D" 
                        strokeWidth={2.5} 
                        fill="url(#colorPrimary)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="uniquePatients" 
                        name="Pacientes Únicos" 
                        stroke="#0284C7" 
                        strokeWidth={2} 
                        fill="url(#colorSky)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="finished" 
                        name="Atendidos / Finalizados" 
                        stroke="#16A34A" 
                        strokeWidth={2} 
                        fill="url(#colorGreen)" 
                      />
                    </>
                  )}

                  {evolutionMetric === 'revenue' && (
                    <>
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        name="Ingresos Totales ($)" 
                        stroke="#16A34A" 
                        strokeWidth={3} 
                        fill="url(#colorGreen)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="packagesRevenue" 
                        name="Bonos y Paquetes ($)" 
                        stroke="#D97706" 
                        strokeWidth={2} 
                        fill="none" 
                      />
                    </>
                  )}

                  {evolutionMetric === 'status' && (
                    <>
                      <Area 
                        type="monotone" 
                        dataKey="finished" 
                        name="Finalizados" 
                        stroke="#16A34A" 
                        strokeWidth={2.5} 
                        fill="url(#colorGreen)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="pending" 
                        name="Pendientes / Conf." 
                        stroke="#0284C7" 
                        strokeWidth={2} 
                        fill="url(#colorSky)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="absent" 
                        name="Ausentes" 
                        stroke="#EA580C" 
                        strokeWidth={2} 
                        fill="url(#colorOrange)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="canceled" 
                        name="Cancelados" 
                        stroke="#DC2626" 
                        strokeWidth={2} 
                        fill="url(#colorRed)" 
                      />
                    </>
                  )}
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    dy={8}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => evolutionMetric === 'revenue' ? `$${(val / 1000).toFixed(0)}k` : val}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: '1px solid #E2E8F0', 
                      boxShadow: '0 8px 24px rgba(0,0,0,0.08)', 
                      fontSize: '12px', 
                      fontWeight: 700 
                    }}
                    formatter={(value: any, name: any) => {
                      if (name === 'revenue' || name === 'Ingresos ($)' || name === 'Ingresos Totales ($)') {
                        return [`$${Number(value).toLocaleString('es-AR')}`, 'Ingresos Totales'];
                      }
                      if (name === 'appointmentsRevenue' || name === 'Turnos / Consultas ($)') {
                        return [`$${Number(value).toLocaleString('es-AR')}`, 'Turnos / Consultas'];
                      }
                      if (name === 'packagesRevenue' || name === 'Bonos y Paquetes ($)') {
                        return [`$${Number(value).toLocaleString('es-AR')}`, 'Bonos y Paquetes'];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 600 }} 
                  />

                  {evolutionMetric === 'patients' && (
                    <>
                      <Bar dataKey="totalAppointments" name="Turnos Totales" fill="#00478D" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="uniquePatients" name="Pacientes Únicos" fill="#0284C7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="finished" name="Finalizados" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    </>
                  )}

                  {evolutionMetric === 'revenue' && (
                    <>
                      <Bar dataKey="appointmentsRevenue" name="Turnos / Consultas ($)" stackId="rev" fill="#16A34A" />
                      <Bar dataKey="packagesRevenue" name="Bonos y Paquetes ($)" stackId="rev" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    </>
                  )}

                  {evolutionMetric === 'status' && (
                    <>
                      <Bar dataKey="finished" name="Finalizados" stackId="st" fill="#16A34A" />
                      <Bar dataKey="pending" name="Pendientes" stackId="st" fill="#0284C7" />
                      <Bar dataKey="absent" name="Ausentes" stackId="st" fill="#EA580C" />
                      <Bar dataKey="canceled" name="Cancelados" stackId="st" fill="#DC2626" radius={[4, 4, 0, 0]} />
                    </>
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Col: Pie of Statuses & Attendance Health */}
        <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                <PieChartIcon size={17} className="text-primary" />
                Distribución de Estados
              </h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-surface-bright border border-outline-variant text-on-surface-variant">
                {periodSummary.totalAppointments} Turnos
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              Comportamiento y cumplimiento de citas en el período seleccionado.
            </p>
          </div>

          <div className="h-[200px] w-full flex items-center justify-center relative">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center opacity-40 py-8">
                <PieChartIcon size={36} className="mx-auto mb-2 text-on-surface-variant" />
                <p className="text-[11px] font-bold uppercase tracking-widest">Sin datos de turnos</p>
              </div>
            )}
            
            {statusPieData.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-on-surface">{periodSummary.attendanceRate}%</span>
                <span className="text-[9px] uppercase font-black tracking-widest text-on-surface-variant">Efectividad</span>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-2 border-t border-outline-variant/60">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                <span className="text-on-surface-variant font-medium">Finalizados (Atendidos)</span>
              </div>
              <span className="font-bold text-on-surface">{periodSummary.totalFinished}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                <span className="text-on-surface-variant font-medium">Confirmados / Pendientes</span>
              </div>
              <span className="font-bold text-on-surface">{periodSummary.totalPending}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                <span className="text-on-surface-variant font-medium">Ausentes</span>
              </div>
              <span className="font-bold text-orange-700">{periodSummary.totalAbsent}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                <span className="text-on-surface-variant font-medium">Cancelados</span>
              </div>
              <span className="font-bold text-rose-700">{periodSummary.totalCanceled}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Comparative Evolution Table */}
      {selectedMonths.length > 1 && (
        <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                <Activity size={17} className="text-primary" />
                Resumen Comparativo Mes a Mes
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Evolución tabular y métricas detalladas por cada mes del período.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTable(!showTable)}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              {showTable ? 'Ocultar Tabla' : 'Ver Tabla'}
            </button>
          </div>

          {showTable && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-outline-variant text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-bright">
                    <th className="py-3 px-4">Mes</th>
                    <th className="py-3 px-4">Turnos Totales</th>
                    <th className="py-3 px-4">Pacientes Únicos</th>
                    <th className="py-3 px-4 text-emerald-700">Finalizados</th>
                    <th className="py-3 px-4 text-orange-700">Ausentes</th>
                    <th className="py-3 px-4 text-rose-700">Cancelados</th>
                    <th className="py-3 px-4">Tasa Asistencia</th>
                    <th className="py-3 px-4 text-right">Turnos ($)</th>
                    <th className="py-3 px-4 text-right text-amber-800">Bonos / Packs ($)</th>
                    <th className="py-3 px-4 text-right text-emerald-700">Facturación Total ($)</th>
                    <th className="py-3 px-4 text-right">Ticket Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/40">
                  {monthlyEvolutionData.map((m, idx) => {
                    const prevMonth = idx > 0 ? monthlyEvolutionData[idx - 1] : null;
                    const diffRev = prevMonth && prevMonth.revenue > 0
                      ? Math.round(((m.revenue - prevMonth.revenue) / prevMonth.revenue) * 100)
                      : null;

                    return (
                      <tr key={m.yearMonth} className="hover:bg-surface/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-on-surface">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            {m.fullName}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-on-surface">{m.totalAppointments}</td>
                        <td className="py-3 px-4 font-semibold text-on-surface">{m.uniquePatients}</td>
                        <td className="py-3 px-4 font-bold text-emerald-600">{m.finished}</td>
                        <td className="py-3 px-4 font-semibold text-orange-600">{m.absent}</td>
                        <td className="py-3 px-4 font-semibold text-rose-600">{m.canceled}</td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md font-bold text-[10px]",
                            m.attendanceRate >= 75 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                              : m.attendanceRate >= 50 
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-surface text-on-surface-variant"
                          )}>
                            {m.attendanceRate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-on-surface">
                          ${m.appointmentsRevenue.toLocaleString('es-AR')}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-amber-700">
                          ${m.packagesRevenue.toLocaleString('es-AR')}
                          {m.packagesCount > 0 && (
                            <span className="ml-1 text-[10px] text-amber-800/70 font-bold">({m.packagesCount})</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700">
                          ${m.revenue.toLocaleString('es-AR')}
                          {diffRev !== null && (
                            <span className={cn(
                              "ml-1 text-[10px] font-bold inline-flex items-center",
                              diffRev >= 0 ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {diffRev >= 0 ? `+${diffRev}%` : `${diffRev}%`}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-on-surface-variant">
                          ${m.avgTicket.toLocaleString('es-AR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Packages and Bonds Purchased Section */}
      <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
              <Package size={17} className="text-amber-600" />
              Compras de Bonos y Paquetes en el Período
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Registro detallado de los paquetes y bonos adquiridos por pacientes en {timeframeLabel}.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-bold px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg flex items-center gap-1.5">
              <Package size={13} className="text-amber-600" />
              {periodPackages.length} {periodPackages.length === 1 ? 'bono vendido' : 'bonos vendidos'}
            </span>
            <span className="text-xs font-black px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
              ${periodSummary.packagesRevenue.toLocaleString('es-AR')}
            </span>
          </div>
        </div>

        {periodPackages.length === 0 ? (
          <div className="p-8 text-center bg-surface rounded-xl border border-outline-variant/50">
            <Package size={32} className="mx-auto text-on-surface-variant/40 mb-2" />
            <p className="text-xs font-bold text-on-surface">No se registraron compras de bonos en este período</p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Cuando los pacientes compren paquetes o bonos en su ficha, aparecerán totalizados aquí.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-outline-variant text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-bright">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Paciente</th>
                  <th className="py-2.5 px-3">Bono / Paquete</th>
                  <th className="py-2.5 px-3">Sesiones Restantes</th>
                  <th className="py-2.5 px-3">Medio de Pago</th>
                  <th className="py-2.5 px-3 text-right">Precio Cobrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {periodPackages.map((pkg) => {
                  const rem = pkg.remainingSessions ?? pkg.totalSessions;
                  const total = pkg.totalSessions;
                  return (
                    <tr key={pkg.id} className="hover:bg-surface/50 transition-colors">
                      <td className="py-3 px-3 font-semibold text-on-surface-variant whitespace-nowrap">
                        {pkg.purchaseDate || '—'}
                      </td>
                      <td className="py-3 px-3 font-bold text-on-surface">
                        {pkg.patientName || 'Paciente'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px]">
                          {pkg.packageName || 'Paquete'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md font-bold text-[10px]",
                            rem > 0 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                              : "bg-surface text-on-surface-variant"
                          )}>
                            {rem} de {total} disp.
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-medium text-on-surface-variant capitalize">
                        {pkg.paymentMethod || 'Efectivo'}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-emerald-700">
                        ${Number(pkg.pricePaid || 0).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upcoming Appointments Section */}
      <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
              <CalendarClock size={17} className="text-primary" />
              Próximos Turnos Programados
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Acceso rápido a las siguientes citas pendientes y reprogramación.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {upcomingAppointments.map((apt) => (
            <div 
              key={apt.id} 
              onClick={() => handleOpenEdit(apt)}
              className="flex gap-3 items-center p-3.5 bg-surface rounded-xl border border-outline-variant/60 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group relative"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-105 transition-transform">
                {apt.patientName?.charAt(0) || 'P'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <h4 className="text-xs font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                    {apt.patientName || 'Paciente sin nombre'}
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                      {apt.time || '09:00'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleOpenEdit(apt, e)}
                      title="Reprogramar fecha y hora"
                      className="p-1 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                    >
                      <Edit2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-tight truncate max-w-[130px]">
                    {apt.type || apt.treatment || 'Consulta General'}
                  </p>
                  <span className="text-[10px] text-on-surface-variant/80 font-semibold">{apt.date}</span>
                </div>
              </div>
            </div>
          ))}

          {upcomingAppointments.length === 0 && !loading && (
            <div className="col-span-full text-center py-10 opacity-40">
              <CalendarCheck size={36} className="mx-auto mb-2 text-primary" />
              <p className="text-xs font-black uppercase tracking-widest text-on-surface">Sin turnos pendientes</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">Todos los turnos próximos han sido completados o no hay nuevos programados.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit / Reschedule Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Reprogramar Fecha y Hora del Turno"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="p-4 bg-surface rounded-xl border border-outline-variant flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Paciente</p>
              <h4 className="text-sm font-bold text-on-surface">{editData.patientName}</h4>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              <CalendarClock size={16} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">
                Nueva Fecha
              </label>
              <input
                type="date"
                required
                value={editData.date}
                onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                className="w-full px-3 py-2 bg-surface rounded-xl border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">
                Nueva Hora
              </label>
              <input
                type="time"
                required
                value={editData.time}
                onChange={(e) => setEditData({ ...editData, time: e.target.value })}
                className="w-full px-3 py-2 bg-surface rounded-xl border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">
              Tratamiento
            </label>
            <select
              value={editData.type}
              onChange={(e) => setEditData({ ...editData, type: e.target.value })}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:border-primary cursor-pointer"
            >
              {treatments.length > 0 ? (
                treatments.map((t) => (
                  <option key={t.id || t.name} value={t.name}>{t.name}</option>
                ))
              ) : (
                <option value="Consulta General / Diagnóstico">Consulta General / Diagnóstico</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">
              Notas / Motivo de la reprogramación
            </label>
            <textarea
              rows={2}
              value={editData.notes}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              placeholder="Indique el motivo del cambio o notas adicionales..."
              className="w-full px-3 py-2 bg-surface rounded-xl border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="flex-1 px-4 py-2.5 border border-outline-variant text-xs font-bold rounded-xl hover:bg-surface transition-colors uppercase tracking-wider cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-sm transition-colors uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 size={16} />
              Guardar Cambios
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
