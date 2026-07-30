"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Producto {
  id: string;
  nombre: string;
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

export default function ShopTheLookPage() {
  const [looks, setLooks] = useState<Look[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    const [l, p] = await Promise.all([
      fetch("/api/sitio-admin/shop-the-look", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/productos?limit=200", { credentials: "include" }).then((r) => r.json()),
    ]);
    setLooks(l?.data?.looks ?? []);
    setProductos((p?.data?.items ?? p?.data?.productos ?? []).map((x: Record<string, unknown>) => ({
      id: String(x.id),
      nombre: String(x.nombre ?? ""),
      precio_venta: Number(x.precio_venta ?? 0),
      imagen_url: (x.imagen_url as string | null) ?? null,
    })));
    setLoading(false);
  }
  useEffect(() => { cargar(); }, []);

  async function crearLook() {
    const titulo = prompt("Título del look (ej: 'El look completo')");
    if (!titulo) return;
    const r = await fetch("/api/sitio-admin/shop-the-look", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ titulo, orden: looks.length, items: [] }),
    });
    if (r.ok) { setMsg("Look creado"); cargar(); }
  }

  async function eliminarLook(id: string) {
    if (!confirm("¿Eliminar este look?")) return;
    await fetch(`/api/sitio-admin/shop-the-look/${id}`, { method: "DELETE", credentials: "include" });
    cargar();
  }

  async function agregarItem(look: Look, producto_id: string) {
    if (!producto_id) return;
    const items = [
      ...look.items.map((i) => ({ producto_id: i.producto_id, orden: i.orden, etiqueta: i.etiqueta })),
      { producto_id, orden: look.items.length, etiqueta: null },
    ];
    setSaving(look.id);
    await fetch(`/api/sitio-admin/shop-the-look/${look.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items }),
    });
    setSaving(null);
    cargar();
  }

  async function quitarItem(look: Look, index: number) {
    const items = look.items
      .filter((_, i) => i !== index)
      .map((i, idx) => ({ producto_id: i.producto_id, orden: idx, etiqueta: i.etiqueta }));
    setSaving(look.id);
    await fetch(`/api/sitio-admin/shop-the-look/${look.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items }),
    });
    setSaving(null);
    cargar();
  }

  async function actualizarLook(id: string, patch: Partial<Look>) {
    setSaving(id);
    await fetch(`/api/sitio-admin/shop-the-look/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    setSaving(null);
    cargar();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Shop the look</h1>
          <p className="text-sm text-slate-500 mt-1">Combos de productos que aparecen en la sección &quot;El look completo&quot; del sitio.</p>
        </div>
        <button onClick={crearLook} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm">+ Nuevo look</button>
      </div>

      {msg && <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{msg}</div>}

      {loading ? (
        <div className="text-slate-400">Cargando…</div>
      ) : looks.length === 0 ? (
        <div className="text-slate-400 border border-dashed border-slate-300 rounded-lg p-12 text-center">
          Aún no hay looks. Creá el primero con el botón de arriba.
        </div>
      ) : (
        <div className="space-y-4">
          {looks.map((look) => (
            <div key={look.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <input
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    defaultValue={look.titulo}
                    onBlur={(e) => e.target.value !== look.titulo && actualizarLook(look.id, { titulo: e.target.value })}
                    placeholder="Título"
                  />
                  <input
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    defaultValue={look.subtitulo ?? ""}
                    onBlur={(e) => e.target.value !== (look.subtitulo ?? "") && actualizarLook(look.id, { subtitulo: e.target.value })}
                    placeholder="Subtítulo (opcional)"
                  />
                  <input
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm col-span-2"
                    defaultValue={look.imagen_url ?? ""}
                    onBlur={(e) => e.target.value !== (look.imagen_url ?? "") && actualizarLook(look.id, { imagen_url: e.target.value })}
                    placeholder="URL imagen principal (opcional)"
                  />
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" defaultChecked={look.activo} onChange={(e) => actualizarLook(look.id, { activo: e.target.checked })} />
                    Visible
                  </label>
                  <button onClick={() => eliminarLook(look.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Productos del look</div>
                {look.items.length === 0 ? (
                  <div className="text-sm text-slate-400 mb-3">Ningún producto agregado.</div>
                ) : (
                  <ul className="space-y-2 mb-3">
                    {look.items.map((it, idx) => (
                      <li key={idx} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2 text-sm">
                        <span>{it.producto?.nombre ?? it.producto_id} — Gs. {(it.producto?.precio_venta ?? 0).toLocaleString("es-PY")}</span>
                        <button onClick={() => quitarItem(look, idx)} className="text-xs text-red-600 hover:underline">Quitar</button>
                      </li>
                    ))}
                  </ul>
                )}
                <select
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full"
                  value=""
                  disabled={saving === look.id}
                  onChange={(e) => agregarItem(look, e.target.value)}
                >
                  <option value="">+ Agregar producto…</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} — Gs. {p.precio_venta.toLocaleString("es-PY")}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-xs text-slate-400">
        <Link href="/configuracion" className="underline">← Volver a configuración</Link>
      </div>
    </div>
  );
}
