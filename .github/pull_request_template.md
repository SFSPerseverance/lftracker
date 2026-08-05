---
name: "feat(ui): responsive panel + flight trails"
about: "Improve aircraft details panel UX and add flight trails colored by altitude"
---

This PR contains the following changes:

- Responsive, touch-friendly aircraft details panel
  - Rounded panel with 24px inset from viewport edges
  - Larger close button hit target
  - Callsign text ellipsizes to avoid overlap
  - Operator ("Operated by:") label stacked above the airline badge
  - Aircraft type text stacked above the ICAO badge
  - Prevents horizontal scrollbar and avoids badge clipping

- Flight trails
  - Per-aircraft trails rendered as short SVG segments beneath markers
  - Color gradient from yellow -> blue indicating altitude normalized to the highest altitude seen during the current session
  - Regular sampling with small extrapolation using heading + speed to estimate current position between updates
  - Performance safeguards (sampling/render throttling and point caps)

Testing notes
1. Open index.html and allow live aircraft updates to arrive (or simulate updates).
2. Click an aircraft — the panel should slide in, be rounded, and have no horizontal scrollbar.
3. The type text should appear above the ICAO badge; the operator label should appear above the operator badge.
4. Trails should grow behind moving aircraft and change color by altitude (yellow low → blue high).
5. Pan/zoom — trails and icons should scale appropriately. Reduce TRAIL_MAX_POINTS or increase TRAIL_RENDER_MS if you notice performance issues.

Files changed:
- web/panelstyle.css — responsive panel, badge and stacking styles
- web/aircraftpanel.js — DOM structure and injection for stacked labels/badges
- web/script.js — flight trails implementation

Please review and merge when ready.
