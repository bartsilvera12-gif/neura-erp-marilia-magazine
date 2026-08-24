import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";

/**
 * GET /api/inventario/movimientos/export?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&q=texto
 *
 * Descarga .xlsx con el historial de movimientos de inventario, aplicando los
 * mismos filtros que la pantalla (rango de fechas + busqueda por producto/SKU).
 */
interface Row {
  fecha: string;
  producto_nombre: string;
  producto_sku: string;
  tipo: string;
  cantidad: string | number;
  costo_unitario: string | number;
  origen: string;
  referencia: string | null;
  usuario_nombre: string | null;
}

const origenLabel: Record<string, string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste_manual: "Ajuste manual",
  inventario_inicial: "Inventario inicial",
};

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const empresaId = ctx.auth.empresa_id;
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const pool = getChatPostgresPool();
  if (!pool) return new Response("Pool no disponible", { status: 500 });

  const { searchParams } = new URL(request.url);
  const desde = (searchParams.get("desde") || "").trim();
  const hasta = (searchParams.get("hasta") || "").trim();
  const q = (searchParams.get("q") || "").trim();

  const tMov = quoteSchemaTable(schema, "movimientos_inventario");

  const filtros: string[] = ["m.empresa_id = $1::uuid"];
  const params: unknown[] = [empresaId];
  if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    params.push(desde);
    filtros.push(`m.fecha >= $${params.length}::timestamptz`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    params.push(hasta);
    // Incluir todo el dia "hasta": < (hasta + 1 dia).
    filtros.push(`m.fecha < ($${params.length}::date + interval '1 day')`);
  }
  if (q) {
    params.push(`%${q}%`);
    filtros.push(`(m.producto_nombre ILIKE $${params.length} OR m.producto_sku ILIKE $${params.length})`);
  }

  try {
    const { rows } = await pool.query<Row>(
      `SELECT m.fecha, m.producto_nombre, m.producto_sku, m.tipo, m.cantidad,
              m.costo_unitario, m.origen, m.referencia, m.usuario_nombre
         FROM ${tMov} m
        WHERE ${filtros.join(" AND ")}
        ORDER BY m.fecha DESC`,
      params
    );

    const fmtFecha = (iso: string) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    const buf = buildXlsxBuffer<Row>(rows, [
      { header: "FECHA", value: (r) => fmtFecha(r.fecha), width: 18 },
      { header: "PRODUCTO", value: (r) => r.producto_nombre, width: 38 },
      { header: "SKU", value: (r) => r.producto_sku, width: 18 },
      { header: "TIPO", value: (r) => r.tipo, width: 10 },
      { header: "CANTIDAD", value: (r) => Number(r.cantidad), width: 10 },
      { header: "COSTO_UNITARIO", value: (r) => Number(r.costo_unitario), width: 14 },
      { header: "ORIGEN", value: (r) => origenLabel[r.origen] ?? r.origen, width: 18 },
      { header: "REFERENCIA", value: (r) => r.referencia ?? "", width: 18 },
      { header: "USUARIO", value: (r) => r.usuario_nombre ?? "", width: 22 },
    ], { sheetName: "Movimientos" });

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`movimientos-${nowStamp()}`),
    });
  } catch (err) {
    console.error("[/api/inventario/movimientos/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
