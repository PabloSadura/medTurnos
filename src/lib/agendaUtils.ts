export const DAYS_NAMES = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
];

/**
 * Converts "HH:mm" time string into total minutes from midnight.
 */
export function timeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Converts total minutes from midnight back into "HH:mm" format.
 */
export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, totalMinutes);
  const hours = Math.floor(normalized / 60) % 24;
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Calculates end time ("HH:mm") based on start time and duration in minutes.
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const startMin = timeToMinutes(startTime);
  const safeDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 30;
  return minutesToTime(startMin + safeDuration);
}

/**
 * Calculates the effective duration in minutes for an appointment.
 * 1. If treatment exists and has a positive duration, defaults to that duration.
 * 2. If the user provides a positive manual duration, uses that.
 * 3. Fallback: 30 minutes.
 */
export function getEffectiveDuration(
  treatmentNameOrObj?: string | { duration?: number | string; name?: string } | null,
  manualDuration?: number | string | null,
  treatmentsList?: any[],
  fallbackMinutes: number = 30
): number {
  const parsedManual = Number(manualDuration);
  if (parsedManual > 0) {
    return parsedManual;
  }
  if (treatmentNameOrObj) {
    if (typeof treatmentNameOrObj === 'object' && Number(treatmentNameOrObj.duration) > 0) {
      return Number(treatmentNameOrObj.duration);
    }
    if (typeof treatmentNameOrObj === 'string' && treatmentsList && treatmentsList.length > 0) {
      const matched = treatmentsList.find(t => t.name === treatmentNameOrObj || t.id === treatmentNameOrObj);
      if (matched && Number(matched.duration) > 0) {
        return Number(matched.duration);
      }
    }
  }
  return fallbackMinutes > 0 ? fallbackMinutes : 30;
}

export interface DetailedConflict {
  id: string;
  patientName: string;
  time: string;
  endTime: string;
  duration: number;
  treatment: string;
  status: string;
  isOverturn?: boolean;
}

export interface ConflictResult {
  hasConflict: boolean;
  isOverturn: boolean;
  overturnReason: 'time_overlap' | 'manual' | null;
  conflictingAppointment?: any;
  overlappingAppointments: any[];
  overlappingAppointmentIds: string[];
  overlapCount: number;
  detailedConflicts: DetailedConflict[];
  conflictSummary: string;
  message?: string;
}

/**
 * Checks if a proposed appointment slot overlaps with any existing appointment on the same date.
 * Two appointments overlap if:
 * [newStart, newEnd) overlaps with [existStart, existEnd)
 * => newStart < existEnd && existStart < newEnd
 *
 * Excluded from collision:
 * - The appointment being edited (excludeAppointmentId)
 * - Cancelled, annulled or absent appointments ('cancelado', 'cancelled', 'anulado', 'ausente')
 */
