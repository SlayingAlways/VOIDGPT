# ChatGPT-in-VOID on Vercel

Next.js App Router app with **Sign in with ChatGPT** via [`openai-oauth`](https://github.com/EvanZhouDev/openai-oauth), ready to deploy on Vercel.

> **Unofficial project.** Not affiliated with, endorsed by, or supported by OpenAI. Use it with your own account and at your own risk.

## How it works

| Layer | Responsibility |
|-------|----------------|
| Browser (`app/page.tsx`) | `SignInWithChatGPT` component prompts the user to install the browser extension and sign in. `openaiAuthHeaders()` reads encrypted credentials from IndexedDB and attaches them to the API request. |
| Vercel API route (`app/api/chat/route.ts`) | `openaiCredentials(request)` extracts credentials from the `Authorization` and `chatgpt-account-id` headers. `createOpenAIOAuth()` builds an OpenAI-compatible client that talks to your `openai-oauth` bridge. `streamText()` streams the model response back to the browser. |

```
Browser ── same-origin POST ──> /api/chat (Vercel function)
                                   │
                                   ▼
                            openai-oauth bridge
                                   │
                                   ▼
                              ChatGPT
```

## Prerequisites

1. **Node.js 20+** (22+ recommended)
2. A ChatGPT account that can use the models you want
3. The **"Sign in with ChatGPT"** browser extension installed:
   - [Chrome](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna)
   - [Firefox](https://addons.mozilla.org/firefox/addon/sign-in-with-chatgpt/)
4. A running `openai-oauth` bridge reachable from Vercel (see below)

## Installation

```bash
# 1. Create the Next.js app (files in this folder)
cd nextjs-vercel-app

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Edit .env and set OPENAI_OAUTH_BRIDGE_URL (see "Bridge URL" below)
```

## Local development

1. Start the `openai-oauth` bridge in a separate terminal:
   ```bash
   npx openai-oauth@latest
   ```
   It listens at `http://127.0.0.1:10531`.

2. Set `OPENAI_OAUTH_BRIDGE_URL=http://127.0.0.1:10531` in `.env` for local testing.

3. Start Next.js:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`, install/sign in with the extension, then click **Ask**.

> Note: For local development the bridge runs on `127.0.0.1`, which your browser and Next.js dev server can both reach. On **Vercel production**, `127.0.0.1` is **not** reachable — see "Bridge URL on Vercel" below.

## Deploy to Vercel

### 1. Push to Git

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Import in Vercel

- Go to [vercel.com](https://vercel.com), click **Add New → Project**, and import your Git repository.
- Framework preset: **Next.js** (detected automatically).
- Build command: `npm run build`
- Output directory: `.next` (default)
- Install command: `npm install`

### 3. Add environment variables

In the Vercel project dashboard (**Settings → Environment Variables**), add:

| Variable | Value | Required |
|----------|-------|----------|
| `OPENAI_OAUTH_BRIDGE_URL` | URL of your deployed bridge | Yes |
| `CHAT_MODEL` | Default model (e.g. `gpt-5-mini`) | No (defaults to `gpt-5-mini`) |

### 4. Deploy

Click **Deploy**. Vercel will build and deploy your Next.js app.

## Bridge URL on Vercel (important)

The `openai-oauth` bridge normally runs locally at `127.0.0.1:10531`. Vercel serverless functions **cannot** reach `127.0.0.1` on your machine. You have two options:

### Option A: Deploy the bridge somewhere public

Deploy `openai-oauth` as its own service (e.g. on a VPS, Railway, Render, Fly.io, etc.) and set `OPENAI_OAUTH_BRIDGE_URL` to its public HTTPS URL.

The bridge exposes an OpenAI-compatible API at `GET /v1/models` and `POST /v1/chat/completions`, which this app's `/api/chat` route calls server-side.

### Option B: Local testing with a tunnel

For testing only, expose your local bridge via [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/), [ngrok](https://ngrok.com/), or similar, and set `OPENAI_OAUTH_BRIDGE_URL` to the tunnel URL (in `.env` locally, or as a Vercel env var for a preview deployment).

## Key points for hosting on Vercel

1. **Browser extension requirement:** Users must install the "Sign in with ChatGPT" extension for Chrome or Firefox. The `SignInWithChatGPT` component detects the browser and prompts installation automatically.

2. **CORS limitation:** Model requests cannot be made directly from the browser. This also applies to Electron and Tauri. Requests are routed through your own server — the `/api/chat` route on Vercel handles this. The browser only talks to `/api/chat` on the same origin.

3. **Credential flow:** The browser stores OpenAI credentials in IndexedDB encrypted with WebCrypto. `openaiAuthHeaders()` sends request-bound credentials to your server, where `openaiCredentials(request)` reads them from the `Authorization` and `chatgpt-account-id` headers.

4. **Deploy:** Use `next build` and deploy to Vercel normally. This project uses Next.js 16 with the App Router.

## Project structure

```
nextjs-vercel-app/
├── app/
│   ├── layout.tsx        # Root layout with metadata
│   ├── globals.css       # Global styles
│   ├── page.tsx          # Client page: SignInWithChatGPT + useCompletion
│   └── api/chat/
│       └── route.ts      # Server API route: createOpenAIOAuth + streamText
├── next.config.js        # Next.js config (Vercel-ready)
├── tsconfig.json         # TypeScript config
├── package.json          # Dependencies
├── .env.example          # Environment variable template
├── .gitignore
└── README.md
```

## License

ISC. See the parent repository's `LICENSE`. The upstream `openai-oauth` project has its own license; review it before redistributing or using commercially.
