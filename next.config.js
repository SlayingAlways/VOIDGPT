/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel deploys Next.js apps as serverless functions.
  // The /api/chat route is a serverless endpoint that proxies
  // model requests through the openai-oauth bridge.
  async headers() {
    return [
      {
        source: "/api/chat",
        headers: [
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, chatgpt-account-id" },
        ],
      },
    ];
  },
};

export default nextConfig;
