import { 
  doc, getDoc, updateDoc, addDoc, deleteDoc, collection, 
  serverTimestamp, increment, writeBatch 
} from 'firebase/firestore';
import { 
  PackageDefinition, PatientPackage, PatientPackageItem, 
  PackageMaterialItem, PackageAggregatedMaterial, PackageItem 
} from '../types';

/**
 * Calculates aggregated materials needed for a list of package items
 */
export function calculatePackageMaterials(
  items: PackageItem[],
  treatments: any[],
  inventory: any[] = []
): PackageAggregatedMaterial[] {
  const materialMap = new Map<string, { materialName: string; totalQty: number; unit?: string }>();

  for (const item of items) {
    const treatment = treatments.find(t => t.id === item.treatmentId || t.name === item.treatmentName);
    const materials: PackageMaterialItem[] = (item.materials && item.materials.length > 0)
      ? item.materials
      : (treatment?.materials || []);

    const sessionQty = Number(item.quantity) || 1;

    for (const mat of materials) {
      const matId = mat.materialId;
      if (!matId) continue;
      const qtyPerSession = Number(mat.qty) || 1;
      const totalForItem = qtyPerSession * sessionQty;

      const stockItem = inventory.find(i => i.id === matId);
      const matName = mat.materialName || stockItem?.name || 'Insumo';
      const unit = mat.unit || stockItem?.unit || 'uds';

      if (materialMap.has(matId)) {
        const current = materialMap.get(matId)!;
        current.totalQty += totalForItem;
      } else {
        materialMap.set(matId, {
          materialName: matName,
          totalQty: totalForItem,
          unit
        });
      }
    }
  }

  return Array.from(materialMap.entries()).map(([materialId, data]) => ({
    materialId,
    materialName: data.materialName,
    totalQty: data.totalQty,
    unit: data.unit
  }));
}

/**
 * Assign / sell a package to a patient
 */
