// web/script.js
// Loads web/legacyflightmap_light.svg inline, removes white background rects,
// centers the SVG, enables drag-to-pan and wheel-to-zoom (zoom under mouse),
// and stores files in /web/ (as requested).

const container = document.getElementById('map-container');
const svgPath = 'assets/legacyflightmap_light.svg';

let svgEl = null;
let naturalWidth = 1000, naturalHeight = 1000;
let scale = 1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

// Fetch & inline the SVG, clean it, and initialize sizing & handlers
async function init() {
  try {
    const res = await fetch(svgPath);
    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    const text = await res.text();

    container.innerHTML = text;
    svgEl = container.querySelector('svg');
    if (!svgEl) throw new Error('No <svg> in file');

    // Force transparent svg background and remove full-size white rects
    svgEl.style.background = 'transparent';
    const rects = Array.from(svgEl.querySelectorAll('rect'));
    rects.forEach(r => {
      const fill = (r.getAttribute('fill') || '').toLowerCase();
      const rw = parseFloat(r.getAttribute('width') || '0');
      const rh = parseFloat(r.getAttribute('height') || '0');

      // Remove rects that are white or approximate full viewBox size
      if (fill === '#fff' || fill === '#ffffff' || fill === 'white' ||
          (svgEl.viewBox && rw >= svgEl.viewBox.baseVal.width - 1 && rh >= svgEl.viewBox.baseVal.height - 1)) {
        r.remove();
      }
    });

    // If there is no viewBox, set one using bbox so units are consistent
    if (!svgEl.hasAttribute('viewBox')) {
      // compute bbox from contents
      let bbox;
      try { bbox = svgEl.getBBox(); }
      catch (e) { bbox = { x: 0, y: 0, width: 1000, height: 1000 }; }
      svgEl.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    }

    // read natural size from viewBox
    naturalWidth = svgEl.viewBox.baseVal.width;
    naturalHeight = svgEl.viewBox.baseVal.height;

    // set an initial scale so the map is comfortably visible.
    // Choose the larger of width or height fit to ensure some scroll area exists.
    const fitScaleX = container.clientWidth / naturalWidth;
    const fitScaleY = container.clientHeight / naturalHeight;
    const initialScale = Math.max(fitScaleX, fitScaleY) * 0.9; // slightly smaller than full fit
    scale = Math.max(initialScale, 1); // default to at least 1 for most maps

    applyScale(scale);

    // center the SVG in the container (set scroll to center)
    centerSVG();

    // interactions
    enableDragPan(container);
    enableWheelZoom(container);
    // optional: keyboard +/- to zoom
    enableKeyboardZoom(container);
  } catch (err) {
    console.error('Could not initialize map:', err);
    container.innerHTML = `<p style="padding:1rem;color:#900">Error loading map: ${err.message}</p>`;
  }
}

// Apply CSS pixel size to the SVG based on viewBox * scale
function applyScale(s) {
  scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  svgEl.style.width  = (naturalWidth * scale) + 'px';
  svgEl.style.height = (naturalHeight * scale) + 'px';
}

// Center the SVG by scrolling so map is centered in viewport
function centerSVG() {
  // Wait a tick so sizes are applied
  requestAnimationFrame(() => {
    const extraX = Math.max(0, svgEl.clientWidth - container.clientWidth);
    const extraY = Math.max(0, svgEl.clientHeight - container.clientHeight);
    container.scrollLeft = Math.round(extraX / 2);
    container.scrollTop  = Math.round(extraY / 2);
  });
}

// Drag-to-pan (on container: scrollLeft/scrollTop)
function enableDragPan(el) {
  let isDragging = false;
  let startX = 0, startY = 0, startScrollLeft = 0, startScrollTop = 0;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // left button only
    isDragging = true;
    el.classList.add('grabbing');
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = el.scrollLeft;
    startScrollTop = el.scrollTop;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.scrollLeft = startScrollLeft - dx;
    el.scrollTop  = startScrollTop  - dy;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('grabbing');
  });

  // touch
  let touchStart = null;
  el.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    const t = ev.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, left: el.scrollLeft, top: el.scrollTop };
  }, {passive: false});

  el.addEventListener('touchmove', (ev) => {
    if (!touchStart || ev.touches.length !== 1) return;
    const t = ev.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    el.scrollLeft = touchStart.left - dx;
    el.scrollTop  = touchStart.top  - dy;
    ev.preventDefault();
  }, {passive: false});

  el.addEventListener('touchend', () => { touchStart = null; });
}

// Wheel-to-zoom centered on the mouse position inside the container
function enableWheelZoom(el) {
  el.addEventListener('wheel', (e) => {
    // If user holds ctrl/alt and prefers browser zoom, you might skip; we handle raw wheel
    e.preventDefault();

    // location of pointer relative to container
    const rect = el.getBoundingClientRect();
    const mouseOffsetX = e.clientX - rect.left;
    const mouseOffsetY = e.clientY - rect.top;

    // position in "content pixels" before zoom
    const contentX = el.scrollLeft + mouseOffsetX;
    const contentY = el.scrollTop  + mouseOffsetY;

    // wheel direction (negative = zoom in)
    const ZOOM_STEP = 1.125;
    const factor = e.deltaY < 0 ? ZOOM_STEP : (1 / ZOOM_STEP);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));

    // if no change -> skip
    if (Math.abs(newScale - scale) < 1e-6) return;

    // apply scale (this changes svg.clientWidth / clientHeight)
    const oldScale = scale;
    applyScale(newScale);

    // after scaling, keep the point under the mouse stable:
    // contentXAfter = contentX * (newScale/oldScale)
    const ratio = newScale / oldScale;
    const contentXAfter = contentX * ratio;
    const contentYAfter = contentY * ratio;

    // set new scroll to keep pointer on same map point
    el.scrollLeft = contentXAfter - mouseOffsetX;
    el.scrollTop  = contentYAfter - mouseOffsetY;
  }, {passive: false});
}

// optional keyboard zoom for convenience
function enableKeyboardZoom(el) {
  window.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=' ) {
      applyScale(scale * 1.125);
      // keep centered where currently scrolled
    } else if (e.key === '-' ) {
      applyScale(scale / 1.125);
    } else if (e.key === '0') {
      // reset to initial fit/center
      const fitScaleX = container.clientWidth / naturalWidth;
      const fitScaleY = container.clientHeight / naturalHeight;
      const initialScale = Math.max(fitScaleX, fitScaleY) * 0.9;
      applyScale(Math.max(initialScale, 1));
      centerSVG();
    }
  });
}

// initialize on load
init();
