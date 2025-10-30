// Load the SVG inline, size it to its natural viewBox/size,
// and enable drag-to-pan (mouse + touch).
const container = document.getElementById('map-container');
const svgPath = 'assets/legacyflightmap_light.svg'; // put your SVG here

async function loadSVG() {
  try {
    const r = await fetch(svgPath);
    if (!r.ok) throw new Error('Failed to fetch SVG: ' + r.status);
    const text = await r.text();

    // Inject SVG markup directly (inline SVG)
    container.innerHTML = text;

    // Get the inserted SVG element
    const svg = container.querySelector('svg');
    if (!svg) {
      console.warn('No <svg> found in', svgPath);
      return;
    }

    // Remove hard-coded width/height so we can size from viewBox
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Determine natural size:
    let naturalWidth = 0, naturalHeight = 0;
    if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) {
      naturalWidth = svg.viewBox.baseVal.width;
      naturalHeight = svg.viewBox.baseVal.height;
    } else {
      // fallback: use bbox (may be 0 if SVG uses only relative coords)
      try {
        const bbox = svg.getBBox();
        naturalWidth = bbox.width || svg.clientWidth || 1000;
        naturalHeight = bbox.height || svg.clientHeight || 1000;
      } catch (e) {
        naturalWidth = svg.clientWidth || 1000;
        naturalHeight = svg.clientHeight || 1000;
      }
    }

    // Apply the natural dimensions as CSS pixels so container can overflow
    svg.style.width = naturalWidth + 'px';
    svg.style.height = naturalHeight + 'px';

    // Prevent pointer events on elements you don't want to intercept (optional)
    svg.style.pointerEvents = 'auto';

    enableDragPan(container);
  } catch (err) {
    console.error('Error loading SVG:', err);
    container.innerHTML = '<p style="padding:1rem;color:#900">Could not load map.svg</p>';
  }
}

// Drag-to-pan implementation (works for mouse and touch)
// It simply adjusts the container.scrollLeft/scrollTop while dragging.
function enableDragPan(el) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  // Mouse
  el.addEventListener('mousedown', (e) => {
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

  // Touch
  let lastTouch = null;
  el.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    lastTouch = ev.touches[0];
    isDragging = true;
    startX = lastTouch.pageX - el.offsetLeft;
    startY = lastTouch.pageY - el.offsetTop;
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
    lastTouch = null;
  });
}

// start
loadSVG();
