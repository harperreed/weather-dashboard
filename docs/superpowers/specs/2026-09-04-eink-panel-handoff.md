# Handoff: eInk Weather Panel (680×710) + Phone (1a)

## What's being built
A redesign of the `harperreed/weather-dashboard` frontend. Two approved outputs, one shared hierarchy:

1. **eInk panel — 680×710 portrait iframe** (final direction: option **5a–5d**, evolved from 3a/2b). This is the primary deliverable.
2. **Phone / desktop, blue theme** (option **1a**). Secondary; same data and rules.

Constraints: keep the theme system (`[data-theme]`), URL config, widget catalog, providers and the eInk skin contract intact — 8px gutter, `#eeeeee` page, `#fff` cards, 2px `#000` borders, no color, no opacity, no radii, hierarchy via weight and hatch fills.

## About the reference file
`Weather Dashboard Redesign.dc.html` (+ `support.js`) is a **design reference** rendered in HTML with sample data. Open it in a browser; pan/zoom. Every option carries a badge:
- **5a 5b 5c 5d** — FINAL eInk panel, four seasons, adaptive chart. Build this.
- **1a** — FINAL phone layout.
- 4a–4d, 3a, 2b — earlier steps toward 5x (useful for diffing, not targets). 1b, 1c, 1d, 2a — rejected.

Do not ship the reference; recreate inside the existing vanilla web components (`current-weather`, `hourly-forecast`, `solar-progress`, `moon-phase`…) and their CSS. Fidelity is **high**: sizes, weights, spacing, and chart geometry below are final.

---

## 1. eInk panel 680×710 (options 5a–5d)

### Frame
680×710, `background:#eeeeee; color:#000; padding:8px; box-sizing:border-box`, flex column, `gap:8px`. Font `system-ui, -apple-system, sans-serif`. All numerals `font-variant-numeric: tabular-nums`. Three children: **Stat card**, **Hours card** (flex:1), **Footer strip**. Nothing may overflow horizontally; the panel must fit at exactly 710px tall with the chart absorbing height differences.

### 1.1 Stat card
`background:#fff; border:2px solid #000; padding:12px 18px 14px`, column, `gap:10px`.

**Row A — flex, align-items:center, gap:20px**
- Temperature: `font-size:176px; line-height:.82; font-weight:900; letter-spacing:-.07em; margin-left:-10px; white-space:nowrap`. Renders `-4°` and `104°` without wrapping — allow the text column to shrink (`min-width:0; flex:1`).
- Text column: `border-left:2px solid #000; padding-left:20px; min-height:144px; justify-content:center; gap:6px; flex:1; min-width:0`.
  - Location line: `CHICAGO · WED 9:05PM` — 16px, 800, `.08em`, uppercase.
  - Summary: 26px, 800, line-height 1.1, `text-wrap:balance`. **Wraps to two lines**; never truncate. The row grows with it.
  - HIGH/LOW: flex gap 18px. Each `<span style="white-space:nowrap">` — label 13px/800/`.1em`/margin-right 6px, value 32px/900. Render only when both are finite (existing rule). Keep aria-label "Today's high X degrees, low Y degrees".

**Row B — three-temperature bars**
Grid `auto 1fr auto`, `gap:5px 12px`, align center, `border-top:2px solid #000; padding-top:10px`.
Rows in order AIR / WET BULB / FEELS. Label 14px/800/`.1em`, label column width 90px. Bar height 18px. Value 26px/900, right-aligned, value column 64px.
- AIR fill: solid `#000`.
- WET BULB fill: hatch `repeating-linear-gradient(45deg,#000 0 2px,transparent 2px 5px)` + `1px solid #000` border.
- FEELS fill: `1px solid #000` border, empty.
- **Scale (shared):** `lo = min(0, air, wet, feels)`, `hi = max(air, wet, feels)`, `width% = max(2, round((v − lo)/(hi − lo || 1) × 100))`. The largest of the three is the full track; AIR is *not* always 100% (heat dome: FEELS 106° full, AIR 94° shorter; −4°/−27°: short bars against a zero baseline). Never clamp to make them equal.

### 1.2 Hours card
`flex:1; background:#fff; border:2px solid #000; padding:12px 16px 10px`, column, `gap:6px; min-height:0`.

