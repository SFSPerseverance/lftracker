(function(){
  // web/trails.js — non-invasive trail renderer for LFTracker
  // Polls until the main app initializes (svgEl, aircraftMarkers, container, worldToSvg, curVB)
  // then starts sampling and rendering per-aircraft trails.

  const POLL_MS = 200;
  const MAX_WAIT_MS = 15_000;
  const TRAIL_MAX_POINTS = 120;
  const TRAIL_SAMPLE_MS = 1000;
  const TRAIL_RENDER_MS = 300;
  const SPEED_UNIT_FACTOR = 0.00005;

  let inited = false;

  function ensureTrailForEntry(entry) {
    if (!entry) return;
    if (entry.trailGroup && entry.trailSamples) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'aircraft-trail');
    if (entry.g && entry.g.parentNode) entry.g.parentNode.insertBefore(g, entry.g);
    entry.trailGroup = g;
    entry.trailSamples = [];
    entry.lastTrailSampleTs = 0;
    entry.trailDirty = false;
  }

  function addTrailSample(entry, x, z, alt, ts) {
    ensureTrailForEntry(entry);
    const arr = entry.trailSamples;
    arr.push({ x: Number(x || 0), z: Number(z || 0), alt: Number(alt || 0), ts: Number(ts || Date.now()) });
    while (arr.length > TRAIL_MAX_POINTS) arr.shift();
    if (!Number.isNaN(arr[arr.length-1].alt) && arr[arr.length-1].alt > sessionMaxAltitude.value) {
      sessionMaxAltitude.value = arr[arr.length-1].alt;
    }
    entry.trailDirty = true;
  }

  function lerp(a,b,t){ return a + (b-a)*t; }
  function altitudeToColor(norm) {
    const y = [255,209,42];
    const b = [58,141,255];
    const r = Math.round(lerp(y[0], b[0], norm));
    const g = Math.round(lerp(y[1], b[1], norm));
    const bl = Math.round(lerp(y[2], b[2], norm));
    return `rgb(${r},${g},${bl})`;
  }

  function renderTrail(entry) {
    try {
      if (!entry.trailGroup || !entry.trailSamples || entry.trailSamples.length < 2) return;
      const g = entry.trailGroup;
      while (g.firstChild) g.removeChild(g.firstChild);
      const samples = entry.trailSamples;
      const maxAlt = sessionMaxAltitude.value || 1;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i-1];
        const b = samples[i];
        const sa = worldToSvg(a.x, a.z, true);
        const sb = worldToSvg(b.x, b.z, true);
        if (!sa || !sb) continue;
        const avgAlt = (Number(a.alt || 0) + Number(b.alt || 0)) / 2;
        const norm = maxAlt > 0 ? Math.max(0, Math.min(1, avgAlt / maxAlt)) : 0;
        const color = altitudeToColor(norm);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', sa.sx);
        line.setAttribute('y1', sa.sy);
        line.setAttribute('x2', sb.sx);
        line.setAttribute('y2', sb.sy);
        const rect = container.getBoundingClientRect();
        const cssPixelToSvgUnit = (typeof curVB !== 'undefined' && curVB && curVB.w) ? curVB.w / (rect.width || 1) : 1;
        const strokeWidthSvg = Math.max(1, 3 * cssPixelToSvgUnit);
        line.setAttribute('stroke-width', strokeWidthSvg);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-linejoin', 'round');
        line.setAttribute('opacity', 0.95);
        g.appendChild(line);
      }
      entry.trailDirty = false;
    } catch (e) {
      console.error('renderTrail error', e);
    }
  }

  const sessionMaxAltitude = { value: 0 };

  function start() {
    if (inited) return;
    if (typeof aircraftMarkers === 'undefined' || !svgEl || !container || typeof worldToSvg !== 'function') {
      console.warn('Trails: dependencies missing, aborting start');
      return;
    }
    inited = true;
    console.log('Trails: initialized');

    // Sampling interval
    setInterval(() => {
      const now = Date.now();
      aircraftMarkers.forEach((entry, id) => {
        try {
          if (!entry || (!entry.state && !entry.target)) return;
          ensureTrailForEntry(entry);
          const lastTs = entry.lastTrailSampleTs || 0;
          if (now - lastTs < TRAIL_SAMPLE_MS) return;
          let px = (entry.state && Number(entry.state.x)) || (entry.target && Number(entry.target.x)) || 0;
          let pz = (entry.state && Number(entry.state.z)) || (entry.target && Number(entry.target.z)) || 0;
          const heading = Number((entry.raw && (entry.raw.heading || (entry.target && entry.target.heading))) || (entry.state && entry.state.heading) || 0);
          const speed = Number((entry.raw && (entry.raw.speed || entry.raw.groundSpeed || entry.raw.groundspeed)) || 0);
          const lastUpdate = entry.lastTs || Date.now();
          const dt = Math.max(0, (now - lastUpdate) / 1000);
          const rad = (heading || 0) * Math.PI / 180;
          const dx = Math.sin(rad) * speed * dt * SPEED_UNIT_FACTOR;
          const dz = -Math.cos(rad) * speed * dt * SPEED_UNIT_FACTOR;
          px += dx; pz += dz;
          const alt = Number((entry.raw && (entry.raw.altitude || entry.raw.alt)) || 0);
          addTrailSample(entry, px, pz, alt, now);
          entry.lastTrailSampleTs = now;
        } catch (e) { console.error('Error sampling trail for', id, e); }
      });
    }, TRAIL_SAMPLE_MS);

    // Render interval
    setInterval(() => {
      aircraftMarkers.forEach((entry) => {
        try {
          if (entry && entry.trailDirty) renderTrail(entry);
        } catch (e) { console.error('Error rendering trail', e); }
      });
    }, TRAIL_RENDER_MS);

    // Hook removal to clean up trail groups
    const origRemove = window.removeAircraftSVG;
    window.removeAircraftSVG = function(id){
      try {
        const sid = String(id);
        const entry = aircraftMarkers.get(sid);
        if (entry && entry.trailGroup && entry.trailGroup.parentNode) entry.trailGroup.parentNode.removeChild(entry.trailGroup);
      } catch (e) { /* ignore */ }
      return origRemove ? origRemove(id) : undefined;
    };

    // Also clean up when clearAllAircraftSVG is called — patch if available
    const origClear = window.clearAllAircraftSVG;
    window.clearAllAircraftSVG = function(){
      try {
        aircraftMarkers.forEach((entry) => {
          if (entry && entry.trailGroup && entry.trailGroup.parentNode) entry.trailGroup.parentNode.removeChild(entry.trailGroup);
        });
      } catch (e) { /* ignore */ }
      return origClear ? origClear() : undefined;
    };
  }

  // Poll for readiness
  (function waitForReady(){
    let waited = 0;
    const iv = setInterval(() => {
      if (typeof aircraftMarkers !== 'undefined' && typeof svgEl !== 'undefined' && typeof container !== 'undefined' && typeof worldToSvg === 'function'){
        clearInterval(iv);
        start();
        return;
      }
      waited += POLL_MS;
      if (waited >= MAX_WAIT_MS) {
        clearInterval(iv);
        console.warn('Trails: timeout waiting for LFTracker globals; trails disabled');
      }
    }, POLL_MS);
  })();

})();
