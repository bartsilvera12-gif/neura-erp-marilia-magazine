import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listColores, listTallas } from "@/lib/inventario/server/prendas-pg";

/**
 * GET /api/inventario/prendas/catalogos
 * Catalogos de variante (colores + tallas) para el alta de prendas de ropa.
 * (Categorias / ubicaciones / proveedores se cargan desde sus endpoints existentes.)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const [colores, tallas] = await Promise.all([
      listColores(schema, empresaId),
      listTallas(schema, empresaId),
    ]);
    return NextResponse.json(successResponse({ colores, tallas }));
  } catch (err) {
    console.error("[/api/inventario/prendas/catalogos]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los catálogos de prenda."), { status: 500 });
  }
}