- **Caption row** — flex space-between, 15px/800/`.1em`/uppercase: left `NEXT 12 HOURS`; right = channel caption (see §3).
- **Chart area** — `position:relative; flex:1; min-height:0` (≈165–230px depending on summary wrap). Layers, back to front:
  1. **Dark band** (if any hour is after sunset / before sunrise): absolutely positioned, `top:0; bottom:0; left:{darkStart/12×100}%; width:{(darkEnd−darkStart)/12×100}%`, fill `radial-gradient(#000 0.8px, transparent 0.9px) 0 0 / 6px 6px`, `border-left:1px dashed #000`. Dark hours are contiguous within the 12-hour window (one band). If the window starts dark and ends dark with day between, render two bands.
  2. **Bars** — 12-col grid `repeat(12,1fr)`, `gap:6px`, `align-items:end`. Bar: `height:{barPct}%`, hatch `repeating-linear-gradient(45deg,#000 0 2px,transparent 2px 6px)`, `border:1px solid #000; border-bottom:none`. `barPct = max(2, round(value / channelMax × 90))`; when channel is `none`, render no bars.
  3. **Temperature line** — SVG `viewBox="0 0 632 230" preserveAspectRatio="none"`, absolutely filling the area, `overflow:visible`. Polyline `stroke:#000; stroke-width:5; stroke-linejoin/linecap:round; vector-effect:non-scaling-stroke`. Points: `x = (i + 0.5) × 632/12`, `y = 16 + (1 − (t − min)/(max − min)) × (230 − 32)`; flat range → centered line. Current-hour marker: circle `r=8 fill=#fff stroke=#000 stroke-width=3` at point 0.
- **Hour labels** — same 12-col grid, gap 6px, each cell centered column: temp 24px/900; time 14px/800; channel label 13px/800, `min-height:16px` (reserve the row even when empty). Channel label shows only above the channel's `labelAt` threshold.
- **Legend** — flex gap 16px, 12px/800/`.06em`/uppercase, `padding-top:6px; border-top:1px solid #000`. Items: line swatch 16×4 `#000` "TEMPERATURE"; hatch swatch 10×11 + channel legend text (omit when channel `none`); dotted swatch 12×11 "DARK" (omit when no dark band).

### 1.3 Footer strip
Grid `1fr 1fr 1fr`, `gap:8px`. Cell: `padding:12px 14px; font-size:18px; font-weight:800; line-height:1.2`. Cell 1 inverted (`background:#000; color:#fff`), cells 2–3 `#fff` + `2px solid #000`. Text may wrap to two lines. Contents from §4.

---

## 2. Phone / desktop (option 1a, blue theme)
Unchanged from the previous handoff; kept here for completeness. Container 390 wide (scales to existing desktop container widths). `--bg-primary` gradient `linear-gradient(135deg,#1e3a8a,#3b82f6 50%,#60a5fa)`, white text, padding 28px 24px 32px, column gap 28px.
1. Header: `CHICAGO` / `TUE 1:40PM`, 13px/600/`.06em`/uppercase/opacity .85.
2. Temp 168px/200/line-height .9/`-.06em`/margin-left −8px. Summary 22px/500. HIGH/LOW row: label 11px/`.1em`/opacity .75, value 17px/600, high `--temp-high` `#fef3c7`, low `--temp-low` `#dbeafe`.
3. Three-temperature module (margin-top 18px): 3-col FEELS · WET BULB · AIR, label 11px/700, value 26px/600; track 14px tall with 2px line `rgba(255,255,255,.3)`, filled to wet-bulb position in `#dbeafe`; dots 10px (feels filled `#dbeafe` left, wet-bulb filled white at `(wet−feels)/(air−feels)`, air ring right). Explainer 12px/opacity .75 (§4 wet-bulb clause).
4. Insight card: 16px/1.45, padding 14px 16px, radius 14px, `rgba(15,23,42,.45)`, border `rgba(255,255,255,.15)`.
5. Next 12 hours: caption 11px/700/uppercase/opacity .8 + channel caption; chart 150px, bars `rgba(219,234,254,.35)` radius 3px top, line `#fef3c7` width 3, marker white r5; hour cells temp 13px/700, time 10px/.75, label 10px/600 `#dbeafe`; legend 11px. Same channel rules as §3 (bar color stays the same across channels; legend names it).
6. Sun + Moon cards, 2-col, `--card-bg`/`--card-border`, radius 14px, padding 14px. Sun: "Sets 4:31pm" 20px/600, 4px progress bar `#fef3c7`, "2h 51m of daylight left" 12px. Moon: phase name 20px, 18px illumination circle `linear-gradient(90deg,#fff 0 {pct}%, rgba(255,255,255,.2) {pct}%)`, "72% lit · rises 3:12pm".
Light theme: surfaces `#f8fafc`, borders `rgba(0,0,0,.1)`, high `#b45309`, low `#0369a1`, bar `rgba(3,105,161,.25)`, line `#b45309`.
Default widget set: current, hourly, solar, moon, alerts (only when present). Others stay available via `widgets=`.

