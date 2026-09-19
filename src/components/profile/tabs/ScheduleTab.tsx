import React, { useMemo } from 'react';
import { 
  Clock, 
  Calendar, 
  Sun, 
  Moon, 
  Copy, 
  Check, 
  AlertCircle, 
  Info,
  Building2,
  UserCheck,
  Ban,
  CheckCircle2
} from 'lucide-react';
import { ProfileState } from '../../../types/profile';
import { cn } from '../../../lib/utils';

interface ScheduleTabProps {
  profile: ProfileState;
  onChange: <K extends keyof ProfileState>(field: K, value: ProfileState[K]) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const DAYS_OF_WEEK = [
  { id: 1, label: 'Lunes', short: 'Lun' },
  { id: 2, label: 'Martes', short: 'Mar' },
  { id: 3, label: 'Miércoles', short: 'Mié' },
  { id: 4, label: 'Jueves', short: 'Jue' },
  { id: 5, label: 'Viernes', short: 'Vie' },
  { id: 6, label: 'Sábado', short: 'Sáb' },
  { id: 0, label: 'Domingo', short: 'Dom' },
];

export function ScheduleTab({
  profile,
  onChange,
  showToast
}: ScheduleTabProps) {
  const toggleDay = (dayId: number) => {
    const current = profile.workingDays || [];
    const updated = current.includes(dayId)
      ? current.filter(d => d !== dayId)
      : [...current, dayId].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
    onChange('workingDays', updated);
  };

  const copyMondayToAll = () => {
    // Select Monday through Friday
    onChange('workingDays', [1, 2, 3, 4, 5]);
    showToast('Horario aplicado de Lunes a Viernes', 'info');
  };

  const selectFullWeek = () => {
    onChange('workingDays', [1, 2, 3, 4, 5, 6]);
    showToast('Horario aplicado de Lunes a Sábado', 'info');
  };

  // Capacity calculation
  const stats = useMemo(() => {
    let dailyMinutes = 0;
    if (profile.morningActive && profile.morningStart && profile.morningEnd) {
      const [mSh, mSm] = profile.morningStart.split(':').map(Number);
      const [mEh, mEm] = profile.morningEnd.split(':').map(Number);
      const mDuration = (mEh * 60 + mEm) - (mSh * 60 + mSm);
      if (mDuration > 0) dailyMinutes += mDuration;
    }
    if (profile.afternoonActive && profile.afternoonStart && profile.afternoonEnd) {
      const [aSh, aSm] = profile.afternoonStart.split(':').map(Number);
      const [aEh, aEm] = profile.afternoonEnd.split(':').map(Number);
      const aDuration = (aEh * 60 + aEm) - (aSh * 60 + aSm);
      if (aDuration > 0) dailyMinutes += aDuration;
    }

    const activeDaysCount = profile.workingDays?.length || 0;
    const weeklyMinutes = dailyMinutes * activeDaysCount;
    const weeklyHours = (weeklyMinutes / 60).toFixed(1);
    const slotDuration = profile.appointmentDurationMinutes || 30;
    const estimatedWeeklySlots = Math.floor(weeklyMinutes / slotDuration);

    return {
      dailyHours: (dailyMinutes / 60).toFixed(1),
      weeklyHours,
      activeDaysCount,
      estimatedWeeklySlots,
      slotDuration
    };
  }, [
    profile.morningActive,
    profile.morningStart,
    profile.morningEnd,
    profile.afternoonActive,
    profile.afternoonStart,
    profile.afternoonEnd,
    profile.workingDays,
    profile.appointmentDurationMinutes
  ]);

  // Validation
  const morningError = useMemo(() => {
    if (!profile.morningActive) return null;
    if (profile.morningStart >= profile.morningEnd) {
      return 'La hora de inicio de la mañana debe ser anterior a la de fin.';
    }
    return null;
  }, [profile.morningActive, profile.morningStart, profile.morningEnd]);

  const afternoonError = useMemo(() => {
    if (!profile.afternoonActive) return null;
    if (profile.afternoonStart >= profile.afternoonEnd) {
      return 'La hora de inicio de la tarde debe ser anterior a la de fin.';
    }
    if (profile.morningActive && profile.afternoonStart < profile.morningEnd) {
      return 'El turno de la tarde no puede solaparse con el de la mañana.';
    }
    return null;
  }, [
    profile.afternoonActive,
    profile.afternoonStart,
    profile.afternoonEnd,
    profile.morningActive,
    profile.morningEnd
  ]);

  return (
    <div className="space-y-6">
      {/* Scope Mode Selector Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                Modalidad y Alcance de los Horarios
              </h3>
              <p className="text-xs text-on-surface-variant">
                Defina si este horario representa su disponibilidad de turnos o el horario de apertura institucional.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-primary bg-primary/5 px-2.5 py-1 rounded-full border border-primary/20">
            Zona: America/Argentina/Buenos_Aires (GMT-3)
          </span>
        </div>

        {/* 3 Scope Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onChange('scheduleMode', 'no_clinical_appointments')}
            className={cn(
              "p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[110px]",
              profile.scheduleMode === 'no_clinical_appointments'
                ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary"
                : "bg-surface border-outline-variant hover:border-primary/40 text-on-surface"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="p-2 bg-white rounded-lg border border-outline-variant text-primary">
                <Ban size={16} />
              </div>
              {profile.scheduleMode === 'no_clinical_appointments' && (
                <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded-full uppercase">
                  Activo
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-black text-on-surface">Sin Atención de Pacientes</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Rol puramente directivo/administrativo. No bloquea turnos ni aparece en la agenda pública de citas.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChange('scheduleMode', 'personal_availability')}
            className={cn(
              "p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[110px]",
              profile.scheduleMode === 'personal_availability'
                ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary"
                : "bg-surface border-outline-variant hover:border-primary/40 text-on-surface"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="p-2 bg-white rounded-lg border border-outline-variant text-primary">
                <UserCheck size={16} />
              </div>
              {profile.scheduleMode === 'personal_availability' && (
                <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded-full uppercase">
                  Activo
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-black text-on-surface">Mi Disponibilidad Personal</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Horario para consultas médicas propias o audiencias administrativas directas.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChange('scheduleMode', 'institutional_reference')}
            className={cn(
              "p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[110px]",
              profile.scheduleMode === 'institutional_reference'
                ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary"
                : "bg-surface border-outline-variant hover:border-primary/40 text-on-surface"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="p-2 bg-white rounded-lg border border-outline-variant text-primary">
                <Building2 size={16} />
              </div>
              {profile.scheduleMode === 'institutional_reference' && (
                <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded-full uppercase">
                  Activo
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-black text-on-surface">Horario Institucional</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Horario de apertura de la sede clínica que sirve de guía a secretaría y pacientes.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Days & Hours Configuration */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-6">
        {/* Days of Week Selection */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                Días de Atención / Apertura
              </h4>
              <p className="text-[11px] text-on-surface-variant">
                Seleccione los días en que está habilitada la actividad.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyMondayToAll}
                className="px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant rounded-xl text-xs font-bold text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Habilitar de Lunes a Viernes"
              >
                <Copy size={13} />
                <span>Lun - Vie</span>
              </button>
              <button
                type="button"
                onClick={selectFullWeek}
                className="px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant rounded-xl text-xs font-bold text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Habilitar de Lunes a Sábado"
              >
                <Copy size={13} />
                <span>Lun - Sáb</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = profile.workingDays?.includes(day.id);
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => toggleDay(day.id)}
                  className={cn(
                    "p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[56px]",
                    isSelected
                      ? "bg-primary text-white border-primary shadow-xs font-bold"
                      : "bg-surface text-on-surface-variant border-outline-variant hover:border-primary/40 font-medium"
                  )}
                  aria-pressed={isSelected}
                  aria-label={`${day.label}: ${isSelected ? 'activo' : 'inactivo'}`}
                >
                  <span className="text-xs">{day.short}</span>
                  <span className="text-[10px] opacity-80">{isSelected ? 'Activo' : 'Cerrado'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Morning & Afternoon Shifts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/60">
          {/* Morning Shift */}
          <div className={cn(
            "p-4 rounded-xl border transition-all space-y-3",
            profile.morningActive ? "bg-white border-outline-variant" : "bg-surface-dim/40 border-outline-variant/50 opacity-70"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun size={16} className="text-amber-500" />
                <span className="text-xs font-black text-on-surface uppercase tracking-wider">
                  Turno Mañana
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-on-surface">
                <span>{profile.morningActive ? 'Habilitado' : 'Desactivado'}</span>
                <input 
                  type="checkbox"
                  checked={profile.morningActive}
                  onChange={(e) => onChange('morningActive', e.target.checked)}
                  className="w-4 h-4 text-primary rounded-md focus:ring-primary cursor-pointer"
                />
              </label>
            </div>

            {profile.morningActive && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="morning-start" className="text-[11px] font-bold text-on-surface-variant">
                    Desde (hs)
                  </label>
                  <input 
                    id="morning-start"
                    type="time"
                    value={profile.morningStart}
                    onChange={(e) => onChange('morningStart', e.target.value)}
                    className="w-full px-3 py-2 bg-surface text-on-surface text-xs font-mono font-bold rounded-xl border border-outline-variant focus:border-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="morning-end" className="text-[11px] font-bold text-on-surface-variant">
                    Hasta (hs)
                  </label>
                  <input 
                    id="morning-end"
                    type="time"
                    value={profile.morningEnd}
                    onChange={(e) => onChange('morningEnd', e.target.value)}
                    className="w-full px-3 py-2 bg-surface text-on-surface text-xs font-mono font-bold rounded-xl border border-outline-variant focus:border-primary outline-none"
                  />
                </div>
              </div>
            )}

            {morningError && (
              <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                <AlertCircle size={13} /> {morningError}
              </p>
            )}
          </div>

          {/* Afternoon Shift */}
          <div className={cn(
            "p-4 rounded-xl border transition-all space-y-3",
            profile.afternoonActive ? "bg-white border-outline-variant" : "bg-surface-dim/40 border-outline-variant/50 opacity-70"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon size={16} className="text-indigo-500" />
                <span className="text-xs font-black text-on-surface uppercase tracking-wider">
                  Turno Tarde
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-on-surface">
                <span>{profile.afternoonActive ? 'Habilitado' : 'Desactivado'}</span>
                <input 
                  type="checkbox"
                  checked={profile.afternoonActive}
                  onChange={(e) => onChange('afternoonActive', e.target.checked)}
                  className="w-4 h-4 text-primary rounded-md focus:ring-primary cursor-pointer"
                />
              </label>
            </div>

            {profile.afternoonActive && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="afternoon-start" className="text-[11px] font-bold text-on-surface-variant">
                    Desde (hs)
                  </label>
                  <input 
                    id="afternoon-start"
                    type="time"
                    value={profile.afternoonStart}
                    onChange={(e) => onChange('afternoonStart', e.target.value)}
                    className="w-full px-3 py-2 bg-surface text-on-surface text-xs font-mono font-bold rounded-xl border border-outline-variant focus:border-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="afternoon-end" className="text-[11px] font-bold text-on-surface-variant">
                    Hasta (hs)
                  </label>
                  <input 
                    id="afternoon-end"
                    type="time"
                    value={profile.afternoonEnd}
                    onChange={(e) => onChange('afternoonEnd', e.target.value)}
                    className="w-full px-3 py-2 bg-surface text-on-surface text-xs font-mono font-bold rounded-xl border border-outline-variant focus:border-primary outline-none"
                  />
                </div>
              </div>
            )}

            {afternoonError && (
              <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                <AlertCircle size={13} /> {afternoonError}
              </p>
            )}
          </div>
        </div>

        {/* Appointment Duration & Capacity Summary */}
        <div className="p-4 bg-surface rounded-xl border border-outline-variant space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label htmlFor="appointment-duration" className="text-xs font-bold text-on-surface">
                Duración Estándar de Consulta / Turno
              </label>
              <p className="text-[11px] text-on-surface-variant">
                Determina el espaciado predeterminado de los intervalos en la agenda.
              </p>
            </div>
            <select
              id="appointment-duration"
              value={profile.appointmentDurationMinutes || 30}
              onChange={(e) => onChange('appointmentDurationMinutes', Number(e.target.value))}
              className="px-3 py-2 bg-white text-on-surface text-xs font-bold rounded-xl border border-outline-variant focus:border-primary outline-none cursor-pointer"
            >
              <option value={15}>15 minutos</option>
              <option value={20}>20 minutos</option>
              <option value={30}>30 minutos (Recomendado)</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos (1 hora)</option>
            </select>
          </div>

          {/* Real-time Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-outline-variant/60 text-xs">
            <div className="p-2.5 bg-white rounded-lg border border-outline-variant/80">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase">Días Activos</span>
              <p className="text-sm font-black text-on-surface mt-0.5">{stats.activeDaysCount} días / sem</p>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-outline-variant/80">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase">Carga Diaria</span>
              <p className="text-sm font-black text-on-surface mt-0.5">{stats.dailyHours} hs / día</p>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-outline-variant/80">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase">Carga Semanal</span>
              <p className="text-sm font-black text-primary mt-0.5">{stats.weeklyHours} horas</p>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-outline-variant/80">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase">Capacidad Máxima</span>
              <p className="text-sm font-black text-emerald-700 mt-0.5">~{stats.estimatedWeeklySlots} turnos</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
