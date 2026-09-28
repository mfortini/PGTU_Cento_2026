/* Editor ritaglio contenuto/legenda — PUG Cento */

const STORAGE_KEY = "pug-crop-editor-draft";
const SECTION_ORDER = ["cle", "strategia", "vincoli"];
const SECTION_LABELS = {
  cle: "CLE / MS",
  strategia: "Strategia",
  vincoli: "Vincoli",
};

const DEFAULT_CONTENT = { x: 0.05, y: 0.05, w: 0.7, h: 0.85 };
const DEFAULT_LEGEND = { x: 0.72, y: 0.65, w: 0.22, h: 0.28 };

let manifest = { layers: [] };
let crops = { version: 1, layers: {} };
let currentId = null;
let activeMode = "content";
let displaySize = { w: 0, h: 0 };

let dragState = null;

function cloneRect(r) {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

function rectValid(r) {
  return r && r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;
}

function layerComplete(id) {
  const e = crops.layers[id];
  return e && rectValid(e.content) && rectValid(e.legend);
}

function countComplete() {
  return manifest.layers.filter((l) => layerComplete(l.id)).length;
}

function persistDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) crops = JSON.parse(raw);
  } catch (_) {
    /* ignore */
  }
  crops.version = 1;
  crops.layers = crops.layers || {};
}

async function loadData() {
  const [mRes, cRes] = await Promise.all([
    fetch("editor/manifest.json"),
    fetch("data/crops.json"),
  ]);
  if (!mRes.ok) throw new Error("Manca editor/manifest.json — esegui generate_crop_previews.sh");
  manifest = await mRes.json();
  if (cRes.ok) {
    const serverCrops = await cRes.json();
    if (Object.keys(serverCrops.layers || {}).length) {
      crops = serverCrops;
    }
  }
  loadDraft();
}

function getLayerRects(id) {
  const entry = crops.layers[id] || {};
  return {
    content: entry.content ? cloneRect(entry.content) : cloneRect(DEFAULT_CONTENT),
    legend: entry.legend ? cloneRect(entry.legend) : cloneRect(DEFAULT_LEGEND),
  };
}

function saveCurrentLayer() {
  if (!currentId) return;
  const layer = manifest.layers.find((l) => l.id === currentId);
  const rects = getLayerRects(currentId);
  crops.layers[currentId] = {
    sourceTif: layer?.sourceTif || "",
    imageSize: layer?.imageSize || [],
    content: rects.content,
    legend: rects.legend,
    updatedAt: new Date().toISOString(),
  };
  persistDraft();
  renderSidebar();
  updateProgress();
}

function selectLayer(id) {
  if (currentId && currentId !== id) saveCurrentLayer();
  currentId = id;
  renderSidebar();
  renderCanvas();
  const layer = manifest.layers.find((l) => l.id === id);
  document.getElementById("current-layer-title").textContent = layer?.title || id;
}

function renderSidebar() {
  const root = document.getElementById("layer-sidebar");
  root.innerHTML = "";

  for (const section of SECTION_ORDER) {
    const items = manifest.layers.filter((l) => l.section === section);
    if (!items.length) continue;

    const group = document.createElement("div");
    group.className = "sidebar-group";
    const title = document.createElement("div");
    title.className = "sidebar-group-title";
    title.textContent = SECTION_LABELS[section] || section;
    group.appendChild(title);

    for (const layer of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "layer-btn" + (layer.id === currentId ? " active" : "");
      const label = document.createElement("span");
      label.textContent = layer.title;
      const badge = document.createElement("span");
      badge.className = "badge" + (layerComplete(layer.id) ? " done" : "");
      badge.textContent = layerComplete(layer.id) ? "OK" : "…";
      btn.appendChild(label);
      btn.appendChild(badge);
      btn.addEventListener("click", () => selectLayer(layer.id));
      group.appendChild(btn);
    }
    root.appendChild(group);
  }
}

function normToDisplay(rect) {
  return {
    left: rect.x * displaySize.w,
    top: rect.y * displaySize.h,
    width: rect.w * displaySize.w,
    height: rect.h * displaySize.h,
  };
}

function displayToNorm(left, top, width, height) {
  if (!displaySize.w || !displaySize.h) return { x: 0, y: 0, w: 0.1, h: 0.1 };
  return {
    x: Math.max(0, Math.min(1, left / displaySize.w)),
    y: Math.max(0, Math.min(1, top / displaySize.h)),
    w: Math.max(0.01, Math.min(1, width / displaySize.w)),
    h: Math.max(0.01, Math.min(1, height / displaySize.h)),
  };
}

function clampNorm(rect) {
  rect.w = Math.max(0.01, Math.min(1 - rect.x, rect.w));
  rect.h = Math.max(0.01, Math.min(1 - rect.y, rect.h));
  rect.x = Math.max(0, Math.min(1 - rect.w, rect.x));
  rect.y = Math.max(0, Math.min(1 - rect.h, rect.y));
  return rect;
}

function applyRectToDom(el, rect) {
  const d = normToDisplay(rect);
  el.style.left = `${d.left}px`;
  el.style.top = `${d.top}px`;
  el.style.width = `${d.width}px`;
  el.style.height = `${d.height}px`;
}

