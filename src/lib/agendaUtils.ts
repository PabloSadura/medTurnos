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

export interface ConflictResult {
  hasConflict: boolean;
  conflictingAppointment?: any;
  message?: string;
}

/**
 * Checks if a proposed appointment slot overlaps with any existing appointment on the same date.
 * Two appointments overlap if:
 * [newStart, newEnd) overlaps with [existStart, existEnd)
 * => newStart < existEnd && existStart < newEnd
 */
export function checkScheduleCollision(
  date: string,
  time: string,
  durationMinutes: number,
  existingAppointments: any[],
  excludeAppointmentId?: string
): ConflictResult {
  if (!date || !time) return { hasConflict: false };

  const newStart = timeToMinutes(time);
  const safeDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 30;
  const newEnd = newStart + safeDuration;

  // Filter appointments for the same date, excluding cancelled/cancelados and the current appointment being edited
  const dayAppointments = (existingAppointments || []).filter((apt) => {
    if (!apt || !apt.date || !apt.time) return false;
    if (apt.date !== date) return false;
    if (excludeAppointmentId && (apt.id === excludeAppointmentId || apt.id === String(excludeAppointmentId))) {
      return false;
    }
    const status = (apt.status || '').toLowerCase();
    if (status === 'cancelado' || status === 'cancelled') {
      return false;
    }
    return true;
  });

  for (const apt of dayAppointments) {
    const aptStart = timeToMinutes(apt.time);
    const aptDuration = Number(apt.duration) > 0 ? Number(apt.duration) : 30;
    const aptEnd = aptStart + aptDuration;

    // Strict overlapping interval check
    if (newStart < aptEnd && aptStart < newEnd) {
      const aptEndFormatted = minutesToTime(aptEnd);
      const treatmentName = apt.type || apt.treatment || 'Consulta';
      const patientName = apt.patientName || 'Paciente';

      let reason = '';
      if (newStart === aptStart) {
        reason = `Ya existe un turno agendado exactamente a las ${apt.time} hs`;
      } else if (newStart > aptStart && newStart < aptEnd) {
        reason = `El tratamiento anterior de ${patientName} (${treatmentName}) comenzó a las ${apt.time} hs y aún no terminó (finaliza a las ${aptEndFormatted} hs)`;
      } else {
        reason = `El tratamiento propuesto duraría hasta las ${minutesToTime(newEnd)} hs, superponiéndose con el turno de ${patientName} que inicia a las ${apt.time} hs`;
      }

      return {
        hasConflict: true,
        conflictingAppointment: apt,
        message: `Horario Bloqueado: ${reason}. No se pueden dar 2 turnos en el mismo horario.`
      };
    }
  }

  return { hasConflict: false };
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

/**
 * Suggests available starting time slots for a given date and treatment duration.
 */
export function getSuggestedAvailableSlots(
  date: string,
  durationMinutes: number,
  appointments: any[],
  workingHours?: any,
  excludeAppointmentId?: string
): Array<{ time: string; endTime: string; isOverturn: boolean; label: string }> {
  if (!date) return [];

  const safeDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 30;
  const suggested: Array<{ time: string; endTime: string; isOverturn: boolean; label: string }> = [];

  // Generate potential slots every 15 minutes between 08:00 and 20:00
  for (let m = 8 * 60; m <= 20 * 60 - safeDuration; m += 15) {
    const timeStr = minutesToTime(m);
    const collision = checkScheduleCollision(date, timeStr, safeDuration, appointments, excludeAppointmentId);
    if (!collision.hasConflict) {
      const outside = checkIsOutsideWorkingHours(date, timeStr, workingHours, safeDuration);
      const endTime = calculateEndTime(timeStr, safeDuration);
      suggested.push({
        time: timeStr,
        endTime,
        isOverturn: outside.isOutside,
        label: `${timeStr} - ${endTime} hs`
      });
    }
  }

  return suggested;
}
