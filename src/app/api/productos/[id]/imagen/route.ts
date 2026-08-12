import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PRODUCTOS_IMAGENES_BUCKET,
  buildProductoImagenPath,
  ensureProductosImagenesBucket,
  pathBelongsToEmpresa,
  signProductoImagen,
} from "@/lib/inventario/imagen-storage";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Imagen(es) de producto — usa Storage de Supabase + PostgREST (no pool PG).
 * Cada producto tiene hasta 3 slots (principal + dos adicionales). El slot va
 * como query `?slot=1|2|3`; sin él, se asume el principal.
 */

type SlotIdx = 1 | 2 | 3;

interface ProductoImgs {
  id: string;
  imagen_path: string | null;
  imagen_path_2: string | null;
  imagen_path_3: string | null;
}

const SELECT_IMGS = "id, imagen_path, imagen_path_2, imagen_path_3";

function parseSlot(request: NextRequest): SlotIdx {
  const raw = new URL(request.url).searchParams.get("slot");
  const n = raw ? parseInt(raw, 10) : 1;
  return (n === 2 || n === 3 ? n : 1) as SlotIdx;
}

/** Nombre de la columna path para el slot dado. */
function pathCol(slot: SlotIdx): keyof ProductoImgs {
  return slot === 1 ? "imagen_path" : (slot === 2 ? "imagen_path_2" : "imagen_path_3");
}
/** Nombre de la columna url que se limpia al persistir el nuevo path. */
function urlColName(slot: SlotIdx): string {
  return slot === 1 ? "imagen_url" : (slot === 2 ? "imagen_url_2" : "imagen_url_3");
}

async function fetchProducto(
  sb: AppSupabaseClient,
  empresaId: string,
  productoId: string
): Promise<ProductoImgs | null> {
  const { data, error } = await sb
    .from("productos")
    .select(SELECT_IMGS)
    .eq("empresa_id", empresaId)
    .eq("id", productoId)
    .maybeSingle();
  if (error) {
    console.error("[productos imagen] fetchProducto", error.message);
    return null;
  }
  return (data as ProductoImgs | null) ?? null;
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const prod = await fetchProducto(ctx.supabase, ctx.auth.empresa_id, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const slot = parseSlot(request);
    const path = prod[pathCol(slot)] as string | null;
    const signed = path ? await signProductoImagen(ctx.supabase, path, 3600) : null;
    return NextResponse.json(
      successResponse({ slot, imagen_path: path, imagen_url: signed })
    );
  } catch (err) {
    console.error("[/api/productos/[id]/imagen GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo obtener la imagen."), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const slot = parseSlot(request);
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    // 1) Ownership
    const prod = await fetchProducto(supabase, empresaId, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    // 2) Archivo
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json(
        errorResponse("Formato no permitido. Usá JPG, PNG o WebP."),
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(
        errorResponse(`Imagen demasiado grande (máx. ${mb} MB).`),
        { status: 413 }
      );
    }

    // 3) Bucket idempotente
    try {
      await ensureProductosImagenesBucket(supabase);
    } catch (bucketErr) {
      console.error("[/api/productos/[id]/imagen POST] ensureBucket",
        bucketErr instanceof Error ? bucketErr.message : bucketErr);
    }

    // 4) Borrar la anterior de este mismo slot si es de la empresa
    const previo = prod[pathCol(slot)] as string | null;
    if (previo && pathBelongsToEmpresa(previo, empresaId)) {
      await supabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([previo]);
    }

    // 5) Upload — sufijo del slot en el nombre para que los tres coexistan
    const path = buildProductoImagenPath(empresaId, productoId, file.type, slot);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error("[/api/productos/[id]/imagen POST] upload",
        { empresaId, productoId, slot, message: up.error.message });
      return NextResponse.json(
        errorResponse(`No se pudo subir la imagen: ${up.error.message}`),
        { status: 500 }
      );
    }

    // 6) Persistir path del slot; limpiar la url pública del slot correspondiente
    const patch: Record<string, string | null> = {};
    patch[pathCol(slot) as string] = path;
    patch[urlColName(slot)] = null;
    const upd = await supabase
      .from("productos")
      .update(patch)
      .eq("empresa_id", empresaId)
      .eq("id", productoId)
      .select(SELECT_IMGS)
      .maybeSingle();
    if (upd.error) {
      console.error("[/api/productos/[id]/imagen POST] update", upd.error.message);
      return NextResponse.json(errorResponse("No se pudo asociar la imagen al producto."), { status: 500 });
    }

    const signed = await signProductoImagen(supabase, path, 3600);
    return NextResponse.json(successResponse({ slot, imagen_path: path, imagen_url: signed }));
  } catch (err) {
    console.error("[/api/productos/[id]/imagen POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir la imagen."), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const slot = parseSlot(request);
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const prod = await fetchProducto(supabase, empresaId, productoId);
    if (!prod) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const previo = prod[pathCol(slot)] as string | null;
    if (previo && pathBelongsToEmpresa(previo, empresaId)) {
      await supabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([previo]);
    }
    const patch: Record<string, string | null> = {};
    patch[pathCol(slot) as string] = null;
    patch[urlColName(slot)] = null;
    await supabase
      .from("productos")
      .update(patch)
      .eq("empresa_id", empresaId)
      .eq("id", productoId);

    return NextResponse.json(successResponse({ slot, imagen_path: null, imagen_url: null }));
  } catch (err) {
    console.error("[/api/productos/[id]/imagen DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo quitar la imagen."), { status: 500 });
  }
}
