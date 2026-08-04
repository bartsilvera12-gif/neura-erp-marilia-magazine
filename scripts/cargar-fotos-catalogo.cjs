/**
 * Carga masiva de fotos de producto.
 *
 * Lee una carpeta de imágenes y las asocia a los productos por el NOMBRE DEL
 * ARCHIVO. Se aceptan tres formas, en este orden de prioridad:
 *
 *   1) 7112320000042.jpg      → código de barras  → esa variante puntual
 *   2) 00174024-JEANS.jpg     → código + color    → todas las tallas de ese color
 *   3) 00174024.jpg           → código proveedor  → todas las variantes del modelo
 *
 * Las imágenes se redimensionan a 1200px de lado mayor y se convierten a WebP
 * (mucho más livianas, misma calidad visual) antes de subirlas a un bucket
 * público de Supabase Storage. Se sube UN archivo por clave y su URL se aplica
 * a todas las variantes que correspondan, así 7 tallas comparten una sola foto.
 *
 * Uso:
 *   node scripts/cargar-fotos-catalogo.cjs "C:/ruta/a/fotos" --dry
 *   node scripts/cargar-fotos-catalogo.cjs "C:/ruta/a/fotos"
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const BUCKET = "catalogo-publico";
const SCHEMA = "mariliaerp";
const EMPRESA_ID = "bf70e4b4-62c3-4412-af2a-003eebcbd668";
const ANCHO_MAX = 1200;
const CALIDAD = 82;
const EXTENSIONES = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const CARPETA = args.find((a) => !a.startsWith("--"));
if (!CARPETA) {
  console.error('Falta la carpeta. Ej: node scripts/cargar-fotos-catalogo.cjs "C:/fotos" --dry');
  process.exit(1);
}
if (!fs.existsSync(CARPETA)) {
  console.error("No existe la carpeta: " + CARPETA);
  process.exit(1);
}

// ── Credenciales (nunca se imprimen) ───────────────────────────────────────
const env = {};
for (const l of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_BASE = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL_BASE || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}
const AUTH = { apikey: KEY, Authorization: "Bearer " + KEY };

async function rest(metodo, ruta, cuerpo, extra) {
  const r = await fetch(URL_BASE + "/rest/v1" + ruta, {
    method: metodo,
    headers: { ...AUTH, "Content-Type": "application/json", "Accept-Profile": SCHEMA, "Content-Profile": SCHEMA, ...(extra || {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(metodo + " " + ruta + " → " + r.status + ": " + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

const norm = (s) => String(s || "").trim().toUpperCase();

(async () => {
  // ── 1) Archivos ──────────────────────────────────────────────────────────
  const archivos = fs.readdirSync(CARPETA)
    .filter((f) => EXTENSIONES.has(path.extname(f).toLowerCase()))
    .filter((f) => fs.statSync(path.join(CARPETA, f)).isFile());
  console.log("Imágenes encontradas: " + archivos.length);
  if (archivos.length === 0) process.exit(0);

  // ── 2) Índices de productos ──────────────────────────────────────────────
  console.log("Leyendo productos…");
  const productos = [];
  for (let off = 0; ; off += 1000) {
    const lote = await rest("GET",
      `/productos?empresa_id=eq.${EMPRESA_ID}&select=id,codigo_proveedor,codigo_barras,color_nombre&limit=1000&offset=${off}`);
    productos.push(...lote);
    if (lote.length < 1000) break;
  }
  console.log("  productos: " + productos.length);

  const porBarra = new Map();
  const porCodigo = new Map();
  const porCodigoColor = new Map();
  for (const p of productos) {
    if (p.codigo_barras) porBarra.set(norm(p.codigo_barras), p);
    const cod = norm(p.codigo_proveedor);
    if (!cod) continue;
    if (!porCodigo.has(cod)) porCodigo.set(cod, []);
    porCodigo.get(cod).push(p);
    if (p.color_nombre) {
      const k = cod + "|" + norm(p.color_nombre);
      if (!porCodigoColor.has(k)) porCodigoColor.set(k, []);
      porCodigoColor.get(k).push(p);
    }
  }

  // ── 3) Matchear cada archivo ─────────────────────────────────────────────
  const trabajos = [];
  const sinMatch = [];
  for (const archivo of archivos) {
    const base = norm(path.basename(archivo, path.extname(archivo)));
    let objetivos = null;
    let clave = base;

    if (porBarra.has(base)) {
      objetivos = [porBarra.get(base)];
    } else if (porCodigo.has(base)) {
      objetivos = porCodigo.get(base);
    } else {
      // código-color: se parte por el último guion o guion bajo
      const m = base.match(/^(.+?)[-_](.+)$/);
      if (m && porCodigoColor.has(norm(m[1]) + "|" + norm(m[2]))) {
        objetivos = porCodigoColor.get(norm(m[1]) + "|" + norm(m[2]));
      } else if (m && porCodigo.has(norm(m[1]))) {
        // El sufijo no matcheó ningún color: se aplica a todo el modelo.
        objetivos = porCodigo.get(norm(m[1]));
        clave = norm(m[1]);
      }
    }

    if (!objetivos || objetivos.length === 0) { sinMatch.push(archivo); continue; }
    trabajos.push({ archivo, clave, objetivos });
  }

  const variantesTocadas = new Set();
  trabajos.forEach((t) => t.objetivos.forEach((o) => variantesTocadas.add(o.id)));

  console.log("\n── Resumen ──");
  console.log("archivos que matchean:  " + trabajos.length);
  console.log("archivos sin match:     " + sinMatch.length);
  console.log("variantes que reciben foto: " + variantesTocadas.size);
  if (trabajos.length) {
    console.log("\nEjemplos:");
    trabajos.slice(0, 5).forEach((t) =>
      console.log("   " + t.archivo + " → " + t.objetivos.length + " variante(s)"));
  }
  if (sinMatch.length) {
    console.log("\nSin match (primeros 10):");
    sinMatch.slice(0, 10).forEach((f) => console.log("   " + f));
    console.log("   El nombre debe ser el código de proveedor, el código de barras,");
    console.log("   o código-COLOR (ej. 00174024-JEANS.jpg).");
  }

  if (DRY) { console.log("\n--dry: no se subió nada."); return; }
  if (trabajos.length === 0) return;

  // ── 4) Bucket público ────────────────────────────────────────────────────
  const rb = await fetch(URL_BASE + "/storage/v1/bucket", {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (rb.ok) console.log("\nBucket '" + BUCKET + "' creado.");
  else {
    const t = await rb.text();
    if (/already exists|Duplicate/i.test(t)) console.log("\nBucket '" + BUCKET + "' ya existía.");
    else { console.error("No se pudo crear el bucket: " + t.slice(0, 200)); process.exit(1); }
  }

  // ── 5) Optimizar, subir y asociar ────────────────────────────────────────
  console.log("Procesando " + trabajos.length + " imágenes…");
  let hechas = 0, fallos = 0, bytesIn = 0, bytesOut = 0;

  for (const t of trabajos) {
    try {
      const origen = path.join(CARPETA, t.archivo);
      bytesIn += fs.statSync(origen).size;

      const webp = await sharp(origen)
        .rotate()
        .resize({ width: ANCHO_MAX, height: ANCHO_MAX, fit: "inside", withoutEnlargement: true })
        .webp({ quality: CALIDAD })
        .toBuffer();
      bytesOut += webp.length;

      const destino = EMPRESA_ID + "/" + encodeURIComponent(t.clave) + ".webp";
      const up = await fetch(URL_BASE + "/storage/v1/object/" + BUCKET + "/" + destino, {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "image/webp", "x-upsert": "true" },
        body: webp,
      });
      if (!up.ok) throw new Error("upload " + up.status + ": " + (await up.text()).slice(0, 150));

      const publicUrl = URL_BASE + "/storage/v1/object/public/" + BUCKET + "/" + destino;
      const ids = t.objetivos.map((o) => o.id);
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100).map((id) => '"' + id + '"').join(",");
        await rest("PATCH", "/productos?id=in.(" + encodeURIComponent(chunk) + ")",
          { imagen_url: publicUrl, imagen_path: null }, { Prefer: "return=minimal" });
      }
      hechas++;
    } catch (e) {
      fallos++;
      console.error("\n  " + t.archivo + " → " + e.message);
    }
    process.stdout.write("\r  " + (hechas + fallos) + "/" + trabajos.length);
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";
  console.log("\n\nListo.");
  console.log("  subidas: " + hechas + (fallos ? " | fallidas: " + fallos : ""));
  console.log("  variantes con foto: " + variantesTocadas.size);
  console.log("  peso: " + mb(bytesIn) + " → " + mb(bytesOut));
})().catch((e) => { console.error("\nFALLÓ: " + e.message); process.exit(1); });
