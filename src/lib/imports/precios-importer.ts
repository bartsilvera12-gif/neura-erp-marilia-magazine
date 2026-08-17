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
  errors: string[];
  warnings: string[];
  match_id?: string | null;
  precio_venta_actual?: number | null;
  precio_mayorista_actual?: number | null;
  costo_actual?: number | null;
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
    if (!precio_venta && !precio_mayorista && !costo_promedio) {
      errors.push("Sin datos a actualizar (PRECIO_VENTA, PRECIO_MAYORISTA o COSTO_PROMEDIO).");
    }
    return {
      row_number: idx + 2,
      codigo_barras,
      precio_venta,
      precio_mayorista,
      costo_promedio,
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
  }>(
    `SELECT id, codigo_barras, precio_venta, precio_mayorista, costo_promedio
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
    headers: ["CODIGO_BARRAS","PRECIO_VENTA","PRECIO_VENTA_ACTUAL","PRECIO_MAYORISTA","PRECIO_MAYORISTA_ACTUAL","COSTO_PROMEDIO","COSTO_ACTUAL"],
  };
}

export const PRECIOS_TEMPLATE_ROW = {
  CODIGO_BARRAS: "7891234567890",
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

  for (const chunk of chunked(parsed, 200)) {
    for (const p of chunk) {
      if (p.errors.length > 0) { out.errors++; out.errorMessages.push(`Fila ${p.row_number}: ${p.errors.join("; ")}`); continue; }
      if (!p.match_id) { out.skipped++; continue; }
      try {
        // COALESCE preserva el valor actual cuando la celda del Excel viene vacia.
        await pool.query(
          `UPDATE ${tP} SET
             precio_venta      = COALESCE($1::numeric, precio_venta),
             precio_mayorista  = COALESCE($2::numeric, precio_mayorista),
             costo_promedio    = COALESCE($3::numeric, costo_promedio),
             updated_at        = now()
           WHERE id=$4::uuid AND empresa_id=$5::uuid`,
          [p.precio_venta, p.precio_mayorista, p.costo_promedio, p.match_id, empresaId]
        );
        out.updated++;
      } catch (e) {
        out.errors++;
        out.errorMessages.push(`Fila ${p.row_number}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
  }
  return out;
}
