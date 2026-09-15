import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Send, Check, Copy, ExternalLink, 
  Clock, Calendar, User, Phone, Sparkles, AlertTriangle, Globe
} from 'lucide-react';
import { Modal } from './Modal';
import { getPatientFirstName } from '../lib/patientNameUtils';
import { formatDateDDMMAAAA, formatDateFullTextSpanish, getWhatsAppNumber, cleanArgentineLocalPhone } from '../lib/phoneUtils';
import { buildWhatsAppUrl, interpretEmojis, containsEmojis } from '../lib/whatsappUtils';
import { EmojiToolbar } from './EmojiToolbar';
import { PhoneInputArgentina } from './PhoneInputArgentina';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any;
  defaultTemplate?: string;
  clinicName?: string;
  clinicAddress?: string;
  professionalName?: string;
  onReminderSent?: (appointmentId: string, message: string) => void;
}

export function ReminderModal({
  isOpen,
  onClose,
  appointment,
  defaultTemplate,
  clinicName: propClinicName,
  clinicAddress: propClinicAddress,
  professionalName: propProfessionalName,
  onReminderSent
}: ReminderModalProps) {
  if (!appointment) return null;

  const { user, profile, ownerId } = useAuth();
  const [activeTemplate, setActiveTemplate] = useState<string>(defaultTemplate || '');

  // Load custom template if not passed explicitly as prop
  useEffect(() => {
    if (defaultTemplate) {
      setActiveTemplate(defaultTemplate);
      return;
    }
    const targetUserId = ownerId || user?.uid;
    if (targetUserId) {
      getDoc(doc(db, 'reminder_settings', targetUserId)).then(snap => {
        if (snap.exists() && snap.data()?.template) {
          setActiveTemplate(snap.data()?.template);
        }
      }).catch(console.warn);
    }
  }, [defaultTemplate, ownerId, user?.uid]);

  const patientName = appointment.patientName || appointment.name || 'Paciente';
  const firstName = appointment.patientFirstName || getPatientFirstName(appointment);
  const initialPhone = appointment.patientPhone || appointment.phone || '';

  const [phone, setPhone] = useState(initialPhone);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clinic metadata fallback
  const clinicName = propClinicName || profile?.clinicName || 'nuestra clínica';
  const clinicAddress = propClinicAddress || profile?.clinicAddress || profile?.address || 'nuestra sede';

  // Format date in full Spanish text (e.g. 'lunes 14 de septiembre de 2026') and time
  const appointmentDate = appointment.date 
    ? formatDateFullTextSpanish(appointment.date)
    : 'su fecha programada';
  const appointmentTime = appointment.time || appointment.startTime || 'su horario';

  // Name of the logged-in professional
  const loggedInProfessional = (profile?.name && profile.name.trim())
    || (profile?.displayName && profile.displayName.trim())
    || (user?.displayName && user.displayName.trim())
    || (user?.email ? user.email.split('@')[0] : '')
    || 'Profesional';

  // Professional name resolution:
  // When {profesional} is requested, it must output the logged-in professional's name
  const professionalName = (propProfessionalName && propProfessionalName.trim())
    || (profile?.role !== 'secretaria' && loggedInProfessional ? loggedInProfessional : '')
    || (appointment?.professionalName && appointment.professionalName.trim())
    || (appointment?.professional && appointment.professional.trim())
    || loggedInProfessional
    || 'Profesional';

  const treatmentName = appointment.treatment || appointment.treatmentName || 'su consulta';

  // Centralized variable replacement helper
  const replaceVariables = (rawText: string) => {
    if (!rawText) return '';
    return rawText
      .replace(/{profesional}/gi, professionalName)
      .replace(/{nombre}/gi, firstName)
      .replace(/{fecha}/gi, appointmentDate)
      .replace(/{hora}/gi, appointmentTime)
      .replace(/{clinica}/gi, clinicName)
      .replace(/{direccion}/gi, clinicAddress)
      .replace(/{tratamiento}/gi, treatmentName);
  };

  // Quick templates with native, tested emojis
  const buildTemplate = (type: 'standard' | 'today' | 'confirmation' | 'reschedule') => {
    switch (type) {
      case 'today':
        return replaceVariables(
          `👋 Hola {nombre}, te recordamos que hoy tienes turno a las ⏰ {hora} con 🩺 {profesional} en 🏥 {clinica} (📍 {direccion}). Por favor avísanos si tienes algún inconveniente. ¡Te esperamos! ✨`
        );
      case 'confirmation':
        return replaceVariables(
          `👋 Hola {nombre}, tu turno ha sido agendado para el 🗓️ {fecha} a las ⏰ {hora} con 🩺 {profesional} ({tratamiento}) en 🏥 {clinica}, 📍 {direccion}. ¡Muchas gracias! 🙏`
        );
      case 'reschedule':
        return replaceVariables(
          `👋 Hola {nombre}, te informamos que tu turno ha sido reprogramado para el 🗓️ {fecha} a las ⏰ {hora} con 🩺 {profesional} en 🏥 {clinica} (📍 {direccion}). Por favor confírmanos si este horario te queda bien. ✅`
        );
      case 'standard':
      default:
        const tmpl = activeTemplate || defaultTemplate || 
          `👋 Hola {nombre}, te recordamos tu turno el 🗓️ {fecha} a las ⏰ {hora} con 🩺 {profesional} en 🏥 {clinica}, ubicada en 📍 {direccion}. Por favor responde este mensaje para confirmar tu asistencia. ¡Te esperamos! ✨`;
        return replaceVariables(tmpl);
    }
  };

  useEffect(() => {
    setPhone(initialPhone);
    setMessage(buildTemplate('standard'));
    setCopied(false);
  }, [appointment, activeTemplate, defaultTemplate, clinicName, clinicAddress, professionalName]);

  const handleInsertEmoji = (emoji: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const before = message.substring(0, start);
      const after = message.substring(end);
      const newMsg = `${before}${emoji} ${after}`;
      setMessage(newMsg);
      setTimeout(() => {
        textarea.focus();
        const nextPos = start + emoji.length + 1;
        textarea.setSelectionRange(nextPos, nextPos);
      }, 0);
    } else {
      setMessage(prev => `${prev} ${emoji} `);
    }
  };

  const handleInsertVariable = (tag: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const before = message.substring(0, start);
      const after = message.substring(end);
      const newMsg = `${before}${tag} ${after}`;
      setMessage(newMsg);
      setTimeout(() => {
        textarea.focus();
        const nextPos = start + tag.length + 1;
        textarea.setSelectionRange(nextPos, nextPos);
      }, 0);
    } else {
      setMessage(prev => `${prev} ${tag} `);
    }
  };

  const handleCopyMessage = async () => {
    try {
      const finalMessage = replaceVariables(message);
      const interpreted = interpretEmojis(finalMessage);
      await navigator.clipboard.writeText(interpreted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Error copying text:', err);
    }
  };

  const handleOpenWhatsApp = async (target: 'web' | 'mobile' | 'auto' = 'web') => {
    const cleanPhone = getWhatsAppNumber(phone);
    if (!cleanPhone || cleanPhone === '549') {
      return;
    }

    const finalMessage = replaceVariables(message);
    // Generate reliable WhatsApp Web URL with interpreted Unicode emojis and UTF-8 encoding
    const { url, interpretedMessage } = buildWhatsAppUrl(cleanPhone, finalMessage, target);
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
      onReminderSent(appointment.id, interpretedMessage);
    }

    onClose();
  };

  // Preview resolves variables and emojis
  const finalPreviewMessage = replaceVariables(message);
  const interpretedPreview = interpretEmojis(finalPreviewMessage);
  const hasRawVariablesOrShortcodes = /{(profesional|nombre|fecha|hora|clinica|direccion|tratamiento)}/i.test(message) || interpretedPreview !== message;

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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Mensaje Personalizado
            </label>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {message.length} caracteres
            </span>
          </div>

          {/* Emojis Selector Toolbar */}
          <EmojiToolbar 
            onInsertEmoji={handleInsertEmoji} 
            previewText={message} 
          />

          <textarea
            ref={textareaRef}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-3 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface outline-none focus:border-primary transition-all resize-none leading-relaxed font-sans"
            placeholder="Escriba el recordatorio aquí... (puedes usar emojis o variables como {profesional}, {nombre}, {fecha}, {hora})"
          />

          {/* Insert Variables toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-on-surface-variant">
            <span className="font-semibold text-on-surface text-[10px] uppercase tracking-wider">Insertar variable:</span>
            {[
              { tag: '{profesional}', label: `Profesional (${professionalName})` },
              { tag: '{nombre}', label: `Nombre (${firstName})` },
              { tag: '{fecha}', label: 'Fecha' },
              { tag: '{hora}', label: 'Hora' },
              { tag: '{clinica}', label: 'Clínica' },
              { tag: '{direccion}', label: 'Dirección' },
              { tag: '{tratamiento}', label: 'Tratamiento' }
            ].map(({ tag, label }) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleInsertVariable(tag)}
                className="px-2 py-0.5 rounded-md bg-surface border border-outline-variant hover:border-primary text-on-surface text-[10px] font-mono cursor-pointer transition-colors"
                title={`Insertar ${label}`}
              >
                + {tag}
              </button>
            ))}
          </div>

          {/* Live preview with resolved variables and emojis */}
          {hasRawVariablesOrShortcodes && (
            <div className="p-2.5 bg-primary/5 border border-primary/20 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                <Sparkles size={11} className="text-secondary" />
                <span>Vista previa del mensaje a enviar (variables resueltas y emojis):</span>
              </div>
              <p className="text-xs text-on-surface leading-relaxed font-sans bg-surface/80 p-2.5 rounded-lg border border-outline-variant/60">
                {interpretedPreview}
              </p>
            </div>
          )}
        </div>

        {/* Note on manual dispatch */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-relaxed flex items-start gap-2">
          <MessageCircle size={15} className="text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-emerald-950">Garantía de emojis e integración con WhatsApp:</p>
            <p className="text-emerald-800 text-[10px] mt-0.5">
              Los emojis se codifican en <b>UTF-8 nativo</b> mediante enlace directo oficial, evitando que WhatsApp los transforme en signos de interrogación (<code>?</code>) o caracteres rotos. Listo para enviar al número <b>+54 9</b>.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleCopyMessage}
            className="px-3 py-2.5 border border-outline-variant hover:bg-surface-bright text-on-surface text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Copiar texto con emojis ya interpretados al portapapeles"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
          </button>

          <button
            type="button"
            disabled={!cleanArgentineLocalPhone(phone) || isUpdating}
            onClick={() => handleOpenWhatsApp('web')}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer uppercase tracking-wider"
            title="Abrir directamente en WhatsApp Web con todos los emojis interpretados y garantizados"
          >
            <Globe size={15} />
            <span>WhatsApp Web</span>
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
