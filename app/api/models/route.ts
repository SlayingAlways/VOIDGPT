export const runtime = "nodejs";

const CODEX_MODELS = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.4-mini",
];

export async function GET(request: Request) {
  const bridgeUrl = (
    process.env.OPENAI_OAUTH_BRIDGE_URL || "http://127.0.0.1:10531"
  ).replace(/\/+$/, "");

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const authHeader = request.headers.get("authorization");
  const accountHeader = request.headers.get("chatgpt-account-id");
  if (authHeader) headers["Authorization"] = authHeader;
  if (accountHeader) headers["chatgpt-account-id"] = accountHeader;

  try {
    const upstreamRes = await fetch(`${bridgeUrl}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json().catch(() => null);
      if (Array.isArray(data?.data)) {
        // Filter models to those that support Codex with a ChatGPT account
        const availableIds: string[] = data.data
          .map((item: any) => (typeof item === "string" ? item : item?.id))
          .filter((id: any): id is string => typeof id === "string" && id.length > 0);

        // Keep codex-compatible models
        const codexFiltered = availableIds.filter(
          (id) =>
            CODEX_MODELS.includes(id) ||
            id.startsWith("gpt-5.6") ||
            id.startsWith("gpt-5.4")
        );

        if (codexFiltered.length > 0) {
          return new Response(JSON.stringify({ models: codexFiltered }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }
  } catch {
    /* bridge offline or timed out */
  }

  // Fallback to verified Codex models
  return new Response(JSON.stringify({ models: CODEX_MODELS }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
