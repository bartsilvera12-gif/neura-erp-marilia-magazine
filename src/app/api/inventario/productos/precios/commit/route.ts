import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { leerArchivoYAuth } from "@/lib/imports/import-helpers";
import { parsePreciosRows, buildPreciosResolverMaps, buildPreciosPreview, commitPrecios } from "@/lib/imports/precios-importer";
import { registrarImportAudit } from "@/lib/excel/imports-audit-pg";

export async function POST(request: NextRequest) {
  const res = await leerArchivoYAuth(request);
  if (!res.ok) return NextResponse.json(errorResponse(res.error), { status: res.status });
  try {
    const parsed = parsePreciosRows(res.ctx.rows);
    const maps = await buildPreciosResolverMaps(res.ctx.schema, res.ctx.empresaId);
    buildPreciosPreview(parsed, maps); // marca .match_id y .errors
    const out = await commitPrecios(res.ctx.schema, res.ctx.empresaId, parsed);
    const auditId = await registrarImportAudit(res.ctx.schema, res.ctx.empresaId, {
      entidad: "productos_precios",
      filename: res.ctx.filename,
      total_rows: parsed.length,
      inserted_count: 0,
      updated_count: out.updated,
      skipped_count: out.skipped,
      error_count: out.errors,
      warning_count: 0,
      errors_json: out.errorMessages,
      warnings_json: [],
      created_by: res.ctx.usuarioCatalogId,
      usuario_nombre: res.ctx.usuarioNombre,
    });
    return NextResponse.json(successResponse({
      summary: {
        total: parsed.length,
        updated: out.updated,
        skipped: out.skipped,
        errors: out.errors,
      },
      errors: out.errorMessages,
      audit_id: auditId,
    }));
  } catch (e) {
    console.error("[productos/precios/commit]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo importar."), { status: 500 });
  }
}
