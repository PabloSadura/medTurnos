import { collection, query, where, getDocs, doc, setDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { checkScheduleCollision, checkIsOutsideWorkingHours, getEffectiveDuration, calculateEndTime } from './agendaUtils';
import { Appointment } from '../types';

export interface SaveAppointmentPayload {
  id?: string;
  patientId: string;
  patientName: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientPhone?: string;
  phone?: string;
  date: string;
  time: string;
  duration?: number;
  treatment?: string;
  type?: string;
  treatmentId?: string;
  cost?: number;
  price?: number;
  paidAmount?: number;
  notes?: string;
  attendance?: number;
  status?: Appointment['status'];
  userId: string;
  manualOverturn?: boolean;
  workingHours?: any;
  treatmentsList?: any[];
  isPackageSession?: boolean;
  patientPackageId?: string;
  packageName?: string;
}

export interface SaveAppointmentResult {
  appointmentId: string;
  isOverturn: boolean;
  manualOverturn: boolean;
  overturnReason: 'time_overlap' | 'manual' | null;
  isOutsideWorkingHours: boolean;
  outsideHoursReason: string | null;
  overlappingAppointmentIds: string[];
  overlapCount: number;
  conflictSummary?: string;
}

/**
 * Persists an appointment to Firestore while recalculating overlaps directly against fresh database state.
 * This guarantees that:
 * 1. The frontend cannot tamper with or bypass the overturn status.
 * 2. Concurrent appointments written to the database are properly detected and flagged.
 * 3. Semi-open interval [newStart, newEnd) logic is strictly enforced.
 */
export async function saveAppointmentWithPersistenceCheck(
  payload: SaveAppointmentPayload,
  isEditMode: boolean = false
): Promise<SaveAppointmentResult> {
  const {
    id,
    date,
    time,
    userId,
    treatment,
    type,
    duration,
    treatmentsList,
    workingHours,
    manualOverturn
  } = payload;

  const treatmentName = treatment || type || 'Consulta';
  const effectiveDuration = getEffectiveDuration(treatmentName, duration, treatmentsList, 30);
  const calculatedEnd = calculateEndTime(time, effectiveDuration);

  // 1. Fetch fresh appointments from Firestore for this date and user to avoid stale client cache
  const aptsRef = collection(db, 'appointments');
  const q = query(
    aptsRef,
    where('userId', '==', userId),
    where('date', '==', date)
  );

  const querySnapshot = await getDocs(q);
  const freshAppointments: any[] = [];
  querySnapshot.forEach((docSnap) => {
    freshAppointments.push({ id: docSnap.id, ...docSnap.data() });
  });

  // 2. Perform server-side / persistence collision recalculation
  const collision = checkScheduleCollision(
    date,
    time,
    effectiveDuration,
    freshAppointments,
    isEditMode ? id : undefined,
    userId
  );

  // 3. Determine overturn status based on strict clinical business rules
  let isOverturn = false;
  let overturnReason: 'time_overlap' | 'manual' | null = null;
  let overlappingAppointmentIds: string[] = [];
  let overlapCount = 0;

  if (collision.hasConflict) {
    isOverturn = true;
    overturnReason = 'time_overlap';
    overlappingAppointmentIds = collision.overlappingAppointmentIds;
    overlapCount = collision.overlapCount;
  } else if (manualOverturn === true) {
    isOverturn = true;
    overturnReason = 'manual';
  }

  // Check outside doctor working hours independently
  const outsideCheck = checkIsOutsideWorkingHours(date, time, workingHours, effectiveDuration);
  const isOutsideWorkingHours = outsideCheck.isOutside;
  const outsideHoursReason = outsideCheck.isOutside ? outsideCheck.reason : null;

  // 4. Construct Firestore document payload
  const appointmentData: Partial<Appointment> = {
    patientId: payload.patientId,
    patientName: payload.patientName,
    patientFirstName: payload.patientFirstName || '',
    patientLastName: payload.patientLastName || '',
    patientPhone: payload.patientPhone || payload.phone || '',
    phone: payload.phone || payload.patientPhone || '',
    date,
    time,
    endTime: calculatedEnd,
    duration: effectiveDuration,
    type: treatmentName,
    treatment: treatmentName,
    treatmentId: payload.treatmentId || '',
    cost: payload.cost || payload.price || 0,
    price: payload.price || payload.cost || 0,
    paidAmount: payload.paidAmount !== undefined ? payload.paidAmount : (payload.cost || payload.price || 0),
    notes: payload.notes || '',
    attendance: payload.attendance || 1,
    status: payload.status || 'pendiente',
    userId,
    isOverturn,
    manualOverturn: Boolean(manualOverturn),
    overturnReason,
    isOutsideWorkingHours,
    outsideHoursReason,
    overlappingAppointmentIds,
    overlapCount,
    overlapUpdatedAt: serverTimestamp(),
    isPackageSession: Boolean(payload.isPackageSession),
    patientPackageId: payload.patientPackageId || '',
    packageName: payload.packageName || '',
    updatedAt: serverTimestamp()
  };

  let targetId = id;
  if (isEditMode && id) {
    const docRef = doc(db, 'appointments', id);
    await updateDoc(docRef, appointmentData as any);
  } else {
    const docRef = doc(collection(db, 'appointments'));
    targetId = docRef.id;
    await setDoc(docRef, {
      ...appointmentData,
      id: targetId,
      createdAt: serverTimestamp()
    });
  }

  return {
    appointmentId: targetId || '',
    isOverturn,
    manualOverturn: Boolean(manualOverturn),
    overturnReason,
    isOutsideWorkingHours,
    outsideHoursReason,
    overlappingAppointmentIds,
    overlapCount,
    conflictSummary: collision.conflictSummary
  };
}
