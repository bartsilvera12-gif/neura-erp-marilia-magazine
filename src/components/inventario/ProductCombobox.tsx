"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Producto } from "@/lib/inventario/types";

function prodLabel(p: Producto): string {
  const parts = [p.nombre];
  if (p.color_nombre) parts.push(p.color_nombre);
  if (p.talla_nombre) parts.push(p.talla_nombre);
  return `${parts.join(" · ")} — ${p.sku} (stock ${p.stock_actual})`;
}

interface Props {
  productos: Producto[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  inputClassName?: string;
  /** Ruta para crear un producto nuevo (se abre en otra pestaña). */
  crearHref?: string;
}

/**
 * Selector de producto buscable (typeahead). Abre hacia abajo, muestra ~5 ítems
 * con scroll, filtra por nombre/SKU/color/talla y permite crear un producto nuevo.
 */
export default function ProductCombobox({
  productos,
  value,
  onChange,
  disabled,
  inputClassName,
  crearHref = "/inventario/nuevo",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = productos.find((p) => p.id === value) || null;
  const display = open ? query : selected ? prodLabel(selected) : "";

  const filtered = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const base = q === ""
      ? productos
      : productos.filter((p) => {
          const hay = `${p.nombre} ${p.sku} ${p.color_nombre ?? ""} ${p.talla_nombre ?? ""}`.toLowerCase();
          return hay.includes(q);
        });
    return base.slice(0, 50);
  }, [open, query, productos]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(p: Producto) {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        disabled={disabled}
        className={inputClassName}
        placeholder="Buscá por nombre, SKU, color o talla…"
        value={display}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => { setQuery(""); setOpen(true); setHighlight(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { if (open && filtered[highlight]) { e.preventDefault(); choose(filtered[highlight]); } }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        autoComplete="off"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500">
              {productos.length === 0 ? "No hay productos en el inventario." : "Sin coincidencias."}
              <Link href={crearHref} target="_blank" className="mt-2 block font-medium text-[#4FAEB2] hover:underline">
                + Cargar nuevo producto
              </Link>
            </div>
          ) : (
            <>
              {filtered.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`block w-full px-3 py-2 text-left text-sm ${i === highlight ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"} ${p.id === value ? "font-semibold text-gray-900" : "text-gray-700"}`}
                >
                  {prodLabel(p)}
                </button>
              ))}
              <Link href={crearHref} target="_blank" className="block border-t border-slate-100 px-3 py-2 text-sm font-medium text-[#4FAEB2] hover:bg-slate-50">
                + Cargar nuevo producto
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
