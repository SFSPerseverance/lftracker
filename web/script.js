// web/script.js
// - Inlines web/legacyflightmap_light.svg
// - Removes white fullscreen rects
// - Centers the SVG and makes default scale such that SVG width == viewport width
// - Disallows zooming out below that default scale
// - Zooms centered under the mouse pointer
// - Drag-to-pan (mouse + touch)

const container = document.getElementById('map-container');
const svgPath = 'assets/legacyflightmap_light.svg';

let svgEl = null;
let naturalWidth = 1000, naturalHeight = 1000;
let defaultScale = 1;
let scale = 1;
let MIN_SCALE = 1; // will be set to defaultScale after load
const MAX_SCALE_MULTIPLIER = 8;
let tx = 0, ty = 0; // translation in pixels (applied BEFORE scale)
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

    // remove white fullscreen rects (common in exported svgs)
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

    // remove width/height attrs so they don't interfere
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');

    // set the SVG element to its natural pixel size (we'll transform it)
    svgEl.style.width = naturalWidth + 'px';
    svgEl.style.height = naturalHeight + 'px';

    // compute default scale so svg width covers the full container width
    computeDefaultScale();

    // set initial transform (centered)
    scale = defaultScale;
    MIN_SCALE = defaultScale;
    applyTransform(center = true);

    // interaction handlers
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
  defaultScale = cw / naturalWidth;
  // If naturalWidth is 0 for some reason fall back
  if (!isFinite(defaultScale) || defaultScale <= 0) defaultScale = 1;
}

// apply transform: translate(tx,ty) then scale(scale)
// if center === true, center the image inside the container
function applyTransform(center = false) {
  if (!svgEl) return;
  if (center) {
    // center by computing tx/ty so svg is centered in container
    const svgPxW = naturalWidth * scale;
    const svgPxH = naturalHeight * scale;
    tx = (container.clientWidth - svgPxW) / 2;
    ty = (container.clientHeight - svgPxH) / 2;
  }
  svgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// Drag-to-pan handlers (using translate, no scrollbars)
function enableDragPan() {
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    dragStart = {x: e.clientX, y: e.clientY, tx, ty};
    container.classList.add('grabbing');
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    tx = dragStart.tx + dx;
    ty = dragStart.ty + dy;
    applyTransform(false);
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    dragStart = null;
    container.classList.remove('grabbing');
  });

  // touch support
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
    applyTransform(false);
    ev.preventDefault();
  }, {passive: false});
  container.addEventListener('touchend', () => {
    isDragging = false;
    touchStart = null;
  });
}

// Wheel zoom centered under mouse pointer
function enableWheelZoom() {
  container.addEventListener('wheel', (e) => {
    // prefer zooming always; prevent page scroll
    e.preventDefault();

    // recalc defaultScale in case container size changed
    computeDefaultScale();
    const oldScale = scale;

    // pointer position relative to container
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // map coordinate (in SVG pixel space) under pointer before zoom:
    // mapX = (mouseX - tx) / oldScale
    const mapX = (mouseX - tx) / oldScale;
    const mapY = (mouseY - ty) / oldScale;

    // choose zoom factor
    const ZOOM_STEP = 1.125;
    const factor = e.deltaY < 0 ? ZOOM_STEP : (1 / ZOOM_STEP);
    // clamp new scale so it cannot go below defaultScale
    const proposedScale = oldScale * factor;
    const maxScale = defaultScale * MAX_SCALE_MULTIPLIER;
    const newScale = Math.max(defaultScale, Math.min(maxScale, proposedScale));
    if (Math.abs(newScale - oldScale) < 1e-6) return;

    // update scale
    scale = newScale;

    // compute new translate so mapX,mapY stays under the same mouse pixel
    // mouseX = tx' + mapX * newScale  => tx' = mouseX - mapX * newScale
    tx = mouseX - mapX * newScale;
    ty = mouseY - mapY * newScale;

    applyTransform(false);
  }, {passive: false});
}

// handle resize: keep the same visual center as best we can
function onResize() {
  // compute previous center point in map coordinates, then reapply defaultScale clamp
  if (!svgEl) return;

  // container center pos in pixels
  const cRect = container.getBoundingClientRect();
  const cx = cRect.width / 2;
  const cy = cRect.height / 2;

  // map coord under center before resize
  const mapCenterX = (cx - tx) / scale;
  const mapCenterY = (cy - ty) / scale;

  // recompute default scale (which might've changed)
  computeDefaultScale();

  // ensure scale not below defaultScale
  if (scale < defaultScale) scale = defaultScale;

  // if scale is below new default, clamp and set to default
  if (scale < defaultScale) scale = defaultScale;

  // Re-center so that mapCenter remains at viewport center
  tx = cx - mapCenterX * scale;
  ty = cy - mapCenterY * scale;

  // if we're at initial (no pan) then center exactly
  applyTransform(false);
}

// start
init();
