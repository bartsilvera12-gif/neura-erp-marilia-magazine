"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Marca {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  logo_url: string | null;
  match_tokens: string[];
  coincide_con_todo: boolean;
  activo: boolean;
  orden: number;
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

interface FormMarca {
  nombre: string;
  descripcion: string;
  match_tokens: string;
  coincide_con_todo: boolean;
  activo: boolean;
}

function toForm(m: Marca): FormMarca {
  return {
    nombre: m.nombre,
    descripcion: m.descripcion ?? "",
    match_tokens: (m.match_tokens ?? []).join(", "),
    coincide_con_todo: m.coincide_con_todo,
    activo: m.activo,
  };
}

const FORM_VACIO: FormMarca = {
  nombre: "", descripcion: "", match_tokens: "",
  coincide_con_todo: false, activo: true,
};

export default function MarcasPage() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<Marca | null>(null);
  const [form, setForm] = useState<FormMarca>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [avanzado, setAvanzado] = useState(false);

  // Logo: URL viva (para preview) y archivo pendiente si el usuario aún no guardó.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPendiente, setLogoPendiente] = useState<File | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);

  async function reload() {
    setCargando(true);
    try {
      const r = await fetch("/api/marcas?todas=1", { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (r.ok && j?.success) setMarcas((j.data?.marcas ?? []) as Marca[]);
      else setError(j?.error ?? "No se pudieron cargar las marcas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { reload(); }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return marcas;
    return marcas.filter((m) =>
      [m.nombre, m.slug, m.descripcion, (m.match_tokens ?? []).join(" ")]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [marcas, busqueda]);

  function abrirAlta() {
    setError(null);
    setEditando(null);
    setForm(FORM_VACIO);
    setLogoUrl(null);
    setLogoPendiente(null);
    setAvanzado(false);
    setAbierto(true);
  }
  function abrirEdicion(m: Marca) {
    setError(null);
    setEditando(m);
    setForm(toForm(m));
    setLogoUrl(m.logo_url);
    setLogoPendiente(null);
    setAvanzado(false);
    setAbierto(true);
  }

  const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

  async function subirLogoInmediato(marcaId: string, file: File): Promise<boolean> {
    setSubiendoLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/marcas/${marcaId}/logo`, {
        method: "POST", body: fd, credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo subir el logo.");
        return false;
      }
      setLogoUrl(j.data?.logo_url ?? null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red al subir el logo.");
      return false;
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function elegirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { setError("Formato no permitido. Usá PNG, JPG, WebP o SVG."); e.target.value = ""; return; }
    if (f.size > 2 * 1024 * 1024) { setError("El logo pesa más de 2 MB."); e.target.value = ""; return; }
    e.target.value = "";

    // En edición sube al toque para que el usuario vea el resultado firme.
    // En alta se guarda en memoria y se sube después de crear la marca.
    if (editando) {
      await subirLogoInmediato(editando.id, f);
    } else {
      setLogoPendiente(f);
      setLogoUrl(URL.createObjectURL(f));
    }
  }

  async function quitarLogo() {
    if (!window.confirm("¿Quitar el logo?")) return;
    if (editando) {
      setSubiendoLogo(true);
      try {
        const r = await fetch(`/api/marcas/${editando.id}/logo`, { method: "DELETE", credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.success) setLogoUrl(null);
        else setError(j?.error ?? "No se pudo quitar el logo.");
      } finally {
        setSubiendoLogo(false);
      }
    } else {
      setLogoPendiente(null);
      setLogoUrl(null);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setError(null);
    setGuardando(true);
    try {
      const tokens = form.match_tokens.split(",").map((t) => t.trim()).filter(Boolean);
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        coincide_con_todo: form.coincide_con_todo,
        match_tokens: tokens,
        activo: form.activo,
      };
      const url = editando ? `/api/marcas/${editando.id}` : "/api/marcas";
      const method = editando ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo guardar.");
        return;
      }
      // Alta con logo pendiente: subirlo ya que tenemos el nuevo id.
      const nuevaMarcaId = editando ? editando.id : (j.data?.marca?.id as string | undefined);
      if (!editando && logoPendiente && nuevaMarcaId) {
        const ok = await subirLogoInmediato(nuevaMarcaId, logoPendiente);
        if (!ok) return; // no cerrar el modal, mostrar el error del logo
      }
      setAbierto(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(m: Marca) {
    if (!window.confirm(`¿Borrar la marca "${m.nombre}"?\n\nSe saca del catálogo del sitio. Los productos no se tocan.`)) return;
    setBorrando(m.id);
    try {
      const r = await fetch(`/api/marcas/${m.id}`, { method: "DELETE", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) { alert(j?.error ?? "No se pudo borrar."); return; }
      await reload();
    } finally {
      setBorrando(null);
    }
  }

  async function toggleActivo(m: Marca) {
    const r = await fetch(`/api/marcas/${m.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !m.activo }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.success) reload();
    else alert(j?.error ?? "No se pudo actualizar.");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/configuracion" className="text-sm text-sky-600 hover:underline">
            ← Configuración
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-800">Marcas</h1>
          <p className="text-gray-600 max-w-2xl">
            Marcas del catálogo del sitio. Cada una se muestra como un chip arriba de las
            categorías; al elegirla, se filtran los productos que la contienen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={abrirAlta}
            className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0284C7]"
          >
            + Nueva marca
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
            placeholder="Buscar por nombre o palabra clave…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none"
          />
          <span className="text-sm text-slate-400">
            {filtradas.length} de {marcas.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-600">
                <th className="py-3 pr-4 font-semibold w-14">Logo</th>
                <th className="py-3 pr-4 font-semibold">Marca</th>
                <th className="py-3 pr-4 font-semibold">Cobertura</th>
                <th className="py-3 pr-4 font-semibold">Estado</th>
                <th className="py-3 font-semibold w-40" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400">Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {marcas.length === 0 ? "Todavía no cargaste marcas." : "Sin resultados."}
                  </td>
                </tr>
              ) : filtradas.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                  <td className="py-3 pr-4">
                    {m.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.logo_url} alt={m.nombre} className="h-10 w-10 rounded-md object-contain border border-slate-100 bg-white" />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-500">
                        {m.nombre.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-800">{m.nombre}</div>
                    {m.descripcion && <div className="text-xs text-slate-500">{m.descripcion}</div>}
                  </td>
                  <td className="py-3 pr-4 text-sm text-slate-600">
                    {m.coincide_con_todo ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        Todo el catálogo
                      </span>
                    ) : m.match_tokens.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {m.match_tokens.slice(0, 4).map((t) => (
                          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{t}</span>
                        ))}
                        {m.match_tokens.length > 4 && (
                          <span className="text-[11px] text-slate-400">+{m.match_tokens.length - 4}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-700">Sin palabras clave</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => toggleActivo(m)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        m.activo
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {m.activo ? "Activa" : "Inactiva"}
                    </button>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-3">
                      <button type="button" onClick={() => abrirEdicion(m)} className="text-sm font-medium text-sky-600 hover:underline">
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={borrando === m.id}
                        onClick={() => borrar(m)}
                        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-40"
                      >
                        {borrando === m.id ? "…" : "Borrar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => !guardando && setAbierto(false)}
        >
          <form
            onSubmit={guardar}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {editando ? "Editar marca" : "Nueva marca"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Aparece en el sitio como chip arriba de las categorías.</p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={guardando}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Logo + nombre en la misma fila, como una ficha. */}
            <div className="flex items-start gap-4">
              <label className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#0EA5E9] hover:bg-slate-100 transition-colors flex items-center justify-center">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="text-[10px] font-medium">Logo</span>
                  </div>
                )}
                {subiendoLogo && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-medium text-slate-600">
                    Subiendo…
                  </span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={elegirLogo}
                />
              </label>

              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">Nombre *</label>
                <input
                  className={inputClass}
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: GAP"
                  required
                  autoFocus
                />
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
                  <span>PNG, JPG, WebP o SVG · máx. 2 MB</span>
                  {logoUrl && (
                    <button type="button" onClick={quitarLogo} className="text-red-600 hover:underline">
                      Quitar logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Descripción corta</label>
              <input
                className={inputClass}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Ej: Moda urbana masculina"
              />
            </div>

            {!form.coincide_con_todo && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Palabras clave <span className="text-slate-400">(separadas por coma)</span>
                </label>
                <input
                  className={inputClass}
                  value={form.match_tokens}
                  onChange={(e) => setForm({ ...form, match_tokens: e.target.value })}
                  placeholder="Ej: GAP, GAP KIDS"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Los productos cuyo nombre contenga alguna de estas palabras se muestran bajo esta marca.
                </p>
              </div>
            )}

            {/* Opciones avanzadas: slug + "cubre todo" quedan escondidas por defecto. */}
            <button
              type="button"
              onClick={() => setAvanzado((v) => !v)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              {avanzado ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
            </button>

            {avanzado && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
                {editando && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Slug</label>
                    <div className="rounded-md bg-white border border-slate-200 px-3 py-2 font-mono text-xs text-slate-600">
                      {editando.slug}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Se genera del nombre y no cambia aunque renombres la marca.</p>
                  </div>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.coincide_con_todo}
                    onChange={(e) => setForm({ ...form, coincide_con_todo: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-800">Cubre todo el catálogo</span>
                    <span className="block text-xs text-slate-500">
                      Marcala solo si todos los productos son de esta marca. Ignora las palabras clave.
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                  Activa (visible en el sitio)
                </label>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={guardando}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando || !form.nombre.trim()}
                className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white hover:bg-[#0284C7] disabled:opacity-40"
              >
                {guardando ? "Guardando…" : editando ? "Guardar" : "Crear marca"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
