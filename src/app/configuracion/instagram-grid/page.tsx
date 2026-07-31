"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Post {
  id: string;
  imagen_url: string;
  link: string | null;
  orden: number;
  activo: boolean;
}

export default function InstagramGridPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgUrl, setImgUrl] = useState("");
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    const r = await fetch("/api/sitio-admin/instagram", { credentials: "include" });
    const j = await r.json();
    setPosts(((j?.data?.posts ?? []) as Post[]).slice().sort((a, b) => a.orden - b.orden));
    setLoading(false);
  }
  useEffect(() => { cargar(); }, []);

  async function subirFoto(file: File | null) {
    if (!file) return;
    setErr(null);
    setPreview(URL.createObjectURL(file));
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/sitio-admin/instagram/imagen", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "No se pudo subir la imagen.");
      setImgUrl(j.data.imagen_url as string);
    } catch (e) {
      setPreview(null);
      setErr(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  function limpiarFormulario() {
    setImgUrl(""); setLink(""); setPreview(null); setErr(null);
  }

  async function crear() {
    if (!imgUrl.trim() || guardando) return;
    setGuardando(true);
    setErr(null);
    try {
      const r = await fetch("/api/sitio-admin/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imagen_url: imgUrl.trim(), link: link.trim() || null, orden: posts.length }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "No se pudo agregar la foto.");
      limpiarFormulario();
      cargar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo agregar la foto.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta foto de la grilla?")) return;
    await fetch(`/api/sitio-admin/instagram/${id}`, { method: "DELETE", credentials: "include" });
    cargar();
  }

  async function toggleActivo(post: Post) {
    await fetch(`/api/sitio-admin/instagram/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo: !post.activo }),
    });
    cargar();
  }

  /**
   * Reordena moviendo una foto un lugar y reescribe `orden` de las dos que se
   * cruzaron. Optimista en pantalla: la grilla se reacomoda al instante.
   */
  async function mover(idx: number, delta: number) {
    const destino = idx + delta;
    if (destino < 0 || destino >= posts.length) return;
    const copia = posts.slice();
    const [fila] = copia.splice(idx, 1);
    copia.splice(destino, 0, fila);
    setPosts(copia.map((p, i) => ({ ...p, orden: i })));
    await Promise.all(
      copia.map((p, i) =>
        p.orden === i
          ? null
          : fetch(`/api/sitio-admin/instagram/${p.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ orden: i }),
            })
      )
    );
    cargar();
  }

  const fotoVisible = preview ?? (imgUrl.trim() || null);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Instagram grid</h1>
        <p className="text-sm text-slate-500 mt-1">
          Fotos que aparecen en la sección &quot;@marilia.magazine&quot; del sitio.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Agregar nueva foto</div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="h-28 w-28 shrink-0 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            {fotoVisible ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoVisible} alt="Vista previa" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-slate-400">Sin foto</span>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="inline-block">
                <span className="inline-block bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm px-4 py-2 rounded-lg cursor-pointer transition-colors">
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
              <span className="ml-3 text-xs text-slate-400">JPG, PNG o WebP — máx. 10 MB.</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Link al post (opcional)</label>
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://instagram.com/p/…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1">A dónde lleva el click en la foto.</p>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">…o pegá la URL de una imagen</label>
                <input
                  value={imgUrl}
                  onChange={(e) => { setImgUrl(e.target.value); setPreview(null); }}
                  placeholder="https://…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Se completa sola al subir un archivo.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={crear}
                disabled={!imgUrl.trim() || subiendo || guardando}
                className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Agregando…" : "Agregar a la grilla"}
              </button>
              {fotoVisible && (
                <button onClick={limpiarFormulario} className="text-xs text-slate-500 hover:text-slate-800 underline">
                  Descartar
                </button>
              )}
            </div>
          </div>
        </div>
        {err && (
          <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}
      </div>

      {loading ? (
        <div className="text-slate-400">Cargando…</div>
      ) : posts.length === 0 ? (
        <div className="text-slate-400 border border-dashed border-slate-300 rounded-lg p-12 text-center">
          Aún no hay fotos. Agregá la primera arriba.
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">
            El sitio las muestra en este orden. Usá ← → para reacomodarlas.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {posts.map((post, idx) => (
              <div
                key={post.id}
                className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${!post.activo ? "opacity-40" : ""}`}
              >
                <div className="aspect-square bg-slate-100 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imagen_url} alt="Foto de la grilla" className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 text-[11px] bg-slate-900/70 text-white px-1.5 py-0.5 rounded tabular-nums">
                    {idx + 1}
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  {post.link && (
                    <a href={post.link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block truncate">
                      {post.link}
                    </a>
                  )}
                  <div className="flex items-center justify-between gap-1">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={post.activo} onChange={() => toggleActivo(post)} className="accent-[#4FAEB2]" />
                      Visible
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => mover(idx, -1)}
                        disabled={idx === 0}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs px-1"
                        aria-label="Mover antes"
                      >
                        ←
                      </button>
                      <button
                        onClick={() => mover(idx, 1)}
                        disabled={idx === posts.length - 1}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xs px-1"
                        aria-label="Mover después"
                      >
                        →
                      </button>
                      <button onClick={() => eliminar(post.id)} className="text-xs text-red-600 hover:underline ml-1">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-8 text-xs text-slate-400">
        <Link href="/configuracion" className="underline">← Volver a configuración</Link>
      </div>
    </div>
  );
}
