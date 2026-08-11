import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getInventarioReporte, type EstadoInventario } from "@/lib/reportes/server/inventario-pg";

const ESTADOS: EstadoInventario[] = ["sin_stock", "stock_bajo", "normal"];

/** GET /api/reportes/inventario?q=&categoria=&estado=&page=&pageSize= */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const sp = new URL(request.url).searchParams;
    const estadoRaw = sp.get("estado") as EstadoInventario | null;
    const categoriaId = (sp.get("categoria") ?? "").trim();
    if (categoriaId && !/^[0-9a-f-]{36}$/i.test(categoriaId)) {
      return NextResponse.json(errorResponse("Categoría inválida."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const data = await getInventarioReporte(schema, ctx.auth.empresa_id, {
      q: (sp.get("q") ?? "").trim(),
      categoriaId,
      estado: estadoRaw && ESTADOS.includes(estadoRaw) ? estadoRaw : "",
      page: Math.max(1, Number(sp.get("page") ?? 1) || 1),
      pageSize: Number(sp.get("pageSize") ?? 25) || 25,
    });

    return NextResponse.json(successResponse(data));
  } catch (err) {
    console.error("[/api/reportes/inventario]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el reporte de inventario."), { status: 500 });
  }
}
