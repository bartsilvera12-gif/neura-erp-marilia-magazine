/**
 * Búsqueda de productos por tokens (palabras clave en cualquier orden).
 *
 * Objetivo: que "Tornillo 5x70", "5x70 Scissor" y "Scissor Tornillo" encuentren
 * al producto "Tornillo Fix Scissor 5x70". Cada palabra de la consulta debe
 * aparecer en el texto del producto (AND entre tokens), sin importar el orden.
 *
 * Se comparte entre el filtrado client-side (combos ya cargados) y la
 * construcción de filtros ILIKE server-side (PostgREST), para que TODAS las
 * pantallas (pedidos, ventas, compras, inventario, pickers) matcheen igual.
 */

const DIACRITICOS = /[̀-ͯ]/g;

/** Normaliza: minúsculas + sin acentos/diacríticos. Para comparación en cliente. */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim();
}

/**
 * Divide la consulta en tokens (palabras) no vacíos. Máximo 8 tokens para
 * acotar el costo de la query. No quita acentos: sirve tanto para cliente
 * (que normaliza aparte) como de base para el server.
 *
 * Separa por CUALQUIER caracter que no sea letra/número (espacios, guiones
 * `-` y `–`, `/`, comas, etc.). Así la puntuación nunca queda como un token
 * propio: antes, pegar un nombre como "Camiseta Pima ATIQ – Creme" generaba
 * un token "–" que no aparecía en ninguna columna y, al exigirse TODOS los
 * tokens (AND), devolvía "Sin resultados".
 */
export function splitTokens(q: string): string[] {
  return q.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 8);
}

/**
 * Client-side: ¿el producto (por sus campos de texto) matchea TODOS los tokens
 * de la consulta, en cualquier orden? Consulta vacía → true (no filtra).
 */
export function productoMatchesQuery(
  q: string,
  ...campos: (string | null | undefined)[]
): boolean {
  const tokens = splitTokens(normalizeText(q));
  if (tokens.length === 0) return true;
  const heno = normalizeText(campos.filter(Boolean).join(" "));
  return tokens.every((t) => heno.includes(t));
}

/**
 * Server-side (PostgREST/ILIKE): escapa un token para usarlo dentro de un
 * patrón LIKE y del string de `.or()`. Neutraliza los comodines del usuario
 * (% _ \) y quita los caracteres que rompen el parser de filtros PostgREST
 * (comas y paréntesis).
 */
export function escapeIlikeToken(t: string): string {
  return t
    .replace(/[(),]/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Aplica a un query builder de PostgREST el matching por tokens: por cada
 * token agrega un `.or(col1.ilike.%tok%, col2.ilike.%tok%, ...)`. Como los
 * filtros de nivel superior se combinan con AND, el resultado es
 * "cada token aparece en alguna columna" (orden-independiente).
 *
 * `condicionesExtraPorToken` permite sumar condiciones OR adicionales por
 * token (recibe el token CRUDO, sin escapar), p. ej. para buscar por una
 * columna relacionada resuelta aparte: `categoria_principal_id.in.(id1,id2)`.
 *
 * `query` es el builder de supabase-js; se devuelve el builder encadenado.
 */
export function applyTokenSearch<Q extends { or: (f: string) => Q }>(
  query: Q,
  q: string,
  columnas: string[],
  condicionesExtraPorToken?: (tokenCrudo: string) => string[]
): Q {
  const tokens = splitTokens(q);
  let out = query;
  for (const tokRaw of tokens) {
    const tok = escapeIlikeToken(tokRaw);
    if (!tok) continue;
    const pat = `%${tok}%`;
    const condiciones = columnas.map((c) => `${c}.ilike.${pat}`);
    if (condicionesExtraPorToken) {
      for (const extra of condicionesExtraPorToken(tokRaw)) {
        if (extra) condiciones.push(extra);
      }
    }
    out = out.or(condiciones.join(","));
  }
  return out;
}
