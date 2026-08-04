import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { applyTokenSearch } from "@/lib/productos/token-search";

const GENEROS = ["mujer", "hombre", "unisex"] as const;

/**
 * POST /api/inventario/productos/genero-masivo
 *
 * Asigna el género a TODOS los productos que matchean el filtro actual del
 * listado (categoría + búsqueda + sin clasificar), no solo a los de la página.
 *
 * Es la única forma razonable de clasificar un catálogo de 24.000 variantes:
 * el operador filtra por CAMISETA y marca las 1.884 de una sola vez.
 *
 * Body: { genero: "mujer"|"hombre"|"unisex"|null, categoria?, q?, soloSinClasificar? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const generoRaw = body.genero == null ? null : String(body.genero).toLowerCase();
    if (generoRaw !== null && !GENEROS.includes(generoRaw as (typeof GENEROS)[number])) {
      return NextResponse.json(errorResponse("Género inválido."), { status: 400 });
    }

    const categoria = body.categoria ? String(body.categoria) : "";
    const q = body.q ? String(body.q).trim() : "";
    const soloSinClasificar = body.soloSinClasificar === true;

    // Sin ningún filtro, esto pisaría el catálogo entero de un click.
    if (!categoria && !q && !soloSinClasificar) {
      return NextResponse.json(
        errorResponse("Elegí al menos un filtro antes de asignar en masa."),
        { status: 400 }
      );
    }

    let query = ctx.supabase
      .from("productos")
      .update({ genero: generoRaw })
      .eq("empresa_id", empresaId)
      .eq("activo", true);

    if (categoria === "__sin__") query = query.is("categoria_principal_id", null);
    else if (categoria) query = query.eq("categoria_principal_id", categoria);
    if (soloSinClasificar) query = query.is("genero", null);
    if (q) query = applyTokenSearch(query, q, ["nombre", "sku", "codigo_proveedor", "codigo_barras"]);

    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ actualizados: (data ?? []).length }));
  } catch (err) {
    console.error("[/api/inventario/productos/genero-masivo]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo asignar el género."), { status: 500 });
  }
}
