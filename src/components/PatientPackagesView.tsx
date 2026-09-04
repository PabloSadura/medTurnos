import { useState, useEffect } from 'react';
import { Package, Plus, CheckCircle2, AlertCircle, ShoppingBag, Clock, ChevronRight, DollarSign, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { PackageDefinition, PatientPackage } from '../types';
import { assignPackageToPatient, deletePatientPackage } from '../lib/packageUtils';

interface PatientPackagesViewProps {
  patient: any;
  ownerId: string;
  onPackageUpdated?: () => void;
}

export function PatientPackagesView({ patient, ownerId, onPackageUpdated }: PatientPackagesViewProps) {
  const { showToast } = useToast();
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);
  const [catalogPackages, setCatalogPackages] = useState<PackageDefinition[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCatalogPackageId, setSelectedCatalogPackageId] = useState('');
  const [customPricePaid, setCustomPricePaid] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<PatientPackage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load patient's packages
  useEffect(() => {
    if (!patient?.id || !ownerId) return;

    const q = query(
      collection(db, 'patient_packages'),
      where('userId', '==', ownerId),
      where('patientId', '==', patient.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PatientPackage));
      // Sort active first, then by purchaseDate desc
      docs.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return (b.purchaseDate || '').localeCompare(a.purchaseDate || '');
      });
      setPatientPackages(docs);
      if (onPackageUpdated) onPackageUpdated();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patient_packages'));

    // Load catalog packages for selling/assigning
    const catQ = query(
      collection(db, 'packages'),
      where('userId', '==', ownerId)
    );
    const unsubscribeCat = onSnapshot(catQ, (snapshot) => {
      const cDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PackageDefinition));
      setCatalogPackages(cDocs.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'packages'));

    return () => {
      unsubscribe();
      unsubscribeCat();
    };
  }, [patient?.id, ownerId]);

  const handleOpenAssignModal = () => {
    if (catalogPackages.length > 0) {
      setSelectedCatalogPackageId(catalogPackages[0].id);
      setCustomPricePaid(catalogPackages[0].price || 0);
    } else {
      setSelectedCatalogPackageId('');
      setCustomPricePaid(0);
    }
    setIsAssignModalOpen(true);
  };

  const handleCatalogPackageChange = (packageId: string) => {
    setSelectedCatalogPackageId(packageId);
    const found = catalogPackages.find(p => p.id === packageId);
    if (found) {
      setCustomPricePaid(found.price || 0);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatalogPackageId) return;

    const packageDef = catalogPackages.find(p => p.id === selectedCatalogPackageId);
    if (!packageDef) return;

    setIsSubmitting(true);
    try {
      await assignPackageToPatient(db, ownerId, patient, packageDef, customPricePaid);
      setIsAssignModalOpen(false);
      showToast(`Paquete "${packageDef.name}" asignado con éxito a ${patient.name}`);
    } catch (error: any) {
      console.error(error);
      showToast('Error al asignar el paquete al paciente', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!packageToDelete) return;
    setIsDeleting(true);
    try {
      await deletePatientPackage(db, packageToDelete.id);
      showToast(`Compra del paquete "${packageToDelete.packageName}" eliminada correctamente`);
      setPackageToDelete(null);
      if (onPackageUpdated) onPackageUpdated();
    } catch (error: any) {
      console.error(error);
      showToast('Error al eliminar la compra del paquete', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedCatalogPkg = catalogPackages.find(p => p.id === selectedCatalogPackageId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h5 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
            Paquetes Adquiridos ({patientPackages.length})
          </h5>
          <p className="text-[10px] text-on-surface-variant">
            Tratamientos y sesiones contratados previamente por el paciente
          </p>
        </div>
        <button
          onClick={handleOpenAssignModal}
          className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 shadow-sm uppercase tracking-wider w-full sm:w-auto"
        >
          <Plus size={13} />
          Asignar Paquete
        </button>
      </div>

      {patientPackages.length === 0 ? (
        <div className="text-center py-8 bg-surface rounded-xl border border-dashed border-outline-variant p-4">
          <ShoppingBag size={24} className="mx-auto text-on-surface-variant/50 mb-2" />
          <p className="text-xs font-bold text-on-surface mb-1">Sin paquetes activos</p>
          <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto mb-3">
            El paciente no tiene paquetes de tratamientos adquiridos. Puede asignarle uno para que consuma sesiones sin costo adicional en cada turno.
          </p>
          <button
            onClick={handleOpenAssignModal}
            className="text-[11px] font-bold text-primary hover:underline uppercase"
          >
            + Vender / Cargar Paquete Ahora
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {patientPackages.map((pkg) => {
            const isCompleted = pkg.status === 'completed' || pkg.remainingSessions <= 0;
            const progressPercent = pkg.totalSessions > 0
              ? Math.round(((pkg.usedSessions || 0) / pkg.totalSessions) * 100)
              : 100;

            return (
              <div 
                key={pkg.id}
                className="bg-white p-4 rounded-xl border border-outline-variant shadow-sm space-y-3"
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-bold text-on-surface">{pkg.packageName}</h4>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        isCompleted 
                          ? 'bg-surface-dim text-on-surface-variant' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isCompleted ? 'Completado' : 'Activo'}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">
                      Adquirido el {pkg.purchaseDate || 'Fecha no registrada'} • Abonó ${Number(pkg.pricePaid || 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-bold text-primary block">
                        {pkg.remainingSessions} de {pkg.totalSessions} restantes
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPackageToDelete(pkg)}
                      title="Eliminar compra de este paquete"
                      className="p-1.5 text-on-surface-variant/50 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full bg-surface-dim h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${
                        isCompleted ? 'bg-on-surface-variant/40' : 'bg-primary'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-on-surface-variant font-medium">
                    <span>{pkg.usedSessions || 0} sesiones consumidas ({progressPercent}%)</span>
                    <span>{pkg.remainingSessions} disponibles</span>
                  </div>
                </div>

                {/* Items breakdown */}
                <div className="pt-2 border-t border-outline-variant/60">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Detalle por Tratamiento:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {(pkg.items || []).map((item, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-2 bg-surface rounded-lg text-xs border border-outline-variant/40"
                      >
                        <span className="font-medium text-on-surface truncate pr-2">
                          {item.treatmentName}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] shrink-0 ${
                          item.remainingQuantity > 0 
                            ? 'bg-primary/10 text-primary' 
                            : 'bg-surface-dim text-on-surface-variant'
                        }`}>
                          {item.remainingQuantity} / {item.totalQuantity} disp.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Asignar Paquete a este Paciente */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Asignar Paquete a ${patient?.name}`}
        className="max-w-md"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Seleccionar Paquete *
            </label>
            <select
              required
              value={selectedCatalogPackageId}
              onChange={(e) => handleCatalogPackageChange(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
            >
              {catalogPackages.length === 0 ? (
                <option value="">No hay paquetes creados en Tratamientos</option>
              ) : (
                catalogPackages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} — ${Number(pkg.price || 0).toLocaleString()} ({pkg.totalSessions} sesiones)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
              Importe Pagado por el Paciente ($) *
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={15} />
              <input
                type="number"
                min="0"
                required
                value={customPricePaid}
                onChange={(e) => setCustomPricePaid(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-3 py-2 bg-surface border border-outline-variant rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="text-[10px] text-on-surface-variant">
              Este valor representa el total pagado por el paquete. Los turnos que consuman estas sesiones no sumarán costo adicional.
            </p>
          </div>

          {selectedCatalogPkg && (
            <div className="p-3 bg-surface rounded-xl border border-outline-variant text-xs space-y-2">
              <p className="font-bold text-on-surface">Tratamientos incluidos:</p>
              <div className="space-y-1">
                {(selectedCatalogPkg.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-on-surface-variant">
                    <span>• {it.treatmentName}</span>
                    <span className="font-bold text-primary">{it.quantity} {it.quantity === 1 ? 'sesión' : 'sesiones'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setIsAssignModalOpen(false)}
              className="flex-1 px-4 py-2 border border-outline-variant text-xs font-bold rounded-lg hover:bg-surface uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedCatalogPackageId || isSubmitting}
              className="flex-1 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 shadow-sm uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} />
              Confirmar
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal de confirmación para eliminar compra de paquete */}
      <Modal
        isOpen={Boolean(packageToDelete)}
        onClose={() => !isDeleting && setPackageToDelete(null)}
        title="Eliminar Compra de Paquete"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={20} />
            <div className="text-xs text-rose-800 space-y-1.5">
              <p className="font-bold text-[13px]">¿Deseas eliminar la compra de este paquete?</p>
              <p>
                Se removerá el registro del paquete <strong className="text-rose-950 font-bold">"{packageToDelete?.packageName}"</strong> del paciente <strong>{patient?.name}</strong>.
              </p>
              {packageToDelete && (packageToDelete.usedSessions || 0) > 0 && (
                <div className="p-2 bg-rose-100/70 border border-rose-300 rounded-lg text-rose-900 font-semibold text-[11px] mt-2">
                  ⚠️ Atención: El paciente ya ha utilizado {packageToDelete.usedSessions} de {packageToDelete.totalSessions} sesiones de este paquete.
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setPackageToDelete(null)}
              className="flex-1 px-4 py-2 border border-outline-variant text-xs font-bold rounded-lg hover:bg-surface uppercase tracking-wider cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="flex-1 px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 disabled:opacity-50 shadow-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 size={15} />
              {isDeleting ? 'Eliminando...' : 'Sí, Eliminar Paquete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
