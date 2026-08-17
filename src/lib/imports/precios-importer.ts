/**
 * Importador dedicado de PRECIOS.
 *
 * A diferencia del importer general de productos, este:
 *  - Solo hace UPDATE. Si un codigo_barras no matchea, se reporta como SKIP,
 *    nunca INSERT — evita crear productos fantasma cuando el archivo del
 *    proveedor incluye items que todavia no estan en el sistema.
 *  - Solo toca precio_venta, precio_mayorista y costo_promedio. Nunca stock,
 *    nombre, sku ni ninguna otra columna — evita el bug clasico de que un
 *    Excel de precios pise el stock actual con 0.
 *  - Matchea unicamente por CODIGO_BARRAS (unique por item).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { normalizeUpperText } from "@/lib/text/normalize";
import type { PreviewResponse, PreviewRow } from "@/lib/excel/import-types";
import { pick, pickNumber, chunked } from "./import-helpers";

export interface PrecioParsed {
  row_number: number;
  codigo_barras: string;
  precio_venta: number | null;
  precio_mayorista: number | null;
  costo_promedio: number | null;
  /** Opcional: si viene, se actualiza el codigo_proveedor del producto. */
  codigo_proveedor: string | null;
  errors: string[];
  warnings: string[];
  match_id?: string | null;
  precio_venta_actual?: number | null;
  precio_mayorista_actual?: number | null;
  costo_actual?: number | null;
  codigo_proveedor_actual?: string | null;
}

function parseOptionalNumber(row: Record<string, string>, ...keys: string[]): number | null {
  const raw = pick(row, ...keys);
  if (!raw || String(raw).trim() === "") return null;
  const n = pickNumber(row, ...keys);
  return n > 0 ? n : null;
}

export function parsePreciosRows(rows: Record<string, string>[]): PrecioParsed[] {
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const codigo_barras = normalizeUpperText(pick(r, "CODIGO_BARRAS", "CODIGOBARRAS", "CODIGO_DE_BARRA"));
    if (!codigo_barras) errors.push("CODIGO_BARRAS obligatorio.");
    const precio_venta = parseOptionalNumber(r, "PRECIO_VENTA", "PRECIOVENTA");
    const precio_mayorista = parseOptionalNumber(r, "PRECIO_MAYORISTA", "PRECIOMAYORISTA");
    const costo_promedio = parseOptionalNumber(r, "COSTO_PROMEDIO", "COSTO");
    const codigo_proveedor_raw = normalizeUpperText(pick(r, "CODIGO_PROVEEDOR", "CODIGOPROVEEDOR", "CODIGO_FABRICANTE"));
    const codigo_proveedor = codigo_proveedor_raw || null;
    if (!precio_venta && !precio_mayorista && !costo_promedio && !codigo_proveedor) {
      errors.push("Sin datos a actualizar (PRECIO_VENTA, PRECIO_MAYORISTA, COSTO_PROMEDIO o CODIGO_PROVEEDOR).");
    }
    return {
      row_number: idx + 2,
      codigo_barras,
      precio_venta,
      precio_mayorista,
      costo_promedio,
      codigo_proveedor,
      errors,
      warnings: [],
    };
  });
}

export interface PrecioResolverMaps {
  productosByCodigo: Map<string, {
    id: string;
    precio_venta: number;
    precio_mayorista: number | null;
    costo_promedio: number;
    codigo_proveedor: string | null;
  }>;
}

export async function buildPreciosResolverMaps(schemaRaw: string, empresaId: string): Promise<PrecioResolverMaps> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const tP = quoteSchemaTable(schema, "productos");
  const q = await pool.query<{
    id: string;
    codigo_barras: string | null;
    precio_venta: string | number;
    precio_mayorista: string | number | null;
    costo_promedio: string | number;
    codigo_proveedor: string | null;
  }>(
    `SELECT id, codigo_barras, precio_venta, precio_mayorista, costo_promedio, codigo_proveedor
     FROM ${tP} WHERE empresa_id=$1::uuid AND codigo_barras IS NOT NULL`,
    [empresaId]
  );
  const productosByCodigo = new Map<string, PrecioResolverMaps["productosByCodigo"] extends Map<string, infer V> ? V : never>();
  for (const r of q.rows) {
    if (!r.codigo_barras) continue;
    productosByCodigo.set(r.codigo_barras.trim().toUpperCase(), {
      id: r.id,
      precio_venta: Number(r.precio_venta),
      precio_mayorista: r.precio_mayorista != null ? Number(r.precio_mayorista) : null,
      costo_promedio: Number(r.costo_promedio),
      codigo_proveedor: r.codigo_proveedor,
    });
  }
  return { productosByCodigo };
}

