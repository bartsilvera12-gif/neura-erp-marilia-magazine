"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProductosPagina } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none";

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function calcularMargenVenta(costo: number, precio: number): number {
  if (precio === 0) return 0;
  return ((precio - costo) / precio) * 100;
}

function margenColor(margen: number): string {
  if (margen >= 40) return "text-green-600";
  if (margen >= 20) return "text-yellow-600";
  return "text-red-600";
}

interface UbicacionMin { id: string; nombre: string; tipo: string }

const POR_PAGINA = 50;

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [total, setTotal] = useState(0);
  const [ubicaciones, setUbicaciones] = useState<UbicacionMin[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cargando, setCargando] = useState(true);

  // Buscador y paginado: los resuelve el servidor. Con decenas de miles de
  // productos no se puede traer todo y filtrar en el browser — PostgREST corta
  // en 1.000 filas y el resto quedaba invisible.
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [pagina, setPagina] = useState(0);

  // Debounce del buscador para no pegarle a la API en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusquedaAplicada(busqueda.trim());
      setPagina(0);
    }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    let cancelled = false;
    setCargando(true);
    getProductosPagina({ q: busquedaAplicada, limit: POR_PAGINA, offset: pagina * POR_PAGINA })
      .then(({ productos: data, total: t }) => {
        if (cancelled) return;
        setProductos(data);
        setTotal(t);
        setCargando(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey, busquedaAplicada, pagina]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setUbicaciones((j.data?.ubicaciones ?? []) as UbicacionMin[]);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const ubicacionById = new Map(ubicaciones.map((u) => [u.id, u]));
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : pagina * POR_PAGINA + 1;
  const hasta = Math.min((pagina + 1) * POR_PAGINA, total);

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-3xl font-bold text-gray-800">Inventario</h1>
        <p className="text-gray-600">Gestión de productos y control de stock</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h2 className="text-xl font-semibold">Productos</h2>
          <Link
            href="/inventario/nuevo"
            className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            + Nuevo ítem
          </Link>
          <ExportExcelButton url="/api/inventario/productos/export" />
          <ImportExcelButton
            entidad="Productos"
            previewUrl="/api/inventario/productos/import/preview"
            commitUrl="/api/inventario/productos/import/commit"
            templateUrl="/api/inventario/productos/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={() => setRefreshKey((k) => k + 1)}
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en inventario: nombre, código, color, talla, precio, ubicación…"
            className={`${inputFilterClass} min-w-[16rem] flex-1`}
          />
          <span className="ml-auto shrink-0 text-sm text-gray-400">
            {cargando
              ? "Cargando…"
              : total === 0
                ? "Sin productos"
                : `${desde.toLocaleString("es-PY")}–${hasta.toLocaleString("es-PY")} de ${total.toLocaleString("es-PY")}`}
          </span>
        </div>


        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">

            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pl-4 pr-3 font-medium w-16">Foto</th>
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="py-3 pr-4 font-medium">Código</th>
                <th className="py-3 pr-4 font-medium">Color</th>
                <th className="py-3 pr-4 font-medium">Talla</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                <th className="py-3 pr-4 font-medium">Precio Venta</th>
                <th className="py-3 pr-4 font-medium text-center">Stock</th>
                <th className="py-3 pr-4 font-medium">Unidad</th>
                <th className="py-3 pr-4 font-medium">Ubicación</th>
                <th className="py-3 pr-8 font-medium text-right">
                  <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                </th>
                <th className="py-3 pr-3 font-medium text-center" title="Aparece marcado como destacado en el sitio">Destacado</th>
                <th className="py-3 pr-3 font-medium text-center" title="Se muestra en el sitio público">Visible web</th>
                <th className="py-3 pl-2 pr-4 font-medium text-right whitespace-nowrap">Acción</th>
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                return (
                  <tr key={p.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="py-3 pl-4 pr-3">
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt={p.nombre} className="h-12 w-12 rounded-md object-cover border border-slate-200" />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                          sin foto
                        </div>
                      )}
                    </td>
                    <td className="py-4 pr-4 font-medium text-gray-800">{p.nombre}</td>
                    <td className="py-4 pr-4 text-gray-500 font-mono">
                      {p.codigo_proveedor ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-4 pr-4 text-gray-600">{p.color_nombre ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-4 pr-4 text-gray-600">{p.talla_nombre ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>
                    <td className="py-4 pr-4 text-center">
                      <span className={`font-semibold ${stockBajo ? "text-red-600" : "text-gray-800"}`}>
                        {p.stock_actual}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-gray-600">{p.unidad_medida}</td>
                    <td className="py-4 pr-4 text-gray-600 text-xs">
                      {p.ubicacion_principal_id
                        ? (() => {
                            const u = ubicacionById.get(p.ubicacion_principal_id);
                            return u ? (
                              <span>
                                <span className="font-medium text-gray-700">{u.nombre}</span>
                                <span className="text-gray-400"> — {u.tipo}</span>
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            );
                          })()
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`py-4 pr-8 text-right tabular-nums font-semibold ${margenColor(margen)}`}>
                      {margen.toFixed(2)}%
                    </td>
                    <td className="py-4 pr-3 text-center">
                      <input
                        type="checkbox"
                        defaultChecked={p.destacado === true}
                        onChange={async (e) => {
                          await fetch(`/api/productos/${p.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ destacado: e.target.checked }),
                          });
                        }}
                      />
                    </td>
                    <td className="py-4 pr-3 text-center">
                      <input
                        type="checkbox"
                        defaultChecked={p.visible_web !== false}
                        onChange={async (e) => {
                          await fetch(`/api/productos/${p.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ visible_web: e.target.checked }),
                          });
                        }}
                      />
                    </td>
                    <td className="py-4 pl-2 pr-4 text-right">
                      <Link
                        href={`/inventario/${p.id}/editar`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-xs font-semibold px-3 py-1.5 transition-colors shadow-sm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

        {!cargando && total === 0 && (
          <p className="py-16 text-center text-sm text-gray-400">
            {busquedaAplicada
              ? `No encontramos productos que coincidan con "${busquedaAplicada}".`
              : "Todavía no hay productos cargados."}
          </p>
        )}

        {totalPaginas > 1 && (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={pagina === 0 || cargando}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-500">
              Página {(pagina + 1).toLocaleString("es-PY")} de {totalPaginas.toLocaleString("es-PY")}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1 || cargando}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
