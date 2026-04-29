Tableau
=======

Full-scale in-browser PDF editor and signature app.

## Features

- Upload and render multi-page PDFs directly in the browser.
- Navigate pages and add annotations per page.
- Annotation tools:
  - Text placement
  - Freehand drawing
  - Saved signature stamping
  - Select/move previously placed elements
- Undo and clear actions per page.
- Signature studio with draw, clear, and save workflows.
- Export a new edited PDF with all annotations flattened.
- Built-in ad slot scaffolding (top, inline, and sticky bottom placements).
- Optional ad consent banner and persisted preference for hosted deployments.

## Run

No build step is required. Open `index.html` in any modern browser with internet access for CDN assets.

## Tech stack

- PDF.js for rendering.
- PDF-Lib for PDF writing/export.
- Vanilla HTML/CSS/JavaScript UI.

## Ad-hosting readiness

This app now includes ad containers and consent controls so it can be safely hosted with ad inventory:

- Reserved ad placements:
  - Top banner slot
  - Inline content rectangle in the workspace
  - Sticky footer slot
- A consent banner that stores user preference (`tableau_ad_consent`) in `localStorage`.
- Runtime hook for ad network scripts with `window.TABLEAU_ADSENSE_CLIENT_ID`.

To enable Google AdSense at deploy time, inject your publisher ID before `app.js` runs:

```html
<script>
  window.TABLEAU_ADSENSE_CLIENT_ID = "ca-pub-xxxxxxxxxxxxxxxx";
</script>
```

If no client ID is provided, the app keeps placeholder ad boxes without loading ad scripts.

## Deploy to Vercel

### Option A: Vercel Dashboard (no CLI required)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel, click **Add New Project** and import the repository.
3. Keep defaults (no framework preset required).
4. Deploy.

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel
vercel --prod
```

### Project config included

- `vercel.json` is included with:
  - clean URLs enabled,
  - basic security headers,
  - cache headers for `app.js` and `styles.css`.

After deployment, configure your ad publisher ID in your hosted HTML (or inject at build/deploy time):

```html
<script>
  window.TABLEAU_ADSENSE_CLIENT_ID = "ca-pub-xxxxxxxxxxxxxxxx";
</script>
```
