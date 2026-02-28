const elFile = document.getElementById("file");
const elPasteZone = document.getElementById("pasteZone");
const elDownload = document.getElementById("download");
const elStatus = document.getElementById("status");
const elTableBody = document.querySelector("#table tbody");
const elPreview = document.getElementById("preview");
const ctxPreview = elPreview.getContext("2d");

const elTol = document.getElementById("tol");
const elTolVal = document.getElementById("tolVal");
const elCalibStart = document.getElementById("calibStart");
const elCalibDone = document.getElementById("calibDone");
const elCalibClear = document.getElementById("calibClear");
const elCalibStatus = document.getElementById("calibStatus");
const elSwRosa = document.getElementById("swRosa");
const elSwMellan = document.getElementById("swMellan");
const elSwMork = document.getElementById("swMork");
const elSwGron = document.getElementById("swGron");
const elCalibPicks = document.querySelectorAll(".calibPick");

let downloadUrl = null;
let lowTol = Number(elTol?.value ?? 20);
let currentSource = null;
let isCalibrating = false;
let pendingCalibration = {};
let activeCalibration = null;
let selectedCalibrationKey = null;

const CALIBRATION_KEY = "ytandel.calibration.v1";
const CALIBRATION_ORDER = ["rosa", "mellan", "mork", "gron"];
const CALIBRATION_LABELS = {
  rosa: "Rosa",
  mellan: "Mellanlila",
  mork: "Mörklila",
  gron: "Grön",
};
const DEFAULT_REF_LOW = {
  rosa: [85, 62, 62],
  mellan: [73, 55, 67],
  mork: [58, 51, 58],
  gron: [82, 93, 72],
};

activeCalibration = loadCalibration();
updateCalibrationUI();

if (elTol && elTolVal) {
  elTolVal.textContent = String(lowTol);
  elTol.addEventListener("input", () => {
    lowTol = Number(elTol.value);
    elTolVal.textContent = String(lowTol);
    if (currentSource && !isCalibrating) {
      runAnalysisFromCurrent();
    }
  });
}

elCalibStart?.addEventListener("click", startCalibration);
elCalibDone?.addEventListener("click", finishCalibration);
elCalibClear?.addEventListener("click", () => {
  const hasSomethingToClear = hasCalibration(activeCalibration) || hasCalibration(pendingCalibration);
  if (!hasSomethingToClear) return;
  if (!window.confirm("Rensa kalibrering för aktuell bild?")) return;

  activeCalibration = null;
  pendingCalibration = {};
  isCalibrating = false;
  selectedCalibrationKey = null;
  clearSavedCalibration();
  updateCalibrationUI();
  if (currentSource) runAnalysisFromCurrent();
});
elCalibPicks.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!isCalibrating) return;
    selectedCalibrationKey = btn.dataset.calibKey || null;
    updateCalibrationUI();
    if (selectedCalibrationKey) {
      setCalibrationStatus(`Vald färg: ${CALIBRATION_LABELS[selectedCalibrationKey]}. Klicka sedan i bilden.`);
    }
  });
});
elPreview?.addEventListener("click", onPreviewClick);

/* =======================
   INPUT: FILVAL (AUTO)
======================= */
elFile?.addEventListener("change", async () => {
  const file = elFile.files?.[0] ?? null;

  if (!file) {
    setStatus("Ingen fil vald.");
    clearTable();
    disableDownload();
    clearCanvas();
    currentSource = null;
    isCalibrating = false;
    pendingCalibration = {};
    selectedCalibrationKey = null;
    updateCalibrationUI();
    return;
  }

  await runAnalysisFromFile(file, file.name);
});

/* =======================
   INPUT: PASTE (AUTO)
======================= */
elPasteZone?.addEventListener("paste", async (e) => {
  const file = getImageFileFromPaste(e);
  if (!file) {
    setStatus("Ingen bild hittades i urklipp.");
    return;
  }
  await runAnalysisFromFile(file, file.name);
});

