import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const SELECT = "id, slug, nombre, descripcion, logo_url, match_tokens, coincide_con_todo, activo, orden";

function slugFrom(input: string): string {
  return input.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function normalizarTokens(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const x of raw) {
    const t = String(x ?? "").trim().toUpperCase();
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    out.push(t);
  }
  return out;
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (body.nombre !== undefined) {
      const n = String(body.nombre ?? "").trim();
      if (!n) return NextResponse.json(errorResponse("El nombre no puede quedar vacío."), { status: 400 });
      patch.nombre = n;
    }
    if (body.slug !== undefined) {
      const s = slugFrom(String(body.slug ?? ""));
      if (!s) return NextResponse.json(errorResponse("El slug no puede quedar vacío."), { status: 400 });
      patch.slug = s;
    }
    if (body.descripcion !== undefined) {
      const v = body.descripcion == null ? "" : String(body.descripcion).trim();
      patch.descripcion = v || null;
    }
    if (body.logo_url !== undefined) {
      const v = body.logo_url == null ? "" : String(body.logo_url).trim();
      patch.logo_url = v || null;
    }
    if (body.coincide_con_todo !== undefined) {
      patch.coincide_con_todo = body.coincide_con_todo === true;
    }
    if (body.match_tokens !== undefined) {
      patch.match_tokens = normalizarTokens(body.match_tokens);
    }
    if (body.activo !== undefined) patch.activo = body.activo === true;
    if (body.orden !== undefined && Number.isFinite(body.orden)) {
      patch.orden = Number(body.orden);
    }
    patch.updated_at = new Date().toISOString();

    // Coherencia: si es "cubre todo" no tiene sentido guardar tokens de match.
    if (patch.coincide_con_todo === true) patch.match_tokens = [];

    const { data, error } = await ctx.supabase
      .from("marcas")
      .update(patch)
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .select(SELECT)
      .maybeSingle();

    if (error) {
      if (/duplicate|marcas_slug_empresa_unica/i.test(error.message)) {
        return NextResponse.json(errorResponse("Ya existe otra marca con ese slug."), { status: 409 });
      }
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ marca: data }));
  } catch (err) {
    console.error("[/api/marcas/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar la marca."), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { error } = await ctx.supabase
      .from("marcas")
      .delete()
      .eq("id", id)
      .eq("empresa_id", ctx.auth.empresa_id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/marcas/[id] DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar la marca."), { status: 500 });
  }
}
