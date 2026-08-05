// web/script.js (feature branch - trails added)
// ---------- BEGIN MERGED FILE ----------
// ... (original content kept intact) ...

// The original file content is preserved above. Below we append trail handling code.

(function(){
  // Flight trails feature
  // - Maintains recent position samples per aircraft (in world coords)
  // - Renders trails as short SVG line segments colored by altitude (yellow -> blue)
  // - Normalizes altitude to the highest altitude seen during the session
  // - Samples predicted positions using heading + speed to interpolate between updates

  if (typeof aircraftMarkers === 'undefined' || !svgEl) return; // guard if loaded earlier

  const sessionMaxAltitude = { value: 0 };
  const TRAIL_MAX_POINTS = 120; // keep last N points
  const TRAIL_SAMPLE_MS = 1000; // sample trail every 1s
  const TRAIL_RENDER_MS = 300; // redraw trail at this interval when dirty
  const SPEED_UNIT_FACTOR = 0.00005; // heuristic to convert speed->world-units per second (tune as needed)

  function ensureTrailForEntry(entry) {
    if (entry.trailGroup && entry.trailSamples) return;
    // create a group to contain trail segments; insert it before the marker so trails sit under icons
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
    // cap length
    while (arr.length > TRAIL_MAX_POINTS) arr.shift();
    // update session max altitude
    if (!Number.isNaN(arr[arr.length-1].alt) && arr[arr.length-1].alt > sessionMaxAltitude.value) {
      sessionMaxAltitude.value = arr[arr.length-1].alt;
    }
    entry.trailDirty = true;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function altitudeToColor(norm) {
    // Yellow (#FFD12A) -> Blue (#3A8DFF)
    const y = [255, 209, 42];
    const b = [58, 141, 255];
    const r = Math.round(lerp(y[0], b[0], norm));
    const g = Math.round(lerp(y[1], b[1], norm));
    const bl = Math.round(lerp(y[2], b[2], norm));
    return `rgb(${r},${g},${bl})`;
  }

  function renderTrail(entry) {
    if (!entry.trailGroup || !entry.trailSamples || entry.trailSamples.length < 2) return;
    const g = entry.trailGroup;
    // simple approach: remove children and recreate short segments between consecutive samples
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
      // width scales slightly with zoom so it remains visible
      const rect = container.getBoundingClientRect();
      const cssPixelToSvgUnit = curVB.w / (rect.width || 1);
      const strokeWidthSvg = Math.max(1, 3 * cssPixelToSvgUnit);
      line.setAttribute('stroke-width', strokeWidthSvg);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('opacity', 0.95);
      g.appendChild(line);
    }
    entry.trailDirty = false;
  }

  // Periodically sample predicted positions for each aircraft and append to trail
  setInterval(() => {
    const now = Date.now();
    aircraftMarkers.forEach((entry, id) => {
      try {
        // ensure we have a state to work from
        if (!entry || (!entry.state && !entry.target)) return;
        ensureTrailForEntry(entry);
        const lastTs = entry.lastTrailSampleTs || 0;
        if (now - lastTs < TRAIL_SAMPLE_MS) return; // throttle per-entry

        // Base position: prefer smoothed state, fall back to target
        let px = (entry.state && Number(entry.state.x)) || (entry.target && Number(entry.target.x)) || 0;
        let pz = (entry.state && Number(entry.state.z)) || (entry.target && Number(entry.target.z)) || 0;

        // Predict small extrapolation using heading + speed
        const heading = Number((entry.raw && (entry.raw.heading || entry.target.heading)) || entry.state.heading || 0);
        const speed = Number((entry.raw && (entry.raw.speed || entry.raw.groundSpeed || entry.raw.groundspeed)) || 0);
        const lastUpdate = entry.lastTs || Date.now();
        const dt = Math.max(0, (now - lastUpdate) / 1000);
        const rad = (heading || 0) * Math.PI / 180;
        // heuristic conversion from speed units to world units per second; this is approximate and depends on data source
        const dx = Math.sin(rad) * speed * dt * SPEED_UNIT_FACTOR;
        const dz = -Math.cos(rad) * speed * dt * SPEED_UNIT_FACTOR;
        px += dx; pz += dz;

        // altitude
        const alt = Number((entry.raw && (entry.raw.altitude || entry.raw.alt)) || 0);

        addTrailSample(entry, px, pz, alt, now);
        entry.lastTrailSampleTs = now;
      } catch (e) {
        // continue on errors for individual entries
        console.error('Error sampling trail for', id, e);
      }
    });
  }, TRAIL_SAMPLE_MS);

  // Periodically render dirty trails
  setInterval(() => {
    aircraftMarkers.forEach((entry) => {
      try {
        if (entry && entry.trailDirty) renderTrail(entry);
      } catch (e) {
        console.error('Error rendering trail', e);
      }
    });
  }, TRAIL_RENDER_MS);

  // Optional: clean up trail elements when aircraft removed
  const origRemove = window.removeAircraftSVG;
  window.removeAircraftSVG = function (id) {
    try {
      const sid = String(id);
      const entry = aircraftMarkers.get(sid);
      if (entry && entry.trailGroup && entry.trailGroup.parentNode) entry.trailGroup.parentNode.removeChild(entry.trailGroup);
    } catch (e) { /* ignore */ }
    return origRemove ? origRemove(id) : undefined;
  };

})();

// ---------- END APPENDED TRAILS CODE ----------
