import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Quitar el header "X-Powered-By: Next.js" — leak innecesario de tech stack
  // a clientes/atacantes. Cuesta 0 perf-wise.
  poweredByHeader: false,

  // gzip de respuestas en produccion. Es el default pero declararlo explicito
  // evita sorpresas si Coolify/Traefik intentan re-comprimir.
  compress: true,

  // NOTA: NO usamos output: "standalone" porque Coolify+Nixpacks corre
  // `next start` con .next/ regular, no usa .next/standalone/. Si en el futuro
  // hacemos un Dockerfile custom para reducir imagen, agregar standalone ahi.

  experimental: {
    // Tree-shake agresivo para barrels grandes. Cuando importas
    //   import { ChevronDown, X, Search } from "lucide-react"
    // Next solo bundlea esas 3 icons en vez del barrel completo de la libreria.
    // Aplica tambien a recharts (aunque ya hicimos dynamic import del chart).
    optimizePackageImports: ["lucide-react", "recharts"],

    // Cuando la request pasa por el middleware (nuestro matcher cubre /api/*),
    // Next bufferea el body con un limite que por defecto es 10MB. Las subidas
    // grandes (video de presentacion) lo excedian y `formData()` fallaba con
    // "Failed to parse body as FormData". Debe ser >= MAX_VIDEO_BYTES (250MB)
    // + overhead del multipart; lo dejamos en 270MB.
    // NOTA: en Next 16.3+ esta opcion se renombro a `proxyClientMaxBodySize`;
    // esta instancia corre 16.1.6, donde la clave es `middlewareClientMaxBodySize`.
    // OJO: el proxy de Coolify (Traefik) tambien puede limitar el body; si una
    // subida grande falla con 413, hay que subir el limite ahi tambien.
    middlewareClientMaxBodySize: 283115520, // 270 MB en bytes
  } as NextConfig["experimental"],

  // TypeScript check ya se hace localmente con `tsc --noEmit` antes de cada
  // commit (verificado). En Coolify el "Running TypeScript" step del build
  // consume MUCHA RAM (~2GB) y mata el contenedor por OOM. Skipear aca evita
  // ese kill y el deploy llega a produccion. Si en el futuro Coolify tiene mas
  // memoria, este flag puede sacarse para defensa en profundidad.
  typescript: {
    ignoreBuildErrors: true,
  },

  // Headers HTTP para caching agresivo de assets estaticos generados por Next
  // (fingerprinted, immutable por hash). El navegador los cachea 1 ano.
  // Reduce dramaticamente requests al server en navegaciones siguientes
  // del mismo user (vuelve al dashboard, los chunks JS/CSS ya estan locales).
  async headers() {
    return [
      // HSTS: declara que el dominio SIEMPRE debe ser HTTPS. El browser
      // recuerda esto por 2 anos y nunca mas vuelve a probar HTTP -> elimina
      // el 307 HTTP->HTTPS que creaba entradas falsas en el historial.
      // includeSubDomains aplica a futuros subdominios.
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/_next/image(.*)",
        headers: [
          // Imagenes optimizadas tambien son fingerprinted, mismo trato.
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Sitio publico: assets estaticos del sitio importado (/sitio/assets/*,
      // /sitio/uploads/*, /sitio/support.js, /sitio/image-slot.js) tambien
      // cacheables agresivo. Cuando se actualizan, se renombran (cache-bust
      // manual via ?v=). Sin esto, el browser hacia revalidacion 304 en cada
      // nav -> agregaba ~200ms por archivo en visitas repetidas.
      {
        source: "/sitio/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000" },
        ],
      },
      {
        source: "/sitio/uploads/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000" },
        ],
      },
      {
        source: "/sitio/support.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
      {
        source: "/sitio/image-slot.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
      {
        source: "/sitio/video-presentacion.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
