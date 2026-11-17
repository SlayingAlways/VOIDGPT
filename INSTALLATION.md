# Installation

This guide walks you through installing and deploying **VOIDGPT** — a Next.js App Router app with "Sign in with ChatGPT", aligned with the original VOIDGPT Express app's features, deployable on Vercel.

## Features (aligned with original VOIDGPT)

- **ChatGPT-like UI** — dark-themed sidebar, message bubbles, composer, streaming responses
- **VOIDGPT branding** — `voidgpt.png` logo rendered with the **Astroz** custom font
- **Sidebar chat list** — persistent and temporary chats, sorted by recency
- **Model picker** — choose `gpt-5-mini`, `gpt-5.4-mini`, or `gpt-5-nano`
- **Streaming chat** — responses stream in from your server via `/api/chat`
- **Stop button** — cancel an in-progress response
- **Composer** — Enter to send, Shift+Enter for newline
- **Slash commands** — `/new`, `/temp`, `/model`, `/settings`, `/stop`, `/help`
- **Settings dialog** — theme (dark/light), default model
- **Theme persistence** — dark/light theme saved to localStorage
- **Chat persistence** — chats saved to localStorage
- **"Sign in with ChatGPT"** — browser extension auth via `@openai-oauth/react`

## Prerequisites

- **Node.js 20 or newer** (22+ recommended)
- **npm** (comes with Node.js)
- A **ChatGPT account** that can use the models you want to query
- The **"Sign in with ChatGPT"** browser extension installed:
  - [Chrome](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna)
  - [Firefox](https://addons.mozilla.org/firefox/addon/sign-in-with-chatgpt/)
- A running `openai-oauth` bridge reachable from your server (see [Bridge URL](#bridge-url))

## Step 1: Get the code

```bash
cd nextjs-vercel-app
```

## Step 2: Install dependencies

```bash
npm install
```

This installs:
- `@openai-oauth/react` — `SignInWithChatGPT`, `useSignInWithChatGPT`, `openaiAuthHeaders()`
- `@openai-oauth/ai-sdk` — `createOpenAIOAuth()` for the server
- `ai` + `@ai-sdk/react` — `useCompletion()` and `streamText()`
- `next@16`, `react@19` — the web framework

## Step 3: Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable | Example | Required | Notes |
|----------|---------|----------|-------|
| `OPENAI_OAUTH_BRIDGE_URL` | `https://your-bridge.example.com` | **Yes** | Public URL of your running `openai-oauth` bridge |
| `CHAT_MODEL` | `gpt-5-mini` | No | Defaults to `gpt-5-mini` if not set |

### Bridge URL (important)

Vercel serverless functions **cannot** reach `127.0.0.1` on your local machine. You must deploy the `openai-oauth` bridge somewhere publicly reachable, or use a tunnel for testing.

To start the bridge locally for development:

```bash
npx openai-oauth@latest
```

The bridge listens at `http://127.0.0.1:10531`. For local development only, set:

```
OPENAI_OAUTH_BRIDGE_URL=http://127.0.0.1:10531
```

For production on Vercel, deploy the bridge to a public host (VPS, Railway, Render, Fly.io, etc.) and set `OPENAI_OAUTH_BRIDGE_URL` to its HTTPS URL in the Vercel dashboard.

## Step 4: Run locally (development)

1. Start the `openai-oauth` bridge in one terminal:
   ```bash
   npx openai-oauth@latest
   ```

2. Start the Next.js dev server in another terminal:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000)

4. Install/sign in with the "Sign in with ChatGPT" browser extension, then type a message in the composer and press **Enter** or click **Ask**.

## Step 5: Build for production

```bash
npm run build
```

This creates an optimized production build in the `.next` folder.

## Step 6: Deploy to Vercel

### Option A: Connect via GitHub (recommended)

1. Push your code to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and import your repository.

3. Vercel detects **Next.js** automatically. Use these settings:
   - **Framework preset:** Next.js
   - **Build command:** `npm run build`
   - **Output directory:** `.next` (default)
   - **Install command:** `npm install`

4. Click **Deploy**.

### Option B: Deploy via Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

Follow the prompts to confirm project settings and deploy.

### Step 7: Add environment variables in Vercel

In the Vercel project dashboard (**Settings → Environment Variables**), add:

| Variable | Value |
|----------|-------|
| `OPENAI_OAUTH_BRIDGE_URL` | `https://your-bridge.example.com` |
| `CHAT_MODEL` | `gpt-5-mini` (optional) |

Redeploy after adding variables.

## Project structure

```
nextjs-vercel-app/
├── app/
│   ├── layout.tsx        # Root layout + metadata
│   ├── globals.css       # Global styles (Astroz font, ChatGPT-like UI)
│   ├── page.tsx          # Main chat UI: sidebar, composer, messages, settings
│   └── api/chat/
│       └── route.ts      # Server API route: createOpenAIOAuth + streamText
├── public/
│   ├── voidgpt.png       # VOIDGPT logo
│   └── fonts/
│       └── Astroz.ttf    # Custom VOIDGPT font
├── next.config.js        # Next.js config (Vercel-ready)
├── tsconfig.json         # TypeScript config
├── package.json          # Dependencies + scripts
├── .env.example          # Environment variable template
├── .gitignore
├── INSTALLATION.md       # This file
└── README.md             # Full project documentation
```

## Using the app

### After signing in

1. The **SignInWithChatGPT** component in the sidebar prompts you to install the extension (Chrome or Firefox) and sign in.
2. Once signed in, the composer is enabled — type your message and press **Enter** or click **Ask**.
3. The assistant's response streams in below your message.
4. Use **Shift+Enter** in the composer for a new line without sending.
5. Click **Stop** to cancel an in-progress response.
6. Use `/new` to start a new chat, `/model gpt-5.4-mini` to switch models, `/settings` to change theme/model.

### Slash commands

| Command | What it does |
|---------|-------------|
| `/new` | Start a new persistent chat |
| `/temp` | Start a temporary chat (not persisted) |
| `/model <id>` | Change model (gpt-5-mini, gpt-5.4-mini, gpt-5-nano) |
| `/settings` | Open the settings dialog |
| `/stop` | Stop the current streaming response |
| `/help` | Show this help |

## Key points for hosting on Vercel

1. **Browser extension requirement:** Users must install the "Sign in with ChatGPT" extension for Chrome or Firefox. The `SignInWithChatGPT` component detects the browser and prompts installation automatically.

2. **CORS limitation:** Model requests cannot be made directly from the browser. This also applies to Electron and Tauri. Requests are routed through your own server — the `/api/chat` route on Vercel handles this. The browser only talks to `/api/chat` on the same origin.

3. **Credential flow:** The browser stores OpenAI credentials in IndexedDB encrypted with WebCrypto. `openaiAuthHeaders()` sends request-bound credentials to your server, where `openaiCredentials(request)` reads them from the `Authorization` and `chatgpt-account-id` headers.

4. **Deploy:** Use `next build` and deploy to Vercel normally. This project uses Next.js 16 with the App Router.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Make sure you're using Node.js 20+. Run `node --version` to check. |
| Build fails | Ensure `tsconfig.json` and `next.config.js` are valid. Run `npm run build` locally to catch errors. |
| "Cannot reach the bridge" | `OPENAI_OAUTH_BRIDGE_URL` must be a public HTTPS URL, not `127.0.0.1`, on Vercel. |
| 401/403 errors | Re-run the bridge login flow. Make sure your ChatGPT plan can use the selected model. |
| Extension not detected | Install the "Sign in with ChatGPT" extension from the Chrome Web Store or Firefox Add-ons site. |
| Composer disabled | Make sure you're signed in (extension installed + login complete) and a chat is selected. |
