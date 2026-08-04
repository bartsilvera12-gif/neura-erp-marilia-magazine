export type MetodoValuacion = "CPP" | "FIFO" | "LIFO";
export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";
export type OrigenMovimiento = "compra" | "venta" | "ajuste_manual" | "inventario_inicial";

export interface Producto {
  id: string;
  nombre: string;
  /**
   * Identificador interno. Se genera solo y es único por empresa: es lo que
   * usan la caja, el escáner y el importador para saber qué fila tocar.
   * No se muestra ni se edita — para el código del catálogo usar
   * `codigo_proveedor`, que sí puede repetirse.
   */
  sku: string;
  /** Código del proveedor/fábrica. Puede repetirse entre productos. */
  codigo_proveedor?: string | null;
  /** Público del producto. null = todavía sin clasificar. */
  genero?: "mujer" | "hombre" | "unisex" | null;
  costo_promedio: number;
  precio_venta: number;            // precio minorista
  /** Precio mayorista (opcional, informativo — no se aplica automáticamente en ventas). */
  precio_mayorista?: number | null;
  /** Cantidad mínima para precio mayorista (opcional, informativo). */
  cantidad_minima_mayorista?: number | null;
  /** Precio distribuidor (opcional). Precio comercial por canal — NO es el costo. */
  precio_distribuidor?: number | null;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  metodo_valuacion: MetodoValuacion;
  codigo_barras?: string | null;
  codigo_barras_interno?: boolean;
  imagen_path?: string | null;
  imagen_url?: string | null;
  categoria_principal_id?: string | null;
  ubicacion_principal_id?: string | null;
  proveedor_principal_id?: string | null;
  /** Clasificación gastronómica: producto que se vende al cliente final. */
  es_vendible?: boolean;
  /** Clasificación gastronómica: producto usado como insumo en recetas. */
  es_insumo?: boolean;
  /** Si false, no descuenta stock (ajustes/servicios). */
  controla_stock?: boolean;
  /** Si true, aparece marcado como destacado en el sitio público. */
  destacado?: boolean;
  /** Si false, el producto NO aparece en el sitio público. Default true. */
  visible_web?: boolean;
  /** Si false, no entra en valuación (combos/promos). */
  valorizado?: boolean;
  /** Unidad usada al comprar (ej. "Bolsa 25kg"). */
  unidad_compra?: string | null;
  /** Unidad usada en recetas (ej. "g"). */
  unidad_receta?: string | null;
  /** Factor para 1 unidad_compra → unidades_receta (ej. 25000). */
  factor_compra_receta?: number;
  /** Tiempo estimado de preparación en minutos (para Kanban cocina). */
  tiempo_prep_minutos?: number;
  /** Descripción detallada (visible en Menú y edición). */
  descripcion?: string | null;
  /** Modo de receta (productos de Menú): 'preparado_al_vender' | 'produccion_previa'. */
  modo_receta?: string;
  // --- Ropa Fase 1 (mariacuevas: variantes de prenda) ---
  producto_base_id?: string | null;
  color_id?: string | null;
  talla_id?: string | null;
  precio_costo?: number | null;
  precio_minorista?: number | null;
  color_nombre?: string | null;
  talla_nombre?: string | null;
}

/** Prenda/modelo agrupador (ropa). Las variantes vendibles/stockeables siguen siendo filas de `productos`. */
export interface ProductoBase {
  id: string;
  empresa_id?: string;
  nombre: string;
  categoria_id?: string | null;
  tipo_corte: "masculino" | "femenino" | "unisex";
  material?: string | null;
  temporada?: string | null;
  marca?: string | null;
  descripcion?: string | null;
  imagen_url?: string | null;
  imagen_path?: string | null;
  estado: "activo" | "agotado" | "discontinuado";
  proveedor_principal_id?: string | null;
  activo?: boolean;
}

export interface PrendaColor {
  id: string;
  empresa_id?: string;
  nombre: string;
  codigo_hex?: string | null;
  activo?: boolean;
}

export interface PrendaTalla {
  id: string;
  empresa_id?: string;
  nombre: string;
  orden?: number;
  activo?: boolean;
}

export interface MovimientoInventario {
  id: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario: number;
  origen: OrigenMovimiento;
  fecha: string;       // ISO string
  referencia?: string; // ej: "COMP-000001"
  created_by?: string | null;
  usuario_nombre?: string | null;
}
