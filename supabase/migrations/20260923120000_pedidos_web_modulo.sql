-- Módulo "Pedidos web": pedidos de la tienda online + tablero de entregas.
--
-- Portado desde MANASTINA (mismo ERP). Estructura idéntica para que la tienda
-- online cree los pedidos igual que allá. El ERP lee la vista `v_web_pedidos`
-- (arma el resumen de items, el link de WhatsApp, etc.) y cambia el estado de
-- entrega con la función `web_marcar_envio`.
--
-- La tienda online inserta en `web_pedidos` / `web_pedido_items` (etapa aparte).

-- ── Tablas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mariliaerp.web_pedidos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pedido_comercio   bigint NOT NULL,
  empresa_id           uuid,
  cliente_nombre       text NOT NULL,
  cliente_email        text NOT NULL,
  cliente_telefono     text NOT NULL,
  cliente_documento    text NOT NULL,
  ciudad_codigo        text NOT NULL,
  ciudad_nombre        text,
  direccion            text DEFAULT '',
  direccion_referencia text DEFAULT '',
  modalidad            text NOT NULL DEFAULT 'envio',
  observaciones        text DEFAULT '',
  subtotal             bigint NOT NULL,
  envio                bigint NOT NULL DEFAULT 0,
  total                bigint NOT NULL,
  estado_pago          text NOT NULL DEFAULT 'pendiente',
  pagopar_hash         text,
  pagopar_link         text,
  pagopar_forma_pago   text,
  pagopar_respuesta    jsonb,
  pagado_at            timestamptz,
  venta_id             uuid,
  cliente_id           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  ciudad_hub_pagopar   text,
  envio_estimado       bigint,
  envio_aparte         boolean NOT NULL DEFAULT false,
  stock_descontado_at  timestamptz,
  estado_envio         text NOT NULL DEFAULT 'pendiente',
  preparando_at        timestamptz,
  enviado_at           timestamptz,
  entregado_at         timestamptz,
  notas_internas       text,
  consultado_at        timestamptz
);

CREATE TABLE IF NOT EXISTS mariliaerp.web_pedido_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        uuid NOT NULL REFERENCES mariliaerp.web_pedidos(id) ON DELETE CASCADE,
  producto_codigo  text NOT NULL,
  producto_id      uuid,
  nombre           text NOT NULL,
  color            text DEFAULT '',
  cantidad         integer NOT NULL,
  precio_unitario  bigint NOT NULL,
  total_linea      bigint NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  variante_id      uuid
);

