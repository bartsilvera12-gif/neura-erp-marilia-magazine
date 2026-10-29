-- Agrega `id_csc` a la configuración SIFEN por empresa.
--
-- SET asigna un IdCSC al CSC del contribuyente — casi siempre '0001', pero si
-- se regenera el CSC puede pasar a '0002', '0003', etc. Hasta ahora el valor
-- se leía únicamente de SIFEN_ID_CSC (env var), lo que obligaba a tocar la
-- infra de Coolify cada vez. Al moverlo a la DB, se cambia desde la pantalla
-- de configuración SIFEN sin redeploy.
--
-- Si la columna queda NULL, el firmador cae al env var (compatibilidad hacia
-- atrás) y, si el env tampoco está, default '0001' (comportamiento anterior).
ALTER TABLE public.empresa_sifen_config
  ADD COLUMN IF NOT EXISTS id_csc text;

COMMENT ON COLUMN public.empresa_sifen_config.id_csc IS
  'IdCSC asignado por DNIT al CSC del contribuyente (4 dígitos, usualmente 0001).';

NOTIFY pgrst, 'reload schema';