export function checkScheduleCollision(
  date: string,
  time: string,
  durationMinutes: number,
  existingAppointments: any[],
  excludeAppointmentId?: string,
  professionalId?: string
): ConflictResult {
  const emptyResult: ConflictResult = {
    hasConflict: false,
    isOverturn: false,
    overturnReason: null,
    conflictingAppointment: undefined,
    overlappingAppointments: [],
    overlappingAppointmentIds: [],
    overlapCount: 0,
    detailedConflicts: [],
    conflictSummary: '',
    message: ''
  };

  if (!date || !time) return emptyResult;

  const newStart = timeToMinutes(time);
  const safeDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 30;
  const newEnd = newStart + safeDuration;

  // Filter appointments for the same date and same professional, excluding cancelled/anulado/ausente and the current appointment
  const dayAppointments = (existingAppointments || []).filter((apt) => {
    if (!apt || !apt.date || !apt.time) return false;
    if (apt.date !== date) return false;
    if (excludeAppointmentId && (apt.id === excludeAppointmentId || apt.id === String(excludeAppointmentId))) {
      return false;
    }
    if (professionalId) {
      const aptOwner = apt.userId || apt.doctorId;
      if (aptOwner && aptOwner !== professionalId) {
        return false;
      }
    }
    const status = (apt.status || '').toLowerCase().trim();
    if (status === 'cancelado' || status === 'cancelled' || status === 'anulado' || status === 'ausente') {
      return false;
    }
    return true;
  });

  const overlappingAppointments: any[] = [];
  const detailedConflicts: DetailedConflict[] = [];

  for (const apt of dayAppointments) {
    const aptStart = timeToMinutes(apt.time);
    const aptDuration = Number(apt.duration) > 0 ? Number(apt.duration) : 30;
    const aptEnd = aptStart + aptDuration;

    // Semi-open interval overlap check: newStart < aptEnd && aptStart < newEnd
    if (newStart < aptEnd && aptStart < newEnd) {
      overlappingAppointments.push(apt);
      detailedConflicts.push({
        id: apt.id,
        patientName: apt.patientName || 'Paciente',
        time: apt.time,
        endTime: apt.endTime || minutesToTime(aptEnd),
        duration: aptDuration,
        treatment: apt.type || apt.treatment || 'Consulta',
        status: apt.status || 'pendiente',
        isOverturn: Boolean(apt.isOverturn)
      });
    }
  }

  if (overlappingAppointments.length > 0) {
    const overlapCount = overlappingAppointments.length;
    const firstApt = overlappingAppointments[0];
    const firstConflict = detailedConflicts[0];

    let conflictSummary = '';
    if (overlapCount === 1) {
      conflictSummary = `Superposición detectada: ${firstConflict.time}–${firstConflict.endTime} hs · Paciente: ${firstConflict.patientName} · Tratamiento: ${firstConflict.treatment}`;
    } else {
      const detailsList = detailedConflicts.map(c => `${c.patientName} (${c.time}–${c.endTime} hs)`).join(', ');
      conflictSummary = `Superposición detectada con ${overlapCount} turnos: ${detailsList}`;
    }

    const message = `Superposición de horarios detectada con ${overlapCount} turno(s) existente(s). Se guardará automáticamente como SOBRETURNO sin bloquear la agenda.`;

    return {
      hasConflict: true,
      isOverturn: true,
      overturnReason: 'time_overlap',
      conflictingAppointment: firstApt,
      overlappingAppointments,
      overlappingAppointmentIds: overlappingAppointments.map(a => a.id).filter(Boolean),
      overlapCount,
      detailedConflicts,
      conflictSummary,
      message
    };
  }

  return emptyResult;
}

export interface WorkingHoursCheck {
  isOutside: boolean;
  isNonWorkingDay: boolean;
  reason: string;
}

/**
 * Determines whether a given appointment date and time falls outside normal working hours.
 * If outside normal hours or extends past working hours, it qualifies as a "Sobre Turno".
 */
