import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * Marcas del catálogo. Se leen desde el sitio público (anon) y desde el ERP
 * (autenticado). El POST solo lo puede hacer un usuario del tenant.
 */

const SELECT = "id, slug, nombre, descripcion, logo_url, match_tokens, coincide_con_todo, activo, orden";

/**
 * Slug estable: minúsculas, sin diacríticos, sin caracteres raros.
 * Es lo que el sitio usa en la URL (?marca=<slug>) y como identificador visual.
 */
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

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const todas = new URL(request.url).searchParams.get("todas") === "1";
    let q = ctx.supabase
      .from("marcas")
      .select(SELECT)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true });
    if (!todas) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ marcas: data ?? [] }));
  } catch (err) {
    console.error("[/api/marcas GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las marcas."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });

    const slugRaw = String(body.slug ?? "").trim();
    const slug = slugRaw ? slugFrom(slugRaw) : slugFrom(nombre);
    if (!slug) return NextResponse.json(errorResponse("El slug no puede quedar vacío."), { status: 400 });

    const coincideConTodo = body.coincide_con_todo === true;
    const matchTokens = coincideConTodo ? [] : normalizarTokens(body.match_tokens);

    const { data, error } = await ctx.supabase
      .from("marcas")
      .insert({
        empresa_id: empresaId,
        slug,
        nombre,
        descripcion: (body.descripcion == null ? null : String(body.descripcion).trim() || null),
        logo_url: (body.logo_url == null ? null : String(body.logo_url).trim() || null),
        match_tokens: matchTokens,
        coincide_con_todo: coincideConTodo,
        activo: body.activo === false ? false : true,
        orden: Number.isFinite(body.orden) ? Number(body.orden) : 0,
      })
      .select(SELECT)
      .maybeSingle();

    if (error) {
      if (/duplicate|marcas_slug_empresa_unica/i.test(error.message)) {
        return NextResponse.json(errorResponse(`Ya existe una marca con el slug "${slug}".`), { status: 409 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json(successResponse({ marca: data }));
  } catch (err) {
    console.error("[/api/marcas POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo crear la marca."), { status: 500 });
  }
}
