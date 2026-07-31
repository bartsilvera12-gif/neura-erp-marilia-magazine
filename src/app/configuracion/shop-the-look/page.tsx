"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface Producto {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  imagen_url: string | null;
}
interface LookItem {
  id?: string;
  producto_id: string;
  orden: number;
  etiqueta: string | null;
  producto?: Producto | null;
}
interface Look {
  id: string;
  titulo: string;
  subtitulo: string | null;
  imagen_url: string | null;
  orden: number;
  activo: boolean;
  items: LookItem[];
}

/** Look en edición dentro del modal. `id` null = alta. */
interface Borrador {
  id: string | null;
  titulo: string;
  subtitulo: string;
  imagen_url: string;
  orden: number;
  activo: boolean;
  items: Array<{ producto_id: string; etiqueta: string }>;
}

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]";

export default function ShopTheLookPage() {
  const [looks, setLooks] = useState<Look[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<Borrador | null>(null);
  /** Look pendiente de confirmar borrado (modal propio, no el confirm del navegador). */
  const [aEliminar, setAEliminar] = useState<Look | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function cargar() {
    setLoading(true);
    const [l, p] = await Promise.all([
      fetch("/api/sitio-admin/shop-the-look", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/productos?limit=500", { credentials: "include" }).then((r) => r.json()),
    ]);
    setLooks(l?.data?.looks ?? []);
    setProductos(
      ((p?.data?.items ?? p?.data?.productos ?? []) as Array<Record<string, unknown>>).map((x) => ({
        id: String(x.id),
        nombre: String(x.nombre ?? ""),
        sku: String(x.sku ?? ""),
        precio_venta: Number(x.precio_venta ?? 0),
        imagen_url: (x.imagen_url as string | null) ?? null,
      }))
    );
    setLoading(false);
  }
  useEffect(() => { cargar(); }, []);

  function nuevoLook() {
    setEditando({
      id: null,
      titulo: "",
      subtitulo: "",
      imagen_url: "",
      orden: looks.length,
      activo: true,
      items: [],
    });
  }

  function editarLook(look: Look) {
    setEditando({
      id: look.id,
      titulo: look.titulo,
      subtitulo: look.subtitulo ?? "",
      imagen_url: look.imagen_url ?? "",
      orden: look.orden,
      activo: look.activo,
      items: look.items
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((i) => ({ producto_id: i.producto_id, etiqueta: i.etiqueta ?? "" })),
    });
  }

  async function confirmarEliminar() {
    if (!aEliminar || eliminando) return;
    setEliminando(true);
    try {
      await fetch(`/api/sitio-admin/shop-the-look/${aEliminar.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setMsg(`Look "${aEliminar.titulo}" eliminado.`);
      setAEliminar(null);
      cargar();
    } finally {
      setEliminando(false);
    }
  }

  async function toggleActivo(look: Look, activo: boolean) {
    await fetch(`/api/sitio-admin/shop-the-look/${look.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo }),
    });
    cargar();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Shop the look</h1>
          <p className="text-sm text-slate-500 mt-1">
            Combos de productos que aparecen en la sección &quot;El look completo&quot; del sitio.
          </p>
        </div>
        <button onClick={nuevoLook} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm">
          + Nuevo look
        </button>
      </div>

      {msg && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{msg}</div>
      )}

      {loading ? (
        <div className="text-slate-400">Cargando…</div>
      ) : looks.length === 0 ? (
        <div className="text-slate-400 border border-dashed border-slate-300 rounded-lg p-12 text-center">
          Aún no hay looks. Creá el primero con el botón de arriba.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {looks.map((look) => (
            <div key={look.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="aspect-[3/4] bg-slate-100 relative">
                {look.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={look.imagen_url} alt={look.titulo} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Sin foto</div>
                )}
                {!look.activo && (
                  <span className="absolute top-2 left-2 text-[11px] bg-slate-900/80 text-white px-2 py-0.5 rounded">
                    Oculto en el sitio
                  </span>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{look.titulo}</p>
                  {look.subtitulo && <p className="text-xs text-slate-500">{look.subtitulo}</p>}
                </div>
                <p className="text-xs text-slate-500">
                  {look.items.length === 0
                    ? "Sin prendas"
                    : look.items.length === 1
                      ? "1 prenda"
                      : `${look.items.length} prendas`}
                </p>
                <div className="mt-auto pt-2 flex items-center justify-between border-t border-slate-100">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={look.activo}
                      onChange={(e) => toggleActivo(look, e.target.checked)}
                      className="accent-[#4FAEB2]"
                    />
                    Visible
                  </label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => editarLook(look)} className="text-xs text-sky-700 hover:underline">Editar</button>
                    <button onClick={() => setAEliminar(look)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-xs text-slate-400">
        <Link href="/configuracion" className="underline">← Volver a configuración</Link>
      </div>

      <ConfirmModal
        open={aEliminar !== null}
        title="Eliminar look"
        tone="danger"
        confirmLabel="Eliminar"
        loading={eliminando}
        onCancel={() => { if (!eliminando) setAEliminar(null); }}
        onConfirm={confirmarEliminar}
        message={
          <>
            Se borra <strong>{aEliminar?.titulo}</strong> y deja de mostrarse en la sección
            &quot;El look completo&quot; del sitio. Las prendas del look no se tocan.
            <br />
            Esta acción no se puede deshacer.
          </>
        }
      />

      {editando && (
        <LookModal
          borrador={editando}
          productos={productos}
          onClose={() => setEditando(null)}
          onSaved={(texto) => { setEditando(null); setMsg(texto); cargar(); }}
        />
      )}
    </div>
  );
}

/**
 * Modal de alta/edición: a la izquierda los datos y las prendas del look, a la
 * derecha la foto con su preview. Todo se guarda de una sola vez al confirmar.
 */
function LookModal({
  borrador,
  productos,
  onClose,
  onSaved,
}: {
  borrador: Borrador;
  productos: Producto[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [titulo, setTitulo] = useState(borrador.titulo);
  const [subtitulo, setSubtitulo] = useState(borrador.subtitulo);
  const [orden, setOrden] = useState(String(borrador.orden));
  const [activo, setActivo] = useState(borrador.activo);
  const [items, setItems] = useState(borrador.items);
  const [imagenUrl, setImagenUrl] = useState(borrador.imagen_url);
  const [preview, setPreview] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const productoById = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const candidatos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const yaPuestos = new Set(items.map((i) => i.producto_id));
    return productos
      .filter((p) => !yaPuestos.has(p.id))
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 40);
  }, [productos, items, busqueda]);

  function agregar(id: string) {
    setItems((prev) => [...prev, { producto_id: id, etiqueta: "" }]);
    setBusqueda("");
  }
  function quitar(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function mover(idx: number, delta: number) {
    setItems((prev) => {
      const destino = idx + delta;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = prev.slice();
      const [fila] = copia.splice(idx, 1);
      copia.splice(destino, 0, fila);
      return copia;
    });
  }
  function setEtiqueta(idx: number, valor: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, etiqueta: valor } : it)));
  }

  async function subirFoto(file: File | null) {
    if (!file) return;
    setErr(null);
    setPreview(URL.createObjectURL(file));
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (borrador.id) fd.append("nombre", borrador.id);
      const r = await fetch("/api/sitio-admin/shop-the-look/imagen", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "No se pudo subir la imagen.");
      setImagenUrl(j.data.imagen_url as string);
    } catch (e) {
      setPreview(null);
      setErr(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  async function guardar() {
    if (guardando) return;
    const t = titulo.trim();
    if (!t) { setErr("El título es obligatorio."); return; }
    setGuardando(true);
    setErr(null);
    try {
      const payload = {
        titulo: t,
        subtitulo: subtitulo.trim() || null,
        imagen_url: imagenUrl.trim() || null,
        orden: Number(orden) || 0,
        activo,
        items: items.map((it, idx) => ({
          producto_id: it.producto_id,
          orden: idx,
          etiqueta: it.etiqueta.trim() || null,
        })),
      };
      const url = borrador.id
        ? `/api/sitio-admin/shop-the-look/${borrador.id}`
        : "/api/sitio-admin/shop-the-look";
      const r = await fetch(url, {
        method: borrador.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "No se pudo guardar el look.");
      onSaved(borrador.id ? "Look actualizado." : "Look creado.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el look.");
    } finally {
      setGuardando(false);
    }
  }

  const fotoVisible = preview ?? (imagenUrl.trim() || null);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            {borrador.id ? "Editar look" : "Nuevo look"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Cargá las prendas del combo a la izquierda y la foto del look a la derecha.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6 p-5 overflow-y-auto">
          {/* ── Izquierda: datos + prendas ─────────────────────────────── */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-600 mb-1">Título *</label>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: El look completo"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Orden</label>
                <input type="number" value={orden} onChange={(e) => setOrden(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Subtítulo (opcional)</label>
              <input
                value={subtitulo}
                onChange={(e) => setSubtitulo(e.target.value)}
                placeholder="Ej: Tres piezas, un mismo gesto"
                className={inputCls}
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Prendas del look</p>

              {items.length === 0 ? (
                <p className="text-sm text-slate-400 mb-3">Todavía no agregaste ninguna prenda.</p>
              ) : (
                <ul className="space-y-2 mb-3">
                  {items.map((it, idx) => {
                    const p = productoById.get(it.producto_id);
                    return (
                      <li key={`${it.producto_id}-${idx}`} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <div className="h-10 w-10 shrink-0 rounded bg-white border border-slate-200 overflow-hidden">
                          {p?.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imagen_url} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 truncate">{p?.nombre ?? it.producto_id}</p>
                          <p className="text-[11px] text-slate-400">
                            Gs. {(p?.precio_venta ?? 0).toLocaleString("es-PY")}
                          </p>
                        </div>
                        <input
                          value={it.etiqueta}
                          onChange={(e) => setEtiqueta(idx, e.target.value)}
                          placeholder="Etiqueta"
                          className="w-28 border border-slate-200 rounded px-2 py-1 text-xs"
                          title="Texto chico que muestra el sitio sobre la prenda (ej: VESTIDOS)"
                        />
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => mover(idx, -1)}
                            disabled={idx === 0}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs leading-none"
                            aria-label="Subir"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => mover(idx, 1)}
                            disabled={idx === items.length - 1}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs leading-none"
                            aria-label="Bajar"
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => quitar(idx)}
                          className="text-xs text-red-600 hover:underline shrink-0"
                        >
                          Quitar
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar prenda por nombre o SKU…"
                className={inputCls}
              />
              <div className="mt-2 max-h-52 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                {candidatos.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-slate-400">Sin coincidencias.</p>
                ) : (
                  candidatos.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => agregar(p.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50"
                    >
                      <div className="h-8 w-8 shrink-0 rounded bg-slate-100 overflow-hidden">
                        {p.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imagen_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{p.nombre}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        Gs. {p.precio_venta.toLocaleString("es-PY")}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ── Derecha: foto del look ─────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Foto del look</p>
            <div className="aspect-[3/4] w-full rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
              {fotoVisible ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoVisible} alt="Vista previa del look" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-slate-400">Sin foto</span>
              )}
            </div>
            <label className="block">
              <span className="inline-block w-full text-center bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm px-4 py-2 rounded-lg cursor-pointer transition-colors">
                {subiendo ? "Subiendo…" : fotoVisible ? "Cambiar foto" : "Seleccionar foto"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => subirFoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-[11px] text-slate-400">JPG, PNG o WebP — máx. 10 MB.</p>
            <div>
              <label className="block text-xs text-slate-600 mb-1">…o pegá una URL</label>
              <input
                value={imagenUrl}
                onChange={(e) => { setImagenUrl(e.target.value); setPreview(null); }}
                placeholder="https://…"
                className={`${inputCls} font-mono text-xs`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pt-2 border-t border-slate-100">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="accent-[#4FAEB2]"
              />
              Visible en el sitio
            </label>
          </div>
        </div>

        {err && (
          <p className="mx-5 mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={guardando} className="text-sm text-slate-600 px-4 py-2 rounded-lg hover:text-slate-900">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || subiendo || !titulo.trim()}
            className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {guardando ? "Guardando…" : borrador.id ? "Guardar cambios" : "Crear look"}
          </button>
        </div>
      </div>
    </div>
  );
}
