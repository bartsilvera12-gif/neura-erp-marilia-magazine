/**
 * Guard para rutas de API que operan con la service role key.
 *
 * La service role se saltea RLS, asi que una ruta que la usa sin verificar
 * quien llama queda abierta a internet. Este helper centraliza el chequeo que
 * ya hacian a mano `admin/modulos` y `admin/dashboard-views`, para que agregar
 * una ruta nueva no dependa de acordarse de copiarlo.
 *
 * Uso:
 *   const guard = await requireSuperAdmin(request);
 *   if (!guard.ok) return guard.response;
 *   const supabase = guard.supabase;   // service role, ya autorizada
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseServiceRoleClientOptions } from "@/lib/supabase/schema";
import { getAuthUserForApiRoute } from "@/lib/auth/get-auth-user-for-api-route";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/super-admin-bootstrap-email";

/**
 * Cliente service role con las opciones del repo. Los genericos de
 * SupabaseClient cambian segun la version y las opciones, asi que el tipo se
 * deriva de la llamada real en vez de escribirse a mano.
 */
function crearServiceRoleClient(url: string, key: string) {
  return createClient(url, key, { ...supabaseServiceRoleClientOptions });
}
export type ServiceRoleClient = ReturnType<typeof crearServiceRoleClient>;

type Resultado =
  | { ok: true; supabase: ServiceRoleClient; userId: string; email: string | null }
  | { ok: false; response: NextResponse };

export async function requireSuperAdmin(request: Request): Promise<Resultado> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !key) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Config no disponible" }, { status: 500 }),
    };
  }

  const user = await getAuthUserForApiRoute(request);
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const supabase = crearServiceRoleClient(url, key);
  const usuario = await resolveUsuarioErpFromAuthUser(supabase, user);
  const rolSuper = (usuario?.rol ?? "").trim() === "super_admin";
  const bootstrapSuper = isBootstrapSuperAdminEmail(user.email);
  if (!rolSuper && !bootstrapSuper) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    };
  }

  return { ok: true, supabase, userId: user.id, email: user.email ?? null };
}
