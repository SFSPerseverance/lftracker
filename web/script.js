// web/script.js
// - Inlines web/legacyflightmap_light.svg
// - Removes white fullscreen rects
// - Centers the SVG and makes default scale such that SVG width == viewport width
// - Disallows zooming out below that default scale
// - Zooms centered under the mouse pointer
// - Drag-to-pan with clamped edges (no infinite movement)
// - Keeps SVG vector quality (no pixelation)

const container = document.getElementById('map-container');
const svgPath = 'web/legacyflightmap_light.svg';

let svgEl = null;
let naturalWidth = 1000, naturalHeight = 1000;
let defaultScale = 1;
let scale = 1;
const MAX_SCALE_MULTIPLIER = 8;
let tx = 0, ty = 0; // translation in pixels applied BEFORE scale
let isDragging = false;
let dragStart = null;

async function init() {
  try {
    const res = await fetch(svgPath);
    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    const text = await res.text();
    container.innerHTML = text;
    svgEl = container.querySelector('svg');
    if (!svgEl) throw new Error('No <svg> element found in ' + svgPath);

    // Make SVG background transparent and remove white/full-size rects
    svgEl.style.background = 'transparent';
    Array.from(svgEl.querySelectorAll('rect')).forEach(r => {
      const fill = (r.getAttribute('fill') || '').trim().toLowerCase();
      const rw = parseFloat(r.getAttribute('width') || '0');
      const rh = parseFloat(r.getAttribute('height') || '0');
      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      const vbw = vb ? vb.width : 0;
      const vbh = vb ? vb.height : 0;
      if (fill === '#fff' || fill === '#ffffff' || fill === 'white' ||
          (vb && rw && rh && (rw >= vbw - 1 && rh >= vbh - 1))) {
        r.remove();
      }
    });

    // ensure viewBox exists; if not, create from bbox
    if (!svgEl.hasAttribute('viewBox')) {
      let bbox;
      try { bbox = svgEl.getBBox(); }
      catch (e) { bbox = { x: 0, y: 0, width: 1000, height: 1000 }; }
      svgEl.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    }

    // read natural size from viewBox
    naturalWidth = svgEl.viewBox.baseVal.width;
    naturalHeight = svgEl.viewBox.baseVal.height;

    // remove width/height attrs
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');

    // set the SVG element to its natural pixel size (we'll transform it)
    svgEl.style.width = naturalWidth + 'px';
    svgEl.style.height = naturalHeight + 'px';

    // ensure crisp vector rendering: prefer geometric precision & no raster hints
    svgEl.style.imageRendering = 'auto';
    svgEl.style.shapeRendering = 'geometricPrecision';
    svgEl.style.textRendering = 'geometricPrecision';

    // compute default scale so svg width covers the full container width
    computeDefaultScale();

    // initialize transform: defaultScale and centered
    scale = defaultScale;
    applyTransform(true);

    // interactions
    enableDragPan();
    enableWheelZoom();
    window.addEventListener('resize', onResize);
  } catch (err) {
    console.error('Map init error:', err);
    container.innerHTML = `<div style="padding:1rem;color:#900">Error loading map: ${err.message}</div>`;
  }
}

function computeDefaultScale() {
  const cw = container.clientWidth || window.innerWidth;
  // defaultScale = container width / natural width
  defaultScale = cw / naturalWidth;
  if (!isFinite(defaultScale) || defaultScale <= 0) defaultScale = 1;
  // ensure we don't pick absurdly large default scale
}

function getBoundsForScale(s) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const svgW = naturalWidth * s;
  const svgH = naturalHeight * s;

  // If SVG is wider than container => allow tx from (cw - svgW) .. 0
  // If SVG narrower => center and disallow panning (min==max==center)
  let minTx = cw - svgW;
  let maxTx = 0;
  if (svgW <= cw) {
    minTx = maxTx = (cw - svgW) / 2;
  }

  let minTy = ch - svgH;
  let maxTy = 0;
  if (svgH <= ch) {
    minTy = maxTy = (ch - svgH) / 2;
  }

  return { minTx, maxTx, minTy, maxTy };
}

function clampPan() {
  const b = getBoundsForScale(scale);
  if (tx < b.minTx) tx = b.minTx;
  if (tx > b.maxTx) tx = b.maxTx;
  if (ty < b.minTy) ty = b.minTy;
  if (ty > b.maxTy) ty = b.maxTy;
}

function applyTransform(center = false) {
  if (!svgEl) return;
  if (center) {
    // center the SVG by calculating tx/ty so svg is centered in container
    const svgPxW = naturalWidth * scale;
    const svgPxH = naturalHeight * scale;
    tx = (container.clientWidth - svgPxW) / 2;
    ty = (container.clientHeight - svgPxH) / 2;
  }
  clampPan();
  svgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// Drag-to-pan (translate tx/ty) with clamping
function enableDragPan() {
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY, tx, ty };
    container.classList.add('grabbing');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    tx = dragStart.tx + dx;
    ty = dragStart.ty + dy;
    clampPan();
    applyTransform(false);
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    dragStart = null;
    container.classList.remove('grabbing');
  });

  // touch
  let touchStart = null;
  container.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    const t = ev.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, tx, ty };
    isDragging = true;
  }, {passive: false});

  container.addEventListener('touchmove', (ev) => {
    if (!isDragging || !touchStart || ev.touches.length !== 1) return;
    const t = ev.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    tx = touchStart.tx + dx;
    ty = touchStart.ty + dy;
    clampPan();
    applyTransform(false);
    ev.preventDefault();
  }, {passive: false});

  container.addEventListener('touchend', () => {
    isDragging = false;
    touchStart = null;
  });
}

// Wheel-to-zoom centered under mouse pointer
function enableWheelZoom() {
  container.addEventListener('wheel', (e) => {
    e.preventDefault();

    // recompute defaultScale in case container changed size
    computeDefaultScale();
    const oldScale = scale;

    // pointer position inside container
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // map coordinate in SVG pixel space under pointer before zoom
    const mapX = (mouseX - tx) / oldScale;
    const mapY = (mouseY - ty) / oldScale;

    // choose zoom factor
    const ZOOM_STEP = 1.125;
    const factor = e.deltaY < 0 ? ZOOM_STEP : (1 / ZOOM_STEP);
    let proposed = oldScale * factor;

    // clamp scale (cannot go below defaultScale)
    const maxScale = defaultScale * MAX_SCALE_MULTIPLIER;
    const newScale = Math.max(defaultScale, Math.min(maxScale, proposed));
    if (Math.abs(newScale - oldScale) < 1e-6) return;

    scale = newScale;

    // recompute tx/ty so mapX,mapY remains under the mouse
    tx = mouseX - mapX * scale;
    ty = mouseY - mapY * scale;

    // clamp to bounds and apply
    clampPan();
    applyTransform(false);
  }, {passive: false});
}

// on resize: keep visual center stable and recompute default scale
function onResize() {
  if (!svgEl) return;
  // center point in container (pixel)
  const cw = container.clientWidth, ch = container.clientHeight;
  const centerX = cw / 2, centerY = ch / 2;

  // map coordinate of center before resize
  const mapCenterX = (centerX - tx) / scale;
  const mapCenterY = (centerY - ty) / scale;

  // recompute defaultScale
  computeDefaultScale();

  // ensure scale not below new default
  if (scale < defaultScale) scale = defaultScale;

  // new tx/ty to keep same mapCenter at center
  tx = centerX - mapCenterX * scale;
  ty = centerY - mapCenterY * scale;

  // clamp and apply transform
  clampPan();
  applyTransform(false);
}

// start
init();
