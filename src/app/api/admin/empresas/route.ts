import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

/** GET /api/admin/empresas — listado completo de empresas. Solo super admin. */
export async function GET(request: Request) {
  try {
    const guard = await requireSuperAdmin(request);
    if (!guard.ok) return guard.response;

    const { data, error } = await guard.supabase
      .from("empresas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
