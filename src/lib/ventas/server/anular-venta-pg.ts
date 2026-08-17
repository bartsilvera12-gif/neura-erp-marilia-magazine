/**
 * Anulacion de venta NO fiscal.
 *
 * Reglas:
 *  - Solo se permite si la venta NO tiene factura electronica SIFEN aprobada.
 *    Para esas hay que emitir nota de credito, no anular.
 *  - Solo si estado != 'anulada' (idempotencia).
 *  - Si es credito y ya se recibieron cobros: se bloquea (habria que revertir
 *    cada cobro; alcance fuera de esta primera version).
 *  - Si tiene devoluciones confirmadas: se bloquea (primero anular la devolucion).
 *
 * Efectos:
 *  - Repone stock (movimiento ENTRADA por cada item con controla_stock=true).
 *  - Marca la venta como anulada (estado='anulada', anulada_at, anulada_por,
 *    anulada_motivo).
 *  - Si es credito con CxC sin pagos: borra la cuenta_por_cobrar.
 *  - NO inserta movimiento inverso en caja: el calculo de caja ya excluye
 *    ventas anuladas por estado (ver src/lib/caja/server.ts).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export class AnulacionBloqueadaError extends Error {
  motivo:
    | "venta_no_encontrada"
    | "ya_anulada"
    | "sifen_aprobado"
    | "credito_con_cobros"
    | "tiene_devoluciones";
  constructor(
    motivo: AnulacionBloqueadaError["motivo"],
    message: string
  ) {
    super(message);
    this.motivo = motivo;
    this.name = "AnulacionBloqueadaError";
  }
}

export interface AnularVentaResult {
  venta_id: string;
  numero_control: string;
  items_stock_devuelto: number;
  cuenta_por_cobrar_borrada: boolean;
}

export interface UsuarioAnulacionCtx {
  id: string | null;
  nombre: string | null;
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export async function anularVenta(
  schemaRaw: string,
  empresaId: string,
  usuario: UsuarioAnulacionCtx,
  ventaId: string,
  motivo: string | null
): Promise<AnularVentaResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tV = quoteSchemaTable(schema, "ventas");
  const tVI = quoteSchemaTable(schema, "ventas_items");
  const tP = quoteSchemaTable(schema, "productos");
  const tMI = quoteSchemaTable(schema, "movimientos_inventario");
  const tFE = quoteSchemaTable(schema, "factura_electronica");
  const tCxC = quoteSchemaTable(schema, "cuentas_por_cobrar");
  const tCC = quoteSchemaTable(schema, "cobros_clientes");
  const tDV = quoteSchemaTable(schema, "devoluciones_venta");

  const client = await pool().connect();
  try {
    await client.query("BEGIN");

    // Venta con lock: no queremos que otro proceso la toque mientras anulamos.
    const vQ = await client.query<{
      id: string;
      numero_control: string;
      estado: string;
      tipo_venta: string;
      factura_id: string | null;
      total: string | number;
    }>(
      `SELECT id::text, numero_control, estado, tipo_venta, factura_id::text AS factura_id, total
         FROM ${tV} WHERE id=$1::uuid AND empresa_id=$2::uuid FOR UPDATE`,
      [ventaId, empresaId]
    );
    const v = vQ.rows[0];
    if (!v) throw new AnulacionBloqueadaError("venta_no_encontrada", "La venta no existe.");
    if (v.estado === "anulada") {
      throw new AnulacionBloqueadaError("ya_anulada", "La venta ya está anulada.");
    }

    // Bloqueo por SIFEN aprobado.
    if (v.factura_id) {
      const feQ = await client.query<{ estado_sifen: string | null }>(
        `SELECT estado_sifen FROM ${tFE} WHERE factura_id=$1::uuid AND empresa_id=$2::uuid LIMIT 1`,
        [v.factura_id, empresaId]
      );
      const est = feQ.rows[0]?.estado_sifen ?? null;
      if (est === "aprobado") {
        throw new AnulacionBloqueadaError(
          "sifen_aprobado",
          "La factura electrónica ya está aprobada por SIFEN. Emití una nota de crédito en vez de anular."
        );
      }
    }

    // Bloqueo por devoluciones confirmadas: hay que anular la devolucion primero
    // (asi el stock queda consistente).
    try {
      const dvQ = await client.query<{ n: string | number }>(
        `SELECT COUNT(*) AS n FROM ${tDV} WHERE venta_id=$1::uuid AND empresa_id=$2::uuid AND estado='confirmada'`,
        [ventaId, empresaId]
      );
      if (Number(dvQ.rows[0]?.n ?? 0) > 0) {
        throw new AnulacionBloqueadaError(
          "tiene_devoluciones",
          "La venta tiene devoluciones confirmadas. Anulá primero las devoluciones."
        );
      }
    } catch (e) {
      // Si la tabla devoluciones_venta no existe en este tenant (feature flag off),
      // el error es "relation does not exist" — lo ignoramos.
      if (e instanceof AnulacionBloqueadaError) throw e;
      const msg = (e as Error).message ?? "";
      if (!/does not exist/i.test(msg)) throw e;
    }

    // Bloqueo por credito con cobros ya recibidos.
    let cxcBorrada = false;
    if (v.tipo_venta === "CREDITO") {
      const cxcQ = await client.query<{ id: string }>(
        `SELECT id::text FROM ${tCxC} WHERE venta_id=$1::uuid AND empresa_id=$2::uuid LIMIT 1`,
        [ventaId, empresaId]
      );
      const cxcId = cxcQ.rows[0]?.id ?? null;
      if (cxcId) {
        const ccQ = await client.query<{ n: string | number }>(
          `SELECT COUNT(*) AS n FROM ${tCC} WHERE cuenta_por_cobrar_id=$1::uuid AND empresa_id=$2::uuid`,
          [cxcId, empresaId]
        );
        if (Number(ccQ.rows[0]?.n ?? 0) > 0) {
          throw new AnulacionBloqueadaError(
            "credito_con_cobros",
            "La venta ya tiene cobros registrados. Revertí los cobros antes de anular."
          );
        }
        await client.query(`DELETE FROM ${tCxC} WHERE id=$1::uuid AND empresa_id=$2::uuid`, [cxcId, empresaId]);
        cxcBorrada = true;
      }
    }

    // Reponer stock.
    const itQ = await client.query<{
      producto_id: string;
      producto_nombre: string;
      sku: string;
      cantidad: string | number;
      cantidad_total_base: string | number | null;
    }>(
      `SELECT producto_id::text AS producto_id, producto_nombre, sku, cantidad, cantidad_total_base
         FROM ${tVI} WHERE venta_id=$1::uuid AND empresa_id=$2::uuid`,
      [ventaId, empresaId]
    );

    let stockDevuelto = 0;
    for (const it of itQ.rows) {
      // Cantidad a reponer: preferimos la cantidad en unidades base (respeta
      // presentaciones tipo Caja/Paquete que descontaron N unidades). Si no
      // esta snapshoteada, cae a `cantidad`.
      const cant = it.cantidad_total_base != null ? Number(it.cantidad_total_base) : Number(it.cantidad);
      if (!cant || cant <= 0) continue;

      const pQ = await client.query<{ costo_promedio: string | number; controla_stock: boolean | null }>(
        `SELECT costo_promedio, controla_stock FROM ${tP} WHERE id=$1::uuid AND empresa_id=$2::uuid FOR UPDATE`,
        [it.producto_id, empresaId]
      );
      const p = pQ.rows[0];
      if (!p) continue;
      if (p.controla_stock === false) continue; // productos tipo servicio: no tocar stock

      await client.query(
        `UPDATE ${tP} SET stock_actual = stock_actual + $3::numeric, updated_at = now()
          WHERE id=$1::uuid AND empresa_id=$2::uuid`,
        [it.producto_id, empresaId, cant]
      );
      await client.query(
        `INSERT INTO ${tMI} (
           empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad,
           costo_unitario, origen, referencia, venta_id, created_by, usuario_nombre
         ) VALUES ($1::uuid,$2::uuid,$3,$4,'ENTRADA',$5::numeric,$6::numeric,'ajuste_manual',$7,$8::uuid,$9::uuid,$10)`,
        [
          empresaId, it.producto_id, it.producto_nombre, it.sku ?? "",
          cant, Number(p.costo_promedio) || 0,
          `Anulacion venta ${v.numero_control}`,
          ventaId, usuario.id, usuario.nombre,
        ]
      );
      stockDevuelto++;
    }

    // Marcar la venta como anulada.
    await client.query(
      `UPDATE ${tV} SET estado='anulada', anulada_at=now(), anulada_por=$2::uuid,
              anulada_motivo=$3, updated_at=now()
        WHERE id=$1::uuid AND empresa_id=$4::uuid`,
      [ventaId, usuario.id, motivo?.trim() || null, empresaId]
    );

    await client.query("COMMIT");
    return {
      venta_id: ventaId,
      numero_control: v.numero_control,
      items_stock_devuelto: stockDevuelto,
      cuenta_por_cobrar_borrada: cxcBorrada,
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}
