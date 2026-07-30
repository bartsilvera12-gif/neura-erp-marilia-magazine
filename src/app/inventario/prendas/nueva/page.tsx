"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface IdNombre { id: string; nombre: string }
interface Color { id: string; nombre: string; codigo_hex?: string | null }
interface Talla { id: string; nombre: string; orden?: number }
interface Ubic { id: string; nombre: string; tipo: string }

interface VarianteRow {
  key: string;
  color_id: string;
  talla_id: string;
  color_nombre: string;
  talla_nombre: string;
  sku: string;
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
function makeSku(nombre: string, color: string, talla: string): string {
  return [slug(nombre).slice(0, 10), slug(color).slice(0, 3), slug(talla).slice(0, 4)].filter(Boolean).join("-");
}

export default function NuevaPrendaPage() {
  const router = useRouter();
  const [colores, setColores] = useState<Color[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [categorias, setCategorias] = useState<IdNombre[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubic[]>([]);
  const [proveedores, setProveedores] = useState<IdNombre[]>([]);

  // Datos base de la prenda
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tipoCorte, setTipoCorte] = useState<"masculino" | "femenino" | "unisex">("unisex");
  const [material, setMaterial] = useState("");
  const [temporada, setTemporada] = useState("");
  const [marca, setMarca] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [estado, setEstado] = useState<"activo" | "agotado" | "discontinuado">("activo");

  // Seleccion de variantes
  const [selColores, setSelColores] = useState<Set<string>>(new Set());
  const [selTallas, setSelTallas] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    let cancel = false;
    async function load(url: string) {
      try { const r = await fetch(url, { credentials: "include" }); const j = await r.json(); return r.ok && j?.success ? j.data : null; } catch { return null; }
    }
    (async () => {
      const [cat, cats, ubis, provs] = await Promise.all([
        load("/api/inventario/prendas/catalogos"),
        load("/api/inventario/categorias"),
        load("/api/inventario/ubicaciones"),
        load("/api/proveedores"),
      ]);
      if (cancel) return;
      if (cat?.colores) setColores(cat.colores as Color[]);
      if (cat?.tallas) setTallas(cat.tallas as Talla[]);
      if (cats?.categorias) setCategorias(cats.categorias as IdNombre[]);
      if (ubis?.ubicaciones) setUbicaciones(ubis.ubicaciones as Ubic[]);
      if (provs?.proveedores) setProveedores(provs.proveedores as IdNombre[]);
    })();
    return () => { cancel = true; };
  }, []);

  const colorById = useMemo(() => new Map(colores.map((c) => [c.id, c])), [colores]);
  const tallaById = useMemo(() => new Map(tallas.map((t) => [t.id, t])), [tallas]);

  function toggle(set: Set<string>, id: string): Set<string> {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }

  function generarMatriz() {
    setError(null);
    if (!nombre.trim()) { setError("Ingresá el nombre de la prenda antes de generar variantes."); return; }
    if (selColores.size === 0 || selTallas.size === 0) { setError("Seleccioná al menos un color y una talla."); return; }
    const rows: VarianteRow[] = [];
    for (const cid of selColores) {
      for (const tid of selTallas) {
        const cn = colorById.get(cid)?.nombre ?? "";
        const tn = tallaById.get(tid)?.nombre ?? "";
        const existing = variantes.find((v) => v.color_id === cid && v.talla_id === tid);
        rows.push(existing ?? {
          key: cid + "_" + tid,
          color_id: cid, talla_id: tid, color_nombre: cn, talla_nombre: tn,
          sku: makeSku(nombre, cn, tn),
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
    if (variantes.some((v) => !v.sku.trim())) { setError("Todas las variantes necesitan SKU."); return; }
    setSubmitting(true);
    try {
      const body = {
        base: {
          nombre, categoria_id: categoriaId || null, tipo_corte: tipoCorte,
          material: material || null, temporada: temporada || null, marca: marca || null,
          descripcion: descripcion || null, proveedor_principal_id: proveedorId || null, estado,
        },
        variantes: variantes.map((v) => ({
          nombre: `${nombre} - ${v.color_nombre} - ${v.talla_nombre}`,
          sku: v.sku, color_id: v.color_id, talla_id: v.talla_id,
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
      setOkMsg(`Prenda creada: ${j.data.count} variante(s).`);
      setTimeout(() => router.push("/inventario"), 1200);
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
        </div>
      </div>

      {/* Colores y tallas */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Variantes: colores × tallas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-gray-500 mb-2">Colores</p>
            <div className="flex flex-wrap gap-2">
              {colores.map((c) => (
                <label key={c.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm ${selColores.has(c.id) ? "border-[#4FAEB2] bg-sky-50" : "border-slate-200"}`}>
                  <input type="checkbox" checked={selColores.has(c.id)} onChange={() => setSelColores((s) => toggle(s, c.id))} />
                  {c.nombre}
                </label>
              ))}
              {colores.length === 0 && <span className="text-xs text-gray-400">Sin colores cargados.</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Tallas</p>
            <div className="flex flex-wrap gap-2">
              {tallas.map((t) => (
                <label key={t.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm ${selTallas.has(t.id) ? "border-[#4FAEB2] bg-sky-50" : "border-slate-200"}`}>
                  <input type="checkbox" checked={selTallas.has(t.id)} onChange={() => setSelTallas((s) => toggle(s, t.id))} />
                  {t.nombre}
                </label>
              ))}
              {tallas.length === 0 && <span className="text-xs text-gray-400">Sin tallas cargadas.</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          <div><label className="block text-[11px] text-gray-400 mb-1">Costo (def)</label><input className={cellCls} value={defCosto} onChange={(e) => setDefCosto(e.target.value)} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-1">Mayorista (def)</label><input className={cellCls} value={defMayorista} onChange={(e) => setDefMayorista(e.target.value)} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-1">Minorista (def)</label><input className={cellCls} value={defMinorista} onChange={(e) => setDefMinorista(e.target.value)} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-1">Venta (def)</label><input className={cellCls} value={defVenta} onChange={(e) => setDefVenta(e.target.value)} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-1">Stock (def)</label><input className={cellCls} value={defStock} onChange={(e) => setDefStock(e.target.value)} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-1">Stock mín (def)</label><input className={cellCls} value={defStockMin} onChange={(e) => setDefStockMin(e.target.value)} /></div>
        </div>

        <button type="button" onClick={generarMatriz} className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-4 py-2 rounded-lg text-sm font-medium">
          Generar matriz de variantes
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
                  <th className="p-1">Color</th><th className="p-1">Talla</th><th className="p-1">SKU</th>
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
                    <td className="p-1"><input className={cellCls + " font-mono"} value={v.sku} onChange={(e) => updateVar(v.key, { sku: e.target.value })} /></td>
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
