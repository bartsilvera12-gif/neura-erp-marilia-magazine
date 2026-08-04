-- Vista de MODELOS para el sitio público.
--
-- `productos` tiene una fila por variante (modelo × color × talla): con el
-- catálogo TFLOW son 24.283 filas para 6.346 modelos. El sitio muestra una
-- tarjeta por modelo, y PostgREST corta las respuestas en 1.000 filas, así que
-- pedir el catálogo entero y agrupar en el browser no sirve.
--
-- Esta vista devuelve UNA fila por `codigo_proveedor` — la variante con foto si
-- alguna la tiene — para poder paginar y filtrar del lado del servidor.
--
-- `security_invoker` hace que la vista respete la RLS de `productos` con el rol
-- que consulta (anon), en vez de correr con los permisos del dueño.

CREATE OR REPLACE VIEW mariliaerp.sitio_modelos
WITH (security_invoker = true) AS
SELECT DISTINCT ON (p.codigo_proveedor)
  p.id,
  p.empresa_id,
  p.codigo_proveedor,
  -- El nombre se armó como "DESCRIPCION - COLOR - TALLA"; para la tarjeta
  -- queremos solo la descripción. Se recorta por longitud (no por split) para
  -- no romper descripciones que ya tengan un guion.
  CASE
    WHEN p.color_nombre IS NOT NULL AND p.talla_nombre IS NOT NULL
      AND p.nombre LIKE '% - ' || p.color_nombre || ' - ' || p.talla_nombre
      THEN left(p.nombre, length(p.nombre) - length(' - ' || p.color_nombre || ' - ' || p.talla_nombre))
    WHEN p.color_nombre IS NOT NULL AND p.nombre LIKE '% - ' || p.color_nombre
      THEN left(p.nombre, length(p.nombre) - length(' - ' || p.color_nombre))
    ELSE p.nombre
  END AS nombre_modelo,
  p.precio_venta,
  p.imagen_url,
  p.categoria_principal_id,
  p.destacado
FROM mariliaerp.productos p
WHERE p.activo = true
  AND p.visible_web IS DISTINCT FROM false
  AND p.codigo_proveedor IS NOT NULL
ORDER BY p.codigo_proveedor,
         -- Representante: preferimos la variante que tenga foto y precio.
         (p.imagen_url IS NULL),
         (p.precio_venta = 0),
         p.nombre;

GRANT SELECT ON mariliaerp.sitio_modelos TO anon, authenticated, service_role;

-- Índices que sostienen el filtrado y el buscador del sitio.
CREATE INDEX IF NOT EXISTS idx_productos_web_categoria
  ON mariliaerp.productos (categoria_principal_id)
  WHERE activo = true AND visible_web IS DISTINCT FROM false;

-- Buscador por texto. Requiere pg_trgm; si no está disponible se omite y el
-- ILIKE sigue funcionando (más lento, pero a 24k filas es tolerable).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm
    ON mariliaerp.productos USING gin (nombre gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm no disponible, se omite el índice de búsqueda';
END $$;

NOTIFY pgrst, 'reload schema';