/* =======================
   HUVUDFUNKTION
======================= */
async function runAnalysisFromFile(file, nameForOutput) {
  setStatus("Analyserar...");
  clearTable();
  disableDownload();

  try {
    const img = await loadImageFromFile(file);
    activeCalibration = null;
    clearSavedCalibration();
    isCalibrating = false;
    pendingCalibration = {};
    selectedCalibrationKey = null;
    updateCalibrationUI();
    currentSource = buildSourceData(img, nameForOutput);
    const result = analyzeAndRender(currentSource.img, currentSource.name);

    renderTable(result.rows);
    setStatus(makeDoneStatus(result.profileName));
    enableDownload(result.blob, result.outName);
  } catch (err) {
    console.error(err);
    setStatus("Fel: kunde inte analysera bilden. (Se Console för detaljer.)");
  }
}

/* =======================
   LÄS BILD
======================= */
function runAnalysisFromCurrent() {
  if (!currentSource) return;
  const result = analyzeAndRender(currentSource.img, currentSource.name);
  renderTable(result.rows);
  setStatus(makeDoneStatus(result.profileName));
  enableDownload(result.blob, result.outName);
}

function buildSourceData(img, name) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cctx = c.getContext("2d", { willReadFrequently: true });
  cctx.drawImage(img, 0, 0);
  const sourceImageData = cctx.getImageData(0, 0, c.width, c.height);

  return {
    img,
    name,
    width: c.width,
    height: c.height,
    sourcePixels: sourceImageData.data,
  };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

/* =======================
   PASTE → FILE
======================= */
function getImageFileFromPaste(e) {
  const dt = e.clipboardData;
  if (!dt?.items) return null;

  for (const item of dt.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) return null;
      return new File([blob], "skarmdump.png", { type: blob.type || "image/png" });
    }
  }
  return null;
}

