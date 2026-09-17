/**
 * Utilities for WhatsApp message formatting, emoji interpretation,
 * and universal link generation compatible with WhatsApp Web and Mobile.
 */

import { cleanArgentineLocalPhone, getWhatsAppNumber } from './phoneUtils';

/**
 * Dictionary of Spanish and English emoji shortcodes mapped to their true Unicode characters.
 * Covers medical, dental, scheduling, clinic, greeting, and notification contexts.
 */
export const EMOJI_SHORTCODE_MAP: Record<string, string> = {
  // Saludos y Cortesía
  ':hola:': '👋',
  ':saludo:': '👋',
  ':saludos:': '👋',
  ':wave:': '👋',
  ':hello:': '👋',
  ':hi:': '👋',
  ':gracias:': '🙏',
  ':porfavor:': '🙏',
  ':por_favor:': '🙏',
  ':pray:': '🙏',
  ':thanks:': '🙏',
  ':sonrisa:': '😊',
  ':feliz:': '😊',
  ':smile:': '😊',
  ':alegre:': '😃',
  ':grin:': '😃',
  ':guiño:': '😉',
  ':wink:': '😉',
  ':corazon:': '❤️',
  ':amor:': '❤️',
  ':heart:': '❤️',
  ':brillo:': '✨',
  ':brillos:': '✨',
  ':destello:': '✨',
  ':destellos:': '✨',
  ':sparkles:': '✨',
  ':estrella:': '⭐',
  ':star:': '⭐',

  // Turnos, Fechas y Tiempos
  ':calendario:': '🗓️',
  ':fecha:': '🗓️',
  ':dia:': '🗓️',
  ':calendar:': '🗓️',
  ':date:': '🗓️',
  ':turno:': '🗓️',
  ':cita:': '🗓️',
  ':reloj:': '⏰',
  ':hora:': '⏰',
  ':horario:': '⏰',
  ':tiempo:': '⏰',
  ':clock:': '⏰',
  ':time:': '⏰',
  ':reloj_arena:': '⏳',
  ':espera:': '⏳',
  ':hourglass:': '⏳',
  ':campana:': '🔔',
  ':recordatorio:': '🔔',
  ':notificacion:': '🔔',
  ':bell:': '🔔',

  // Salud, Medicina y Especialidades
  ':clinica:': '🏥',
  ':hospital:': '🏥',
  ':consultorio:': '🏥',
  ':sanatorio:': '🏥',
  ':sede:': '🏥',
  ':centro_medico:': '🏥',
  ':doctor:': '👨‍⚕️',
  ':medico:': '👨‍⚕️',
  ':doctora:': '👩‍⚕️',
  ':medica:': '👩‍⚕️',
  ':profesional:': '🩺',
  ':estetoscopio:': '🩺',
  ':salud:': '🩺',
  ':consulta:': '🩺',
  ':stethoscope:': '🩺',
  ':diente:': '🦷',
  ':muela:': '🦷',
  ':dental:': '🦷',
  ':odontologo:': '🦷',
  ':odontologa:': '🦷',
  ':tooth:': '🦷',
  ':ojo:': '👁️',
  ':oftalmologia:': '👁️',
  ':eye:': '👁️',
  ':pastilla:': '💊',
  ':medicamento:': '💊',
  ':remedio:': '💊',
  ':pill:': '💊',
  ':curita:': '🩹',
  ':vendaje:': '🩹',
  ':bandage:': '🩹',
  ':jeringa:': '💉',
  ':vacuna:': '💉',
  ':syringe:': '💉',

  // Ubicación y Contacto
  ':ubicacion:': '📍',
  ':direccion:': '📍',
  ':mapa:': '📍',
  ':pin:': '📍',
  ':lugar:': '📍',
  ':donde:': '📍',
  ':location:': '📍',
  ':address:': '📍',
  ':telefono:': '📞',
  ':celular:': '📞',
  ':llamada:': '📞',
  ':phone:': '📞',
  ':mensaje:': '💬',
  ':chat:': '💬',
  ':whatsapp:': '💬',
  ':message:': '💬',
  ':correo:': '✉️',
  ':email:': '✉️',
  ':mail:': '✉️',

  // Estados, Acciones y Avisos
  ':check:': '✅',
  ':tilde:': '✅',
  ':ok:': '✅',
  ':confirmado:': '✅',
  ':confirmar:': '✅',
  ':asistencia:': '✅',
  ':listo:': '✅',
  ':done:': '✅',
  ':alerta:': '⚠️',
  ':aviso:': '⚠️',
  ':atencion:': '⚠️',
  ':importante:': '⚠️',
  ':cuidado:': '⚠️',
  ':warning:': '⚠️',
  ':cancelado:': '❌',
  ':cancelar:': '❌',
  ':no:': '❌',
  ':pulgar_arriba:': '👍',
  ':pulgar:': '👍',
  ':bien:': '👍',
  ':thumbsup:': '👍',
  ':like:': '👍',
  ':nota:': '📋',
  ':apunte:': '📋',
  ':ficha:': '📋',
  ':instrucciones:': '📋',
  ':clipboard:': '📋'
};

