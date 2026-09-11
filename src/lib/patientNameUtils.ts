/**
 * Utilities for patient name parsing, splitting and formatting
 * Ensures patients have distinct first and last names, while reminders
 * address patients warmly by their first name only.
 */

const COMPOUND_FIRST_NAMES = [
  'juan carlos',
  'juan pablo',
  'juan manuel',
  'juan ignacio',
  'juan jose',
  'maria jose',
  'maria belen',
  'maria elena',
  'maria victoria',
  'maria florencia',
  'maria cecilia',
  'maria del carmen',
  'maria de los angeles',
  'ana maria',
  'ana paula',
  'ana clara',
  'jose luis',
  'luis alberto',
  'francisco javier'
];

/**
 * Split a full name into first name and last name.
 * e.g., "Juan Pérez" -> { firstName: "Juan", lastName: "Pérez" }
 * e.g., "Juan Carlos Rodríguez" -> { firstName: "Juan Carlos", lastName: "Rodríguez" }
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: '', lastName: '' };
  
  const cleaned = fullName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: '', lastName: '' };

  const words = cleaned.split(' ');
  if (words.length === 1) {
    return { firstName: words[0], lastName: '' };
  }
  if (words.length === 2) {
    return { firstName: words[0], lastName: words[1] };
  }

  // Check for common compound first names
  const firstTwo = `${words[0]} ${words[1]}`.toLowerCase();
  if (COMPOUND_FIRST_NAMES.includes(firstTwo) && words.length > 2) {
    return {
      firstName: `${words[0]} ${words[1]}`,
      lastName: words.slice(2).join(' ')
    };
  }

  // Check for 3-part compound (e.g., "María del Carmen")
  if (words.length > 3) {
    const firstThree = `${words[0]} ${words[1]} ${words[2]}`.toLowerCase();
    if (firstThree === 'maria del carmen' || firstThree === 'maria de los') {
      return {
        firstName: `${words[0]} ${words[1]} ${words[2]}`,
        lastName: words.slice(3).join(' ')
      };
    }
  }

  // Default: first word as first name, remaining as last name
  return {
    firstName: words[0],
    lastName: words.slice(1).join(' ')
  };
}

/**
 * Returns only the patient's first name for greetings and notifications.
 * Accepts a patient object, appointment object, or string.
 * e.g., "Juan Pérez" -> "Juan"
 * e.g., { firstName: "Valeria", lastName: "Gómez" } -> "Valeria"
 */
export function getPatientFirstName(patientOrName: any): string {
  if (!patientOrName) return 'Paciente';

  if (typeof patientOrName === 'object') {
    if (patientOrName.firstName && typeof patientOrName.firstName === 'string' && patientOrName.firstName.trim()) {
      return patientOrName.firstName.trim();
    }
    if (patientOrName.patientFirstName && typeof patientOrName.patientFirstName === 'string' && patientOrName.patientFirstName.trim()) {
      return patientOrName.patientFirstName.trim();
    }
    const fullName = patientOrName.patientName || patientOrName.name || patientOrName.patient || '';
    return getPatientFirstName(fullName);
  }

  if (typeof patientOrName === 'string') {
    const cleaned = patientOrName.trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'Paciente';

    const words = cleaned.split(' ');
    // Handle titles like "Dr." or "Dra."
    if ((words[0].toLowerCase() === 'dr.' || words[0].toLowerCase() === 'dra.' || words[0].toLowerCase() === 'lic.') && words.length > 1) {
      return words[1];
    }

    const { firstName } = splitFullName(cleaned);
    return firstName || words[0] || 'Paciente';
  }

  return 'Paciente';
}

/**
 * Formats a consistent full name from first name and last name
 */
export function formatPatientFullName(firstName?: string, lastName?: string, fallback?: string): string {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return (fallback || '').trim() || 'Paciente';
}

/**
 * Returns only the patient's last name / surname.
 * Accepts a patient object, appointment object, or string.
 */
export function getPatientLastName(patientOrName: any): string {
  if (!patientOrName) return '';

  if (typeof patientOrName === 'object') {
    if (patientOrName.lastName && typeof patientOrName.lastName === 'string' && patientOrName.lastName.trim()) {
      return patientOrName.lastName.trim();
    }
    if (patientOrName.patientLastName && typeof patientOrName.patientLastName === 'string' && patientOrName.patientLastName.trim()) {
      return patientOrName.patientLastName.trim();
    }
    const fullName = patientOrName.name || patientOrName.patientName || patientOrName.patient || '';
    return getPatientLastName(fullName);
  }

  if (typeof patientOrName === 'string') {
    const cleaned = patientOrName.trim().replace(/\s+/g, ' ');
    if (!cleaned) return '';
    const { lastName } = splitFullName(cleaned);
    return lastName;
  }

  return '';
}

/**
 * Compares two patients by last name (apellido) alphabetically (A-Z),
 * and if last names match, by first name (nombre).
 */
export function comparePatientsByLastName(a: any, b: any): number {
  const lastNameA = (getPatientLastName(a) || a?.name || '').trim().toLowerCase();
  const lastNameB = (getPatientLastName(b) || b?.name || '').trim().toLowerCase();

  const cmp = lastNameA.localeCompare(lastNameB, 'es', { sensitivity: 'base' });
  if (cmp !== 0) return cmp;

  const firstNameA = (getPatientFirstName(a) || '').trim().toLowerCase();
  const firstNameB = (getPatientFirstName(b) || '').trim().toLowerCase();
  return firstNameA.localeCompare(firstNameB, 'es', { sensitivity: 'base' });
}

/**
 * Formats a patient name displaying "Apellido, Nombre"
 * e.g., "Pérez, Juan" or "Gómez, María Elena"
 */
export function formatPatientLastNameFirst(patientOrName: any): string {
  if (!patientOrName) return 'Paciente';

  if (typeof patientOrName === 'object') {
    const lastName = getPatientLastName(patientOrName);
    const firstName = getPatientFirstName(patientOrName);
    if (lastName && firstName && firstName !== 'Paciente') {
      return `${lastName}, ${firstName}`;
    }
    return patientOrName.name || patientOrName.patientName || 'Paciente';
  }

  if (typeof patientOrName === 'string') {
    const cleaned = patientOrName.trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'Paciente';
    const { firstName, lastName } = splitFullName(cleaned);
    if (lastName && firstName) {
      return `${lastName}, ${firstName}`;
    }
    return cleaned;
  }

  return 'Paciente';
}
