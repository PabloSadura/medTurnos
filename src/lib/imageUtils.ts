/**
 * Utility functions for client-side image processing, compression, and formatting.
 */

export interface CompressedImageResult {
  dataUrl: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.85
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (readerEvent) => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;

        // Calculate proportional scale
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo obtener el contexto 2D del canvas.'));
          return;
        }

        // Smooth scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to dataUrl (JPEG for optimal size & compatibility)
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Convert canvas to Blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Fallo al convertir el canvas a Blob.'));
              return;
            }
            resolve({
              dataUrl,
              blob,
              originalSize: file.size,
              compressedSize: blob.size,
              width,
              height,
            });
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        reject(new Error('No se pudo decodificar el archivo de imagen.'));
      };

      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo seleccionado.'));
    };

    reader.readAsDataURL(file);
  });
}
