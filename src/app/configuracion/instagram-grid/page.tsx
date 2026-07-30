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

  async function cargar() {
    setLoading(true);
    const r = await fetch("/api/sitio-admin/instagram", { credentials: "include" });
    const j = await r.json();
    setPosts(j?.data?.posts ?? []);
    setLoading(false);
  }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!imgUrl.trim()) return;
    await fetch("/api/sitio-admin/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ imagen_url: imgUrl.trim(), link: link.trim() || null, orden: posts.length }),
    });
    setImgUrl(""); setLink("");
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este post?")) return;
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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Instagram grid</h1>
        <p className="text-sm text-slate-500 mt-1">Fotos que aparecen en la sección &quot;@marilia.magazine&quot; del sitio.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Agregar nuevo post</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="URL de la imagen" className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-1" />
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link a Instagram (opcional)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-1" />
          <button onClick={crear} disabled={!imgUrl.trim()} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">Agregar</button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400">Cargando…</div>
      ) : posts.length === 0 ? (
        <div className="text-slate-400 border border-dashed border-slate-300 rounded-lg p-12 text-center">
          Aún no hay posts. Agregá el primero arriba.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {posts.map((post) => (
            <div key={post.id} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${!post.activo ? "opacity-40" : ""}`}>
              <div className="aspect-square bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.imagen_url} alt="Post Instagram" className="w-full h-full object-cover" />
              </div>
              <div className="p-3 space-y-2">
                {post.link && <a href={post.link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block truncate">{post.link}</a>}
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={post.activo} onChange={() => toggleActivo(post)} /> Visible
                  </label>
                  <button onClick={() => eliminar(post.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                </div>
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
