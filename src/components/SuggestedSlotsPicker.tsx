import React from 'react';
import { Clock, CheckCircle2, AlertCircle, Sun, Sunset, Sparkles } from 'lucide-react';
import { SuggestedSlot, getWorkingHoursDayInfo } from '../lib/agendaUtils';
import { cn } from '../lib/utils';

interface SuggestedSlotsPickerProps {
  slots: SuggestedSlot[];
  selectedTime: string;
  onSelectTime: (time: string) => void;
  duration: number;
  treatmentName?: string;
  dateStr: string;
  workingHours?: any;
}

export const SuggestedSlotsPicker: React.FC<SuggestedSlotsPickerProps> = ({
  slots,
  selectedTime,
  onSelectTime,
  duration,
  treatmentName,
  dateStr,
  workingHours
}) => {
  const dayInfo = getWorkingHoursDayInfo(dateStr, workingHours);

  const morningSlots = slots.filter(s => s.shift === 'morning');
  const afternoonSlots = slots.filter(s => s.shift === 'afternoon');

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-3 shadow-xs">
      {/* Header with metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-primary/15 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center shadow-2xs shrink-0">
            <Clock size={15} />
          </div>
          <div>
            <h4 className="text-xs font-black text-on-surface flex items-center gap-1.5">
              Horarios Sugeridos Disponibles
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.2 rounded-md">
                Sin sobreturnos
              </span>
            </h4>
            <p className="text-[11px] text-on-surface-variant font-medium">
              {dayInfo.dayName ? `${dayInfo.dayName} • ` : ''}
              {dayInfo.isWorkingDay ? dayInfo.scheduleSummary : 'Día no laborable habitual'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
          <span className="text-[10px] font-bold bg-white text-primary border border-primary/20 px-2 py-0.5 rounded-md flex items-center gap-1">
            <Sparkles size={11} className="text-primary" />
            {treatmentName ? `${treatmentName}: ` : ''}{duration} min
          </span>
          {dayInfo.isWorkingDay && (
            <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-md">
              {slots.length} libres
            </span>
          )}
        </div>
      </div>

      {/* Non-working day case */}
      {!dayInfo.isWorkingDay && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-900">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-bold">
              Este día no está configurado como laborable en los horarios de atención ({dayInfo.dayName}).
            </p>
            <p className="text-[11px] text-amber-800">
              Por política de atención, no se sugieren turnos regulares. Si requiere agendar una excepción, puede ingresar la hora manualmente y marcar la opción de <strong>Sobre Turno</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Working day with 0 available slots */}
      {dayInfo.isWorkingDay && slots.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-900">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-bold">
              No hay horarios disponibles libres de superposición para {duration} min en esta fecha.
            </p>
            <p className="text-[11px] text-amber-800">
              Todos los horarios habituales se encuentran ocupados o no tienen un bloque contiguo suficiente para este tratamiento. Seleccione otra fecha o consulte los turnos ya agendados.
            </p>
          </div>
        </div>
      )}

      {/* Available slots grouped by shift */}
      {dayInfo.isWorkingDay && slots.length > 0 && (
        <div className="space-y-2.5">
          {/* Morning Shift */}
          {dayInfo.morningActive && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-on-surface-variant">
                <span className="flex items-center gap-1.5 text-amber-800">
                  <Sun size={13} className="text-amber-600" />
                  Turno Mañana {dayInfo.morningText ? `(${dayInfo.morningText})` : ''}
                </span>
                <span className="text-[10px] text-on-surface-variant font-medium">
                  {morningSlots.length} {morningSlots.length === 1 ? 'horario' : 'horarios'}
                </span>
              </div>

              {morningSlots.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {morningSlots.map(slot => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => onSelectTime(slot.time)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-xs transition-all flex flex-col items-center justify-center cursor-pointer min-w-[70px]",
                          isSelected
                            ? "bg-primary text-white font-black shadow-sm ring-2 ring-primary ring-offset-1"
                            : "bg-white hover:bg-primary-container/40 text-on-surface border border-outline-variant hover:border-primary/50 font-bold shadow-2xs"
                        )}
                        title={`De ${slot.time} a ${slot.endTime} hs (${duration} min)`}
                      >
                        <span className="leading-tight text-[12px]">{slot.time} hs</span>
                        <span className={cn(
                          "text-[9px] leading-tight opacity-75",
                          isSelected ? "text-white" : "text-on-surface-variant"
                        )}>
                          hasta {slot.endTime}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-on-surface-variant italic pl-1">
                  Sin horarios libres en el turno mañana para {duration} min.
                </p>
              )}
            </div>
          )}

          {/* Afternoon Shift */}
          {dayInfo.afternoonActive && (
            <div className="space-y-1.5 pt-1 border-t border-primary/10">
              <div className="flex items-center justify-between text-[11px] font-bold text-on-surface-variant">
                <span className="flex items-center gap-1.5 text-indigo-800">
                  <Sunset size={13} className="text-indigo-600" />
                  Turno Tarde {dayInfo.afternoonText ? `(${dayInfo.afternoonText})` : ''}
                </span>
                <span className="text-[10px] text-on-surface-variant font-medium">
                  {afternoonSlots.length} {afternoonSlots.length === 1 ? 'horario' : 'horarios'}
                </span>
              </div>

              {afternoonSlots.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {afternoonSlots.map(slot => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => onSelectTime(slot.time)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-xs transition-all flex flex-col items-center justify-center cursor-pointer min-w-[70px]",
                          isSelected
                            ? "bg-primary text-white font-black shadow-sm ring-2 ring-primary ring-offset-1"
                            : "bg-white hover:bg-primary-container/40 text-on-surface border border-outline-variant hover:border-primary/50 font-bold shadow-2xs"
                        )}
                        title={`De ${slot.time} a ${slot.endTime} hs (${duration} min)`}
                      >
                        <span className="leading-tight text-[12px]">{slot.time} hs</span>
                        <span className={cn(
                          "text-[9px] leading-tight opacity-75",
                          isSelected ? "text-white" : "text-on-surface-variant"
                        )}>
                          hasta {slot.endTime}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-on-surface-variant italic pl-1">
                  Sin horarios libres en el turno tarde para {duration} min.
                </p>
              )}
            </div>
          )}

          {/* Helper hint */}
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-bold pt-1">
            <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
            <span>Haga clic en cualquier horario para seleccionarlo automáticamente.</span>
          </div>
        </div>
      )}
    </div>
  );
};
