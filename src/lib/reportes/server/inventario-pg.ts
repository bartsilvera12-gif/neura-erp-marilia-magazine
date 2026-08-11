import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export type EstadoInventario = "sin_stock" | "stock_bajo" | "normal";

export interface InventarioReporteFiltros {
  q?: string;
  categoriaId?: string;
  estado?: EstadoInventario | "";
  page?: number;
  pageSize?: number;
}

export interface InventarioReporteProducto {
  id: string;
  nombre: string;
  sku: string;
  codigo_proveedor: string | null;
  codigo_barras: string | null;
  color_nombre: string | null;
  talla_nombre: string | null;
  genero: string | null;
  categoria_nombre: string | null;
  ubicacion_nombre: string | null;
  unidad_medida: string;
  costo_promedio: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  valor_costo: number;
  valor_venta: number;
  margen_porcentaje: number;
  estado: EstadoInventario;
  fecha_carga: string;
}

export interface InventarioReporteTotales {
  productos: number;
  unidades: number;
  sin_stock: number;
  stock_bajo: number;
  valor_costo: number;
  valor_venta: number;
}

export interface InventarioReporteCategoria {
  id: string;
  nombre: string;
}

interface ProductoRow extends Omit<InventarioReporteProducto,
  "costo_promedio" | "precio_venta" | "stock_actual" | "stock_minimo" |
  "valor_costo" | "valor_venta" | "margen_porcentaje"> {
  costo_promedio: string | number;
  precio_venta: string | number;
  stock_actual: string | number;
  stock_minimo: string | number;
  valor_costo: string | number;
  valor_venta: string | number;
  margen_porcentaje: string | number;
  total_filtrado: string | number;
}

interface TotalesRow {
  productos: string | number;
  unidades: string | number;
  sin_stock: string | number;
  stock_bajo: string | number;
  valor_costo: string | number;
  valor_venta: string | number;
}

const PAGE_SIZES = [25, 50, 100, 200];

function mapProducto(row: ProductoRow): InventarioReporteProducto {
  return {
    id: row.id,
    nombre: row.nombre,
    sku: row.sku,
    codigo_proveedor: row.codigo_proveedor,
    codigo_barras: row.codigo_barras,
    color_nombre: row.color_nombre,
    talla_nombre: row.talla_nombre,
    genero: row.genero,
    categoria_nombre: row.categoria_nombre,
    ubicacion_nombre: row.ubicacion_nombre,
    unidad_medida: row.unidad_medida,
    costo_promedio: Number(row.costo_promedio),
    precio_venta: Number(row.precio_venta),
    stock_actual: Number(row.stock_actual),
    stock_minimo: Number(row.stock_minimo),
    valor_costo: Number(row.valor_costo),
    valor_venta: Number(row.valor_venta),
    margen_porcentaje: Number(row.margen_porcentaje),
    estado: row.estado,
    fecha_carga: row.fecha_carga,
  };
}

function buildBaseFilters(
  empresaId: string,
  filtros: InventarioReporteFiltros,
  includeEstado: boolean,
) {
  const clauses = ["p.empresa_id = $1::uuid", "p.activo = true"];
  const params: unknown[] = [empresaId];

  const q = filtros.q?.trim();
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    clauses.push(`(
      p.nombre ILIKE $${i}
      OR p.sku ILIKE $${i}
      OR COALESCE(p.codigo_proveedor, '') ILIKE $${i}
      OR COALESCE(p.codigo_barras, '') ILIKE $${i}
    )`);
  }
  if (filtros.categoriaId) {
    params.push(filtros.categoriaId);
    clauses.push(`p.categoria_principal_id = $${params.length}::uuid`);
  }
  if (includeEstado) {
    if (filtros.estado === "sin_stock") clauses.push("p.stock_actual <= 0");
    if (filtros.estado === "stock_bajo") clauses.push("p.stock_actual > 0 AND p.stock_actual <= p.stock_minimo");
    if (filtros.estado === "normal") clauses.push("p.stock_actual > p.stock_minimo");
  }

  return { where: clauses.join(" AND "), params };
}