/* =======================
   ANALYS + RENDERING
======================= */
function analyzeAndRender(img, originalName) {
  // Rita originalet på arbetscanvas
  const work = document.createElement("canvas");
  work.width = img.naturalWidth;
  work.height = img.naturalHeight;

  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.drawImage(img, 0, 0);

  const { width, height } = work;
  const imageData = wctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Avgör profil först, sen skriv status
  const profile = detectContrastProfile(data);
  const usingCalibration = hasCalibration(activeCalibration);
  setStatus(`Analyserar... Profil: ${profile === "HIGH" ? "hög" : "låg"}${usingCalibration ? " (kalibrerad)" : ""}.`);

  const totalPixlar = width * height;

  // Räknare
  let pRosa = 0,
    pMellan = 0,
    pMork = 0,
    pGron = 0;

  // Kontrollfärger (resultatbildens färger)
  const C_ROSA = [222, 77, 131];
  const C_MELLAN = [167, 47, 163];
  const C_MORK = [84, 23, 111];
  const C_GRON = [34, 139, 34];

  if (profile === "HIGH" && !usingCalibration) {
    // =========================
    // GAMLA HÖGKONTRAST-LOOPEN
    // =========================
    for (let i = 0; i < data.length; i += 4) {
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];

      const temp_gron = G > R && G > B && G > 120;
      const temp_rosa = R > 130 && R > G + 40 && R > B;
      const temp_mellan = R > 130 && B > 130 && Math.abs(R - B) < 40 && R > G + 60;
      const temp_mork = B > 80 && B > G + 40 && B > R && R > G + 10;

      const mask_mork = temp_mork;
      const mask_mellan = temp_mellan && !mask_mork;
      const mask_rosa = temp_rosa && !mask_mellan && !mask_mork;
      const mask_varda = mask_mork || mask_mellan || mask_rosa;
      const mask_gron = temp_gron && !mask_varda;

      if (mask_mork) {
        pMork++;
        data[i] = C_MORK[0];
        data[i + 1] = C_MORK[1];
        data[i + 2] = C_MORK[2];
      } else if (mask_mellan) {
        pMellan++;
        data[i] = C_MELLAN[0];
        data[i + 1] = C_MELLAN[1];
        data[i + 2] = C_MELLAN[2];
      } else if (mask_rosa) {
        pRosa++;
        data[i] = C_ROSA[0];
        data[i + 1] = C_ROSA[1];
        data[i + 2] = C_ROSA[2];
      } else if (mask_gron) {
        pGron++;
        data[i] = C_GRON[0];
        data[i + 1] = C_GRON[1];
        data[i + 2] = C_GRON[2];
      }
    }
  } else {
    // =========================
    // NY LÅGKONTRAST-LOOP
    // =========================
    const REF = usingCalibration ? getEffectiveRef(activeCalibration) : DEFAULT_REF_LOW;

    const TOL = lowTol; // sliderstyrd tolerans

    for (let i = 0; i < data.length; i += 4) {
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];

      // valfritt skydd mot nästan-vitt/svart UI
      const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (lum < 15 || lum > 245) continue;

      const dR = rgbDist(R, G, B, ...REF.rosa);
      const dM = rgbDist(R, G, B, ...REF.mellan);
      const dK = rgbDist(R, G, B, ...REF.mork);
      const dG = rgbDist(R, G, B, ...REF.gron);

      const distances = [
        ["rosa", dR],
        ["mellan", dM],
        ["mork", dK],
        ["gron", dG],
      ].sort((a, b) => a[1] - b[1]);

      const best = distances[0][0];
      const bestD = distances[0][1];

      if (bestD > TOL) continue;

      if (best === "mork") {
        pMork++;
        data[i] = C_MORK[0];
        data[i + 1] = C_MORK[1];
        data[i + 2] = C_MORK[2];
      } else if (best === "mellan") {
        pMellan++;
        data[i] = C_MELLAN[0];
        data[i + 1] = C_MELLAN[1];
        data[i + 2] = C_MELLAN[2];
      } else if (best === "rosa") {
        pRosa++;
        data[i] = C_ROSA[0];
        data[i + 1] = C_ROSA[1];
        data[i + 2] = C_ROSA[2];
      } else if (best === "gron") {
        pGron++;
        data[i] = C_GRON[0];
        data[i + 1] = C_GRON[1];
        data[i + 2] = C_GRON[2];
      }
    }
  }

  const totalVarda = pMork + pMellan + pRosa;
  const totalSkog = totalVarda + pGron;

  // ===== Resultatcanvas med minbredd + vit marginal =====
  const ram = 10;
  const panelH = 280;
  const MIN_OUT_W = 900;

  const outW = Math.max(width + ram * 2, MIN_OUT_W);
  const outH = height + panelH + ram;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;

  const octx = out.getContext("2d");

  // vit bakgrund
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, outW, outH);

  // centrera bilden horisontellt
  const imgX = Math.floor((outW - width) / 2);
  const imgY = ram;

  // maskad bild
  const masked = document.createElement("canvas");
  masked.width = width;
  masked.height = height;
  masked.getContext("2d").putImageData(imageData, 0, 0);
  octx.drawImage(masked, imgX, imgY);

  // ===== Tabell: alltid 3 kolumner =====
  const padX = 24;
  const leftX = padX;
  const rightX = outW - padX;

  const fontSize = clamp(Math.round(outW / 70), 12, 18);
  const titleSize = clamp(fontSize + 4, 14, 22);

  const startY = height + ram + 28;

  octx.fillStyle = "#000";
  octx.font = `700 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  octx.fillText(`Areaanalys: ${originalName}`, leftX, startY);

  const headY = startY + titleSize + 14;

  const col3Right = rightX;
  const col2Right = Math.floor(outW * 0.70);
  const col1Left = leftX;

  octx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  octx.fillText("Kategori", col1Left, headY);
  drawRightText(octx, "% av Skog", col2Right, headY);
  drawRightText(octx, "% av Total", col3Right, headY);

  let y = headY + fontSize + 10;
  octx.strokeStyle = "#111";
  octx.lineWidth = 1;
  octx.beginPath();
  octx.moveTo(leftX, y);
  octx.lineTo(rightX, y);
  octx.stroke();
  y += fontSize * 1.6;

  function sa(p, ref) {
    if (ref <= 0) return "0.0%";
    return (p / ref * 100).toFixed(1) + "%";
  }

  const rows = [
    { t: "Rosa (Potentiell kontinuitet)", sk: sa(pRosa, totalSkog), to: sa(pRosa, totalPixlar), sum: false },
    { t: "Mellanlila (Naturvärde)", sk: sa(pMellan, totalSkog), to: sa(pMellan, totalPixlar), sum: false },
    { t: "Mörklila (Höga naturvärden)", sk: sa(pMork, totalSkog), to: sa(pMork, totalPixlar), sum: false },
    { t: "TOTAL VÄRDEAREAL", sk: sa(totalVarda, totalSkog), to: sa(totalVarda, totalPixlar), sum: true },
    { t: "TOTAL SKOGSMARK", sk: "100.0%", to: sa(totalSkog, totalPixlar), sum: true },
  ];

  const maxCatW = (col2Right - 18) - col1Left;

  for (const r of rows) {
    if (r.t === "TOTAL VÄRDEAREAL") {
      const yy = y - Math.floor(fontSize * 0.4);
      octx.beginPath();
      octx.moveTo(leftX, yy);
      octx.lineTo(rightX, yy);
      octx.stroke();
      y += fontSize * 1.6;
    }

    octx.font = `${r.sum ? "700 " : ""}${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;

    const cat = ellipsize(octx, r.t, maxCatW);
    octx.fillText(cat, col1Left, y);
    drawRightText(octx, r.sk, col2Right, y);
    drawRightText(octx, r.to, col3Right, y);

    y += fontSize + 10;
  }

  // Förhandsvisning
  elPreview.width = outW;
  elPreview.height = outH;
  ctxPreview.clearRect(0, 0, outW, outH);
  ctxPreview.drawImage(out, 0, 0);

  const outName = `Areaanalys_${stripExt(originalName)}.png`;
  const blob = canvasToBlob(out);

  const uiRows = rows.map((r) => ({ name: r.t, skog: r.sk, total: r.to }));

  return { blob, outName, rows: uiRows, profileName: profile };
}

