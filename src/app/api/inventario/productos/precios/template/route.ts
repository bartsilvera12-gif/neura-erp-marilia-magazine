import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/excel/export";
import { PRECIOS_TEMPLATE_ROW } from "@/lib/imports/precios-importer";

export async function GET() {
  const cols = Object.keys(PRECIOS_TEMPLATE_ROW).map((k) => ({
    header: k,
    value: (r: typeof PRECIOS_TEMPLATE_ROW) => r[k as keyof typeof PRECIOS_TEMPLATE_ROW],
    width: 18,
  }));
  const buf = buildXlsxBuffer([PRECIOS_TEMPLATE_ROW], cols, { sheetName: "Precios" });
  return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders("plantilla-precios") });
}
