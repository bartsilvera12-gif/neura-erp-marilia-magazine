/**
 * Membrete (encabezado) común para todos los documentos imprimibles del ERP.
 * Datos comerciales de Marilia Magazine.
 */

export const EMPRESA_DOC = {
  nombre: "Marilia Magazine",
  actividad: [
    "Casa de moda — venta al por menor de indumentaria, calzado y accesorios",
  ],
  telefono: "+595 981 000 000",
  direccion: ["Av. Mariscal López 2340, Villa Morra", "Asunción, Paraguay"],
  /** Logo del documento. Si no existe se muestra el texto del negocio en su lugar. */
  logoUrl: "/brand/marilia-doc-logo.png",
  logoTicketUrl: "/brand/marilia-ticket-logo-bw.png",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Marca tipográfica de Marilia — usa la misma estética del sitio.
 * Se muestra si no hay archivo de logo cargado. `bw` fuerza negro puro (tickets).
 */
function marcaMariliaHTML(bw = false): string {
  const color = bw ? "#000" : "#1E1B16";
  const gold = bw ? "#000" : "#8A7F6A";
  return `
    <div style="line-height:1;">
      <div style="font-family:'Cormorant Garamond', 'Playfair Display', Georgia, serif; font-style:italic; font-weight:400; font-size:34px; color:${color};">Marilia</div>
      <div style="font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:9px; letter-spacing:.42em; text-transform:uppercase; color:${gold}; margin-top:2px;">Magazine</div>
    </div>`;
}

/**
 * Membrete A4: logo a la izquierda, datos comerciales a la derecha, línea divisoria.
 * `origin` opcional para URL absoluta del logo (útil al imprimir/guardar PDF).
 */
export function membreteA4(origin = ""): string {
  const e = EMPRESA_DOC;
  const logo = origin ? `${origin}${e.logoUrl}` : e.logoUrl;
  // Intento cargar el <img>; si falla, JS onerror muestra la marca tipográfica
  const marcaFallback = marcaMariliaHTML(false).replace(/"/g, "&quot;");
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:1px solid #C8962A;padding-bottom:12px;margin-bottom:16px;">
    <div style="flex:0 0 auto;">
      <img src="${esc(logo)}" alt="${esc(e.nombre)}"
        style="max-width:180px;max-height:92px;width:auto;height:auto;object-fit:contain;display:block;"
        onerror="this.outerHTML='${marcaFallback}'" />
    </div>
    <div style="flex:1;min-width:0;text-align:right;font-size:11px;color:#4A443A;line-height:1.55;">
      <div style="font-size:14px;font-weight:600;color:#1E1B16;">${esc(e.nombre)}</div>
      ${e.actividad.map((a) => `<div style="color:#8A7F6A;">${esc(a)}</div>`).join("")}
      ${e.telefono ? `<div style="margin-top:4px;"><strong>Tel:</strong> ${esc(e.telefono)}</div>` : ""}
      <div>${e.direccion.map(esc).join(" · ")}</div>
    </div>
  </div>`;
}

/**
 * Membrete compacto para ticket angosto (58/80mm): logo arriba, datos centrados.
 */
export function membreteTicket(origin = ""): string {
  const e = EMPRESA_DOC;
  const logo = origin ? `${origin}${e.logoTicketUrl}` : e.logoTicketUrl;
  const marcaFallback = marcaMariliaHTML(true).replace(/"/g, "&quot;");
  return `
  <div style="text-align:center;padding-bottom:6px;margin-bottom:6px;border-bottom:1px dashed #000;">
    <div style="margin:0 auto 4px;">
      <img src="${esc(logo)}" alt="${esc(e.nombre)}"
        style="max-width:150px;max-height:72px;width:auto;height:auto;object-fit:contain;display:inline-block;-webkit-print-color-adjust:exact;print-color-adjust:exact;"
        onerror="this.outerHTML='${marcaFallback}'" />
    </div>
    ${e.telefono ? `<div style="font-size:10px;">Tel: ${esc(e.telefono)}</div>` : ""}
    <div style="font-size:10px;">${esc(e.direccion[0])}</div>
    ${e.direccion.length > 1 ? `<div style="font-size:10px;">${esc(e.direccion.slice(1).join(" · "))}</div>` : ""}
  </div>`;
}
