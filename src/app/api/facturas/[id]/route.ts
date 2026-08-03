import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";


/**
 * GET /api/facturas/[id]
 * Factura de la empresa autenticada + texto corto del cliente (para UI).
 *
 * Usa el helper de facturación (PG shim para tenants `erp_*` no expuestos en PostgREST,
 * service role estándar para `zentra_erp` y legacy). Antes usaba `getTenantSupabaseFromAuth`,
 * que devolvía `PGRST106 Invalid schema` para schemas `erp_*`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const { id } = await params;
    const fid = id?.trim();
    if (!fid) {
      return NextResponse.json(errorResponse("id de factura es obligatorio"), { status: 400 });
    }


    const { data: factura, error: errF } = await supabase
      .from("facturas")
      .select("*")
      .eq("id", fid)
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();

    if (errF) {
      return NextResponse.json(errorResponse(errF.message), { status: 400 });
    }
    if (!factura) {
      return NextResponse.json(errorResponse("Factura no encontrada"), { status: 404 });
    }

    // Venta ocasional: sin ficha, el nombre sale del receptor guardado en la
    // factura. Filtrar por un uuid nulo lo manda como el texto "null" y falla.
    const row = factura as { cliente_id: string | null; cliente_razon_social?: string | null };
    const clienteId = typeof row.cliente_id === "string" && row.cliente_id.trim() ? row.cliente_id.trim() : null;
    const { data: cli } = clienteId
      ? await supabase
          .from("clientes")
          .select("nombre_contacto, empresa, nombre_facturacion")
          .eq("id", clienteId)
          .maybeSingle()
      : { data: null };

    const c = cli as { nombre_contacto?: string; empresa?: string; nombre_facturacion?: string } | null;
    const facturacion = (c?.nombre_facturacion ?? "").trim();
    const empresa = (c?.empresa ?? "").trim();
    const nombre = (c?.nombre_contacto ?? "").trim();
    const ocasional = (row.cliente_razon_social ?? "").trim();
    const cliente_display = facturacion || empresa || nombre || ocasional || "Cliente";

    return NextResponse.json(
      successResponse({
        ...factura,
        cliente_display,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
