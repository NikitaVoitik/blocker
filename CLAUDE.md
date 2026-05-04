# Site Blocker — Selfie Punishment Mode

Chrome extension (Manifest V3) that blocks distracting sites and captures shame selfies when the user tries to relapse.

## Project Structure

- `popup/` — Extension popup (Blocker + Tracker tabs)
- `blocked/` — Block page shown when visiting a blocked site (camera capture, gallery, leaderboard)
- `report/` — Full-page shame report and time tracking analytics
- `setup/` — First-run camera permissions setup
- `background/` — Service worker
- `offscreen/` — Offscreen document for camera capture
- `content/` — Content scripts (YouTube Shorts hiding)
- `lib/` — Shared utilities (storage, filters)
- `assets/` — Icons and overlay images

## Tech Stack

Plain HTML/CSS/JS — no build step, no frameworks. Load the extension directly from the project root via `chrome://extensions` (developer mode).

## Design System

### Aesthetic Direction

**Brutalist Surveillance Terminal** — sharp-edged, industrial, confrontational. CRT scan-line overlays, no rounded corners, stencil-style typography. The UI should feel like a monitoring facility, not a friendly app.

### Fonts

Load via Google Fonts import at the top of each CSS file:

```
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&display=swap');
```

| Role | Font | Usage |
|------|------|-------|
| Display | **Bebas Neue** | Headers, stat values, buttons, titles. Always uppercase with `letter-spacing: 0.1em+` |
| Body/Data | **Space Mono** | Body text, inputs, labels, data readouts, timestamps |

Never use system fonts, Inter, Roboto, or Arial.

### Color Tokens

All pages use CSS custom properties on `:root`:

```css
--bg: #0a0a0a;           /* near-black background */
--surface: #111113;       /* cards, panels, elevated surfaces */
--border: #2a2a2d;        /* all borders — hard, visible */
--text: #ededef;          /* primary text */
--text-muted: #6b6b70;    /* labels, hints, secondary text */
--accent: #E4FF1A;        /* primary accent — toxic chartreuse */
--accent-dim: rgba(228, 255, 26, 0.08–0.12);  /* accent backgrounds */
--danger: #FF2D2D;        /* shame states, blocked warnings, remove buttons */
--danger-dim: rgba(255, 45, 45, 0.08–0.1);
--track: #00D4FF;         /* tracker tab accent — electric cyan */
--track-dim: rgba(0, 212, 255, 0.08–0.1);
```

- **Accent (chartreuse)** is the default primary for headers, active states, and CTAs
- **Danger (red)** is reserved for shame/block states and destructive actions only
- **Track (cyan)** is used exclusively in the Tracker tab and tracking report

### Layout Rules

- `border-radius: 0` everywhere — no rounded corners
- Grid gaps use `1px` with `background: var(--border)` on parent for cell separators
- Borders are always `1px solid var(--border)` — visible, not subtle
- Dashed borders (`1px dashed var(--border)`) for preset suggestions and empty states
- Negative margins (`margin-bottom: -1px`) on stacked list items to collapse double borders

### Buttons

```css
/* Primary */
background: var(--accent);
color: #000;
border: 1px solid var(--accent);
font-family: 'Bebas Neue', sans-serif;
text-transform: uppercase;
letter-spacing: 0.1em;

/* Secondary */
background: transparent;
border: 1px solid var(--border);
color: var(--text-muted);
```

Hover brightens primaries (`#f0ff4d`), brightens border+text on secondaries. No transform effects on buttons.

### Scan-Line Overlay

Every page applies a CRT scan-line effect via `body::before`:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2–3px,
    rgba(255, 255, 255, 0.005–0.008) 2–3px,
    rgba(255, 255, 255, 0.005–0.008) 4–6px
  );
  pointer-events: none;
  z-index: 9999;
}
```

Popup uses 2px/4px intervals; full pages use 3px/6px.

### Animation Philosophy

- Prefer hard, instant transitions (`0.1s–0.15s`) over smooth easing
- Glitch effects (clip-path, chromatic shift) over fades
- `clip-path: inset()` wipe reveals over opacity fades
- Milestone effects (shake, spin, blur, hue-rotate) at specific attempt counts are preserved from original design
