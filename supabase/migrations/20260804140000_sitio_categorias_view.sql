-- Categorías del sitio, con la cantidad de MODELOS de cada una.
--
-- El filtro del catálogo mostraba las 64 categorías en orden alfabético, todas
-- del mismo peso: un muro de chips donde CAMISETA (1.858 modelos) quedaba igual
-- que CERVEJA (2). Con el conteo se pueden ordenar por relevancia y descartar
-- las que quedaron vacías.
--
-- Se cuentan modelos (codigo_proveedor distinto), no variantes, para que el
-- número coincida con las tarjetas que ve el visitante.

CREATE OR REPLACE VIEW mariliaerp.sitio_categorias
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.nombre,
  count(DISTINCT p.codigo_proveedor)::int AS modelos
FROM mariliaerp.categorias_productos c
JOIN mariliaerp.productos p
  ON p.categoria_principal_id = c.id
WHERE p.activo = true
  AND p.visible_web IS DISTINCT FROM false
  AND p.codigo_proveedor IS NOT NULL
GROUP BY c.id, c.nombre;

GRANT SELECT ON mariliaerp.sitio_categorias TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