CREATE INDEX IF NOT EXISTS idx_web_pedidos_estado ON mariliaerp.web_pedidos (estado_pago, estado_envio, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_pedido_items_pedido ON mariliaerp.web_pedido_items (pedido_id);

-- ── Vista que consume el ERP ────────────────────────────────────────────────
CREATE OR REPLACE VIEW mariliaerp.v_web_pedidos AS
 SELECT p.id,
    p.id_pedido_comercio AS numero_pedido,
    p.empresa_id,
    p.estado_pago,
    p.estado_pago = 'pagado'::text AS esta_pagado,
    p.pagado_at,
    p.created_at AS fecha_pedido,
    p.estado_envio,
    p.preparando_at,
    p.enviado_at,
    p.entregado_at,
    p.notas_internas,
    p.envio_aparte AS cobrar_envio_al_entregar,
    p.cliente_nombre,
    p.cliente_telefono,
    p.cliente_email,
    p.cliente_documento,
        CASE
            WHEN p.cliente_telefono ~ '^595'::text THEN p.cliente_telefono
            WHEN p.cliente_telefono ~ '^0'::text THEN '595'::text || SUBSTRING(p.cliente_telefono FROM 2)
            WHEN length(p.cliente_telefono) = 9 THEN '595'::text || p.cliente_telefono
            ELSE p.cliente_telefono
        END AS whatsapp_numero,
    (('https://wa.me/'::text ||
        CASE
            WHEN p.cliente_telefono ~ '^595'::text THEN p.cliente_telefono
            WHEN p.cliente_telefono ~ '^0'::text THEN '595'::text || SUBSTRING(p.cliente_telefono FROM 2)
            WHEN length(p.cliente_telefono) = 9 THEN '595'::text || p.cliente_telefono
            ELSE p.cliente_telefono
        END) || '?text=Hola,%20te%20escribimos%20de%20Mar%C3%ADlia%20Magazine%20por%20tu%20pedido%20%23'::text) || p.id_pedido_comercio AS whatsapp_link,
    p.modalidad,
    p.ciudad_codigo AS ciudad_clave,
    p.ciudad_nombre,
    p.direccion,
    p.direccion_referencia,
    p.observaciones,
    p.subtotal,
    p.envio AS envio_cobrado,
    p.total AS total_cobrado,
    p.envio_estimado AS envio_tarifa,
        CASE
            WHEN p.envio_aparte THEN p.envio_estimado
            ELSE 0::bigint
        END AS envio_a_cobrar,
    COALESCE(i.cantidad_articulos, 0::bigint) AS cantidad_articulos,
    COALESCE(i.resumen, ''::text) AS detalle,
    COALESCE(i.items, '[]'::jsonb) AS items,
    p.venta_id,
    v.numero_control AS venta_numero,
    p.cliente_id,
    p.pagopar_hash,
    p.pagopar_forma_pago AS forma_pago
   FROM mariliaerp.web_pedidos p
     LEFT JOIN mariliaerp.ventas v ON v.id = p.venta_id
     LEFT JOIN LATERAL ( SELECT sum(d.cantidad) AS cantidad_articulos,
            string_agg(((d.cantidad || ' x '::text) || d.nombre) ||
                CASE
                    WHEN COALESCE(d.color, ''::text) <> ''::text THEN (' ('::text || d.color) || ')'::text
                    ELSE ''::text
                END, ' - '::text ORDER BY d.nombre) AS resumen,
            jsonb_agg(jsonb_build_object('codigo', d.producto_codigo, 'producto_id', d.producto_id, 'nombre', d.nombre, 'color', d.color, 'cantidad', d.cantidad, 'precio_unitario', d.precio_unitario, 'total_linea', d.total_linea) ORDER BY d.nombre) AS items
           FROM mariliaerp.web_pedido_items d
          WHERE d.pedido_id = p.id) i ON true;

-- ── Función para cambiar el estado de entrega ───────────────────────────────
CREATE OR REPLACE FUNCTION mariliaerp.web_marcar_envio(p_pedido uuid, p_estado text, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mariliaerp', 'public'
AS $function$
declare
  v_estado text := lower(trim(p_estado));
begin
  if v_estado not in ('pendiente','preparando','enviado','entregado','cancelado') then
    return jsonb_build_object('ok', false, 'error', 'estado no valido: ' || p_estado);
  end if;

  update mariliaerp.web_pedidos
     set estado_envio   = v_estado,
         preparando_at  = case when v_estado = 'preparando' then coalesce(preparando_at, now()) else preparando_at end,
         enviado_at     = case when v_estado = 'enviado'    then coalesce(enviado_at, now())    else enviado_at end,
         entregado_at   = case when v_estado = 'entregado'  then coalesce(entregado_at, now())  else entregado_at end,
         notas_internas = coalesce(nullif(trim(coalesce(p_nota, '')), ''), notas_internas),
         updated_at     = now()
   where id = p_pedido;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'pedido no encontrado');
  end if;

  return jsonb_build_object('ok', true, 'estado_envio', v_estado);
end $function$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- La tienda online (anon) inserta pedidos y lee su estado; el ERP
-- (authenticated/service_role) los administra. service_role igual bypassa RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON mariliaerp.web_pedidos TO authenticated, service_role, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON mariliaerp.web_pedido_items TO authenticated, service_role, anon;
GRANT SELECT ON mariliaerp.v_web_pedidos TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION mariliaerp.web_marcar_envio(uuid, text, text) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
