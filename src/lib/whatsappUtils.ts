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
 * Builds the URL for sending a message to WhatsApp with guaranteed emoji preservation.
 *
 * NOTE: `web.whatsapp.com/send?phone=...&text=...` is the ONLY URL on desktop that reliably
 * decodes and inserts UTF-8 emojis into the message box without passing through WhatsApp's
 * intermediate landing pages (api.whatsapp.com / wa.me), which have a known bug of
 * corrupting or stripping emoji characters during page redirects.
 */
export function buildWhatsAppUrl(
  phone: string | undefined | null,
  rawMessage: string,
  target: 'web' | 'mobile' | 'api' | 'wa_me' | 'auto' = 'web'
): { url: string; interpretedMessage: string; cleanPhone: string } {
  const cleanPhone = getWhatsAppNumber(phone);
  const interpretedMessage = interpretEmojis(rawMessage);
  const encodedText = encodeURIComponent(interpretedMessage);

  const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  let url: string;
  if (target === 'mobile') {
    url = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
  } else if (target === 'api') {
    url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  } else if (target === 'wa_me') {
    url = `https://wa.me/${cleanPhone}?text=${encodedText}`;
  } else if (target === 'auto') {
    if (isMobile) {
      url = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
    } else {
      url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    }
  } else {
    // Default: 'web' (https://web.whatsapp.com/send?phone=...&text=...)
    // This directly opens WhatsApp Web on desktop with emojis 100% intact.
    url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }

  return { url, interpretedMessage, cleanPhone };
}
