import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { normalizeUpperText, normalizeUpperCodigoBarras } from "@/lib/text/normalize";

const TIPO_CORTE = ["masculino", "femenino", "unisex"] as const;
const ESTADOS = ["activo", "agotado", "discontinuado"] as const;

interface VarianteIn {
  nombre?: string;
  sku?: string;
  color_id?: string | null;
  talla_id?: string | null;
  stock_actual?: number | string;
  stock_minimo?: number | string;
  precio_costo?: number | string;
  precio_mayorista?: number | string;
  precio_minorista?: number | string;
  precio_venta?: number | string;
  codigo_barras?: string | null;
  ubicacion_principal_id?: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * POST /api/inventario/prendas
 * Crea 1 producto_base (prenda) + N filas en `productos` (variantes color/talla),
 * todo en una transaccion. Cada variante con stock>0 graba movimiento inicial.
 * Las variantes siguen siendo productos (producto_id), por lo que ventas/compras/stock no cambian.
 */
export async function POST(request: NextRequest) {
  let body: { base?: Record<string, unknown>; variantes?: VarianteIn[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }

  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const empresaId = ctx.auth.empresa_id;
  const schemaRaw = await fetchDataSchemaForEmpresaId(empresaId);
  const schema = assertAllowedChatDataSchema(schemaRaw);

  const base = body.base ?? {};
  const variantes = Array.isArray(body.variantes) ? body.variantes : [];

  const nombreBase = normalizeUpperText(base.nombre);
  if (!nombreBase) return NextResponse.json(errorResponse("El nombre de la prenda es obligatorio."), { status: 400 });
  const tipoCorte = TIPO_CORTE.includes(base.tipo_corte as typeof TIPO_CORTE[number]) ? (base.tipo_corte as string) : "unisex";
  const estado = ESTADOS.includes(base.estado as typeof ESTADOS[number]) ? (base.estado as string) : "activo";
  if (variantes.length === 0) return NextResponse.json(errorResponse("Agregá al menos una variante (color/talla)."), { status: 400 });
  for (const v of variantes) {
    if (!normalizeUpperText(v.sku)) return NextResponse.json(errorResponse("Cada variante necesita un SKU."), { status: 400 });
  }

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool de Postgres no disponible."), { status: 500 });

  const tBase = quoteSchemaTable(schema, "producto_base");
  const tProd = quoteSchemaTable(schema, "productos");
  const tMov = quoteSchemaTable(schema, "movimientos_inventario");

  const client = await pool.connect();
  try {
    await client.query("SET lock_timeout='3s'");
    await client.query("BEGIN");

    const baseRes = await client.query<{ id: string }>(
      `INSERT INTO ${tBase} (empresa_id, nombre, categoria_id, tipo_corte, material, temporada, marca, descripcion, imagen_url, imagen_path, estado, proveedor_principal_id)
       VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid) RETURNING id`,
      [
        empresaId,
        nombreBase,
        base.categoria_id ? String(base.categoria_id) : null,
        tipoCorte,
        base.material ? String(base.material) : null,
        base.temporada ? String(base.temporada) : null,
        base.marca ? String(base.marca) : null,
        base.descripcion ? String(base.descripcion) : null,
        base.imagen_url ? String(base.imagen_url) : null,
        base.imagen_path ? String(base.imagen_path) : null,
        estado,
        base.proveedor_principal_id ? String(base.proveedor_principal_id) : null,
      ]
    );
    const baseId = baseRes.rows[0].id;
    const categoriaId = base.categoria_id ? String(base.categoria_id) : null;
    const proveedorId = base.proveedor_principal_id ? String(base.proveedor_principal_id) : null;

    const creadas: { id: string; sku: string }[] = [];
    for (const v of variantes) {
      const sku = normalizeUpperText(v.sku);
      const nombreVar = normalizeUpperText(v.nombre) || nombreBase;
      const stock = num(v.stock_actual);
      const costo = num(v.precio_costo);
      const cb = normalizeUpperCodigoBarras(v.codigo_barras);
      const ins = await client.query<{ id: string }>(
        `INSERT INTO ${tProd} (
           empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo,
           unidad_medida, metodo_valuacion, codigo_barras, codigo_barras_interno,
           categoria_principal_id, ubicacion_principal_id, proveedor_principal_id,
           producto_base_id, color_id, talla_id, precio_costo, precio_mayorista, precio_minorista
         ) VALUES (
           $1::uuid,$2,$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,
           'UNIDAD','CPP',$8,false,
           $9::uuid,$10::uuid,$11::uuid,
           $12::uuid,$13::uuid,$14::uuid,$15::numeric,$16::numeric,$17::numeric
         ) RETURNING id`,
        [
          empresaId, nombreVar, sku, costo, num(v.precio_venta), stock, num(v.stock_minimo),
          cb, categoriaId, v.ubicacion_principal_id ? String(v.ubicacion_principal_id) : null, proveedorId,
          baseId, v.color_id ? String(v.color_id) : null, v.talla_id ? String(v.talla_id) : null,
          costo, num(v.precio_mayorista), num(v.precio_minorista),
        ]
      );
      const varId = ins.rows[0].id;
      creadas.push({ id: varId, sku });

      if (stock > 0) {
        await client.query(
          `INSERT INTO ${tMov} (empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad, costo_unitario, origen, referencia, fecha, created_by, usuario_nombre)
           VALUES ($1::uuid,$2::uuid,$3,$4,'ENTRADA',$5::numeric,$6::numeric,'inventario_inicial',NULL,now(),$7::uuid,$8)`,
          [empresaId, varId, nombreVar, sku, stock, costo, ctx.auth.usuarioCatalogId ?? null, ctx.auth.user?.email ?? null]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ producto_base_id: baseId, variantes: creadas, count: creadas.length }));
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    const e = err as { code?: string; message?: string; constraint?: string };
    if (e?.code === "23505") {
      const campo = /codigo_barras/i.test(e.constraint || e.message || "") ? "código de barras" : "SKU";
      return NextResponse.json(errorResponse(`Ya existe un producto con el mismo ${campo} en esta empresa. Revisá las variantes.`), { status: 409 });
    }
    console.error("[/api/inventario/prendas POST]", { schema, empresaId, message: e?.message, code: e?.code });
    return NextResponse.json(errorResponse("No se pudo crear la prenda. Revisá los datos e intentá nuevamente."), { status: 500 });
  } finally {
    client.release();
  }
}
