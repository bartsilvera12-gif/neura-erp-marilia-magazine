/**
 * Subida de imagenes para las secciones del sitio publico administradas desde
 * el ERP (shop the look, grilla de Instagram, etc).
 *
 * Reusa el bucket publico `categorias-imagenes` con una carpeta por seccion:
 * `{empresa_id}/{carpeta}/{nombre}.{ext}`. El endpoint solo devuelve la URL —
 * guardarla en la fila es responsabilidad de quien llama, asi tambien sirve
 * para altas que todavia no tienen id.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_CATEGORIA_IMAGE_MIME,
  ALLOWED_CATEGORIA_IMAGE_EXT,
  CATEGORIAS_IMAGENES_BUCKET,
  MAX_CATEGORIA_IMAGE_BYTES,
  ensureCategoriasImagenesBucket,
} from "@/lib/inventario/categoria-imagen-storage";

/**
 * Maneja un POST multipart con `file` y, opcional, `nombre` (id de la fila).
 * Sin `nombre` se genera uno unico: la foto se asocia al guardar.
 */
export async function subirImagenSitio(
  request: NextRequest,
  carpeta: string
): Promise<NextResponse> {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_CATEGORIA_IMAGE_MIME.has(file.type)) {
      return NextResponse.json(errorResponse("Formato no permitido. Usá JPG, PNG o WebP."), { status: 400 });
    }
    if (file.size > MAX_CATEGORIA_IMAGE_BYTES) {
      const mb = (MAX_CATEGORIA_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(errorResponse(`Archivo demasiado grande (máx. ${mb} MB).`), { status: 413 });
    }

    try {
      await ensureCategoriasImagenesBucket(supabase);
    } catch (bucketErr) {
      console.error(`[sitio-admin/${carpeta}/imagen] ensureBucket`, bucketErr instanceof Error ? bucketErr.message : bucketErr);
    }

    const ext = ALLOWED_CATEGORIA_IMAGE_EXT[file.type] ?? "bin";
    // Sanitizado: el nombre viene del cliente y termina en un path de storage.
    const nombreRaw = String(form.get("nombre") ?? "").trim();
    const nombre = /^[a-zA-Z0-9_-]{1,64}$/.test(nombreRaw) ? nombreRaw : `n-${Date.now()}`;
    const path = `${auth.empresa_id}/${carpeta}/${nombre}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(CATEGORIAS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error(`[sitio-admin/${carpeta}/imagen] upload`, up.error.message);
      return NextResponse.json(errorResponse(`No se pudo subir la imagen: ${up.error.message}`), { status: 500 });
    }

    const { data: pub } = supabase.storage.from(CATEGORIAS_IMAGENES_BUCKET).getPublicUrl(path);
    // Cache-bust: mismo path = misma URL publica al reemplazar la foto.
    return NextResponse.json(successResponse({ imagen_url: `${pub.publicUrl}?t=${Date.now()}` }));
  } catch (err) {
    console.error(`[sitio-admin/${carpeta}/imagen POST]`, err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir la imagen."), { status: 500 });
  }
}
