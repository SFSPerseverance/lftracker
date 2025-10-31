// web/script.js  (merged + adapted)
// ---------- BEGIN MERGED FILE ----------

// ViewBox-based zoom & pan for assets/legacyflightmap_light.svg
// + Aircraft tracking overlaid as SVG markers via WebSocket
// - preserves vector quality (no pixelation for vector shapes)
// - clamps panning to map edges (no infinite movement)
// - default viewBox = no-pan; zoom-in enables panning
// - wheel-to-zoom centered on pointer
// - warns if raster <image> elements are present (they will pixelate)

const container = document.getElementById('map-container');
const svgPath = 'assets/legacyflightmapold_light.svg';

let svgEl = null;
let origVB = null;     // {x,y,w,h} original viewBox
let curVB = null;      // current viewBox being displayed
const MIN_SCALE = 1;   // cannot zoom out below default (scale = 1)
const MAX_SCALE = 20;  // upper zoom cap (times)
let currentScale = 1;  // how many times zoomed in relative to original (1 = default)

// --- aircraft tracking state (SVG-adapted) ---
const aircraftMarkers = new Map();     // id -> { g, iconEl, labelEl, state, target, lastTs }
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let reconnectTimeout = null;
const RENDER_WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + 'horizon-backend-4f8h.onrender.com/ws/aircraft';
let affine = null; // world -> svg affine matrix (computed from anchors)

const aircraftIcons = {
    fighter: ['A10'],
    narrowbody: ['B73'],
    narrowbody_tailengine: ['BA11'],
    sevenfiveseven: ['B75'],
    fourengine: ['B74'],
    threeengine: ['L101'],
    singleprop: ['TBM7'],
    businessjet: ['CL60'],
};

const iconFiles = {
    fighter: 'icons/fighter.svg',
    narrowbody: 'icons/narrowbody.svg',
    narrowbody_tailengine: '/icons/tailengine.svg',
    threeengine: 'icons/three_engine.svg',
    singleprop: 'icons/singleprop.svg',
    businessjet: 'icons/business.svg',
    fourengine: 'icons/fourengine.svg',
    sevenfiveseven: 'icons/b757.svg'
};

function getAircraftIcon(category) {
    const file = iconFiles[category] || iconFiles['narrowbody'];
    return file;
}

function getAircraftCategory(icaoCode) {
    for (const [category, prefixes] of Object.entries(aircraftIcons)) {
        if (prefixes.some(prefix => icaoCode.startsWith(prefix))) {
            return category;
        }
    }
    return 'default';
}

function setAircraftInQuery(id) {
    const url = new URL(location.href);
    url.searchParams.set('aircraft', id);
    history.pushState({ aircraft: id }, '', url.toString());
}

function getAircraftFromQuery() {
    const params = new URLSearchParams(location.search);
    return params.get('aircraft');
}

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
        enableTouchControls();
        window.addEventListener('resize', onResize);

        // ensure initial centering (no pan possible at default)
        updateViewBox();

        // compute affine transform from anchors if present
        const anchors = readAnchorsFromSVG();
        if (anchors.length >= 3) {
            computeAffineFromAnchors(anchors);
        } else {
            console.warn('Less than 3 anchors found in SVG — falling back to lat/lon mapping if possible.');
            affine = null;
        }

        // Initialize aircraft WS after SVG is loaded and ready
        initializeAircraftTracking();

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
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging || !last) return;
        container.style.cursor = 'grabbing';
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
        container.style.cursor = ''; // Reset to default
    });

    // touch support
    let touchLast = null;
    container.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1) return;
        if (!isPannable()) return;
        const t = ev.touches[0];
        touchLast = { x: t.clientX, y: t.clientY };
        ev.preventDefault();
    }, { passive: false });

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
    }, { passive: false });

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