/**
 * Text emoticons that should be translated into real Unicode emojis
 * so WhatsApp doesn't leave them as plain punctuation.
 */
const TEXT_EMOTICON_REPLACEMENTS: [RegExp, string][] = [
  [/(^|\s)(:\)|:-\))(?=$|\s|[.,!?])/g, '$1😊'],
  [/(^|\s)(:D|:-D)(?=$|\s|[.,!?])/g, '$1😃'],
  [/(^|\s)(;\)|;-\))(?=$|\s|[.,!?])/g, '$1😉'],
  [/(^|\s)<3(?=$|\s|[.,!?])/g, '$1❤️'],
  [/(^|\s)(:p|:-p|:P|:-P)(?=$|\s|[.,!?])/g, '$1😋'],
];

/**
 * Interprets all emoji shortcodes (e.g. :calendario:, :reloj:, :clinica:, :medico:, :check:),
 * bracketed tags (e.g. {emoji_calendario}), and common text emoticons, converting them
 * to standard Unicode UTF-8 emojis.
 *
 * Existing emojis in the string are fully preserved.
 */
export function interpretEmojis(rawText: string | undefined | null): string {
  if (!rawText) return '';

  let text = String(rawText);

  // 1. Replace bracketed variants like {emoji_reloj}, {emoji_calendario}
  text = text.replace(/\{emoji_([a-zA-Z0-9_-]+)\}/gi, (_, code) => {
    const key = `:${code.toLowerCase()}:`;
    return EMOJI_SHORTCODE_MAP[key] || `{emoji_${code}}`;
  });

  // 2. Replace colon shortcodes like :reloj:, :calendario:, :clinica:
  text = text.replace(/:([a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ-]+):/g, (match) => {
    const normalized = match.toLowerCase();
    return EMOJI_SHORTCODE_MAP[normalized] ?? match;
  });

  // 3. Replace common emoticons
  for (const [pattern, replacement] of TEXT_EMOTICON_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  // 4. Normalize Unicode characters to canonical NFC form
  return text.normalize('NFC');
}

/**
 * Categorized emoji palette for quick selection in reminder and template editors.
 */
export interface EmojiCategory {
  category: string;
  emojis: { emoji: string; label: string; code: string }[];
}

export const EMOJI_PALETTE: EmojiCategory[] = [
  {
    category: 'Saludos y Cortesía',
    emojis: [
      { emoji: '👋', label: 'Saludo / Hola', code: ':hola:' },
      { emoji: '🙏', label: 'Gracias / Por favor', code: ':gracias:' },
      { emoji: '✨', label: 'Atención / Destello', code: ':brillo:' },
      { emoji: '😊', label: 'Sonrisa cordial', code: ':sonrisa:' },
      { emoji: '⭐', label: 'Estrella / Destacado', code: ':estrella:' }
    ]
  },
  {
    category: 'Turnos y Horarios',
    emojis: [
      { emoji: '🗓️', label: 'Fecha / Calendario', code: ':calendario:' },
      { emoji: '⏰', label: 'Hora / Reloj', code: ':reloj:' },
      { emoji: '🔔', label: 'Recordatorio / Aviso', code: ':campana:' },
      { emoji: '⏳', label: 'Puntualidad / Espera', code: ':espera:' }
    ]
  },
  {
    category: 'Clínica y Especialidades',
    emojis: [
      { emoji: '🏥', label: 'Clínica / Sede', code: ':clinica:' },
      { emoji: '📍', label: 'Dirección / Ubicación', code: ':direccion:' },
      { emoji: '🩺', label: 'Médico / Consulta', code: ':medico:' },
      { emoji: '🦷', label: 'Odontología / Diente', code: ':diente:' },
      { emoji: '📋', label: 'Ficha / Indicaciones', code: ':ficha:' },
      { emoji: '💊', label: 'Medicamento', code: ':pastilla:' }
    ]
  },
  {
    category: 'Confirmación y Mensajes',
    emojis: [
      { emoji: '✅', label: 'Confirmar asistencia', code: ':check:' },
      { emoji: '⚠️', label: 'Importante / Advertencia', code: ':alerta:' },
      { emoji: '💬', label: 'Responder mensaje', code: ':mensaje:' },
      { emoji: '📞', label: 'Teléfono de contacto', code: ':telefono:' },
      { emoji: '👍', label: 'De acuerdo / Pulgar arriba', code: ':pulgar:' }
    ]
  }
];

/**
 * Top most common emojis for quick 1-click insertion buttons
 */
export const QUICK_EMOJIS = [
  { emoji: '👋', label: 'Saludo' },
  { emoji: '🗓️', label: 'Fecha' },
  { emoji: '⏰', label: 'Hora' },
  { emoji: '📍', label: 'Dirección' },
  { emoji: '🏥', label: 'Clínica' },
  { emoji: '🩺', label: 'Profesional' },
  { emoji: '🦷', label: 'Dental' },
  { emoji: '✨', label: 'Destacado' },
  { emoji: '✅', label: 'Confirmar' },
  { emoji: '🙏', label: 'Gracias' },
  { emoji: '🔔', label: 'Aviso' },
  { emoji: '💬', label: 'Mensaje' }
];

/**
 * Detects whether the string contains any Unicode emojis.
 */
export function containsEmojis(str: string): boolean {
  if (!str) return false;
  // Extended Unicode emoji regex matching emojis, presentation selectors, surrogate pairs
  const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D)/u;
  return emojiRegex.test(str);
}