function selectProductos(tProd: string, tCat: string, tUbi: string) {
  return `
    SELECT
      p.id, p.nombre, p.sku, p.codigo_proveedor, p.codigo_barras,
      p.color_nombre, p.talla_nombre, p.genero,
      c.nombre AS categoria_nombre,
      u.nombre AS ubicacion_nombre,
      p.unidad_medida, p.costo_promedio, p.precio_venta,
      p.stock_actual, p.stock_minimo,
      GREATEST(p.stock_actual, 0) * p.costo_promedio AS valor_costo,
      GREATEST(p.stock_actual, 0) * p.precio_venta AS valor_venta,
      CASE
        WHEN p.precio_venta > 0
          THEN ((p.precio_venta - p.costo_promedio) / p.precio_venta) * 100
        ELSE 0
      END AS margen_porcentaje,
      CASE
        WHEN p.stock_actual <= 0 THEN 'sin_stock'
        WHEN p.stock_actual <= p.stock_minimo THEN 'stock_bajo'
        ELSE 'normal'
      END AS estado,
      p.created_at AS fecha_carga,
      COUNT(*) OVER() AS total_filtrado
    FROM ${tProd} p
    LEFT JOIN ${tCat} c ON c.id = p.categoria_principal_id
    LEFT JOIN ${tUbi} u ON u.id = p.ubicacion_principal_id
  `;
}

export async function getInventarioReporte(
  schemaRaw: string,
  empresaId: string,
  filtros: InventarioReporteFiltros,
) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool de Postgres no disponible.");

  const tProd = quoteSchemaTable(schema, "productos");
  const tCat = quoteSchemaTable(schema, "categorias_productos");
  const tUbi = quoteSchemaTable(schema, "inventario_ubicaciones");
  const pageSize = PAGE_SIZES.includes(filtros.pageSize ?? 25) ? (filtros.pageSize ?? 25) : 25;
  const page = Math.max(1, filtros.page ?? 1);

  const detail = buildBaseFilters(empresaId, filtros, true);
  const detailParams = [...detail.params, pageSize, (page - 1) * pageSize];
  const detailSql = `${selectProductos(tProd, tCat, tUbi)}
    WHERE ${detail.where}
    ORDER BY p.created_at DESC, p.nombre ASC
    LIMIT $${detailParams.length - 1} OFFSET $${detailParams.length}
  `;

  // Las tarjetas resumen respetan búsqueda y categoría, pero no el estado.
  // Así siguen siendo útiles para cambiar entre sin stock, bajo y normal.
  const summary = buildBaseFilters(empresaId, filtros, false);
  const summarySql = `
    SELECT
      COUNT(*) AS productos,
      COALESCE(SUM(GREATEST(p.stock_actual, 0)), 0) AS unidades,
      COUNT(*) FILTER (WHERE p.stock_actual <= 0) AS sin_stock,
      COUNT(*) FILTER (WHERE p.stock_actual > 0 AND p.stock_actual <= p.stock_minimo) AS stock_bajo,
      COALESCE(SUM(GREATEST(p.stock_actual, 0) * p.costo_promedio), 0) AS valor_costo,
      COALESCE(SUM(GREATEST(p.stock_actual, 0) * p.precio_venta), 0) AS valor_venta
    FROM ${tProd} p
    WHERE ${summary.where}
  `;

  const categoriasSql = `
    SELECT c.id, c.nombre
    FROM ${tCat} c
    WHERE c.empresa_id = $1::uuid AND c.activo = true
    ORDER BY c.nombre ASC
  `;

  const [detailResult, summaryResult, categoriasResult] = await Promise.all([
    pool.query<ProductoRow>(detailSql, detailParams),
    pool.query<TotalesRow>(summarySql, summary.params),
    pool.query<InventarioReporteCategoria>(categoriasSql, [empresaId]),
  ]);

  const totalRow = summaryResult.rows[0];
  const totales: InventarioReporteTotales = {
    productos: Number(totalRow?.productos ?? 0),
    unidades: Number(totalRow?.unidades ?? 0),
    sin_stock: Number(totalRow?.sin_stock ?? 0),
    stock_bajo: Number(totalRow?.stock_bajo ?? 0),
    valor_costo: Number(totalRow?.valor_costo ?? 0),
    valor_venta: Number(totalRow?.valor_venta ?? 0),
  };

  return {
    totales,
    categorias: categoriasResult.rows,
    page,
    pageSize,
    total: Number(detailResult.rows[0]?.total_filtrado ?? 0),
    productos: detailResult.rows.map(mapProducto),
  };
}

export async function getInventarioReporteExport(
  schemaRaw: string,
  empresaId: string,
  filtros: InventarioReporteFiltros,
) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool de Postgres no disponible.");

  const tProd = quoteSchemaTable(schema, "productos");
  const tCat = quoteSchemaTable(schema, "categorias_productos");
  const tUbi = quoteSchemaTable(schema, "inventario_ubicaciones");
  const detail = buildBaseFilters(empresaId, filtros, true);
  const sql = `${selectProductos(tProd, tCat, tUbi)}
    WHERE ${detail.where}
    ORDER BY p.nombre ASC, p.color_nombre ASC, p.talla_nombre ASC
  `;
  const { rows } = await pool.query<ProductoRow>(sql, detail.params);
  return rows.map(mapProducto);
}
