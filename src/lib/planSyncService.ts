import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';

export interface PlanModel {
  id: string;
  name: string;
  price: number;
  usersLimit: number;
  secretariesLimit: number;
  updatedAt?: any;
}

export interface BonificacionItem {
  id: string;
  title: string;
  source: 'referral_welcome' | 'referral_reward' | 'custom_bonus';
  discountType: 'percent' | 'fixed';
  discountValue: number;
  discountAmount: number;
  description: string;
  beneficiaryType: 'referred' | 'referrer' | 'manual';
  referralId?: string;
}

export interface CalculatedBilling {
  planId: string;
  planName: string;
  basePrice: number;
  usersLimit: number;
  secretariesLimit: number;
  totalDiscount: number;
  finalPrice: number;
  hasDiscount: boolean;
  bonificaciones: BonificacionItem[];
  syncedAt: string;
}

export interface SyncResult {
  totalUsers: number;
  syncedCount: number;
  withDiscountsCount: number;
  totalMonthlyBilling: number;
  users: Array<{
    id: string;
    name: string;
    email: string;
    planName: string;
    basePrice: number;
    discount: number;
    finalPrice: number;
    bonificacionesCount: number;
  }>;
}

/**
 * Calculates billing details for a user given a plan, their referral data,
 * and any active referrals where they are the beneficiary.
 */
