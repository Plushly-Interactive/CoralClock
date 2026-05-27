# Subpage tracking — UI layout ideas

Four directions for surfacing per-path data already being collected in `subpagesByDay` / `subpagesByHour`. Mockups are illustrative HTML snippets, not finished markup.

**Previewable mockups** (open in a browser):
- [Index](mockups/index.html) — links to all four
- [A — List below grid](mockups/direction-a.html)
- [B — Tile inside grid](mockups/direction-b.html)
- [C — Site ⇄ Pages toggle](mockups/direction-c.html)
- [D — Dedicated path page](mockups/direction-d.html)

---

## Direction A — List below the grid on `site.html`

A new ranked table below the existing four-chart grid. No navigation changes; minimal new surface area.

**Pros**: smallest change, lives in flow, scrollable.
**Cons**: pushes existing content down; no per-path drill.

```html
<div id="charts-grid">
  <!-- existing 4 chart containers unchanged -->
</div>

<div id="subpages-container" class="chart-container">
  <h2 class="chart-heading">
    Top pages
    <span class="chart-subheading text-meta">last 7 days</span>
  </h2>
  <table id="subpages-table" class="subpages-table">
    <thead>
      <tr><th>Path</th><th>Time</th><th>Visits</th></tr>
    </thead>
    <tbody>
      <tr><td>/r/programming</td><td>1h 42m</td><td>23</td></tr>
      <tr><td>/r/rust</td><td>58m</td><td>14</td></tr>
      <tr><td>/r/popular</td><td>22m</td><td>9</td></tr>
      <!-- … -->
    </tbody>
  </table>
  <button id="subpages-show-all" class="link-btn">Show all</button>
</div>
```

---

## Direction B — New tile inside the existing grid

A fifth `chart-container` alongside Time / Overview / Visits / Hourly.

**Pros**: everything on one screen, no scrolling.
**Cons**: path strings are long and won't fit in a quarter-width tile without truncation; grid becomes asymmetric (5 tiles).

```html
<div id="charts-grid">
  <div id="time-chart-container" class="chart-container">…</div>
  <div id="stats-container" class="chart-container">…</div>
  <div id="visits-chart-container" class="chart-container">…</div>
  <div id="hourly-chart-container" class="chart-container">…</div>

  <div id="subpages-container" class="chart-container">
    <h2 class="chart-heading">Top pages</h2>
    <ol class="subpages-compact">
      <li><span class="path">/r/programmin…</span><span class="time">1h 42m</span></li>
      <li><span class="path">/r/rust</span><span class="time">58m</span></li>
      <li><span class="path">/r/popular</span><span class="time">22m</span></li>
      <li><span class="path">/r/askreddit</span><span class="time">14m</span></li>
      <li><span class="path">/r/news</span><span class="time">9m</span></li>
    </ol>
  </div>
</div>
```

---

## Direction C — Toggle on `site.html`: "Site" ⇄ "Pages"

A segmented control near the header swaps the whole body between the existing site view and a paths view (list + its own charts aggregated per path).

**Pros**: no scrolling; room for richer per-path detail.
**Cons**: hides one view behind the other; adds view-state to manage.

```html
<header>
  <div id="header-left">…</div>
  <div id="header-center">
    <div id="site-title">
      <span id="site-label" class="site-label">reddit.com</span>
      <span id="site-id" class="text-meta"></span>
    </div>
    <div id="view-toggle" class="segmented">
      <button id="view-site-btn" class="seg-btn active">Site</button>
      <button id="view-pages-btn" class="seg-btn">Pages</button>
    </div>
  </div>
</header>

<!-- Default: site view -->
<div id="site-view">
  <div id="charts-grid">…</div>
</div>

<!-- Hidden until toggled -->
<div id="pages-view" style="display:none">
  <div id="pages-controls">
    <input id="pages-search" placeholder="Filter paths…" />
    <select id="pages-sort">
      <option>Most time</option>
      <option>Most visits</option>
    </select>
  </div>
  <table id="pages-table" class="subpages-table">
    <thead>
      <tr><th>Path</th><th>Time</th><th>Visits</th><th>Last visited</th></tr>
    </thead>
    <tbody>…</tbody>
  </table>
</div>
```

---

## Direction D — Dedicated path-drill page (mirrors `site.html`)

Direction A's list, but each row is clickable and opens a `path.html` view with the same chart set scoped to that single path. Mirrors the existing site → drill pattern users already know.

**Pros**: most powerful; consistent with existing navigation; full per-path UI.
**Cons**: most work; another page to maintain.

```html
<!-- site.html: same as Direction A, but rows link out -->
<div id="subpages-container" class="chart-container">
  <h2 class="chart-heading">Top pages</h2>
  <table id="subpages-table" class="subpages-table">
    <tbody>
      <tr>
        <td>
          <a class="link-btn"
             href="./path.html?site=reddit.com&path=%2Fr%2Fprogramming">
            /r/programming
          </a>
        </td>
        <td>1h 42m</td>
        <td>23</td>
      </tr>
      <!-- … -->
    </tbody>
  </table>
</div>
```

```html
<!-- path.html: same structure as site.html, scoped to one path -->
<header>
  <div id="header-left">
    <a id="back-btn" href="./site.html?site=reddit.com">← reddit.com</a>
  </div>
  <div id="header-center">
    <div id="path-title">
      <span id="path-label" class="site-label">/r/programming</span>
      <span id="path-site" class="text-meta">on reddit.com</span>
    </div>
  </div>
</header>

<div id="charts-grid">
  <div id="time-chart-container"   class="chart-container">…</div>
  <div id="stats-container"        class="chart-container">…</div>
  <div id="visits-chart-container" class="chart-container">…</div>
  <div id="hourly-chart-container" class="chart-container">…</div>
</div>

<div id="drill-view" style="display:none">…</div>
```

---

## Recommendation

Start with **A** (list below the grid). Design rows so they can become links later, making **D** an additive next step. Skip **B** — paths don't fit in a quarter-tile.
