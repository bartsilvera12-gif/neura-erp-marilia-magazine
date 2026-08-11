"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  PackageX,
  WalletCards,
} from "lucide-react";

type EstadoInventario = "sin_stock" | "stock_bajo" | "normal";

interface ProductoReporte {
  id: string;
  nombre: string;
  sku: string;
  codigo_proveedor: string | null;
  color_nombre: string | null;
  talla_nombre: string | null;
  categoria_nombre: string | null;
  ubicacion_nombre: string | null;
  unidad_medida: string;
  costo_promedio: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  valor_costo: number;
  valor_venta: number;
  margen_porcentaje: number;
  estado: EstadoInventario;
  fecha_carga: string;
}

interface ReporteData {
  totales: {
    productos: number;
    unidades: number;
    sin_stock: number;
    stock_bajo: number;
    valor_costo: number;
    valor_venta: number;
  };
  categorias: { id: string; nombre: string }[];
  page: number;
  pageSize: number;
  total: number;
  productos: ProductoReporte[];
}

const PAGE_SIZES = [25, 50, 100, 200];
const ESTADO_LABEL: Record<EstadoInventario, string> = {
  sin_stock: "Sin stock",
  stock_bajo: "Stock bajo",
  normal: "Normal",
};
const ESTADO_BADGE: Record<EstadoInventario, string> = {
  sin_stock: "bg-red-100 text-red-700",
  stock_bajo: "bg-amber-100 text-amber-700",
  normal: "bg-emerald-100 text-emerald-700",
};

function fmtNum(value: number, maxDecimals = 0) {
  return value.toLocaleString("es-PY", { maximumFractionDigits: maxDecimals });
}

function fmtGs(value: number) {
  return `Gs. ${Math.round(value).toLocaleString("es-PY")}`;
}

