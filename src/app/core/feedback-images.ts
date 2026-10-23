import { PreparedImage } from '../services/feedback.service';
import {
  FeedbackImageMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  detectImageMime,
  extensionForImageMime
} from './feedback-core';

/** Lado largo máximo al que se re-codifica una imagen antes de enviarla. */
const MAX_IMAGE_EDGE = 1600;
/** Calidad del re-codificado. */
const IMAGE_QUALITY = 0.8;
/** Se prefiere WebP y se cae a JPEG cuando el navegador no sabe codificarlo. */
const PREFERRED_MIME: FeedbackImageMime = 'image/webp';
const FALLBACK_MIME: FeedbackImageMime = 'image/jpeg';

/** Tipos que el `<input accept>` y la validación de cliente admiten. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp';

/**
 * PREPARACIÓN DE IMÁGENES (lado cliente)
 *
 * Antes de enviar, cada imagen se re-codifica con canvas a 1600 px de lado largo y calidad
 * ~0.8. Eso hace tres cosas de golpe:
 *
 *  1. Reduce el peso, que es el límite que más problemas da en redes móviles.
 *  2. Elimina los metadatos EXIF (coordenadas, modelo de cámara, hora): al re-codificar, el
 *     canvas escribe un archivo nuevo y solo se copia lo que se dibuja, no los metadatos.
 *  3. Normaliza el formato a algo que el servidor acepta siempre.
 *
 * LIMITACIÓN CONOCIDA: si el canvas del WebView no puede decodificar la imagen, se devuelve un
 * error claro y la imagen no se adjunta; no se manda el original sin procesar, porque entonces
 * viajarían los EXIF.
 */

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('La imagen no se pudo abrir.'));
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('La imagen no se pudo recomprimir.'))),
      type,
      quality
    );
  });
}

/** Genera un nombre local sin información del archivo original (el servidor pone el suyo). */
function neutralName(index: number, mime: FeedbackImageMime): string {
  const sello = `${Date.now().toString(36)}${index.toString(36)}`;
  return `imagen-${sello}.${extensionForImageMime(mime)}`;
}

/**
 * Re-codifica una imagen. Si el resultado no cabe en el límite, NO se recorta ni se degrada más:
 * se rechaza con un mensaje, porque una imagen ilegible no sirve para reproducir un error.
 */
export async function prepareImage(file: File, index: number): Promise<PreparedImage> {
  // Se mira el tipo declarado solo para rechazar temprano con un mensaje claro; la
  // comprobación que decide es la de los magic bytes, en el servidor.
  if (file.type && !/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error('Solo se pueden adjuntar imágenes PNG, JPEG o WebP.');
  }

  const dataUrl = await readAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const escala = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const ancho = Math.max(1, Math.round(image.naturalWidth * escala));
  const alto = Math.max(1, Math.round(image.naturalHeight * escala));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen en este dispositivo.');
  ctx.drawImage(image, 0, 0, ancho, alto);

  // WebP no está en todos los WebView: si falla, se repite con JPEG, que sí lo está.
  let blob: Blob;
  let mime: FeedbackImageMime;
  try {
    blob = await canvasToBlob(canvas, PREFERRED_MIME, IMAGE_QUALITY);
    mime = PREFERRED_MIME;
  } catch {
    blob = await canvasToBlob(canvas, FALLBACK_MIME, IMAGE_QUALITY);
    mime = FALLBACK_MIME;
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Una imagen sigue pesando más de 2 MB incluso tras reducirla. Adjunta otra más pequeña.');
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Comprobación local de coherencia: lo que sale del canvas debe ser del tipo que declaran
  // los bytes. Si no cuadra, se cae al tipo real detectado para no mentirle al servidor.
  const detectado = detectImageMime(bytes) ?? mime;

  return {
    bytes,
    mime: detectado,
    name: neutralName(index, detectado),
    previewUrl: URL.createObjectURL(blob),
    size: bytes.length
  };
}

/** Libera la URL del blob de una miniatura. Sin esto, abrir y cerrar el modal fuga memoria. */
export function releaseImage(image: PreparedImage): void {
  if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
}

/** Texto alternativo de la miniatura, con la posición para que se distingan al navegar con teclado. */
export function imageAlt(index: number, total: number): string {
  return `Imagen adjunta ${index + 1} de ${total}`;
}

/** Comprobación temprana del número de archivos, antes de procesarlos. */
export function canAcceptMore(current: number, incoming: number): boolean {
  return current + incoming <= MAX_IMAGES;
}