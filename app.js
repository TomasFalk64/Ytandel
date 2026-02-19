const elFile = document.getElementById("file");
const elPasteZone = document.getElementById("pasteZone");
const elDownload = document.getElementById("download");
const elStatus = document.getElementById("status");
const elTableBody = document.querySelector("#table tbody");
const elPreview = document.getElementById("preview");
const ctxPreview = elPreview.getContext("2d");

const elTol = document.getElementById("tol");
const elTolVal = document.getElementById("tolVal");

let downloadUrl = null;
let lowTol = Number(elTol?.value ?? 20);

if (elTol && elTolVal) {
  elTolVal.textContent = String(lowTol);
  elTol.addEventListener("input", () => {
    lowTol = Number(elTol.value);
    elTolVal.textContent = String(lowTol);
  });
}

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
    const result = analyzeAndRender(img, nameForOutput);

    renderTable(result.rows);
    setStatus(`Klart. Profil: ${result.profileName === "HIGH" ? "hög" : "låg"}.`);
    enableDownload(result.blob, result.outName);
  } catch (err) {
    console.error(err);
    setStatus("Fel: kunde inte analysera bilden. (Se Console för detaljer.)");
  }
}

/* =======================
   LÄS BILD
======================= */
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
  setStatus(`Analyserar... Profil: ${profile === "HIGH" ? "hög" : "låg"}.`);

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

  if (profile === "HIGH") {
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
    const REF = {
      rosa: [85, 62, 62],
      mellan: [73, 55, 67],
      mork: [58, 51, 58],
      gron: [82, 93, 72],
    };

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
  elStatus.textContent = text;
}

function clearTable() {
  elTableBody.innerHTML = "";
}

function clearCanvas() {
  elPreview.width = 1;
  elPreview.height = 1;
  ctxPreview.clearRect(0, 0, 1, 1);
}

/* =======================
   HJÄLPFUNKTIONER
======================= */
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
