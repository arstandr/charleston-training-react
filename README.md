# Charleston Training (React)

Vite + React version of the Charleston Training app. Shares the same Firestore database as the legacy `public/` app.

## Setup

```bash
cd react-app
npm install
npm run dev
```

Open http://localhost:5173. Sign in with employee numbers (e.g. 0000, 1234, 7890).

## Build for production

```bash
npm run build
```

To deploy: point Firebase hosting to `react-app/dist` in `firebase.json`, then `firebase deploy --only hosting`.