/**
 * Detects whether the current device is a mobile device (smartphone, tablet, or narrow touch screen).
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const touchMatch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const screenMatch = typeof window.innerWidth !== 'undefined' && window.innerWidth <= 820;
  return uaMatch || (touchMatch && screenMatch);
}

export type WhatsAppTarget = 'app' | 'mobile' | 'web' | 'api' | 'wa_me' | 'auto';

const STORAGE_KEY_WHATSAPP_TARGET = 'medturnos_preferred_whatsapp_target';

/**
 * Gets the user's preferred WhatsApp target from localStorage.
 * Defaults to 'app' (WhatsApp application) for both mobile and desktop.
 */
export function getStoredWhatsAppTarget(): 'app' | 'web' {
  if (typeof window === 'undefined') return 'app';
  try {
    const saved = localStorage.getItem(STORAGE_KEY_WHATSAPP_TARGET);
    if (saved === 'web' || saved === 'app') {
      return saved;
    }
  } catch {
    // fallback to app
  }
  return 'app';
}

/**
 * Saves the user's preferred WhatsApp target to localStorage.
 */
export function setStoredWhatsAppTarget(target: 'app' | 'web'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_WHATSAPP_TARGET, target);
  } catch (e) {
    console.warn('Could not save WhatsApp target preference', e);
  }
}

export interface WhatsAppUrlResult {
  url: string;
  fallbackUrl: string;
  targetUsed: 'app' | 'web';
  interpretedMessage: string;
  cleanPhone: string;
  isMobile: boolean;
}

/**
 * Builds the URL for sending a message to WhatsApp with guaranteed emoji preservation.
 * 
 * Target modes:
 * - 'app': WhatsApp native application (iOS/Android mobile app or WhatsApp Desktop on PC)
 * - 'web': WhatsApp Web in a browser tab
 * - 'auto': Uses the stored preference (defaults to 'app')
 */
export function buildWhatsAppUrl(
  phone: string | undefined | null,
  rawMessage: string,
  target: WhatsAppTarget = 'auto'
): WhatsAppUrlResult {
  const cleanPhone = getWhatsAppNumber(phone);
  const interpretedMessage = interpretEmojis(rawMessage);
  const encodedText = encodeURIComponent(interpretedMessage);
  const isMobile = isMobileDevice();

  let targetUsed: 'app' | 'web' = 'app';
  if (target === 'web') {
    targetUsed = 'web';
  } else if (target === 'mobile' || target === 'app') {
    targetUsed = 'app';
  } else if (target === 'auto') {
    // User requested to prioritize the WhatsApp application on mobile and allow it on desktop PC
    targetUsed = getStoredWhatsAppTarget();
  }

  let url: string;
  const fallbackUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

  if (targetUsed === 'app') {
    // Native app protocol: directly launches WhatsApp application on iOS, Android, and Desktop PC WhatsApp app
    url = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
  } else {
    // Desktop WhatsApp Web
    url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }

  return { 
    url, 
    fallbackUrl, 
    targetUsed, 
    interpretedMessage, 
    cleanPhone, 
    isMobile 
  };
}

/**
 * Dispatches a WhatsApp message appropriately based on the selected target:
 * - 'app': invokes the native WhatsApp application (mobile or PC desktop).
 * - 'web': opens WhatsApp Web in a new tab.
 */
export function dispatchWhatsAppMessage(
  phone: string | undefined | null,
  rawMessage: string,
  target: WhatsAppTarget = 'auto'
): { success: boolean; targetUsed: 'app' | 'web'; interpretedMessage: string; cleanPhone: string; url: string } {
  const result = buildWhatsAppUrl(phone, rawMessage, target);

  if (!result.cleanPhone || result.cleanPhone === '549') {
    return { 
      success: false, 
      targetUsed: result.targetUsed, 
      interpretedMessage: result.interpretedMessage, 
      cleanPhone: result.cleanPhone,
      url: result.url
    };
  }

  if (result.targetUsed === 'app') {
    // Native WhatsApp App protocol
    try {
      const link = document.createElement('a');
      link.href = result.url;
      link.target = '_top';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 500);
    } catch {
      window.location.href = result.url;
    }
  } else {
    // WhatsApp Web: open in new tab
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  return { 
    success: true, 
    targetUsed: result.targetUsed, 
    interpretedMessage: result.interpretedMessage, 
    cleanPhone: result.cleanPhone,
    url: result.url
  };
}

