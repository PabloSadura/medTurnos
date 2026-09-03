export interface PackageItem {
  treatmentId: string;
  treatmentName: string;
  quantity: number;
}

export interface PackageDefinition {
  id: string;
  userId: string;
  name: string;
  description?: string;
  price: number;
  items: PackageItem[];
  totalSessions: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface PatientPackageItem {
  treatmentId: string;
  treatmentName: string;
  totalQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
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
