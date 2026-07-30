/**
 * PG directo para inventario de ropa (Maria Cuevas).
 * Lecturas de catalogos de variante: prenda_colores / prenda_tallas.
 * La creacion de prenda + variantes se hace transaccional en el route handler.
 * Mismo patron del resto: schema validado, tablas escapadas, valores via $N.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type { Pool } from "pg";

function pool(): Pool {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool de Postgres no disponible.");
  return p;
}

export interface ColorRow {
  id: string;
  nombre: string;
  codigo_hex: string | null;
}
export interface TallaRow {
  id: string;
  nombre: string;
  orden: number;
}

export async function listColores(schemaRaw: string, empresaId: string): Promise<ColorRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "prenda_colores");
  const { rows } = await pool().query<ColorRow>(
    `SELECT id, nombre, codigo_hex FROM ${t} WHERE empresa_id = $1::uuid AND activo = true ORDER BY nombre`,
    [empresaId]
  );
  return rows;
}

export async function listTallas(schemaRaw: string, empresaId: string): Promise<TallaRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "prenda_tallas");
  const { rows } = await pool().query<TallaRow>(
    `SELECT id, nombre, orden FROM ${t} WHERE empresa_id = $1::uuid AND activo = true ORDER BY orden, nombre`,
    [empresaId]
  );
  return rows;
}
