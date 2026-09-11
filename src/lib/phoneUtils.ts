/**
 * Utilities for Argentine phone formatting, WhatsApp URL generation, and date formatting
 * Fixed prefix: +54 9 (Argentina mobile format for WhatsApp)
 */

/**
 * Strips international (+54, 54, 549, +549) and local legacy prefixes (0, 15)
 * returning the clean area code + local subscriber number.
 */
export function cleanArgentineLocalPhone(raw: string | undefined | null): string {
  if (!raw) return '';
  let str = String(raw).trim();

  // If it starts with +54 9 or +549
  str = str.replace(/^\+?54\s*9\s*/i, '');
  // If it starts with +54 or 54
  str = str.replace(/^\+?54\s*/i, '');
  // If it starts with 0 (e.g. 011 or 0351)
  str = str.replace(/^0\s*/, '');
  // If user pasted 15 at beginning (e.g. 15 1234-5678)
  str = str.replace(/^15\s*/, '');

  // If there is an obsolete mobile '15' inside after area code (e.g. "11 15 2345 6789" or "11-15-2345-6789")
  str = str.replace(/^(\d{2,4})\s*[-/]?\s*15\s*[-/]?\s*(\d+)/, '$1 $2');

  return str.trim();
}

/**
 * Returns formatted phone string with the fixed +54 9 prefix.
 * e.g. "11 2345-6789" -> "+54 9 11 2345-6789"
 */
export function formatArgentinePhoneWithPrefix(raw: string | undefined | null): string {
  const local = cleanArgentineLocalPhone(raw);
  if (!local) return '';
  return `+54 9 ${local}`;
}

/**
 * Returns digits-only international WhatsApp phone number: 549XXXXXXXXXX
 * Ready for https://wa.me/549...
 */
export function getWhatsAppNumber(raw: string | undefined | null): string {
  if (!raw) return '';
  const local = cleanArgentineLocalPhone(raw);
  const digits = local.replace(/\D/g, '');
  if (!digits) return '';

  // If it already has 549 at start
  if (digits.startsWith('549') && digits.length >= 12) {
    return digits;
  }
  
  return `549${digits}`;
}

/**
 * Formats a date into DDMMAAAA (DD/MM/AAAA) format.
 * Handles ISO strings ('2026-09-10'), Date objects, or existing formatted strings.
 */
export function formatDateDDMMAAAA(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // Already in DD/MM/AAAA or DD-MM-AAAA
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(trimmed)) {
      return trimmed.replace(/-/g, '/');
    }
    // YYYY-MM-DD
    const isoParts = trimmed.split('T')[0].split('-');
    if (isoParts.length === 3 && isoParts[0].length === 4) {
      const [year, month, day] = isoParts;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
  }

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}
