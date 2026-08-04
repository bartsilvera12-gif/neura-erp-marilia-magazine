/**
 * Carga del catálogo TFLOW en `productos`.
 *
 * Fuentes (Downloads):
 *   - TABELA PARAGUAI CORRIGIDO.xlsx → color, talla y COSTO. Es la única que
 *     trae COR y talla en columnas separadas, así que manda la estructura.
 *   - _MAT&CON IMPORTACION - completa.xlsx → PRECIO DE VENTA. Se cruza por
 *     código de barras y, si no hay, por CODIGO_FABRICANTE + sufijo de talla.
 *
 * Cada fila del Excel es una variante (modelo × color × talla). El
 * CODIGO_FABRICANTE se repite entre las variantes de un modelo y va a
 * `codigo_proveedor`; el SKU interno lo genera este script correlativo
 * (ART-XXXXXX) porque es lo que usan caja, escáner e importador.
 *
 * Uso:
 *   node scripts/cargar-catalogo-tflow.cjs --dry     (no escribe: muestra resumen)
 *   node scripts/cargar-catalogo-tflow.cjs           (carga de verdad)
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const DL = "C:/Users/Neura/Downloads/";
const SCHEMA = "mariliaerp";
const EMPRESA_ID = "bf70e4b4-62c3-4412-af2a-003eebcbd668";
const LOTE = 500;
const DRY = process.argv.includes("--dry");

// ── Credenciales desde .env.local (no se imprimen nunca) ────────────────────
function leerEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) {
    console.error("Falta .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const env = {};
  for (const linea of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const ENV = DRY ? {} : leerEnv();
const URL_BASE = (ENV.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = ENV.SUPABASE_SERVICE_ROLE_KEY || "";
if (!DRY && (!URL_BASE || !KEY)) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

async function rest(metodo, ruta, cuerpo, extraHeaders) {
  const r = await fetch(URL_BASE + "/rest/v1" + ruta, {
    method: metodo,
    headers: {
      apikey: KEY,
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/json",
      "Accept-Profile": SCHEMA,
      "Content-Profile": SCHEMA,
      ...(extraHeaders || {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status}: ${txt.slice(0, 400)}`);
  return txt ? JSON.parse(txt) : null;
}

// ── Normalización ──────────────────────────────────────────────────────────
/** El export vino con la Ç rota ("CALcA" por "CALÇA"). */
function arreglarTexto(s) {
  if (s == null) return null;
  let t = String(s).trim().replace(/\s+/g, " ");
  if (!t) return null;
  t = t
    .replace(/CALcA/gi, "CALÇA")
    .replace(/cALcA/g, "CALÇA")
    .replace(/Ã‡/g, "Ç").replace(/Ã£/g, "ã").replace(/Ã©/g, "é").replace(/Ãµ/g, "õ");
  return t.toUpperCase();
}
const num = (v) => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const leerHoja = (archivo) => {
  const wb = XLSX.readFile(DL + archivo, { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, blankrows: false });
};

// ── 1) Leer fuentes ────────────────────────────────────────────────────────
console.log("Leyendo Excel…");
const corr = leerHoja("TABELA PARAGUAI CORRIGIDO.xlsx");
const mat = leerHoja("_MAT&CON IMPORTACION - completa.xlsx");
console.log(`  CORRIGIDO: ${corr.length} filas | MAT&CON: ${mat.length} filas`);

// Precio de venta de MAT&CON, indexado por código de barras y por código+talla.
const ventaPorBarra = new Map();
const ventaPorCodigo = new Map();
for (const r of mat) {
  const precio = num(r.LISTA_PRECIOS_01);
  if (!precio) continue;
  const barra = r.CODIGO_DE_BARRA ? String(r.CODIGO_DE_BARRA).trim() : null;
  if (barra) ventaPorBarra.set(barra, precio);
  // En MAT&CON el código ya trae la talla pegada: 00001001P, 00001001GG…
  const cod = r.CODIGO_FABRICANTE ? String(r.CODIGO_FABRICANTE).trim().toUpperCase() : null;
  if (cod) ventaPorCodigo.set(cod, precio);
}

// ── 2) Armar las filas a insertar ──────────────────────────────────────────
const categorias = new Map(); // GRUPO → { nombre }
const filas = [];
let sinVenta = 0;