export function buildPreciosPreview(parsed: PrecioParsed[], maps: PrecioResolverMaps): PreviewResponse {
  let actualizar = 0, omitir = 0, errores = 0;
  const codbarVistos = new Set<string>();

  const rows: PreviewRow[] = parsed.map((p) => {
    if (p.codigo_barras && codbarVistos.has(p.codigo_barras)) {
      p.errors.push(`CODIGO_BARRAS "${p.codigo_barras}" duplicado en el archivo.`);
    }
    if (p.codigo_barras) codbarVistos.add(p.codigo_barras);

    let action: "UPDATE" | "SKIP" | "ERROR" = "SKIP";
    if (p.errors.length > 0) {
      action = "ERROR"; errores++;
    } else {
      const existente = maps.productosByCodigo.get(p.codigo_barras);
      if (!existente) {
        p.warnings.push("No existe un producto con ese código de barras. Se omite.");
        action = "SKIP"; omitir++;
      } else {
        p.match_id = existente.id;
        p.precio_venta_actual = existente.precio_venta;
        p.precio_mayorista_actual = existente.precio_mayorista;
        p.costo_actual = existente.costo_promedio;
        p.codigo_proveedor_actual = existente.codigo_proveedor;
        action = "UPDATE"; actualizar++;
      }
    }

    return {
      row_number: p.row_number,
      action,
      warnings: p.warnings,
      errors: p.errors,
      data: {
        CODIGO_BARRAS: p.codigo_barras,
        CODIGO_PROVEEDOR: p.codigo_proveedor ?? "",
        CODIGO_PROVEEDOR_ACTUAL: p.codigo_proveedor_actual ?? "",
        PRECIO_VENTA: p.precio_venta ?? "",
        PRECIO_VENTA_ACTUAL: p.precio_venta_actual ?? "",
        PRECIO_MAYORISTA: p.precio_mayorista ?? "",
        PRECIO_MAYORISTA_ACTUAL: p.precio_mayorista_actual ?? "",
        COSTO_PROMEDIO: p.costo_promedio ?? "",
        COSTO_ACTUAL: p.costo_actual ?? "",
      },
    };
  });

  return {
    summary: {
      total: parsed.length,
      insertar: 0, actualizar, omitir, errores, warnings: 0,
      faltantes: { categorias: [], proveedores: [], ubicaciones: [] },
      movimientos_a_generar: 0, unidades_entrada: 0, unidades_salida: 0,
    },
    rows,
    headers: ["CODIGO_BARRAS","CODIGO_PROVEEDOR","CODIGO_PROVEEDOR_ACTUAL","PRECIO_VENTA","PRECIO_VENTA_ACTUAL","PRECIO_MAYORISTA","PRECIO_MAYORISTA_ACTUAL","COSTO_PROMEDIO","COSTO_ACTUAL"],
  };
}

export const PRECIOS_TEMPLATE_ROW = {
  CODIGO_BARRAS: "7891234567890",
  CODIGO_PROVEEDOR: "00001001",
  PRECIO_VENTA: 25000,
  PRECIO_MAYORISTA: 20000,
  COSTO_PROMEDIO: 15000,
};

export interface PreciosCommitOutcome {
  updated: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}

export async function commitPrecios(
  schemaRaw: string,
  empresaId: string,
  parsed: PrecioParsed[]
): Promise<PreciosCommitOutcome> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const tP = quoteSchemaTable(schema, "productos");

  const out: PreciosCommitOutcome = { updated: 0, skipped: 0, errors: 0, errorMessages: [] };

  // Contabilizar errores y omitidos primero, y quedarnos solo con los que
  // realmente van a UPDATE.
  const aActualizar: PrecioParsed[] = [];
  for (const p of parsed) {
    if (p.errors.length > 0) {
      out.errors++;
      out.errorMessages.push(`Fila ${p.row_number}: ${p.errors.join("; ")}`);
      continue;
    }
    if (!p.match_id) { out.skipped++; continue; }
    aActualizar.push(p);
  }

  // Bulk UPDATE: un solo query por chunk usando FROM (VALUES ...). Un UPDATE
  // por fila -para 20k productos- excede el timeout de Vercel; hacerlo en
  // lotes de 500 baja el tiempo total de minutos a segundos.
  const CHUNK = 500;
  for (const chunk of chunked(aActualizar, CHUNK)) {
    const params: unknown[] = [empresaId];
    const values: string[] = [];
    for (const p of chunk) {
      const i0 = params.length + 1; // $2, $3, $4, $5, $6...
      params.push(p.match_id, p.precio_venta, p.precio_mayorista, p.costo_promedio, p.codigo_proveedor);
      values.push(`($${i0}::uuid, $${i0 + 1}::numeric, $${i0 + 2}::numeric, $${i0 + 3}::numeric, $${i0 + 4}::text)`);
    }
    const sql = `
      UPDATE ${tP} AS p SET
        precio_venta     = COALESCE(v.precio_venta,     p.precio_venta),
        precio_mayorista = COALESCE(v.precio_mayorista, p.precio_mayorista),
        costo_promedio   = COALESCE(v.costo_promedio,   p.costo_promedio),
        codigo_proveedor = COALESCE(v.codigo_proveedor, p.codigo_proveedor),
        updated_at       = now()
      FROM (VALUES ${values.join(",")})
        AS v(id, precio_venta, precio_mayorista, costo_promedio, codigo_proveedor)
      WHERE p.id = v.id AND p.empresa_id = $1::uuid
    `;
    try {
      const res = await pool.query(sql, params);
      out.updated += res.rowCount ?? chunk.length;
    } catch (e) {
      // Si falla el bulk, no sabemos cual fila fue el problema; reportamos el chunk entero como error.
      out.errors += chunk.length;
      out.errorMessages.push(
        `Filas ${chunk[0].row_number}-${chunk[chunk.length - 1].row_number}: ${(e as Error).message.slice(0, 200)}`
      );
    }
  }
  return out;
}