---

## 3. Adaptive secondary channel (the bars)
The bar layer shows the single most decision-relevant variable for the next 12 hours. Evaluate in order; first match wins.

| Priority | Channel | Trigger | Bar max | Label from | Caption (right of NEXT 12 HOURS) | Legend |
|---|---|---|---|---|---|---|
| 1 | Precip chance | any hour ≥ 20% | 100 | ≥ 40 → `70%` | `SNOW 4PM–7PM` — noun from `precipitation_type` (Snow/Rain/Sleet; "Precip" if mixed/unknown); window = contiguous hours ≥ 60%. If trigger met but no hour ≥ 60: `RAIN POSSIBLE` | `Chance of rain` / `Chance of snow` |
| 2 | Wind gusts | any hour ≥ 20 mph | max(40, peak) | ≥ 25 → `38` | `GUSTS 38 MPH 8AM–3PM` (hours ≥ 25 mph); else `BREEZY` | `Wind gusts, mph` |
| 3 | UV index | any daytime hour ≥ 6 | 11 | ≥ 6 → `11` | `UV 11 PEAK 3PM` | `UV index` |
| 4 | *(reserved)* AQI | US AQI ≥ 101 | 300 | ≥ 101 | `AIR QUALITY UNHEALTHY 2PM–6PM` | `Air quality (AQI)` |
| 5 | none | — | — | — | `DRY, CALM` | *(no legend item)* |

Notes: bar fill/hatch is identical across channels — only caption and legend change, so the user learns one shape. The `rainLabel` row is always reserved (min-height 16px) so the hour grid doesn't jump when the channel changes. Priority 4 is designed but unbuilt in the reference; add when AQI hourly data is wired.

---

## 4. Insight rules (client-side, no LLM)
Inputs: `temp`, `feels_like`, `wet_bulb`, `high`, `low`, hourly precip/type, sunrise/sunset, moon.

**Footer cell 1 (inverted) — how it feels**
- `temp − feels ≥ 10` → `Feels like {feels}° in the wind`
- `feels − temp ≥ 6` → `Humidity makes it feel like {feels}°`
- otherwise → `Feels like {feels}°`

**Footer cell 2 — the one thing to know** (first match)
- `wet_bulb ≥ 80°F` → `Wet bulb dangerous — avoid exertion`
- `wet_bulb ≥ 70°F` → `Wet bulb high — limit hard exertion`
- otherwise → `{low}° tonight` (daytime) / `{low}° by morning` (after sunset)

**Footer cell 3 — sky clock**
- Daytime: `Sunset {t} · Moon {pct}%`
- Night: `Sunrise {t} · Moon {pct}%`
- Pre-dawn morning (before sunrise): `Sunrise {t} · Sunset {t}`

**Phone insight sentence (1a)** — join applicable fragments with spaces:
- wind chill (as cell 1 rule, long form: `Wind makes {temp}° feel like {feels}°.`)
- precip window: `{Noun} likely {start}–{end}, heaviest around {peak}.`
- overnight: `Falling to {low}° overnight — layers and a hat.` (clause only < 20°F; `— bring a jacket` 20–45°F; no clause above)
- wet-bulb explainer (1a module): `Wet bulb is what the air feels like on damp skin — ` + (`dangerous for exertion.` ≥ 80 / `limit hard exertion.` 70–79 / `safe for exertion above 50°, this is well under.` < 50 / drop clause otherwise).

**Units**: when `units=C`, convert all displayed values; thresholds above are °F — convert thresholds, not the comparison.

---

## 5. Data requirements
- **Wet bulb** — not in providers today. Compute from temp + RH (Stull 2011 approximation is fine) in `weather_providers.py`, expose as `current.wet_bulb`. Open-Meteo also has `wet_bulb_temperature_2m` hourly.
- **Hourly wind gusts, UV index** — Open-Meteo `wind_gusts_10m`, `uv_index`; Pirate Weather has `windGust`, `uvIndex` hourly. Expose per hour.
- **Sunrise/sunset** — exists; compute `darkStart/darkEnd` indices within the 12-hour window client-side.
- Everything else (hourly temp/precip prob/type, daily high/low, moon) exists.

