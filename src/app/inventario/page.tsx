"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto, MetodoValuacion } from "@/lib/inventario/types";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none";

const metodoBadge: Record<MetodoValuacion, string> = {
  CPP: "bg-blue-100 text-blue-700",
  FIFO: "bg-green-100 text-green-700",
  LIFO: "bg-purple-100 text-purple-700",
};

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

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const [todos, setTodos] = useState<Producto[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionMin[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Buscador global del módulo: matchea cualquier coincidencia.
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let cancelled = false;
    getProductos().then((data) => {
      if (!cancelled) setTodos(data);
    });
    // Ubicaciones para el filtro
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setUbicaciones((j.data?.ubicaciones ?? []) as UbicacionMin[]);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);

  const ubicacionById = new Map(ubicaciones.map((u) => [u.id, u]));

  const q = busqueda.trim().toLowerCase();
  const productos = q === "" ? todos : todos.filter((p) => {
    const ubic = p.ubicacion_principal_id ? ubicacionById.get(p.ubicacion_principal_id) : null;
    const campos = [
      p.nombre, p.sku, p.color_nombre, p.talla_nombre, p.unidad_medida, p.metodo_valuacion,
      p.codigo_barras,
      String(p.costo_promedio), p.costo_promedio.toLocaleString("es-PY"),
      String(p.precio_venta), p.precio_venta.toLocaleString("es-PY"),
      p.precio_mayorista != null ? String(p.precio_mayorista) : "",
      p.precio_mayorista != null ? p.precio_mayorista.toLocaleString("es-PY") : "",
      p.precio_minorista != null ? String(p.precio_minorista) : "",
      p.precio_minorista != null ? p.precio_minorista.toLocaleString("es-PY") : "",
      ubic?.nombre, ubic?.tipo,
    ];
    return campos.filter(Boolean).join(" ").toLowerCase().includes(q);
  });

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
            placeholder="Buscar en inventario: nombre, SKU, color, talla, precio, ubicación…"
            className={`${inputFilterClass} min-w-[16rem] flex-1`}
          />
          <span className="ml-auto shrink-0 text-sm text-gray-400">
            {productos.length} de {todos.length} productos
          </span>
        </div>


        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">

            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="py-3 pr-4 font-medium">SKU</th>
                <th className="py-3 pr-4 font-medium">Color</th>
                <th className="py-3 pr-4 font-medium">Talla</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                <th className="py-3 pr-4 font-medium">Precio Venta</th>
                <th className="py-3 pr-4 font-medium text-center">Stock</th>
                <th className="py-3 pr-4 font-medium text-center">Stock Mín.</th>
                <th className="py-3 pr-4 font-medium">Unidad</th>
                <th className="py-3 pr-4 font-medium">Ubicación</th>
                <th className="py-3 pr-4 font-medium">Valuación</th>
                <th className="py-3 pr-8 font-medium text-right">
                  <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                </th>
                <th className="py-3 pl-2 pr-4 font-medium text-right whitespace-nowrap">Acción</th>
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                return (
                  <tr key={p.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="py-4 pr-4 font-medium text-gray-800">{p.nombre}</td>
                    <td className="py-4 pr-4 text-gray-500 font-mono">{p.sku}</td>
                    <td className="py-4 pr-4 text-gray-600">{p.color_nombre ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-4 pr-4 text-gray-600">{p.talla_nombre ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>
                    <td className="py-4 pr-4 text-center">
                      <span className={`font-semibold ${stockBajo ? "text-red-600" : "text-gray-800"}`}>
                        {p.stock_actual}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-500">{p.stock_minimo}</td>
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
                    <td className="py-4 pr-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${metodoBadge[p.metodo_valuacion]}`}>
                        {p.metodo_valuacion}
                      </span>
                    </td>
                    <td className={`py-4 pr-8 text-right tabular-nums font-semibold ${margenColor(margen)}`}>
                      {margen.toFixed(2)}%
                    </td>
                    <td className="py-4 pl-2 pr-4 text-right">
                      <Link
                        href={`/inventario/${p.id}/editar`}
                        className="text-sm text-gray-500 hover:text-gray-800 underline"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

      </div>

    </div>
  );
}
