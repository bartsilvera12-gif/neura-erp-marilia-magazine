/**
 * Storage helpers para el video de presentación del sitio.
 *
 * Bucket: `sitio-videos` (PÚBLICO — se sirve directo en el home del sitio, por
 * eso no usamos signed URLs). Guarda el video y, opcionalmente, un poster
 * (imagen que se ve mientras el video carga). Aislado por tenant en el path
 * `{empresa_id}/presentacion.{ext}`.
 *
 * El límite de tamaño es alto a propósito: la clienta sube el video tal cual
 * salió del teléfono (decenas de MB). La optimización de carga se resuelve en
 * el reproductor del sitio (preload=metadata, lazy, poster), no recomprimiendo.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const SITIO_VIDEOS_BUCKET = "sitio-videos";

// MIME de video aceptados para la subida.
export const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
export const ALLOWED_VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// MIME de imagen aceptados para el poster (opcional).
export const ALLOWED_POSTER_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const ALLOWED_POSTER_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// 250 MB: la clienta sube el video tal cual (recomendado comprimir antes). El
// bucket rechaza lo que exceda; el endpoint valida antes con un mensaje amigable.
// OJO: si se sube este tope, hay que acompañarlo en next.config.ts
// (experimental.middlewareClientMaxBodySize) y en la config de Supabase/proxy.
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;

let bucketEnsured = false;

export async function ensureSitioVideosBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  const opts = {
    public: true,
    fileSizeLimit: MAX_VIDEO_BYTES,
    allowedMimeTypes: [...ALLOWED_VIDEO_MIME, ...ALLOWED_POSTER_MIME],
  };
  try {
    const { data } = await supabase.storage.getBucket(SITIO_VIDEOS_BUCKET);
    if (data) {
      // El bucket ya existe: hay que ACTUALIZAR su fileSizeLimit, porque
      // createBucket no se vuelve a llamar y el bucket conserva el límite viejo.
      await supabase.storage.updateBucket(SITIO_VIDEOS_BUCKET, opts);
      bucketEnsured = true;
      return;
    }
  } catch {
    // fallthrough — intentar crear
  }
  const { error } = await supabase.storage.createBucket(SITIO_VIDEOS_BUCKET, opts);
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error("No se pudo crear el bucket de videos: " + error.message);
  }
  bucketEnsured = true;
}

export function buildVideoPath(empresaId: string, mime: string): string {
  const ext = ALLOWED_VIDEO_EXT[mime] ?? "bin";
  return `${empresaId}/presentacion.${ext}`;
}

export function buildPosterPath(empresaId: string, mime: string): string {
  const ext = ALLOWED_POSTER_EXT[mime] ?? "bin";
  return `${empresaId}/presentacion-poster.${ext}`;
}

/** Rutas candidatas a borrar (todas las extensiones) al quitar el video/poster. */
export function allVideoPaths(empresaId: string): string[] {
  return Object.values(ALLOWED_VIDEO_EXT).map((ext) => `${empresaId}/presentacion.${ext}`);
}
export function allPosterPaths(empresaId: string): string[] {
  return Object.values(ALLOWED_POSTER_EXT).map((ext) => `${empresaId}/presentacion-poster.${ext}`);
}
