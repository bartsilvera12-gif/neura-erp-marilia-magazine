"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

interface Ubicacion {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  parent_id: string | null;
  activo: boolean;
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

const TIPOS: { value: string; label: string; icono: string; tono: string }[] = [
  { value: "deposito", label: "Depósito", icono: "🏢", tono: "bg-sky-50 text-sky-700" },
  { value: "salon",    label: "Salón",    icono: "🛍️", tono: "bg-amber-50 text-amber-700" },
  { value: "pasillo",  label: "Pasillo",  icono: "↔️", tono: "bg-violet-50 text-violet-700" },
  { value: "gondola",  label: "Góndola",  icono: "📦", tono: "bg-emerald-50 text-emerald-700" },
  { value: "estante",  label: "Estante",  icono: "📚", tono: "bg-teal-50 text-teal-700" },
  { value: "zona",     label: "Zona",     icono: "📍", tono: "bg-rose-50 text-rose-700" },
  { value: "otro",     label: "Otro",     icono: "•",  tono: "bg-slate-100 text-slate-600" },
];
const tipoInfo = (t: string | null | undefined) =>
  TIPOS.find((x) => x.value === t) ?? TIPOS[TIPOS.length - 1];

export default function UbicacionesPage() {
  const { isAdmin } = useIsAdmin();
  const [items, setItems] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Modal alta
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<string>("deposito");
  const [parentId, setParentId] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/ubicaciones?todas=1", { credentials: "include" });
      const j = await r.json();
      if (r.ok && j?.success) setItems(j.data.ubicaciones as Ubicacion[]);
      else setError(j?.error ?? "No se pudo cargar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) => {
      const parent = items.find((i) => i.id === u.parent_id)?.nombre ?? "";
      return [u.nombre, u.codigo, tipoInfo(u.tipo).label, parent].filter(Boolean)
        .join(" ").toLowerCase().includes(q);
    });
  }, [items, busqueda]);

  function abrirAlta() {
    setError(null);
    setNombre("");
    setCodigo("");
    setTipo("deposito");
    setParentId("");
    setAbierto(true);
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/ubicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          codigo: codigo.trim() || null,
          tipo,
          parent_id: parentId || null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear.");
      } else {
        setAbierto(false);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActivo(u: Ubicacion) {
    const r = await fetch(`/api/inventario/ubicaciones/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo: !u.activo }),
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/inventario" className="text-sm text-sky-600 hover:underline">
            ← Volver a inventario
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-800">Depósitos y ubicaciones</h1>
          <p className="text-gray-600">
            Donde se almacena físicamente cada producto: depósitos, salones, pasillos, góndolas, estantes, zonas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportExcelButton url="/api/inventario/ubicaciones/export" />
          <ImportExcelButton
            entidad="Ubicaciones"
            previewUrl="/api/inventario/ubicaciones/import/preview"
            commitUrl="/api/inventario/ubicaciones/import/commit"
            templateUrl="/api/inventario/ubicaciones/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={load}
          />
          <button
            type="button"
            onClick={abrirAlta}
            className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0284C7]"
          >
            + Nueva ubicación
          </button>
        </div>
      </div>

      {error && !abierto && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Buscar por nombre, código, tipo o ubicación padre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none"
          />
          <span className="text-sm text-slate-400">
            {filtradas.length} de {items.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-600">
                <th className="py-3 pr-4 font-semibold">Ubicación</th>
                <th className="py-3 pr-4 font-semibold">Código</th>
                <th className="py-3 pr-4 font-semibold">Tipo</th>
                <th className="py-3 pr-4 font-semibold">Dentro de</th>
                <th className="py-3 pr-4 font-semibold">Estado</th>
                <th className="py-3 font-semibold w-24" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400">Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {items.length === 0 ? "Todavía no cargaste ubicaciones." : "Sin resultados."}
                  </td>
                </tr>
              ) : (
                filtradas.map((u) => {
                  const parent = items.find((i) => i.id === u.parent_id);
                  const info = tipoInfo(u.tipo);
                  return (
                    <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                      <td className="py-3 pr-4">
                        <span className="font-medium text-slate-800">{u.nombre}</span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-600">
                        {u.codigo ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${info.tono}`}>
                          <span aria-hidden>{info.icono}</span> {info.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {parent ? parent.nombre : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => toggleActivo(u)}
                          title={u.activo ? "Desactivar" : "Activar"}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            u.activo
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {u.activo ? "Activa" : "Inactiva"}
                        </button>
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => toggleActivo(u)}
                          className="text-sm font-medium text-sky-600 hover:underline"
                        >
                          {u.activo ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => !creating && setAbierto(false)}
        >
          <form
            onSubmit={handleCrear}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Nueva ubicación</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Podés armar jerarquías (un estante <em>dentro de</em> un depósito).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={creating}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Nombre *</label>
                <input
                  className={inputClass}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Depósito central"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Código</label>
                <input
                  className={`${inputClass} uppercase`}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="DEP-01"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
              <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.icono}  {t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Dentro de <span className="text-slate-400">(opcional)</span>
              </label>
              <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— ninguna —</option>
                {items.filter((i) => i.activo).map((i) => (
                  <option key={i.id} value={i.id}>{i.nombre} · {tipoInfo(i.tipo).label}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={creating}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !nombre.trim()}
                className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white hover:bg-[#0284C7] disabled:opacity-40"
              >
                {creating ? "Creando…" : "Crear ubicación"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
