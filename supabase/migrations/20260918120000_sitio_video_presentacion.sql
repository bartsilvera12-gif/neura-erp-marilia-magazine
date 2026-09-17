-- Video de presentación del home del sitio público, editable desde el ERP.
--
-- La clienta sube desde el ERP un video que presenta la tienda física. Se
-- guarda en el bucket público `sitio-videos` (Supabase Storage) y su URL vive
-- acá; el sitio la lee en runtime vía /api/sitio/video y lo muestra arriba de
-- todo en la portada.
--
-- Es un único video por empresa (instancia monocliente), por eso `empresa_id`
-- es la PK: una fila, se hace UPSERT al reemplazar. `poster_url` es opcional —
-- una imagen que se muestra al instante mientras el video carga (mejora la
-- velocidad percibida sin re-encodear el video).

CREATE TABLE IF NOT EXISTS mariliaerp.sitio_video (
  empresa_id   uuid PRIMARY KEY,
  video_url    text,
  video_path   text,
  poster_url   text,
  poster_path  text,
  mime         text,
  activo       boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- El sitio público (anon) solo lee; el ERP (authenticated/service_role) escribe.
GRANT SELECT ON mariliaerp.sitio_video TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON mariliaerp.sitio_video TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
