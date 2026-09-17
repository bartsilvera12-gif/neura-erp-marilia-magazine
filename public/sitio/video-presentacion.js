/**
 * Video de presentación del home — inyector autónomo.
 *
 * Lee /api/sitio/video (mismo dominio) y, si hay un video cargado desde el ERP,
 * lo muestra debajo del encabezado y antes del contenido principal de la home.
 *
 * Comportamiento pedido:
 *  - Autoplay en SILENCIO (único modo que permiten iOS/Android sin gesto).
 *  - Controles para activar el sonido (botón de unmute superpuesto).
 *  - Responsive: computadora, iOS y Android.
 *  - Carga optimizada: preload="metadata" + poster, para no golpear la
 *    velocidad de la página. El resto del video se transmite al reproducir.
 *
 * Es idempotente y sin dependencias: basta incluir
 *   <script src="/video-presentacion.js" defer></script>
 * (o /sitio/video-presentacion.js según cómo sirvas el sitio).
 */
(function () {
  "use strict";

  if (window.__mmVideoPresentacion) return; // no duplicar si se incluye dos veces
  window.__mmVideoPresentacion = true;

  var API = "/api/sitio/video";

  function h(tag, attrs, css) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (css) el.style.cssText = css;
    return el;
  }

  function montar(data) {
    var url = data && data.video_url;
    if (!url) return; // sin video cargado: la portada queda como estaba
    if (document.getElementById("mm-video-presentacion")) return;

    // Contenedor a todo el ancho, debajo del encabezado.
    var section = h("section", { id: "mm-video-presentacion", "aria-label": "Video de presentación de la tienda" },
      "position:relative;width:100%;background:#0b1020;overflow:hidden;");

    // Marco que fija una relación de aspecto para evitar saltos de layout
    // mientras carga. 16/9 en desktop; el video se ajusta con object-fit.
    var marco = h("div", null,
      "position:relative;width:100%;max-height:82vh;aspect-ratio:16/9;background:#0b1020;margin:0 auto;");
    // Fallback para navegadores viejos sin aspect-ratio.
    marco.style.minHeight = "220px";

    var video = h("video", {
      playsinline: "",
      "webkit-playsinline": "",
      muted: "",
      autoplay: "",
      loop: "",
      preload: "metadata",
    }, "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#0b1020;display:block;");
    // Propiedades booleanas: por atributo no siempre bastan en todos los browsers.
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    if (data.poster_url) video.setAttribute("poster", data.poster_url);

    var sourceAttrs = { src: url };
    if (data.mime) sourceAttrs.type = data.mime;
    var source = h("source", sourceAttrs);
    video.appendChild(source);

    // Botón de sonido (arranca en "activar sonido" porque va muteado).
    var btn = h("button", { type: "button", "aria-label": "Activar sonido" },
      "position:absolute;right:16px;bottom:16px;z-index:2;display:inline-flex;align-items:center;gap:8px;" +
      "padding:10px 14px;border:0;border-radius:999px;cursor:pointer;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "color:#0b1020;background:rgba(255,255,255,.92);box-shadow:0 4px 14px rgba(0,0,0,.28);backdrop-filter:blur(4px);");

    function iconoSonido(activo) {
      return activo
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
    }
    function pintarBtn() {
      var conSonido = !video.muted;
      btn.innerHTML = iconoSonido(conSonido) + "<span>" + (conSonido ? "Silenciar" : "Activar sonido") + "</span>";
      btn.setAttribute("aria-label", conSonido ? "Silenciar" : "Activar sonido");
    }
    btn.addEventListener("click", function () {
      video.muted = !video.muted;
      if (!video.muted) {
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      }
      pintarBtn();
    });
    pintarBtn();

    marco.appendChild(video);
    marco.appendChild(btn);
    section.appendChild(marco);

    // La estructura actual tiene <header> seguido por #home-view. El video debe
    // quedar entre ambos. Si el sitio productivo cambia de estructura, usamos
    // #home-view como segundo ancla y solo como último recurso lo agregamos al body.
    var header = document.querySelector("header");
    var home = document.getElementById("home-view");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(section, header.nextSibling);
    } else if (home && home.parentNode) {
      home.parentNode.insertBefore(section, home);
    } else {
      document.body.insertBefore(section, document.body.firstChild);
    }

    // Reintentar autoplay tras montar (algunos browsers lo bloquean si el
    // elemento aún no estaba en el DOM al crear).
    var play = video.play();
    if (play && play.catch) play.catch(function () { /* autoplay bloqueado: queda el poster + botón */ });

    // Ajuste para videos verticales: se centran y usan contain para evitar
    // recortes. En desktop no crecen indefinidamente y en móvil respetan 78vh.
    video.addEventListener("loadedmetadata", function () {
      var vertical = video.videoHeight > video.videoWidth;
      if (vertical) {
        marco.style.aspectRatio = "9/16";
        marco.style.maxHeight = "78vh";
        marco.style.maxWidth = "560px";
        video.style.objectFit = "contain";
        video.style.background = "#0b1020";
      }
    });
  }

  function init() {
    fetch(API, { headers: { accept: "application/json" }, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.success && j.data) montar(j.data); })
      .catch(function () { /* silencioso: no romper la portada */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
