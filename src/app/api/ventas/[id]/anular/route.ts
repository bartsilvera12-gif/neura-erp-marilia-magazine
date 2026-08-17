import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { anularVenta, AnulacionBloqueadaError } from "@/lib/ventas/server/anular-venta-pg";

/**
 * POST /api/ventas/[id]/anular
 * Anula una venta NO fiscal (sin factura electronica SIFEN aprobada). Reingresa
 * el stock, borra la CxC si es credito sin cobros, y marca la venta como
 * `anulada` para auditoria. No borra la venta ni los items.
 */
export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const auth = await getUserAndEmpresa(request);
    if (!auth?.empresa_id) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { motivo?: string };
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const result = await anularVenta(
      schema,
      auth.empresa_id,
      { id: auth.usuarioCatalogId ?? null, nombre: auth.nombre ?? auth.user?.email ?? null },
      id,
      typeof body.motivo === "string" ? body.motivo.slice(0, 500) : null
    );
    return NextResponse.json(successResponse(result));
  } catch (err) {
    if (err instanceof AnulacionBloqueadaError) {
      return NextResponse.json(
        { success: false, error: err.message, motivo: err.motivo },
        { status: err.motivo === "venta_no_encontrada" ? 404 : 409 }
      );
    }
    // Errores no esperados (postgres, red, etc.): loguear el detalle real
    // pero mostrarle al operador un mensaje del ERP, no un dump de la DB.
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[/api/ventas/[id]/anular POST]", detalle);
    return NextResponse.json(
      errorResponse("No se pudo anular la venta. El equipo ya recibio el detalle del error; probá de nuevo en unos minutos."),
      { status: 500 }
    );
  }
}
