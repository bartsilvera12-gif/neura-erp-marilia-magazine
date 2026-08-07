"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getEntidadesBancarias,
  createEntidadBancaria,
  updateEntidadBancaria,
  type EntidadBancaria,
  type TipoEntidad,
} from "@/lib/entidades/storage";

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

const TIPOS: { value: TipoEntidad; label: string; icono: string; tono: string }[] = [
  { value: "caja", label: "Caja", icono: "💵", tono: "bg-emerald-50 text-emerald-700" },
  { value: "banco", label: "Banco", icono: "🏦", tono: "bg-sky-50 text-sky-700" },
  { value: "tarjeta", label: "Tarjeta / POS", icono: "💳", tono: "bg-violet-50 text-violet-700" },
  { value: "billetera", label: "Billetera", icono: "📱", tono: "bg-amber-50 text-amber-700" },
  { value: "otro", label: "Otro", icono: "•", tono: "bg-slate-100 text-slate-600" },
];
const tipoInfo = (t: string | null) => TIPOS.find((x) => x.value === t) ?? TIPOS[TIPOS.length - 1];

export default function EntidadesBancariasPage() {
  const [lista, setLista] = useState<EntidadBancaria[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  // Modal alta
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoEntidad>("banco");
  const [creando, setCreando] = useState(false);

  // Edición inline
  const [editId, setEditId] = useState<string | null>(null);
  const [eCodigo, setECodigo] = useState("");
  const [eNombre, setENombre] = useState("");
  const [eTipo, setETipo] = useState<TipoEntidad>("banco");

  async function reload() {
    setCargando(true);
    setLista(await getEntidadesBancarias({ todas: true }));
    setCargando(false);
  }
  useEffect(() => { reload(); }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((en) =>
      [en.codigo, en.nombre, tipoInfo(en.tipo).label].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [lista, busqueda]);

  function abrirAlta() {
    setError(null);
    setCodigo("");
    setNombre("");
    setTipo("banco");
    setAbierto(true);
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return;
    setCreando(true);
    const res = await createEntidadBancaria({
      codigo: codigo.trim() || null,
      nombre: nombre.trim(),
      tipo,
      activo: true,
      orden: lista.length,
    });
    setCreando(false);
    if (!res.ok) { setError(res.error); return; }
    setAbierto(false);
    await reload();
  }

  function startEdit(en: EntidadBancaria) {
    setEditId(en.id);
    setECodigo(en.codigo ?? "");
    setENombre(en.nombre);
    setETipo((en.tipo as TipoEntidad) ?? "otro");
    setError(null);
  }
  async function saveEdit() {
    if (!editId) return;
    const res = await updateEntidadBancaria(editId, {
      codigo: eCodigo.trim() || null,
      nombre: eNombre.trim(),
      tipo: eTipo,
    });
    if (!res.ok) { setError(res.error); return; }
    setEditId(null);
    await reload();
  }
  async function toggleActivo(en: EntidadBancaria) {
    const res = await updateEntidadBancaria(en.id, { activo: !en.activo });
    if (!res.ok) setError(res.error); else await reload();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/configuracion" className="text-sm text-sky-600 hover:underline">
            ← Configuración
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-800">Entidades bancarias</h1>
          <p className="text-gray-600">
            Cajas, bancos, tarjetas/POS y billeteras usados al cobrar una venta. El código corto agiliza la búsqueda del cajero.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={abrirAlta}
            className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0284C7]"
          >
            + Nueva entidad
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
            placeholder="Buscar por nombre, código o tipo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none"
          />
          <span className="text-sm text-slate-400">
            {filtradas.length} de {lista.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-600">
                <th className="py-3 pr-4 font-semibold">Código</th>
                <th className="py-3 pr-4 font-semibold">Nombre</th>
                <th className="py-3 pr-4 font-semibold">Tipo</th>
                <th className="py-3 pr-4 font-semibold">Estado</th>
                <th className="py-3 font-semibold w-24" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400">Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {lista.length === 0 ? "Todavía no cargaste entidades." : "Sin resultados."}
                  </td>
                </tr>
              ) : (
                filtradas.map((en) => {
                  const info = tipoInfo(en.tipo);
                  return (
                    <tr key={en.id} className="border-b border-slate-50 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-600">
                        {editId === en.id ? (
                          <input className={`${inputClass} uppercase`} value={eCodigo} onChange={(e) => setECodigo(e.target.value)} maxLength={20} />
                        ) : (en.codigo || <span className="text-slate-300">—</span>)}
                      </td>
                      <td className="py-3 pr-4">
                        {editId === en.id ? (
                          <input className={inputClass} value={eNombre} onChange={(e) => setENombre(e.target.value)} />
                        ) : (<span className="font-medium text-slate-800">{en.nombre}</span>)}
                      </td>
                      <td className="py-3 pr-4">
                        {editId === en.id ? (
                          <select className={inputClass} value={eTipo} onChange={(e) => setETipo(e.target.value as TipoEntidad)}>
                            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${info.tono}`}>
                            <span aria-hidden>{info.icono}</span> {info.label}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => toggleActivo(en)}
                          title={en.activo ? "Desactivar" : "Activar"}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            en.activo
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {en.activo ? "Activa" : "Inactiva"}
                        </button>
                      </td>
                      <td className="py-3">
                        {editId === en.id ? (
                          <div className="flex gap-3">
                            <button type="button" onClick={() => void saveEdit()} className="text-sm font-medium text-sky-600 hover:underline">Guardar</button>
                            <button type="button" onClick={() => setEditId(null)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => startEdit(en)} className="text-sm font-medium text-sky-600 hover:underline">Editar</button>
                        )}
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
          onClick={() => !creando && setAbierto(false)}
        >
          <form
            onSubmit={handleCrear}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Nueva entidad</h2>
                <p className="mt-0.5 text-xs text-slate-500">La usás al elegir el método de cobro en una venta.</p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={creando}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Código</label>
                <input className={`${inputClass} uppercase`} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="BASA" maxLength={20} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Nombre *</label>
                <input className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Banco Basa" required autoFocus />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
              <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntidad)}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.icono}  {t.label}</option>)}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={creando}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creando || !nombre.trim()}
                className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white hover:bg-[#0284C7] disabled:opacity-40"
              >
                {creando ? "Creando…" : "Crear entidad"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
