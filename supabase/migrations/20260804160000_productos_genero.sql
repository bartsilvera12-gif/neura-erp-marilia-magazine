-- Género del producto, para el filtro Mujer/Hombre del sitio.
--
-- El catálogo del proveedor no trae el dato: de 6.346 modelos, solo el 4,8%
-- se podía deducir del nombre o de la categoría. Así que se carga a mano desde
-- el ERP, apoyándose en la asignación masiva por categoría.
--
-- `null` = sin clasificar todavía (no aparece en los filtros por género).

ALTER TABLE mariliaerp.productos
  ADD COLUMN IF NOT EXISTS genero text;

DO $$
BEGIN
  ALTER TABLE mariliaerp.productos
    ADD CONSTRAINT productos_genero_check
    CHECK (genero IS NULL OR genero IN ('mujer', 'hombre', 'unisex'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_productos_genero
  ON mariliaerp.productos (empresa_id, genero)
  WHERE genero IS NOT NULL;

-- La vista del sitio lo expone para poder filtrar Mujer/Hombre.
CREATE OR REPLACE VIEW mariliaerp.sitio_modelos
WITH (security_invoker = true) AS
SELECT DISTINCT ON (p.codigo_proveedor)
  p.id,
  p.empresa_id,
  p.codigo_proveedor,
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
  p.destacado,
  p.genero
FROM mariliaerp.productos p
WHERE p.activo = true
  AND p.visible_web IS DISTINCT FROM false
  AND p.codigo_proveedor IS NOT NULL
ORDER BY p.codigo_proveedor,
         (p.imagen_url IS NULL),
         (p.precio_venta = 0),
         p.nombre;

GRANT SELECT ON mariliaerp.sitio_modelos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
