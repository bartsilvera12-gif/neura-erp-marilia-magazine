/**
 * Storage helpers para logos de marca.
 *
 * Los logos son PÚBLICOS: se muestran en la barra del sitio y no tiene sentido
 * firmar cada request. Se guardan en un bucket público separado del de
 * productos para que el aislamiento por tenant siga en el path
 * `{empresa_id}/{marca_id}.{ext}`.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const MARCAS_LOGOS_BUCKET = "marcas-logos";

export const ALLOWED_LOGO_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/svg+xml",
]);
export const ALLOWED_LOGO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB (más que suficiente para un logo)

let bucketEnsured = false;

export async function ensureMarcasLogosBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data } = await supabase.storage.getBucket(MARCAS_LOGOS_BUCKET);
    if (data) { bucketEnsured = true; return; }
  } catch {
    // fallthrough
  }
  const { error } = await supabase.storage.createBucket(MARCAS_LOGOS_BUCKET, {
    public: true,
    fileSizeLimit: MAX_LOGO_BYTES,
    allowedMimeTypes: [...ALLOWED_LOGO_MIME],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error("No se pudo crear el bucket de logos: " + error.message);
  }
  bucketEnsured = true;
}

export function buildLogoPath(empresaId: string, marcaId: string, mime: string): string {
  const ext = ALLOWED_LOGO_EXT[mime] ?? "bin";
  return `${empresaId}/${marcaId}.${ext}`;
}