function fmtFecha(value: string) {
  return new Date(value).toLocaleDateString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ReporteInventarioPage() {
  const [data, setData] = useState<ReporteData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState<EstadoInventario | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setQ(qDraft.trim());
      setPage(1);
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [qDraft]);

  useEffect(() => { setPage(1); }, [categoria, estado, pageSize]);

  const query = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) sp.set("q", q);
    if (categoria) sp.set("categoria", categoria);
    if (estado) sp.set("estado", estado);
    return sp.toString();
  }, [q, categoria, estado, page, pageSize]);

  const exportUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (categoria) sp.set("categoria", categoria);
    if (estado) sp.set("estado", estado);
    const suffix = sp.toString();
    return `/api/reportes/inventario/export${suffix ? `?${suffix}` : ""}`;
  }, [q, categoria, estado]);

  useEffect(() => {
    let cancelled = false;
    setCargando(true);
    setError("");
    fetch(`/api/reportes/inventario?${query}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) throw new Error(json?.error || "No se pudo cargar el reporte.");
        return json.data as ReporteData;
      })
      .then((next) => { if (!cancelled) setData(next); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el reporte."); })
      .finally(() => { if (!cancelled) setCargando(false); });
    return () => { cancelled = true; };
  }, [query]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const t = data?.totales;

  const cards = t ? [
    { label: "Productos", value: fmtNum(t.productos), hint: `${fmtNum(t.unidades, 2)} unidades`, icon: Boxes, tone: "text-[#3F8E91] bg-[#4FAEB2]/12" },
    { label: "Sin stock", value: fmtNum(t.sin_stock), hint: "requieren reposición", icon: PackageX, tone: "text-red-700 bg-red-100" },
    { label: "Stock bajo", value: fmtNum(t.stock_bajo), hint: "en mínimo o menos", icon: AlertTriangle, tone: "text-amber-700 bg-amber-100" },
    { label: "Valor al costo", value: fmtGs(t.valor_costo), hint: "stock disponible", icon: WalletCards, tone: "text-sky-700 bg-sky-100" },
    { label: "Venta potencial", value: fmtGs(t.valor_venta), hint: "a precio vigente", icon: CircleDollarSign, tone: "text-emerald-700 bg-emerald-100" },
  ] : [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Zentra · Reportes"
        title="Reporte de inventario"
        description="Existencias cargadas, alertas de stock y valorización actual del inventario."
        backHref="/reportes"
        backLabel="Reportes"
        actions={<ExportExcelButton url={exportUrl} label="Exportar a Excel" />}
      />

      {error && !data ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      ) : !data && cargando ? (
        <p className="animate-pulse text-slate-500">Cargando reporte…</p>
      ) : data && t ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            {cards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
                    <p className="mt-1 truncate text-2xl font-bold tabular-nums text-slate-900" title={card.value}>{card.value}</p>
                  </div>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                    <card.icon className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{card.hint}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-[#4FAEB2]/30 bg-white p-5 shadow-sm ring-1 ring-[#4FAEB2]/10">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder="Buscar producto, SKU o código…"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]/30 sm:min-w-72"
              />
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
              >
                <option value="">Todas las categorías</option>
                {data.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoInventario | "")}
                className="min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
              >
                <option value="">Todos los estados</option>
                <option value="sin_stock">Sin stock</option>
                <option value="stock_bajo">Stock bajo</option>
                <option value="normal">Normal</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / pág.</option>)}
              </select>
              <span className="ml-auto text-sm tabular-nums text-slate-400">
                {cargando ? "Actualizando…" : `${from}–${to} de ${fmtNum(total)}`}
              </span>
            </div>

            {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1250px] text-sm">
                <thead className="border-b-2 border-[#4FAEB2]/40 bg-[#E5F4F4]">
                  <tr>
                    {[
                      ["Fecha carga", "left"], ["Producto", "left"], ["Código", "left"], ["Categoría", "left"],
                      ["Variante", "left"], ["Stock", "right"], ["Mínimo", "right"], ["Estado", "center"],
                      ["Costo prom.", "right"], ["Precio venta", "right"], ["Valor costo", "right"], ["Venta potencial", "right"], ["Margen", "right"],
                    ].map(([label, align]) => (
                      <th key={label} className={`px-3 py-3 text-xs font-bold uppercase tracking-wide text-[#3F8E91] ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.productos.length === 0 ? (
                    <tr><td colSpan={13} className="py-10 text-center text-sm text-slate-400">No hay productos para los filtros seleccionados.</td></tr>
                  ) : data.productos.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-[#4FAEB2]/5">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{fmtFecha(p.fecha_carga)}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-slate-900">{p.nombre}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{p.codigo_proveedor || p.sku}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{p.categoria_nombre ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{[p.color_nombre, p.talla_nombre].filter(Boolean).join(" · ") || "—"}</td>
                      <td className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${p.estado === "sin_stock" ? "text-red-600" : p.estado === "stock_bajo" ? "text-amber-600" : "text-slate-900"}`}>{fmtNum(p.stock_actual, 2)} {p.unidad_medida}</td>
                      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-500">{fmtNum(p.stock_minimo, 2)}</td>
                      <td className="px-3 py-2.5 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[p.estado]}`}>{ESTADO_LABEL[p.estado]}</span></td>
                      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{fmtGs(p.costo_promedio)}</td>
                      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{fmtGs(p.precio_venta)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-800">{fmtGs(p.valor_costo)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-emerald-700">{fmtGs(p.valor_venta)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-700">{fmtNum(p.margen_porcentaje, 2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-slate-500">Página {safePage} de {totalPages}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(1)} disabled={safePage <= 1} aria-label="Primera página" className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><ChevronsLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={safePage <= 1} aria-label="Página anterior" className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPage((n) => Math.min(totalPages, n + 1))} disabled={safePage >= totalPages} aria-label="Página siguiente" className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} aria-label="Última página" className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><ChevronsRight className="h-4 w-4" /></button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">No se pudo cargar el reporte.</div>
      )}
    </div>
  );
}
