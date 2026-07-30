-- ============================================================================
-- Maria Cuevas (tienda de ropa) - Inventario Fase 1
-- Schema: mariacuevas (instancia monocliente dedicada). NO toca otros schemas.
-- Modelo hibrido: producto_base (prenda/modelo) + productos (variantes color/talla).
-- Las variantes siguen siendo filas de `productos` (producto_id), por lo que
-- ventas / compras / movimientos / stock NO se rompen (siguen por producto_id).
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS / seed con WHERE NOT EXISTS).
-- ============================================================================

-- ---------- Catalogo: colores ----------
CREATE TABLE IF NOT EXISTS mariacuevas.prenda_colores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nombre     text NOT NULL,
  codigo_hex text,
  activo     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ---------- Catalogo: tallas ----------
CREATE TABLE IF NOT EXISTS mariacuevas.prenda_tallas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nombre     text NOT NULL,
  orden      int DEFAULT 0,
  activo     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ---------- Prenda base (agrupador) ----------
CREATE TABLE IF NOT EXISTS mariacuevas.producto_base (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid NOT NULL,
  nombre                 text NOT NULL,
  categoria_id           uuid,
  tipo_corte             text NOT NULL DEFAULT 'unisex',
  material               text,
  temporada              text,
  marca                  text,
  descripcion            text,
  imagen_url             text,
  imagen_path            text,
  estado                 text NOT NULL DEFAULT 'activo',
  proveedor_principal_id uuid,
  activo                 boolean DEFAULT true,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  CONSTRAINT producto_base_tipo_corte_chk CHECK (tipo_corte IN ('masculino','femenino','unisex')),
  CONSTRAINT producto_base_estado_chk     CHECK (estado IN ('activo','agotado','discontinuado'))
);

-- ---------- Columnas nuevas en productos (variante) ----------
ALTER TABLE mariacuevas.productos
  ADD COLUMN IF NOT EXISTS producto_base_id uuid,
  ADD COLUMN IF NOT EXISTS color_id         uuid,
  ADD COLUMN IF NOT EXISTS talla_id         uuid,
  ADD COLUMN IF NOT EXISTS precio_costo     numeric,
  ADD COLUMN IF NOT EXISTS precio_mayorista numeric,
  ADD COLUMN IF NOT EXISTS precio_minorista numeric;

