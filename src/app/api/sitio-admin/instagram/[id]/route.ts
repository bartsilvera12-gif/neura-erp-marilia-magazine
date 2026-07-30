import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export async function PATCH(request: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { id } = await ctxRoute.params;
    const body = await request.json();

    const patch: Record<string, unknown> = {};
    if (typeof body?.imagen_url === "string") patch.imagen_url = body.imagen_url.trim();
    if (body?.link !== undefined) patch.link = body.link ? String(body.link) : null;
    if (body?.orden !== undefined) patch.orden = Number(body.orden);
    if (typeof body?.activo === "boolean") patch.activo = body.activo;

    if (Object.keys(patch).length === 0) return NextResponse.json(successResponse({ id }));
    const { error } = await supabase
      .from("sitio_instagram_posts")
      .update(patch)
      .eq("id", id)
      .eq("empresa_id", auth.empresa_id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/sitio-admin/instagram/id] PATCH", err);
    return NextResponse.json(errorResponse("Error al actualizar post"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { id } = await ctxRoute.params;
    const { error } = await supabase
      .from("sitio_instagram_posts")
      .delete()
      .eq("id", id)
      .eq("empresa_id", auth.empresa_id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/sitio-admin/instagram/id] DELETE", err);
    return NextResponse.json(errorResponse("Error al eliminar post"), { status: 500 });
  }
}
