# Layout spec (100% zoom, desktop)

Reference viewport: **1920×1080**, root font **16px** (1rem = 16px).  
All `clamp()` values below are resolved for this viewport.

---

## Structure (20 / 60 / 20)

- **Top 20%:** Summary section: min-height **20vh** = **216px**
- **Middle 60%:** Content (projects): min-height **60vh** = **648px**
- **Bottom 20%:** Footer: min-height **20vh** = **216px**

Page is scrollable; sections can grow beyond these minimums.

---

## Horizontal spacing (at 1920px width)

| Where | CSS | Resolved at 1920px |
|-------|-----|--------------------|
| Section padding (summary, content, footer) | `clamp(1rem, 4vw, 2rem)` | **32px** left & right |
| Summary box padding | `clamp(1.25rem, 3vw, 2rem)` | **32px** |
| Projects container | `max-width: 1000px; margin: 0 auto` | **1000px** wide, centered |
| Gap between project blocks | `clamp(1.25rem, 3vw, 2rem)` | **32px** |
| Gap between media box and text box | `clamp(1rem, 3vw, 1.5rem)` | **24px** |
| Media box / text box padding | `clamp(1rem, 2.5vw, 1.5rem)` | **24px** |
| Summary box max-width | – | **900px** |
| Footer box max-width | – | **900px** (left-aligned, not centered) |

---

## Content widths (middle section)

- **Content section** has 32px padding each side → usable width = viewport − 64px (e.g. 1856px at 1920px).
- **.projects** is then **min(1000px, that width)** → **1000px** at 1920px, centered.
- Each **project-block** is a 2-column grid (1fr 1fr) with 24px gap:
  - Each column = **(1000 − 24) / 2 = 488px** (media box and text box each ~488px wide).

---

## Footer (bottom-left)

- **.footer-section** is full-width; flex with `justify-content: flex-start`, `align-items: flex-end`.
- **.footer-box** has `max-width: 900px`, no `margin: 0 auto` → stays left-aligned.
- Footer section padding 32px → year sits **32px** from viewport left, bottom 20% band.

Footer is **not** inside the same centered column as the main content, so the year stays at the true bottom-left of the viewport.

---

## Vertical rhythm (middle section)

- **.media-box** / **.text-box:** `min-height: 200px`, padding 24px, `align-items: start` on the grid so each column heights by content (text fills downward; media + buttons don’t stretch the other column).
- Video/image: `min-height: 200px`, `max-height: 360px`, `object-fit: contain`.

---

## Breakpoint

- **640px:** Project block switches to single column (stacked); summary/footer unchanged.

---

## Summary

- **Summary:** Centered, max **900px**, 32px section padding, 32px internal padding.
- **Projects:** Centered lane max **1000px**, 32px section padding; each row = 488px + 24px + 488px; blocks stacked with 32px gap.
- **Footer:** Full-width band; content max **900px**, left-aligned, 32px padding; year in bottom-left corner of viewport.

Use this spec when adding or changing layout (e.g. article-style margins) so the footer and 20/60/20 structure stay intact.
