import { NextRequest } from "next/server";
import { subirImagenSitio } from "@/lib/sitio-admin/imagen-upload";

/**
 * POST /api/sitio-admin/instagram/imagen
 * Form: { file: File, nombre?: string }  → { imagen_url }
 */
export async function POST(request: NextRequest) {
  return subirImagenSitio(request, "instagram");
}
