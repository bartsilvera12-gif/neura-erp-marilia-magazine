import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_VIDEO_MIME,
  ALLOWED_POSTER_MIME,
  MAX_VIDEO_BYTES,
  MAX_POSTER_BYTES,
  SITIO_VIDEOS_BUCKET,
  buildVideoPath,
  buildPosterPath,
  allVideoPaths,
  allPosterPaths,
  ensureSitioVideosBucket,
} from "@/lib/sitio-admin/video-storage";

/**
 * Video de presentación del home del sitio, administrado desde el ERP.
 *
 *   GET     — estado actual (video + poster) del tenant.
 *   POST     — sube/reemplaza el video y, opcional, el poster (multipart).
 *   DELETE   — quita el video completo (o solo el poster con ?poster=1).
 *
 * El sitio público lo lee sin auth en /api/sitio/video.
 */

const SELECT = "empresa_id, video_url, video_path, poster_url, poster_path, mime, activo, updated_at";

type TenantCtx = NonNullable<Awaited<ReturnType<typeof getTenantSupabaseFromAuth>>>;

function publicUrl(ctx: TenantCtx, path: string): string | null {
  const { data } = ctx.supabase.storage.from(SITIO_VIDEOS_BUCKET).getPublicUrl(path);
  // Cache-buster: mismo path al reemplazar, la URL cambia para refrescar cache.
  return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("sitio_video")
      .select(SELECT)
      .eq("empresa_id", ctx.auth.empresa_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ video: data ?? null }));
  } catch (err) {
    console.error("[/api/sitio-admin/video GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el video."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const form = await request.formData();
    const video = form.get("video");
    const poster = form.get("poster");

    if (!(video instanceof File) && !(poster instanceof File)) {
      return NextResponse.json(errorResponse("No se envió ningún archivo."), { status: 400 });
    }

    // Validaciones antes de tocar storage.
    if (video instanceof File) {
      if (!ALLOWED_VIDEO_MIME.has(video.type)) {
        return NextResponse.json(errorResponse("Formato de video no permitido. Usá MP4, WebM o MOV."), { status: 400 });
      }
      if (video.size > MAX_VIDEO_BYTES) {
        const mb = (MAX_VIDEO_BYTES / 1024 / 1024).toFixed(0);
        return NextResponse.json(errorResponse(`El video es demasiado grande (máx. ${mb} MB).`), { status: 413 });
      }
    }
    if (poster instanceof File) {
      if (!ALLOWED_POSTER_MIME.has(poster.type)) {
        return NextResponse.json(errorResponse("Formato de poster no permitido. Usá JPG, PNG o WebP."), { status: 400 });
      }
      if (poster.size > MAX_POSTER_BYTES) {
        const mb = (MAX_POSTER_BYTES / 1024 / 1024).toFixed(0);
        return NextResponse.json(errorResponse(`El poster es demasiado grande (máx. ${mb} MB).`), { status: 413 });
      }
    }

    try { await ensureSitioVideosBucket(supabase); }
    catch (e) { console.error("[sitio-video] ensureBucket", e instanceof Error ? e.message : e); }

    const fila: Record<string, unknown> = {
      empresa_id: empresaId,
      activo: true,
      updated_at: new Date().toISOString(),
    };

    if (video instanceof File) {
      // Si cambia la extensión (mp4 -> mov), borrar las otras variantes para no
      // dejar huérfanos que compitan por la URL.
      const path = buildVideoPath(empresaId, video.type);
      const otras = allVideoPaths(empresaId).filter((p) => p !== path);
      if (otras.length) await supabase.storage.from(SITIO_VIDEOS_BUCKET).remove(otras);

      const buf = Buffer.from(await video.arrayBuffer());
      const up = await supabase.storage
        .from(SITIO_VIDEOS_BUCKET)
        .upload(path, buf, { contentType: video.type, upsert: true });
      if (up.error) {
        console.error("[sitio-video] upload video", up.error.message);
        return NextResponse.json(errorResponse("No se pudo subir el video: " + up.error.message), { status: 500 });
      }
      fila.video_path = path;
      fila.video_url = publicUrl(ctx, path);
      fila.mime = video.type;
    }

    if (poster instanceof File) {
      const path = buildPosterPath(empresaId, poster.type);
      const otras = allPosterPaths(empresaId).filter((p) => p !== path);
      if (otras.length) await supabase.storage.from(SITIO_VIDEOS_BUCKET).remove(otras);

      const buf = Buffer.from(await poster.arrayBuffer());
      const up = await supabase.storage
        .from(SITIO_VIDEOS_BUCKET)
        .upload(path, buf, { contentType: poster.type, upsert: true });
      if (up.error) {
        console.error("[sitio-video] upload poster", up.error.message);
        return NextResponse.json(errorResponse("No se pudo subir el poster: " + up.error.message), { status: 500 });
      }
      fila.poster_path = path;
      fila.poster_url = publicUrl(ctx, path);
    }

    const { data, error } = await supabase
      .from("sitio_video")
      .upsert(fila, { onConflict: "empresa_id" })
      .select(SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ video: data }));
  } catch (err) {
    console.error("[/api/sitio-admin/video POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar el video."), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const soloPoster = new URL(request.url).searchParams.get("poster") === "1";

    if (soloPoster) {
      await supabase.storage.from(SITIO_VIDEOS_BUCKET).remove(allPosterPaths(empresaId));
      const { data, error } = await supabase
        .from("sitio_video")
        .update({ poster_url: null, poster_path: null, updated_at: new Date().toISOString() })
        .eq("empresa_id", empresaId)
        .select(SELECT)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return NextResponse.json(successResponse({ video: data ?? null }));
    }

    // Quitar todo: archivos (video + poster) y la fila.
    await supabase.storage
      .from(SITIO_VIDEOS_BUCKET)
      .remove([...allVideoPaths(empresaId), ...allPosterPaths(empresaId)]);
    const { error } = await supabase
      .from("sitio_video")
      .delete()
      .eq("empresa_id", empresaId);
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ video: null }));
  } catch (err) {
    console.error("[/api/sitio-admin/video DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo quitar el video."), { status: 500 });
  }
}
