import { createOpenAIOAuth } from "@openai-oauth/ai-sdk";
import { openaiCredentials } from "@openai-oauth/react/server";
import { streamText } from "ai";

export const runtime = "nodejs";

// Models that support Codex authentication via ChatGPT OAuth
export const CODEX_MODELS = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.4-mini",
] as const;

function resolveCodexModel(requestedModel?: string): string {
  if (requestedModel && (CODEX_MODELS as readonly string[]).includes(requestedModel)) {
    return requestedModel;
  }
  return process.env.CHAT_MODEL || "gpt-5.6-luna";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    model?: string;
    system?: string;
  };

  const prompt = body.prompt;
  const messages = body.messages;

  if (!prompt && (!messages || messages.length === 0)) {
    return new Response(JSON.stringify({ error: "Prompt or messages is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Ensure only Codex-supported models are used
  const model = resolveCodexModel(body.model);

  try {
    const credentials = openaiCredentials(request);
    const openai = createOpenAIOAuth(credentials);

    if (messages && messages.length > 0) {
      const result = streamText({
        model: openai(model),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        system: body.system,
      });
      return result.toTextStreamResponse();
    } else {
      const result = streamText({
        model: openai(model),
        prompt: prompt!,
        system: body.system,
      });
      return result.toTextStreamResponse();
    }
  } catch (err: any) {
    const errorMsg = err?.message || "Failed to process chat request.";
    const isAuthError =
      errorMsg.includes("Authorization") ||
      errorMsg.includes("chatgpt-account-id") ||
      errorMsg.includes("session");
    return new Response(
      JSON.stringify({
        error: isAuthError
          ? "OpenAI OAuth session not found. Please ensure the 'Sign in with ChatGPT' extension is active and signed in, or use local bridge mode."
          : errorMsg,
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
