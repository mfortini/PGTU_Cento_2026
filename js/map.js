/* Viewer Leaflet per PUG Cento — carica web/data/layers.json generato da prepare_web_publish.sh */

const overlayRefs = [];
const exclusiveLayers = new Set();
let activeOverlay = null;

function canonicalLayerId(item) {
  const id = item?.id || item?.title || "";
  return id.replace(/_modified$/, "");
}

function parseLayerHash() {
  const raw = location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  if (raw.startsWith("layer=")) {
    return decodeURIComponent(raw.slice("layer=".length));
  }
  return null;
}

function layerHashUrl(layerCfg) {
  const id = layerCfg ? canonicalLayerId(layerCfg) : "";
  const base = `${location.pathname}${location.search}`;
  return id ? `${base}#layer=${encodeURIComponent(id)}` : base;
}

function dedupeByLayerId(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = canonicalLayerId(item);
    if (!key) continue;
    const prev = byKey.get(key);
    if (
      !prev ||
      (/_modified$/.test(prev.id || prev.title || "") &&
        !/_modified$/.test(item.id || item.title || ""))
    ) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()];
}

const SECTION_ORDER = ["tavole"];

function initLegendZoom() {
  const panel = document.getElementById("legend-panel");
  const viewport = document.getElementById("legend-viewport");
  const transform = document.getElementById("legend-transform");
  const img = document.getElementById("legend-image");
  const zoomIn = document.getElementById("legend-zoom-in");
  const zoomOut = document.getElementById("legend-zoom-out");
  const zoomReset = document.getElementById("legend-zoom-reset");
  const zoomLevel = document.getElementById("legend-zoom-level");

  if (!viewport || !transform || !img) {
    return { fit() {}, reflow() {} };
  }

  let scale = 1;
  let fitScale = 1;
  let zoomRatio = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragPanX = 0;
  let dragPanY = 0;
  let reflowScheduled = false;

  const MAX_SCALE = 10;
  const MIN_VIEWPORT = 8;

  function computeFitScale() {
    if (!img.naturalWidth || !img.naturalHeight) return 1;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return 1;
    return Math.min(vw / img.naturalWidth, vh / img.naturalHeight, 1);
  }

  function snapToFit() {
    fitScale = computeFitScale();
    scale = fitScale;
    panX = 0;
    panY = 0;
    zoomRatio = 1;
  }

  function atOrBelowFit() {
    fitScale = computeFitScale();
    return scale <= fitScale + 1e-6;
  }

  function clampPan() {
    if (atOrBelowFit()) {
      snapToFit();
      return;
    }

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh || !img.naturalWidth || !img.naturalHeight) return;

    const scaledW = img.naturalWidth * scale;
    const scaledH = img.naturalHeight * scale;

    panX = Math.min(0, Math.max(vw - scaledW, panX));
    panY = Math.min(0, Math.max(vh - scaledH, panY));
  }

  function applyTransform() {
    clampPan();
    transform.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (fitScale > 0) {
      zoomRatio = scale / fitScale;
    }
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(zoomRatio * 100)}%`;
    }
  }

  function fit() {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw < MIN_VIEWPORT || vh < MIN_VIEWPORT) return;
    snapToFit();
    applyTransform();
  }

  function reflow() {
    if (!img.src || panel?.hidden) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw < MIN_VIEWPORT || vh < MIN_VIEWPORT) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    if (panel) panel.hidden = false;
    viewport.hidden = false;
    img.hidden = false;

    fitScale = computeFitScale();
    scale = Math.min(MAX_SCALE, Math.max(fitScale, zoomRatio * fitScale));
    clampPan();
    applyTransform();
  }

  function scheduleReflow() {
    if (reflowScheduled) return;
    reflowScheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reflowScheduled = false;
        reflow();
      });
    });
  }

  function zoomAt(factor, clientX, clientY) {
    fitScale = computeFitScale();
    if (factor < 1 && scale <= fitScale + 1e-6) {
      snapToFit();
      applyTransform();
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const nextScale = Math.min(MAX_SCALE, Math.max(fitScale, scale * factor));
    if (nextScale <= fitScale + 1e-6) {
      snapToFit();
      applyTransform();
      return;
    }

    const ratio = nextScale / scale;
    panX = x - (x - panX) * ratio;
    panY = y - (y - panY) * ratio;
    scale = nextScale;
    applyTransform();
  }

  function endDrag() {
    dragging = false;
    viewport.classList.remove("is-dragging");
  }

  img.addEventListener("load", fit);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(scheduleReflow);
    observer.observe(viewport);
  }

  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    },
    { passive: false }
  );

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || atOrBelowFit()) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanX = panX;
    dragPanY = panY;
    viewport.classList.add("is-dragging");
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    panX = dragPanX + (e.clientX - dragStartX);
    panY = dragPanY + (e.clientY - dragStartY);
    applyTransform();
  });

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  zoomIn?.addEventListener("click", () => {
    const rect = viewport.getBoundingClientRect();
    zoomAt(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  zoomOut?.addEventListener("click", () => {
    const rect = viewport.getBoundingClientRect();
    zoomAt(1 / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  zoomReset?.addEventListener("click", fit);

  return { fit, reflow };
}

const SECTION_META = {
  tavole: {
    title: "Tavole",
    subtitle: "Classificazione, rete ciclabile e circolazione",
  },
};

class LayerPanel {
  constructor(pugChoices, onPugSelect, onLayoutChange) {
    this._pugChoices = pugChoices;
    this._onPugSelect = onPugSelect;
    this._onLayoutChange = onLayoutChange || (() => {});
    this._selectedPug = null;
    this._open = false;
    this._groupOpen = {};

    this._container = document.getElementById("layer-panel");
    this._toggle = document.getElementById("layer-panel-toggle");
    this._body = document.getElementById("layer-panel-body");
    this._closeBtn = document.getElementById("layer-panel-close");
    this._hint = document.getElementById("layer-hint");
    this._form = document.getElementById("layer-radio-form");
    this._hintDismissed = false;

    this._toggle?.addEventListener("click", () => this.setOpen(!this.isOpen()));
    this._closeBtn?.addEventListener("click", () => this.setOpen(false));

    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this.isOpen()) {
        this.setOpen(false);
      }
    };
    document.addEventListener("keydown", this._onKeyDown);

    this.render();
    this.setOpen(false);
  }

  showHint() {
    if (this._hintDismissed || this._open) return;
    if (this._hint) {
      this._hint.classList.remove("is-hidden");
      this._hint.hidden = false;
    }
  }

  dismissHint() {
    this._hintDismissed = true;
    if (this._hint) {
      this._hint.classList.add("is-hidden");
      this._hint.hidden = true;
    }
  }

  isOpen() {
    return this._open;
  }

  setOpen(open) {
    this._open = open;
    const layout = document.querySelector(".map-layout");
    if (this._container) {
      this._container.classList.toggle("is-open", open);
    }
    if (this._body) {
      this._body.hidden = !open;
    }
    if (this._toggle) {
      this._toggle.classList.toggle("is-open", open);
      this._toggle.setAttribute("aria-expanded", open ? "true" : "false");
      this._toggle.title = open ? "Chiudi elenco tavole" : "Apri elenco tavole";
      this._toggle.setAttribute(
        "aria-label",
        open ? "Chiudi elenco tavole del PGTU" : "Apri elenco tavole del PGTU"
      );
    }
    if (open) {
      this.dismissHint();
    } else if (!this._selectedPug) {
      this.showHint();
    }
    if (layout) {
      layout.classList.toggle("map-layout--layers-open", open);
    }
    this._onLayoutChange(open);
  }

  setSelectedPug(layer) {
    this._selectedPug = layer;
    if (!this._form) return;
    const value = layer
      ? String(this._pugChoices.findIndex((c) => c.layer === layer))
      : "none";
    const input = this._form.querySelector(`input[name="pug-layer"][value="${value}"]`);
    if (input) input.checked = true;

    if (layer) {
      const choice = this._pugChoices.find((c) => c.layer === layer);
      if (choice?.section) {
        this._groupOpen[choice.section] = true;
        const group = this._form.querySelector(
          `.layer-tree-group[data-section="${choice.section}"]`
        );
        if (group) group.open = true;
      }
    }
  }

  _saveGroupState() {
    if (!this._form) return;
    this._form.querySelectorAll(".layer-tree-group").forEach((el) => {
      const section = el.dataset.section;
      if (section) this._groupOpen[section] = el.open;
    });
  }

  _appendRadioItem(container, choice, index) {
    const label = document.createElement("label");
    label.className = "layer-radio-item";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "pug-layer";
    input.value = String(index);
    input.checked = this._selectedPug === choice.layer;
    const span = document.createElement("span");
    span.textContent = choice.label;
    label.append(input, span);
    input.addEventListener("change", () => {
      if (input.checked) this._onPugSelect(choice.layer, choice.cfg);
    });
    container.appendChild(label);
  }

  render() {
    if (!this._form) return;
    this._saveGroupState();
    this._form.innerHTML = "";

    const noneLabel = document.createElement("label");
    noneLabel.className = "layer-radio-item layer-radio-none";
    const noneInput = document.createElement("input");
    noneInput.type = "radio";
    noneInput.name = "pug-layer";
    noneInput.value = "none";
    noneInput.checked = this._selectedPug === null;
    const noneSpan = document.createElement("span");
    noneSpan.textContent = "Nessuno (solo mappa base)";
    noneLabel.append(noneInput, noneSpan);
    noneInput.addEventListener("change", () => {
      if (noneInput.checked) this._onPugSelect(null, null);
    });
    this._form.appendChild(noneLabel);

    const bySection = new Map();
    this._pugChoices.forEach((choice, index) => {
      const section = choice.section || "altro";
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section).push({ choice, index });
    });

    for (const section of SECTION_ORDER) {
      const items = bySection.get(section);
      if (!items?.length) continue;

      const meta = SECTION_META[section] || { title: section, subtitle: "" };
      const sorted = [...items].sort((a, b) =>
        a.choice.label.localeCompare(b.choice.label, "it", { sensitivity: "base" })
      );

      const group = document.createElement("details");
      group.className = "layer-tree-group";
      group.dataset.section = section;
      group.open = this._groupOpen[section] !== false;

      const summary = document.createElement("summary");
      summary.className = "layer-tree-summary";
      const chevron = document.createElement("span");
      chevron.className = "layer-tree-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "▸";
      const titleRow = document.createElement("div");
      titleRow.className = "layer-tree-summary-row";
      const title = document.createElement("span");
      title.className = "layer-tree-summary-title";
      title.textContent = meta.title;
      const count = document.createElement("span");
      count.className = "layer-tree-count";
      count.textContent = `(${sorted.length})`;
      titleRow.append(title, count);
      summary.append(chevron, titleRow);
      if (meta.subtitle) {
        const sub = document.createElement("span");
        sub.className = "layer-tree-summary-sub";
        sub.textContent = meta.subtitle;
        summary.appendChild(sub);
      }

      group.addEventListener("toggle", () => {
        this._groupOpen[section] = group.open;
      });

      if (meta.helpText) {
        const help = document.createElement("details");
        help.className = "layer-group-help";
        const helpSummary = document.createElement("summary");
        helpSummary.textContent = meta.helpTitle || "Info";
        const helpBody = document.createElement("p");
        helpBody.textContent = meta.helpText;
        help.append(helpSummary, helpBody);
        help.addEventListener("click", (e) => e.stopPropagation());
        group.appendChild(help);
      }

      const itemsEl = document.createElement("div");
      itemsEl.className = "layer-tree-items";
      sorted.forEach(({ choice, index }) => {
        this._appendRadioItem(itemsEl, choice, index);
      });

      group.append(summary, itemsEl);
      this._form.appendChild(group);
    }
  }
}

async function init() {
  const res = await fetch("data/layers.json");
  if (!res.ok) {
    document.getElementById("map").innerHTML =
      "<p style='padding:2rem'>Manca <code>data/layers.json</code>. Esegui <code>scripts/prepare_web_publish.sh</code>.</p>";
    return;
  }
  const cfg = await res.json();

  document.getElementById("map-title").textContent = cfg.title || "Mappa";
  document.getElementById("map-desc").innerHTML =
    "Scegli una tavola con il pulsante <strong>Tavole</strong> in alto a destra sulla mappa.";

  const overlays = dedupeByLayerId(
    (cfg.overlays || []).filter((o) => o.type === "xyz")
  );
  const overlayMinZoom = overlays.length
    ? Math.min(...overlays.map((o) => o.minZoom ?? 10))
    : 10;
  const overlayMaxNativeZoom = overlays.length
    ? Math.max(...overlays.map((o) => o.maxZoom ?? 16))
    : 16;
  const mapMinZoom = cfg.minZoom ?? overlayMinZoom;
  const mapMaxZoom = cfg.maxZoom ?? overlayMaxNativeZoom + 2;
  const initialZoom = Math.min(
    Math.max(cfg.zoom ?? 12, mapMinZoom),
    overlayMaxNativeZoom
  );

  const map = L.map("map", {
    center: cfg.center || [44.73, 11.29],
    zoom: initialZoom,
    minZoom: mapMinZoom,
    maxZoom: mapMaxZoom,
  });

  const confinePane = map.createPane("confine");
  confinePane.style.zIndex = 450;

  const pugOverlayPane = map.createPane("pugOverlay");
  pugOverlayPane.style.zIndex = 420;

  let confineLayer = null;

  function bringConfineToFront() {
    if (confineLayer && map.hasLayer(confineLayer)) {
      confineLayer.bringToFront();
    }
  }

  function restackActiveLayers() {
    if (activeOverlay && map.hasLayer(activeOverlay)) {
      activeOverlay.bringToFront();
    }
    bringConfineToFront();
  }

  function createBasemapLayer(cfg) {
    if (cfg.type === "composite") {
      const group = L.layerGroup();
      (cfg.layers || []).forEach((sub) => {
        group.addLayer(createBasemapLayer(sub));
      });
      return group;
    }
    if (cfg.type === "wms") {
      return L.tileLayer.wms(cfg.url, {
        layers: cfg.layers,
        format: cfg.format || "image/png",
        transparent: cfg.transparent === true,
        version: cfg.version || "1.3.0",
        attribution: cfg.attribution || "",
        maxZoom: cfg.maxZoom ?? 19,
      });
    }
    return L.tileLayer(cfg.url, {
      attribution: cfg.attribution || "",
      maxZoom: cfg.maxZoom ?? 19,
    });
  }

  const basemaps = cfg.basemaps || [];
  let activeBasemap = null;
  const basemapLayers = basemaps.map((b) => ({
    cfg: b,
    layer: createBasemapLayer(b),
  }));

  basemapLayers.forEach(({ cfg, layer }) => {
    if (cfg.default) {
      layer.addTo(map);
      activeBasemap = layer;
    }
  });

  if (!activeBasemap && basemapLayers.length) {
    const first = basemapLayers[0];
    first.layer.addTo(map);
    activeBasemap = first.layer;
  }

  const basemapSelect = document.getElementById("basemap-select");
  if (basemapSelect && basemapLayers.length) {
    basemapSelect.innerHTML = "";
    basemapLayers.forEach(({ cfg }, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = cfg.title || cfg.id || `Sfondo ${index + 1}`;
      if (cfg.default || (!basemaps.some((b) => b.default) && index === 0)) {
        option.selected = true;
      }
      basemapSelect.appendChild(option);
    });

    basemapSelect.addEventListener("change", () => {
      const index = parseInt(basemapSelect.value, 10);
      const next = basemapLayers[index];
      if (!next || next.layer === activeBasemap) return;
      if (activeBasemap) map.removeLayer(activeBasemap);
      next.layer.addTo(map);
      activeBasemap = next.layer;
      restackActiveLayers();
    });
  }

  const defaultOpacity = cfg.defaultOpacity ?? overlays[0]?.opacity ?? 0.85;
  const opacityInput = document.getElementById("opacity");
  const opacityValue = document.getElementById("opacity-value");
  opacityInput.value = String(defaultOpacity);
  if (opacityValue) {
    opacityValue.textContent = `${Math.round(defaultOpacity * 100)}%`;
  }

  const pugChoices = [];
  let layerPanel = null;
  let applyingHash = false;

  function findChoiceById(layerId) {
    if (!layerId) return null;
    const key = canonicalLayerId({ id: layerId });
    return (
      pugChoices.find((c) => canonicalLayerId(c.cfg) === key) ||
      pugChoices.find((c) => c.label === layerId) ||
      null
    );
  }

  function syncLayerHash(layerCfg, { replace = false } = {}) {
    const next = layerHashUrl(layerCfg);
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (!layerCfg && !location.hash) return;
    if (layerCfg && current === next) return;
    const state = { layerId: layerCfg ? canonicalLayerId(layerCfg) : null };
    if (replace) {
      history.replaceState(state, "", next);
    } else {
      history.pushState(state, "", next);
    }
  }

  function applyLayerFromHash() {
    const layerId = parseLayerHash();
    const activeId = activeOverlay
      ? canonicalLayerId(pugChoices.find((c) => c.layer === activeOverlay)?.cfg || {})
      : null;
    if (layerId === activeId || (!layerId && !activeOverlay)) return;

    applyingHash = true;
    try {
      if (!layerId) {
        selectPugOverlay(null, null);
        return;
      }
      const choice = findChoiceById(layerId);
      if (choice) {
        selectPugOverlay(choice.layer, choice.cfg);
      } else {
        console.warn("Tavola non trovata nel fragment URL:", layerId);
      }
    } finally {
      applyingHash = false;
    }
  }

  function registerPugChoice(layer, label, layerCfg) {
    const key = layerCfg?.id ? canonicalLayerId(layerCfg) : label;
    const existing = pugChoices.find((c) =>
      c.cfg?.id ? canonicalLayerId(c.cfg) === key : c.label === label
    );
    if (existing) return existing;

    exclusiveLayers.add(layer);
    const choice = {
      layer,
      label,
      cfg: layerCfg,
      section: layerCfg?.section || "altro",
    };
    pugChoices.push(choice);
    if (layerCfg?.bounds) {
      overlayRefs.push({ layer, cfg: layerCfg, label });
    }
    if (layerPanel) {
      layerPanel.render();
    }
    return choice;
  }

  const legendZoom = initLegendZoom();

  function relayoutMap() {
    requestAnimationFrame(() => {
      map.invalidateSize();
      requestAnimationFrame(() => map.invalidateSize());
    });
  }

  function setLegendLayoutVisible(visible) {
    const layout = document.querySelector(".map-layout");
    if (layout) {
      layout.classList.toggle("map-layout--with-legend", visible);
    }
    relayoutMap();
  }

  function updateLegendPanel(layer, layerCfg) {
    const panel = document.getElementById("legend-panel");
    const viewport = document.getElementById("legend-viewport");
    const img = document.getElementById("legend-image");
    const empty = document.getElementById("legend-empty");
    const nameEl = document.getElementById("legend-layer-name");
    if (!panel || !img) return;

    if (!layer || !layerCfg?.legendUrl) {
      panel.hidden = true;
      img.hidden = true;
      img.removeAttribute("src");
      img.dataset.legendUrl = "";
      if (viewport) viewport.hidden = true;
      if (empty) empty.hidden = true;
      if (nameEl) nameEl.textContent = "";
      setLegendLayoutVisible(false);
      return;
    }

    panel.hidden = false;
    setLegendLayoutVisible(true);
    if (viewport) viewport.hidden = false;
    if (nameEl) nameEl.textContent = layerCfg.title || layerCfg.id || "";
    img.hidden = false;
    if (empty) empty.hidden = true;

    const nextUrl = layerCfg.legendUrl;
    const urlChanged = img.dataset.legendUrl !== nextUrl;

    if (urlChanged) {
      img.dataset.legendUrl = nextUrl;
      img.onerror = () => {
        if (img.dataset.legendUrl !== nextUrl) return;
        img.hidden = true;
        if (viewport) viewport.hidden = true;
        if (empty) empty.hidden = false;
        panel.hidden = true;
        setLegendLayoutVisible(false);
      };
      img.alt = `Legenda: ${layerCfg.title || layerCfg.id || "tavola"}`;
      img.src = nextUrl;
      if (img.complete) legendZoom.fit();
    } else if (img.complete) {
      legendZoom.reflow();
    }
  }

  function updateMapDescription(layerCfg) {
    const desc = document.getElementById("map-desc");
    if (!desc) return;
    if (layerCfg) {
      desc.textContent = `Tavola attiva: ${layerCfg.title || layerCfg.id || ""}`;
    } else {
      desc.innerHTML =
        "Scegli una tavola con il pulsante <strong>Tavole</strong> in alto a destra sulla mappa.";
    }
  }

  function mapFitPadding() {
    // Sidebars (legenda, Tavole) are outside #map via CSS grid — only UI margin here.
    return {
      paddingTopLeft: L.point(24, 24),
      paddingBottomRight: L.point(24, 24),
    };
  }

  function boundsForFit(layerCfg) {
    if (layerCfg?.bounds) {
      return L.latLngBounds(layerCfg.bounds);
    }
    return confineLayer?.getBounds() ?? null;
  }

  function fitMapToView(layerCfg) {
    const bounds = boundsForFit(layerCfg);
    if (!bounds) {
      if (cfg.center) {
        map.setView(cfg.center, initialZoom);
      }
      return;
    }
    map.fitBounds(bounds, {
      maxZoom: mapMaxZoom,
      ...mapFitPadding(),
    });
  }

  function scheduleMapFit(layerCfg) {
    requestAnimationFrame(() => {
      map.invalidateSize();
      requestAnimationFrame(() => {
        map.invalidateSize();
        fitMapToView(layerCfg);
        if (layerCfg?.legendUrl) {
          legendZoom.fit();
        }
      });
    });
  }

  function selectPugOverlay(layer, layerCfg, { replaceHash = false } = {}) {
    exclusiveLayers.forEach((other) => {
      if (map.hasLayer(other)) map.removeLayer(other);
    });

    activeOverlay = null;
    if (layer) {
      layer.addTo(map);
      activeOverlay = layer;
      if (layer.setOpacity) {
        layer.setOpacity(parseFloat(opacityInput.value));
      }
      layerPanel?.dismissHint();
    } else {
      layerPanel?.showHint();
    }

    if (layerPanel) {
      layerPanel.setSelectedPug(layer);
    }
    updateLegendPanel(layer, layerCfg);
    updateMapDescription(layerCfg);
    restackActiveLayers();
    scheduleMapFit(layerCfg);
    if (!applyingHash) {
      syncLayerHash(layerCfg, { replace: replaceHash });
    }
  }

  const sortedOverlays = [...overlays].sort((a, b) =>
    (a.title || "").localeCompare(b.title || "", "it", { sensitivity: "base" })
  );

  sortedOverlays.forEach((o) => {
    const scheme = o.scheme || "xyz";
    const nativeMax = o.maxZoom ?? overlayMaxNativeZoom;
    const layerOpacity = o.opacity ?? defaultOpacity;
    const layer = L.tileLayer(o.url, {
      pane: "pugOverlay",
      minZoom: o.minZoom ?? mapMinZoom,
      maxNativeZoom: nativeMax,
      maxZoom: mapMaxZoom,
      opacity: layerOpacity,
      bounds: o.bounds ? L.latLngBounds(o.bounds) : undefined,
      tms: scheme === "tms",
    });
    const label = o.title || o.id;
    registerPugChoice(layer, label, o);
  });

  layerPanel = new LayerPanel(pugChoices, selectPugOverlay, () => {
    relayoutMap();
  });

  const confineCfg = (cfg.vectors || []).find((v) => v.id === "confine");

  const confineToggle = document.getElementById("confine-toggle");
  const confineDefaultVisible = confineCfg?.visible !== false;

  function setConfineVisible(visible) {
    if (!confineLayer) return;
    if (visible) {
      confineLayer.addTo(map);
      confineLayer.bringToFront();
    } else {
      map.removeLayer(confineLayer);
    }
  }

  if (confineCfg) {
    try {
      const confineRes = await fetch(confineCfg.url);
      const geojson = await confineRes.json();
      confineLayer = L.geoJSON(geojson, {
        pane: "confine",
        style: confineCfg.style || { color: "#1d4ed8", weight: 2, fillOpacity: 0.05 },
        onEachFeature: (feature, lyr) => {
          const props = feature.properties || {};
          const html = Object.entries(props)
            .map(([k, val]) => `<strong>${k}</strong>: ${val}`)
            .join("<br>");
          if (html) lyr.bindPopup(html);
        },
      });
      if (confineToggle) {
        confineToggle.checked = confineDefaultVisible;
        confineToggle.addEventListener("change", () => {
          setConfineVisible(confineToggle.checked);
        });
      }
      if (confineDefaultVisible) {
        setConfineVisible(true);
      }
    } catch (err) {
      console.warn("Confine load failed:", confineCfg.url, err);
      if (confineToggle) confineToggle.disabled = true;
    }
  } else if (confineToggle) {
    confineToggle.disabled = true;
  }

  const hashLayerId = parseLayerHash();
  const hashChoice = hashLayerId ? findChoiceById(hashLayerId) : null;

  if (hashChoice) {
    selectPugOverlay(hashChoice.layer, hashChoice.cfg, { replaceHash: true });
  } else {
    selectPugOverlay(null, null, { replaceHash: true });
  }

  window.addEventListener("hashchange", applyLayerFromHash);
  window.addEventListener("popstate", applyLayerFromHash);

  window.addEventListener("resize", () => {
    relayoutMap();
    legendZoom.reflow();
  });

  map.on("mousemove", (e) => {
    document.getElementById("coords").textContent =
      `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
  });

  opacityInput.addEventListener("input", (ev) => {
    const value = parseFloat(ev.target.value);
    if (opacityValue) {
      opacityValue.textContent = `${Math.round(value * 100)}%`;
    }
    if (activeOverlay?.setOpacity) {
      activeOverlay.setOpacity(value);
    }
  });
}

init();
