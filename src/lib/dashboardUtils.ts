export const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MONTHS_SHORT_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export function getAppointmentDateString(app: any): string {
  if (typeof app.date === 'string' && app.date.match(/^\d{4}-\d{2}-\d{2}/)) {
    return app.date.substring(0, 10);
  }
  if (app.startTime) {
    if (typeof app.startTime.toDate === 'function') {
      const d = app.startTime.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    const d = new Date(app.startTime);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  return '';
}

export function normalizeStatus(status?: string): 'finished' | 'pending' | 'absent' | 'canceled' {
  const s = (status || '').toLowerCase().trim();
  if (s === 'finished' || s === 'completado' || s === 'atendido' || s === 'finalizado') {
    return 'finished';
  }
  if (s === 'ausente' || s === 'no_asistio' || s === 'falto') {
    return 'absent';
  }
  if (s === 'cancelado' || s === 'cancelled' || s === 'anulado') {
    return 'canceled';
  }
  return 'pending';
}

export function getAppointmentRevenue(
  app: any, 
  treatments: any[] = [], 
  evolutions: any[] = []
): number {
  const normStatus = normalizeStatus(app.status);
  if (normStatus !== 'finished') return 0;

  // If this session is covered by a prepaid package, it does not generate incremental revenue
  if (app.isPackageSession) return 0;

  // 1. Check if an evolution was recorded for this attention with the exact amount paid
  if (evolutions && evolutions.length > 0) {
    const matchingEvo = evolutions.find(ev => 
      (app.evolutionId && ev.id === app.evolutionId) ||
      (ev.appointmentId && ev.appointmentId === app.id) ||
      (ev.patientId && app.patientId && ev.patientId === app.patientId && ev.date && app.date && ev.date === app.date)
    );
    if (matchingEvo) {
      if (typeof matchingEvo.paidAmount === 'number' && !isNaN(matchingEvo.paidAmount)) {
        return matchingEvo.paidAmount;
      }
      if (typeof matchingEvo.cost === 'number' && !isNaN(matchingEvo.cost)) {
        return matchingEvo.cost;
      }
    }
  }

  // 2. Check the appointment's own immutable historical paid amount / cost
  if (typeof app.paidAmount === 'number' && !isNaN(app.paidAmount)) {
    return app.paidAmount;
  }
  if (typeof app.cost === 'number' && !isNaN(app.cost)) {
    return app.cost;
  }
  if (typeof app.price === 'number' && !isNaN(app.price)) {
    return app.price;
  }
  if (typeof app.treatmentCost === 'number' && !isNaN(app.treatmentCost)) {
    return app.treatmentCost;
  }
  if (typeof app.amount === 'number' && !isNaN(app.amount)) {
    return app.amount;
  }
  
  // 3. Fallback only if no price was stamped at creation/attention
  const t = treatments.find(trait => 
    trait.name === app.type || 
    trait.name === app.treatment || 
    trait.id === app.treatmentId ||
    trait.id === app.typeId
  );
  if (t && typeof t.cost === 'number' && !isNaN(t.cost)) {
    return t.cost;
  }
  return 0;
}

export function formatMonthLabel(yearMonth: string, format: 'short' | 'full' = 'short'): string {
  const parts = yearMonth.split('-');
  if (parts.length < 2) return yearMonth;
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return yearMonth;

  if (format === 'full') {
    return `${MONTHS_ES[monthIdx]} ${year}`;
  }
  return `${MONTHS_SHORT_ES[monthIdx]} '${String(year).slice(-2)}`;
}

export function generatePastMonths(count: number, refDate: Date = new Date()): string[] {
  const result: string[] = [];
  const currYear = refDate.getFullYear();
  const currMonth = refDate.getMonth();

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(currYear, currMonth - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${y}-${m}`);
  }
  return result;
}

export function getMonthsBetween(startYearMonth: string, endYearMonth: string): string[] {
  const [startY, startM] = startYearMonth.split('-').map(Number);
  const [endY, endM] = endYearMonth.split('-').map(Number);
  
  if (isNaN(startY) || isNaN(startM) || isNaN(endY) || isNaN(endM)) return [startYearMonth];
  
  const startDate = new Date(startY, startM - 1, 1);
  const endDate = new Date(endY, endM - 1, 1);
  
  const [first, last] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  
  const months: string[] = [];
  const cur = new Date(first.getFullYear(), first.getMonth(), 1);
  
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

export interface MonthMetrics {
  yearMonth: string;
  name: string;
  fullName: string;
  totalAppointments: number;
  uniquePatients: number;
  finished: number;
  pending: number;
  absent: number;
  canceled: number;
  attendanceRate: number;
  appointmentsRevenue: number;
  packagesRevenue: number;
  packagesCount: number;
  revenue: number;
  avgTicket: number;
}

export function computeMonthlyEvolution(
  months: string[],
  appointments: any[],
  treatments: any[] = [],
  evolutions: any[] = [],
  packages: any[] = []
): MonthMetrics[] {
  return months.map(ym => {
    const monthApps = appointments.filter(a => {
      const dateStr = getAppointmentDateString(a);
      return dateStr.startsWith(ym);
    });

    const monthEvolutions = evolutions.filter(ev => {
      const d = ev.date || (ev.createdAt?.toDate ? ev.createdAt.toDate().toISOString().split('T')[0] : '');
      return typeof d === 'string' && d.startsWith(ym);
    });

    // Packages purchased in this month
    const monthPackages = packages.filter(pkg => {
      const d = pkg.purchaseDate || (pkg.createdAt?.toDate ? pkg.createdAt.toDate().toISOString().split('T')[0] : '');
      return typeof d === 'string' && d.startsWith(ym);
    });

    const packagesRevenue = monthPackages.reduce((acc, p) => acc + (Number(p.pricePaid) || 0), 0);
    const packagesCount = monthPackages.length;

    // Standalone evolutions (clinical attentions registered directly without a linked appointment)
    const standaloneEvolutions = monthEvolutions.filter(ev => {
      const isLinkedToAnyApp = monthApps.some(a => 
        (ev.appointmentId && a.id === ev.appointmentId) || 
        (a.evolutionId && a.evolutionId === ev.id) || 
        (a.patientId && ev.patientId && a.patientId === ev.patientId && a.date === ev.date)
      );
      return !isLinkedToAnyApp;
    });

    const totalAppointments = monthApps.length + standaloneEvolutions.length;
    const uniquePatientIds = new Set([
      ...monthApps.map(a => a.patientId || a.patientName || a.id).filter(Boolean),
      ...standaloneEvolutions.map(ev => ev.patientId || ev.patientName || ev.id).filter(Boolean),
      ...monthPackages.map(p => p.patientId || p.patientName || p.id).filter(Boolean)
    ]);
    const uniquePatients = uniquePatientIds.size;

    let finished = 0;
    let pending = 0;
    let absent = 0;
    let canceled = 0;
    let appointmentsRevenue = 0;

    monthApps.forEach(app => {
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

    // Add standalone completed clinical attentions
    standaloneEvolutions.forEach(ev => {
      finished++;
      const evPaid = (typeof ev.paidAmount === 'number' && !isNaN(ev.paidAmount))
        ? ev.paidAmount
        : (typeof ev.cost === 'number' && !isNaN(ev.cost))
          ? ev.cost
          : 0;
      appointmentsRevenue += evPaid;
    });

    const totalRevenue = appointmentsRevenue + packagesRevenue;
    const attendanceRate = totalAppointments > 0 ? Math.round((finished / totalAppointments) * 100) : 0;
    const totalTransactions = finished + packagesCount;
    const avgTicket = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

    return {
      yearMonth: ym,
      name: formatMonthLabel(ym, 'short'),
      fullName: formatMonthLabel(ym, 'full'),
      totalAppointments,
      uniquePatients,
      finished,
      pending,
      absent,
      canceled,
      attendanceRate,
      appointmentsRevenue,
      packagesRevenue,
      packagesCount,
      revenue: totalRevenue,
      avgTicket
    };
  });
}
