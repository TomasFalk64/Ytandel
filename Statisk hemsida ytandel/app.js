const elFile = document.getElementById("file");
const elAnalyze = document.getElementById("analyze");
const elDownload = document.getElementById("download");
const elStatus = document.getElementById("status");
const elTableBody = document.querySelector("#table tbody");
const elPreview = document.getElementById("preview");
const ctxPreview = elPreview.getContext("2d");
const elPasteZone = document.getElementById("pasteZone");


let selectedFile = null;
let downloadUrl = null;

elPasteZone?.addEventListener("paste", async (e) => {
  const file = getImageFileFromPaste(e);
  if (!file) {
    setStatus("Ingen bild hittades i urklipp. Prova att ta en skärmdump och klistra in igen.");
    return;
  }

  setStatus("Skärmdump mottagen. Analyserar...");
  clearTable();
  disableDownload();

  try {
    const img = await loadImageFromFile(file);
    const result = analyzeAndRender(img, "skarmdump");
    renderTable(result.rows);
    setStatus("Klart. Förhandsvisning uppdaterad.");
    enableDownload(result.blob, result.outName);
  } catch (err) {
    console.error(err);
    setStatus("Fel: kunde inte analysera den inklistrade bilden.");
  }
});

elFile.addEventListener("change", () => {
  selectedFile = elFile.files?.[0] ?? null;
  elAnalyze.disabled = !selectedFile;
  setStatus(selectedFile ? `Vald fil: ${selectedFile.name}` : "Ingen fil vald.");
  clearTable();
  disableDownload();
  clearCanvas();
});

elAnalyze.addEventListener("click", async () => {
  if (!selectedFile) return;
  setStatus("Analyserar...");
  clearTable();
  disableDownload();

  try {
    const img = await loadImageFromFile(selectedFile);
    const result = analyzeAndRender(img, selectedFile.name);
    renderTable(result.rows);
    setStatus("Klart. Förhandsvisning uppdaterad.");
    enableDownload(result.blob, result.outName);
  } catch (e) {
    console.error(e);
    setStatus("Fel: kunde inte analysera bilden.");
  }
});

function setStatus(text) {
  elStatus.textContent = text;
}

function clearCanvas() {
  elPreview.width = 1;
  elPreview.height = 1;
  ctxPreview.clearRect(0, 0, elPreview.width, elPreview.height);
}

function clearTable() {
  elTableBody.innerHTML = "";
}

function disableDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  elDownload.href = "#";
  elDownload.classList.add("disabled");
  elDownload.removeAttribute("download");
  elDownload.textContent = "Ladda ner resultatbild";
}

function enableDownload(blob, outName) {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);
  elDownload.href = downloadUrl;
  elDownload.download = outName;
  elDownload.classList.remove("disabled");
  elDownload.textContent = `Ladda ner ${outName}`;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

