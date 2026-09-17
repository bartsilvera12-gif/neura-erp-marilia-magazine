"use client";

/**
 * Configuración → Video de presentación.
 *
 * Deja que la clienta cargue, reemplace y quite el video que presenta la
 * tienda en la portada del sitio. Opcionalmente una imagen "poster" que se ve
 * al instante mientras el video carga (velocidad percibida).
 *
 * El video se guarda en Supabase Storage y su URL en la tabla `sitio_video`.
 * El sitio lo lee en runtime desde /api/sitio/video.
 */

import { useEffect, useRef, useState } from "react";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface VideoState {
  video_url: string | null;
  poster_url: string | null;
  updated_at?: string | null;
}

const MAX_VIDEO_MB = 80;
const MAX_POSTER_MB = 5;

export default function VideoPresentacionPage() {
  const [estado, setEstado] = useState<VideoState | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState<null | "video" | "poster">(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<null | "video" | "poster">(null);
  const [quitando, setQuitando] = useState(false);

  const videoInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch("/api/sitio-admin/video", { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (r.ok && j?.success) setEstado(j.data?.video ?? { video_url: null, poster_url: null });
      else setError(j?.error ?? "No se pudo cargar el video.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function subir(tipo: "video" | "poster", file: File) {
    setError(null);
    setOk(null);
    const maxMb = tipo === "video" ? MAX_VIDEO_MB : MAX_POSTER_MB;
    if (file.size > maxMb * 1024 * 1024) {
      setError(`El ${tipo} supera el máximo de ${maxMb} MB.`);
      return;
    }
    setSubiendo(tipo);
    try {
      const fd = new FormData();
      fd.append(tipo, file);
      const r = await fetch("/api/sitio-admin/video", {
        method: "POST", body: fd, credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? `No se pudo subir el ${tipo}.`);
        return;
      }
      setEstado(j.data?.video ?? null);
      setOk(tipo === "video" ? "Video actualizado. Ya se ve en la portada del sitio." : "Poster actualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSubiendo(null);
      if (videoInput.current) videoInput.current.value = "";
      if (posterInput.current) posterInput.current.value = "";
    }
  }

  async function quitar(tipo: "video" | "poster") {
    setQuitando(true);
    setError(null);
    setOk(null);
    try {
      const url = tipo === "poster" ? "/api/sitio-admin/video?poster=1" : "/api/sitio-admin/video";
      const r = await fetch(url, { method: "DELETE", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? `No se pudo quitar el ${tipo}.`);
        return;
      }
      setEstado(j.data?.video ?? { video_url: null, poster_url: null });
      setOk(tipo === "video" ? "Video quitado de la portada." : "Poster quitado.");
      setConfirmar(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setQuitando(false);
    }
  }

  const tieneVideo = !!estado?.video_url;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Video de presentación</h1>
        <p className="text-sm text-slate-500 mt-1">
          Se muestra en la portada, arriba de la sección de categorías. Se reproduce solo, en <strong>silencio</strong>,
          y el visitante puede activar el sonido. Funciona en computadora, iOS y Android.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}
      {ok && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{ok}</div>
      )}

      {/* Video */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Video</div>

        {cargando ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : tieneVideo ? (
          <div className="space-y-4">
            <div className="rounded-lg overflow-hidden bg-black max-w-sm mx-auto">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={estado!.video_url!}
                poster={estado?.poster_url ?? undefined}
                controls
                playsInline
                muted
                className="w-full h-auto max-h-[420px]"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => videoInput.current?.click()}
                disabled={subiendo !== null}
                className="rounded-lg bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm px-4 py-2 disabled:opacity-50"
              >
                {subiendo === "video" ? "Subiendo…" : "Reemplazar video"}
              </button>
              <button
                onClick={() => setConfirmar("video")}
                disabled={subiendo !== null}
                className="rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm px-4 py-2 disabled:opacity-50"
              >
                Quitar video
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500 mb-4">Todavía no hay video cargado.</p>
            <button
              onClick={() => videoInput.current?.click()}
              disabled={subiendo !== null}
              className="rounded-lg bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm px-5 py-2.5 disabled:opacity-50"
            >
              {subiendo === "video" ? "Subiendo…" : "Subir video"}
            </button>
          </div>
        )}

        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subir("video", f); }}
        />
        <p className="mt-4 text-[11px] text-slate-400 text-center">
          MP4, WebM o MOV · máx. {MAX_VIDEO_MB} MB. Para máxima compatibilidad entre iPhone y Android,
          recomendamos MP4 con video H.264 y audio AAC. Un MOV grabado en HEVC puede no reproducirse en todos los Android.
          {subiendo === "video" && " Subir un video pesado puede tardar unos segundos, no cierres la página."}
        </p>
      </div>

      {/* Poster (opcional) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-xs uppercase tracking-wide text-slate-500">Imagen de portada del video (opcional)</span>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Se muestra al instante mientras el video carga, así la página no se ve vacía. Si no cargás una,
          el navegador usa el primer cuadro del video.
        </p>

        <div className="flex items-center gap-4">
          <div className="h-24 w-24 shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
            {estado?.poster_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={estado.poster_url} alt="Poster del video" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px] text-slate-400">Sin imagen</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => posterInput.current?.click()}
              disabled={subiendo !== null || !tieneVideo}
              className="rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm px-4 py-2 disabled:opacity-50"
              title={!tieneVideo ? "Primero subí un video" : undefined}
            >
              {subiendo === "poster" ? "Subiendo…" : estado?.poster_url ? "Reemplazar imagen" : "Subir imagen"}
            </button>
            {estado?.poster_url && (
              <button
                onClick={() => setConfirmar("poster")}
                disabled={subiendo !== null}
                className="rounded-lg text-red-600 hover:bg-red-50 text-sm px-4 py-2 disabled:opacity-50"
              >
                Quitar
              </button>
            )}
          </div>
        </div>

        <input
          ref={posterInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subir("poster", f); }}
        />
        <p className="mt-4 text-[11px] text-slate-400">JPG, PNG o WebP · máx. {MAX_POSTER_MB} MB.</p>
      </div>

      <ConfirmModal
        open={confirmar !== null}
        title={confirmar === "poster" ? "Quitar imagen" : "Quitar video"}
        tone="danger"
        confirmLabel="Quitar"
        loading={quitando}
        onCancel={() => { if (!quitando) setConfirmar(null); }}
        onConfirm={() => { if (confirmar) quitar(confirmar); }}
        message={
          confirmar === "poster" ? (
            <>Se quita la imagen de portada del video. El video sigue en el sitio.</>
          ) : (
            <>El video deja de mostrarse en la portada del sitio. Podés volver a subir otro cuando quieras.</>
          )
        }
      />
    </div>
  );
}
