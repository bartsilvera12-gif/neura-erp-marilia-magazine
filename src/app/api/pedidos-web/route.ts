import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * Pedidos de la tienda web.
 *
 * Los datos salen de la vista `v_web_pedidos`, que arma la tienda online. Esa
 * vista existe solo en los tenants que tienen tienda; en el resto, la consulta
 * falla y se devuelve una lista vacía con `sin_tienda: true` en vez de un error,
 * para que el módulo no reviente si alguien lo abre sin tenerla configurada.
 */

/**
 * Distingue "este tenant no tiene tienda" de "algo se rompió".
 *
 * Solo el código 42P01 (la relación no existe) y el PGRST205 (PostgREST no la
 * encuentra en su caché) significan que no hay tienda. Cualquier otro fallo
 * —permisos, conexión, RLS— es un problema que hay que mostrar, no esconder
 * detrás de un cartel de "no configurado".
 */
function esSinTienda(err: { code?: string; message?: string }): boolean {
  const codigo = String(err?.code ?? "").toUpperCase();
  if (codigo === "42P01" || codigo === "PGRST205") return true;

  const m = String(err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table");
}

const ESTADOS_ENVIO = new Set([
  "pendiente",
  "preparando",
  "enviado",
  "entregado",
  "cancelado",
]);

/**
 * GET /api/pedidos-web
 *
 * Query:
 *   estado_envio  filtra por estado de entrega
 *   solo_pagados  "0" para ver también los no pagados (por defecto solo pagados)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase } = ctx;

    const { searchParams } = new URL(request.url);
    const estadoEnvio = searchParams.get("estado_envio");
    const soloPagados = searchParams.get("solo_pagados") !== "0";

    let query = supabase
      .from("v_web_pedidos")
      .select("*")
      .order("fecha_pedido", { ascending: false })
      .limit(300);

    // Lo que interesa despachar es lo que ya se cobró. Los pendientes son
    // carritos que quedaron a mitad de camino.
    if (soloPagados) query = query.eq("estado_pago", "pagado");
    if (estadoEnvio && ESTADOS_ENVIO.has(estadoEnvio)) {
      query = query.eq("estado_envio", estadoEnvio);
    }

    const { data, error } = await query;

    if (error) {
      if (esSinTienda(error)) {
        return NextResponse.json(successResponse({ pedidos: [], sin_tienda: true }));
      }
      // El error se devuelve tal cual. Esconderlo detrás de un cartel genérico
      // hace imposible saber si falta un permiso, una tabla o la conexión.
      console.error(
        "[api/pedidos-web] GET:",
        error.code,
        error.message,
        error.details,
        error.hint
      );
      const detalle = [error.message, error.hint].filter(Boolean).join(" — ");
      return NextResponse.json(errorResponse(detalle || "Error al consultar."), {
        status: 400,
      });
    }

    return NextResponse.json(successResponse({ pedidos: data ?? [], sin_tienda: false }));
  } catch (err) {
    console.error("[api/pedidos-web] GET:", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron traer los pedidos."), { status: 500 });
  }
}

/**
 * PATCH /api/pedidos-web — cambia el estado de entrega.
 * Body: { id, estado_envio, nota? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase } = ctx;

    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const estado = typeof body?.estado_envio === "string" ? body.estado_envio.trim() : "";
    const nota = typeof body?.nota === "string" ? body.nota.trim() : null;

    if (!id) {
      return NextResponse.json(errorResponse("Falta el pedido."), { status: 400 });
    }
    if (!ESTADOS_ENVIO.has(estado)) {
      return NextResponse.json(errorResponse(`Estado no válido: ${estado}`), { status: 400 });
    }

    // La función guarda además la fecha del cambio, para poder reconstruir
    // después cuánto tardó cada pedido.
    const { data, error } = await supabase.rpc("web_marcar_envio", {
      p_pedido: id,
      p_estado: estado,
      p_nota: nota,
    });

    if (error) {
      console.error("[api/pedidos-web] PATCH:", error.message);
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    const r = data as { ok?: boolean; error?: string } | null;
    if (r && r.ok === false) {
      return NextResponse.json(errorResponse(r.error ?? "No se pudo actualizar."), { status: 400 });
    }

    return NextResponse.json(successResponse({ id, estado_envio: estado }));
  } catch (err) {
    console.error("[api/pedidos-web] PATCH:", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar el pedido."), { status: 500 });
  }
}
