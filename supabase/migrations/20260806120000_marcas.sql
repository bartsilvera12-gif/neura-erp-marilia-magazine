-- Marcas del catálogo, editables desde el ERP.
--
-- Antes vivían hardcodeadas en el archivo `mm-marcas.js` del sitio. Ahora se
-- guardan acá y el sitio las lee en runtime; si el API cae, se conserva el JS
-- estático como fallback.
--
-- `match_tokens` es una lista de palabras que, si aparecen en el nombre del
-- producto, lo asocian a la marca. Con `coincide_con_todo = true` la marca
-- cubre el catálogo entero (útil cuando toda la mercadería es de un proveedor).

CREATE TABLE IF NOT EXISTS mariliaerp.marcas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  slug          text NOT NULL,
  nombre        text NOT NULL,
  descripcion   text,
  logo_url      text,
  match_tokens  text[] NOT NULL DEFAULT '{}',
  coincide_con_todo boolean NOT NULL DEFAULT false,
  activo        boolean NOT NULL DEFAULT true,
  orden         int    NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE mariliaerp.marcas
    ADD CONSTRAINT marcas_slug_empresa_unica UNIQUE (empresa_id, slug);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_marcas_activas
  ON mariliaerp.marcas (empresa_id, orden, nombre)
  WHERE activo = true;

GRANT SELECT ON mariliaerp.marcas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON mariliaerp.marcas TO authenticated, service_role;

-- Seed con TFLOW (la única marca actual, que hoy cubre 100% del catálogo).
INSERT INTO mariliaerp.marcas (empresa_id, slug, nombre, descripcion, logo_url, coincide_con_todo, activo, orden)
SELECT id, 'tflow', 'TFLOW',
       'Moda masculina, calzado y accesorios.',
       './tflow.png', true, true, 0
  FROM mariliaerp.empresas
 WHERE data_schema = 'mariliaerp'
ON CONFLICT (empresa_id, slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
