"use client";

/**
 * Configuración → Explorar la colección.
 *
 * Controla el carrusel "Explorar la colección" del home del sitio público.
 * No hay tabla propia: la sección se arma con los productos que tienen
 * `destacado = true` en inventario, así que esta pantalla es una vista
 * enfocada sobre ese flag (agregar, sacar y ver cómo va a quedar).
 */

import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface Producto {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  imagen_url: string | null;
  destacado: boolean;
  visible_web: boolean;
}

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]";

export default function ExplorarColeccionPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aQuitar, setAQuitar] = useState<Producto | null>(null);

  async function cargar() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/productos?limit=500", { credentials: "include" });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "No se pudieron cargar los productos.");
      setProductos(
        ((j.data?.productos ?? []) as Array<Record<string, unknown>>).map((x) => ({
          id: String(x.id),
          nombre: String(x.nombre ?? ""),
          sku: String(x.sku ?? ""),
          precio_venta: Number(x.precio_venta ?? 0),
          imagen_url: (x.imagen_url as string | null) ?? null,
          destacado: x.destacado === true,
          visible_web: x.visible_web !== false,
        }))
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function setDestacado(p: Producto, destacado: boolean) {
    if (guardando) return;
    setGuardando(p.id);
    setErr(null);
    try {
      const r = await fetch(`/api/productos/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ destacado }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "No se pudo actualizar el producto.");
      setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, destacado } : x)));
      setAQuitar(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo actualizar el producto.");
    } finally {
      setGuardando(null);
    }
  }

  const destacados = useMemo(
    () => productos.filter((p) => p.destacado).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos]
  );

  const candidatos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos
      .filter((p) => !p.destacado)
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 40);
  }, [productos, busqueda]);

  /** Un destacado que no está publicado nunca llega al sitio. */
  const ocultos = destacados.filter((p) => !p.visible_web);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Explorar la colección</h1>
        <p className="text-sm text-slate-500 mt-1">
          Carrusel del home del sitio. Muestra los productos marcados como destacados, ordenados por
          nombre.
        </p>
      </div>

      {err && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>
      )}

      {destacados.length === 0 && !loading && (
        <div className="mb-6 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          Todavía no hay destacados. Mientras tanto el sitio muestra las fotos de ejemplo del diseño
          original — en cuanto agregues el primero, pasa a mostrar tus productos.
        </div>
      )}

      {ocultos.length > 0 && (
        <div className="mb-6 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {ocultos.length === 1
            ? `"${ocultos[0].nombre}" está destacado pero no está activo en la web, así que no se muestra.`
            : `${ocultos.length} productos destacados no están activos en la web, así que no se muestran.`}
        </div>
      )}

      {/* En el carrusel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-xs uppercase tracking-wide text-slate-500">En el carrusel</span>
          <span className="text-xs text-slate-400">
            {destacados.length === 1 ? "1 producto" : `${destacados.length} productos`}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : destacados.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguno todavía. Agregá el primero desde la lista de abajo.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {destacados.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="aspect-[3/4] bg-slate-100">
                  {p.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400">
                      Sin foto
                    </div>
                  )}
                </div>
                <div className="p-2.5 space-y-1">
                  <p className="text-xs font-medium text-slate-800 line-clamp-2">{p.nombre}</p>
                  <p className="text-[11px] text-slate-400">
                    {p.precio_venta > 0 ? `Gs. ${p.precio_venta.toLocaleString("es-PY")}` : "Sin precio"}
                  </p>
                  {!p.visible_web && (
                    <p className="text-[11px] text-amber-700">No activo en la web</p>
                  )}
                  <button
                    onClick={() => setAQuitar(p)}
                    disabled={guardando === p.id}
                    className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
                  >
                    Quitar del carrusel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agregar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Agregar productos</div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o SKU…"
          className={inputCls}
        />
        <div className="mt-3 max-h-96 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
          {loading ? (
            <p className="px-3 py-4 text-sm text-slate-400">Cargando…</p>
          ) : candidatos.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">Sin coincidencias.</p>
          ) : (
            candidatos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-2 py-2">
                <div className="h-10 w-10 shrink-0 rounded bg-slate-100 overflow-hidden">
                  {p.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagen_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{p.nombre}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{p.sku}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {p.precio_venta > 0 ? `Gs. ${p.precio_venta.toLocaleString("es-PY")}` : "Sin precio"}
                </span>
                <button
                  onClick={() => setDestacado(p, true)}
                  disabled={guardando === p.id}
                  className="shrink-0 rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {guardando === p.id ? "…" : "Destacar"}
                </button>
              </div>
            ))
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Es el mismo check &quot;Destacado en la web&quot; de la ficha del producto: lo que cambies acá
          se ve allá y al revés.
        </p>
      </div>

      <ConfirmModal
        open={aQuitar !== null}
        title="Quitar del carrusel"
        tone="danger"
        confirmLabel="Quitar"
        loading={guardando !== null}
        onCancel={() => { if (!guardando) setAQuitar(null); }}
        onConfirm={() => { if (aQuitar) setDestacado(aQuitar, false); }}
        message={
          <>
            <strong>{aQuitar?.nombre}</strong> deja de aparecer en el carrusel del home. El producto no
            se borra ni se saca del catálogo: solo se le quita el destacado.
          </>
        }
      />
    </div>
  );
}
