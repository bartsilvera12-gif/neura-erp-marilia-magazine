import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { leerArchivoYAuth } from "@/lib/imports/import-helpers";
import { parsePreciosRows, buildPreciosResolverMaps, buildPreciosPreview } from "@/lib/imports/precios-importer";

export async function POST(request: NextRequest) {
  const res = await leerArchivoYAuth(request);
  if (!res.ok) return NextResponse.json(errorResponse(res.error), { status: res.status });
  try {
    const parsed = parsePreciosRows(res.ctx.rows);
    const maps = await buildPreciosResolverMaps(res.ctx.schema, res.ctx.empresaId);
    const preview = buildPreciosPreview(parsed, maps);
    return NextResponse.json(successResponse(preview));
  } catch (e) {
    console.error("[productos/precios/preview]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo generar la vista previa."), { status: 500 });
  }
}