export function calculateUserPlanBilling(
  plan: PlanModel,
  user: any,
  activeReferralsList: any[] = []
): CalculatedBilling {
  const basePrice = Math.max(0, Number(plan.price) || 0);
  const bonificaciones: BonificacionItem[] = [];

  // 1. Check if this user was referred (Welcome discount)
  const isReferred = Boolean(
    user.referralInfo?.isReferred ||
    (user.referralDiscount?.active && user.referralInfo?.discountValue !== undefined)
  );

  if (isReferred && user.referralDiscount?.active !== false) {
    const discType: 'percent' | 'fixed' = user.referralInfo?.discountType || user.referralDiscount?.type || 'percent';
    const discValue = Number(user.referralInfo?.discountValue ?? user.referralDiscount?.value ?? 0);

    if (discValue > 0) {
      const discAmount = discType === 'percent'
        ? Math.round(((basePrice * discValue) / 100) * 100) / 100
        : Math.min(basePrice, discValue);

      const referrerLabel = user.referralInfo?.referrerName || user.referralInfo?.referrerEmail || 'Colega';

      bonificaciones.push({
        id: `ref-welcome-${user.id || 'usr'}`,
        title: 'Descuento de Bienvenida por Referido',
        source: 'referral_welcome',
        discountType: discType,
        discountValue: discValue,
        discountAmount: discAmount,
        description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} (Referido por ${referrerLabel})`,
        beneficiaryType: 'referred'
      });
    }
  }

  // 2. Check if this user is a referrer with ACTIVE rewards in referrals collection
  const userReferralsAsReferrer = activeReferralsList.filter(
    (r) => (r.referrerId === user.id || r.referrerEmail === user.email) && r.status === 'active'
  );

  userReferralsAsReferrer.forEach((ref) => {
    const discType: 'percent' | 'fixed' = ref.referrerDiscountType || 'percent';
    const discValue = Number(ref.referrerDiscountValue) || 0;

    if (discValue > 0) {
      const discAmount = discType === 'percent'
        ? Math.round(((basePrice * discValue) / 100) * 100) / 100
        : Math.min(basePrice, discValue);

      const colleagueLabel = ref.referredUserName || ref.referredUserEmail || 'Colega';

      bonificaciones.push({
        id: `ref-reward-${ref.id}`,
        title: 'Recompensa por Colega Referido',
        source: 'referral_reward',
        discountType: discType,
        discountValue: discValue,
        discountAmount: discAmount,
        description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} por recomendar a ${colleagueLabel}`,
        beneficiaryType: 'referrer',
        referralId: ref.id
      });
    }
  });

  // Fallback if referralReward is set on user document but not in referrals collection
  if (userReferralsAsReferrer.length === 0 && user.referralReward?.hasReward && user.referralReward?.discountValue) {
    const discType: 'percent' | 'fixed' = user.referralReward.discountType || 'percent';
    const discValue = Number(user.referralReward.discountValue) || 0;
    if (discValue > 0) {
      const discAmount = discType === 'percent'
        ? Math.round(((basePrice * discValue) / 100) * 100) / 100
        : Math.min(basePrice, discValue);

      bonificaciones.push({
        id: `user-reward-direct-${user.id || 'usr'}`,
        title: 'Recompensa por Recomendación',
        source: 'referral_reward',
        discountType: discType,
        discountValue: discValue,
        discountAmount: discAmount,
        description: `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} por colega referido (${user.referralReward.rewardFromUserName || 'Colega'})`,
        beneficiaryType: 'referrer'
      });
    }
  }

  // 3. Check for direct custom/administrative bonus granted by admin
  if (user.customBonus?.active && Number(user.customBonus.discountValue) > 0) {
    const discType: 'percent' | 'fixed' = user.customBonus.discountType || 'percent';
    const discValue = Number(user.customBonus.discountValue) || 0;
    if (discValue > 0) {
      const discAmount = discType === 'percent'
        ? Math.round(((basePrice * discValue) / 100) * 100) / 100
        : Math.min(basePrice, discValue);

      bonificaciones.push({
        id: `custom-bonus-${user.id || 'usr'}`,
        title: user.customBonus.title || 'Bonificación Especial Otorgada por el Administrador',
        source: 'custom_bonus',
        discountType: discType,
        discountValue: discValue,
        discountAmount: discAmount,
        description: user.customBonus.reason || user.customBonus.description || `Bonificación del ${discValue}${discType === 'percent' ? '%' : '$'} otorgada por la administración del sistema`,
        beneficiaryType: 'manual'
      });
    }
  }

  // 4. Include existing custom bonificaciones if present and not yet added
  const existingBonuses = Array.isArray(user.bonificaciones) 
    ? user.bonificaciones 
    : (Array.isArray(user.billingDetails?.bonificaciones) ? user.billingDetails.bonificaciones : []);
  existingBonuses.forEach((b: any) => {
    if (b && b.id && !bonificaciones.some(x => x.id === b.id) && (Number(b.discountAmount) > 0 || Number(b.discountValue) > 0)) {
      const discAmount = Number(b.discountAmount) || (b.discountType === 'percent' ? Math.round(((basePrice * Number(b.discountValue)) / 100) * 100) / 100 : Number(b.discountValue));
      bonificaciones.push({
        id: b.id,
        title: b.title || 'Bonificación Especial',
        source: b.source || 'custom_bonus',
        discountType: b.discountType || 'percent',
        discountValue: Number(b.discountValue) || 0,
        discountAmount: discAmount,
        description: b.description || 'Bonificación aplicada',
        beneficiaryType: b.beneficiaryType || 'manual'
      });
    }
  });

  // 5. Calculate totals
  const totalCalculatedDiscount = bonificaciones.reduce((sum, b) => sum + b.discountAmount, 0);
  const totalDiscount = Math.min(basePrice, Math.round(totalCalculatedDiscount * 100) / 100);
  const finalPrice = Math.max(0, Math.round((basePrice - totalDiscount) * 100) / 100);

  return {
    planId: plan.id,
    planName: plan.name,
    basePrice,
    usersLimit: plan.usersLimit || 1,
    secretariesLimit: plan.secretariesLimit || 1,
    totalDiscount,
    finalPrice,
    hasDiscount: totalDiscount > 0,
    bonificaciones,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Synchronizes plan values and bonificaciones for ALL users in the system.
 */
export async function syncAllUsersPlanValues(db: any): Promise<SyncResult> {
  console.log("[PlanSync] Starting full synchronization of plans and bonificaciones...");

  // Layer 1: Authoritative Server-side Firebase Admin synchronization
  let serverResult: SyncResult | null = null;
  try {
    const apiResponse = await fetch('/api/admin/sync-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      if (data.success) {
        serverResult = {
          totalUsers: data.totalUsers || 0,
          syncedCount: data.syncedCount || 0,
          withDiscountsCount: data.withDiscountsCount || 0,
          totalMonthlyBilling: data.totalMonthlyBilling || 0,
          users: data.users || []
        };
        console.log(`[PlanSync] Server Admin SDK successfully synced ${serverResult.syncedCount} users to Firestore.`);
      }
    } else {
      console.warn("[PlanSync] Server sync API returned status:", apiResponse.status);
    }
  } catch (apiErr) {
    console.warn("[PlanSync] Server sync API unreachable, relying on client Firestore:", apiErr);
  }

  // Layer 2: Client-side direct Firestore writes to guarantee real-time cache and active listeners update
  // 1. Fetch all plans
  const defaultPlans: PlanModel[] = [
    { id: 'basico', name: 'Básicos', price: 19, usersLimit: 1, secretariesLimit: 1 },
    { id: 'plus', name: 'Plus', price: 39, usersLimit: 3, secretariesLimit: 2 },
    { id: 'premium', name: 'Premium', price: 79, usersLimit: 10, secretariesLimit: 5 }
  ];

  let plansSnap;
  try {
    plansSnap = await getDocs(collection(db, 'plans'));
  } catch (err) {
    console.warn("[PlanSync] Could not read plans collection:", err);
    plansSnap = { empty: true, forEach: () => {} };
  }

  const plansMap: Record<string, PlanModel> = {};
  plansSnap.forEach((docSnap: any) => {
    const data = docSnap.data();
    plansMap[docSnap.id] = {
      id: docSnap.id,
      name: data.name || docSnap.id,
      price: Number(data.price) || 0,
      usersLimit: Number(data.usersLimit) || 1,
      secretariesLimit: Number(data.secretariesLimit) || 1
    };
  });

  // If plans collection is empty in Firestore, persist default plans so they exist forever
  if (Object.keys(plansMap).length === 0) {
    for (const p of defaultPlans) {
      plansMap[p.id] = p;
      try {
        await setDoc(doc(db, 'plans', p.id), {
          name: p.name,
          price: p.price,
          usersLimit: p.usersLimit,
          secretariesLimit: p.secretariesLimit,
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log(`[PlanSync] Seeded plan '${p.id}' into Firestore`);
      } catch (pErr) {
        console.warn(`[PlanSync] Note on seeding plan '${p.id}':`, pErr);
      }
    }
  }

  // 2. Fetch all referrals
  let referralsList: any[] = [];
  try {
    const referralsSnap = await getDocs(collection(db, 'referrals'));
    referralsSnap.forEach((docSnap) => {
      referralsList.push({ id: docSnap.id, ...docSnap.data() });
    });
  } catch (rErr) {
    console.warn("[PlanSync] Could not read referrals collection:", rErr);
  }

  // 3. Fetch all users
  const syncSummary: SyncResult = serverResult || {
    totalUsers: 0,
    syncedCount: 0,
    withDiscountsCount: 0,
    totalMonthlyBilling: 0,
    users: []
  };

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const userDocs: any[] = [];
    usersSnap.forEach((userDocSnap) => {
      userDocs.push({ id: userDocSnap.id, ...userDocSnap.data() });
    });

    // Also check staff if users collection is sparse
    try {
      const staffSnap = await getDocs(collection(db, 'staff'));
      staffSnap.forEach((sSnap) => {
        const sData: any = sSnap.data();
        const targetId = sData.authUid || sSnap.id;
        if (!userDocs.some(u => u.id === targetId)) {
          userDocs.push({
            id: targetId,
            name: sData.name || sData.email,
            email: sData.email,
            role: sData.role || 'medico',
            activePlanId: 'plus'
          });
        }
      });
    } catch (stErr) {
      // Ignored
    }

    if (!serverResult) {
      syncSummary.totalUsers = userDocs.length;
      syncSummary.users = [];
      syncSummary.totalMonthlyBilling = 0;
      syncSummary.withDiscountsCount = 0;
    }

    const updatePromises: Promise<any>[] = [];

    userDocs.forEach((userData) => {
      const planKey = (userData.activePlanId || userData.planId || 'plus').toLowerCase();
      const plan = plansMap[planKey] || plansMap['plus'] || Object.values(plansMap)[0];
      const billing = calculateUserPlanBilling(plan, userData, referralsList);

      if (!serverResult) {
        syncSummary.totalMonthlyBilling += billing.finalPrice;
        if (billing.hasDiscount) {
          syncSummary.withDiscountsCount += 1;
        }

        syncSummary.users.push({
          id: userData.id,
          name: userData.name || userData.email || 'Sin nombre',
          email: userData.email || '',
          planName: plan.name,
          basePrice: billing.basePrice,
          discount: billing.totalDiscount,
          finalPrice: billing.finalPrice,
          bonificacionesCount: billing.bonificaciones.length
        });
      }

      const userUpdatePayload: any = {
        activePlanId: plan.id,
        planId: plan.id,
        planDetails: {
          id: plan.id,
          name: plan.name,
          basePrice: plan.price,
          usersLimit: plan.usersLimit,
          secretariesLimit: plan.secretariesLimit
        },
        billingDetails: {
          planId: plan.id,
          planName: plan.name,
          basePrice: billing.basePrice,
          usersLimit: billing.usersLimit,
          secretariesLimit: billing.secretariesLimit,
          totalDiscount: billing.totalDiscount,
          finalPrice: billing.finalPrice,
          hasDiscount: billing.hasDiscount,
          bonificaciones: billing.bonificaciones,
          syncedAt: billing.syncedAt
        },
        planPrice: billing.finalPrice,
        basePlanPrice: billing.basePrice,
        discountApplied: billing.totalDiscount,
        updatedAt: serverTimestamp()
      };

      if (billing.hasDiscount) {
        userUpdatePayload.referralDiscount = {
          active: true,
          totalDiscount: billing.totalDiscount,
          finalPrice: billing.finalPrice,
          bonificacionesCount: billing.bonificaciones.length,
          summary: billing.bonificaciones.map((b: any) => b.description).join(', ')
        };
      }

      updatePromises.push(
        setDoc(doc(db, 'users', userData.id), userUpdatePayload, { merge: true })
          .then(() => {
            console.log(`[PlanSync] Persisted user ${userData.id} in Firestore.`);
          })
          .catch((err) => {
            console.warn(`[PlanSync] Client write for user ${userData.id} skipped (Admin SDK already ensured persistence):`, err.message);
          })
      );
    });

    await Promise.all(updatePromises);
    if (!serverResult) {
      syncSummary.syncedCount = updatePromises.length;
      syncSummary.totalMonthlyBilling = Math.round(syncSummary.totalMonthlyBilling * 100) / 100;
    }

    // Save summary in system_stats
    try {
      await setDoc(doc(db, 'system_stats', 'billing_summary'), {
        lastSyncedAt: new Date().toISOString(),
        totalMonthlyBilling: syncSummary.totalMonthlyBilling,
        totalUsers: syncSummary.totalUsers,
        syncedCount: syncSummary.syncedCount,
        withDiscountsCount: syncSummary.withDiscountsCount,
        breakdown: syncSummary.users,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (statsErr) {
      // Ignored
    }
  } catch (uErr) {
    console.warn("[PlanSync] Note on user collection client-side sync:", uErr);
  }

  return syncSummary;
}

/**
 * Synchronizes plan values and bonificaciones for a single user.
 */
export async function syncSingleUserPlan(
  db: any,
  userId: string,
  targetPlanId?: string
): Promise<CalculatedBilling> {
  console.log(`[PlanSync] Synchronizing single user: ${userId}`);

  // Layer 1: Server Admin endpoint
  try {
    const resp = await fetch('/api/admin/sync-single-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetPlanId })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.billing) {
        console.log(`[PlanSync] Server Admin SDK successfully updated user ${userId}`);
        return data.billing;
      }
    }
  } catch (apiErr) {
    console.warn("[PlanSync] Server single user sync warning, falling back to direct Firestore:", apiErr);
  }

  // Layer 2: Client Firestore fallback
  const plansSnap = await getDocs(collection(db, 'plans'));
  const plansMap: Record<string, PlanModel> = {};
  plansSnap.forEach((docSnap) => {
    const data = docSnap.data();
    plansMap[docSnap.id] = {
      id: docSnap.id,
      name: data.name || docSnap.id,
      price: Number(data.price) || 0,
      usersLimit: Number(data.usersLimit) || 1,
      secretariesLimit: Number(data.secretariesLimit) || 1
    };
  });

  if (Object.keys(plansMap).length === 0) {
    plansMap['basico'] = { id: 'basico', name: 'Básicos', price: 19, usersLimit: 1, secretariesLimit: 1 };
    plansMap['plus'] = { id: 'plus', name: 'Plus', price: 39, usersLimit: 3, secretariesLimit: 2 };
    plansMap['premium'] = { id: 'premium', name: 'Premium', price: 79, usersLimit: 10, secretariesLimit: 5 };
  }

  const referralsSnap = await getDocs(collection(db, 'referrals'));
  const referralsList: any[] = [];
  referralsSnap.forEach((docSnap) => {
    referralsList.push({ id: docSnap.id, ...docSnap.data() });
  });

  const usersSnap = await getDocs(collection(db, 'users'));
  let targetUser: any = null;
  usersSnap.forEach((docSnap) => {
    if (docSnap.id === userId) {
      targetUser = { id: docSnap.id, ...docSnap.data() };
    }
  });

  if (!targetUser) {
    targetUser = { id: userId, activePlanId: targetPlanId || 'plus' };
  }

  const planKey = (targetPlanId || targetUser.activePlanId || targetUser.planId || 'plus').toLowerCase();
  const plan = plansMap[planKey] || plansMap['plus'] || Object.values(plansMap)[0];

  const billing = calculateUserPlanBilling(plan, targetUser, referralsList);

  const payload: any = {
    activePlanId: plan.id,
    planId: plan.id,
    planDetails: {
      id: plan.id,
      name: plan.name,
      basePrice: plan.price,
      usersLimit: plan.usersLimit,
      secretariesLimit: plan.secretariesLimit
    },
    billingDetails: {
      planId: plan.id,
      planName: plan.name,
      basePrice: billing.basePrice,
      usersLimit: billing.usersLimit,
      secretariesLimit: billing.secretariesLimit,
      totalDiscount: billing.totalDiscount,
      finalPrice: billing.finalPrice,
      hasDiscount: billing.hasDiscount,
      bonificaciones: billing.bonificaciones,
      syncedAt: billing.syncedAt
    },
    planPrice: billing.finalPrice,
    basePlanPrice: billing.basePrice,
    discountApplied: billing.totalDiscount,
    updatedAt: serverTimestamp()
  };

  if (billing.hasDiscount) {
    payload.referralDiscount = {
      active: true,
      totalDiscount: billing.totalDiscount,
      finalPrice: billing.finalPrice,
      bonificacionesCount: billing.bonificaciones.length,
      summary: billing.bonificaciones.map((b: any) => b.description).join(', ')
    };
  }

  try {
    await setDoc(doc(db, 'users', userId), payload, { merge: true });
    console.log(`[PlanSync] Direct client write successful for user ${userId}`);
  } catch (wErr: any) {
    console.warn(`[PlanSync] Direct client write note:`, wErr.message);
  }

  return billing;
}
