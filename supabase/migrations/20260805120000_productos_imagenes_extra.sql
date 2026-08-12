-- Segunda y tercera foto por producto.
--
-- El catálogo de moda pide mostrar más de una vista: frente, espalda, detalle.
-- Se agregan dos slots opcionales (imagen 2 e imagen 3) sin tocar los existentes,
-- para que las ~4.000 fotos ya cargadas queden como principal (slot 1) y los
-- nuevos slots arranquen vacíos.

ALTER TABLE mariliaerp.productos
  ADD COLUMN IF NOT EXISTS imagen_url_2  text,
  ADD COLUMN IF NOT EXISTS imagen_path_2 text,
  ADD COLUMN IF NOT EXISTS imagen_url_3  text,
  ADD COLUMN IF NOT EXISTS imagen_path_3 text;

NOTIFY pgrst, 'reload schema';
