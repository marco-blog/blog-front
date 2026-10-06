# blog-front

[한국어](README.md) | **English** | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

React SSR front end of the Blog Platform (`blog.java21.net`), built with React + Vite + TypeScript, React Router framework mode (SSR) and a custom Express server.
Specs and principles live in the sibling repository `blog-docs`. The Korean README is the reference version.

## Requirements

- Node.js 22.18 or later (22 LTS). `server.ts` runs directly with Node's built-in TypeScript support.
- API and image requests need the backend (`blog-backend`) at `http://localhost:8080`. The home and 404 pages render without it.

## Run

```bash
npm install
cp .env.example .env      # edit if needed
npm run dev               # dev server at http://localhost:5173 (Vite HMR)
npm run build             # production build (build/client, build/server)
npm start                 # run the build with NODE_ENV=production
```

## Environment variables

`npm run dev` and `npm start` read `.env` if it exists. Do not commit `.env`; keep only `.env.example`.

| Name               | Default                                                       | Description                                                                                                       |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `BLOG_BACKEND_URL` | `http://localhost:8080`                                       | Backend address, used by the proxy (`/api/**`, `/media/**`, ...) and by SSR loaders/actions                       |
| `PORT`             | `5173`                                                        | Front server port. Must match a backend allowed origin locally (`http://localhost:5173`, `http://localhost:3000`) |
| `NODE_ENV`         | `development` for `npm run dev`, `production` for `npm start` | Development mode renders through Vite middleware                                                                  |

## Checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test                  # Vitest with coverage; fails below 80% line coverage
npm run e2e               # Playwright against a built server
```

`npm test` includes the translation check, which fails if any key is missing or empty in any of the four languages.
