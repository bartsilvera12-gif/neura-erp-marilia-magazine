-- Descuento porcentual sobre el total de la venta (Caja / Confirmar venta).
--
-- Se guarda el porcentaje ingresado y el monto calculado para poder identificar
-- después qué descuento se aplicó. El `total` de la venta pasa a ser el total YA
-- con el descuento aplicado (lo efectivamente cobrado); `subtotal` y `monto_iva`
-- se conservan como el bruto (sin descuento) para el desglose.

ALTER TABLE mariliaerp.ventas
  ADD COLUMN IF NOT EXISTS descuento_porcentaje numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_monto      numeric NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
