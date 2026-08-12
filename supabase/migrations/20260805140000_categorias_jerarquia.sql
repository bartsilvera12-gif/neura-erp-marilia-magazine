-- Jerarquía padre → subcategoría en `categorias_productos`.
--
-- El catálogo del proveedor viene con 64 categorías planas (CAMISETA, POLO,
-- CHINELO…) y en el sitio las agrupabamos por familia con un mapeo hardcodeado
-- en el JS. Ahora la jerarquía vive en la DB: cada categoría puede tener una
-- categoría padre, y las 8 padres oficiales (Ropa, Calzado, Accesorios, Bolsos,
-- Bijou, Perfumería, Bazar, Otros) se crean con este script.
--
-- Ejecutable varias veces sin efecto: los INSERTs y UPDATEs son idempotentes.

DO $$
DECLARE
  v_empresa uuid;
  v_ropa uuid; v_calz uuid; v_acc uuid; v_bol uuid;
  v_bij uuid; v_per uuid; v_baz uuid; v_otr uuid;
BEGIN
  SELECT id INTO v_empresa FROM mariliaerp.empresas WHERE data_schema = 'mariliaerp' LIMIT 1;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'No se encontró la empresa Marilia en mariliaerp.empresas';
  END IF;

  -- 1) Columna parent_id + índice
  ALTER TABLE mariliaerp.categorias_productos
    ADD COLUMN IF NOT EXISTS parent_id uuid;

  BEGIN
    ALTER TABLE mariliaerp.categorias_productos
      ADD CONSTRAINT categorias_productos_parent_fkey
      FOREIGN KEY (parent_id)
      REFERENCES mariliaerp.categorias_productos(id)
      ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  CREATE INDEX IF NOT EXISTS idx_categorias_productos_parent
    ON mariliaerp.categorias_productos (empresa_id, parent_id);

  -- 2) Crear las 8 padres (idempotente por índice único empresa_id+nombre).
  --    Después leo cada id para asignar los hijos.
  INSERT INTO mariliaerp.categorias_productos (empresa_id, nombre, parent_id)
  VALUES
    (v_empresa, 'Ropa',       NULL),
    (v_empresa, 'Calzado',    NULL),
    (v_empresa, 'Accesorios', NULL),
    (v_empresa, 'Bolsos',     NULL),
    (v_empresa, 'Bijou',      NULL),
    (v_empresa, 'Perfumería', NULL),
    (v_empresa, 'Bazar',      NULL),
    (v_empresa, 'Otros',      NULL)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ropa FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Ropa'       LIMIT 1;
  SELECT id INTO v_calz FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Calzado'    LIMIT 1;
  SELECT id INTO v_acc  FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Accesorios' LIMIT 1;
  SELECT id INTO v_bol  FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Bolsos'     LIMIT 1;
  SELECT id INTO v_bij  FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Bijou'      LIMIT 1;
  SELECT id INTO v_per  FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Perfumería' LIMIT 1;
  SELECT id INTO v_baz  FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Bazar'      LIMIT 1;
  SELECT id INTO v_otr  FROM mariliaerp.categorias_productos WHERE empresa_id=v_empresa AND nombre='Otros'      LIMIT 1;

  -- 3) Reasignar las 64 subcategorías del proveedor a su padre.
  UPDATE mariliaerp.categorias_productos SET parent_id = v_ropa
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('CAMISETA','CAMISA','POLO','BLUSA','TOP','BODY','MALHA',
       'SHORTS','BERMUDA','CALÇA','CALCA','CALÇA JEANS','CALCA JEANS','SAIA','VESTIDO',
       'JAQUETA','CASACO','BLAZER','COLETE','SUETER','MOLETOM','CONJUNTO',
       'PILOTOS','CAPA DE CHUVA','CUECA','SUNGA','MEIA');

  UPDATE mariliaerp.categorias_productos SET parent_id = v_calz
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('TENIS','CHINELO','SAPATO','SAPATENIS','MULE');

  UPDATE mariliaerp.categorias_productos SET parent_id = v_acc
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('BONE','OCULOS','CARTEIRA','GORRO','CHAPEU','CHAVEIRO');

  UPDATE mariliaerp.categorias_productos SET parent_id = v_bol
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('MOCHILA','MALA','SACOLA','PORTA TRECO','CINTO');

  UPDATE mariliaerp.categorias_productos SET parent_id = v_bij
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('PULSEIRA','COLAR','BRACELETE','CORRENTE');

  UPDATE mariliaerp.categorias_productos SET parent_id = v_per
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('PERFUME','ESSENCIA','MASCARA');

  UPDATE mariliaerp.categorias_productos SET parent_id = v_baz
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('COPO','CANECA','GARRAFA TERMICA');

  UPDATE mariliaerp.categorias_productos SET parent_id = v_otr
   WHERE empresa_id = v_empresa AND parent_id IS NULL
     AND upper(nombre) IN ('PAPEL','PECAS BAZAR','BALA','EXPOSITOR','FITA','CAIXA',
       'CARTAO','ADESIVO','DIVERSOS','IMPRESSOS','CERVEJA','ETIQUETA','CABIDE');
END $$;

-- 4) La vista sitio_categorias suma modelos por padre para el menú del sitio.
--    Cada modelo se cuenta bajo su categoría directa Y bajo el padre de esa.
--    Se DROPea antes: la vista anterior devolvía otras columnas y en ese caso
--    `CREATE OR REPLACE VIEW` falla con "cannot change name of view column".
DROP VIEW IF EXISTS mariliaerp.sitio_categorias;

CREATE VIEW mariliaerp.sitio_categorias
WITH (security_invoker = true) AS
WITH conteos AS (
  SELECT p.categoria_principal_id AS cat_id, count(DISTINCT p.codigo_proveedor) AS modelos
    FROM mariliaerp.productos p
   WHERE p.activo = true
     AND p.visible_web IS DISTINCT FROM false
     AND p.codigo_proveedor IS NOT NULL
     AND p.categoria_principal_id IS NOT NULL
   GROUP BY p.categoria_principal_id
)
SELECT
  c.id,
  c.nombre,
  c.parent_id,
  -- Modelos directos + modelos de las hijas.
  (COALESCE((SELECT modelos FROM conteos WHERE cat_id = c.id), 0)
   + COALESCE((SELECT sum(modelos)::int FROM conteos co
                 JOIN mariliaerp.categorias_productos ch ON ch.id = co.cat_id
                WHERE ch.parent_id = c.id), 0))::int AS modelos
FROM mariliaerp.categorias_productos c;

GRANT SELECT ON mariliaerp.sitio_categorias TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
