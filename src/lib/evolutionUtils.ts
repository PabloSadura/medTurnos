/**
 * Evolution 24-hour editing rules and helpers.
 * According to requirements:
 * Evolutions can be edited within 24 hours of creation.
 * Once 24 hours have elapsed, they cannot be edited.
 */

export interface EvolutionEditability {
  canEdit: boolean;
  remainingHours: number;
  remainingMinutes: number;
  ageHours: number;
  message: string;
}

export function checkEvolutionEditability(evolution: any): EvolutionEditability {
  if (!evolution) {
    return {
      canEdit: false,
      remainingHours: 0,
      remainingMinutes: 0,
      ageHours: Infinity,
      message: 'Evolución no válida'
    };
  }

  let createdMillis: number | null = null;

  // 1. Check createdAt field (Firestore Timestamp, string, or number)
  if (evolution.createdAt) {
    if (typeof evolution.createdAt.toMillis === 'function') {
      createdMillis = evolution.createdAt.toMillis();
    } else if (typeof evolution.createdAt.toDate === 'function') {
      createdMillis = evolution.createdAt.toDate().getTime();
    } else if (typeof evolution.createdAt.seconds === 'number') {
      createdMillis = evolution.createdAt.seconds * 1000;
    } else if (typeof evolution.createdAt === 'number') {
      createdMillis = evolution.createdAt;
    } else if (typeof evolution.createdAt === 'string') {
      const parsed = Date.parse(evolution.createdAt);
      if (!isNaN(parsed)) createdMillis = parsed;
    }
  }

  // 2. Fallback to updatedAt if createdAt is not present
  if (createdMillis === null && evolution.updatedAt) {
    if (typeof evolution.updatedAt.toMillis === 'function') {
      createdMillis = evolution.updatedAt.toMillis();
    } else if (typeof evolution.updatedAt.toDate === 'function') {
      createdMillis = evolution.updatedAt.toDate().getTime();
    } else if (typeof evolution.updatedAt.seconds === 'number') {
      createdMillis = evolution.updatedAt.seconds * 1000;
    } else if (typeof evolution.updatedAt === 'number') {
      createdMillis = evolution.updatedAt;
    } else if (typeof evolution.updatedAt === 'string') {
      const parsed = Date.parse(evolution.updatedAt);
      if (!isNaN(parsed)) createdMillis = parsed;
    }
  }

  // 3. Fallback to date ('YYYY-MM-DD')
  if (createdMillis === null && evolution.date) {
    const parsed = Date.parse(evolution.date);
    if (!isNaN(parsed)) {
      createdMillis = parsed;
    }
  }

  if (createdMillis === null) {
    return {
      canEdit: false,
      remainingHours: 0,
      remainingMinutes: 0,
      ageHours: Infinity,
      message: 'Fecha de registro no disponible'
    };
  }

  const now = Date.now();
  const elapsedMs = now - createdMillis;
  const maxWindowMs = 24 * 60 * 60 * 1000; // 24 hours

  // If elapsed time is within 24 hours (with minor leeway for client clock skew)
  if (elapsedMs <= maxWindowMs && elapsedMs >= -60000) {
    const remainingMs = Math.max(0, maxWindowMs - Math.max(0, elapsedMs));
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const ageHours = Math.max(0, elapsedMs / (1000 * 60 * 60));

    return {
      canEdit: true,
      remainingHours,
      remainingMinutes,
      ageHours,
      message: remainingHours > 0 
        ? `Editable por ~${remainingHours}h` 
        : `Editable por ~${remainingMinutes} min`
    };
  }

  const ageHours = elapsedMs / (1000 * 60 * 60);
  return {
    canEdit: false,
    remainingHours: 0,
    remainingMinutes: 0,
    ageHours,
    message: 'Edición cerrada (superó 24hs)'
  };
}
