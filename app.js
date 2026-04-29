import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs';

const state = {
  pdfBytes: null,
  pdfDoc: null,
  pageNum: 1,
  pageCount: 0,
  scale: 1.35,
  isDrawing: false,
  activeStroke: null,
  signatureDataUrl: null,
  selectedAnnoId: null,
  annotationsByPage: new Map(),
  adsEnabled: false,
};

const els = {
  pdfInput: document.getElementById('pdfInput'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),
  pageInfo: document.getElementById('pageInfo'),
  toolSelect: document.getElementById('toolSelect'),
  textInputWrap: document.getElementById('textInputWrap'),
  textInput: document.getElementById('textInput'),
  colorInput: document.getElementById('colorInput'),
  sizeInput: document.getElementById('sizeInput'),
  undoBtn: document.getElementById('undoBtn'),
  clearPageBtn: document.getElementById('clearPageBtn'),
  clearSignatureBtn: document.getElementById('clearSignatureBtn'),
  saveSignatureBtn: document.getElementById('saveSignatureBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  pdfCanvas: document.getElementById('pdfCanvas'),
  overlayCanvas: document.getElementById('overlayCanvas'),
  signaturePad: document.getElementById('signaturePad'),
  consentBanner: document.getElementById('consentBanner'),
  allowAdsBtn: document.getElementById('allowAdsBtn'),
  denyAdsBtn: document.getElementById('denyAdsBtn'),
  topAdContainer: document.getElementById('topAdContainer'),
  inlineAdContainer: document.getElementById('inlineAdContainer'),
  bottomAdContainer: document.getElementById('bottomAdContainer'),
};

const pdfCtx = els.pdfCanvas.getContext('2d');
const overlayCtx = els.overlayCanvas.getContext('2d');
const signCtx = els.signaturePad.getContext('2d');

setupSignaturePad();
initAdControls();
bindEvents();
refreshControls();

function bindEvents() {
  els.pdfInput.addEventListener('change', onPdfSelected);
  els.prevPageBtn.addEventListener('click', () => goToPage(state.pageNum - 1));
  els.nextPageBtn.addEventListener('click', () => goToPage(state.pageNum + 1));
  els.toolSelect.addEventListener('change', () => {
    state.selectedAnnoId = null;
    refreshControls();
    redrawOverlay();
  });
  els.undoBtn.addEventListener('click', undoCurrentPage);
  els.clearPageBtn.addEventListener('click', clearCurrentPage);
  els.clearSignatureBtn.addEventListener('click', clearSignaturePad);
  els.saveSignatureBtn.addEventListener('click', saveSignatureFromPad);
  els.downloadBtn.addEventListener('click', exportPdf);
  els.allowAdsBtn.addEventListener('click', () => setAdConsent(true));
  els.denyAdsBtn.addEventListener('click', () => setAdConsent(false));

  els.overlayCanvas.addEventListener('pointerdown', onOverlayPointerDown);
  els.overlayCanvas.addEventListener('pointermove', onOverlayPointerMove);
  window.addEventListener('pointerup', onOverlayPointerUp);
}

function initAdControls() {
  const storedConsent = localStorage.getItem('tableau_ad_consent');
  if (storedConsent === 'granted') {
    state.adsEnabled = true;
    loadAdProvider();
  } else if (storedConsent === 'denied') {
    state.adsEnabled = false;
  } else {
    els.consentBanner.classList.remove('hidden');
  }
  paintAdPlaceholders();
}

function setAdConsent(isAllowed) {
  state.adsEnabled = isAllowed;
  localStorage.setItem('tableau_ad_consent', isAllowed ? 'granted' : 'denied');
  els.consentBanner.classList.add('hidden');
  if (isAllowed) {
    loadAdProvider();
  } else {
    unloadAdProvider();
  }
  paintAdPlaceholders();
}

function paintAdPlaceholders() {
  const statusText = state.adsEnabled
    ? 'Ad slot ready for live ad network fill.'
    : 'Ads disabled. Slot reserved for contextual or direct ads.';
  [els.topAdContainer, els.inlineAdContainer, els.bottomAdContainer].forEach((container) => {
    if (container) container.textContent = statusText;
  });
}

function loadAdProvider() {
  if (document.querySelector('script[data-ad-provider=\"adsense\"]')) return;
  const clientId = window.TABLEAU_ADSENSE_CLIENT_ID || '';
  if (!clientId) return;

  const script = document.createElement('script');
  script.async = true;
  script.dataset.adProvider = 'adsense';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

function unloadAdProvider() {
  const existing = document.querySelector('script[data-ad-provider=\"adsense\"]');
  if (existing) existing.remove();
}

async function onPdfSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  state.pdfBytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
  state.pdfDoc = await loadingTask.promise;
  state.pageCount = state.pdfDoc.numPages;
  state.pageNum = 1;
  state.annotationsByPage = new Map();
  await renderCurrentPage();
  refreshControls();
}

function getCurrentPageAnnotations() {
  if (!state.annotationsByPage.has(state.pageNum)) {
    state.annotationsByPage.set(state.pageNum, []);
  }
  return state.annotationsByPage.get(state.pageNum);
}

async function goToPage(pageNum) {
  if (!state.pdfDoc || pageNum < 1 || pageNum > state.pageCount) return;
  state.pageNum = pageNum;
  state.selectedAnnoId = null;
  await renderCurrentPage();
  refreshControls();
}

async function renderCurrentPage() {
  if (!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(state.pageNum);
  const viewport = page.getViewport({ scale: state.scale });

  els.pdfCanvas.width = viewport.width;
  els.pdfCanvas.height = viewport.height;
  els.overlayCanvas.width = viewport.width;
  els.overlayCanvas.height = viewport.height;

  await page.render({ canvasContext: pdfCtx, viewport }).promise;
  redrawOverlay();
}

function redrawOverlay() {
  overlayCtx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
  const annos = getCurrentPageAnnotations();

  for (const anno of annos) {
    if (anno.type === 'text') {
      overlayCtx.fillStyle = anno.color;
      overlayCtx.font = `${anno.size}px sans-serif`;
      overlayCtx.fillText(anno.text, anno.x, anno.y);
    }

    if (anno.type === 'stroke') {
      overlayCtx.beginPath();
      overlayCtx.lineWidth = anno.size;
      overlayCtx.lineCap = 'round';
      overlayCtx.strokeStyle = anno.color;
      anno.points.forEach((pt, i) => {
        if (i === 0) overlayCtx.moveTo(pt.x, pt.y);
        else overlayCtx.lineTo(pt.x, pt.y);
      });
      overlayCtx.stroke();
    }

    if (anno.type === 'signature' && anno.image) {
      const img = new Image();
      img.src = anno.image;
      img.onload = () => overlayCtx.drawImage(img, anno.x, anno.y, anno.width, anno.height);
    }

    if (state.selectedAnnoId === anno.id) {
      overlayCtx.strokeStyle = '#0ea5e9';
      overlayCtx.lineWidth = 2;
      overlayCtx.strokeRect(anno.x - 6, anno.y - 6, (anno.width || 120) + 12, (anno.height || 30) + 12);
    }
  }
}

function getCanvasPoint(ev, canvas = els.overlayCanvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width),
    y: (ev.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function onOverlayPointerDown(ev) {
  if (!state.pdfDoc) return;
  const tool = els.toolSelect.value;
  const p = getCanvasPoint(ev);
  const annos = getCurrentPageAnnotations();

  if (tool === 'text') {
    const text = els.textInput.value.trim();
    if (!text) return;
    annos.push({
      id: crypto.randomUUID(),
      type: 'text',
      x: p.x,
      y: p.y,
      text,
      color: els.colorInput.value,
      size: Number(els.sizeInput.value),
      width: Math.max(120, text.length * Number(els.sizeInput.value) * 0.52),
      height: Number(els.sizeInput.value) + 10,
    });
    redrawOverlay();
    refreshControls();
    return;
  }

  if (tool === 'signature') {
    if (!state.signatureDataUrl) {
      alert('Save a signature first from the Signature Studio.');
      return;
    }
    const width = 180;
    const height = 72;
    annos.push({
      id: crypto.randomUUID(),
      type: 'signature',
      x: p.x,
      y: p.y,
      width,
      height,
      image: state.signatureDataUrl,
    });
    redrawOverlay();
    refreshControls();
    return;
  }

  if (tool === 'freehand') {
    state.isDrawing = true;
    state.activeStroke = {
      id: crypto.randomUUID(),
      type: 'stroke',
      color: els.colorInput.value,
      size: Number(els.sizeInput.value) / 3,
      points: [p],
      x: p.x,
      y: p.y,
      width: 1,
      height: 1,
    };
    return;
  }

  if (tool === 'select') {
    state.selectedAnnoId = [...annos]
      .reverse()
      .find((a) => p.x >= a.x - 8 && p.y >= a.y - 8 && p.x <= (a.x + (a.width || 120) + 8) && p.y <= (a.y + (a.height || 30) + 8))?.id || null;
    if (state.selectedAnnoId) {
      state.isDrawing = true;
    }
    redrawOverlay();
  }
}

function onOverlayPointerMove(ev) {
  if (!state.pdfDoc) return;
  const p = getCanvasPoint(ev);
  const annos = getCurrentPageAnnotations();

  if (state.isDrawing && els.toolSelect.value === 'freehand' && state.activeStroke) {
    state.activeStroke.points.push(p);
    state.activeStroke.width = Math.max(state.activeStroke.width, Math.abs(p.x - state.activeStroke.x));
    state.activeStroke.height = Math.max(state.activeStroke.height, Math.abs(p.y - state.activeStroke.y));
    redrawOverlay();
    const temp = [...annos, state.activeStroke];
    drawAnnoList(temp);
    return;
  }

  if (state.isDrawing && els.toolSelect.value === 'select' && state.selectedAnnoId) {
    const selected = annos.find((a) => a.id === state.selectedAnnoId);
    if (!selected) return;
    selected.x = p.x;
    selected.y = p.y;
    redrawOverlay();
  }
}

function drawAnnoList(annos) {
  overlayCtx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
  for (const anno of annos) {
    if (anno.type === 'stroke') {
      overlayCtx.beginPath();
      overlayCtx.lineWidth = anno.size;
      overlayCtx.lineCap = 'round';
      overlayCtx.strokeStyle = anno.color;
      anno.points.forEach((pt, i) => (i === 0 ? overlayCtx.moveTo(pt.x, pt.y) : overlayCtx.lineTo(pt.x, pt.y)));
      overlayCtx.stroke();
    } else if (anno.type === 'text') {
      overlayCtx.fillStyle = anno.color;
      overlayCtx.font = `${anno.size}px sans-serif`;
      overlayCtx.fillText(anno.text, anno.x, anno.y);
    } else if (anno.type === 'signature' && anno.image) {
      const img = new Image();
      img.src = anno.image;
      img.onload = () => overlayCtx.drawImage(img, anno.x, anno.y, anno.width, anno.height);
    }
  }
}

function onOverlayPointerUp() {
  if (!state.pdfDoc) return;
  if (state.isDrawing && els.toolSelect.value === 'freehand' && state.activeStroke) {
    getCurrentPageAnnotations().push(state.activeStroke);
  }
  state.isDrawing = false;
  state.activeStroke = null;
  redrawOverlay();
  refreshControls();
}

function undoCurrentPage() {
  const annos = getCurrentPageAnnotations();
  if (!annos.length) return;
  annos.pop();
  state.selectedAnnoId = null;
  redrawOverlay();
  refreshControls();
}

function clearCurrentPage() {
  state.annotationsByPage.set(state.pageNum, []);
  state.selectedAnnoId = null;
  redrawOverlay();
  refreshControls();
}

function refreshControls() {
  const loaded = Boolean(state.pdfDoc);
  const annos = loaded ? getCurrentPageAnnotations() : [];

  els.prevPageBtn.disabled = !loaded || state.pageNum <= 1;
  els.nextPageBtn.disabled = !loaded || state.pageNum >= state.pageCount;
  els.undoBtn.disabled = !loaded || annos.length === 0;
  els.clearPageBtn.disabled = !loaded || annos.length === 0;
  els.downloadBtn.disabled = !loaded;
  els.pageInfo.textContent = `Page ${state.pageNum} / ${state.pageCount}`;
  els.textInputWrap.style.display = els.toolSelect.value === 'text' ? 'flex' : 'none';

  els.overlayCanvas.style.cursor = els.toolSelect.value === 'select' ? 'move' : 'crosshair';
}

function setupSignaturePad() {
  signCtx.lineWidth = 2;
  signCtx.lineCap = 'round';
  signCtx.strokeStyle = '#111827';

  let drawing = false;

  els.signaturePad.addEventListener('pointerdown', (ev) => {
    drawing = true;
    const p = getCanvasPoint(ev, els.signaturePad);
    signCtx.beginPath();
    signCtx.moveTo(p.x, p.y);
  });

  els.signaturePad.addEventListener('pointermove', (ev) => {
    if (!drawing) return;
    const p = getCanvasPoint(ev, els.signaturePad);
    signCtx.lineTo(p.x, p.y);
    signCtx.stroke();
  });

  window.addEventListener('pointerup', () => {
    drawing = false;
  });
}

function clearSignaturePad() {
  signCtx.clearRect(0, 0, els.signaturePad.width, els.signaturePad.height);
  state.signatureDataUrl = null;
}

function saveSignatureFromPad() {
  state.signatureDataUrl = els.signaturePad.toDataURL('image/png');
  alert('Signature saved. Switch to Signature Stamp tool and click on the document.');
}

async function exportPdf() {
  if (!state.pdfBytes) return;

  const pdfDoc = await PDFLib.PDFDocument.load(state.pdfBytes);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const annos = state.annotationsByPage.get(i + 1) || [];
    const { width, height } = page.getSize();

    for (const anno of annos) {
      const x = (anno.x / els.overlayCanvas.width) * width;
      const yFromTop = (anno.y / els.overlayCanvas.height) * height;
      const y = height - yFromTop;

      if (anno.type === 'text') {
        const color = PDFLib.rgb(...hexToRgb01(anno.color));
        page.drawText(anno.text, {
          x,
          y,
          size: Math.max(8, (anno.size / els.overlayCanvas.height) * height),
          color,
        });
      }

      if (anno.type === 'stroke' && anno.points.length > 1) {
        const color = PDFLib.rgb(...hexToRgb01(anno.color));
        for (let p = 1; p < anno.points.length; p += 1) {
          const a = anno.points[p - 1];
          const b = anno.points[p];
          page.drawLine({
            start: { x: (a.x / els.overlayCanvas.width) * width, y: height - (a.y / els.overlayCanvas.height) * height },
            end: { x: (b.x / els.overlayCanvas.width) * width, y: height - (b.y / els.overlayCanvas.height) * height },
            thickness: Math.max(1, (anno.size / els.overlayCanvas.height) * height),
            color,
          });
        }
      }

      if (anno.type === 'signature' && anno.image) {
        const pngImage = await pdfDoc.embedPng(anno.image);
        const sigWidth = (anno.width / els.overlayCanvas.width) * width;
        const sigHeight = (anno.height / els.overlayCanvas.height) * height;
        page.drawImage(pngImage, {
          x,
          y: y - sigHeight,
          width: sigWidth,
          height: sigHeight,
        });
      }
    }
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'edited.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

function hexToRgb01(hex) {
  const v = hex.replace('#', '');
  const n = Number.parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
