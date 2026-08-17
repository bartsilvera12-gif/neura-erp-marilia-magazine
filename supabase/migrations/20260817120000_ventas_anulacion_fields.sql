-- =====================================================================
-- Campos de auditoria para la anulacion de ventas.
--
-- El path /api/ventas/[id]/anular graba estado='anulada', anulada_at,
-- anulada_por y anulada_motivo, pero las columnas nunca fueron creadas en
-- mariliaerp.ventas. El UPDATE falla con "column anulada_at of relation
-- ventas does not exist" y el operador ve un error crudo de Postgres al
-- intentar anular.
--
-- Alcance: schema `mariliaerp`. Aditivo e idempotente.
-- =====================================================================

ALTER TABLE mariliaerp.ventas
  ADD COLUMN IF NOT EXISTS anulada_at     timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_por    uuid,
  ADD COLUMN IF NOT EXISTS anulada_motivo text;

COMMENT ON COLUMN mariliaerp.ventas.anulada_at IS
  'Momento en que se anulo la venta. NULL para ventas activas.';
COMMENT ON COLUMN mariliaerp.ventas.anulada_por IS
  'Usuario del catalogo que ejecuto la anulacion.';
COMMENT ON COLUMN mariliaerp.ventas.anulada_motivo IS
  'Motivo declarado por el operador al anular (opcional, hasta 500 chars).';
