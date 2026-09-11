import React, { useState, useEffect } from 'react';
import { 
  MessageCircle, Send, Check, Copy, ExternalLink, 
  Clock, Calendar, User, Phone, Sparkles, AlertTriangle 
} from 'lucide-react';
import { Modal } from './Modal';
import { getPatientFirstName } from '../lib/patientNameUtils';
import { formatDateDDMMAAAA, getWhatsAppNumber, cleanArgentineLocalPhone } from '../lib/phoneUtils';
import { PhoneInputArgentina } from './PhoneInputArgentina';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any;
  defaultTemplate?: string;
  clinicName?: string;
  clinicAddress?: string;
  onReminderSent?: (appointmentId: string, message: string) => void;
}

export function ReminderModal({
  isOpen,
  onClose,
  appointment,
  defaultTemplate,
  clinicName = 'nuestra clínica',
  clinicAddress = 'nuestra sede',
  onReminderSent
}: ReminderModalProps) {
  if (!appointment) return null;

  const patientName = appointment.patientName || appointment.name || 'Paciente';
  const firstName = appointment.patientFirstName || getPatientFirstName(appointment);
  const initialPhone = appointment.patientPhone || appointment.phone || '';

  const [phone, setPhone] = useState(initialPhone);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Format date in DDMMAAAA and time
  const appointmentDate = appointment.date 
    ? formatDateDDMMAAAA(appointment.date)
    : 'su fecha programada';
  const appointmentTime = appointment.time || appointment.startTime || 'su horario';
  const professionalName = appointment.professionalName || appointment.professional || 'su profesional';
  const treatmentName = appointment.treatment || appointment.treatmentName || 'su consulta';

  // Quick templates
  const buildTemplate = (type: 'standard' | 'today' | 'confirmation' | 'reschedule') => {
    switch (type) {
      case 'today':
        return `Hola ${firstName}, te recordamos que hoy tienes turno a las ${appointmentTime} con ${professionalName} en ${clinicName} (${clinicAddress}). Por favor avísanos si tienes algún inconveniente. ¡Te esperamos!`;
      case 'confirmation':
        return `Hola ${firstName}, tu turno ha sido agendado para el ${appointmentDate} a las ${appointmentTime} con ${professionalName} (${treatmentName}) en ${clinicName}, ${clinicAddress}. ¡Muchas gracias!`;
      case 'reschedule':
        return `Hola ${firstName}, te informamos que tu turno ha sido reprogramado para el ${appointmentDate} a las ${appointmentTime} con ${professionalName} en ${clinicName} (${clinicAddress}). Por favor confírmanos si este horario te queda bien.`;
      case 'standard':
      default:
        return defaultTemplate 
          ? defaultTemplate
              .replace(/{nombre}/g, firstName)
              .replace(/{fecha}/g, appointmentDate)
              .replace(/{hora}/g, appointmentTime)
              .replace(/{profesional}/g, professionalName)
              .replace(/{clinica}/g, clinicName)
              .replace(/{direccion}/g, clinicAddress)
              .replace(/{tratamiento}/g, treatmentName)
          : `Hola ${firstName}, te recordamos tu turno el ${appointmentDate} a las ${appointmentTime} con ${professionalName} en ${clinicName}, ubicada en ${clinicAddress}. Por favor responde este mensaje para confirmar tu asistencia. ¡Te esperamos!`;
    }
  };

  useEffect(() => {
    setPhone(initialPhone);
    setMessage(buildTemplate('standard'));
    setCopied(false);
  }, [appointment, defaultTemplate, clinicName, clinicAddress]);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Error copying text:', err);
    }
  };

  const handleOpenWhatsApp = async () => {
    const cleanPhone = getWhatsAppNumber(phone);
    if (!cleanPhone || cleanPhone === '549') {
      alert('Por favor ingrese un número de teléfono válido para enviar el recordatorio.');
      return;
    }

    // Direct WhatsApp web/app URL with pre-filled text
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    // Mark as sent in Firestore if appointment ID is present
    if (appointment.id) {
      setIsUpdating(true);
      try {
        await updateDoc(doc(db, 'appointments', appointment.id), {
          reminderSent: true,
          reminderSentAt: serverTimestamp(),
          reminderPhone: cleanPhone
        });
      } catch (err) {
        console.warn('Error updating appointment reminder status:', err);
      } finally {
        setIsUpdating(false);
      }
    }

    if (onReminderSent) {
      onReminderSent(appointment.id, message);
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recordatorio de Turno"
    >
      <div className="space-y-4">
        {/* Patient and Appointment Banner */}
        <div className="p-3.5 bg-surface-bright border border-outline-variant rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
              <User size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface truncate">{patientName}</p>
              <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                <span className="flex items-center gap-1"><Calendar size={12} /> {appointmentDate}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock size={12} /> {appointmentTime}</span>
                {appointment.isOverturn && (
                  <>
                    <span>•</span>
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200">
                      Sobre Turno
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-secondary/10 text-secondary">
              Modo Manual
            </span>
          </div>
        </div>

        {/* Destination Phone with Fixed Argentine Prefix */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Phone size={13} />
              Número de WhatsApp
            </span>
            <span className="text-[10px] text-primary font-semibold">
              Prefijo fijo +54 9
            </span>
          </label>
          <PhoneInputArgentina
            value={phone}
            onChange={setPhone}
            showHelperText
          />
          {!cleanArgentineLocalPhone(phone) && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} />
              <span>Ingrese el teléfono del paciente para habilitar el enlace directo a WhatsApp.</span>
            </div>
          )}
        </div>

        {/* Quick Template Chips */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1">
            <Sparkles size={12} className="text-secondary" />
            Plantillas Rápidas
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setMessage(buildTemplate('standard'))}
              className="px-2.5 py-1 rounded-lg border border-outline-variant text-[11px] font-medium text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
            >
              Recordatorio Estándar
            </button>
            <button
              type="button"
              onClick={() => setMessage(buildTemplate('today'))}
              className="px-2.5 py-1 rounded-lg border border-outline-variant text-[11px] font-medium text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
            >
              Turno Hoy
            </button>
            <button
              type="button"
              onClick={() => setMessage(buildTemplate('confirmation'))}
              className="px-2.5 py-1 rounded-lg border border-outline-variant text-[11px] font-medium text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
            >
              Confirmación
            </button>
            <button
              type="button"
              onClick={() => setMessage(buildTemplate('reschedule'))}
              className="px-2.5 py-1 rounded-lg border border-outline-variant text-[11px] font-medium text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
            >
              Reprogramación
            </button>
          </div>
        </div>

        {/* Message Editor */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Mensaje Personalizado
            </label>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {message.length} caracteres
            </span>
          </div>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-3 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface outline-none focus:border-primary transition-all resize-none leading-relaxed"
            placeholder="Escriba el recordatorio aquí..."
          />
        </div>

        {/* Note on manual dispatch */}
        <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl text-[11px] text-on-surface leading-relaxed flex items-start gap-2">
          <MessageCircle size={15} className="text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-primary">Envío directo sin intermediarios:</p>
            <p className="text-on-surface-variant">
              Al hacer clic en <b>"Abrir WhatsApp y Enviar"</b> se abrirá WhatsApp con el mensaje ya escrito y el contacto seleccionado con prefijo <b>+54 9</b>, listo para enviar.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleCopyMessage}
            className="px-3 py-2.5 border border-outline-variant hover:bg-surface-bright text-on-surface text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Copiar texto al portapapeles"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
          </button>

          <button
            type="button"
            disabled={!cleanArgentineLocalPhone(phone) || isUpdating}
            onClick={handleOpenWhatsApp}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer uppercase tracking-wider"
          >
            <MessageCircle size={15} />
            <span>Abrir WhatsApp y Enviar</span>
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
