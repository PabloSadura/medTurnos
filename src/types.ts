export interface PackageMaterialItem {
  materialId: string;
  qty: number;
  materialName?: string;
  unit?: string;
}

export interface PackageItem {
  treatmentId: string;
  treatmentName: string;
  quantity: number;
  materials?: PackageMaterialItem[];
}

export interface PackageAggregatedMaterial {
  materialId: string;
  materialName: string;
  totalQty: number;
  unit?: string;
}

export interface PackageDefinition {
  id: string;
  userId: string;
  name: string;
  description?: string;
  price: number;
  items: PackageItem[];
  totalSessions: number;
  totalMaterials?: PackageAggregatedMaterial[];
  createdAt?: any;
  updatedAt?: any;
}

export interface PatientPackageItem {
  treatmentId: string;
  treatmentName: string;
  totalQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  materials?: PackageMaterialItem[];
}

export interface PatientPackage {
  id: string;
  patientId: string;
  patientName: string;
  packageId: string;
  packageName: string;
  pricePaid: number;
  purchaseDate: string;
  status: 'active' | 'completed';
  items: PatientPackageItem[];
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  userId: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface PatientEvolutionPhoto {
  id: string;
  patientId: string;
  userId: string;
  imageUrl: string;
  driveFileId?: string;
  driveViewLink?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  date: string; // YYYY-MM-DD
  title: string;
  stage?: string; // e.g. "Foto Inicial (Antes)", "Control 15 días", "Sesión 3", "Foto Final (Después)"
  isBeforePhoto?: boolean;
  isAfterPhoto?: boolean;
  treatmentId?: string;
  treatmentName?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Patient {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  idNumber: string;
  gender?: string;
  birthDate?: string;
  status: 'active' | 'inactive';
  lastVisit?: string;
  userId: string;
  driveFolderId?: string;
  driveFolderName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientPhone?: string;
  phone?: string;
  date: string;
  time: string;
  endTime?: string;
  startTime?: any;
  duration?: number;
  isOverturn?: boolean;
  status: 'pendiente' | 'confirmed' | 'confirmado' | 'in-session' | 'finished' | 'cancelled' | 'cancelado' | 'ausente';
  type: string;
  treatment?: string;
  treatmentId?: string;
  cost?: number;
  price?: number;
  paidAmount?: number;
  notes?: string;
  attendance?: number;
  userId: string;
  isPackageSession?: boolean;
  patientPackageId?: string;
  packageName?: string;
  createdAt?: any;
  updatedAt?: any;
}

