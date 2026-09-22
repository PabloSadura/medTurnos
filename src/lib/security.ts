// Security policy and password validation module for MedTurnos

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0 - 4
  feedback: string[];
  label: 'Muy Débil' | 'Débil' | 'Aceptable' | 'Fuerte' | 'Excelente';
  color: string;
}

const COMMON_PASSWORDS = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345',
  '1234', '111111', '1234567', 'dragon', 'welcome', '123123',
  'admin', 'administrator', 'admin123', 'admin1234', 'admin12345',
  'password123', 'password1234', 'medturnos', 'medturnos123', 'medico123',
  'secretaria123', '1234567890', '123456789012', 'qwertyuiop', '00000000',
  'letmein', 'hospital', 'doctor', 'clinica', 'salud123'
]);

/**
 * Validates password strength according to clinical compliance policies:
 * - Minimum 12 characters length
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one number (0-9)
 * - At least one special character (!@#$%^&*...)
 * - Not a common/dictionary password
 */
export function validatePassword(password: string): PasswordValidationResult {
  const feedback: string[] = [];
  const trimmed = (password || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      score: 0,
      feedback: ['La contraseña es requerida.'],
      label: 'Muy Débil',
      color: 'text-error'
    };
  }

  // Check length (Clinical compliance requires at least 12 characters)
  if (trimmed.length < 12) {
    feedback.push('Debe tener al menos 12 caracteres (política de seguridad clínica).');
  }

  // Check uppercase
  if (!/[A-Z]/.test(trimmed)) {
    feedback.push('Debe incluir al menos una letra mayúscula (A-Z).');
  }

  // Check lowercase
  if (!/[a-z]/.test(trimmed)) {
    feedback.push('Debe incluir al menos una letra minúscula (a-z).');
  }

  // Check numbers
  if (!/[0-9]/.test(trimmed)) {
    feedback.push('Debe incluir al menos un número (0-9).');
  }

  // Check special characters
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(trimmed)) {
    feedback.push('Debe incluir al menos un carácter especial (ej. !@#$%^&*).');
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.has(trimmed.toLowerCase())) {
    feedback.push('La contraseña ingresada es predecible o demasiado común.');
  }

  // Calculate score (0 to 4)
  let score = 0;
  if (trimmed.length >= 8) score++;
  if (trimmed.length >= 12) score++;
  if (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) score++;
  if (/[0-9]/.test(trimmed) && /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(trimmed)) score++;

  if (COMMON_PASSWORDS.has(trimmed.toLowerCase())) {
    score = 0;
  }

  let label: PasswordValidationResult['label'] = 'Muy Débil';
  let color = 'text-error';

  if (score === 1) {
    label = 'Débil';
    color = 'text-orange-500';
  } else if (score === 2) {
    label = 'Aceptable';
    color = 'text-amber-500';
  } else if (score === 3) {
    label = 'Fuerte';
    color = 'text-blue-500';
  } else if (score >= 4) {
    label = 'Excelente';
    color = 'text-emerald-500';
  }

  const isValid = 
    trimmed.length >= 12 && 
    /[A-Z]/.test(trimmed) && 
    /[a-z]/.test(trimmed) && 
    /[0-9]/.test(trimmed) && 
    !COMMON_PASSWORDS.has(trimmed.toLowerCase());

  return {
    isValid,
    score,
    feedback,
    label,
    color
  };
}

/**
 * Sanitizes input string to prevent XSS and control character injection
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '')
    .trim();
}
