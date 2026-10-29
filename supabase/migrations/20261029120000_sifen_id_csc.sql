-- Agrega `id_csc` a la configuración SIFEN por empresa en TODOS los schemas de
-- tenant que tengan la tabla `empresa_sifen_config`.
--
-- SET asigna un IdCSC al CSC del contribuyente — casi siempre '0001', pero si
-- se regenera el CSC puede pasar a '0002', etc. Hasta ahora el valor se leía
-- únicamente de SIFEN_ID_CSC (env var), lo que obligaba a tocar la infra de
-- Coolify cada vez. Al moverlo a la DB se cambia con un UPDATE sin redeploy.
--
-- Si la columna queda NULL, el firmador cae al env var (compatibilidad hacia
-- atrás) y, si el env tampoco está, default '0001' (comportamiento anterior).
--
-- Reglas: IF NOT EXISTS, aditivo, idempotente. No borra datos.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'empresa_sifen_config'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.empresa_sifen_config
         ADD COLUMN IF NOT EXISTS id_csc text',
      r.sch
    );
    EXECUTE format(
      'COMMENT ON COLUMN %I.empresa_sifen_config.id_csc IS
       ''IdCSC asignado por DNIT al CSC del contribuyente (4 dígitos, usualmente 0001).''',
      r.sch
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
