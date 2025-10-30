// web/script.js
// ViewBox-based zoom & pan for assets/legacyflightmap_light.svg
// - preserves vector quality (no pixelation for vector shapes)
// - clamps panning to map edges (no infinite movement)
// - default viewBox = no-pan; zoom-in enables panning
// - wheel-to-zoom centered on pointer
// - warns if raster <image> elements are present (they will pixelate)

const container = document.getElementById('map-container');
const svgPath = 'assets/legacyflightmap_light.svg';

let svgEl = null;
let origVB = null;     // {x,y,w,h} original viewBox
let curVB = null;      // current viewBox being displayed
const MIN_SCALE = 1;   // cannot zoom out below default (scale = 1)
const MAX_SCALE = 20;  // upper zoom cap (times)
let currentScale = 1;  // how many times zoomed in relative to original (1 = default)

// optional raster-warning overlay
function showRasterWarning() {
  let d = document.getElementById('raster-warning');
  if (!d) {
    d = document.createElement('div');
    d.id = 'raster-warning';
    Object.assign(d.style, {
      position: 'fixed',
      right: '12px',
      top: '12px',
      background: 'rgba(255,200,0,0.95)',
      color: '#000',
      padding: '8px 10px',
      borderRadius: '6px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      zIndex: 9999,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    });
    d.textContent = 'Note: this SVG contains embedded raster images – those will pixelate when zoomed.';
    document.body.appendChild(d);
  }
}

// Utility: clamp value
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Load and inline SVG
async function loadSVGInline() {
  try {
    const res = await fetch(svgPath);
    if (!res.ok) throw new Error('Failed to fetch SVG: ' + res.status);
    const svgText = await res.text();
    container.innerHTML = svgText;
    svgEl = container.querySelector('svg');
    if (!svgEl) throw new Error('No <svg> element found in ' + svgPath);

    // ensure transparent background
    svgEl.style.background = 'transparent';

    // detect embedded raster images (<image> tags)
    if (svgEl.querySelector('image, raster')) {
      console.warn('SVG contains raster images (these will pixelate when zoomed).');
      showRasterWarning();
    }

    // ensure viewBox exists; if not, create from bbox (best-effort)
    if (!svgEl.hasAttribute('viewBox')) {
      let bbox;
      try { bbox = svgEl.getBBox(); }
      catch (e) { bbox = { x: 0, y: 0, width: 1000, height: 1000 }; }
      svgEl.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    }

    // store original viewBox values (in SVG user units)
    const vb = svgEl.viewBox.baseVal;
    origVB = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
    // current viewBox starts as original
    curVB = { ...origVB };
    currentScale = 1;

    // make the SVG fill the container (centered both ways)
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';
    svgEl.style.display = 'block';

    // setup interactions
    enableWheelZoom();
    enableDragPan();
    window.addEventListener('resize', onResize);

    // ensure initial centering (no pan possible at default)
    updateViewBox();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="padding:1rem;color:#900">Error loading SVG: ${err.message}</div>`;
  }
}

// update the SVG's viewBox attribute from curVB
function updateViewBox(smooth = false) {
  if (!svgEl || !curVB) return;
  
  // add smooth transition if requested
  if (smooth) {
    svgEl.style.transition = 'none';
    // force reflow
    svgEl.offsetHeight;
    svgEl.style.transition = 'all 0.15s ease-out';
  } else {
    svgEl.style.transition = 'none';
  }
  
  // set viewBox as integers or floats
  svgEl.setAttribute('viewBox', `${curVB.x} ${curVB.y} ${curVB.w} ${curVB.h}`);
}

// Convert mouse pixel coordinate (inside container) to svg-space coordinate (user units)
function containerPointToSvg(pointX, pointY) {
  // container client size in CSS pixels
  const rect = container.getBoundingClientRect();
  const cx = pointX - rect.left;
  const cy = pointY - rect.top;

  // proportion across container
  const px = cx / rect.width;
  const py = cy / rect.height;

  // svg coordinate (current viewBox)
  const svgX = curVB.x + px * curVB.w;
  const svgY = curVB.y + py * curVB.h;
  return { svgX, svgY, px, py };
}

// Zoom centered on mouse (factor >1 zooms in)
function zoomAt(pointClientX, pointClientY, factor) {
  // compute new proposed width/height in svg units
  const { svgX, svgY, px, py } = containerPointToSvg(pointClientX, pointClientY);

  // new viewBox size = current / factor
  const newW = curVB.w / factor;
  const newH = curVB.h / factor;

  // compute new top-left so svgX stays under same pixel proportion px,py:
  // svgX = newX + px * newW  => newX = svgX - px * newW
  let newX = svgX - px * newW;
  let newY = svgY - py * newH;

  // clamp newW/newH to limits: cannot be bigger than original (no zoom-out below default)
  const minW = origVB.w / MAX_SCALE;   // arbitrary safety lower bound
  const maxW = origVB.w;               // cannot exceed original
  const clampedW = clamp(newW, minW, maxW);
  const clampedH = clamp(newH, minW * (origVB.h / origVB.w), maxW * (origVB.h / origVB.w)); // keep ratio

  // after clamping sizes, recalc newX/newY so svgX remains fixed
  const finalW = clampedW;
  const finalH = clampedH;
  newX = svgX - px * finalW;
  newY = svgY - py * finalH;

  // clamp position so viewBox stays inside origVB bounds
  newX = clamp(newX, origVB.x, origVB.x + origVB.w - finalW);
  newY = clamp(newY, origVB.y, origVB.y + origVB.h - finalH);

  // update curVB and scale
  curVB = { x: newX, y: newY, w: finalW, h: finalH };

  // compute currentScale relative to original: how many times zoomed-in
  currentScale = origVB.w / curVB.w;

  // disallow zooming out beyond default scale (i.e., curVB.w > origVB.w) – clamp
  if (curVB.w > origVB.w) {
    curVB = { ...origVB };
    currentScale = 1;
  }

  updateViewBox();
}

// Determine whether panning is allowed at current viewBox
function isPannable() {
  // pannable if curVB.w < origVB.w OR curVB.h < origVB.h (i.e., zoomed in)
  return (curVB.w < origVB.w - 1e-9) || (curVB.h < origVB.h - 1e-9);
}

// Drag-to-pan using viewBox coordinates
function enableDragPan() {
  let dragging = false;
  let last = null; // last client point

  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!isPannable()) return; // don't start drag when not pannable
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    container.classList.add('grabbing');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging || !last) return;
    // delta in client pixels
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };

    const rect = container.getBoundingClientRect();
    // delta in svg units:
    const dxSvg = dx * (curVB.w / rect.width);
    const dySvg = dy * (curVB.h / rect.height);

    // dragging right (dx>0) should move view left -> decrease curVB.x
    let newX = curVB.x - dxSvg;
    let newY = curVB.y - dySvg;

    // clamp inside origVB
    newX = clamp(newX, origVB.x, origVB.x + origVB.w - curVB.w);
    newY = clamp(newY, origVB.y, origVB.y + origVB.h - curVB.h);

    curVB.x = newX;
    curVB.y = newY;
    updateViewBox();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    last = null;
    container.classList.remove('grabbing');
  });

  // touch support
  let touchLast = null;
  container.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    if (!isPannable()) return;
    const t = ev.touches[0];
    touchLast = { x: t.clientX, y: t.clientY };
    ev.preventDefault();
  }, {passive: false});

  container.addEventListener('touchmove', (ev) => {
    if (!touchLast || ev.touches.length !== 1) return;
    const t = ev.touches[0];
    const dx = t.clientX - touchLast.x;
    const dy = t.clientY - touchLast.y;
    touchLast = { x: t.clientX, y: t.clientY };

    const rect = container.getBoundingClientRect();
    const dxSvg = dx * (curVB.w / rect.width);
    const dySvg = dy * (curVB.h / rect.height);

    let newX = curVB.x - dxSvg;
    let newY = curVB.y - dySvg;

    newX = clamp(newX, origVB.x, origVB.x + origVB.w - curVB.w);
    newY = clamp(newY, origVB.y, origVB.y + origVB.h - curVB.h);

    curVB.x = newX;
    curVB.y = newY;
    updateViewBox();
    ev.preventDefault();
  }, {passive: false});

  container.addEventListener('touchend', () => { touchLast = null; });
}

// Wheel zoom (centered on mouse)
function enableWheelZoom() {
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    // if user not zoomable (already at default and scrolling out), we still allow inwards
    const factor = e.deltaY < 0 ? 1.125 : 1 / 1.125;

    // compute target at mouse position
    const clientX = e.clientX;
    const clientY = e.clientY;

    // call zoomAt with factor; zoomAt handles clamping so we don't zoom out below default
    zoomAt(clientX, clientY, factor);
    
    // apply smooth transition for wheel zoom
    updateViewBox(true);
  }, { passive: false });
}

// on resize: keep center point stable by keeping same center svg coordinate
function onResize() {
  if (!svgEl || !origVB || !curVB) return;
  // keep the center of displayed area the same in svg coordinates
  const rect = container.getBoundingClientRect();
  const cx = rect.width / 2 + rect.left;
  const cy = rect.height / 2 + rect.top;
  const { svgX, svgY } = containerPointToSvg(cx, cy);

  // try to keep same svg center after resize by re-centering viewBox around svgX,svgY
  // keep current scale (curVB.w/ origVB.w)
  const scaleFactor = origVB.w / curVB.w;
  // ensure curVB.w not greater than origVB.w
  if (curVB.w > origVB.w) curVB = { ...origVB };

  // recompute new curVB.x/y to center svgX/svgY
  curVB.x = clamp(svgX - curVB.w * 0.5, origVB.x, origVB.x + origVB.w - curVB.w);
  curVB.y = clamp(svgY - curVB.h * 0.5, origVB.y, origVB.y + origVB.h - curVB.h);
  updateViewBox();
}

// initialize
loadSVGInline();