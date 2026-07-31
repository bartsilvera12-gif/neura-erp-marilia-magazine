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
 * POST /api/sitio-admin/shop-the-look/imagen
 *
 * Sube la foto principal de un look al bucket publico y devuelve su URL, sin
 * tocar la fila: el modal la guarda despues junto con el resto del look (asi
 * tambien funciona al crear uno nuevo, que todavia no tiene id).
 *
 * Form: { file: File, look_id?: string }
 * Reusa el bucket `categorias-imagenes` bajo la carpeta `looks/`.
 */
export async function POST(request: NextRequest) {
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
      console.error("[shop-the-look/imagen] ensureBucket", bucketErr instanceof Error ? bucketErr.message : bucketErr);
    }

    const ext = ALLOWED_CATEGORIA_IMAGE_EXT[file.type] ?? "bin";
    // El look puede no existir todavia (alta): en ese caso usamos un nombre
    // unico por timestamp y la foto queda asociada al guardar el look.
    const lookId = String(form.get("look_id") ?? "").trim() || `nuevo-${Date.now()}`;
    const path = `${auth.empresa_id}/looks/${lookId}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(CATEGORIAS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error("[shop-the-look/imagen] upload", up.error.message);
      return NextResponse.json(errorResponse(`No se pudo subir la imagen: ${up.error.message}`), { status: 500 });
    }

    const { data: pub } = supabase.storage.from(CATEGORIAS_IMAGENES_BUCKET).getPublicUrl(path);
    // Cache-bust: mismo path = misma URL publica al reemplazar la foto.
    return NextResponse.json(successResponse({ imagen_url: `${pub.publicUrl}?t=${Date.now()}` }));
  } catch (err) {
    console.error("[shop-the-look/imagen POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir la imagen."), { status: 500 });
  }
}
