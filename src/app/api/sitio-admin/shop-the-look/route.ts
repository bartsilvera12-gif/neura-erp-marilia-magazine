import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** GET: lista todos los looks (con items) de la empresa. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const { data: looks, error } = await supabase
      .from("sitio_shop_the_look")
      .select("id, titulo, subtitulo, imagen_url, orden, activo")
      .eq("empresa_id", auth.empresa_id)
      .order("orden");
    if (error) throw new Error(error.message);

    const ids = (looks ?? []).map((l: { id: string }) => l.id);
    let itemsByLook: Record<string, Array<Record<string, unknown>>> = {};
    if (ids.length > 0) {
      const { data: items, error: e2 } = await supabase
        .from("sitio_shop_the_look_items")
        .select("id, look_id, producto_id, orden, etiqueta")
        .in("look_id", ids)
        .order("orden");
      if (e2) throw new Error(e2.message);

      const prodIds = [...new Set((items ?? []).map((i: { producto_id: string }) => i.producto_id))];
      const { data: prods } = prodIds.length > 0
        ? await supabase.from("productos").select("id, nombre, precio_venta, imagen_url, imagen_path").in("id", prodIds)
        : { data: [] };
      const prodMap = new Map((prods ?? []).map((p: { id: string }) => [p.id, p]));

      itemsByLook = {};
      for (const it of items ?? []) {
        const item = it as { id: string; look_id: string; producto_id: string; orden: number; etiqueta: string | null };
        if (!itemsByLook[item.look_id]) itemsByLook[item.look_id] = [];
        const prod = prodMap.get(item.producto_id) as Record<string, unknown> | undefined;
        itemsByLook[item.look_id].push({ ...item, producto: prod ?? null });
      }
    }

    return NextResponse.json(successResponse({
      looks: (looks ?? []).map((l) => ({ ...l, items: itemsByLook[(l as { id: string }).id] ?? [] })),
    }));
  } catch (err) {
    console.error("[/api/sitio-admin/shop-the-look] GET", err);
    return NextResponse.json(errorResponse("Error al listar looks"), { status: 500 });
  }
}

/** POST: crea un look con sus items. Body: {titulo, subtitulo?, imagen_url?, orden?, items: [{producto_id, orden, etiqueta?}]} */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = await request.json();

    const titulo = String(body?.titulo ?? "").trim();
    if (!titulo) return NextResponse.json(errorResponse("titulo requerido"), { status: 400 });

    const { data: look, error: e1 } = await supabase
      .from("sitio_shop_the_look")
      .insert({
        empresa_id: auth.empresa_id,
        titulo,
        subtitulo: body?.subtitulo ? String(body.subtitulo) : null,
        imagen_url: body?.imagen_url ? String(body.imagen_url) : null,
        orden: Number(body?.orden ?? 0),
        activo: body?.activo !== false,
      })
      .select("id")
      .single();
    if (e1) throw new Error(e1.message);

    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length > 0) {
      const rows = items.map((it: { producto_id: string; orden?: number; etiqueta?: string }, idx: number) => ({
        look_id: (look as { id: string }).id,
        producto_id: String(it.producto_id),
        orden: Number(it.orden ?? idx),
        etiqueta: it.etiqueta ? String(it.etiqueta) : null,
      }));
      const { error: e2 } = await supabase.from("sitio_shop_the_look_items").insert(rows);
      if (e2) throw new Error(e2.message);
    }

    return NextResponse.json(successResponse({ id: (look as { id: string }).id }));
  } catch (err) {
    console.error("[/api/sitio-admin/shop-the-look] POST", err);
    return NextResponse.json(errorResponse("Error al crear look"), { status: 500 });
  }
}
