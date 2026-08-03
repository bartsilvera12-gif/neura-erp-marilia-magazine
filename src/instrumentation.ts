/**
 * Next.js instrumentation — se ejecuta una vez cuando arranca el proceso
 * (Node o edge). Usamos este hook para bootear el worker SIFEN in-process que
 * drena la cola `sifen_jobs`.
 *
 * Sólo aplica cuando el runtime es `nodejs`: en `edge` no hay setTimeout
 * persistente ni acceso a `node:os`.
 *
 * Deployment target: Coolify Docker (proceso Node persistente), donde el worker
 * vive continuo. En serverless no funcionaría porque el proceso se suspende
 * después de responder.
 *
 * Kill switch: `SIFEN_WORKER_DISABLED=1` deshabilita el worker sin tocar código.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SIFEN_WORKER_DISABLED === "1") {
    console.log("[sifen-worker] deshabilitado por SIFEN_WORKER_DISABLED=1");
    return;
  }
  // Import dinámico: evita cargar node:os y el cliente Supabase en el bundle edge.
  const { startSifenWorker } = await import("@/lib/sifen/jobs/sifen-worker");
  startSifenWorker();
}
