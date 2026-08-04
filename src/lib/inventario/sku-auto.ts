/**
 * SKU interno autogenerado.
 *
 * El código que maneja el negocio es `codigo_proveedor`, que puede repetirse
 * entre productos. El SKU queda como identificador interno único por empresa
 * —lo usan la caja, el escáner y el importador para saber qué fila tocar— y
 * no se muestra ni se edita en la UI.
 *
 * Formato: `ART-000001`. Correlativo por empresa, best-effort igual que
 * VTA-XXXXXX / FAC-XXXXXX: el índice único (empresa_id, sku) es lo que
 * realmente impide duplicados si dos altas simultáneas piden el mismo número.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

const PREFIJO = "ART-";
const ANCHO = 6;

export async function siguienteSkuAuto(
  sb: AppSupabaseClient,
  empresaId: string
): Promise<string> {
  const { data, error } = await sb
    .from("productos")
    .select("sku")
    .eq("empresa_id", empresaId)
    .like("sku", `${PREFIJO}%`)
    .order("sku", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  let siguiente = 1;
  const ultimo = (data?.[0] as { sku?: string } | undefined)?.sku;
  if (ultimo) {
    const m = ultimo.match(/^ART-(\d+)$/);
    if (m) siguiente = parseInt(m[1], 10) + 1;
  }
  return PREFIJO + String(siguiente).padStart(ANCHO, "0");
}

/**
 * Igual que `siguienteSkuAuto` pero devuelve `cantidad` SKUs correlativos,
 * para el alta de una prenda que genera N variantes de una sola vez.
 */
export async function siguientesSkusAuto(
  sb: AppSupabaseClient,
  empresaId: string,
  cantidad: number
): Promise<string[]> {
  const primero = await siguienteSkuAuto(sb, empresaId);
  const base = parseInt(primero.slice(PREFIJO.length), 10);
  return Array.from({ length: cantidad }, (_, i) =>
    PREFIJO + String(base + i).padStart(ANCHO, "0")
  );
}