/* =======================
   UI + DOWNLOAD
======================= */
function renderTable(rows) {
  if (!elTableBody) return;
  elTableBody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.skog)}</td><td>${escapeHtml(r.total)}</td>`;
    elTableBody.appendChild(tr);
  }
}

function enableDownload(blob, name) {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);
  elDownload.href = downloadUrl;
  elDownload.download = name;
  elDownload.classList.remove("disabled");
}

function disableDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  elDownload.href = "#";
  elDownload.classList.add("disabled");
}

function setStatus(text) {
  if (elStatus) {
    elStatus.textContent = text;
    return;
  }
  if (elCalibStatus && !isCalibrating) {
    elCalibStatus.textContent = text;
  }
}

function clearTable() {
  if (elTableBody) elTableBody.innerHTML = "";
}

function clearCanvas() {
  elPreview.width = 1;
  elPreview.height = 1;
  ctxPreview.clearRect(0, 0, 1, 1);
}

/* =======================
   HJÄLPFUNKTIONER
======================= */
function makeDoneStatus(profileName) {
  return `Klart. Profil: ${profileName === "HIGH" ? "hög" : "låg"}${hasCalibration(activeCalibration) ? " (kalibrerad)" : ""}.`;
}

function startCalibration() {
  if (!currentSource) {
    setCalibrationStatus("Ladda eller klistra in en bild först.");
    return;
  }

  isCalibrating = true;
  pendingCalibration = hasCalibration(activeCalibration) ? { ...activeCalibration } : {};
  selectedCalibrationKey = "rosa";
  disableDownload();
  renderSourcePreview(currentSource);
  setStatus("Kalibrering aktiv: välj färgruta och klicka i förhandsvisningen.");
  setCalibrationStatus(`Välj färg och klicka i bilden. Vald: ${CALIBRATION_LABELS[selectedCalibrationKey]}.`);
  updateCalibrationUI();
}

function finishCalibration() {
  if (!isCalibrating) return;
  const merged = { ...(hasCalibration(activeCalibration) ? activeCalibration : {}), ...pendingCalibration };
  if (!hasCalibration(merged)) {
    setCalibrationStatus("Ingen färg vald ännu. Välj minst en färg och klicka i bilden.");
    return;
  }
  activeCalibration = merged;
  pendingCalibration = {};
  isCalibrating = false;
  selectedCalibrationKey = null;
  saveCalibration(activeCalibration);
  updateCalibrationUI();
  setCalibrationStatus("Kalibrering sparad. Ej valda färger använder standardvärden.");
  if (currentSource) runAnalysisFromCurrent();
}

function onPreviewClick(e) {
  if (!isCalibrating || !currentSource) return;
  if (!selectedCalibrationKey) {
    setCalibrationStatus("Välj färgruta först, klicka sedan i bilden.");
    return;
  }

  const pos = toCanvasPos(e, elPreview);
  if (!pos) return;

  const x = Math.floor(pos.x);
  const y = Math.floor(pos.y);
  if (x < 0 || y < 0 || x >= currentSource.width || y >= currentSource.height) return;

  const idx = (y * currentSource.width + x) * 4;
  const ref = [
    currentSource.sourcePixels[idx],
    currentSource.sourcePixels[idx + 1],
    currentSource.sourcePixels[idx + 2],
  ];

  pendingCalibration[selectedCalibrationKey] = ref;
  updateCalibrationUI();
  const merged = { ...(hasCalibration(activeCalibration) ? activeCalibration : {}), ...pendingCalibration };
  const missing = CALIBRATION_ORDER.filter((k) => !isRgbTriplet(merged[k]));
  setCalibrationStatus(`Sparad ${CALIBRATION_LABELS[selectedCalibrationKey]}. ${missing.length ? `Kvar: ${missing.map((k) => CALIBRATION_LABELS[k]).join(", ")}. ` : ""}Klicka Färdig när du vill avsluta.`);
}

function renderSourcePreview(source) {
  elPreview.width = source.width;
  elPreview.height = source.height;
  ctxPreview.clearRect(0, 0, source.width, source.height);
  ctxPreview.drawImage(source.img, 0, 0);
}

function toCanvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function hasCalibration(ref) {
  return Boolean(ref && CALIBRATION_ORDER.some((k) => isRgbTriplet(ref[k])));
}

function isRgbTriplet(v) {
  return Array.isArray(v) && v.length === 3;
}

function getEffectiveRef(ref) {
  const out = { ...DEFAULT_REF_LOW };
  if (!ref) return out;
  for (const k of CALIBRATION_ORDER) {
    if (isRgbTriplet(ref[k])) out[k] = ref[k];
  }
  return out;
}

function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return hasCalibration(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveCalibration(ref) {
  try {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(ref));
  } catch {
    // Ignore storage failures.
  }
}

function clearSavedCalibration() {
  try {
    localStorage.removeItem(CALIBRATION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function setCalibrationStatus(text) {
  if (elCalibStatus) elCalibStatus.textContent = text;
}

function updateCalibrationUI() {
  const refs = hasCalibration(activeCalibration) ? activeCalibration : {};
  const draft = pendingCalibration;

  paintSwatch(elSwRosa, draft.rosa || refs.rosa);
  paintSwatch(elSwMellan, draft.mellan || refs.mellan);
  paintSwatch(elSwMork, draft.mork || refs.mork);
  paintSwatch(elSwGron, draft.gron || refs.gron);

  elCalibPicks.forEach((btn) => {
    const key = btn.dataset.calibKey;
    btn.classList.toggle("active", isCalibrating && key === selectedCalibrationKey);
  });

  if (elCalibClear) {
    const hasSomethingToClear = hasCalibration(activeCalibration) || hasCalibration(pendingCalibration);
    elCalibClear.disabled = !hasSomethingToClear;
  }

  if (isCalibrating) return;
  if (hasCalibration(activeCalibration)) {
    setCalibrationStatus("Kalibrering aktiv: sparade färger används i analysen.");
  } else {
    setCalibrationStatus("Ingen kalibrering aktiv.");
  }
}

function paintSwatch(el, rgb) {
  if (!el) return;
  if (!rgb) {
    el.style.backgroundColor = "#fff";
    return;
  }
  el.style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function detectContrastProfile(data) {
  let samples = 0;
  let spreadSum = 0;

  for (let i = 0; i < data.length; i += 160) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    spreadSum += (max - min);
    samples++;
  }

  const avgSpread = spreadSum / Math.max(1, samples);
  return avgSpread > 45 ? "HIGH" : "LOW";
}

function rgbDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function stripExt(name) {
  return String(name).replace(/\.[^.]+$/, "");
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function drawRightText(ctx, text, rightX, y) {
  const w = ctx.measureText(text).width;
  ctx.fillText(text, rightX - w, y);
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = "…";
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = text.slice(0, mid) + ell;
    if (ctx.measureText(t).width <= maxW) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, lo - 1)) + ell;
}

function canvasToBlob(canvas) {
  const dataUrl = canvas.toDataURL("image/png");
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/png" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}




