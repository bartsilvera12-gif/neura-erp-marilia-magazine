import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("sitio_instagram_posts")
      .select("id, imagen_url, link, orden, activo, created_at")
      .eq("empresa_id", auth.empresa_id)
      .order("orden");
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ posts: data ?? [] }));
  } catch (err) {
    console.error("[/api/sitio-admin/instagram] GET", err);
    return NextResponse.json(errorResponse("Error al listar posts"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = await request.json();
    const imagen_url = String(body?.imagen_url ?? "").trim();
    if (!imagen_url) return NextResponse.json(errorResponse("imagen_url requerido"), { status: 400 });

    const { data, error } = await supabase
      .from("sitio_instagram_posts")
      .insert({
        empresa_id: auth.empresa_id,
        imagen_url,
        link: body?.link ? String(body.link) : null,
        orden: Number(body?.orden ?? 0),
        activo: body?.activo !== false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/sitio-admin/instagram] POST", err);
    return NextResponse.json(errorResponse("Error al crear post"), { status: 500 });
  }
}