-- ---------- FKs (idempotentes; tabla productos vacia => validacion instantanea) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_producto_base_id_fkey' AND connamespace = 'mariacuevas'::regnamespace) THEN
    ALTER TABLE mariacuevas.productos ADD CONSTRAINT productos_producto_base_id_fkey
      FOREIGN KEY (producto_base_id) REFERENCES mariacuevas.producto_base(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_color_id_fkey' AND connamespace = 'mariacuevas'::regnamespace) THEN
    ALTER TABLE mariacuevas.productos ADD CONSTRAINT productos_color_id_fkey
      FOREIGN KEY (color_id) REFERENCES mariacuevas.prenda_colores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_talla_id_fkey' AND connamespace = 'mariacuevas'::regnamespace) THEN
    ALTER TABLE mariacuevas.productos ADD CONSTRAINT productos_talla_id_fkey
      FOREIGN KEY (talla_id) REFERENCES mariacuevas.prenda_tallas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------- Indices ----------
CREATE INDEX IF NOT EXISTS idx_productos_producto_base_id ON mariacuevas.productos (producto_base_id);
CREATE INDEX IF NOT EXISTS idx_productos_color_id         ON mariacuevas.productos (color_id);
CREATE INDEX IF NOT EXISTS idx_productos_talla_id         ON mariacuevas.productos (talla_id);
CREATE INDEX IF NOT EXISTS idx_producto_base_empresa_id   ON mariacuevas.producto_base (empresa_id);
CREATE INDEX IF NOT EXISTS idx_prenda_colores_empresa_id  ON mariacuevas.prenda_colores (empresa_id);
CREATE INDEX IF NOT EXISTS idx_prenda_tallas_empresa_id   ON mariacuevas.prenda_tallas (empresa_id);

-- ---------- Unique (empresa_id, lower(nombre)) ----------
CREATE UNIQUE INDEX IF NOT EXISTS uq_prenda_colores_empresa_nombre ON mariacuevas.prenda_colores (empresa_id, lower(nombre));
CREATE UNIQUE INDEX IF NOT EXISTS uq_prenda_tallas_empresa_nombre  ON mariacuevas.prenda_tallas  (empresa_id, lower(nombre));

-- ---------- RLS + policies (mismo patron del schema) ----------
ALTER TABLE mariacuevas.prenda_colores ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariacuevas.prenda_tallas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mariacuevas.producto_base  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prenda_colores_select ON mariacuevas.prenda_colores;
CREATE POLICY prenda_colores_select ON mariacuevas.prenda_colores FOR SELECT USING (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS prenda_colores_insert ON mariacuevas.prenda_colores;
CREATE POLICY prenda_colores_insert ON mariacuevas.prenda_colores FOR INSERT WITH CHECK (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS prenda_colores_update ON mariacuevas.prenda_colores;
CREATE POLICY prenda_colores_update ON mariacuevas.prenda_colores FOR UPDATE USING (mariacuevas.puede_acceder_empresa(empresa_id)) WITH CHECK (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS prenda_colores_delete ON mariacuevas.prenda_colores;
CREATE POLICY prenda_colores_delete ON mariacuevas.prenda_colores FOR DELETE USING (mariacuevas.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS prenda_tallas_select ON mariacuevas.prenda_tallas;
CREATE POLICY prenda_tallas_select ON mariacuevas.prenda_tallas FOR SELECT USING (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS prenda_tallas_insert ON mariacuevas.prenda_tallas;
CREATE POLICY prenda_tallas_insert ON mariacuevas.prenda_tallas FOR INSERT WITH CHECK (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS prenda_tallas_update ON mariacuevas.prenda_tallas;
CREATE POLICY prenda_tallas_update ON mariacuevas.prenda_tallas FOR UPDATE USING (mariacuevas.puede_acceder_empresa(empresa_id)) WITH CHECK (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS prenda_tallas_delete ON mariacuevas.prenda_tallas;
CREATE POLICY prenda_tallas_delete ON mariacuevas.prenda_tallas FOR DELETE USING (mariacuevas.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS producto_base_select ON mariacuevas.producto_base;
CREATE POLICY producto_base_select ON mariacuevas.producto_base FOR SELECT USING (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS producto_base_insert ON mariacuevas.producto_base;
CREATE POLICY producto_base_insert ON mariacuevas.producto_base FOR INSERT WITH CHECK (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS producto_base_update ON mariacuevas.producto_base;
CREATE POLICY producto_base_update ON mariacuevas.producto_base FOR UPDATE USING (mariacuevas.puede_acceder_empresa(empresa_id)) WITH CHECK (mariacuevas.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS producto_base_delete ON mariacuevas.producto_base;
CREATE POLICY producto_base_delete ON mariacuevas.producto_base FOR DELETE USING (mariacuevas.puede_acceder_empresa(empresa_id));

-- ---------- Grants (mismo patron del schema) ----------
GRANT SELECT ON TABLE mariacuevas.prenda_colores TO anon;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE mariacuevas.prenda_colores TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE mariacuevas.prenda_colores TO service_role;
GRANT SELECT ON TABLE mariacuevas.prenda_tallas TO anon;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE mariacuevas.prenda_tallas TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE mariacuevas.prenda_tallas TO service_role;
GRANT SELECT ON TABLE mariacuevas.producto_base TO anon;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE mariacuevas.producto_base TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE mariacuevas.producto_base TO service_role;

-- ---------- Seed catalogos para Maria Cuevas (empresa 31bd91da-...) ----------
INSERT INTO mariacuevas.prenda_colores (empresa_id, nombre)
SELECT '31bd91da-69d9-4637-a70c-d5aacb56953b'::uuid, v.nombre
FROM (VALUES ('Negro'),('Blanco'),('Rojo'),('Azul'),('Verde'),('Rosa'),('Beige'),('Marrón'),('Gris')) AS v(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM mariacuevas.prenda_colores p
  WHERE p.empresa_id = '31bd91da-69d9-4637-a70c-d5aacb56953b'::uuid AND lower(p.nombre) = lower(v.nombre)
);

INSERT INTO mariacuevas.prenda_tallas (empresa_id, nombre, orden)
SELECT '31bd91da-69d9-4637-a70c-d5aacb56953b'::uuid, v.nombre, v.orden
FROM (VALUES ('XS',1),('S',2),('M',3),('L',4),('XL',5),('XXL',6),('Único',7)) AS v(nombre, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM mariacuevas.prenda_tallas p
  WHERE p.empresa_id = '31bd91da-69d9-4637-a70c-d5aacb56953b'::uuid AND lower(p.nombre) = lower(v.nombre)
);