function renderCanvas() {
  const wrap = document.getElementById("canvas-wrap");
  wrap.innerHTML = "";
  if (!currentId) {
    wrap.innerHTML = '<p class="placeholder">Seleziona un layer dalla lista.</p>';
    return;
  }

  const layer = manifest.layers.find((l) => l.id === currentId);
  if (!layer) return;

  const stage = document.createElement("div");
  stage.className = "preview-stage";

  const img = document.createElement("img");
  img.src = layer.previewUrl;
  img.alt = layer.title;
  img.onload = () => {
    displaySize = { w: img.clientWidth, h: img.clientHeight };
    updateRectPositions(stage);
  };
  stage.appendChild(img);

  const rects = getLayerRects(currentId);
  ["content", "legend"].forEach((kind) => {
    const el = document.createElement("div");
    el.className = `crop-rect ${kind}` + (kind === activeMode ? " active" : " inactive");
    el.dataset.kind = kind;
    const handle = document.createElement("div");
    handle.className = "handle";
    handle.dataset.kind = kind;
    el.appendChild(handle);
    applyRectToDom(el, rects[kind]);
    stage.appendChild(el);
  });

  wrap.appendChild(stage);
  bindRectEvents(stage);
}

function updateRectPositions(stage) {
  if (!currentId) return;
  const rects = getLayerRects(currentId);
  stage.querySelectorAll(".crop-rect").forEach((el) => {
    const kind = el.dataset.kind;
    applyRectToDom(el, rects[kind]);
    el.classList.toggle("active", kind === activeMode);
    el.classList.toggle("inactive", kind !== activeMode);
  });
}

function setActiveRects(kind, rect) {
  if (!currentId) return;
  if (!crops.layers[currentId]) {
    const layer = manifest.layers.find((l) => l.id === currentId);
    crops.layers[currentId] = {
      sourceTif: layer?.sourceTif,
      imageSize: layer?.imageSize,
      content: cloneRect(DEFAULT_CONTENT),
      legend: cloneRect(DEFAULT_LEGEND),
    };
  }
  crops.layers[currentId][kind] = clampNorm(cloneRect(rect));
}

function bindRectEvents(stage) {
  const onPointerDown = (e) => {
    const handle = e.target.closest(".handle");
    const rectEl = e.target.closest(".crop-rect");
    if (!rectEl) return;
    e.preventDefault();
    const kind = rectEl.dataset.kind;
    activeMode = kind;
    document.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === kind);
    });
    updateRectPositions(stage);

    const rects = getLayerRects(currentId);
    const norm = rects[kind];
    const d = normToDisplay(norm);
    const stageRect = stage.getBoundingClientRect();

    dragState = {
      kind,
      mode: handle ? "resize" : "move",
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...d },
      normOrig: cloneRect(norm),
      stageRect,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    let { left, top, width, height } = dragState.orig;

    if (dragState.mode === "move") {
      left += dx;
      top += dy;
      left = Math.max(0, Math.min(displaySize.w - width, left));
      top = Math.max(0, Math.min(displaySize.h - height, top));
    } else {
      width = Math.max(20, dragState.orig.width + dx);
      height = Math.max(20, dragState.orig.height + dy);
      if (left + width > displaySize.w) width = displaySize.w - left;
      if (top + height > displaySize.h) height = displaySize.h - top;
    }

    const norm = displayToNorm(left, top, width, height);
    clampNorm(norm);
    setActiveRects(dragState.kind, norm);
    const el = stage.querySelector(`.crop-rect[data-kind="${dragState.kind}"]`);
    if (el) applyRectToDom(el, norm);
  };

  const onPointerUp = () => {
    dragState = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    persistDraft();
    renderSidebar();
    updateProgress();
  };

  stage.addEventListener("pointerdown", onPointerDown);
}

function updateProgress() {
  const total = manifest.layers.length;
  const done = countComplete();
  document.getElementById("progress-label").textContent = `${done}/${total} completi`;
}

function nextLayer() {
  if (!currentId) {
    if (manifest.layers.length) selectLayer(manifest.layers[0].id);
    return;
  }
  saveCurrentLayer();
  const idx = manifest.layers.findIndex((l) => l.id === currentId);
  const next = manifest.layers[(idx + 1) % manifest.layers.length];
  selectLayer(next.id);
}

async function saveToServer() {
  saveCurrentLayer();
  const res = await fetch("/api/crops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(crops),
  });
  if (!res.ok) {
    alert("Salvataggio server fallito. Usa Esporta JSON oppure avvia crop_editor_server.py");
    return;
  }
  alert("Salvato in data/crops.json");
}

function exportJson() {
  saveCurrentLayer();
  const blob = new Blob([JSON.stringify(crops, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "crops.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      crops = JSON.parse(reader.result);
      crops.version = 1;
      crops.layers = crops.layers || {};
      persistDraft();
      renderSidebar();
      updateProgress();
      if (currentId) renderCanvas();
      alert("Import completato");
    } catch (err) {
      alert("JSON non valido");
    }
  };
  reader.readAsText(file);
}

function bindUi() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeMode = btn.dataset.mode;
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
      if (currentId) renderCanvas();
    });
  });

  document.getElementById("btn-save-layer").addEventListener("click", () => {
    saveCurrentLayer();
    alert("Layer salvato in bozza locale");
  });
  document.getElementById("btn-next").addEventListener("click", nextLayer);
  document.getElementById("btn-save-server").addEventListener("click", saveToServer);
  document.getElementById("btn-export").addEventListener("click", exportJson);
  document.getElementById("import-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importJson(file);
    e.target.value = "";
  });

  window.addEventListener("resize", () => {
    if (currentId) renderCanvas();
  });
}

async function init() {
  bindUi();
  try {
    await loadData();
  } catch (err) {
    document.getElementById("canvas-wrap").innerHTML =
      `<p class="placeholder">${err.message}</p>`;
    return;
  }
  renderSidebar();
  updateProgress();
  if (manifest.layers.length) selectLayer(manifest.layers[0].id);
}

init();
