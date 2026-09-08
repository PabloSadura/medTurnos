import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, 
  Send, 
  Copy, 
  Check, 
  ExternalLink, 
  Clock, 
  Calendar, 
  User, 
  Phone, 
  MapPin, 
  Building2, 
  Sparkles, 
  RotateCcw, 
  AlertCircle, 
  X,
  FileText,
  Smartphone
} from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '../lib/utils';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

export interface WhatsAppReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any | null;
  defaultTemplate?: string;
  clinicInfo?: {
    name?: string;
    address?: string;
    phone?: string;
  };
  botEnabled?: boolean;
  onMessageSent?: (appointmentId: string, message: string, method: string) => void;
}

export function WhatsAppReminderModal({
  isOpen,
  onClose,
  appointment,
  defaultTemplate,
  clinicInfo,
  botEnabled = false,
  onMessageSent,
}: WhatsAppReminderModalProps) {
  const { ownerId } = useAuth();
  const [recipientPhone, setRecipientPhone] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSendingApi, setIsSendingApi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activePreset, setActivePreset] = useState<string>('custom');

  // Format date and time reliably
  const appointmentInfo = useMemo(() => {
    if (!appointment) return null;

    let dateObj: Date = new Date();
    if (appointment.startTime?.toDate) {
      dateObj = appointment.startTime.toDate();
    } else if (appointment.startTime instanceof Date) {
      dateObj = appointment.startTime;
    } else if (typeof appointment.startTime === 'string') {
      dateObj = new Date(appointment.startTime);
    } else if (appointment.date) {
      const parts = appointment.date.split('-').map(Number);
      if (parts.length === 3) {
        const timeParts = (appointment.time || '09:00').split(':').map(Number);
        dateObj = new Date(parts[0], parts[1] - 1, parts[2], timeParts[0] || 9, timeParts[1] || 0);
      }
    }

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const isToday = dateObj.toDateString() === today.toDateString();
    const isTomorrow = dateObj.toDateString() === tomorrow.toDateString();

    let readableDate = '';
    if (isToday) {
      readableDate = 'Hoy';
    } else if (isTomorrow) {
      readableDate = 'Mañana';
    } else {
      readableDate = new Intl.DateTimeFormat('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }).format(dateObj);
      readableDate = readableDate.charAt(0).toUpperCase() + readableDate.slice(1);
    }

    const readableTime = appointment.time || dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const patientName = appointment.patientName || appointment.patient || 'Paciente';
    const treatment = appointment.type || appointment.treatment || 'Consulta';
    const phone = appointment.patientPhone || appointment.phone || '';

    return {
      dateObj,
      readableDate,
      readableTime,
      patientName,
      treatment,
      phone,
      clinicName: clinicInfo?.name || 'Clínica Dental',
      clinicAddress: clinicInfo?.address || 'Av. Principal 1234'
    };
  }, [appointment, clinicInfo]);

  // Preset definitions
  const presets = useMemo(() => {
    if (!appointmentInfo) return [];

    const { patientName, readableDate, readableTime, treatment, clinicName, clinicAddress } = appointmentInfo;

    return [
      {
        id: 'standard',
        name: 'Estándar',
        icon: FileText,
        text: `Hola ${patientName}, te recordamos tu turno de ${treatment} para el ${readableDate} a las ${readableTime} hs. ¡Te esperamos en ${clinicName}! Por favor confirma tu asistencia respondiendo a este mensaje.`
      },
      {
        id: 'address',
        name: 'Con Dirección',
        icon: MapPin,
        text: `Hola ${patientName}, te esperamos para tu turno de ${treatment} el ${readableDate} a las ${readableTime} hs en ${clinicAddress} (${clinicName}). Te solicitamos presentarte 10 minutos antes. ¡Muchas gracias!`
      },
      {
        id: 'confirm',
        name: 'Confirmar Asistencia',
        icon: Sparkles,
        text: `Hola ${patientName}, tienes turno reservado para el ${readableDate} a las ${readableTime} hs (${treatment}). Por favor responde 'CONFIRMO' para asegurar tu horario en nuestra agenda.`
      },
      {
        id: 'instructions',
        name: 'Indicaciones',
        icon: AlertCircle,
        text: `Hola ${patientName}, recordatorio de tu turno el ${readableDate} a las ${readableTime} hs para ${treatment}. Indicaciones: asistir con DNI, traer estudios o placas si tienes, y concurrir 10 min antes.`
      },
      {
        id: 'brief',
        name: 'Breve',
        icon: MessageSquare,
        text: `¡Hola ${patientName}! Te recordamos tu turno el ${readableDate} a las ${readableTime} hs (${treatment}). ¿Nos confirmas asistencia? ¡Gracias!`
      }
    ];
  }, [appointmentInfo]);

  // Helper to interpolate template
  const interpolateTemplate = (templateStr: string) => {
    if (!appointmentInfo) return '';
    let res = templateStr;
    res = res.replace(/{nombre}/g, appointmentInfo.patientName);
    res = res.replace(/{fecha}/g, appointmentInfo.readableDate);
    res = res.replace(/{hora}/g, appointmentInfo.readableTime);
    res = res.replace(/{tratamiento}/g, appointmentInfo.treatment);
    res = res.replace(/{clinica}/g, appointmentInfo.clinicName);
    res = res.replace(/{direccion}/g, appointmentInfo.clinicAddress);
    return res;
  };

  // Initialize or reset when appointment changes
  useEffect(() => {
    if (appointment && appointmentInfo) {
      setRecipientPhone(appointmentInfo.phone);
      setStatusMessage(null);
      setCopied(false);

      if (appointment.customMessage) {
        setMessage(appointment.customMessage);
        setActivePreset('custom');
      } else if (defaultTemplate) {
        setMessage(interpolateTemplate(defaultTemplate));
        setActivePreset('default');
      } else {
        const standardPreset = presets.find(p => p.id === 'standard');
        setMessage(standardPreset ? standardPreset.text : '');
        setActivePreset('standard');
      }
    }
  }, [appointment, defaultTemplate, isOpen]);

  if (!isOpen || !appointment || !appointmentInfo) return null;

  const handleApplyPreset = (preset: { id: string; text: string }) => {
    setMessage(preset.text);
    setActivePreset(preset.id);
  };

  const handleInsertVariable = (variable: string) => {
    setMessage(prev => prev + ' ' + variable);
    setActivePreset('custom');
  };

  const handleResetToDefault = () => {
    if (defaultTemplate) {
      setMessage(interpolateTemplate(defaultTemplate));
      setActivePreset('default');
    } else {
      const standardPreset = presets.find(p => p.id === 'standard');
      if (standardPreset) {
        setMessage(standardPreset.text);
        setActivePreset('standard');
      }
    }
    setStatusMessage({ type: 'info', text: 'Mensaje restaurado a la plantilla predeterminada.' });
  };

  const cleanPhoneNumber = (rawPhone: string) => {
    let cleaned = rawPhone.replace(/\D/g, '');
    // If Argentine mobile without 54 country code (e.g. 11 1234 5678 or 15 1234 5678)
    if (cleaned.length === 10 && !cleaned.startsWith('54')) {
      cleaned = '549' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
      cleaned = '549' + cleaned.substring(1);
    }
    return cleaned;
  };

  const getWhatsAppUrl = () => {
    const phone = cleanPhoneNumber(recipientPhone);
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setStatusMessage({ type: 'success', text: '¡Texto copiado al portapapeles con éxito!' });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setStatusMessage({ type: 'error', text: 'No se pudo copiar automáticamente. Por favor selecciónalo manualmente.' });
    }
  };

  const handleSendViaWhatsAppWeb = async () => {
    const cleaned = cleanPhoneNumber(recipientPhone);
    if (!cleaned) {
      setStatusMessage({ type: 'error', text: 'Por favor ingrese un número de teléfono válido antes de enviar.' });
      return;
    }

    const url = getWhatsAppUrl();

    // Log the send attempt in Firestore
    if (ownerId) {
      addDoc(collection(db, 'whatsapp_logs'), {
        to: recipientPhone,
        patientName: appointmentInfo.patientName,
        appointmentId: appointment.id,
        message,
        status: 'success',
        userId: ownerId,
        createdAt: serverTimestamp(),
        method: 'manual'
      }).catch(err => console.warn('Could not save WhatsApp log:', err));
    }

    if (onMessageSent) {
      onMessageSent(appointment.id, message, 'manual');
    }

    // Direct open
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      setStatusMessage({ 
        type: 'info', 
        text: 'El navegador bloqueó la apertura automática. Haz clic en el enlace inferior para abrir WhatsApp.' 
      });
    } else {
      setStatusMessage({ 
        type: 'success', 
        text: `Abriendo WhatsApp para enviar mensaje a ${appointmentInfo.patientName}...` 
      });
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  const handleSendViaMetaApi = async () => {
    const cleaned = cleanPhoneNumber(recipientPhone);
    if (!cleaned) {
      setStatusMessage({ type: 'error', text: 'Por favor ingrese un número de teléfono válido antes de enviar.' });
      return;
    }

    setIsSendingApi(true);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleaned,
          message: message
        })
      });

      const result = await response.json();

      if (ownerId) {
        await addDoc(collection(db, 'whatsapp_logs'), {
          to: recipientPhone,
          patientName: appointmentInfo.patientName,
          appointmentId: appointment.id,
          message,
          status: response.ok ? 'success' : 'error',
          error: response.ok ? null : (result.error || 'Unknown error'),
          userId: ownerId,
          createdAt: serverTimestamp(),
          method: 'meta_api'
        });
      }

      if (!response.ok) {
        throw new Error(result.error || 'Fallo en el envío a través de Meta API');
      }

      setStatusMessage({ type: 'success', text: '¡Mensaje enviado exitosamente vía Meta API!' });
      if (onMessageSent) {
        onMessageSent(appointment.id, message, 'meta_api');
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ 
        type: 'error', 
        text: `Error al enviar: ${err.message || 'No se pudo conectar con Meta API'}. Puedes usar "Abrir WhatsApp" manualmente.` 
      });
    } finally {
      setIsSendingApi(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Personalizar Recordatorio WhatsApp"
      className="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Patient & Appointment Quick Info Header */}
        <div className="p-4 bg-surface-bright rounded-xl border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-sm">
              <User size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-on-surface">{appointmentInfo.patientName}</h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-dim text-on-surface-variant uppercase tracking-wider">
                  {appointmentInfo.treatment}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-on-surface-variant mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar size={12} className="text-primary" />
                  {appointmentInfo.readableDate}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-primary" />
                  {appointmentInfo.readableTime} hs
                </span>
              </div>
            </div>
          </div>

          {/* Editable phone number */}
          <div className="flex flex-col sm:items-end">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1 flex items-center gap-1">
              <Phone size={10} />
              Teléfono WhatsApp
            </label>
            <div className="relative">
              <input
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="Ej: +54 9 11 1234 5678"
                className={cn(
                  "w-48 px-2.5 py-1 text-xs font-semibold rounded-lg border outline-none transition-all",
                  !recipientPhone.trim() 
                    ? "border-amber-400 bg-amber-50/50 text-amber-900" 
                    : "border-outline-variant bg-surface text-on-surface focus:border-emerald-500"
                )}
              />
            </div>
            {!recipientPhone.trim() && (
              <span className="text-[10px] text-amber-600 mt-0.5">
                * Ingrese teléfono para enviar
              </span>
            )}
          </div>
        </div>

        {/* Quick Presets Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={12} className="text-primary" />
              Plantillas Rápidas
            </label>
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
            >
              <RotateCcw size={10} />
              Restablecer plantilla
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {presets.map((preset) => {
              const Icon = preset.icon;
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5",
                    isSelected
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-surface hover:bg-surface-bright text-on-surface-variant border-outline-variant"
                  )}
                >
                  <Icon size={12} />
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Editor Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
              Mensaje a Enviar (Personalizable)
            </label>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {message.length} caracteres
            </span>
          </div>

          <textarea
            rows={4}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setActivePreset('custom');
            }}
            placeholder="Escriba aquí el mensaje personalizado para el paciente..."
            className="w-full px-3.5 py-2.5 bg-surface text-on-surface border border-outline-variant rounded-xl text-sm leading-relaxed outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-y min-h-[90px]"
          />

          {/* Variable insertion buttons */}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <span className="text-[10px] font-bold text-on-surface-variant mr-1 uppercase tracking-wider">
              Insertar:
            </span>
            {[
              { label: '{nombre}', value: appointmentInfo.patientName },
              { label: '{fecha}', value: appointmentInfo.readableDate },
              { label: '{hora}', value: appointmentInfo.readableTime },
              { label: '{tratamiento}', value: appointmentInfo.treatment },
              { label: '{clinica}', value: appointmentInfo.clinicName },
              { label: '{direccion}', value: appointmentInfo.clinicAddress },
            ].map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleInsertVariable(item.label)}
                className="px-2 py-0.5 bg-surface-dim hover:bg-surface-bright text-on-surface-variant hover:text-primary text-[10px] font-mono font-semibold rounded border border-outline-variant transition-colors"
                title={`Inserta el valor actual: ${item.value}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* WhatsApp Real-time Chat Bubble Preview */}
        <div className="bg-[#EFEAE2] dark:bg-stone-900/60 p-4 rounded-xl border border-outline-variant/60">
          <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 mb-2 flex items-center gap-1.5">
            <Smartphone size={12} />
            Vista Previa de WhatsApp
          </div>
          
          <div className="flex justify-end">
            <div className="max-w-[85%] bg-[#D9FDD3] dark:bg-emerald-950/80 text-stone-800 dark:text-emerald-100 p-3 rounded-2xl rounded-tr-none shadow-xs text-[13px] leading-relaxed relative">
              <p className="whitespace-pre-wrap break-words">{message || '...'}</p>
              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-stone-500 dark:text-emerald-300/60 select-none">
                <span>{appointmentInfo.readableTime}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓✓</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status notification banner */}
        {statusMessage && (
          <div className={cn(
            "p-3 rounded-xl text-xs flex items-center justify-between gap-2 transition-all",
            statusMessage.type === 'success' && "bg-emerald-50 text-emerald-800 border border-emerald-200",
            statusMessage.type === 'error' && "bg-red-50 text-red-800 border border-red-200",
            statusMessage.type === 'info' && "bg-sky-50 text-sky-800 border border-sky-200"
          )}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Fallback direct link if popup was blocked */}
        {recipientPhone && (
          <div className="text-right">
            <a
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-emerald-600 hover:underline inline-flex items-center gap-1"
            >
              Abrir enlace directo wa.me en nueva pestaña
              <ExternalLink size={10} />
            </a>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-outline-variant">
          <button
            type="button"
            onClick={handleCopyText}
            className="w-full sm:w-auto px-4 py-2.5 bg-surface hover:bg-surface-bright text-on-surface text-xs font-bold rounded-xl border border-outline-variant transition-colors flex items-center justify-center gap-1.5"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copied ? '¡Copiado!' : 'Copiar Texto'}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-surface hover:bg-surface-dim text-on-surface-variant text-xs font-bold rounded-xl transition-colors"
            >
              Cancelar
            </button>

            {botEnabled && (
              <button
                type="button"
                disabled={isSendingApi || !recipientPhone.trim()}
                onClick={handleSendViaMetaApi}
                className={cn(
                  "px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs",
                  "bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                )}
                title="Enviar automáticamente usando la API de Meta"
              >
                <Sparkles size={14} />
                {isSendingApi ? 'Enviando vía API...' : 'Enviar vía Meta API'}
              </button>
            )}

            <button
              type="button"
              disabled={!recipientPhone.trim()}
              onClick={handleSendViaWhatsAppWeb}
              className={cn(
                "flex-1 sm:flex-initial px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs text-white",
                !recipientPhone.trim()
                  ? "bg-stone-300 dark:bg-stone-800 text-stone-500 cursor-not-allowed"
                  : "bg-[#25D366] hover:bg-[#1EBE5D] active:scale-95 cursor-pointer shadow-emerald-500/20"
              )}
            >
              <Send size={14} />
              <span>Abrir WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