for (const r of corr) {
  const nombre = arreglarTexto(r.DESCRIPCION);
  if (!nombre) continue;

  const codigoProveedor = r.CODIGO_FABRICANTE ? String(r.CODIGO_FABRICANTE).trim().toUpperCase() : null;
  const color = arreglarTexto(r.COR);
  const talla = r.UNIDAD_DE_MEDIDA ? String(r.UNIDAD_DE_MEDIDA).trim().toUpperCase() : null;
  const barra = r.CODIGO_DE_BARRA ? String(r.CODIGO_DE_BARRA).trim() : null;
  const grupo = arreglarTexto(r.GRUPO) || "SIN CATEGORIA";
  categorias.set(grupo, true);

  const costo = num(r.LISTA_PRECIOS_01);
  let venta = (barra && ventaPorBarra.get(barra)) || null;
  if (!venta && codigoProveedor && talla) venta = ventaPorCodigo.get(codigoProveedor + talla) || null;
  // Sin cruce, el margen de la relación 2x que traen ambas listas.
  if (!venta) { venta = costo * 2; if (costo) sinVenta++; }

  filas.push({
    nombreCompleto: [nombre, color, talla].filter(Boolean).join(" - "),
    grupo,
    codigo_proveedor: codigoProveedor,
    codigo_barras: barra && /^\d{8,14}$/.test(barra) ? barra : null,
    color_nombre: color,
    talla_nombre: talla,
    costo_promedio: costo,
    precio_costo: costo,
    precio_venta: venta,
  });
}

console.log(`\nProductos a cargar: ${filas.length}`);
console.log(`Categorías (GRUPO): ${categorias.size}`);
console.log(`Sin cruce de precio de venta (se usó costo × 2): ${sinVenta}`);
console.log("\nEjemplo:");
filas.slice(0, 3).forEach((f) =>
  console.log(`   ${f.codigo_proveedor} | ${f.nombreCompleto} | costo ${f.costo_promedio} | venta ${f.precio_venta}`)
);

if (DRY) {
  console.log("\n--dry: no se escribió nada.");
  process.exit(0);
}

// ── 3) Cargar ──────────────────────────────────────────────────────────────
(async () => {
  // 3a) Categorías: crear las que falten y mapear nombre → id
  console.log("\nSincronizando categorías…");
  const existentes = await rest(
    "GET",
    `/categorias_productos?empresa_id=eq.${EMPRESA_ID}&select=id,nombre&limit=5000`
  );
  const catId = new Map(existentes.map((c) => [String(c.nombre).toUpperCase(), c.id]));
  const faltantes = [...categorias.keys()].filter((g) => !catId.has(g));
  if (faltantes.length) {
    const creadas = await rest(
      "POST",
      "/categorias_productos",
      faltantes.map((nombre) => ({ empresa_id: EMPRESA_ID, nombre })),
      { Prefer: "return=representation" }
    );
    creadas.forEach((c) => catId.set(String(c.nombre).toUpperCase(), c.id));
    console.log(`  creadas: ${faltantes.length}`);
  }

  // 3b) Punto de partida del SKU correlativo
  const ultimo = await rest(
    "GET",
    `/productos?empresa_id=eq.${EMPRESA_ID}&sku=like.ART-*&select=sku&order=sku.desc&limit=1`
  );
  let seq = 1;
  if (ultimo?.[0]?.sku) {
    const m = String(ultimo[0].sku).match(/^ART-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  console.log(`  SKU inicial: ART-${String(seq).padStart(6, "0")}`);

  // 3c) Insertar por lotes
  console.log(`\nInsertando ${filas.length} productos en lotes de ${LOTE}…`);
  let ok = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE).map((f) => ({
      empresa_id: EMPRESA_ID,
      nombre: f.nombreCompleto,
      sku: "ART-" + String(seq++).padStart(6, "0"),
      codigo_proveedor: f.codigo_proveedor,
      codigo_barras: f.codigo_barras,
      codigo_barras_interno: false,
      color_nombre: f.color_nombre,
      talla_nombre: f.talla_nombre,
      categoria_principal_id: catId.get(f.grupo) ?? null,
      costo_promedio: f.costo_promedio,
      precio_costo: f.precio_costo,
      precio_venta: f.precio_venta,
      stock_actual: 0,
      stock_minimo: 0,
      unidad_medida: "UNIDAD",
      metodo_valuacion: "CPP",
      activo: true,
      visible_web: true,
      destacado: false,
    }));
    await rest("POST", "/productos", lote, { Prefer: "return=minimal" });
    ok += lote.length;
    process.stdout.write(`\r  ${ok}/${filas.length}`);
  }
  console.log(`\n\nListo: ${ok} productos cargados.`);
})().catch((e) => {
  console.error("\nFALLÓ:", e.message);
  process.exit(1);
});
