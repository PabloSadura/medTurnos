import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertCircle, Sun, Sunset, Sparkles, Zap, Filter } from 'lucide-react';
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
  const [filterMode, setFilterMode] = useState<'all' | 'free' | 'overturn'>('all');
  const dayInfo = getWorkingHoursDayInfo(dateStr, workingHours);

  const freeSlots = slots.filter(s => !s.isConflict && !s.isOverturn);
  const overturnSlots = slots.filter(s => s.isConflict || s.isOverturn);

  const filteredSlots = slots.filter(s => {
    if (filterMode === 'free') return !s.isConflict && !s.isOverturn;
    if (filterMode === 'overturn') return s.isConflict || s.isOverturn;
    return true;
  });

  const morningSlots = filteredSlots.filter(s => s.shift === 'morning');
  const afternoonSlots = filteredSlots.filter(s => s.shift === 'afternoon');

  const hasAnyOverturn = overturnSlots.length > 0;
  const isSelectedOverturn = slots.find(s => s.time === selectedTime)?.isOverturn;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-3 shadow-xs">
      {/* Header with metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-primary/15 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center shadow-2xs shrink-0">
            <Clock size={15} />
          </div>
          <div>
            <h4 className="text-xs font-black text-on-surface flex items-center gap-1.5 flex-wrap">
              Horarios Sugeridos
              {isSelectedOverturn ? (
                <span className="text-[10px] font-bold text-purple-900 bg-purple-100 border border-purple-300 px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                  <Zap size={10} className="fill-purple-700 text-purple-700" />
                  Horario con sobreturno
                </span>
              ) : hasAnyOverturn ? (
                <span className="text-[10px] font-bold text-purple-900 bg-purple-100 border border-purple-300 px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                  <Zap size={10} className="text-purple-700" />
                  Con sobreturnos disponibles
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.2 rounded-md">
                  Sin sobreturnos
                </span>
              )}
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-md" title="Horarios sin conflicto">
                {freeSlots.length} libres
              </span>
              {overturnSlots.length > 0 && (
                <span className="text-[10px] font-black bg-purple-700 text-white px-2 py-0.5 rounded-md" title="Horarios con sobreturno permitido">
                  {overturnSlots.length} sobreturnos
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs if both types exist */}
      {dayInfo.isWorkingDay && slots.length > 0 && overturnSlots.length > 0 && (
        <div className="flex items-center gap-1.5 bg-white/70 p-1 rounded-xl border border-primary/15 text-[11px]">
          <span className="text-[10px] font-bold text-on-surface-variant px-1 flex items-center gap-1">
            <Filter size={10} /> Mostrar:
          </span>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={cn(
              "px-2 py-0.5 rounded-md font-bold transition-all text-[11px]",
              filterMode === 'all'
                ? "bg-primary text-white shadow-2xs"
                : "text-on-surface-variant hover:text-on-surface hover:bg-black/5"
            )}
          >
            Todos ({slots.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('free')}
            className={cn(
              "px-2 py-0.5 rounded-md font-bold transition-all text-[11px]",
              filterMode === 'free'
                ? "bg-emerald-700 text-white shadow-2xs"
                : "text-emerald-900 hover:bg-emerald-50"
            )}
          >
            Sin conflicto ({freeSlots.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('overturn')}
            className={cn(
              "px-2 py-0.5 rounded-md font-bold transition-all text-[11px]",
              filterMode === 'overturn'
                ? "bg-purple-700 text-white shadow-2xs"
                : "text-purple-900 hover:bg-purple-50"
            )}
          >
            Con sobreturno ({overturnSlots.length})
          </button>
        </div>
      )}

      {/* Non-working day case */}
      {!dayInfo.isWorkingDay && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-900">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-bold">
              Este día no está configurado como laborable en los horarios de atención ({dayInfo.dayName}).
            </p>
            <p className="text-[11px] text-amber-800">
              Puede seleccionar cualquier horario o ingresarlo manualmente; se guardará como <strong>Sobre Turno</strong> válido.
            </p>
          </div>
        </div>
      )}

      {/* Working day with 0 available slots */}
      {dayInfo.isWorkingDay && filteredSlots.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-900">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-bold">
              {filterMode === 'free'
                ? `No hay horarios libres de superposición para ${duration} min en esta fecha.`
                : `No se encontraron horarios para los filtros seleccionados.`}
            </p>
            <p className="text-[11px] text-amber-800">
              Puede activar la vista de sobreturnos o seleccionar manualmente cualquier horario; el sistema le permitirá guardar sin bloqueos.
            </p>
          </div>
        </div>
      )}

      {/* Available slots grouped by shift */}
      {dayInfo.isWorkingDay && filteredSlots.length > 0 && (
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
                    const isOverturnSlot = slot.isConflict || slot.isOverturn;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => onSelectTime(slot.time)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-xs transition-all flex flex-col items-center justify-center cursor-pointer min-w-[76px] relative",
                          isSelected
                            ? isOverturnSlot
                              ? "bg-purple-800 text-white font-black shadow-sm ring-2 ring-purple-600 ring-offset-1"
                              : "bg-primary text-white font-black shadow-sm ring-2 ring-primary ring-offset-1"
                            : isOverturnSlot
                              ? "bg-purple-50/80 hover:bg-purple-100 text-purple-950 border border-purple-300 font-bold shadow-2xs"
                              : "bg-white hover:bg-primary-container/40 text-on-surface border border-outline-variant hover:border-primary/50 font-bold shadow-2xs"
                        )}
                        title={slot.conflictSummary ? `${slot.time} hs - ${slot.conflictSummary}` : `De ${slot.time} a ${slot.endTime} hs (${duration} min)`}
                      >
                        <span className="leading-tight text-[12px] flex items-center gap-0.5">
                          {isOverturnSlot && <Zap size={10} className={isSelected ? "text-purple-200" : "text-purple-700"} />}
                          {slot.time} hs
                        </span>
                        <span className={cn(
                          "text-[9px] leading-tight",
                          isSelected
                            ? "text-white/85"
                            : isOverturnSlot
                              ? "text-purple-800 font-bold"
                              : "text-on-surface-variant"
                        )}>
                          {isOverturnSlot ? 'Sobreturno' : `hasta ${slot.endTime}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-on-surface-variant italic pl-1">
                  Sin horarios en el turno mañana para el filtro actual.
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
                    const isOverturnSlot = slot.isConflict || slot.isOverturn;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => onSelectTime(slot.time)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-xs transition-all flex flex-col items-center justify-center cursor-pointer min-w-[76px] relative",
                          isSelected
                            ? isOverturnSlot
                              ? "bg-purple-800 text-white font-black shadow-sm ring-2 ring-purple-600 ring-offset-1"
                              : "bg-primary text-white font-black shadow-sm ring-2 ring-primary ring-offset-1"
                            : isOverturnSlot
                              ? "bg-purple-50/80 hover:bg-purple-100 text-purple-950 border border-purple-300 font-bold shadow-2xs"
                              : "bg-white hover:bg-primary-container/40 text-on-surface border border-outline-variant hover:border-primary/50 font-bold shadow-2xs"
                        )}
                        title={slot.conflictSummary ? `${slot.time} hs - ${slot.conflictSummary}` : `De ${slot.time} a ${slot.endTime} hs (${duration} min)`}
                      >
                        <span className="leading-tight text-[12px] flex items-center gap-0.5">
                          {isOverturnSlot && <Zap size={10} className={isSelected ? "text-purple-200" : "text-purple-700"} />}
                          {slot.time} hs
                        </span>
                        <span className={cn(
                          "text-[9px] leading-tight",
                          isSelected
                            ? "text-white/85"
                            : isOverturnSlot
                              ? "text-purple-800 font-bold"
                              : "text-on-surface-variant"
                        )}>
                          {isOverturnSlot ? 'Sobreturno' : `hasta ${slot.endTime}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-on-surface-variant italic pl-1">
                  Sin horarios en el turno tarde para el filtro actual.
                </p>
              )}
            </div>
          )}

          {/* Helper hint */}
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-bold pt-1">
            <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
            <span>Haga clic en cualquier horario para seleccionarlo. Los horarios con superposición se agendan como sobreturno automáticamente.</span>
          </div>
        </div>
      )}
    </div>
  );
};

