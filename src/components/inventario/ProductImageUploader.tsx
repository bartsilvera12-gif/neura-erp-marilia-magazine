"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cada producto tiene hasta 3 fotos: principal + 2 adicionales. El uploader
 * muestra los tres slots en fila y sube al que corresponde vía `?slot=N`.
 */
interface SlotInicial {
  path: string | null;
  url: string | null;
}

interface Props {
  productoId: string;
  /** Slot 1 (principal): compatibilidad con el uso anterior. */
  initialUrl?: string | null;
  initialPath?: string | null;
  initialUrl2?: string | null;
  initialPath2?: string | null;
  initialUrl3?: string | null;
  initialPath3?: string | null;
  onChange?: (slot: 1 | 2 | 3, info: { imagen_path: string | null; imagen_url: string | null }) => void;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const ROTULOS: Record<1 | 2 | 3, string> = { 1: "Principal", 2: "Adicional", 3: "Adicional" };

function SlotUploader(props: {
  productoId: string;
  slot: 1 | 2 | 3;
  inicial: SlotInicial;
  onChange?: (slot: 1 | 2 | 3, info: { imagen_path: string | null; imagen_url: string | null }) => void;
}) {
  const { productoId, slot, inicial, onChange } = props;
  const [url, setUrl] = useState<string | null>(inicial.url);
  const [hasImage, setHasImage] = useState<boolean>(!!inicial.path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Con path pero sin url firmada (viene del listado sin resolver), la pido.
  useEffect(() => {
    let cancel = false;
    if (inicial.path && !inicial.url) {
      (async () => {
        try {
          const r = await fetch(`/api/productos/${productoId}/imagen?slot=${slot}`, { credentials: "include" });
          const j = await r.json();
          if (!cancel && r.ok && j?.success) {
            setUrl(j.data?.imagen_url ?? null);
            setHasImage(!!j.data?.imagen_path);
          }
        } catch { /* ignore */ }
      })();
    }
    return () => { cancel = true; };
  }, [productoId, slot, inicial.path, inicial.url]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const r = await fetch(`/api/productos/${productoId}/imagen?slot=${slot}`, {
        method: "POST", body: form, credentials: "include",
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo subir la imagen");
      } else {
        setUrl(j.data?.imagen_url ?? null);
        setHasImage(true);
        onChange?.(slot, { imagen_path: j.data?.imagen_path ?? null, imagen_url: j.data?.imagen_url ?? null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!hasImage) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`/api/productos/${productoId}/imagen?slot=${slot}`, {
        method: "DELETE", credentials: "include",
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo quitar la imagen");
      } else {
        setUrl(null);
        setHasImage(false);
        onChange?.(slot, { imagen_path: null, imagen_url: null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <button
        type="button"
        onClick={() => !busy && fileRef.current?.click()}
        disabled={busy}
        className="group relative w-full aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#4FAEB2] hover:bg-slate-100 transition-colors overflow-hidden disabled:opacity-60"
        aria-label={hasImage ? `Cambiar imagen ${slot}` : `Subir imagen ${slot}`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Imagen ${slot}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="mt-1 text-[11px] font-medium tracking-wide">{ROTULOS[slot]}</span>
          </div>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-medium text-slate-600">
            Subiendo…
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-slate-500">{ROTULOS[slot]}{slot === 1 ? "" : ` ${slot - 1}`}</span>
        {hasImage && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="text-red-600 hover:underline disabled:opacity-50"
          >
            Quitar
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFile} />
      {error && <p className="text-[11px] text-red-600 text-center">{error}</p>}
    </div>
  );
}

export default function ProductImageUploader(props: Props) {
  const slots: Array<{ slot: 1 | 2 | 3; inicial: SlotInicial }> = [
    { slot: 1, inicial: { path: props.initialPath ?? null,  url: props.initialUrl ?? null } },
    { slot: 2, inicial: { path: props.initialPath2 ?? null, url: props.initialUrl2 ?? null } },
    { slot: 3, inicial: { path: props.initialPath3 ?? null, url: props.initialUrl3 ?? null } },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3 max-w-md">
        {slots.map((s) => (
          <SlotUploader
            key={s.slot}
            productoId={props.productoId}
            slot={s.slot}
            inicial={s.inicial}
            onChange={props.onChange}
          />
        ))}
      </div>
      <p className="text-xs text-slate-400">
        JPG, PNG o WebP — máx. 5 MB por foto. La principal es la que muestra el sitio en el catálogo.
      </p>
    </div>
  );
}
