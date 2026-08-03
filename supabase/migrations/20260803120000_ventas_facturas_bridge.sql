-- =====================================================================
-- Puente Venta -> Factura ERP (SIFEN legal).
--
-- Al cobrar en Caja con "Factura electronica", el server crea ademas de la
-- venta una factura FAC-XXXXXX con sus lineas y deja `ventas.factura_id`
-- linkeado. El detalle /facturas/[id] usa el FacturaElectronicaPanel para
-- firmar, enviar a SIFEN e imprimir el KUDE.
--
-- `facturas.cliente_id` pasa a ser nullable: se puede facturar a un ocasional
-- sin ficha de cliente, con la razon social y el RUC denormalizados.
--
-- ALCANCE: SOLO el schema `mariliaerp`. Idempotente y aditivo.
-- =====================================================================

ALTER TABLE mariliaerp.facturas
  ADD COLUMN IF NOT EXISTS cliente_razon_social text,
  ADD COLUMN IF NOT EXISTS cliente_ruc          text,
  ADD COLUMN IF NOT EXISTS origen_venta_id      uuid,
  ADD COLUMN IF NOT EXISTS observaciones        text;

ALTER TABLE mariliaerp.facturas
  ALTER COLUMN cliente_id DROP NOT NULL;

COMMENT ON COLUMN mariliaerp.facturas.cliente_razon_social IS
  'Receptor de la factura (snapshot). Sin ficha de cliente es el unico dato obligatorio.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_empresa_numero
  ON mariliaerp.facturas (empresa_id, numero_factura);

CREATE INDEX IF NOT EXISTS idx_facturas_origen_venta
  ON mariliaerp.facturas (origen_venta_id);

ALTER TABLE mariliaerp.ventas
  ADD COLUMN IF NOT EXISTS factura_id uuid;

ALTER TABLE mariliaerp.ventas
  DROP CONSTRAINT IF EXISTS ventas_factura_id_fkey;

ALTER TABLE mariliaerp.ventas
  ADD CONSTRAINT ventas_factura_id_fkey
  FOREIGN KEY (factura_id) REFERENCES mariliaerp.facturas (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ventas_factura
  ON mariliaerp.ventas (factura_id);

-- Desglose de IVA por linea: es lo que consume el mapeo a SIFEN.
ALTER TABLE mariliaerp.factura_items
  ADD COLUMN IF NOT EXISTS tipo_iva text;

UPDATE mariliaerp.factura_items SET tipo_iva = '10%' WHERE tipo_iva IS NULL;

ALTER TABLE mariliaerp.factura_items
  ALTER COLUMN tipo_iva SET NOT NULL;

ALTER TABLE mariliaerp.factura_items
  DROP CONSTRAINT IF EXISTS factura_items_tipo_iva_check;

ALTER TABLE mariliaerp.factura_items
  ADD CONSTRAINT factura_items_tipo_iva_check
  CHECK (tipo_iva IN ('EXENTA', '5%', '10%'));

NOTIFY pgrst, 'reload schema';