export function checkIsOutsideWorkingHours(
  dateStr: string,
  timeStr: string,
  workingHours?: any,
  durationMinutes?: number
): WorkingHoursCheck {
  if (!dateStr || !timeStr) {
    return { isOutside: false, isNonWorkingDay: false, reason: '' };
  }

  // Fallback defaults if workingHours is not configured
  const effectiveHours = workingHours || {
    workingDays: [1, 2, 3, 4, 5],
    morningStart: '08:00',
    morningEnd: '12:00',
    morningActive: true,
    afternoonStart: '14:00',
    afternoonEnd: '18:00',
    afternoonActive: true
  };

  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const jsDay = d.getDay(); // 0 is Sunday, 1 is Monday...
    const mappedDay = jsDay === 0 ? 7 : jsDay; // 1 to 7

    const workingDays = effectiveHours.workingDays || effectiveHours.days || [];
    if (workingDays.length > 0 && !workingDays.includes(mappedDay)) {
      const dayName = DAYS_NAMES[mappedDay - 1] || 'este día';
      return {
        isOutside: true,
        isNonWorkingDay: true,
        reason: `Día no laborable habitual (${dayName})`
      };
    }

    const startMin = timeToMinutes(timeStr);
    const safeDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 30;
    const endMin = startMin + safeDuration;

    const mStartMin = timeToMinutes(effectiveHours.morningStart || '08:00');
    const mEndMin = timeToMinutes(effectiveHours.morningEnd || '12:00');
    const aStartMin = timeToMinutes(effectiveHours.afternoonStart || '14:00');
    const aEndMin = timeToMinutes(effectiveHours.afternoonEnd || '18:00');

    const morningActive = effectiveHours.morningActive !== false;
    const afternoonActive = effectiveHours.afternoonActive !== false;

    // Inside morning shift if starts at or after morningStart AND finishes at or before morningEnd
    const isMorning = morningActive && startMin >= mStartMin && endMin <= mEndMin;

    // Inside afternoon shift if starts at or after afternoonStart AND finishes at or before afternoonEnd
    const isAfternoon = afternoonActive && startMin >= aStartMin && endMin <= aEndMin;

    if (!isMorning && !isAfternoon) {
      let scheduleText = '';
      if (morningActive && effectiveHours.morningStart && effectiveHours.morningEnd) {
        scheduleText += `Mañana: ${effectiveHours.morningStart} - ${effectiveHours.morningEnd}`;
      }
      if (afternoonActive && effectiveHours.afternoonStart && effectiveHours.afternoonEnd) {
        if (scheduleText) scheduleText += ' / ';
        scheduleText += `Tarde: ${effectiveHours.afternoonStart} - ${effectiveHours.afternoonEnd}`;
      }

      let detail = '';
      if (morningActive && startMin >= mStartMin && startMin < mEndMin && endMin > mEndMin) {
        detail = `El tratamiento termina a las ${minutesToTime(endMin)} hs (después del fin del turno matutino)`;
      } else if (afternoonActive && startMin >= aStartMin && startMin < aEndMin && endMin > aEndMin) {
        detail = `El tratamiento termina a las ${minutesToTime(endMin)} hs (después del fin del turno vespertino)`;
      } else if (morningActive && afternoonActive && startMin >= mEndMin && startMin < aStartMin) {
        detail = `Horario en receso del mediodía (${timeStr} hs)`;
      } else {
        detail = `Horario fuera de atención (${timeStr} hs)`;
      }

      return {
        isOutside: true,
        isNonWorkingDay: false,
        reason: `${detail}. Horario habitual: ${scheduleText || '08:00 a 12:00 / 14:00 a 18:00'}`
      };
    }

    return { isOutside: false, isNonWorkingDay: false, reason: '' };
  } catch (_) {
    return { isOutside: false, isNonWorkingDay: false, reason: '' };
  }
}

export interface DayOccupiedSlot {
  id: string;
  time: string;
  endTime: string;
  duration: number;
  patientName: string;
  treatment: string;
  isOverturn: boolean;
  status: string;
}

/**
 * Returns a sorted list of occupied slots for a given date.
 */
export function getDayOccupiedSlots(
  date: string,
  appointments: any[],
  excludeAppointmentId?: string
): DayOccupiedSlot[] {
  if (!date) return [];

  const slots: DayOccupiedSlot[] = [];
  const filtered = (appointments || []).filter((apt) => {
    if (!apt || apt.date !== date || !apt.time) return false;
    if (excludeAppointmentId && (apt.id === excludeAppointmentId || apt.id === String(excludeAppointmentId))) {
      return false;
    }
    const status = (apt.status || '').toLowerCase();
    if (status === 'cancelado' || status === 'cancelled') return false;
    return true;
  });

  for (const apt of filtered) {
    const duration = Number(apt.duration) > 0 ? Number(apt.duration) : 30;
    const endTime = apt.endTime || calculateEndTime(apt.time, duration);
    slots.push({
      id: apt.id,
      time: apt.time,
      endTime,
      duration,
      patientName: apt.patientName || 'Paciente',
      treatment: apt.type || apt.treatment || 'Tratamiento',
      isOverturn: Boolean(apt.isOverturn),
      status: apt.status || 'pendiente'
    });
  }

  // Sort by start time in minutes
  return slots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
}

export interface SuggestedSlot {
  time: string;
  endTime: string;
  isOverturn: boolean;
  isConflict: boolean;
  conflictSummary?: string;
  isOutsideWorkingHours?: boolean;
  outsideHoursReason?: string | null;
  label: string;
  shift: 'morning' | 'afternoon';
}

export interface DayWorkingHoursInfo {
  isWorkingDay: boolean;
  dayName: string;
  morningActive: boolean;
  morningText: string;
  afternoonActive: boolean;
  afternoonText: string;
  scheduleSummary: string;
}

/**
 * Returns detailed working hours information for a specific date.
 */
