"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface IdNombre { id: string; nombre: string }
interface Ubic { id: string; nombre: string; tipo: string }

interface VarianteRow {
  key: string;
  color_nombre: string;
  talla_nombre: string;
  stock_actual: string;
  stock_minimo: string;
  precio_costo: string;
  precio_mayorista: string;
  precio_minorista: string;
  precio_venta: string;
  codigo_barras: string;
}

const inputCls = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none w-full";
const cellCls = "border border-slate-200 rounded px-2 py-1 text-sm w-full";

function slug(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export default function NuevaPrendaPage() {
  const router = useRouter();
  const [categorias, setCategorias] = useState<IdNombre[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubic[]>([]);
  const [proveedores, setProveedores] = useState<IdNombre[]>([]);

  // Datos base de la prenda
  const [nombre, setNombre] = useState("");
  // Código del catálogo del proveedor. Puede repetirse entre prendas: el
  // identificador único lo genera el backend.
  const [codigoProveedor, setCodigoProveedor] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tipoCorte, setTipoCorte] = useState<"masculino" | "femenino" | "unisex">("unisex");
  const [material, setMaterial] = useState("");
  const [temporada, setTemporada] = useState("");
  const [marca, setMarca] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [estado, setEstado] = useState<"activo" | "agotado" | "discontinuado">("activo");
  // Publicado en el catálogo web (aplica a todas las variantes generadas).
  const [visibleWeb, setVisibleWeb] = useState(true);
  const [destacado, setDestacado] = useState(false);

  // Colores y tallas se escriben como texto separado por coma.
  // Ej: "Negro, Blanco, Rosa" y "S, M, L, XL"
  const [coloresInput, setColoresInput] = useState("");
  const [tallasInput, setTallasInput] = useState("");

  // Precios por defecto que llenan la matriz
  const [defCosto, setDefCosto] = useState("");
  const [defMayorista, setDefMayorista] = useState("");
  const [defMinorista, setDefMinorista] = useState("");
  const [defVenta, setDefVenta] = useState("");
  const [defStock, setDefStock] = useState("0");
  const [defStockMin, setDefStockMin] = useState("0");

  const [variantes, setVariantes] = useState<VarianteRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Fotos por color: colorNombre (normalizado) → { file, previewUrl }.
  // Se aplican a TODAS las variantes del color después de crear la prenda.
  const [fotoPorColor, setFotoPorColor] = useState<Record<string, { file: File; preview: string }>>({});

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
      if (cats?.categorias) setCategorias(cats.categorias as IdNombre[]);
      if (ubis?.ubicaciones) setUbicaciones(ubis.ubicaciones as Ubic[]);
      if (provs?.proveedores) setProveedores(provs.proveedores as IdNombre[]);
    })();
    return () => { cancel = true; };
  }, []);

  const coloresParsed = useMemo(
    () => Array.from(new Set(coloresInput.split(",").map((s) => s.trim()).filter(Boolean))),
    [coloresInput]
  );
  const tallasParsed = useMemo(
    () => Array.from(new Set(tallasInput.split(",").map((s) => s.trim()).filter(Boolean))),
    [tallasInput]
  );

  function generarMatriz() {
    setError(null);
    if (!nombre.trim()) { setError("Ingresá el nombre de la prenda antes de generar variantes."); return; }
    if (coloresParsed.length === 0 || tallasParsed.length === 0) { setError("Escribí al menos un color y una talla (separados por coma)."); return; }
    const rows: VarianteRow[] = [];
    for (const cn of coloresParsed) {
      for (const tn of tallasParsed) {
        const key = slug(cn) + "_" + slug(tn);
        const existing = variantes.find((v) => v.key === key);
        rows.push(existing ?? {
          key,
          color_nombre: cn, talla_nombre: tn,
          stock_actual: defStock, stock_minimo: defStockMin,
          precio_costo: defCosto, precio_mayorista: defMayorista, precio_minorista: defMinorista, precio_venta: defVenta,
          codigo_barras: "",
        });
      }
    }
    setVariantes(rows);
  }

  function updateVar(key: string, patch: Partial<VarianteRow>) {
    setVariantes((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }
  function removeVar(key: string) {
    setVariantes((prev) => prev.filter((v) => v.key !== key));
  }

  async function guardar() {
    setError(null); setOkMsg(null);
    if (!nombre.trim()) { setError("El nombre de la prenda es obligatorio."); return; }
    if (variantes.length === 0) { setError("Generá al menos una variante."); return; }
    setSubmitting(true);
    try {
      const body = {
        base: {
          nombre, categoria_id: categoriaId || null, tipo_corte: tipoCorte,
          material: material || null, temporada: temporada || null, marca: marca || null,
          descripcion: descripcion || null, proveedor_principal_id: proveedorId || null, estado,
          visible_web: visibleWeb,
          destacado: destacado && visibleWeb,
        },
        variantes: variantes.map((v) => ({
          nombre: `${nombre} - ${v.color_nombre} - ${v.talla_nombre}`,
          codigo_proveedor: codigoProveedor.trim() || null,
          color_nombre: v.color_nombre, talla_nombre: v.talla_nombre,
          stock_actual: Number(v.stock_actual) || 0, stock_minimo: Number(v.stock_minimo) || 0,
          precio_costo: Number(v.precio_costo) || 0, precio_mayorista: Number(v.precio_mayorista) || 0,
          precio_minorista: Number(v.precio_minorista) || 0, precio_venta: Number(v.precio_venta) || 0,
          codigo_barras: v.codigo_barras || null, ubicacion_principal_id: ubicacionId || null,
        })),
      };
      const r = await fetch("/api/inventario/prendas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error || `Error ${r.status} al crear la prenda.`);

      // Subir fotos por color y aplicar a TODAS las variantes del color
      const creadas = (j.data?.variantes as Array<{ id: string; sku: string }> | undefined) ?? [];
      // Mapear colorKey (slug) → array de variante IDs
      const varByColor: Record<string, string[]> = {};
      variantes.forEach((v, idx) => {
        const created = creadas[idx];
        if (!created) return;
        const key = slug(v.color_nombre);
        if (!varByColor[key]) varByColor[key] = [];
        varByColor[key].push(created.id);
      });

      const colorFotoEntries = Object.entries(fotoPorColor);
      if (colorFotoEntries.length > 0) {
        setOkMsg(`Prenda creada: ${creadas.length} variante(s). Subiendo fotos…`);
        for (const [colorKey, { file }] of colorFotoEntries) {
          const varIds = varByColor[colorKey] || [];
          if (varIds.length === 0) continue;
          // Subir foto a la primera variante del color
          const firstId = varIds[0];
          const fd = new FormData();
          fd.append("file", file);
          const up = await fetch(`/api/productos/${firstId}/imagen`, { method: "POST", credentials: "include", body: fd });
          const jUp = await up.json().catch(() => ({}));
          const imagenPath = jUp?.data?.imagen_path as string | undefined;
          if (!imagenPath) continue;
          // Copiar el imagen_path a las variantes restantes del mismo color
          // (todas apuntan al mismo archivo en Storage; el listado firma el URL al vuelo).
          await Promise.all(
            varIds.slice(1).map((vid) =>
              fetch(`/api/productos/${vid}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ imagen_path: imagenPath, imagen_url: null }),
              })
            )
          );
        }
      }

      setOkMsg(`Prenda creada: ${creadas.length} variante(s)${colorFotoEntries.length > 0 ? " con fotos" : ""}.`);
      setTimeout(() => router.push("/inventario"), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Nueva prenda (ropa)</h1>
          <p className="text-gray-600">Cargá una prenda y generá variantes por color y talla.</p>
        </div>
        <Link href="/inventario" className="text-sm text-gray-500 hover:text-gray-800 underline">← Volver a inventario</Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-2">{okMsg}</div>}

      {/* Datos base */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Datos de la prenda</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
            <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Blusa manga corta" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Código del proveedor <span className="text-gray-400">(puede repetirse)</span>
            </label>
            <input className={inputCls} value={codigoProveedor} onChange={(e) => setCodigoProveedor(e.target.value)} placeholder="Ej: 03765" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo de corte</label>
            <select className={inputCls} value={tipoCorte} onChange={(e) => setTipoCorte(e.target.value as typeof tipoCorte)}>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Categoría / Prenda</label>
            <select className={inputCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Material / Tela</label><input className={inputCls} value={material} onChange={(e) => setMaterial(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Temporada</label><input className={inputCls} value={temporada} onChange={(e) => setTemporada(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Marca / Línea</label><input className={inputCls} value={marca} onChange={(e) => setMarca(e.target.value)} /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Proveedor</label>
            <select className={inputCls} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">— Sin proveedor —</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ubicación (aplica a variantes)</label>
            <select className={inputCls} value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
              <option value="">— Sin ubicación —</option>
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre} — {u.tipo}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Estado</label>
            <select className={inputCls} value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
              <option value="activo">Activo</option>
              <option value="agotado">Agotado</option>
              <option value="discontinuado">Discontinuado</option>
            </select>
          </div>
          <div className="md:col-span-3"><label className="block text-xs text-gray-500 mb-1">Descripción</label><textarea className={inputCls} rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          <div className="md:col-span-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleWeb}
                onChange={(e) => setVisibleWeb(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#4FAEB2]"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">Activo en la web</span>
                <span className="block text-xs text-gray-500">
                  Publica todas las variantes generadas en el catálogo público del sitio.
                </span>
              </span>
            </label>
            <label className={`mt-3 flex items-start gap-3 ${visibleWeb ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
              <input
                type="checkbox"
                checked={destacado && visibleWeb}
                disabled={!visibleWeb}
                onChange={(e) => setDestacado(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#4FAEB2]"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">Destacado en la web</span>
                <span className="block text-xs text-gray-500">
                  Lo muestra en las secciones destacadas del sitio, además del catálogo.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Colores y tallas */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Variantes: colores × tallas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Colores <span className="text-gray-400">(separados por coma)</span>
            </label>
            <input
              className={inputCls}
              value={coloresInput}
              onChange={(e) => setColoresInput(e.target.value)}
              placeholder="Negro, Blanco, Rosa"
            />
            {coloresParsed.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coloresParsed.map((c) => (
                  <span key={c} className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-[11px] text-sky-700">{c}</span>
                ))}
              </div>
            )}

            {coloresParsed.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-gray-500 mb-3">Foto por color <span className="text-gray-400">(opcional — se aplica a todas las tallas de ese color)</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {coloresParsed.map((cn) => {
                    const key = slug(cn);
                    const asig = fotoPorColor[key];
                    return (
                      <div key={key} className="border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                        <label className="shrink-0 h-14 w-14 rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center cursor-pointer overflow-hidden hover:bg-slate-100">
                          {asig ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={asig.preview} alt={cn} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-slate-400 text-center px-1">Subir foto</span>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                setFotoPorColor((prev) => ({ ...prev, [key]: { file: f, preview: URL.createObjectURL(f) } }));
                              }
                            }}
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{cn}</div>
                          {asig && (
                            <button
                              type="button"
                              onClick={() => setFotoPorColor((prev) => { const c = { ...prev }; delete c[key]; return c; })}
                              className="text-[11px] text-red-600 hover:underline"
                            >
                              Quitar foto
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Tallas <span className="text-gray-400">(separadas por coma)</span>
            </label>
            <input
              className={inputCls}
              value={tallasInput}
              onChange={(e) => setTallasInput(e.target.value)}
              placeholder="S, M, L, XL"
            />
            {tallasParsed.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tallasParsed.map((t) => (
                  <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-[11px] text-sky-700">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-gray-500 mb-3">
            Valores iniciales <span className="text-gray-400">(opcional — se copian a todas las variantes; después editás cada fila con su stock y precio real)</span>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div><label className="block text-[11px] text-gray-400 mb-1">Costo</label><input className={cellCls} value={defCosto} onChange={(e) => setDefCosto(e.target.value)} /></div>
            <div><label className="block text-[11px] text-gray-400 mb-1">Mayorista</label><input className={cellCls} value={defMayorista} onChange={(e) => setDefMayorista(e.target.value)} /></div>
            <div><label className="block text-[11px] text-gray-400 mb-1">Minorista</label><input className={cellCls} value={defMinorista} onChange={(e) => setDefMinorista(e.target.value)} /></div>
            <div><label className="block text-[11px] text-gray-400 mb-1">Venta</label><input className={cellCls} value={defVenta} onChange={(e) => setDefVenta(e.target.value)} /></div>
            <div><label className="block text-[11px] text-gray-400 mb-1">Stock</label><input className={cellCls} value={defStock} onChange={(e) => setDefStock(e.target.value)} /></div>
            <div><label className="block text-[11px] text-gray-400 mb-1">Stock mín</label><input className={cellCls} value={defStockMin} onChange={(e) => setDefStockMin(e.target.value)} /></div>
          </div>
        </div>

        <button type="button" onClick={generarMatriz} className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-4 py-2 rounded-lg text-sm font-medium">
          {variantes.length > 0 ? "Regenerar grilla de variantes" : "Siguiente: cargar stock y precios por variante →"}
        </button>
      </div>

      {/* Matriz */}
      {variantes.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold">Variantes a crear ({variantes.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="p-1">Color</th><th className="p-1">Talla</th>
                  <th className="p-1">Stock</th><th className="p-1">St.mín</th>
                  <th className="p-1">Costo</th><th className="p-1">Mayorista</th><th className="p-1">Minorista</th><th className="p-1">Venta</th>
                  <th className="p-1">Cód. barras</th><th className="p-1"></th>
                </tr>
              </thead>
              <tbody>
                {variantes.map((v) => (
                  <tr key={v.key} className="border-t border-slate-100">
                    <td className="p-1">{v.color_nombre}</td>
                    <td className="p-1">{v.talla_nombre}</td>
                    <td className="p-1 w-16"><input className={cellCls} value={v.stock_actual} onChange={(e) => updateVar(v.key, { stock_actual: e.target.value })} /></td>
                    <td className="p-1 w-16"><input className={cellCls} value={v.stock_minimo} onChange={(e) => updateVar(v.key, { stock_minimo: e.target.value })} /></td>
                    <td className="p-1 w-20"><input className={cellCls} value={v.precio_costo} onChange={(e) => updateVar(v.key, { precio_costo: e.target.value })} /></td>
                    <td className="p-1 w-20"><input className={cellCls} value={v.precio_mayorista} onChange={(e) => updateVar(v.key, { precio_mayorista: e.target.value })} /></td>
                    <td className="p-1 w-20"><input className={cellCls} value={v.precio_minorista} onChange={(e) => updateVar(v.key, { precio_minorista: e.target.value })} /></td>
                    <td className="p-1 w-20"><input className={cellCls} value={v.precio_venta} onChange={(e) => updateVar(v.key, { precio_venta: e.target.value })} /></td>
                    <td className="p-1 w-28"><input className={cellCls} value={v.codigo_barras} onChange={(e) => updateVar(v.key, { codigo_barras: e.target.value })} /></td>
                    <td className="p-1"><button type="button" onClick={() => removeVar(v.key)} className="text-red-500 hover:text-red-700">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={guardar} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
              {submitting ? "Guardando..." : `Crear prenda + ${variantes.length} variante(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
