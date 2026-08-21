/**
 * Marca visible_web = true solo para las variantes cuyo codigo_barras figura
 * en la planilla, y visible_web = false para todo el resto del catálogo.
 *
 *   node scripts/aplicar-visible-web-desde-excel.cjs "C:/ruta/al/archivo.xlsx"
 *
 * Sin --go corre en dry-run: muestra qué haría sin escribir nada.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const args = process.argv.slice(2);
const DRY = !args.includes("--go");
const archivo = args.find((a) => !a.startsWith("--")) ||
  "C:/Users/Neura/Downloads/tabelaCostos(Planilha1) (1).xlsx";

if (!fs.existsSync(archivo)) {
  console.error("No existe el archivo: " + archivo);
  process.exit(1);
}

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const K = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!U || !K) { console.error("Faltan envs en .env.local"); process.exit(1); }

async function rest(metodo, ruta, cuerpo, extra) {
  const r = await fetch(U + "/rest/v1" + ruta, {
    method: metodo,
    headers: {
      apikey: K, Authorization: "Bearer " + K,
      "Content-Type": "application/json",
      "Accept-Profile": "mariliaerp", "Content-Profile": "mariliaerp",
      ...(extra || {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(metodo + " " + ruta + " → " + r.status + ": " + t.slice(0, 300));
  return { cr: r.headers.get("content-range"), body: t };
}

(async () => {
  const wb = XLSX.readFile(archivo);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, blankrows: false });
  const barras = Array.from(new Set(
    rows.map((r) => String(r["CODIGO DE BARRAS"] || "").trim()).filter(Boolean)
  ));
  console.log("Códigos de barra en el Excel: " + barras.length);

  const activosCr = (await rest("GET", "/productos?select=id&activo=eq.true&limit=1", null, { Prefer: "count=exact" })).cr;
  console.log("Productos activos en el ERP:  " + activosCr.split("/")[1]);

  console.log("\nSi ejecuto: dejo visible_web=true para las 421 variantes del Excel y visible_web=false a las demás.");
  if (DRY) { console.log("--go NO especificado. No se escribió nada."); return; }

  // 1) Ocultar TODOS los productos.
  console.log("\n[1/2] Ocultando todos los productos…");
  const r1 = await rest("PATCH", "/productos?activo=eq.true",
    { visible_web: false }, { Prefer: "return=minimal" });
  console.log("  ok");

  // 2) Mostrar solo los del Excel, en lotes de 100 barras a la vez.
  console.log("\n[2/2] Mostrando las variantes del Excel…");
  let tocados = 0;
  for (let i = 0; i < barras.length; i += 100) {
    const chunk = barras.slice(i, i + 100);
    const lista = chunk.map((b) => '"' + b + '"').join(",");
    const r = await rest(
      "PATCH",
      "/productos?codigo_barras=in.(" + encodeURIComponent(lista) + ")",
      { visible_web: true },
      { Prefer: "return=representation" }
    );
    const arr = JSON.parse(r.body);
    tocados += arr.length;
    process.stdout.write("\r  " + tocados + "/" + barras.length);
  }
  console.log("\n\nListo. " + tocados + " variantes visibles ahora.");

  // 3) Contar cuántas quedan visibles para confirmar.
  const visCr = (await rest("GET", "/productos?select=id&activo=eq.true&visible_web=eq.true&limit=1", null, { Prefer: "count=exact" })).cr;
  console.log("Total visibles en el sitio: " + visCr.split("/")[1]);
})().catch((e) => { console.error("\nFALLÓ:", e.message); process.exit(1); });
