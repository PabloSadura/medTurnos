import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Eye, 
  Download, 
  Calendar, 
  Sparkles, 
  CheckCircle2, 
  ArrowLeftRight, 
  SlidersHorizontal, 
  Layers, 
  Camera, 
  Maximize2, 
  X, 
  Clock, 
  FileText, 
  Upload, 
  AlertCircle,
  Cloud,
  ChevronRight,
  Split,
  Folder,
  FolderPlus,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { PatientEvolutionPhoto } from '../types';
import { compressImage } from '../lib/imageUtils';
import { useToast } from './Toast';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { uploadFileToDrive, getOrCreatePatientFolder } from '../lib/googleDrive';
import { cn } from '../lib/utils';

interface PatientEvolutionPhotosProps {
  patient: any;
  ownerId: string | null;
  treatments?: any[];
}

const STAGE_PRESETS = [
  'Foto Inicial (Antes)',
  'Control 7 Días',
  'Control 15 Días',
  'Control 1 Mes',
  'Sesión 2',
  'Sesión 3',
  'Sesión 4',
  'Sesión 5',
  'Foto Actual (Después)',
  'Resultado Final',
];

export function PatientEvolutionPhotos({ patient, ownerId, treatments = [] }: PatientEvolutionPhotosProps) {
  const { showToast } = useToast();
  const { isConnected: isDriveConnected, accessToken, rootFolderId } = useGoogleDrive();

  // Patient folder in Google Drive
  const [patientFolderId, setPatientFolderId] = useState<string | null>(patient?.driveFolderId || null);
  const [checkingFolder, setCheckingFolder] = useState<boolean>(false);

  // Ensure / verify that a folder with the patient's name exists
  const ensurePatientFolder = async (): Promise<string | null> => {
    if (!accessToken || !patient?.id) return null;
    setCheckingFolder(true);
    try {
      const pFolderId = await getOrCreatePatientFolder(patient, accessToken);
      setPatientFolderId(pFolderId);
      if (!patient.driveFolderId || patient.driveFolderId !== pFolderId) {
        try {
          await updateDoc(doc(db, 'patients', patient.id), {
            driveFolderId: pFolderId,
            driveFolderName: patient.name,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          // Non-blocking
        }
      }
      return pFolderId;
    } catch (err: any) {
      console.error('Error ensuring patient folder in Drive:', err);
      return null;
    } finally {
      setCheckingFolder(false);
    }
  };

  useEffect(() => {
    if (isDriveConnected && accessToken && patient?.id) {
      ensurePatientFolder();
    }
  }, [isDriveConnected, accessToken, patient?.id]);

  const [photos, setPhotos] = useState<PatientEvolutionPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'comparison' | 'gallery'>('comparison');
  const [comparisonType, setComparisonType] = useState<'slider' | 'side-by-side'>('slider');

  // Selected photo IDs for comparison
  const [beforePhotoId, setBeforePhotoId] = useState<string>('');
  const [afterPhotoId, setAfterPhotoId] = useState<string>('');

  // Interactive slider state (0 to 100 percentage)
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null);

  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formStage, setFormStage] = useState<string>('Foto Inicial (Antes)');
  const [formTreatmentId, setFormTreatmentId] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formIsBefore, setFormIsBefore] = useState<boolean>(false);
  const [formIsAfter, setFormIsAfter] = useState<boolean>(false);
  const [saveToDrive, setSaveToDrive] = useState<boolean>(true);

  // Lightbox modal state
  const [lightboxPhoto, setLightboxPhoto] = useState<PatientEvolutionPhoto | null>(null);

  // Deleting photo
  const [photoToDelete, setPhotoToDelete] = useState<PatientEvolutionPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch photos from Firestore
  useEffect(() => {
    if (!patient?.id || !ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'patient_photos'),
      where('patientId', '==', patient.id),
      where('userId', '==', ownerId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as PatientEvolutionPhoto[];

        // Sort chronologically (oldest to newest)
        items.sort((a, b) => {
          const dateDiff = (a.date || '').localeCompare(b.date || '');
          if (dateDiff !== 0) return dateDiff;
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeA - timeB;
        });

        setPhotos(items);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'patient_photos');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [patient?.id, ownerId]);

  // Sync default Before & After photos whenever the list updates
  useEffect(() => {
    if (photos.length === 0) {
      setBeforePhotoId('');
      setAfterPhotoId('');
      return;
    }

    // Determine Before Photo: marked isBeforePhoto OR first chronological
    let defBefore = photos.find((p) => p.isBeforePhoto)?.id || photos[0]?.id;
    // Determine After Photo: marked isAfterPhoto OR last chronological (or second if exists)
    let defAfter = photos.find((p) => p.isAfterPhoto)?.id || photos[photos.length - 1]?.id;

    // If there are at least 2 photos and before === after, pick first and last
    if (photos.length > 1 && defBefore === defAfter) {
      defBefore = photos[0].id;
      defAfter = photos[photos.length - 1].id;
    }

    // Only update if current selections are invalid or unset
    if (!photos.some((p) => p.id === beforePhotoId)) {
      setBeforePhotoId(defBefore);
    }
    if (!photos.some((p) => p.id === afterPhotoId)) {
      setAfterPhotoId(defAfter);
    }
  }, [photos]);

  const beforePhoto = useMemo(
    () => photos.find((p) => p.id === beforePhotoId) || photos[0] || null,
    [photos, beforePhotoId]
  );

  const afterPhoto = useMemo(
    () => photos.find((p) => p.id === afterPhotoId) || photos[photos.length - 1] || null,
    [photos, afterPhotoId]
  );

  // Calculate days between Before and After
  const daysDifference = useMemo(() => {
    if (!beforePhoto?.date || !afterPhoto?.date) return null;
    const d1 = new Date(beforePhoto.date);
    const d2 = new Date(afterPhoto.date);
    const diffTime = d2.getTime() - d1.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [beforePhoto, afterPhoto]);

  // Handle interactive slider mouse/touch
  const handleSliderMove = (clientX: number) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSlider) {
        handleSliderMove(e.clientX);
      }
    };
    const handleMouseUp = () => {
      if (isDraggingSlider) {
        setIsDraggingSlider(false);
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isDraggingSlider && e.touches[0]) {
        handleSliderMove(e.touches[0].clientX);
      }
    };
    const handleTouchEnd = () => {
      if (isDraggingSlider) {
        setIsDraggingSlider(false);
      }
    };

    if (isDraggingSlider) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingSlider]);

  // File selection and client-side compression
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona un archivo de imagen válido (JPG, PNG, WEBP).', 'error');
      return;
    }

    try {
      setSelectedFile(file);
      const res = await compressImage(file, 1280, 1280, 0.82);
      setPreviewDataUrl(res.dataUrl);
      setCompressedBlob(res.blob);
      setCompressionStats({
        original: res.originalSize,
        compressed: res.compressedSize,
      });

      // Suggest default stage based on existing photos
      if (photos.length === 0) {
        setFormStage('Foto Inicial (Antes)');
        setFormTitle('Foto Inicial de Consulta');
        setFormIsBefore(true);
      } else {
        const nextSessionNum = photos.length + 1;
        setFormStage(`Sesión ${nextSessionNum}`);
        setFormTitle(`Control de Evolución - Sesión ${nextSessionNum}`);
        setFormIsAfter(true);
      }
    } catch (err: any) {
      console.error('Error compressing image:', err);
      showToast('No se pudo procesar la imagen seleccionada.', 'error');
    }
  };

  const handleOpenUploadModal = (defaultAsBefore = false) => {
    setSelectedFile(null);
    setPreviewDataUrl(null);
    setCompressedBlob(null);
    setCompressionStats(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTreatmentId('');
    setFormNotes('');

    if (defaultAsBefore || photos.length === 0) {
      setFormStage('Foto Inicial (Antes)');
      setFormTitle('Foto Inicial de Diagnóstico');
      setFormIsBefore(true);
      setFormIsAfter(false);
    } else {
      const nextSession = photos.length + 1;
      setFormStage(`Sesión ${nextSession}`);
      setFormTitle(`Evolución Sesión ${nextSession}`);
      setFormIsBefore(false);
      setFormIsAfter(true);
    }

    setIsUploadOpen(true);
  };

  // Submit photo to Firestore & Google Drive
  const handleSavePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewDataUrl || !ownerId || !patient?.id) {
      showToast('Debes seleccionar y cargar una fotografía.', 'error');
      return;
    }

    setUploading(true);
    try {
      let driveFileId: string | undefined = undefined;
      let driveViewLink: string | undefined = undefined;
      let targetFolderId: string | undefined = undefined;

      // Google Drive: Ensure folder with patient name exists first, then save photo inside that folder
      if (saveToDrive && isDriveConnected && accessToken && compressedBlob) {
        try {
          // 1. Obtener o crear primero la carpeta con el nombre del paciente
          const pFolderId = patientFolderId || (await ensurePatientFolder()) || (await getOrCreatePatientFolder(patient, accessToken));
          setPatientFolderId(pFolderId);
          targetFolderId = pFolderId;

          const fileName = `Evolucion_${patient.name.replace(/\s+/g, '_')}_${formDate}_${formStage.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
          
          // 2. Guardar la foto dentro de esa carpeta
          const driveFile = await uploadFileToDrive({
            file: compressedBlob,
            fileName,
            parentFolderId: pFolderId,
            accessToken,
            category: 'Evolución Fotográfica',
            description: `Foto de Evolución Clínica (${formStage}) para ${patient.name}. Guardada en su carpeta personal. Notas: ${formNotes || 'Sin notas'}`,
          });
          driveFileId = driveFile.id;
          driveViewLink = driveFile.webViewLink;
        } catch (driveErr) {
          console.warn('Could not save copy to Google Drive, proceeding with Firestore save:', driveErr);
        }
      }

      const selectedTreatment = treatments.find((t) => t.id === formTreatmentId);

      const newPhotoData = {
        patientId: patient.id,
        patientName: patient.name,
        userId: ownerId,
        imageUrl: previewDataUrl,
        driveFileId: driveFileId || null,
        driveViewLink: driveViewLink || null,
        driveFolderId: targetFolderId || patientFolderId || null,
        driveFolderName: patient.name,
        date: formDate,
        title: formTitle.trim() || formStage,
        stage: formStage,
        isBeforePhoto: Boolean(formIsBefore),
        isAfterPhoto: Boolean(formIsAfter),
        treatmentId: formTreatmentId || '',
        treatmentName: selectedTreatment?.name || '',
        notes: formNotes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'patient_photos'), newPhotoData);

      // If marked as Before photo, unmark other photos
      if (formIsBefore) {
        for (const p of photos) {
          if (p.isBeforePhoto) {
            await updateDoc(doc(db, 'patient_photos', p.id), { isBeforePhoto: false });
          }
        }
        setBeforePhotoId(docRef.id);
      }

      // If marked as After photo, unmark other photos
      if (formIsAfter) {
        for (const p of photos) {
          if (p.isAfterPhoto) {
            await updateDoc(doc(db, 'patient_photos', p.id), { isAfterPhoto: false });
          }
        }
        setAfterPhotoId(docRef.id);
      }

      showToast(`Fotografía guardada con éxito en la carpeta de ${patient.name}.`);
      setIsUploadOpen(false);
      setViewMode('comparison');
    } catch (err: any) {
      console.error('Error saving photo:', err);
      handleFirestoreError(err, OperationType.CREATE, 'patient_photos');
    } finally {
      setUploading(false);
    }
  };

  // Toggle or assign Before / After flags
  const handleSetAsBefore = async (photo: PatientEvolutionPhoto) => {
    try {
      for (const p of photos) {
        if (p.isBeforePhoto && p.id !== photo.id) {
          await updateDoc(doc(db, 'patient_photos', p.id), { isBeforePhoto: false });
        }
      }
      await updateDoc(doc(db, 'patient_photos', photo.id), { isBeforePhoto: true });
      setBeforePhotoId(photo.id);
      showToast('Foto fijada como Estado Inicial ("Antes").');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'patient_photos');
    }
  };

  const handleSetAsAfter = async (photo: PatientEvolutionPhoto) => {
    try {
      for (const p of photos) {
        if (p.isAfterPhoto && p.id !== photo.id) {
          await updateDoc(doc(db, 'patient_photos', p.id), { isAfterPhoto: false });
        }
      }
      await updateDoc(doc(db, 'patient_photos', photo.id), { isAfterPhoto: true });
      setAfterPhotoId(photo.id);
      showToast('Foto fijada como Estado Actual ("Después").');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'patient_photos');
    }
  };

  // Delete photo
  const handleDeletePhoto = async () => {
    if (!photoToDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'patient_photos', photoToDelete.id));
      showToast('Fotografía eliminada.');
      setPhotoToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'patient_photos');
    } finally {
      setDeleting(false);
    }
  };

  // Download image
  const handleDownloadImage = (photo: PatientEvolutionPhoto) => {
    const link = document.createElement('a');
    link.href = photo.imageUrl;
    link.download = `Evolucion_${patient?.name || 'Paciente'}_${photo.date}_${photo.title}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-4 rounded-xl border border-outline-variant">
        <div>
          <div className="flex items-center gap-2">
            <h5 className="text-xs font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
              <Split size={16} className="text-primary" />
              Evolución Visual & Antes / Después
            </h5>
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full border border-primary/20">
              {photos.length} {photos.length === 1 ? 'Foto' : 'Fotos'}
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            Registro fotográfico cronológico para documentar y comparar la evolución de los tratamientos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {photos.length > 0 && (
            <div className="flex items-center bg-surface-bright p-1 rounded-lg border border-outline-variant text-[11px] font-bold">
              <button
                type="button"
                id="btn-view-comparison"
                onClick={() => setViewMode('comparison')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all",
                  viewMode === 'comparison'
                    ? "bg-white text-primary shadow-xs font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <ArrowLeftRight size={13} />
                Comparativa
              </button>
              <button
                type="button"
                id="btn-view-gallery"
                onClick={() => setViewMode('gallery')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all",
                  viewMode === 'gallery'
                    ? "bg-white text-primary shadow-xs font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Layers size={13} />
                Historial ({photos.length})
              </button>
            </div>
          )}

          <button
            type="button"
            id="btn-add-evolution-photo"
            onClick={() => handleOpenUploadModal(photos.length === 0)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm hover:bg-primary/95 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus size={15} />
            Nueva Foto
          </button>
        </div>
      </div>

      {/* Patient Folder Organization Banner */}
      <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Folder size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-on-surface-variant font-medium">Carpeta del Paciente:</span>
              <h4 className="text-xs font-bold text-on-surface truncate">{patient?.name}</h4>
              {isDriveConnected && patientFolderId && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={11} /> Carpeta en Drive activa
                </span>
              )}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Las fotografías se organizan y guardan dentro de la carpeta exclusiva de este paciente.
            </p>
          </div>
        </div>

        {isDriveConnected && (
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {patientFolderId ? (
              <a
                href={`https://drive.google.com/drive/folders/${patientFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface text-primary border border-outline-variant/60 hover:bg-surface-container-high transition-colors shadow-xs"
                title="Abrir carpeta en Google Drive"
              >
                <ExternalLink size={13} />
                Abrir carpeta en Drive
              </a>
            ) : (
              <button
                type="button"
                onClick={() => ensurePatientFolder()}
                disabled={checkingFolder}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                title="Crear o verificar carpeta del paciente en Google Drive"
              >
                {checkingFolder ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />}
                Crear carpeta en Drive
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center text-on-surface-variant gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-medium">Cargando evolución fotográfica...</span>
        </div>
      )}

      {/* Empty state when no photos */}
      {!loading && photos.length === 0 && (
        <div className="p-8 sm:p-12 text-center bg-surface-bright/50 border border-dashed border-outline-variant rounded-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
            <Camera size={32} />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h6 className="text-sm font-bold text-on-surface">No hay fotografías de evolución aún</h6>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Carga la primera foto del paciente para establecer el punto de partida (<span className="font-bold text-emerald-700">"Antes"</span>). 
              A medida que agregues fotos en futuras citas, podrás comparar el progreso lado a lado con el visor interactivo.
            </p>
          </div>
          <button
            type="button"
            id="btn-upload-first-photo"
            onClick={() => handleOpenUploadModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md hover:bg-primary/90 transition-all cursor-pointer"
          >
            <Plus size={16} />
            Subir Primera Foto (Antes)
          </button>
        </div>
      )}

      {/* Only 1 photo state notice */}
      {!loading && photos.length === 1 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900">
          <Sparkles size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">¡Primera foto registrada como estado inicial ("Antes")!</p>
            <p className="text-amber-800 leading-relaxed">
              Para ver la comparativa interactiva de evolución, sube una segunda foto en el próximo control o sesión.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenUploadModal(false)}
            className="ml-auto shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider hover:bg-amber-700 transition-colors"
          >
            + Subir Siguiente Foto
          </button>
        </div>
      )}

      {/* Comparison View (Slider or Side-by-Side) */}
      {!loading && photos.length > 0 && viewMode === 'comparison' && (
        <div className="space-y-4">
          {/* Comparison Controls Bar: selectors for Before & After */}
          <div className="p-3.5 bg-surface rounded-xl border border-outline-variant space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Before Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Antes
                  </span>
                  <select
                    id="select-before-photo"
                    value={beforePhotoId}
                    onChange={(e) => setBeforePhotoId(e.target.value)}
                    className="text-xs bg-surface-bright border border-outline-variant rounded-lg px-2.5 py-1.5 text-on-surface font-medium focus:ring-1 focus:ring-primary outline-none"
                  >
                    {photos.map((p, idx) => (
                      <option key={`before-${p.id}`} value={p.id}>
                        {p.title} ({p.date}) {p.isBeforePhoto ? '★ Inicial' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <ArrowLeftRight size={14} className="text-on-surface-variant hidden sm:block" />

                {/* After Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                    Después
                  </span>
                  <select
                    id="select-after-photo"
                    value={afterPhotoId}
                    onChange={(e) => setAfterPhotoId(e.target.value)}
                    className="text-xs bg-surface-bright border border-outline-variant rounded-lg px-2.5 py-1.5 text-on-surface font-medium focus:ring-1 focus:ring-primary outline-none"
                  >
                    {photos.map((p, idx) => (
                      <option key={`after-${p.id}`} value={p.id}>
                        {p.title} ({p.date}) {p.isAfterPhoto ? '★ Actual' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {daysDifference !== null && (
                  <span className="text-[11px] font-bold text-on-surface-variant bg-surface-bright px-2.5 py-1 rounded-md border border-outline-variant">
                    <Clock size={12} className="inline mr-1 text-primary" />
                    {daysDifference === 0 
                      ? 'Mismo día' 
                      : daysDifference === 1 
                        ? '1 día de evolución' 
                        : `${daysDifference} días de evolución`}
                  </span>
                )}
              </div>

              {/* Mode Toggle: Slider vs Side-by-Side */}
              <div className="flex items-center gap-1 bg-surface-bright p-1 rounded-lg border border-outline-variant text-[11px] font-bold self-start sm:self-auto">
                <button
                  type="button"
                  id="btn-mode-slider"
                  onClick={() => setComparisonType('slider')}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded transition-all",
                    comparisonType === 'slider'
                      ? "bg-white text-primary shadow-xs font-black"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                  title="Deslizador Interactivo"
                >
                  <SlidersHorizontal size={13} />
                  Deslizador
                </button>
                <button
                  type="button"
                  id="btn-mode-side-by-side"
                  onClick={() => setComparisonType('side-by-side')}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded transition-all",
                    comparisonType === 'side-by-side'
                      ? "bg-white text-primary shadow-xs font-black"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                  title="Vista Lado a Lado"
                >
                  <Split size={13} />
                  Lado a Lado
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Split Slider Comparison */}
          {comparisonType === 'slider' && beforePhoto && afterPhoto && (
            <div className="space-y-2">
              <div 
                ref={sliderContainerRef}
                className="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[500px] bg-black/90 rounded-2xl overflow-hidden border border-outline-variant shadow-lg select-none cursor-ew-resize group"
                onMouseDown={(e) => {
                  setIsDraggingSlider(true);
                  handleSliderMove(e.clientX);
                }}
                onTouchStart={(e) => {
                  setIsDraggingSlider(true);
                  if (e.touches[0]) handleSliderMove(e.touches[0].clientX);
                }}
              >
                {/* AFTER image (Background layer) */}
                <img 
                  src={afterPhoto.imageUrl} 
                  alt="Después"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />

                {/* BEFORE image (Clipped foreground layer) */}
                <div 
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ width: `${sliderPos}%` }}
                >
                  <img 
                    src={beforePhoto.imageUrl} 
                    alt="Antes"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    style={{ 
                      width: sliderContainerRef.current ? `${sliderContainerRef.current.clientWidth}px` : '100%',
                      maxWidth: 'none'
                    }}
                  />
                </div>

                {/* Vertical Divider Line with handle */}
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_rgba(0,0,0,0.6)] cursor-ew-resize z-20 pointer-events-none"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-primary shadow-xl border-2 border-primary flex items-center justify-center pointer-events-auto active:scale-110 transition-transform">
                    <ArrowLeftRight size={14} />
                  </div>
                </div>

                {/* Badges on top of images */}
                <div className="absolute top-3 left-3 z-10 pointer-events-none flex flex-col items-start gap-1">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-600/90 text-white text-[11px] font-black uppercase tracking-wider backdrop-blur-sm shadow-md">
                    Antes: {beforePhoto.date}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium backdrop-blur-sm">
                    {beforePhoto.title}
                  </span>
                </div>

                <div className="absolute top-3 right-3 z-10 pointer-events-none flex flex-col items-end gap-1">
                  <span className="px-2.5 py-1 rounded-full bg-blue-600/90 text-white text-[11px] font-black uppercase tracking-wider backdrop-blur-sm shadow-md">
                    Después: {afterPhoto.date}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium backdrop-blur-sm">
                    {afterPhoto.title}
                  </span>
                </div>

                {/* Fullscreen view buttons */}
                <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxPhoto(afterPhoto);
                    }}
                    className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm transition-colors text-xs flex items-center gap-1 cursor-pointer"
                    title="Ver en detalle"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              {/* Slider instruction tip */}
              <p className="text-[11px] text-center text-on-surface-variant font-medium">
                Arrastra la barra vertical en cualquier dirección para comparar la transición visual del Antes y Después.
              </p>
            </div>
          )}

          {/* Side-by-side Comparison Mode */}
          {comparisonType === 'side-by-side' && beforePhoto && afterPhoto && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Card ANTES */}
              <div className="bg-surface rounded-2xl border border-emerald-200 overflow-hidden shadow-sm flex flex-col">
                <div className="p-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider rounded">
                      Antes
                    </span>
                    <span className="text-xs font-bold text-emerald-950">{beforePhoto.title}</span>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-800 flex items-center gap-1">
                    <Calendar size={12} /> {beforePhoto.date}
                  </span>
                </div>

                <div 
                  className="relative aspect-[4/3] bg-black/90 cursor-pointer overflow-hidden group"
                  onClick={() => setLightboxPhoto(beforePhoto)}
                >
                  <img 
                    src={beforePhoto.imageUrl} 
                    alt="Antes" 
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Maximize2 size={24} />
                  </div>
                </div>

                <div className="p-3.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
                  <div>
                    {beforePhoto.treatmentName && (
                      <p className="text-on-surface-variant text-[11px] mb-1 font-medium">
                        Tratamiento: <b className="text-on-surface">{beforePhoto.treatmentName}</b>
                      </p>
                    )}
                    {beforePhoto.notes ? (
                      <p className="text-on-surface bg-surface-bright p-2.5 rounded-lg border border-outline-variant text-[11px] italic">
                        "{beforePhoto.notes}"
                      </p>
                    ) : (
                      <p className="text-on-surface-variant/60 text-[11px] italic">Sin notas clínicas adicionales.</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant mt-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadImage(beforePhoto)}
                      className="text-[11px] font-bold text-on-surface-variant hover:text-primary flex items-center gap-1"
                    >
                      <Download size={13} /> Descargar
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxPhoto(beforePhoto)}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Eye size={13} /> Pantalla completa
                    </button>
                  </div>
                </div>
              </div>

              {/* Card DESPUÉS */}
              <div className="bg-surface rounded-2xl border border-blue-200 overflow-hidden shadow-sm flex flex-col">
                <div className="p-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider rounded">
                      Después
                    </span>
                    <span className="text-xs font-bold text-blue-950">{afterPhoto.title}</span>
                  </div>
                  <span className="text-[11px] font-medium text-blue-800 flex items-center gap-1">
                    <Calendar size={12} /> {afterPhoto.date}
                  </span>
                </div>

                <div 
                  className="relative aspect-[4/3] bg-black/90 cursor-pointer overflow-hidden group"
                  onClick={() => setLightboxPhoto(afterPhoto)}
                >
                  <img 
                    src={afterPhoto.imageUrl} 
                    alt="Después" 
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Maximize2 size={24} />
                  </div>
                </div>

                <div className="p-3.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
                  <div>
                    {afterPhoto.treatmentName && (
                      <p className="text-on-surface-variant text-[11px] mb-1 font-medium">
                        Tratamiento: <b className="text-on-surface">{afterPhoto.treatmentName}</b>
                      </p>
                    )}
                    {afterPhoto.notes ? (
                      <p className="text-on-surface bg-surface-bright p-2.5 rounded-lg border border-outline-variant text-[11px] italic">
                        "{afterPhoto.notes}"
                      </p>
                    ) : (
                      <p className="text-on-surface-variant/60 text-[11px] italic">Sin notas clínicas adicionales.</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant mt-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadImage(afterPhoto)}
                      className="text-[11px] font-bold text-on-surface-variant hover:text-primary flex items-center gap-1"
                    >
                      <Download size={13} /> Descargar
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxPhoto(afterPhoto)}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Eye size={13} /> Pantalla completa
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gallery / Timeline View (All Evolution Photos) */}
      {!loading && photos.length > 0 && viewMode === 'gallery' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo, index) => {
              const isCurrentlyBefore = beforePhotoId === photo.id;
              const isCurrentlyAfter = afterPhotoId === photo.id;

              return (
                <div 
                  key={photo.id}
                  className={cn(
                    "bg-surface rounded-xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col",
                    isCurrentlyBefore 
                      ? "border-emerald-400 ring-2 ring-emerald-300" 
                      : isCurrentlyAfter 
                        ? "border-blue-400 ring-2 ring-blue-300" 
                        : "border-outline-variant"
                  )}
                >
                  {/* Photo Thumbnail */}
                  <div 
                    className="relative aspect-[4/3] bg-black/90 cursor-pointer overflow-hidden group"
                    onClick={() => setLightboxPhoto(photo)}
                  >
                    <img 
                      src={photo.imageUrl} 
                      alt={photo.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Maximize2 size={22} />
                    </div>

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                      {photo.isBeforePhoto && (
                        <span className="px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider rounded-md shadow-xs">
                          ★ Inicial (Antes)
                        </span>
                      )}
                      {photo.isAfterPhoto && (
                        <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider rounded-md shadow-xs">
                          ★ Actual (Después)
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-2 left-2">
                      <span className="px-2 py-0.5 bg-black/70 text-white text-[10px] font-bold rounded backdrop-blur-xs">
                        #{index + 1} • {photo.date}
                      </span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h6 className="text-xs font-bold text-on-surface line-clamp-1">{photo.title}</h6>
                        <span className="text-[10px] text-on-surface-variant uppercase font-semibold bg-surface-bright px-1.5 py-0.5 rounded border border-outline-variant shrink-0">
                          {photo.stage || 'Control'}
                        </span>
                      </div>

                      {photo.treatmentName && (
                        <p className="text-[10px] text-primary font-bold mt-1">
                          {photo.treatmentName}
                        </p>
                      )}

                      {photo.notes && (
                        <p className="text-[11px] text-on-surface-variant line-clamp-2 mt-1.5 bg-surface-bright/70 p-1.5 rounded">
                          {photo.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="pt-2.5 border-t border-outline-variant space-y-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetAsBefore(photo)}
                          className={cn(
                            "flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border",
                            isCurrentlyBefore
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-surface-bright text-on-surface border-outline-variant hover:bg-emerald-50 hover:text-emerald-800"
                          )}
                        >
                          {isCurrentlyBefore ? '✓ Es Antes' : 'Fijar Antes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetAsAfter(photo)}
                          className={cn(
                            "flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border",
                            isCurrentlyAfter
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-surface-bright text-on-surface border-outline-variant hover:bg-blue-50 hover:text-blue-800"
                          )}
                        >
                          {isCurrentlyAfter ? '✓ Es Después' : 'Fijar Después'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-on-surface-variant">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleDownloadImage(photo)}
                            className="hover:text-primary transition-colors flex items-center gap-1"
                            title="Descargar fotografía"
                          >
                            <Download size={12} /> Descargar
                          </button>
                          {photo.driveViewLink && (
                            <a
                              href={photo.driveViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 font-medium"
                              title="Ver archivo en Google Drive"
                            >
                              <ExternalLink size={11} /> Drive
                            </a>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPhotoToDelete(photo)}
                          className="text-error/80 hover:text-error transition-colors flex items-center gap-1"
                          title="Eliminar fotografía"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload Evolution Photo Modal */}
      <AnimatePresence>
        {isUploadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-2xl border border-outline-variant shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-4 bg-surface-bright border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Camera size={18} />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-on-surface">Cargar Fotografía de Evolución</h5>
                    <p className="text-[11px] text-on-surface-variant">Paciente: <b>{patient?.name}</b></p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSavePhoto} className="p-5 space-y-4 overflow-y-auto flex-1">
                {/* Destination folder card */}
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder size={18} className="text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-on-surface truncate">
                        Carpeta del Paciente: <span className="text-primary font-black">{patient?.name}</span>
                      </p>
                      <p className="text-[10px] text-on-surface-variant">
                        Esta foto se guardará dentro de la carpeta con el nombre de este paciente.
                      </p>
                    </div>
                  </div>
                  {isDriveConnected && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                      Drive Sync
                    </span>
                  )}
                </div>

                {/* Image Upload Box */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface uppercase tracking-wider block">
                    Fotografía Clínica <span className="text-error">*</span>
                  </label>

                  {previewDataUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-outline-variant bg-black/90 aspect-[16/10] max-h-56">
                      <img 
                        src={previewDataUrl} 
                        alt="Vista previa" 
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewDataUrl(null);
                          setCompressedBlob(null);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors"
                        title="Cambiar imagen"
                      >
                        <X size={14} />
                      </button>
                      {compressionStats && (
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-xs text-white text-[9px] rounded font-medium">
                          Optimizado: {(compressionStats.compressed / 1024).toFixed(0)} KB (de {(compressionStats.original / 1024).toFixed(0)} KB)
                        </div>
                      )}
                    </div>
                  ) : (
                    <label 
                      htmlFor="evolution-file-input"
                      className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant hover:border-primary/60 rounded-xl p-6 bg-surface-bright/40 hover:bg-primary/5 transition-all cursor-pointer group"
                    >
                      <Upload size={28} className="text-on-surface-variant group-hover:text-primary mb-2 transition-colors" />
                      <span className="text-xs font-bold text-on-surface group-hover:text-primary">
                        Haz clic o arrastra una imagen aquí
                      </span>
                      <span className="text-[10px] text-on-surface-variant mt-1">
                        Formatos soportados: JPG, PNG, WEBP (se optimiza automáticamente)
                      </span>
                      <input 
                        id="evolution-file-input"
                        type="file" 
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Stage presets */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Etapa / Momento de la Foto
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setFormStage(preset);
                          if (preset.includes('Antes')) {
                            setFormIsBefore(true);
                            setFormIsAfter(false);
                          } else if (preset.includes('Después') || preset.includes('Final')) {
                            setFormIsAfter(true);
                            setFormIsBefore(false);
                          }
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border",
                          formStage === preset
                            ? "bg-primary text-white border-primary shadow-xs"
                            : "bg-surface-bright text-on-surface-variant border-outline-variant hover:border-primary/40"
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date & Title */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block" htmlFor="input-photo-date">
                      Fecha de la Foto
                    </label>
                    <input 
                      type="date"
                      id="input-photo-date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-surface text-xs border border-outline-variant rounded-lg font-medium text-on-surface focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block" htmlFor="input-photo-title">
                      Título / Descripción Corta
                    </label>
                    <input 
                      type="text"
                      id="input-photo-title"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Ej: Foto Inicial, Sesión 3..."
                      required
                      className="w-full px-3 py-2 bg-surface text-xs border border-outline-variant rounded-lg font-medium text-on-surface focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>

                {/* Treatment relation */}
                {treatments.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block" htmlFor="select-photo-treatment">
                      Tratamiento Asociado (Opcional)
                    </label>
                    <select
                      id="select-photo-treatment"
                      value={formTreatmentId}
                      onChange={(e) => setFormTreatmentId(e.target.value)}
                      className="w-full px-3 py-2 bg-surface text-xs border border-outline-variant rounded-lg font-medium text-on-surface focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="">-- Sin tratamiento específico --</option>
                      {treatments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block" htmlFor="input-photo-notes">
                    Notas Clínicas / Observaciones de Evolución
                  </label>
                  <textarea
                    id="input-photo-notes"
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Detalles sobre cicatrización, cambios observados, disminución de inflamación, recomendaciones..."
                    className="w-full px-3 py-2 bg-surface text-xs border border-outline-variant rounded-lg font-medium text-on-surface focus:ring-1 focus:ring-primary outline-none resize-none"
                  />
                </div>

                {/* Flags: Set as Before or After */}
                <div className="p-3 bg-surface-bright rounded-xl border border-outline-variant space-y-2">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="chk-set-before"
                      checked={formIsBefore}
                      onChange={(e) => {
                        setFormIsBefore(e.target.checked);
                        if (e.target.checked) setFormIsAfter(false);
                      }}
                      className="w-3.5 h-3.5 text-primary rounded border-outline-variant focus:ring-primary"
                    />
                    <label htmlFor="chk-set-before" className="text-xs font-bold text-on-surface cursor-pointer">
                      Establecer como Foto Inicial principal (<span className="text-emerald-700">"Antes"</span>)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="chk-set-after"
                      checked={formIsAfter}
                      onChange={(e) => {
                        setFormIsAfter(e.target.checked);
                        if (e.target.checked) setFormIsBefore(false);
                      }}
                      className="w-3.5 h-3.5 text-primary rounded border-outline-variant focus:ring-primary"
                    />
                    <label htmlFor="chk-set-after" className="text-xs font-bold text-on-surface cursor-pointer">
                      Establecer como Foto Actual principal (<span className="text-blue-700">"Después"</span>)
                    </label>
                  </div>

                  {isDriveConnected && (
                    <div className="pt-2 border-t border-outline-variant space-y-1">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox"
                          id="chk-save-drive"
                          checked={saveToDrive}
                          onChange={(e) => setSaveToDrive(e.target.checked)}
                          className="w-3.5 h-3.5 text-primary rounded border-outline-variant focus:ring-primary"
                        />
                        <label htmlFor="chk-save-drive" className="text-xs font-semibold text-on-surface flex items-center gap-1.5 cursor-pointer">
                          <Cloud size={13} className="text-primary" /> Guardar también en Google Drive
                        </label>
                      </div>
                      {saveToDrive && (
                        <p className="text-[10px] text-on-surface-variant flex items-center gap-1 pl-5">
                          <Folder size={11} className="text-primary shrink-0" />
                          Se almacenará directamente dentro de la carpeta: <b>{patient?.name}</b>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant">
                  <button
                    type="button"
                    onClick={() => setIsUploadOpen(false)}
                    disabled={uploading}
                    className="px-4 py-2 bg-surface text-on-surface text-xs font-bold uppercase tracking-wider rounded-lg border border-outline-variant hover:bg-outline-variant/50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    id="btn-submit-evolution-photo"
                    disabled={uploading || !previewDataUrl}
                    className="px-5 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {uploading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} />
                        <span>Guardar Foto</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox / Fullscreen Image Modal */}
      <AnimatePresence>
        {lightboxPhoto && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-sm"
            onClick={() => setLightboxPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full bg-surface-dark rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
            >
              {/* Image Container */}
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px] max-h-[65vh]">
                <img 
                  src={lightboxPhoto.imageUrl} 
                  alt={lightboxPhoto.title} 
                  className="max-h-full max-w-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(null)}
                  className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-colors z-10"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Info & Footer */}
              <div className="p-4 bg-surface text-on-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-outline-variant">
                <div>
                  <div className="flex items-center gap-2">
                    <h5 className="text-sm font-bold text-on-surface">{lightboxPhoto.title}</h5>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded">
                      {lightboxPhoto.stage || 'Control'}
                    </span>
                    {lightboxPhoto.isBeforePhoto && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                        Antes
                      </span>
                    )}
                    {lightboxPhoto.isAfterPhoto && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                        Después
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Fecha: <b>{lightboxPhoto.date}</b> {lightboxPhoto.treatmentName && `• Tratamiento: ${lightboxPhoto.treatmentName}`}
                  </p>
                  {lightboxPhoto.notes && (
                    <p className="text-xs text-on-surface mt-1 italic">
                      "{lightboxPhoto.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownloadImage(lightboxPhoto)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-bright hover:bg-outline-variant/50 text-on-surface text-xs font-bold rounded-lg border border-outline-variant transition-colors"
                  >
                    <Download size={13} /> Descargar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {photoToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-xl border border-outline-variant shadow-2xl p-5 max-w-sm w-full space-y-4"
            >
              <div className="flex items-center gap-3 text-error">
                <div className="p-2.5 bg-error/10 rounded-full">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-on-surface">¿Eliminar fotografía?</h5>
                  <p className="text-[11px] text-on-surface-variant">Esta acción no se puede deshacer.</p>
                </div>
              </div>
              <p className="text-xs text-on-surface-variant">
                Se eliminará la foto <b>"{photoToDelete.title}"</b> del {photoToDelete.date}.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setPhotoToDelete(null)}
                  className="px-3 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeletePhoto}
                  className="px-4 py-1.5 bg-error text-white text-xs font-bold rounded-lg uppercase tracking-wider hover:bg-error/90 transition-colors"
                >
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
