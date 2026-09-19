export type ProfileTab = 'info' | 'schedule' | 'security' | 'integrations' | 'audit';

export interface ProfileState {
  // 1. Personal Identity
  displayName: string;
  phone: string;
  photoURL: string;
  email: string;
  language?: string; // e.g. 'es'
  timezone?: string; // e.g. 'America/Argentina/Buenos_Aires'
  role?: string;
  status?: string;

  // 2. Institutional & Clinic Sede
  clinicName: string;
  clinicAddress: string;
  clinicPhone?: string;
  institutionalEmail?: string;

  // 3. Clinical & Executive Role
  specialty: string;
  licenseNumber: string;
  isPureAdminRole?: boolean; // True if super admin doesn't practice clinical dental appointments
  clinicalPracticeActive?: boolean; // Toggle whether this user accepts clinical appointments in agenda

  // 4. Working Schedule & Capacity
  scheduleMode?: 'institutional_reference' | 'personal_availability' | 'no_clinical_appointments';
  workingDays: number[]; // [1, 2, 3, 4, 5]
  morningActive: boolean;
  morningStart: string;
  morningEnd: string;
  afternoonActive: boolean;
  afternoonStart: string;
  afternoonEnd: string;
  appointmentDurationMinutes: number;

  // 5. Cloud Integration
  driveScope?: 'institutional' | 'personal';
  driveEnabled?: boolean;
}

export const DEFAULT_PROFILE: ProfileState = {
  displayName: '',
  email: '',
  licenseNumber: '',
  specialty: 'Dirección Médica y Gestión',
  phone: '',
  clinicName: '',
  clinicAddress: '',
  photoURL: '',
  role: 'admin',
  status: 'Activo',
  workingDays: [1, 2, 3, 4, 5],
  morningStart: '08:00',
  morningEnd: '12:00',
  morningActive: true,
  afternoonStart: '14:00',
  afternoonEnd: '18:00',
  afternoonActive: true,
  appointmentDurationMinutes: 30,
  isPureAdminRole: true,
  clinicalPracticeActive: false,
  scheduleMode: 'institutional_reference',
  driveScope: 'institutional',
  driveEnabled: false
};

export interface AuditLogEntry {
  id: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  authorRole: string;
  action: string;
  section: string;
  details: string;
  changes?: Record<string, any>;
  targetId?: string;
  clientIp?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ActiveSession {
  id: string;
  isCurrent: boolean;
  deviceType: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  lastActive: string;
}
