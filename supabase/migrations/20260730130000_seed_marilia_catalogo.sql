-- =====================================================================
-- Seed inicial del catálogo Marilia Magazine — 12 categorías + 26 productos
-- Corre DESPUÉS de la migration 20260730120000 (que crea columnas web).
--
-- Nota: usa `nombre` como columna en `categorias`. Si tu tabla usa otro
-- nombre (ej. `descripcion`), ajustá los INSERT según lo que devuelva:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='mariliaerp' AND table_name='categorias';
-- =====================================================================

DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM mariliaerp.empresas WHERE nombre_empresa = 'Marilia Magazine' LIMIT 1;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Empresa Marilia Magazine no encontrada';
  END IF;

  -- ------------- Categorías -------------
  INSERT INTO mariliaerp.categorias_productos (empresa_id, nombre)
  VALUES
    (v_empresa, 'Mujer Vestidos'),    (v_empresa, 'Mujer Conjuntos'),
    (v_empresa, 'Mujer Blusas'),      (v_empresa, 'Mujer Camisas'),
    (v_empresa, 'Mujer Faldas'),      (v_empresa, 'Mujer Abrigos'),
    (v_empresa, 'Mujer Accesorios'),
    (v_empresa, 'Hombre Camisas'),    (v_empresa, 'Hombre Pantalones'),
    (v_empresa, 'Hombre Abrigos'),    (v_empresa, 'Hombre Conjuntos'),
    (v_empresa, 'Hombre Accesorios')
  ON CONFLICT DO NOTHING;

  -- ------------- Productos -------------
  -- Insertamos como productos "planos" (una fila por producto).
  -- SKU derivado de nombre. Sin stock inicial (setealo desde el ERP luego).
  INSERT INTO mariliaerp.productos
    (empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo,
     unidad_medida, metodo_valuacion, descripcion, imagen_url,
     categoria_principal_id, visible_web, destacado, es_vendible, controla_stock)
  SELECT
    v_empresa, p.nombre, p.sku, p.costo, p.precio, 0, 0,
    'UNIDAD', 'CPP', p.sub, p.img,
    (SELECT id FROM mariliaerp.categorias_productos WHERE empresa_id = v_empresa AND lower(nombre) = lower(p.categoria) LIMIT 1),
    true, p.destacado, true, true
  FROM (VALUES
    ('Vestido Aurelia',   'MM-P1',  516000,  1290000, 'Vestido midi en lino lavado',                'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/mujer.webp',                    'Mujer Vestidos',    true),
    ('Conjunto Sienna',   'MM-P2',  392000,   980000, 'Camisa y pantalón en algodón peinado',       'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/1.webp',                        'Mujer Conjuntos',   false),
    ('Blusa Loreta',      'MM-P3',  216000,   540000, 'Blusa de seda lavada, manga globo',          'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/2.webp',                        'Mujer Blusas',      false),
    ('Bolso Nieve',       'MM-P4',  328000,   820000, 'Bolso estructurado en cuero vegetal',        'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/3.webp',                        'Mujer Accesorios',  true),
    ('Falda Amaranta',    'MM-P5',  276000,   690000, 'Falda plisada midi en gasa',                 'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/explorar/falda.webp',            'Mujer Faldas',      false),
    ('Vestido Bruna',     'MM-P6',  460000,  1150000, 'Vestido largo en seda con cinturón',         'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/explorar/vestido2.webp',         'Mujer Vestidos',    true),
    ('Blusa Cándida',     'MM-P7',  248000,   620000, 'Blusa de algodón con cuello alto',           'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/explorar/camisa.webp',           'Mujer Camisas',     false),
    ('Abrigo Duna',       'MM-P8',  712000,  1780000, 'Abrigo de lana con corte recto',             'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/explorar/abrigo.webp',           'Mujer Abrigos',     false),
    ('Pañuelo Olivar',    'MM-P9',  124000,   310000, 'Pañuelo de seda estampado a mano',           'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/explorar/panuelo.webp',          'Mujer Accesorios',  false),
    ('Sandalia Rea',      'MM-P10', 296000,   740000, 'Sandalia de cuero con tira fina',            'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/explorar/sandalia.webp',         'Mujer Accesorios',  false),
    ('Camisa Sauce',      'MM-H1',  236000,   590000, 'Camisa de lino en azul profundo',            'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/camisa-azul.webp',     'Hombre Camisas',    false),
    ('Blazer Roble',      'MM-H2',  596000,  1490000, 'Blazer de lana en verde oscuro',             'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/blazer-verde.webp',    'Hombre Abrigos',    false),
    ('Pantalón Arenal',   'MM-H3',  288000,   720000, 'Pantalón de franela con pinzas',             'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/pantalon-gris.webp',   'Hombre Pantalones', false),
    ('Traje Sendero',     'MM-H4',  980000,  2450000, 'Traje de lana en gris claro',                'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/traje-gris.webp',      'Hombre Conjuntos',  false),
    ('Abrigo Norte',      'MM-H5',  756000,  1890000, 'Abrigo largo de lana en burdeos',            'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/abrigo-burdeos.webp',   'Hombre Abrigos',    false),
    ('Cinturón Cedro',    'MM-H6',  136000,   340000, 'Cinturón de cuero con hebilla dorada',       'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/accesorios.webp',               'Hombre Accesorios', false),
    ('Blazer Oliva',      'MM-H7',  556000,  1390000, 'Blazer de lino en verde oliva',              'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/blazer-oliva.webp',    'Hombre Abrigos',    false),
    ('Polo Duna',         'MM-H8',  192000,   480000, 'Polo de punto de algodón peinado',           'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/polo-marfil.webp',     'Hombre Camisas',    false),
    ('Abrigo Camel',      'MM-H9',  792000,  1980000, 'Abrigo largo de lana en camel',              'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/abrigo-camel.webp',     'Hombre Abrigos',    false),
    ('Traje Olivar',      'MM-H10', 916000,  2290000, 'Traje de lino en marfil',                    'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/destacado/traje-lino.webp',      'Hombre Conjuntos',  false),
    ('Vestido Amaranta',  'MM-T1',  556000,  1390000, 'Vestido cruzado en crepé burdeos',           'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/temporada/vestido-burdeos.webp', 'Mujer Vestidos',    true),
    ('Blusa Glicina',     'MM-T2',  256000,   640000, 'Blusa de seda en lila con lazada',           'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/temporada/blusa-lila.webp',      'Mujer Camisas',     false),
    ('Conjunto Esmeralda','MM-T3',  516000,  1290000, 'Chaleco y pantalón en verde esmeralda',      'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/temporada/conjunto-verde.webp',   'Mujer Conjuntos',   false),
    ('Falda Sol',         'MM-T4',  300000,   750000, 'Falda plisada midi en mostaza',              'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/temporada/falda-mostaza.webp',    'Mujer Faldas',      false),
    ('Traje Marino',      'MM-T5',  792000,  1980000, 'Traje de crepé en azul marino',              'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/temporada/traje-azul.webp',       'Mujer Conjuntos',   false),
    ('Abrigo Cacao',      'MM-T6',  876000,  2190000, 'Abrigo largo de lana en cacao',              'https://raw.githubusercontent.com/bartsilvera12-gif/marilia-magazine/main/uploads/temporada/abrigo-marron.webp',    'Mujer Abrigos',     false)
  ) AS p(nombre, sku, costo, precio, sub, img, categoria, destacado)
  WHERE NOT EXISTS (SELECT 1 FROM mariliaerp.productos WHERE empresa_id = v_empresa AND sku = p.sku);
END $$;

-- Verificación
SELECT COUNT(*) AS categorias FROM mariliaerp.categorias_productos WHERE empresa_id = (SELECT id FROM mariliaerp.empresas WHERE nombre_empresa = 'Marilia Magazine');
SELECT COUNT(*) AS productos_visibles_web FROM mariliaerp.productos
  WHERE empresa_id = (SELECT id FROM mariliaerp.empresas WHERE nombre_empresa = 'Marilia Magazine')
    AND visible_web = true;
