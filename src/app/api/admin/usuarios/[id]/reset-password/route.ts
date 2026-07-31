import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

/**
 * POST /api/admin/usuarios/[id]/reset-password
 *
 * Cambia la contraseña de un usuario. Solo super admin: sin el guard bastaba
 * con conocer el id de la fila para tomar control de cualquier cuenta.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireSuperAdmin(req);
    if (!guard.ok) return guard.response;
    const supabase = guard.supabase;

    const { id } = await params;
    const body = await req.json();
    const { password } = body;

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    const { data: usuario, error: errGet } = await supabase
      .from("usuarios")
      .select("email")
      .eq("id", id)
      .single();

    if (errGet || !usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find((u) => u.email === usuario.email);

    if (!authUser) {
      return NextResponse.json(
        { error: "No se encontró el usuario en Auth. Verifique que el email coincida." },
        { status: 404 }
      );
    }

    const { error: errAuth } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
    });

    if (errAuth) {
      return NextResponse.json({ error: errAuth.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
