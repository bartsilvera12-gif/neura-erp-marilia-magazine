-- =====================================================================
-- Sitio público Marilia Magazine: campos web en productos + tablas
-- shop-the-look e Instagram grid + RLS anon.
-- =====================================================================

-- 1) Asegurar campos web en productos (idempotente por si el schema ya los tenía)
ALTER TABLE mariliaerp.productos
  ADD COLUMN IF NOT EXISTS destacado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_web boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_productos_visible_web
  ON mariliaerp.productos (empresa_id, visible_web) WHERE visible_web = true;
CREATE INDEX IF NOT EXISTS idx_productos_destacado
  ON mariliaerp.productos (empresa_id, destacado) WHERE destacado = true;

-- 2) Shop the look: N combos, cada uno con N items ordenados
CREATE TABLE IF NOT EXISTS mariliaerp.sitio_shop_the_look (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES mariliaerp.empresas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  subtitulo text,
  imagen_url text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mariliaerp.sitio_shop_the_look_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  look_id uuid NOT NULL REFERENCES mariliaerp.sitio_shop_the_look(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES mariliaerp.productos(id) ON DELETE CASCADE,
  orden int NOT NULL DEFAULT 0,
  etiqueta text  -- ej "VESTIDOS", "ACCESORIOS", "CALZADO"
);

CREATE INDEX IF NOT EXISTS idx_shop_look_empresa_orden
  ON mariliaerp.sitio_shop_the_look (empresa_id, orden) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_shop_look_items_look_orden
  ON mariliaerp.sitio_shop_the_look_items (look_id, orden);

-- 3) Instagram grid
CREATE TABLE IF NOT EXISTS mariliaerp.sitio_instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES mariliaerp.empresas(id) ON DELETE CASCADE,
  imagen_url text NOT NULL,
  link text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_empresa_orden
  ON mariliaerp.sitio_instagram_posts (empresa_id, orden) WHERE activo = true;

-- 4) RLS: permitir SELECT desde `anon` (público) en las tablas que el sitio consulta
--    Grants ya aplicados antes cubren authenticated/service_role; acá abrimos anon.

-- Productos: solo activos y visibles al público
ALTER TABLE mariliaerp.productos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_productos_publicos ON mariliaerp.productos;
CREATE POLICY anon_read_productos_publicos ON mariliaerp.productos
  FOR SELECT TO anon
  USING (activo = true AND visible_web = true);
-- Autenticados: acceso amplio (el rol y empresa se filtran en app)
DROP POLICY IF EXISTS auth_all_productos ON mariliaerp.productos;
CREATE POLICY auth_all_productos ON mariliaerp.productos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Categorías: todo visible
ALTER TABLE mariliaerp.categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_categorias ON mariliaerp.categorias;
CREATE POLICY anon_read_categorias ON mariliaerp.categorias
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS auth_all_categorias ON mariliaerp.categorias;
CREATE POLICY auth_all_categorias ON mariliaerp.categorias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Shop the look
ALTER TABLE mariliaerp.sitio_shop_the_look ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_shop_the_look ON mariliaerp.sitio_shop_the_look;
CREATE POLICY anon_read_shop_the_look ON mariliaerp.sitio_shop_the_look
  FOR SELECT TO anon USING (activo = true);
DROP POLICY IF EXISTS auth_all_shop_the_look ON mariliaerp.sitio_shop_the_look;
CREATE POLICY auth_all_shop_the_look ON mariliaerp.sitio_shop_the_look
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE mariliaerp.sitio_shop_the_look_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_shop_the_look_items ON mariliaerp.sitio_shop_the_look_items;
CREATE POLICY anon_read_shop_the_look_items ON mariliaerp.sitio_shop_the_look_items
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS auth_all_shop_the_look_items ON mariliaerp.sitio_shop_the_look_items;
CREATE POLICY auth_all_shop_the_look_items ON mariliaerp.sitio_shop_the_look_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Instagram
ALTER TABLE mariliaerp.sitio_instagram_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_instagram ON mariliaerp.sitio_instagram_posts;
CREATE POLICY anon_read_instagram ON mariliaerp.sitio_instagram_posts
  FOR SELECT TO anon USING (activo = true);
DROP POLICY IF EXISTS auth_all_instagram ON mariliaerp.sitio_instagram_posts;
CREATE POLICY auth_all_instagram ON mariliaerp.sitio_instagram_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5) Grants a las tablas nuevas (mantienen el patrón del schema)
GRANT SELECT ON mariliaerp.sitio_shop_the_look, mariliaerp.sitio_shop_the_look_items, mariliaerp.sitio_instagram_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON mariliaerp.sitio_shop_the_look, mariliaerp.sitio_shop_the_look_items, mariliaerp.sitio_instagram_posts TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
