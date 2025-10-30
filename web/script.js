// Load SVG inline, remove full-size white background rects,
// enable drag-to-pan (mouse + touch) and wheel-to-zoom (centered on mouse).

const container = document.getElementById('map-container');
const svgPath = 'assets/legacyflightmap_light.svg'; // your svg file
let svg, naturalWidth, naturalHeight, scale = 1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 6;

async function loadSVG() {
  try {
    const r = await fetch(svgPath);
    if (!r.ok) throw new Error('Failed to fetch SVG: ' + r.status);
    const text = await r.text();

    // Inject SVG markup directly
    container.innerHTML = text;
    svg = container.querySelector('svg');
    if (!svg) {
      console.warn('No <svg> found in', svgPath);
      return;
    }

    // Make sure svg backgrounds are transparent and remove any full-size rect
    svg.style.background = 'transparent';
    // remove <rect> elements that likely act as white background (full-size)
    const rects = Array.from(svg.querySelectorAll('rect'));
    rects.forEach(r => {
      const rx = r.getAttribute('x') || 0;
      const ry = r.getAttribute('y') || 0;
      const rw = r.getAttribute('width');
      const rh = r.getAttribute('height');

      // remove rects that cover whole viewBox or have white fill
      const fill = (r.getAttribute('fill') || '').toLowerCase();
      if ((fill === '#fff' || fill === '#ffffff' || fill === 'white') ||
          (svg.viewBox && rw && rh && Number(rw) >= svg.viewBox.baseVal.width && Number(rh) >= svg.viewBox.baseVal.height)) {
        r.remove();
      }
    });

    // Remove width/height attributes so we can control size via CSS
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Determine natural size from viewBox or bbox fallback
    if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) {
      naturalWidth = svg.viewBox.baseVal.width;
      naturalHeight = svg.viewBox.baseVal.height;
    } else {
      try {
        const bbox = svg.getBBox();
        naturalWidth = bbox.width || svg.clientWidth || 1000;
        naturalHeight = bbox.height || svg.clientHeight || 1000;
      } catch (e) {
        naturalWidth = svg.clientWidth || 1000;
        naturalHeight = svg.clientHeight || 1000;
      }
    }

    // If viewBox uses small units, you may want to scale up initially — change SCALE_FACTOR if needed.
    const SCALE_FACTOR = 1; // tweak this if your svg is tiny in logical units
    naturalWidth *= SCALE_FACTOR;
    naturalHeight *= SCALE_FACTOR;

    // Apply initial pixel size
    applyScale(1);

    // Hook interactions
    enableDragPan(container);
    enableWheelZoom(container);
  } catch (err) {
    console.error('Error loading SVG:', err);
    container.innerHTML = '<p style="padding:1rem;color:#900">Could not load map.svg</p>';
  }
}

function applyScale(newScale) {
  scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  svg.style.width = (naturalWidth * scale) + 'px';
  svg.style.height = (naturalHeight * scale) + 'px';
}

// DRAG-TO-PAN
function enableDragPan(el) {
  let isDragging = false;
  let startX = 0, startY = 0, startScrollLeft = 0, startScrollTop = 0;

  el.addEventListener('mousedown', (e) => {
    // Only left button
    if (e.button !== 0) return;
    isDragging = true;
    el.classList.add('grabbing');
    startX = e.pageX - el.offsetLeft;
    startY = e.pageY - el.offsetTop;
    startScrollLeft = el.scrollLeft;
    startScrollTop = el.scrollTop;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = e.pageX - el.offsetLeft;
    const y = e.pageY - el.offsetTop;
    const dx = x - startX;
    const dy = y - startY;
    el.scrollLeft = startScrollLeft - dx;
    el.scrollTop = startScrollTop - dy;
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('grabbing');
  });

  // Touch support
  el.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    const t = ev.touches[0];
    isDragging = true;
    startX = t.pageX - el.offsetLeft;
    startY = t.pageY - el.offsetTop;
    startScrollLeft = el.scrollLeft;
    startScrollTop = el.scrollTop;
  }, {passive: false});

  el.addEventListener('touchmove', (ev) => {
    if (!isDragging || !ev.touches.length) return;
    const t = ev.touches[0];
    const x = t.pageX - el.offsetLeft;
    const y = t.pageY - el.offsetTop;
    const dx = x - startX;
    const dy = y - startY;
    el.scrollLeft = startScrollLeft - dx;
    el.scrollTop = startScrollTop - dy;
    ev.preventDefault();
  }, {passive: false});

  el.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// WHEEL-TO-ZOOM (centered on mouse)
function enableWheelZoom(el) {
  el.addEventListener('wheel', (e) => {
    // Only when pointer is over the container
    const rect = el.getBoundingClientRect();
    const mouseOffsetX = e.clientX - rect.left; // coordinate inside container
    const mouseOffsetY = e.clientY - rect.top;

    // Content coordinate before zoom:
    const contentX = el.scrollLeft + mouseOffsetX;
    const contentY = el.scrollTop + mouseOffsetY;

    // Zoom factor (smooth). Negative deltaY -> zoom in
    const ZOOM_STEP = 1.12;
    const wheel = e.deltaY;
    const factor = wheel < 0 ? ZOOM_STEP : (1 / ZOOM_STEP);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));

    // If scale unchanged, do nothing
    if (Math.abs(newScale - scale) < 1e-6) return;

    // Prevent default scroll so we can zoom instead
    e.preventDefault();

    // Apply new size
    const oldScale = scale;
    applyScale(newScale);

    // Adjust scroll so the point under the pointer stays stationary
    const contentXAfter = contentX * (newScale / oldScale);
    const contentYAfter = contentY * (newScale / oldScale);

    // set scroll so that mouseOffset remains the same
    el.scrollLeft = contentXAfter - mouseOffsetX;
    el.scrollTop  = contentYAfter - mouseOffsetY;
  }, {passive: false});
}

// Start
loadSVG();
