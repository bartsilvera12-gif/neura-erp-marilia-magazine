import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** PATCH: actualiza campos del look y reemplaza items si se envían. */
export async function PATCH(request: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { id } = await ctxRoute.params;
    const body = await request.json();

    const patch: Record<string, unknown> = {};
    if (typeof body?.titulo === "string") patch.titulo = body.titulo.trim();
    if (body?.subtitulo !== undefined) patch.subtitulo = body.subtitulo ? String(body.subtitulo) : null;
    if (body?.imagen_url !== undefined) patch.imagen_url = body.imagen_url ? String(body.imagen_url) : null;
    if (body?.orden !== undefined) patch.orden = Number(body.orden);
    if (typeof body?.activo === "boolean") patch.activo = body.activo;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from("sitio_shop_the_look")
        .update(patch)
        .eq("id", id)
        .eq("empresa_id", auth.empresa_id);
      if (error) throw new Error(error.message);
    }

    if (Array.isArray(body?.items)) {
      await supabase.from("sitio_shop_the_look_items").delete().eq("look_id", id);
      if (body.items.length > 0) {
        const rows = body.items.map((it: { producto_id: string; orden?: number; etiqueta?: string }, idx: number) => ({
          look_id: id,
          producto_id: String(it.producto_id),
          orden: Number(it.orden ?? idx),
          etiqueta: it.etiqueta ? String(it.etiqueta) : null,
        }));
        const { error: e2 } = await supabase.from("sitio_shop_the_look_items").insert(rows);
        if (e2) throw new Error(e2.message);
      }
    }

    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/sitio-admin/shop-the-look/id] PATCH", err);
    return NextResponse.json(errorResponse("Error al actualizar look"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { id } = await ctxRoute.params;
    const { error } = await supabase
      .from("sitio_shop_the_look")
      .delete()
      .eq("id", id)
      .eq("empresa_id", auth.empresa_id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/sitio-admin/shop-the-look/id] DELETE", err);
    return NextResponse.json(errorResponse("Error al eliminar look"), { status: 500 });
  }
}
