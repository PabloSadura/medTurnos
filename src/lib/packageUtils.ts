import { doc, getDoc, updateDoc, addDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { PackageDefinition, PatientPackage, PatientPackageItem } from '../types';

/**
 * Assign / sell a package to a patient
 */
export async function assignPackageToPatient(
  db: any,
  ownerId: string,
  patient: { id: string; name: string },
  packageDef: PackageDefinition,
  customPrice?: number
): Promise<string> {
  const pricePaid = typeof customPrice === 'number' && !isNaN(customPrice) ? customPrice : packageDef.price;
  const today = new Date().toISOString().split('T')[0];

  const items: PatientPackageItem[] = packageDef.items.map(item => ({
    treatmentId: item.treatmentId,
    treatmentName: item.treatmentName,
    totalQuantity: Number(item.quantity) || 1,
    usedQuantity: 0,
    remainingQuantity: Number(item.quantity) || 1
  }));

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
 */
export async function consumePackageSession(
  db: any,
  patientPackageId: string,
  treatmentIdentifier: string
): Promise<{ success: boolean; remainingInPackage: number; error?: string }> {
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

    // Decrement
    const updatedItem: PatientPackageItem = {
      ...item,
      usedQuantity: (item.usedQuantity || 0) + 1,
      remainingQuantity: item.remainingQuantity - 1
    };
    items[itemIndex] = updatedItem;

    const totalRemaining = items.reduce((acc, it) => acc + (it.remainingQuantity || 0), 0);
    const totalUsed = items.reduce((acc, it) => acc + (it.usedQuantity || 0), 0);
    const isCompleted = totalRemaining <= 0;

    await updateDoc(pkgRef, {
      items,
      remainingSessions: totalRemaining,
      usedSessions: totalUsed,
      status: isCompleted ? 'completed' : 'active',
      updatedAt: serverTimestamp()
    });

    return { success: true, remainingInPackage: totalRemaining };
  } catch (error: any) {
    console.error('Error consuming package session:', error);
    return { success: false, remainingInPackage: 0, error: error?.message || 'Error al descontar sesión del paquete' };
  }
}

/**
 * Restores 1 session of a specific treatment to a patient's package
 * (Used when a finished appointment is changed back to pending or cancelled)
 */
export async function restorePackageSession(
  db: any,
  patientPackageId: string,
  treatmentIdentifier: string
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

    const updatedItem: PatientPackageItem = {
      ...item,
      usedQuantity: Math.max(0, (item.usedQuantity || 0) - 1),
      remainingQuantity: (item.remainingQuantity || 0) + 1
    };
    items[itemIndex] = updatedItem;

    const totalRemaining = items.reduce((acc, it) => acc + (it.remainingQuantity || 0), 0);
    const totalUsed = items.reduce((acc, it) => acc + (it.usedQuantity || 0), 0);

    await updateDoc(pkgRef, {
      items,
      remainingSessions: totalRemaining,
      usedSessions: totalUsed,
      status: 'active',
      updatedAt: serverTimestamp()
    });

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