## 6. Sample scenes used in the reference (for tests / storybook)
- **Cold snap (3a, 1a)**: Tue 1:40pm · 18° · feels 4 · wet 12 · H23 L9 · "Overcast, bitter wind" · temps 18,19,19,17,15,13,11,10,9,9,8,7 · precip 10,20,40,70,80,75,60,40,30,20,10,10 · sunset 4:31pm, 71% through day · moon waxing gibbous 72%, rises 3:12pm.
- **5a Spring** Thu 3:10pm · 64/64/58 · H71 L44 · "Thunderstorms building" · 3pm→2am temps 64,66,71,68,62,57,54,51,49,47,46,44 · rain 20,45,80,90,85,60,30,20,10,10,10,10 · dark from index 5 · Sunset 7:32pm · Moon 34%.
- **5b Summer** Sat 12:45pm · 94/106/82 · H99 L79 · "Hazy, oppressive humidity" · 1pm→12am temps 95,97,99,99,98,96,93,90,87,85,83,81 · rain 5,5,10,15,15,10,5,5,5,5,5,5 · UV 10,11,11,10,8,6,4,2,0,0,0,0 · dark from 8 · Sunset 8:24pm · Moon 91%.
- **5c Fall** Mon 7:20am · 41/33/37 · H54 L38 · "Clear, gusty off the lake" · 8am→7pm temps 42,44,47,50,52,54,54,53,51,48,45,43 · rain ≤15 · gusts 28,31,34,36,38,35,30,26,22,18,15,12 · dark from 11 · Sunrise 7:04am · Sunset 6:12pm.
- **5d Winter** Wed 9:05pm · −4/−27/−6 · H3 L−11 · "Light snow, dangerous wind chill" · 10pm→9am temps −5,−6,−7,−8,−9,−10,−11,−11,−10,−8,−5,−2 · snow 70,75,65,50,40,30,20,10,10,5,5,5 · dark 0–10 · Sunrise 7:14am · Moon 12%.

Expected channel per scene: 5a precip, 5b UV, 5c wind, 5d precip. Expected bar widths 5b: FEELS 100%, AIR 89%, WET 77%. 5d (lo=−27, hi=−4): AIR 100%, WET 91%, FEELS 2%.

## 7. Edge cases to handle
- Temperatures of 3 digits or negative: hero must not wrap; text column shrinks.
- Summary strings up to ~30 chars wrap to two lines; the stat card grows, the chart shrinks — never let the footer fall off the 710px panel. If the chart would drop below 140px, reduce summary to 22px.
- Flat temperature range (max == min): draw the line centered.
- Missing wet bulb / feels-like: drop that bar row (don't render a 0 bar).
- Channel `none`: no bars, no channel legend, hour-label row still reserved.
- eInk refresh: no transitions/animations; render once per data fetch.

## 8. Tokens
eInk: page `#eeeeee`, card `#fff`, ink `#000`, border 2px, hatch 45° `#000 0 2px / transparent 2px 5–6px`, dots `radial-gradient(#000 .8px, transparent .9px) / 6px`.
Blue: gradient `#1e3a8a→#3b82f6→#60a5fa`; text `#fff`; card `rgba(255,255,255,.1)`/border `.2`; dark surface `rgba(15,23,42,.45)`; high `#fef3c7`; low `#dbeafe`; bar `rgba(219,234,254,.35)`.
Type (eInk): 176 hero · 32 hi/lo · 26 summary & bar values · 24 hourly temp · 18 footer · 16 location · 15 caption · 14 labels & hour time · 13 hour label · 12 legend. Weights 800 UI, 900 numerals.
Spacing: 5, 6, 8, 10, 12, 14, 16, 18, 20.

## Files
- `Weather Dashboard Redesign.dc.html` — reference (badges 5a–5d, 1a are final).
- `support.js` — runtime for the reference only.

## 9. Where the reference and this document disagree
Three places where §4's prose does not describe what the 5a–5d scenes render.
The scenes are the pixel target, so each is resolved in the scenes' favour and
recorded here rather than left for the next reader to rediscover.

1. **Footer cell 3, morning.** §4 gates the `Sunrise {t} · Sunset {t}` string on
   "before sunrise". Scene 5c reads 7:20am against its own 7:04am sunrise and
   still shows it. The case is the morning, not the dark before it: the panel
   keeps that string until an hour past sunrise, then falls through to
   `Sunset · Moon`. All four scenes match.
2. **Footer cell 2, after sunset.** §4 offers `{low}° by morning` for the hours
   after sunset. Scene 5d is 9:05pm and shows `-11° tonight`. No scene ever
   renders the `by morning` form, so the panel does not build it — the overnight
   low is always `{low}° tonight`.
3. **Reading values, right edge.** The reference gives its AIR value span
   `width: 64px` and its WET BULB and FEELS spans no width at all. In an `auto`
   grid column sized by the widest cell, that leaves AIR's number 3px short of
   the other two — visible in `5b.png` as `94°` ending at x=647 where `82°` and
   `106°` end at x=650. The panel right-aligns all three to one edge. This is
   the only place it renders something other than what the reference renders.