export async function assignPackageToPatient(
  db: any,
  ownerId: string,
  patient: { id: string; name: string },
  packageDef: PackageDefinition,
  customPrice?: number,
  treatmentsList?: any[]
): Promise<string> {
  const pricePaid = typeof customPrice === 'number' && !isNaN(customPrice) ? customPrice : packageDef.price;
  const today = new Date().toISOString().split('T')[0];

  const items: PatientPackageItem[] = packageDef.items.map(item => {
    let materials = item.materials || [];
    if ((!materials || materials.length === 0) && treatmentsList) {
      const matched = treatmentsList.find(t => t.id === item.treatmentId || t.name === item.treatmentName);
      if (matched?.materials) {
        materials = matched.materials;
      }
    }

    return {
      treatmentId: item.treatmentId,
      treatmentName: item.treatmentName,
      totalQuantity: Number(item.quantity) || 1,
      usedQuantity: 0,
      remainingQuantity: Number(item.quantity) || 1,
      materials: materials || []
    };
  });

  const totalSessions = items.reduce((acc, item) => acc + item.totalQuantity, 0);

  const docRef = await addDoc(collection(db, 'patient_packages'), {
    patientId: patient.id,
    patientName: patient.name,
    packageId: packageDef.id,
    packageName: packageDef.name,
    pricePaid,
    purchaseDate: today,
    status: 'active',
    items,
    totalSessions,
    usedSessions: 0,
    remainingSessions: totalSessions,
    userId: ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

/**
 * Consumes 1 session of a specific treatment from a patient's package
 * and automatically deducts the associated treatment materials from inventory stock
 */
export async function consumePackageSession(
  db: any,
  patientPackageId: string,
  treatmentIdentifier: string,
  ownerId?: string,
  patientName?: string
): Promise<{ success: boolean; remainingInPackage: number; deductedMaterials?: { materialId: string; name?: string; qty: number }[]; error?: string }> {
  try {
    const pkgRef = doc(db, 'patient_packages', patientPackageId);
    const snap = await getDoc(pkgRef);
    if (!snap.exists()) {
      return { success: false, remainingInPackage: 0, error: 'Paquete del paciente no encontrado' };
    }

    const data = snap.data() as PatientPackage;
    const items = [...(data.items || [])];

    // Find the item by id or by name
    const itemIndex = items.findIndex(
      it => it.treatmentId === treatmentIdentifier || 
            it.treatmentName?.toLowerCase() === treatmentIdentifier?.toLowerCase()
    );

    if (itemIndex === -1) {
      return { success: false, remainingInPackage: 0, error: 'El tratamiento no pertenece a este paquete' };
    }

    const item = items[itemIndex];
    if (item.remainingQuantity <= 0) {
      return { success: false, remainingInPackage: 0, error: 'No quedan sesiones disponibles de este tratamiento en el paquete' };
    }

    // Get materials to deduct for this session
    let materials = item.materials || [];
    if (!materials || materials.length === 0) {
      try {
        if (item.treatmentId) {
          const tSnap = await getDoc(doc(db, 'treatments', item.treatmentId));
          if (tSnap.exists()) {
            materials = tSnap.data()?.materials || [];
          }
        }
      } catch (err) {
        console.warn('Could not fetch treatment materials by id for deduction:', err);
      }
    }

    const batch = writeBatch(db);
    const effectiveOwnerId = ownerId || data.userId;
    const effectivePatientName = patientName || data.patientName || 'Paciente';
    const deductedMaterials: { materialId: string; name?: string; qty: number }[] = [];

    // Deduct materials from stocks
    if (materials && materials.length > 0) {
      for (const mat of materials) {
        const matId = mat.materialId;
        const qty = Number(mat.qty || 1);
        if (!matId || qty <= 0) continue;

        const stockRef = doc(db, 'stocks', matId);
        batch.update(stockRef, {
          stock: increment(-qty),
          updatedAt: serverTimestamp()
        });

        // Record movement in subcollection
        const movementRef = doc(collection(db, `stocks/${matId}/movements`));
        batch.set(movementRef, {
          type: 'out',
          quantity: qty,
          reason: `Consumo de sesión de paquete: ${item.treatmentName} (${data.packageName || 'Paquete'}) para ${effectivePatientName}`,
          date: serverTimestamp(),
          userId: effectiveOwnerId
        });

        deductedMaterials.push({
          materialId: matId,
          name: mat.materialName,
          qty
        });
      }
    }

    // Decrement session in package
    const updatedItem: PatientPackageItem = {
      ...item,
      usedQuantity: (item.usedQuantity || 0) + 1,
      remainingQuantity: item.remainingQuantity - 1,
      materials: materials || item.materials || []
    };
    items[itemIndex] = updatedItem;

    const totalRemaining = items.reduce((acc, it) => acc + (it.remainingQuantity || 0), 0);
    const totalUsed = items.reduce((acc, it) => acc + (it.usedQuantity || 0), 0);
    const isCompleted = totalRemaining <= 0;

    batch.update(pkgRef, {
      items,
      remainingSessions: totalRemaining,
      usedSessions: totalUsed,
      status: isCompleted ? 'completed' : 'active',
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    return { success: true, remainingInPackage: totalRemaining, deductedMaterials };
  } catch (error: any) {
    console.error('Error consuming package session:', error);
    return { success: false, remainingInPackage: 0, error: error?.message || 'Error al descontar sesión del paquete' };
  }
}

/**
 * Restores 1 session of a specific treatment to a patient's package
 * and restores the associated treatment materials in inventory stock
 */
export async function restorePackageSession(
  db: any,
  patientPackageId: string,
  treatmentIdentifier: string,
  ownerId?: string,
  patientName?: string
): Promise<{ success: boolean; remainingInPackage?: number; error?: string }> {
  try {
    const pkgRef = doc(db, 'patient_packages', patientPackageId);
    const snap = await getDoc(pkgRef);
    if (!snap.exists()) {
      return { success: false, error: 'Paquete del paciente no encontrado' };
    }

    const data = snap.data() as PatientPackage;
    const items = [...(data.items || [])];

    const itemIndex = items.findIndex(
      it => it.treatmentId === treatmentIdentifier || 
            it.treatmentName?.toLowerCase() === treatmentIdentifier?.toLowerCase()
    );

    if (itemIndex === -1) {
      return { success: false, error: 'El tratamiento no pertenece a este paquete' };
    }

    const item = items[itemIndex];
    if ((item.usedQuantity || 0) <= 0) {
      return { success: true, remainingInPackage: data.remainingSessions };
    }

    // Get materials to restore
    let materials = item.materials || [];
    if (!materials || materials.length === 0) {
      try {
        if (item.treatmentId) {
          const tSnap = await getDoc(doc(db, 'treatments', item.treatmentId));
          if (tSnap.exists()) {
            materials = tSnap.data()?.materials || [];
          }
        }
      } catch (err) {
        console.warn('Could not fetch treatment materials by id for restoration:', err);
      }
    }

    const batch = writeBatch(db);
    const effectiveOwnerId = ownerId || data.userId;
    const effectivePatientName = patientName || data.patientName || 'Paciente';

    if (materials && materials.length > 0) {
      for (const mat of materials) {
        const matId = mat.materialId;
        const qty = Number(mat.qty || 1);
        if (!matId || qty <= 0) continue;

        const stockRef = doc(db, 'stocks', matId);
        batch.update(stockRef, {
          stock: increment(qty),
          updatedAt: serverTimestamp()
        });

        const movementRef = doc(collection(db, `stocks/${matId}/movements`));
        batch.set(movementRef, {
          type: 'in',
          quantity: qty,
          reason: `Restitución de sesión de paquete: ${item.treatmentName} (${data.packageName || 'Paquete'}) para ${effectivePatientName}`,
          date: serverTimestamp(),
          userId: effectiveOwnerId
        });
      }
    }

    const updatedItem: PatientPackageItem = {
      ...item,
      usedQuantity: Math.max(0, (item.usedQuantity || 0) - 1),
      remainingQuantity: (item.remainingQuantity || 0) + 1
    };
    items[itemIndex] = updatedItem;

    const totalRemaining = items.reduce((acc, it) => acc + (it.remainingQuantity || 0), 0);
    const totalUsed = items.reduce((acc, it) => acc + (it.usedQuantity || 0), 0);

    batch.update(pkgRef, {
      items,
      remainingSessions: totalRemaining,
      usedSessions: totalUsed,
      status: 'active',
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    return { success: true, remainingInPackage: totalRemaining };
  } catch (error: any) {
    console.error('Error restoring package session:', error);
    return { success: false, error: error?.message || 'Error al restituir sesión del paquete' };
  }
}

/**
 * Deletes a patient package record
 */
export async function deletePatientPackage(db: any, patientPackageId: string): Promise<void> {
  const pkgRef = doc(db, 'patient_packages', patientPackageId);
  await deleteDoc(pkgRef);
}

