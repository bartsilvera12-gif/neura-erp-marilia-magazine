import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { handleSifenXmlPost } from "@/lib/sifen/handle-sifen-xml-post";

/**
 * POST /api/facturas/[id]/sifen/xml
 * Genera XML rDE oficial (SIFEN v150, factura electrónica), lo sube a Storage y actualiza factura_electronica (sin firma ni SET).
 *
 * Wrapper thin: resuelve auth + cliente Supabase y delega en el handler
 * compartido, que también usa el worker de la cola `sifen_jobs`.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getFacturasSupabaseFromAuth(request);
  if (!auth) {
    return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  }
  try {
    return await handleSifenXmlPost(request, ctx.params, auth.auth, auth.supabase);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
