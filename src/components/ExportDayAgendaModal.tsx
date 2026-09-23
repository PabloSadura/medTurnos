import { useState, useMemo } from 'react';
import { 
  Download, 
  Printer, 
  FileSpreadsheet, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  User, 
  Phone, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  Info,
  Layers,
  X
} from 'lucide-react';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { calculateEndTime, getAppointmentStatusStyles } from '../lib/agendaUtils';
import { cn } from '../lib/utils';

interface ExportDayAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: Date;
  appointments: any[];
  patients: any[];
  treatments: any[];
  profile?: any;
}

export function ExportDayAgendaModal({
  isOpen,
  onClose,
  initialDate = new Date(),
  appointments,
  patients,
  treatments,
  profile
}: ExportDayAgendaModalProps) {
  const { showToast } = useToast();
  const [currentDate, setCurrentDate] = useState<Date>(initialDate);

  // Sync date when initialDate changes and modal opens
  useMemo(() => {
    if (isOpen && initialDate) {
      setCurrentDate(initialDate);
    }
  }, [isOpen, initialDate]);

  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const currentDateString = formatLocalDate(currentDate);

  // Filter and sort appointments for the selected date
  const dayAppointments = useMemo(() => {
    const list = appointments.filter(a => a.date === currentDateString);
    return list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [appointments, currentDateString]);

  // Enrich appointment with patient and treatment details
  const enrichedAppointments = useMemo(() => {
    return dayAppointments.map(apt => {
      const patient = patients.find(p => p.id === apt.patientId);
      const treatment = treatments.find(t => t.name === (apt.type || apt.treatment));
      
      const patientName = apt.patientName || (
        patient 
          ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || patient.name 
          : 'Paciente sin registrar'
      );
      const patientPhone = apt.patientPhone || apt.phone || patient?.phone || '';
      const patientDni = patient?.idNumber || apt.idNumber || '';
      const patientEmail = patient?.email || apt.email || '';
      const treatmentName = apt.type || apt.treatment || 'Consulta General';
      const duration = Number(apt.duration) || (treatment?.duration ? Number(treatment.duration) : 30);
      const endTime = apt.endTime || calculateEndTime(apt.time || '09:00', duration);
      const statusStyles = getAppointmentStatusStyles(apt.status);
      const isOverturn = Boolean(apt.isOverturn);
      const overturnReason = apt.overturnReason || (isOverturn ? 'Sobreturno registrado' : '');
      const notes = apt.notes || '';
      const price = treatment?.price || apt.price || '';

      return {
        id: apt.id,
        raw: apt,
        time: apt.time || '00:00',
        endTime,
        duration,
        patientName,
        patientPhone,
        patientDni,
        patientEmail,
        treatmentName,
        price,
        status: apt.status || 'pendiente',
        statusLabel: statusStyles.label,
        statusStyles,
        isOverturn,
        overturnReason,
        isPackageSession: Boolean(apt.isPackageSession),
        packageName: apt.packageName || '',
        notes
      };
    });
  }, [dayAppointments, patients, treatments]);

  // Day shift helpers
  const handlePreviousDay = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    setCurrentDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [y, m, d] = val.split('-').map(Number);
    if (y && m && d) {
      setCurrentDate(new Date(y, m - 1, d));
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (enrichedAppointments.length === 0) {
      showToast('No hay turnos registrados en este día para exportar');
      return;
    }

    const headers = [
      'Fecha',
      'Hora Inicio',
      'Hora Fin',
      'Duración (min)',
      'Paciente',
      'Teléfono',
      'Email',
      'Tratamiento / Práctica',
      'Estado',
      'Tipo de Turno',
      'Motivo Sobreturno',
      'Es Paquete/Abono',
      'Notas y Observaciones'
    ];

    const rows = enrichedAppointments.map(apt => {
      const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      return [
        escape(currentDateString),
        escape(apt.time),
        escape(apt.endTime),
        escape(apt.duration),
        escape(apt.patientName),
        escape(apt.patientPhone || 'N/D'),
        escape(apt.patientEmail || 'N/D'),
        escape(apt.treatmentName),
        escape(apt.statusLabel),
        escape(apt.isOverturn ? 'Sobreturno' : 'Regular'),
        escape(apt.overturnReason || 'N/A'),
        escape(apt.isPackageSession ? (apt.packageName || 'Sí') : 'No'),
        escape(apt.notes || '')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const doctorSlug = (profile?.name || 'profesional').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `agenda_del_dia_${currentDateString}_${doctorSlug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Agenda del día exportada en formato CSV');
  };

  // Trigger Print / PDF
  const handlePrint = () => {
    if (enrichedAppointments.length === 0) {
      showToast('No hay turnos registrados en este día para imprimir');
      return;
    }
    window.print();
  };

  const formattedDateTitle = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(currentDate);

  const stats = useMemo(() => {
    const total = enrichedAppointments.length;
    const completed = enrichedAppointments.filter(a => ['finalizado', 'finished'].includes((a.status || '').toLowerCase())).length;
    const confirmed = enrichedAppointments.filter(a => ['confirmado', 'confirmed'].includes((a.status || '').toLowerCase())).length;
    const overturns = enrichedAppointments.filter(a => a.isOverturn).length;
    const withNotes = enrichedAppointments.filter(a => Boolean(a.notes && a.notes.trim())).length;
    return { total, completed, confirmed, overturns, withNotes };
  }, [enrichedAppointments]);

  return (
    <>
      {/* Visual interactive modal */}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Exportar Agenda del Día"
        className="max-w-3xl"
      >
        <div className="space-y-5">
          {/* Date Selector Banner */}
          <div className="bg-surface p-4 rounded-xl border border-outline-variant flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <CalendarIcon size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Día seleccionado</p>
                <h4 className="text-sm sm:text-base font-bold text-on-surface capitalize">{formattedDateTitle}</h4>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={handlePreviousDay}
                className="p-2 bg-white hover:bg-surface-bright text-on-surface border border-outline-variant rounded-lg transition-colors"
                title="Día anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-2.5 py-1.5 bg-white hover:bg-surface-bright text-xs font-bold text-on-surface border border-outline-variant rounded-lg transition-colors"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                className="p-2 bg-white hover:bg-surface-bright text-on-surface border border-outline-variant rounded-lg transition-colors"
                title="Día siguiente"
              >
                <ChevronRight size={16} />
              </button>
              <input
                type="date"
                value={currentDateString}
                onChange={handleDateInputChange}
                className="px-2 py-1.5 bg-white text-xs font-semibold text-on-surface border border-outline-variant rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-xl border border-outline-variant">
              <p className="text-[10px] uppercase font-bold text-on-surface-variant">Total Turnos</p>
              <p className="text-lg font-black text-on-surface mt-0.5">{stats.total}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-outline-variant">
              <p className="text-[10px] uppercase font-bold text-blue-700">Confirmados</p>
              <p className="text-lg font-black text-blue-700 mt-0.5">{stats.confirmed}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-outline-variant">
              <p className="text-[10px] uppercase font-bold text-purple-700">Sobreturnos</p>
              <p className="text-lg font-black text-purple-700 mt-0.5">{stats.overturns}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-outline-variant">
              <p className="text-[10px] uppercase font-bold text-emerald-700">Con Notas</p>
              <p className="text-lg font-black text-emerald-700 mt-0.5">{stats.withNotes}</p>
            </div>
          </div>

          {/* Preview Table Container */}
          <div className="border border-outline-variant rounded-xl overflow-hidden bg-white shadow-xs">
            <div className="p-3 bg-surface-bright border-b border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-primary" />
                <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  Detalle de pacientes y turnos ({enrichedAppointments.length})
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant hidden sm:inline">
                Datos listos para exportación
              </span>
            </div>

            {enrichedAppointments.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <CalendarIcon size={32} className="mx-auto text-on-surface-variant/40 mb-2" />
                <p className="text-sm font-bold text-on-surface">No hay citas en este día</p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Seleccione otra fecha con las flechas superiores o elija un día con turnos agendados.
                </p>
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto overflow-x-auto divide-y divide-outline-variant">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-on-surface-variant text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-outline-variant">
                    <tr>
                      <th className="py-2.5 px-3 font-bold">Horario</th>
                      <th className="py-2.5 px-3 font-bold">Paciente</th>
                      <th className="py-2.5 px-3 font-bold">Tratamiento</th>
                      <th className="py-2.5 px-3 font-bold">Estado</th>
                      <th className="py-2.5 px-3 font-bold">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/60">
                    {enrichedAppointments.map((apt) => (
                      <tr key={apt.id} className="hover:bg-surface-bright/50 transition-colors">
                        <td className="py-2.5 px-3 align-top whitespace-nowrap">
                          <div className="font-mono font-bold text-on-surface flex items-center gap-1">
                            <Clock size={12} className="text-on-surface-variant" />
                            {apt.time} - {apt.endTime}
                          </div>
                          <div className="text-[10px] text-on-surface-variant mt-0.5">
                            {apt.duration} min
                            {apt.isOverturn && (
                              <span className="ml-1 text-[9px] font-bold px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded">
                                Sobreturno
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 align-top">
                          <div className="font-bold text-on-surface">{apt.patientName}</div>
                          <div className="text-[11px] text-on-surface-variant flex flex-col gap-0.5 mt-0.5">
                            {apt.patientPhone && (
                              <span className="flex items-center gap-1">
                                <Phone size={10} />
                                {apt.patientPhone}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 align-top">
                          <div className="font-semibold text-on-surface">{apt.treatmentName}</div>
                          {apt.isPackageSession && (
                            <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded mt-0.5">
                              {apt.packageName || 'Sesión de Paquete'}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 align-top whitespace-nowrap">
                          <span className={cn(
                            "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            apt.statusStyles.badgeBg,
                            apt.statusStyles.badgeText
                          )}>
                            {apt.statusLabel}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 align-top max-w-[200px]">
                          {apt.notes ? (
                            <p className="text-[11px] text-on-surface bg-surface-bright p-1.5 rounded border border-outline-variant/60 line-clamp-3">
                              {apt.notes}
                            </p>
                          ) : (
                            <span className="text-[11px] text-on-surface-variant italic">Sin notas</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Export Action Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <p className="text-xs text-on-surface-variant">
              {enrichedAppointments.length > 0 
                ? `Listo para exportar ${enrichedAppointments.length} turnos del día.` 
                : 'Seleccione un día con turnos para habilitar las opciones de exportación.'}
            </p>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={enrichedAppointments.length === 0}
                className={cn(
                  "px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs uppercase tracking-wider",
                  enrichedAppointments.length > 0
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95"
                    : "bg-surface-dim text-on-surface-variant/50 cursor-not-allowed"
                )}
              >
                <FileSpreadsheet size={15} />
                <span>Descargar CSV (Excel)</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={enrichedAppointments.length === 0}
                className={cn(
                  "px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs uppercase tracking-wider",
                  enrichedAppointments.length > 0
                    ? "bg-primary hover:bg-primary/90 text-white active:scale-95"
                    : "bg-surface-dim text-on-surface-variant/50 cursor-not-allowed"
                )}
              >
                <Printer size={15} />
                <span>Imprimir / PDF</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Printable Sheet for window.print() */}
      <div id="printable-agenda" className="hidden print:block font-sans text-black bg-white p-4">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">MedTurnos</h1>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">
              Hoja de Ruta y Agenda Diaria de Atención
            </p>
            <div className="mt-2 text-xs">
              <p><strong>Profesional:</strong> {profile?.name || 'Profesional de la Salud'}</p>
              {profile?.specialty && <p><strong>Especialidad:</strong> {profile.specialty}</p>}
              {profile?.phone && <p><strong>Contacto:</strong> {profile.phone}</p>}
            </div>
          </div>

          <div className="text-right text-xs">
            <div className="p-2 border border-black rounded inline-block text-left mb-1">
              <p className="font-bold text-sm capitalize">{formattedDateTitle}</p>
              <p className="text-[10px] text-neutral-600">Fecha: {currentDateString}</p>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              Emitido el: {new Date().toLocaleDateString('es-AR')} a las {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
            </p>
          </div>
        </div>

        {/* Summary Info */}
        <div className="flex justify-between items-center bg-neutral-100 p-2 border border-neutral-300 rounded mb-4 text-xs font-medium">
          <span><strong>Total de turnos:</strong> {stats.total}</span>
          <span><strong>Confirmados:</strong> {stats.confirmed}</span>
          <span><strong>Sobreturnos:</strong> {stats.overturns}</span>
          <span><strong>Finalizados/En sesión:</strong> {stats.completed}</span>
        </div>

        {/* Table */}
        <table className="w-full border-collapse border border-black text-xs mb-6">
          <thead>
            <tr className="bg-neutral-200">
              <th className="border border-black p-2 text-left w-20">Hora</th>
              <th className="border border-black p-2 text-left">Paciente</th>
              <th className="border border-black p-2 text-left w-28">Teléfono</th>
              <th className="border border-black p-2 text-left">Tratamiento</th>
              <th className="border border-black p-2 text-left w-24">Estado</th>
              <th className="border border-black p-2 text-left">Notas y Observaciones</th>
              <th className="border border-black p-2 text-center w-12">Asist.</th>
            </tr>
          </thead>
          <tbody>
            {enrichedAppointments.map((apt, index) => (
              <tr key={apt.id || index} className="border-b border-black">
                <td className="border border-black p-2 font-mono font-bold align-top">
                  {apt.time} - {apt.endTime}
                  {apt.isOverturn && (
                    <div className="text-[9px] font-bold text-neutral-800 uppercase mt-0.5">
                      [Sobreturno]
                    </div>
                  )}
                </td>
                <td className="border border-black p-2 align-top">
                  <div className="font-bold text-sm">{apt.patientName}</div>
                </td>
                <td className="border border-black p-2 align-top text-[11px]">
                  {apt.patientPhone && <div>Tel: {apt.patientPhone}</div>}
                </td>
                <td className="border border-black p-2 align-top">
                  <div className="font-medium">{apt.treatmentName}</div>
                  {apt.isPackageSession && (
                    <div className="text-[10px] text-neutral-600 italic">
                      {apt.packageName || 'Paquete'}
                    </div>
                  )}
                </td>
                <td className="border border-black p-2 align-top font-semibold uppercase text-[10px]">
                  {apt.statusLabel}
                </td>
                <td className="border border-black p-2 align-top text-[11px]">
                  {apt.notes || '-'}
                  {apt.overturnReason && (
                    <div className="text-[10px] italic text-neutral-600 mt-1">
                      Motivo sobreturno: {apt.overturnReason}
                    </div>
                  )}
                </td>
                <td className="border border-black p-2 align-middle text-center">
                  <div className="w-5 h-5 border-2 border-black mx-auto"></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Signature */}
        <div className="mt-12 pt-4 flex justify-between items-end text-xs">
          <div>
            <p className="text-[10px] text-neutral-500">Documento clínico generado automáticamente por MedTurnos.</p>
          </div>
          <div className="text-center w-64 border-t border-black pt-2">
            <p className="font-bold">{profile?.name || 'Firma y Sello del Profesional'}</p>
            <p className="text-[10px] text-neutral-600">{profile?.specialty || 'Matrícula Profesional'}</p>
          </div>
        </div>
      </div>
    </>
  );
}
