import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getInventarioReporteExport, type EstadoInventario } from "@/lib/reportes/server/inventario-pg";
import { buildXlsxBuffer, nowStamp, xlsxResponseHeaders } from "@/lib/excel/export";

const ESTADOS: EstadoInventario[] = ["sin_stock", "stock_bajo", "normal"];
const ESTADO_LABEL: Record<EstadoInventario, string> = {
  sin_stock: "Sin stock",
  stock_bajo: "Stock bajo",
  normal: "Normal",
};

/** GET /api/reportes/inventario/export?q=&categoria=&estado= */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  try {
    const sp = new URL(request.url).searchParams;
    const estadoRaw = sp.get("estado") as EstadoInventario | null;
    const categoriaId = (sp.get("categoria") ?? "").trim();
    if (categoriaId && !/^[0-9a-f-]{36}$/i.test(categoriaId)) {
      return new Response("Categoría inválida", { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const productos = await getInventarioReporteExport(schema, ctx.auth.empresa_id, {
      q: (sp.get("q") ?? "").trim(),
      categoriaId,
      estado: estadoRaw && ESTADOS.includes(estadoRaw) ? estadoRaw : "",
    });

    const buf = buildXlsxBuffer(productos, [
      { header: "FECHA_CARGA", value: (p) => new Date(p.fecha_carga), width: 18 },
      { header: "PRODUCTO", value: (p) => p.nombre, width: 36 },
      { header: "SKU", value: (p) => p.sku, width: 18 },
      { header: "CODIGO_PROVEEDOR", value: (p) => p.codigo_proveedor ?? "", width: 20 },
      { header: "CODIGO_BARRAS", value: (p) => p.codigo_barras ?? "", width: 22 },
      { header: "CATEGORIA", value: (p) => p.categoria_nombre ?? "", width: 22 },
      { header: "COLOR", value: (p) => p.color_nombre ?? "", width: 14 },
      { header: "TALLA", value: (p) => p.talla_nombre ?? "", width: 10 },
      { header: "GENERO", value: (p) => p.genero ?? "", width: 12 },
      { header: "UBICACION", value: (p) => p.ubicacion_nombre ?? "", width: 22 },
      { header: "UNIDAD", value: (p) => p.unidad_medida, width: 12 },
      { header: "STOCK_ACTUAL", value: (p) => p.stock_actual, width: 14 },
      { header: "STOCK_MINIMO", value: (p) => p.stock_minimo, width: 14 },
      { header: "ESTADO", value: (p) => ESTADO_LABEL[p.estado], width: 14 },
      { header: "COSTO_PROMEDIO", value: (p) => p.costo_promedio, width: 16 },
      { header: "PRECIO_VENTA", value: (p) => p.precio_venta, width: 16 },
      { header: "VALOR_AL_COSTO", value: (p) => p.valor_costo, width: 18 },
      { header: "VALOR_POTENCIAL_VENTA", value: (p) => p.valor_venta, width: 22 },
      { header: "MARGEN_PORCENTAJE", value: (p) => Number(p.margen_porcentaje.toFixed(2)), width: 20 },
    ], { sheetName: "Reporte inventario" });

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`reporte-inventario-${nowStamp()}`),
    });
  } catch (err) {
    console.error("[/api/reportes/inventario/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