function enableTouchControls() {
    let touchLast = null;
    let lastDist = null;
    let lastCenter = null;

    container.addEventListener('touchstart', (ev) => {
        if (ev.touches.length === 1) {
            // Single touch - pan
            if (!isPannable()) return;
            const t = ev.touches[0];
            touchLast = { x: t.clientX, y: t.clientY };
            ev.preventDefault();
        } else if (ev.touches.length === 2) {
            // Two fingers - pinch zoom
            touchLast = null; // cancel any pan
            const t1 = ev.touches[0];
            const t2 = ev.touches[1];
            lastDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            lastCenter = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };
            ev.preventDefault();
        }
    }, { passive: false });

    container.addEventListener('touchmove', (ev) => {
        if (ev.touches.length === 1 && touchLast) {
            // Single touch - pan
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
        } else if (ev.touches.length === 2 && lastDist && lastCenter) {
            // Two fingers - pinch zoom
            const t1 = ev.touches[0];
            const t2 = ev.touches[1];
            const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const newCenter = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };

            const factor = newDist / lastDist;
            zoomAt(newCenter.x, newCenter.y, factor);
            updateViewBox(true);

            lastDist = newDist;
            lastCenter = newCenter;
            ev.preventDefault();
        }
    }, { passive: false });

    container.addEventListener('touchend', (ev) => {
        if (ev.touches.length === 0) {
            // All fingers lifted
            touchLast = null;
            lastDist = null;
            lastCenter = null;
        } else if (ev.touches.length === 1) {
            // One finger remaining - reset pinch but could continue pan
            lastDist = null;
            lastCenter = null;
            // Reset touchLast for the remaining finger
            const t = ev.touches[0];
            touchLast = { x: t.clientX, y: t.clientY };
        }
    });

    container.addEventListener('touchcancel', () => {
        touchLast = null;
        lastDist = null;
        lastCenter = null;
    });
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

// ---------- Aircraft tracking + SVG marker code (adapted from your Leaflet code) ----------

// Read anchor elements and return array of { sx, sy, wx, wz } (SVG coords and world coords)
function readAnchorsFromSVG() {
    if (!svgEl) return [];
    // find any element with data-world-x and data-world-z attributes
    const els = svgEl.querySelectorAll('[data-world-x][data-world-z]');
    const pairs = [];
    els.forEach(el => {
        let sx = 0, sy = 0;
        if (el.tagName.toLowerCase() === 'circle') {
            sx = parseFloat(el.getAttribute('cx') || 0);
            sy = parseFloat(el.getAttribute('cy') || 0);
        } else {
            try {
                const bbox = el.getBBox();
                sx = bbox.x + bbox.width * 0.5;
                sy = bbox.y + bbox.height * 0.5;
            } catch (e) {
                return;
            }
        }
        const wx = parseFloat(el.getAttribute('data-world-x'));
        const wz = parseFloat(el.getAttribute('data-world-z'));
        if (!isNaN(wx) && !isNaN(wz)) pairs.push({ sx, sy, wx, wz });
    });
    return pairs;
}