function analyzeAndRender(img, originalName) {
  // Rita originalet på en "arbetscanvas" och läs pixlar
  const work = document.createElement("canvas");
  work.width = img.naturalWidth;
  work.height = img.naturalHeight;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.drawImage(img, 0, 0);

  const { width, height } = work;
  const imageData = wctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const totalPixlar = width * height;

  // Maskräknare
  let pRosa = 0, pMellan = 0, pMork = 0, pGron = 0;

  // Output-färger (samma som Python kontrollbild)
  const C_ROSA = [222, 77, 131];
  const C_MELLAN = [167, 47, 163];
  const C_MORK = [84, 23, 111];
  const C_GRON = [34, 139, 34];

  // Pixelvis klassning: Översatt från Andel_naturvarde.py masklogik :contentReference[oaicite:2]{index=2}
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];

    // --- DIN MASK-LOGIK (Bevarad exakt) ---
    const temp_gron = (G > R) && (G > B) && (G > 120);
    const temp_rosa = (R > 130) && (R > G + 40) && (R > B);
    const temp_mellan = (R > 130) && (B > 130) && (Math.abs(R - B) < 40) && (R > G + 60);
    const temp_mork = (B > 80) && (B > G + 40) && (B > R) && (R > G + 10);

    const mask_morklila = temp_mork;
    const mask_mellanlila = temp_mellan && !mask_morklila;
    const mask_rosa = temp_rosa && !mask_mellanlila && !mask_morklila;
    const mask_varda = mask_morklila || mask_mellanlila || mask_rosa;
    const mask_gron = temp_gron && !mask_varda;

    // Re-color + räkna
    if (mask_morklila) {
      pMork++;
      data[i] = C_MORK[0]; data[i + 1] = C_MORK[1]; data[i + 2] = C_MORK[2];
    } else if (mask_mellanlila) {
      pMellan++;
      data[i] = C_MELLAN[0]; data[i + 1] = C_MELLAN[1]; data[i + 2] = C_MELLAN[2];
    } else if (mask_rosa) {
      pRosa++;
      data[i] = C_ROSA[0]; data[i + 1] = C_ROSA[1]; data[i + 2] = C_ROSA[2];
    } else if (mask_gron) {
      pGron++;
      data[i] = C_GRON[0]; data[i + 1] = C_GRON[1]; data[i + 2] = C_GRON[2];
    } else {
      // lämna pixel oförändrad (bakgrund, UI, mm)
    }
  }

  const totalVarda = pMork + pMellan + pRosa;
  const totalSkog = totalVarda + pGron;

  // Skapa slutcanvas med ram + panel (likt Python skapa_kontrollbild) :contentReference[oaicite:3]{index=3}
  const ram = 10;
  const panelH = 280;

  const outW = width + ram * 2;
  const outH = height + panelH + ram;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;

  const octx = out.getContext("2d");
  // vit bakgrund
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, outW, outH);

  // maskad bild
  const masked = document.createElement("canvas");
  masked.width = width;
  masked.height = height;
  masked.getContext("2d").putImageData(imageData, 0, 0);
  octx.drawImage(masked, ram, ram);

  // Panel + tabell
  const startY = height + ram + 25;
  const col1 = 40 + ram;
  const col2 = Math.floor(outW * 0.45);
  const col3 = Math.floor(outW * 0.75);

  const fontSize = Math.max(16, Math.floor(width / 100));
  octx.fillStyle = "#000";
  octx.font = `700 ${fontSize + 4}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  octx.fillText(`Areaanalys: ${originalName}`, col1, startY);

  const headY = startY + fontSize + 15;
  octx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  octx.fillText("Kategori", col1, headY);
  octx.fillText("% av Skog", col2, headY);
  octx.fillText("% av Total", col3, headY);

  function sa(p, ref) {
    if (ref <= 0) return "0.00%";
    return (p / ref * 100).toFixed(2) + "%";
  }

  const rows = [
    ["Rosa (Potentiell kontinuitet)", sa(pRosa, totalSkog), sa(pRosa, totalPixlar)],
    ["Mellanlila (Naturvärde)", sa(pMellan, totalSkog), sa(pMellan, totalPixlar)],
    ["Mörklila (Höga naturvärden)", sa(pMork, totalSkog), sa(pMork, totalPixlar)],
    ["—".repeat(20), "—", "—"],
    ["TOTAL VÄRDEAREAL", sa(totalVarda, totalSkog), sa(totalVarda, totalPixlar)],
    ["TOTAL SKOGSMARK", "100.00%", sa(totalSkog, totalPixlar)],
  ];

  let y = headY + fontSize + 15;
  octx.font = `${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  for (const [t, v1, v2] of rows) {
    octx.fillText(t, col1, y);
    octx.fillText(v1, col2, y);
    octx.fillText(v2, col3, y);
    y += fontSize + 8;
  }

  // Förhandsvisning på sidan
  elPreview.width = outW;
  elPreview.height = outH;
  ctxPreview.clearRect(0, 0, outW, outH);
  ctxPreview.drawImage(out, 0, 0);

  // Blob för nedladdning
  const outName = `Areaanalys_${stripExt(originalName)}.png`;
  const blob = canvasToPngBlob(out);

  // För tabellen i UI (samma som i bilden)
  const uiRows = [
    { name: "Rosa (potentiell kontinuitet)", skog: pct(pRosa, totalSkog), total: pct(pRosa, totalPixlar) },
    { name: "Mellanlila (Naturvärde)", skog: pct(pMellan, totalSkog), total: pct(pMellan, totalPixlar) },
    { name: "Mörklila (Högsta värde)", skog: pct(pMork, totalSkog), total: pct(pMork, totalPixlar) },
    { name: "TOTAL VÄRDEAREAL", skog: pct(totalVarda, totalSkog), total: pct(totalVarda, totalPixlar), bold: true },
    { name: "TOTAL SKOGSMARK", skog: "100.0 %", total: pct(totalSkog, totalPixlar), bold: true },
  ];

  return { blob, outName, rows: uiRows };
}

function pct(p, ref) {
  if (ref <= 0) return "0.0 %";
  return (p / ref * 100).toFixed(1) + " %";
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, "");
}

function canvasToPngBlob(canvas) {
  // Synk-blob: toDataURL -> Blob
  const dataUrl = canvas.toDataURL("image/png");
  const [meta, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/png" });
}

function renderTable(rows) {
  elTableBody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    if (r.bold) tr.style.fontWeight = "700";
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.skog)}</td>
      <td>${escapeHtml(r.total)}</td>
    `;
    elTableBody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function getImageFileFromPaste(e) {
  const dt = e.clipboardData;
  if (!dt?.items) return null;

  for (const item of dt.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) return null;
      // Gör ett "File"-objekt så resten av koden kan återanvändas
      return new File([blob], "skarmdump.png", { type: blob.type || "image/png" });
    }
  }
  return null;
}


