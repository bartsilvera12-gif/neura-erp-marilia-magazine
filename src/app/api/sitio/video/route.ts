import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse, errorResponse } from "@/lib/api/response";

const VIDEO_SCHEMA = "mariliaerp";

/**
 * Endpoint PÚBLICO (sin auth) que el sitio consume para mostrar el video de
 * presentación en la portada.
 *
 * La feature vive explícitamente en `mariliaerp` para no depender del fallback
 * global de schema heredado de otras instancias. Esta app es una instancia
 * dedicada de Marília; si hubiera más de una fila activa por error, se toma la
 * actualizada más recientemente en vez de una fila arbitraria.
 *
 * Se cachea corto: la URL guardada ya trae `?v=<timestamp>`, así que al
 * reemplazar el video la URL cambia y el navegador no sirve el viejo.
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .schema(VIDEO_SCHEMA)
      .from("sitio_video")
      .select("video_url, poster_url, mime, updated_at")
      .eq("activo", true)
      .not("video_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    const fila = (data ?? [])[0] as {
      video_url?: string | null;
      poster_url?: string | null;
      mime?: string | null;
    } | undefined;

    const payload = {
      video_url: fila?.video_url ?? null,
      poster_url: fila?.poster_url ?? null,
      mime: fila?.mime ?? null,
    };

    return NextResponse.json(successResponse(payload), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (err) {
    console.error("[/api/sitio/video GET]", err instanceof Error ? err.message : err);
    // Nunca romper la portada: si algo falla, el sitio simplemente no muestra video.
    return NextResponse.json(errorResponse("No se pudo cargar el video."), { status: 500 });
  }
}
