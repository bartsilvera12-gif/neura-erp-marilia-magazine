-- =====================================================================
-- Tiles del home del sitio publico ("Encuentra tu estilo") editables
-- desde el ERP: se arman con las categorias marcadas `mostrar_home`.
--
-- Antes el sitio usaba "toda categoria que tenga imagen_url", lo que no
-- permitia curar cuales ni en que orden. Ahora es explicito.
-- =====================================================================

ALTER TABLE mariliaerp.categorias_productos
  ADD COLUMN IF NOT EXISTS imagen_url text,
  ADD COLUMN IF NOT EXISTS mostrar_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orden_home int NOT NULL DEFAULT 0,
  -- Linea chica bajo el titulo del tile (ej "Otono 2026"). Si es NULL el
  -- tile muestra solo el nombre y el "Explorar".
  ADD COLUMN IF NOT EXISTS subtitulo_home text,
  -- Override del destino del tile. Vacio = ./Catalogo.dc.html?cat=<nombre>.
  -- Sirve para tiles tipo "Nueva coleccion" que apuntan al catalogo entero.
  ADD COLUMN IF NOT EXISTS link_home text;

CREATE INDEX IF NOT EXISTS idx_categorias_mostrar_home
  ON mariliaerp.categorias_productos (empresa_id, orden_home)
  WHERE mostrar_home = true;

NOTIFY pgrst, 'reload schema';
