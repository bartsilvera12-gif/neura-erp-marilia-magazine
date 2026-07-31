import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ymdInicioFinMesLocal } from "@/lib/fechas/calendario";
import { getBrowserSupabaseForEmpresaData } from "@/lib/supabase/browser-data-client";

export type Gasto = {
  id: string;
  empresa_id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
  created_at: string;
};

export type GastoInput = {
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
};

function mapRow(r: Record<string, unknown>): Gasto {
  return {
    id: r.id as string,
    empresa_id: r.empresa_id as string,
    categoria: (r.categoria as string) ?? "",
    descripcion: (r.descripcion as string) ?? "",
    monto: Number(r.monto) ?? 0,
    tipo: (r.tipo as "fijo" | "variable") ?? "variable",
    recurrente: Boolean(r.recurrente),
    frecuencia: r.frecuencia as string | undefined,
    fecha: (r.fecha as string) ?? "",
    created_at: (r.created_at as string) ?? "",
  };
}

/** Obtiene todos los gastos de la empresa, ordenados por fecha desc. */
export async function getGastos(): Promise<Gasto[]> {
  if (typeof window !== "undefined") {
    const res = await fetchWithSupabaseSession("/api/gastos", { cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Error ${res.status}`);
    }
    const json = (await res.json()) as { success?: boolean; data?: Record<string, unknown>[] };
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data.map(mapRow);
  }

  const supabase = await getBrowserSupabaseForEmpresaData();
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** Obtiene los gastos del mes actual (para Dashboard). RLS filtra por empresa. */
export async function getGastosMesActual(): Promise<Gasto[]> {
  const supabase = await getBrowserSupabaseForEmpresaData();
  const hoy = new Date();
  const { inicioYmd: inicioMes, finYmd: finMes } = ymdInicioFinMesLocal(hoy);

  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .gte("fecha", inicioMes)
    .lte("fecha", finMes)
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/**
 * Escrituras via API del tenant: la empresa la resuelve el server desde la
 * sesion. Antes se insertaba directo con el cliente del browser y, si el
 * perfil del usuario todavia no estaba cargado, cortaba con "Usuario no
 * autenticado o sin empresa" aunque la sesion fuera valida.
 */
async function escribirGasto(
  url: string,
  method: "POST" | "PATCH",
  payload: Record<string, unknown>
): Promise<Gasto> {
  const res = await fetchWithSupabaseSession(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || `Error ${res.status} al guardar el gasto.`);
  }
  return mapRow(json.data);
}

export async function createGasto(input: GastoInput): Promise<Gasto> {
  if (input.monto <= 0) throw new Error("El monto debe ser mayor a 0");
  return escribirGasto("/api/gastos", "POST", {
    categoria: input.categoria.trim(),
    descripcion: input.descripcion.trim(),
    monto: input.monto,
    tipo: input.tipo,
    recurrente: input.recurrente,
    frecuencia: input.frecuencia?.trim() ?? "",
    fecha: input.fecha,
  });
}

export async function updateGasto(id: string, input: Partial<GastoInput>): Promise<Gasto> {
  if (input.monto !== undefined && input.monto <= 0) throw new Error("El monto debe ser mayor a 0");
  const payload: Record<string, unknown> = {};
  if (input.categoria !== undefined) payload.categoria = input.categoria.trim();
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion.trim();
  if (input.monto !== undefined) payload.monto = input.monto;
  if (input.tipo !== undefined) payload.tipo = input.tipo;
  if (input.recurrente !== undefined) payload.recurrente = input.recurrente;
  if (input.frecuencia !== undefined) payload.frecuencia = input.frecuencia?.trim() ?? "";
  if (input.fecha !== undefined) payload.fecha = input.fecha;
  return escribirGasto(`/api/gastos/${id}`, "PATCH", payload);
}

export async function deleteGasto(id: string): Promise<void> {
  const res = await fetchWithSupabaseSession(`/api/gastos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Error ${res.status} al eliminar el gasto.`);
  }
}
