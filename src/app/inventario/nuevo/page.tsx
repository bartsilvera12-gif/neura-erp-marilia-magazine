"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import SelectFromList from "@/components/inventario/SelectFromList";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";

interface CatRow { id: string; nombre: string }
interface UbiRow { id: string; nombre: string; tipo: string }
interface ProvRow { id: string; nombre: string }

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-2";


/** Calcula el dígito verificador EAN-13 sobre 12 dígitos. */
function ean13Check(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
/** Genera un EAN-13 numérico interno (prefijo 200, no asignado a GS1 real). */
function generarEan13(): string {
  const rand = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0");
  const base = "200" + rand; // 12 dígitos
  return base + String(ean13Check(base));
}

export default function NuevoItemPage() {
  const router = useRouter();

  // Catálogos
  const [categorias, setCategorias] = useState<CatRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbiRow[]>([]);
  const [proveedores, setProveedores] = useState<ProvRow[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  // Form
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  // Color y talla se escriben libres: no hay catálogo previo que mantener.
  const [colorNombreInput, setColorNombreInput] = useState("");
  const [tallaNombreInput, setTallaNombreInput] = useState("");
  const [tipoCorte, setTipoCorte] = useState<"masculino" | "femenino" | "unisex">("unisex");
  const [precioCosto, setPrecioCosto] = useState("");
  const [precioMayorista, setPrecioMayorista] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [stockActual, setStockActual] = useState("");
  const [stockMinimo, setStockMinimo] = useState("");
  // Código del catálogo del proveedor. Puede repetirse: el SKU interno único
  // lo genera el backend.
  const [codigoProveedor, setCodigoProveedor] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [ubicacionId, setUbicacionId] = useState<string | null>(null);
  // Publicado en el catálogo web. Default true = mismo default que la columna
  // `visible_web` en la base, y coincide con el check de la lista de inventario.
  const [visibleWeb, setVisibleWeb] = useState(true);
  // Destacado: lo levanta el sitio para la sección de piezas destacadas.
  const [destacado, setDestacado] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Imágenes: hasta 3 slots. Se acumulan antes de crear y se suben post-alta.
  const [imagenes, setImagenes] = useState<Array<{ file: File; preview: string } | null>>([null, null, null]);
  const [imagenError, setImagenError] = useState<string | null>(null);
  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
  const MAX_IMG_BYTES = 5 * 1024 * 1024;

  useEffect(() => {
    let cancel = false;
    async function load(url: string) {
      try { const r = await fetch(url, { credentials: "include" }); const j = await r.json(); return r.ok && j?.success ? j.data : null; } catch { return null; }
    }
    (async () => {
      const [cats, ubis, provs] = await Promise.all([
        load("/api/inventario/categorias"),
        load("/api/inventario/ubicaciones"),
        load("/api/proveedores"),
      ]);
      if (cancel) return;
      if (cats?.categorias) setCategorias(cats.categorias as CatRow[]);
      if (ubis?.ubicaciones) setUbicaciones(ubis.ubicaciones as UbiRow[]);
      if (provs?.proveedores) setProveedores(provs.proveedores as ProvRow[]);
      const prods = await getProductos();
      if (!cancel) setProductos(prods);
    })();
    return () => { cancel = true; };
  }, []);

  const codigosExistentes = useMemo(
    () => new Set(productos.map((p) => (p.codigo_barras ?? "").trim()).filter(Boolean)),
    [productos]
  );

  function generarCodigo() {
    setError(null);
    let intento = generarEan13();
    let guard = 0;
    while (codigosExistentes.has(intento) && guard < 20) { intento = generarEan13(); guard += 1; }
    setCodigoBarras(intento);
  }

  function handleCodigoChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Solo numérico.
    setCodigoBarras(e.target.value.replace(/\D/g, "").slice(0, 14));
  }

  function handleImagenSlot(idx: 0 | 1 | 2, e: React.ChangeEvent<HTMLInputElement>) {
    setImagenError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!ALLOWED_MIME.includes(f.type)) { setImagenError("Formato no permitido. Usá JPG, PNG o WebP."); e.target.value = ""; return; }
    if (f.size > MAX_IMG_BYTES) { setImagenError("Imagen demasiado grande (máx. 5 MB)."); e.target.value = ""; return; }
    setImagenes((prev) => {
      const next = [...prev];
      next[idx] = { file: f, preview: URL.createObjectURL(f) };
      return next;
    });
    e.target.value = "";
  }
  function quitarImagenSlot(idx: 0 | 1 | 2) {
    setImagenes((prev) => { const n = [...prev]; n[idx] = null; return n; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null); setOkMsg(null);

    const nombreT = nombre.trim();
    if (!nombreT) { setError("El nombre del ítem es obligatorio."); return; }
    // Código de barras: opcional, pero si se carga debe ser numérico 8–14 y único.
    const cb = codigoBarras.trim();
    if (cb) {
      if (!/^\d{8,14}$/.test(cb)) { setError("El código de barras debe ser numérico, de 8 a 14 dígitos (o dejalo vacío)."); return; }
      if (codigosExistentes.has(cb)) { setError(`El código de barras "${cb}" ya está asignado a otro producto.`); return; }
    }

    const colorNombre = colorNombreInput.trim();
    const tallaNombre = tallaNombreInput.trim();
    const nombreVar = [nombreT, colorNombre, tallaNombre].filter(Boolean).join(" - ");

    setSubmitting(true);
    try {
      const body = {
        base: {
          nombre: nombreT,
          categoria_id: categoriaId || null,
          tipo_corte: tipoCorte,
          proveedor_principal_id: proveedorId || null,
          estado: "activo",
          visible_web: visibleWeb,
          // Sin publicar no tiene sentido destacar: el sitio nunca lo mostraría.
          destacado: destacado && visibleWeb,
        },
        variantes: [{
          nombre: nombreVar,
          codigo_proveedor: codigoProveedor.trim() || null,
          color_nombre: colorNombre || null,
          talla_nombre: tallaNombre || null,
          stock_actual: Number(stockActual) || 0,
          stock_minimo: Number(stockMinimo) || 0,
          precio_costo: Number(precioCosto) || 0,
          precio_mayorista: Number(precioMayorista) || 0,
          precio_venta: Number(precioVenta) || 0,
          codigo_barras: cb || null,
          ubicacion_principal_id: ubicacionId || null,
        }],
      };
      const r = await fetch("/api/inventario/prendas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error || `Error ${r.status} al crear el ítem.`);

      const varId = j.data?.variantes?.[0]?.id as string | undefined;

      // Imágenes (post-creación): subir los slots cargados uno por uno.
      if (varId && imagenes.some(Boolean)) {
        const fallidos: number[] = [];
        for (let i = 0; i < imagenes.length; i++) {
          const it = imagenes[i];
          if (!it) continue;
          try {
            const fd = new FormData();
            fd.append("file", it.file);
            const up = await fetch(`/api/productos/${varId}/imagen?slot=${i + 1}`, {
              method: "POST", body: fd, credentials: "include",
            });
            const upJson = await up.json().catch(() => ({}));
            if (!up.ok || !upJson?.success) fallidos.push(i + 1);
          } catch {
            fallidos.push(i + 1);
          }
        }
        if (fallidos.length) {
          alert(`Ítem creado, pero ${fallidos.length === 1 ? "una imagen no se pudo subir" : `${fallidos.length} imágenes no se pudieron subir`}. Podés cargarlas desde la edición del producto.`);
          router.push(`/inventario/${varId}/editar`);
          return;
        }
      }

      setOkMsg("Ítem creado correctamente.");
      setTimeout(() => router.push("/inventario"), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el ítem.");
    } finally {
      setSubmitting(false);
    }
  }

  // Margen de ganancia de cada precio respecto del costo.
  const costoNum = Number(precioCosto) || 0;
  const tiersMargen = [
    { label: "Mayorista", val: Number(precioMayorista) || 0 },
    { label: "Venta", val: Number(precioVenta) || 0 },
  ].filter((t) => t.val > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Nuevo ítem</h1>
          <p className="text-gray-600">Cargá una prenda/variante con color, talla, precios y SKU.</p>
        </div>
        <Link href="/inventario" className="text-sm text-gray-500 hover:text-gray-800 underline">← Volver a inventario</Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 max-w-5xl">{error}</div>}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3 max-w-5xl">{okMsg}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 max-w-5xl space-y-6">

        {/* Datos del ítem */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-6">
            <label className={labelClass}>Nombre del ítem / prenda *</label>
            <input className={`${inputClass} uppercase`} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: REMERA OVERSIZE" />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Tipo de corte</label>
            <select className={inputClass} value={tipoCorte} onChange={(e) => setTipoCorte(e.target.value as typeof tipoCorte)}>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Categoría</label>
            <SelectFromList value={categoriaId} onChange={setCategoriaId} options={categorias.map((c) => ({ id: c.id, label: c.nombre }))} emptyShort="Sin categorías" />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Color</label>
            <input className={inputClass} value={colorNombreInput} onChange={(e) => setColorNombreInput(e.target.value)} placeholder="Ej: Negro" />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Talla / Tamaño</label>
            <input className={inputClass} value={tallaNombreInput} onChange={(e) => setTallaNombreInput(e.target.value)} placeholder="Ej: M" />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Proveedor</label>
            <SelectFromList value={proveedorId} onChange={setProveedorId} options={proveedores.map((p) => ({ id: p.id, label: p.nombre }))} emptyShort="Sin proveedores" />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Ubicación</label>
            <SelectFromList value={ubicacionId} onChange={setUbicacionId} options={ubicaciones.map((u) => ({ id: u.id, label: u.nombre, sublabel: u.tipo }))} emptyShort="Sin ubicaciones" />
          </div>
        </div>

        {/* Código del proveedor: el del catálogo, puede repetirse */}
        <div className="border-t border-slate-100 pt-6">
          <label className={labelClass}>Código del proveedor</label>
          <input
            className={`${inputClass} uppercase font-mono max-w-xs`}
            value={codigoProveedor}
            onChange={(e) => setCodigoProveedor(e.target.value.toUpperCase())}
            placeholder="Ej: 03765"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            El código del catálogo del proveedor. Puede repetirse entre productos.
          </p>
        </div>

        {/* Código de barras */}
        <div className="border-t border-slate-100 pt-6">
          <label className={labelClass}>Código de barras (numérico, opcional)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              value={codigoBarras}
              onChange={handleCodigoChange}
              placeholder="8 a 14 dígitos — escaneá o dejá vacío"
              className={`${inputClass} font-mono max-w-xs`}
              autoComplete="off"
            />
            <button type="button" onClick={generarCodigo} className="text-sm font-medium text-sky-700 border border-sky-200 hover:bg-sky-50 px-3 py-2 rounded-lg">Generar código (EAN-13)</button>
          </div>
        </div>

        {/* Precios */}
        <div className="border-t border-slate-100 pt-6">
          <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">Precios (Gs.)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div>
              <label className={labelClass}>Precio costo</label>
              <MontoInput value={precioCosto} onChange={(n) => setPrecioCosto(String(n))} placeholder="Ej: 30000" className={inputClass} decimals={false} />
            </div>
            <div>
              <label className={labelClass}>Precio mayorista</label>
              <MontoInput value={precioMayorista} onChange={(n) => setPrecioMayorista(String(n))} placeholder="Ej: 40000" className={inputClass} decimals={false} />
            </div>
            <div>
              <label className={labelClass}>Precio venta</label>
              <MontoInput value={precioVenta} onChange={(n) => setPrecioVenta(String(n))} placeholder="Ej: 55000" className={inputClass} decimals={false} />
            </div>
          </div>

          {/* Margen de ganancia por precio (respecto del costo) */}
          {costoNum > 0 && tiersMargen.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Margen de ganancia (vs. costo Gs. {costoNum.toLocaleString("es-PY")})</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {tiersMargen.map((t) => {
                  const markup = (t.val - costoNum) / costoNum * 100;     // sobre costo
                  const margen = (t.val - costoNum) / t.val * 100;        // sobre venta
                  const perdida = t.val < costoNum;
                  return (
                    <div key={t.label} className={`rounded-lg border p-3 ${perdida ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-medium text-slate-500">{t.label}</span>
                        <span className="text-sm font-semibold tabular-nums text-slate-800">Gs. {t.val.toLocaleString("es-PY")}</span>
                      </div>
                      <div className={`mt-1 text-sm font-bold tabular-nums ${perdida ? "text-red-600" : "text-emerald-600"}`}>
                        {markup.toFixed(1)}% <span className="text-[11px] font-normal text-gray-400">markup s/costo</span>
                      </div>
                      <div className="text-[11px] text-gray-400">Margen s/venta: {margen.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Stock */}
        <div className="border-t border-slate-100 pt-6">
          <div className="grid grid-cols-2 gap-5 max-w-md">
            <div>
              <label className={labelClass}>Stock inicial</label>
              <input type="number" min={0} value={stockActual} onChange={(e) => setStockActual(e.target.value)} placeholder="Ej: 10" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Stock mínimo</label>
              <input type="number" min={0} value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} placeholder="Ej: 2" className={inputClass} />
            </div>
          </div>
          {Number(stockActual) > 0 && (
            <p className="mt-2 text-xs text-gray-400">Se generará un movimiento de inventario inicial con {stockActual} unidad(es) al guardar.</p>
          )}
        </div>

        {/* Imágenes: principal + 2 adicionales (opcional) */}
        <div className="border-t border-slate-100 pt-6">
          <label className={labelClass}>Imágenes del ítem (opcional)</label>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {[0, 1, 2].map((i) => {
              const idx = i as 0 | 1 | 2;
              const it = imagenes[idx];
              const rotulo = idx === 0 ? "Principal" : `Adicional ${idx}`;
              return (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <label className="group relative w-full aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#4FAEB2] hover:bg-slate-100 transition-colors overflow-hidden cursor-pointer flex items-center justify-center">
                    {it ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.preview} alt={rotulo} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <span className="mt-1 text-[11px] font-medium">{rotulo}</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleImagenSlot(idx, e)}
                    />
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500">{rotulo}</span>
                    {it && (
                      <button type="button" onClick={() => quitarImagenSlot(idx)} className="text-red-600 hover:underline">
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">JPG, PNG o WebP — máx. 5 MB cada una. La principal es la que muestra el sitio en el catálogo.</p>
          {imagenError && <p className="mt-1.5 text-xs text-red-600">{imagenError}</p>}
        </div>

        {/* Publicación en la web */}
        <div className="border-t border-slate-100 pt-6 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Sitio web</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={visibleWeb}
              onChange={(e) => setVisibleWeb(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#4FAEB2]"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">Activo en la web</span>
              <span className="block text-xs text-slate-400">
                Si está tildado, el ítem aparece en el catálogo público del sitio. Podés cambiarlo
                después desde la lista de inventario.
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-3 ${visibleWeb ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
            <input
              type="checkbox"
              checked={destacado && visibleWeb}
              disabled={!visibleWeb}
              onChange={(e) => setDestacado(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#4FAEB2]"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">Destacado en la web</span>
              <span className="block text-xs text-slate-400">
                Lo muestra en las secciones destacadas del sitio (además del catálogo).
              </span>
            </span>
          </label>
        </div>

        {/* Acciones */}
        <div className="flex gap-4 pt-2 border-t border-slate-100">
          <button type="submit" disabled={submitting} className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? "Guardando..." : "Guardar ítem"}
          </button>
          <button type="button" onClick={() => router.push("/inventario")} className="border border-slate-200 px-5 py-3 rounded-lg text-sm hover:bg-slate-50 transition-colors">Cancelar</button>
        </div>
      </form>
    </div>
  );
}