export function getWorkingHoursDayInfo(
  dateStr: string,
  workingHours?: any
): DayWorkingHoursInfo {
  const effectiveHours = workingHours || {
    workingDays: [1, 2, 3, 4, 5],
    morningStart: '08:00',
    morningEnd: '12:00',
    morningActive: true,
    afternoonStart: '14:00',
    afternoonEnd: '18:00',
    afternoonActive: true
  };

  if (!dateStr) {
    return {
      isWorkingDay: true,
      dayName: '',
      morningActive: true,
      morningText: '08:00 a 12:00 hs',
      afternoonActive: true,
      afternoonText: '14:00 a 18:00 hs',
      scheduleSummary: '08:00 - 12:00 / 14:00 - 18:00 hs'
    };
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const jsDay = d.getDay(); // 0 is Sunday, 1 is Monday...
  const mappedDay = jsDay === 0 ? 7 : jsDay;
  const dayName = DAYS_NAMES[mappedDay - 1] || '';

  const workingDays = effectiveHours.workingDays || effectiveHours.days || [];
  const isWorkingDay = workingDays.length === 0 || workingDays.includes(mappedDay);

  const morningActive = effectiveHours.morningActive !== false;
  const afternoonActive = effectiveHours.afternoonActive !== false;

  const morningText = morningActive && effectiveHours.morningStart && effectiveHours.morningEnd
    ? `${effectiveHours.morningStart} a ${effectiveHours.morningEnd} hs`
    : '';

  const afternoonText = afternoonActive && effectiveHours.afternoonStart && effectiveHours.afternoonEnd
    ? `${effectiveHours.afternoonStart} a ${effectiveHours.afternoonEnd} hs`
    : '';

  const parts = [];
  if (morningText) parts.push(`Mañana: ${morningText}`);
  if (afternoonText) parts.push(`Tarde: ${afternoonText}`);

  return {
    isWorkingDay,
    dayName,
    morningActive,
    morningText,
    afternoonActive,
    afternoonText,
    scheduleSummary: parts.join(' | ') || 'Sin horario activo'
  };
}

/**
 * Suggests starting time slots for a given date and treatment duration.
 * Provides both collision-free slots and slots with overturn/superposición
 * so the practitioner can choose with full transparency and zero blocking.
 */
export function getSuggestedAvailableSlots(
  date: string,
  durationMinutes: number,
  appointments: any[],
  workingHours?: any,
  excludeAppointmentId?: string
): SuggestedSlot[] {
  if (!date) return [];

  const safeDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 30;
  const effectiveHours = workingHours || {
    workingDays: [1, 2, 3, 4, 5],
    morningStart: '08:00',
    morningEnd: '12:00',
    morningActive: true,
    afternoonStart: '14:00',
    afternoonEnd: '18:00',
    afternoonActive: true
  };

  // Check if date is a working day
  try {
    const [year, month, day] = date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const jsDay = d.getDay();
    const mappedDay = jsDay === 0 ? 7 : jsDay;
    const workingDays = effectiveHours.workingDays || effectiveHours.days || [];

    if (workingDays.length > 0 && !workingDays.includes(mappedDay)) {
      // Non-working day: do not suggest regular slots
      return [];
    }
  } catch (_) {
    // If parsing fails, proceed with default check
  }

  const morningActive = effectiveHours.morningActive !== false;
  const afternoonActive = effectiveHours.afternoonActive !== false;

  const mStartMin = timeToMinutes(effectiveHours.morningStart || '08:00');
  const mEndMin = timeToMinutes(effectiveHours.morningEnd || '12:00');
  const aStartMin = timeToMinutes(effectiveHours.afternoonStart || '14:00');
  const aEndMin = timeToMinutes(effectiveHours.afternoonEnd || '18:00');

  const suggested: SuggestedSlot[] = [];
  const STEP_MINUTES = 15; // 15-minute resolution for scheduling precision

  // 1. Morning Shift Slots
  if (morningActive && mEndMin - mStartMin >= safeDuration) {
    for (let m = mStartMin; m <= mEndMin - safeDuration; m += STEP_MINUTES) {
      const timeStr = minutesToTime(m);
      const collision = checkScheduleCollision(date, timeStr, safeDuration, appointments, excludeAppointmentId);
      const outside = checkIsOutsideWorkingHours(date, timeStr, effectiveHours, safeDuration);
      const endTime = calculateEndTime(timeStr, safeDuration);
      const isOverturn = collision.hasConflict;

      suggested.push({
        time: timeStr,
        endTime,
        isOverturn,
        isConflict: collision.hasConflict,
        conflictSummary: collision.conflictSummary,
        isOutsideWorkingHours: outside.isOutside,
        outsideHoursReason: outside.isOutside ? outside.reason : null,
        label: `${timeStr} - ${endTime} hs`,
        shift: 'morning'
      });
    }
  }

  // 2. Afternoon Shift Slots
  if (afternoonActive && aEndMin - aStartMin >= safeDuration) {
    for (let m = aStartMin; m <= aEndMin - safeDuration; m += STEP_MINUTES) {
      const timeStr = minutesToTime(m);
      const collision = checkScheduleCollision(date, timeStr, safeDuration, appointments, excludeAppointmentId);
      const outside = checkIsOutsideWorkingHours(date, timeStr, effectiveHours, safeDuration);
      const endTime = calculateEndTime(timeStr, safeDuration);
      const isOverturn = collision.hasConflict;

      suggested.push({
        time: timeStr,
        endTime,
        isOverturn,
        isConflict: collision.hasConflict,
        conflictSummary: collision.conflictSummary,
        isOutsideWorkingHours: outside.isOutside,
        outsideHoursReason: outside.isOutside ? outside.reason : null,
        label: `${timeStr} - ${endTime} hs`,
        shift: 'afternoon'
      });
    }
  }

  return suggested;
}

export interface AppointmentLayoutInfo {
  colIndex: number;
  totalCols: number;
  leftPercent: number;
  widthPercent: number;
}

/**
 * Computes parallel layout columns for appointments on the same day.
 * If multiple appointments overlap in time (e.g. Sobreturnos), assigns side-by-side columns
 * so that all cards remain clearly visible, legible, and interactive without covering each other.
 */
export function computeOverlappingLayout(
  appointments: any[]
): Record<string, AppointmentLayoutInfo> {
  const layout: Record<string, AppointmentLayoutInfo> = {};
  if (!appointments || appointments.length === 0) return layout;

  // Filter valid appointments with date and time, excluding cancelled
  const valid = appointments.filter((apt) => {
    if (!apt || !apt.time) return false;
    const status = (apt.status || '').toLowerCase().trim();
    return status !== 'cancelado' && status !== 'cancelled' && status !== 'anulado';
  });

  if (valid.length === 0) return layout;

  // Sort by start time in minutes, then by duration descending
  const sorted = [...valid].sort((a, b) => {
    const startA = timeToMinutes(a.time);
    const startB = timeToMinutes(b.time);
    if (startA !== startB) return startA - startB;
    const durA = Number(a.duration) > 0 ? Number(a.duration) : 30;
    const durB = Number(b.duration) > 0 ? Number(b.duration) : 30;
    return durB - durA;
  });

  // Group into connected components (clusters of overlapping intervals)
  const clusters: any[][] = [];
  let currentCluster: any[] = [];
  let clusterEnd = -1;

  for (const apt of sorted) {
    const start = timeToMinutes(apt.time);
    const dur = Number(apt.duration) > 0 ? Number(apt.duration) : 30;
    const end = start + dur;

    if (currentCluster.length === 0) {
      currentCluster.push(apt);
      clusterEnd = end;
    } else {
      // If this appointment starts before the cluster ends, it overlaps and belongs to this cluster
      if (start < clusterEnd) {
        currentCluster.push(apt);
        clusterEnd = Math.max(clusterEnd, end);
      } else {
        clusters.push(currentCluster);
        currentCluster = [apt];
        clusterEnd = end;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // For each cluster, greedily assign columns
  for (const cluster of clusters) {
    const colEndTimes: number[] = [];
    const aptCols: { apt: any; col: number }[] = [];

    for (const apt of cluster) {
      const start = timeToMinutes(apt.time);
      const dur = Number(apt.duration) > 0 ? Number(apt.duration) : 30;
      const end = start + dur;

      let placedCol = -1;
      for (let c = 0; c < colEndTimes.length; c++) {
        if (colEndTimes[c] <= start) {
          placedCol = c;
          colEndTimes[c] = end;
          break;
        }
      }

      if (placedCol === -1) {
        placedCol = colEndTimes.length;
        colEndTimes.push(end);
      }

      aptCols.push({ apt, col: placedCol });
    }

    const totalCols = Math.max(1, colEndTimes.length);
    for (const item of aptCols) {
      const colIndex = item.col;
      const widthPercent = 100 / totalCols;
      const leftPercent = colIndex * widthPercent;

      layout[item.apt.id] = {
        colIndex,
        totalCols,
        leftPercent,
        widthPercent
      };
    }
  }

  return layout;
}

/**
 * Returns consistent styling rules (border, background, badge, dot, text)
 * matching the status of an appointment.
 */
export function getAppointmentStatusStyles(status?: string) {
  const norm = (status || 'pendiente').toLowerCase().trim();

  if (norm === 'finished' || norm === 'finalizado') {
    return {
      borderColor: 'border-emerald-500',
      borderLeftColor: 'border-l-emerald-600',
      borderSubtle: 'border-emerald-300',
      borderSubtleLight: 'border-emerald-200',
      bg: 'bg-emerald-50/95',
      bgLight: 'bg-emerald-50/30',
      textColor: 'text-emerald-950',
      textAccent: 'text-emerald-700',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      badgeBorder: 'border-emerald-300',
      dotColor: 'bg-emerald-600',
      shadow: 'shadow-emerald-950/10',
      label: 'Finalizado'
    };
  }

  if (norm === 'in-session' || norm === 'en-sesion' || norm === 'atendiendo') {
    return {
      borderColor: 'border-teal-500',
      borderLeftColor: 'border-l-teal-600',
      borderSubtle: 'border-teal-300',
      borderSubtleLight: 'border-teal-200',
      bg: 'bg-teal-50/95',
      bgLight: 'bg-teal-50/30',
      textColor: 'text-teal-950',
      textAccent: 'text-teal-700',
      badgeBg: 'bg-teal-100',
      badgeText: 'text-teal-800',
      badgeBorder: 'border-teal-300',
      dotColor: 'bg-teal-600',
      shadow: 'shadow-teal-950/10',
      label: 'En Sesión'
    };
  }

  if (norm === 'confirmed' || norm === 'confirmado') {
    return {
      borderColor: 'border-blue-500',
      borderLeftColor: 'border-l-blue-600',
      borderSubtle: 'border-blue-300',
      borderSubtleLight: 'border-blue-200',
      bg: 'bg-blue-50/90',
      bgLight: 'bg-blue-50/30',
      textColor: 'text-blue-950',
      textAccent: 'text-primary',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-800',
      badgeBorder: 'border-blue-300',
      dotColor: 'bg-primary',
      shadow: 'shadow-blue-950/10',
      label: 'Confirmado'
    };
  }

  if (norm === 'cancelado' || norm === 'cancelled' || norm === 'anulado') {
    return {
      borderColor: 'border-rose-400',
      borderLeftColor: 'border-l-rose-500',
      borderSubtle: 'border-rose-300',
      borderSubtleLight: 'border-rose-200',
      bg: 'bg-rose-50/80',
      bgLight: 'bg-rose-50/30',
      textColor: 'text-rose-950',
      textAccent: 'text-rose-700',
      badgeBg: 'bg-rose-100',
      badgeText: 'text-rose-800',
      badgeBorder: 'border-rose-300',
      dotColor: 'bg-rose-500',
      shadow: 'shadow-rose-950/10',
      label: 'Cancelado'
    };
  }

  if (norm === 'ausente') {
    return {
      borderColor: 'border-orange-400',
      borderLeftColor: 'border-l-orange-500',
      borderSubtle: 'border-orange-300',
      borderSubtleLight: 'border-orange-200',
      bg: 'bg-orange-50/80',
      bgLight: 'bg-orange-50/30',
      textColor: 'text-orange-950',
      textAccent: 'text-orange-700',
      badgeBg: 'bg-orange-100',
      badgeText: 'text-orange-800',
      badgeBorder: 'border-orange-300',
      dotColor: 'bg-orange-500',
      shadow: 'shadow-orange-950/10',
      label: 'Ausente'
    };
  }

  // default: 'pendiente'
  return {
    borderColor: 'border-amber-400',
    borderLeftColor: 'border-l-amber-500',
    borderSubtle: 'border-amber-300',
    borderSubtleLight: 'border-amber-200',
    bg: 'bg-amber-50/95',
    bgLight: 'bg-amber-50/30',
    textColor: 'text-amber-950',
    textAccent: 'text-amber-700',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-300',
    dotColor: 'bg-amber-500',
    shadow: 'shadow-amber-950/5',
    label: 'Pendiente'
  };
}
