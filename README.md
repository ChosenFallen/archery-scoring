# Archery Scoring

A phone app for scoring indoor archery rounds. It installs from Chrome onto your home screen and works offline.

**Open the app: https://chosenfallen.github.io/archery-scoring/**

## What it does

- **World Archery 18m round:** 60 arrows in 20 ends of 3, in two halves.
- **Bows:** recurve, barebow and compound. Compound only scores 10 in the inner ring and has no separate X count.
- **Faces:** 40cm full face (rings 10–1) or triple spot (rings 10–6, anything outside is a miss).
- **Practice rounds:** no set length, with a fixed number of arrows per end or no limit.
- **Two ways to enter scores:** a keypad, or touching and dragging on the target face. Arrows touching a line score the higher ring, taking your arrow shaft diameter into account. Tap an arrow on the target to move it or change its score.
- **Scorecard:** arrows sorted highest first, end and running totals, half subtotals, and 10 and X counts. Tap any end to correct it.
- **History and stats:** personal bests, score trend, first vs second half averages, score distribution and an arrow grouping plot.
- **Backup:** export and import as JSON, and export to CSV for spreadsheets.

Scores are stored only in the phone's browser storage. Nothing is uploaded.

## Install on Android

1. Open https://chosenfallen.github.io/archery-scoring/ in **Chrome**.
2. Tap **⋮** → **Install app** (or **Add to Home screen**).

## Run locally

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

## Files

- `index.html`, `css/styles.css`: page and styles
- `js/rules.js`: round definitions and scoring rules
- `js/face.js`: target face drawing and hit testing
- `js/store.js`: saving to phone storage, backup import and export
- `js/app.js`: screens and interactions
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and installing to the home screen

When adding or renaming files, add them to the `FILES` list in `sw.js` and bump `VERSION`.
