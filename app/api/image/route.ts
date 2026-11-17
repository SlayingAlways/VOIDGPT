export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    model?: string;
    size?: string;
  };

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const model = body.model || process.env.IMAGE_MODEL || "gpt-image-2";
  const bridgeUrl = (
    process.env.OPENAI_OAUTH_BRIDGE_URL || "http://127.0.0.1:10531"
  ).replace(/\/+$/, "");

  // Prepare headers for the bridge
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const authHeader = request.headers.get("authorization");
  const accountHeader = request.headers.get("chatgpt-account-id");
  if (authHeader) headers["Authorization"] = authHeader;
  if (accountHeader) headers["chatgpt-account-id"] = accountHeader;

  try {
    const upstreamRes = await fetch(`${bridgeUrl}/v1/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        prompt,
        ...(body.size ? { size: body.size } : {}),
      }),
      signal: AbortSignal.timeout(180000), // 3 min timeout for image generation
    });

    const data = await upstreamRes.json().catch(() => null);
    if (!upstreamRes.ok || !data) {
      const errMsg =
        data?.error?.message ||
        data?.error ||
        `Image bridge responded with HTTP ${upstreamRes.status}`;
      return new Response(JSON.stringify({ error: errMsg }), {
        status: upstreamRes.status || 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const isConnRefused =
      err?.code === "ECONNREFUSED" ||
      err?.message?.includes("fetch failed") ||
      err?.message?.includes("ECONNREFUSED");

    return new Response(
      JSON.stringify({
        error: isConnRefused
          ? `Cannot reach OpenAI OAuth bridge at ${bridgeUrl}. Please make sure the bridge is running (npx openai-oauth@latest).`
          : err?.message || "Failed to generate image.",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