// AFFINE transform variables and computation
// affine maps world (wx, wz) -> svg (sx, sy) via: [sx]   [a b tx] [wx]
//                                             [sy] = [c d ty] [wz]
//                                             [1 ]   [0 0 1 ] [1 ]
// compute from 3 pairs; stores matrix in global `affine`
function computeAffineFromAnchors(pairs) {
    if (pairs.length < 3) return null;
    // pick first three non-collinear pairs
    const p = pairs.slice(0, 3);
    const A = [];
    const Sx = [];
    const Sy = [];
    for (let i = 0; i < 3; ++i) {
        A.push([p[i].wx, p[i].wz, 1]);
        Sx.push(p[i].sx);
        Sy.push(p[i].sy);
    }

    function det3(m) {
        return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    }
    const D = det3(A);
    if (Math.abs(D) < 1e-9) {
        console.warn('Anchor matrix singular; anchors likely collinear.');
        return null;
    }
    function inv3(m) {
        const inv = [];
        inv[0] = [];
        inv[1] = [];
        inv[2] = [];
        inv[0][0] = (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / D;
        inv[0][1] = -(m[0][1] * m[2][2] - m[0][2] * m[2][1]) / D;
        inv[0][2] = (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / D;
        inv[1][0] = -(m[1][0] * m[2][2] - m[1][2] * m[2][0]) / D;
        inv[1][1] = (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / D;
        inv[1][2] = -(m[0][0] * m[1][2] - m[0][2] * m[1][0]) / D;
        inv[2][0] = (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / D;
        inv[2][1] = -(m[0][0] * m[2][1] - m[0][1] * m[2][0]) / D;
        inv[2][2] = (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / D;
        return inv;
    }
    const invA = inv3(A);
    function mulInvA(vec) {
        const r = [];
        for (let i = 0; i < 3; ++i) {
            r[i] = invA[i][0] * vec[0] + invA[i][1] * vec[1] + invA[i][2] * vec[2];
        }
        return r;
    }

    const pX = mulInvA(Sx);
    const pY = mulInvA(Sy);

    affine = {
        a: pX[0], b: pX[1], tx: pX[2],
        c: pY[0], d: pY[1], ty: pY[2]
    };
    console.log('Affine transform computed:', affine);
    return affine;
}

// world -> svg coords
function worldToSvg(wx, wz, latLonFallback = null) {
    // If we have an affine transform (anchors), prefer that.
    if (affine) {
        const sx = affine.a * wx + affine.b * wz + affine.tx;
        const sy = affine.c * wx + affine.d * wz + affine.ty;
        return { sx, sy };
    }

    // Fallback mapping: if coordinates are lat/lon (latitude, longitude)
    // We expect caller to pass {lat, lon} as (wx,wz) in this fallback mode.
    // We'll map lon (-180..180) to svg x and lat (-90..90) to svg y using viewBox extents.
    if (!origVB) return null;
    // treat wx as latitude and wz as longitude if latLonFallback true
    const lat = wx;
    const lon = wz;
    if (isFinite(lat) && isFinite(lon)) {
        const normX = (-lon + 180) / 360; // 0..1 (flip longitude)
        const normY = (90 - lat) / 180;  // 0..1 (flip so north top)
        const sx = origVB.x + normX * origVB.w;
        const sy = origVB.y + normY * origVB.h;
        return { sx, sy };
    }
    return null;

}

window.aircraftMap = window.aircraftMap || new Map(); // id -> aircraft object (source of truth)
window.aircraftList = window.aircraftList || [];     // array view (kept in sync)

// helper: add or merge aircraft into store and update array view
function addOrUpdateAircraftInStore(incoming) {
    if (!incoming) return null;
    const id = String(incoming.id || incoming.callsign || '').trim();
    if (!id) return null;

    const existing = window.aircraftMap.get(id) || {};
    // merge with incoming (incoming wins)
    const merged = Object.assign({}, existing, incoming, { id });
    // Ensure numeric fields are numbers if strings arrive (optional safety)
    if (merged.latitude != null) merged.latitude = Number(merged.latitude);
    if (merged.longitude != null) merged.longitude = Number(merged.longitude);
    if (merged.heading != null) merged.heading = Number(merged.heading);
    // store
    window.aircraftMap.set(id, merged);
    // keep list view in sync
    window.aircraftList = Array.from(window.aircraftMap.values());
    return merged;
}

function findAircraftById(id) {
    if (!id) return null;
    const sid = String(id);
    if (window.aircraftMap && window.aircraftMap instanceof Map) {
        return window.aircraftMap.get(sid) || null;
    }
    if (window.aircraftList && Array.isArray(window.aircraftList)) {
        return window.aircraftList.find(a => String(a.id) === sid) || null;
    }
    return null;
}

// Wait until aircraft exists (poll) — cancels after timeout ms
function waitForAircraft(id, timeout = 5000, interval = 200) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tryFind = () => {
            const a = findAircraftById(id);
            if (a) return resolve(a);
            if (Date.now() - start >= timeout) return reject(new Error('timeout'));
            setTimeout(tryFind, interval);
        };
        tryFind();
    });
}

async function focusAircraftFromURL() {
    const id = getAircraftFromQuery();
    if (!id) return;
    // try immediate find
    const a = findAircraftById(id);
    if (a) {
        showAircraftDetails(a);
        return;
    }
    // otherwise wait for data to arrive (e.g. via websocket)
    try {
        const awaited = await waitForAircraft(id, 10000, 200); // 10s max
        showAircraftDetails(awaited);
    } catch (e) {
        console.warn('Could not find aircraft from URL:', id);
    }
}

// run on initial load
focusAircraftFromURL();

// react to hash changes or back/forward
window.addEventListener('hashchange', () => {
    focusAircraftFromURL();
});

// if using pushState / query parameter approach, listen for popstate
window.addEventListener('popstate', (ev) => {
    focusAircraftFromURL();
});

async function getPathFromSVG(url) {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    const path = doc.querySelector('path');
    return path ? path.getAttribute('d') : '';
}

// create or update an SVG plane marker (idempotent)
async function upsertSVGPlane(aircraft) {
    // aircraft object expected to have: id, latitude, longitude, heading, altitude, speed, callsign, ...
    if (!svgEl) return;
    const id = aircraft.id || aircraft.callsign || ('plane-' + Math.random().toString(36).slice(2, 8));
    let entry = aircraftMarkers.get(id);

    // choose world coords for mapping:
    // prefer incoming fields latitude & longitude -> treat as lat/lon fallback,
    // else if message sends worldX/worldZ use those (we try both).
    const wx = ('worldX' in aircraft) ? aircraft.worldX : (('latitude' in aircraft) ? aircraft.latitude : NaN);
    const wz = ('worldZ' in aircraft) ? aircraft.worldZ : (('longitude' in aircraft) ? aircraft.longitude : NaN);

    if (!entry) {
        // create group with icon + label
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('data-aircraft-id', id);
        g.style.cursor = 'pointer';

        const category = getAircraftCategory(aircraft.icao);
        const pathData = await getPathFromSVG(getAircraftIcon(category));

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
icon.setAttribute('d', pathData);
icon.setAttribute('fill', 'rgb(255, 170, 0)');
icon.setAttribute('stroke', '#000');
icon.setAttribute('stroke-width', '12');
icon.setAttribute('transform', 'translate(-256 -256)');

        // label (hidden by default)
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', '12');
        label.setAttribute('y', '4');
        label.setAttribute('font-size', '10');
        label.setAttribute('font-family', 'Arial, sans-serif');
        label.setAttribute('fill', '#ffffff');
        label.setAttribute('visibility', 'hidden');
        label.textContent = aircraft.callsign || id;

        g.appendChild(icon);
        g.appendChild(label);

        // attach click to open side panel
        g.addEventListener('click', (ev) => {
            // show full details using your existing helper (if defined)
            if (typeof showAircraftDetails === 'function') {
                setAircraftInQuery(aircraft.id);
                showAircraftDetails(aircraft);
            }
            ev.stopPropagation();
        });

        // add to svg
        svgEl.appendChild(g);

        entry = {
            g, icon, label,
            state: { x: wx || 0, z: wz || 0, heading: aircraft.heading || 0 },
            target: { x: wx || 0, z: wz || 0, heading: aircraft.heading || 0 },
            lastTs: Date.now(),
            raw: aircraft
        };
        aircraftMarkers.set(id, entry);
    } else {
        // update target state
        entry.target = { x: wx || entry.target.x, z: wz || entry.target.z, heading: ('heading' in aircraft) ? aircraft.heading : entry.target.heading };
        entry.lastTs = Date.now();
        entry.raw = aircraft;
        // update label text quickly
        if (aircraft.callsign) entry.label.textContent = aircraft.callsign;
    }
}

// Remove stale markers older than threshold
function cleanupStaleAircraft() {
    const now = Date.now();
    const stale = [];
    aircraftMarkers.forEach((entry, id) => {
        if (now - entry.lastTs > 30 * 1000) stale.push(id);
    });
    stale.forEach(id => {
        const e = aircraftMarkers.get(id);
        if (e && e.g && e.g.parentNode) e.g.parentNode.removeChild(e.g);
        aircraftMarkers.delete(id);
    });
}

// helper to compute shortest angle difference in degrees
function shortAngleDiff(target, current) {
    let diff = (target - current) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
}

// animation loop: smooth interpolation and place markers
function aircraftRenderLoop() {
    aircraftMarkers.forEach((entry, id) => {
        // smoothing factor
        const t = 0.14;
        entry.state.x += (entry.target.x - entry.state.x) * t;
        entry.state.z += (entry.target.z - entry.state.z) * t;
        entry.state.heading += (shortAngleDiff(entry.target.heading || 0, entry.state.heading || 0)) * t;

        // map world coords -> svg coords
        const coords = worldToSvg(entry.state.x, entry.state.z, true); // pass lat/lon fallback
        if (!coords) return;

        // Calculate scale factor to keep icon constant size
        // Current zoom scale relative to original viewBox
        const rect = container.getBoundingClientRect();
        const cssPixelToSvgUnit = curVB.w / rect.width; // how many SVG units = 1 CSS pixel
        const targetSvgSize = 24 * cssPixelToSvgUnit; // 24 CSS pixels in SVG units

        // Assuming icon path is designed for ~100 unit viewBox, scale to targetSvgSize
        const iconScale = targetSvgSize / 512;

        // apply transform: translate(sx,sy) rotate(heading) scale(iconScale)
        const h = -(entry.state.heading || 0);
        const centerOffset = 256 * iconScale; // Scale the centering offset too
        entry.g.setAttribute('transform', `translate(${coords.sx}, ${coords.sy + centerOffset}) rotate(${h}) scale(${iconScale})`);
    });

    // occasionally cleanup
    if (Math.random() < 0.01) cleanupStaleAircraft();

    requestAnimationFrame(aircraftRenderLoop);
}

function applyCRTEffect(el, { flicker = true, glow = true } = {}) {
  if (!el) return;
  el.classList.add('crt');
  if (flicker) el.classList.add('flicker');
  if (glow) el.classList.add('crt-glow');
}
function removeCRTEffect(el) {
  if (!el) return;
  el.classList.remove('crt','flicker','crt-glow');
}


// WebSocket helpers (similar reconnect/backoff logic you provided)
function initializeAircraftTracking() {
    connectWS();
    requestAnimationFrame(aircraftRenderLoop);
}

function connectWS() {
    if (!('WebSocket' in window)) {
        console.warn('WebSocket not supported in this browser.');
        return;
    }
    try {
        ws = new WebSocket(RENDER_WS_URL);
    } catch (err) {
        console.error('WS connect error', err);
        scheduleReconnect();
        return;
    }

    ws.onopen = () => {
        if (typeof showMessage === 'function') showMessage('Connected to live aircraft tracking', 'success');
        reconnectAttempts = 0;
    };

    ws.onmessage = (ev) => {
        let data;
        try { data = JSON.parse(ev.data); }
        catch (e) { console.error('WS parse error', e); return; }

        handleWSMessage(data);
    };

    ws.onclose = (ev) => {
        console.log('WS closed', ev);
        if (typeof showMessage === 'function') showMessage('Aircraft tracking disconnected', 'warning');
        // clear all markers on disconnect
        clearAllAircraftSVG();
        scheduleReconnect();
    };

    ws.onerror = (err) => {
        console.error('WS error', err);
        if (typeof showMessage === 'function') showMessage('Aircraft tracking connection error', 'error');
    };
}

function scheduleReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        if (typeof showMessage === 'function') showMessage('Failed to reconnect to aircraft tracking', 'error');
        return;
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    console.log(`Reconnect attempt ${reconnectAttempts} in ${delay}ms`);
    reconnectTimeout = setTimeout(() => connectWS(), delay);
}

function handleWSMessage(msg) {
    switch (msg.type) {
        case 'initial_data':
            if (Array.isArray(msg.aircraft)) {
                // populate store first, then create markers from stored/merged objects
                msg.aircraft.forEach(a => {
                    const stored = addOrUpdateAircraftInStore(a);
                    if (stored) upsertSVGPlane(stored);
                });
            }
            break;
        case 'aircraft_update':
            if (Array.isArray(msg.aircraft)) {
                msg.aircraft.forEach(a => {
                    const stored = addOrUpdateAircraftInStore(a);
                    if (stored) upsertSVGPlane(stored);
                });
            }
            break;
        case 'aircraft_removed':
            if (msg.id) removeAircraftSVG(msg.id);
            break;
        case 'server_shutdown':
            if (typeof showMessage === 'function') showMessage('Server is shutting down', 'warning');
            clearAllAircraftSVG();
            break;
        default:
            console.log('Unknown WS msg type', msg.type);
    }
}

function removeAircraftSVG(id) {
    const sid = String(id);
    const entry = aircraftMarkers.get(sid);
    if (entry && entry.g && entry.g.parentNode) entry.g.parentNode.removeChild(entry.g);
    aircraftMarkers.delete(sid);
    // remove from store
    if (window.aircraftMap && window.aircraftMap.has(sid)) {
        window.aircraftMap.delete(sid);
        window.aircraftList = Array.from(window.aircraftMap.values());
    }
    if (window.selectedAircraft && String(window.selectedAircraft.id) === sid && typeof closeAircraftPanel === 'function') {
        closeAircraftPanel();
    }
}


function clearAllAircraftSVG() {
    aircraftMarkers.forEach((entry, id) => {
        if (entry.g && entry.g.parentNode) entry.g.parentNode.removeChild(entry.g);
    });
    aircraftMarkers.clear();
    // clear store
    if (window.aircraftMap) window.aircraftMap.clear();
    window.aircraftList = [];
    if (typeof closeAircraftPanel === 'function') closeAircraftPanel();
}

// Expose debug function similar to your original
window.checkAircraftStatus = () => {
    return {
        websocketState: ws ? ws.readyState : 'Not initialized',
        aircraftCount: aircraftMarkers.size,
        reconnectAttempts
    };
};

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (ws) ws.close();
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
});

// Make showAircraftDetails globally available if it exists in other code
// (your earlier UI panel functions from the other repo should already be defined on the page).
// If they are not present, clicking markers will simply log the aircraft.
if (typeof showAircraftDetails !== 'function') {
    window.showAircraftDetails = function (aircraft) {
        console.log('Aircraft clicked:', aircraft);
    };
}

// ---------- END MERGED FILE ----------