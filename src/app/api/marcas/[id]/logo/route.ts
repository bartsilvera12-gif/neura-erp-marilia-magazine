import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_LOGO_MIME,
  MAX_LOGO_BYTES,
  MARCAS_LOGOS_BUCKET,
  buildLogoPath,
  ensureMarcasLogosBucket,
} from "@/lib/marcas/logo-storage";

/**
 * POST /api/marcas/[id]/logo — sube el logo desde la máquina, lo guarda en
 * el bucket público y devuelve `logo_url` para persistir en la fila.
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: marcaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    // Ownership: la marca tiene que existir y ser del tenant.
    const { data: marca, error: errMarca } = await supabase
      .from("marcas")
      .select("id")
      .eq("id", marcaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (errMarca) throw new Error(errMarca.message);
    if (!marca) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_LOGO_MIME.has(file.type)) {
      return NextResponse.json(
        errorResponse("Formato no permitido. Usá PNG, JPG, WebP o SVG."),
        { status: 400 }
      );
    }
    if (file.size > MAX_LOGO_BYTES) {
      const mb = (MAX_LOGO_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(
        errorResponse(`Logo demasiado grande (máx. ${mb} MB).`),
        { status: 413 }
      );
    }

    try { await ensureMarcasLogosBucket(supabase); }
    catch (e) {
      console.error("[marcas logo] ensureBucket", e instanceof Error ? e.message : e);
    }

    const path = buildLogoPath(empresaId, marcaId, file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(MARCAS_LOGOS_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error("[marcas logo] upload", up.error.message);
      return NextResponse.json(errorResponse("No se pudo subir el logo: " + up.error.message), { status: 500 });
    }

    // URL pública + cache-buster para que se refresque al vuelo en el ERP.
    const { data: pub } = supabase.storage.from(MARCAS_LOGOS_BUCKET).getPublicUrl(path);
    const logoUrl = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;

    const { error: updErr } = await supabase
      .from("marcas")
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq("id", marcaId)
      .eq("empresa_id", empresaId);
    if (updErr) throw new Error(updErr.message);

    return NextResponse.json(successResponse({ logo_url: logoUrl }));
  } catch (err) {
    console.error("[/api/marcas/[id]/logo POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir el logo."), { status: 500 });
  }
}

/** DELETE — borra el archivo y limpia `logo_url` en la fila. */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: marcaId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    // Se prueban las cuatro extensiones porque el bucket no lista rápido.
    const exts = ["png", "jpg", "webp", "svg"];
    await supabase.storage.from(MARCAS_LOGOS_BUCKET).remove(
      exts.map((ext) => `${auth.empresa_id}/${marcaId}.${ext}`)
    );

    await supabase
      .from("marcas")
      .update({ logo_url: null, updated_at: new Date().toISOString() })
      .eq("id", marcaId)
      .eq("empresa_id", auth.empresa_id);

    return NextResponse.json(successResponse({ logo_url: null }));
  } catch (err) {
    console.error("[/api/marcas/[id]/logo DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo quitar el logo."), { status: 500 });
  }
}
