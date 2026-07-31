import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** PATCH /api/gastos/[id] — actualiza solo los campos enviados. */
export async function PATCH(request: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { id } = await ctxRoute.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (body.categoria !== undefined) patch.categoria = str(body.categoria);
    if (body.descripcion !== undefined) patch.descripcion = str(body.descripcion);
    if (body.monto !== undefined) {
      const monto = Number(body.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
      }
      patch.monto = monto;
    }
    if (body.tipo !== undefined) patch.tipo = body.tipo === "fijo" ? "fijo" : "variable";
    if (body.recurrente !== undefined) patch.recurrente = body.recurrente === true;
    if (body.frecuencia !== undefined) patch.frecuencia = str(body.frecuencia);
    if (body.fecha !== undefined) patch.fecha = str(body.fecha);

    const { data, error } = await supabase
      .from("gastos")
      .update(patch)
      .eq("id", id)
      .eq("empresa_id", auth.empresa_id)
      .select()
      .single();

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** DELETE /api/gastos/[id] */
export async function DELETE(request: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { id } = await ctxRoute.params;
    const { error } = await supabase
      .from("gastos")
      .delete()
      .eq("id", id)
      .eq("empresa_id", auth.empresa_id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
