import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AvatarCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string | null;
  onCropComplete: (croppedDataUrl: string) => void;
}

export function AvatarCropModal({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
}: AvatarCropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset controls when opened with new image
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setError(null);
    }
  }, [isOpen, imageSrc]);

  // Handle image loading
  useEffect(() => {
    if (!imageSrc || !isOpen) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      renderPreview();
    };
    img.onerror = () => {
      setError('No se pudo cargar la imagen seleccionada. Verifique el formato.');
    };
    img.src = imageSrc;
  }, [imageSrc, isOpen]);

  // Re-render preview canvas on changes
  useEffect(() => {
    if (imgRef.current) {
      renderPreview();
    }
  }, [zoom, rotation, pan]);

  const renderPreview = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 320;
    canvas.width = size;
    canvas.height = size;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Save context state
    ctx.save();

    // Center origin
    ctx.translate(size / 2 + pan.x, size / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Calculate dimensions to fill square
    const aspect = img.width / img.height;
    let drawWidth = size;
    let drawHeight = size;

    if (aspect > 1) {
      drawHeight = size;
      drawWidth = size * aspect;
    } else {
      drawWidth = size;
      drawHeight = size / aspect;
    }

    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      onCropComplete(croppedDataUrl);
      onClose();
    } catch (err) {
      console.error('Error generating cropped image:', err);
      setError('Error al procesar el recorte de la imagen.');
    }
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="bg-white rounded-2xl border border-outline-variant shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-modal-title"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
            <div>
              <h3 id="crop-modal-title" className="text-sm font-bold text-on-surface">
                Ajustar y Recortar Foto de Perfil
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Arrastre para encuadrar y use el zoom para un formato cuadrado óptimo.
              </p>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
              aria-label="Cerrar ajuste de foto"
            >
              <X size={18} />
            </button>
          </div>

          {/* Canvas Preview Stage */}
          <div className="p-6 flex flex-col items-center bg-surface-dim select-none">
            {error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            ) : (
              <div className="relative">
                {/* Circular Guide overlay over square canvas */}
                <div
                  className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-2xl overflow-hidden shadow-inner border-2 border-primary/40 cursor-grab active:cursor-grabbing bg-black/10 flex items-center justify-center touch-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-cover"
                    aria-label="Vista previa de recorte de foto"
                  />
                  {/* Subtle circular boundary ring */}
                  <div className="absolute inset-2 rounded-full border border-white/60 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                </div>
                <p className="text-[10px] text-center text-on-surface-variant mt-2 font-medium">
                  El área dentro del círculo es lo que se mostrará en su avatar.
                </p>
              </div>
            )}

            {/* Controls: Zoom & Rotate */}
            <div className="w-full max-w-xs mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <ZoomOut size={16} className="text-on-surface-variant shrink-0" />
                <label htmlFor="crop-zoom-slider" className="sr-only">Nivel de zoom</label>
                <input
                  id="crop-zoom-slider"
                  type="range"
                  min="0.8"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-surface-bright rounded-lg cursor-pointer"
                />
                <ZoomIn size={16} className="text-on-surface-variant shrink-0" />
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="px-3 py-1.5 rounded-lg border border-outline-variant bg-white text-on-surface-variant hover:text-primary text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <RotateCw size={13} />
                  <span>Girar 90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setRotation(0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-outline-variant bg-white text-on-surface-variant hover:text-on-surface text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Restablecer
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-3.5 border-t border-outline-variant bg-white flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface rounded-xl border border-outline-variant hover:bg-surface transition-colors cursor-pointer min-h-[40px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-primary hover:bg-primary/90 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <Check size={14} />
              <span>Aplicar Recorte</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
