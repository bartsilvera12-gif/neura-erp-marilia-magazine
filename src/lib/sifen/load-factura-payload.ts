import type { AppSupabaseClient } from "@/lib/supabase/schema";
import {
  validateAndBuildSifenPayload,
  type BuildSifenPayloadInput,
} from "./build-payload";
import type { AmbienteSifen, SifenFacturaPayloadBase } from "./types";

export type LoadSifenPayloadFailure =
  | { status: 400; message: string }
  | { status: 404; message: string };

export type LoadSifenPayloadResult =
  | { ok: true; payload: SifenFacturaPayloadBase; ambiente: AmbienteSifen }
  | { ok: false; error: LoadSifenPayloadFailure };

function ambienteDesdeConfigRow(raw: unknown): AmbienteSifen {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "produccion" ? "produccion" : "test";
}

/**
 * Carga factura, ítems, cliente, config SIFEN y borrador electrónico;
 * valida y devuelve el payload base ERP (sin eventos de auditoría).
 */
export async function loadValidatedSifenPayload(
  supabase: AppSupabaseClient,
  empresaId: string,
  facturaId: string
): Promise<LoadSifenPayloadResult> {
  const fid = facturaId.trim();

  const { data: factura, error: errFactura } = await supabase
    .from("facturas")
    .select("id, cliente_id, cliente_razon_social, cliente_ruc, numero_factura, fecha, tipo, moneda, monto, saldo, origen_venta_id")
    .eq("id", fid)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (errFactura) {
    return { ok: false, error: { status: 400, message: errFactura.message } };
  }
  if (!factura) {
    return { ok: false, error: { status: 404, message: "Factura no encontrada" } };
  }

  // Venta ocasional: la factura guarda el receptor desnormalizado y no hay
  // ficha que consultar. Mandar el uuid nulo al filtro lo serializa como el
  // texto "null" y Postgres lo rechaza, así que se saltea la consulta.
  const clienteId = typeof factura.cliente_id === "string" && factura.cliente_id.trim()
    ? factura.cliente_id.trim()
    : null;

  const [itemsRes, clienteRes, configRes, electronicaRes] = await Promise.all([
    supabase
      .from("factura_items")
      .select("descripcion, cantidad, precio_unitario, subtotal, iva, total")
      .eq("factura_id", fid)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: true }),
    clienteId
      ? supabase
          .from("clientes")
          .select(
            "id, empresa, nombre_contacto, nombre, nombre_facturacion, ruc, documento, direccion, telefono, email, pais, sifen_receptor_extranjero, sifen_codigo_pais, sifen_tipo_doc_receptor, sifen_receptor_manual, sifen_receptor_naturaleza, sifen_ti_ope, sifen_num_id_de, sifen_direccion_de, sifen_num_casa_de, sifen_descripcion_tipo_doc"
          )
          .eq("id", clienteId)
          .eq("empresa_id", empresaId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("empresa_sifen_config")
      .select(
        "ruc, razon_social, direccion_fiscal, timbrado_numero, timbrado_fecha_inicio_vigencia, actividad_economica_codigo, actividad_economica_descripcion, establecimiento, punto_expedicion, csc, activo, ambiente"
      )
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("factura_electronica")
      .select("id, estado_sifen, sifen_regeneracion_seq")
      .eq("factura_id", fid)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);

  if (itemsRes.error) {
    return { ok: false, error: { status: 400, message: itemsRes.error.message } };
  }
  if (clienteRes.error) {
    return { ok: false, error: { status: 400, message: clienteRes.error.message } };
  }
  if (configRes.error) {
    return { ok: false, error: { status: 400, message: configRes.error.message } };
  }
  if (electronicaRes.error) {
    return { ok: false, error: { status: 400, message: electronicaRes.error.message } };
  }

  // Sin ficha de cliente el receptor sale de lo cargado en la caja. Un
  // identificador con guion se toma como RUC de contribuyente; si no, como CI.
  let clienteRow = clienteRes.data as BuildSifenPayloadInput["cliente"];
  if (!clienteId) {
    const razon = String(factura.cliente_razon_social ?? "").trim();
    const ident = String(factura.cliente_ruc ?? "").trim();
    if (!razon) {
      return {
        ok: false,
        error: { status: 400, message: "La factura no tiene razón social del receptor." },
      };
    }
    if (!ident) {
      return {
        ok: false,
        error: {
          status: 400,
          message: "Para facturar sin ficha de cliente hace falta el RUC o la cédula del receptor.",
        },
      };
    }
    const esRuc = ident.includes("-");
    clienteRow = {
      id: "",
      empresa: razon,
      nombre: razon,
      nombre_contacto: null,
      ruc: esRuc ? ident : null,
      documento: esRuc ? null : ident,
      direccion: null,
      telefono: null,
      email: null,
      pais: "PARAGUAY",
      sifen_receptor_extranjero: false,
      sifen_codigo_pais: null,
      sifen_tipo_doc_receptor: null,
      sifen_receptor_manual: false,
      sifen_receptor_naturaleza: null,
      sifen_ti_ope: null,
      sifen_num_id_de: null,
      sifen_direccion_de: null,
      sifen_num_casa_de: null,
      sifen_descripcion_tipo_doc: null,
    } as BuildSifenPayloadInput["cliente"];
  }

  // Enriquecer items con codigo_proveedor via la venta origen (si existe).
  // El KuDE muestra dCodInt como "Codigo" y por defecto arrancaba en L1/L2/etc.;
  // ahora sale el codigo real del catalogo cuando el producto lo tiene cargado.
  // Se matchea por descripcion (unica por linea dentro de la misma venta).
  const rawItems = (itemsRes.data ?? []) as unknown as Array<{
    descripcion: string;
    cantidad: unknown;
    precio_unitario: unknown;
    subtotal: unknown;
    iva: unknown;
    total: unknown;
  }>;
  const codigoByDescripcion = new Map<string, string>();
  const ventaId = typeof factura.origen_venta_id === "string" && factura.origen_venta_id.trim()
    ? factura.origen_venta_id.trim()
    : null;
  if (ventaId) {
    try {
      const vi = await supabase
        .from("ventas_items")
        .select("producto_id, producto_nombre")
        .eq("venta_id", ventaId)
        .eq("empresa_id", empresaId);
      const viRows = ((vi.data ?? []) as unknown as Array<{ producto_id: string; producto_nombre: string }>).filter(
        (r) => r.producto_id
      );
      const prodIds = [...new Set(viRows.map((r) => r.producto_id))];
      if (prodIds.length > 0) {
        const pQ = await supabase
          .from("productos")
          .select("id, codigo_proveedor")
          .eq("empresa_id", empresaId)
          .in("id", prodIds);
        const codigoByProd = new Map<string, string>();
        for (const p of (pQ.data ?? []) as Array<{ id: string; codigo_proveedor: string | null }>) {
          if (p.codigo_proveedor && p.codigo_proveedor.trim()) {
            codigoByProd.set(p.id, p.codigo_proveedor.trim());
          }
        }
        for (const r of viRows) {
          const codigo = codigoByProd.get(r.producto_id);
          if (codigo && r.producto_nombre) {
            codigoByDescripcion.set(r.producto_nombre.trim(), codigo);
          }
        }
      }
    } catch {
      // Si la resolucion falla, cae al fallback L1/L2 — no bloqueamos la factura.
    }
  }
  const itemsWithCodigo = rawItems.map((r) => ({
    ...r,
    codigo: codigoByDescripcion.get((r.descripcion ?? "").trim()) ?? null,
  }));

  const buildInput: BuildSifenPayloadInput = {
    factura: {
      id: factura.id as string,
      cliente_id: (factura.cliente_id ?? "") as string,
      numero_factura: factura.numero_factura as string,
      fecha: factura.fecha as string,
      tipo: factura.tipo as string,
      moneda: factura.moneda as string,
      monto: factura.monto,
      saldo: factura.saldo,
    },
    items: itemsWithCodigo as BuildSifenPayloadInput["items"],
    cliente: clienteRow,
    config: configRes.data as BuildSifenPayloadInput["config"],
    facturaElectronica: electronicaRes.data as BuildSifenPayloadInput["facturaElectronica"],
  };

  const built = validateAndBuildSifenPayload(buildInput);
  if (!built.ok) {
    return { ok: false, error: { status: 400, message: built.error } };
  }

  return {
    ok: true,
    payload: built.payload,
    ambiente: ambienteDesdeConfigRow(configRes.data?.ambiente),
  };
}
