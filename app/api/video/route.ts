export const runtime = "nodejs";

const REPLICATE_API = "https://api.replicate.com/v1";

// Wan2.1 text-to-video — open-source, no watermark
const WAN2_MODEL = "wan-ai/wan2.1-t2v-480p";
const WAN2_VERSION = ""; // Uses latest version automatically via model route

/**
 * POST /api/video
 * Body: { prompt: string }
 * Returns: { videoUrl: string }
 */
export async function POST(request: Request) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return Response.json(
      {
        error:
          "REPLICATE_API_TOKEN is not configured. Add it to your .env file.",
      },
      { status: 500 }
    );
  }

  let prompt: string;
  try {
    const body = await request.json();
    prompt = (body.prompt || "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    // 1. Create prediction
    const createRes = await fetch(`${REPLICATE_API}/models/${WAN2_MODEL}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          num_frames: 81,          // ~5 seconds at 16fps
          fps: 16,
          resolution: "480p",
          fast_mode: "Balanced",
          sample_steps: 30,
          sample_guide_scale: 5,
          enable_safety_checker: true,
        },
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      return Response.json(
        { error: errData?.detail || `Replicate error (${createRes.status})` },
        { status: 502 }
      );
    }

    let prediction = await createRes.json();

    // 2. Poll until done (max 5 minutes)
    const maxWait = 300_000; // 5 min
    const pollInterval = 3_000; // 3 sec
    const startTime = Date.now();

    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled"
    ) {
      if (Date.now() - startTime > maxWait) {
        return Response.json(
          { error: "Video generation timed out after 5 minutes." },
          { status: 504 }
        );
      }

      await new Promise((r) => setTimeout(r, pollInterval));

      const pollRes = await fetch(
        `${REPLICATE_API}/predictions/${prediction.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!pollRes.ok) {
        return Response.json(
          { error: `Polling failed (${pollRes.status})` },
          { status: 502 }
        );
      }

      prediction = await pollRes.json();
    }

    if (prediction.status !== "succeeded") {
      return Response.json(
        {
          error:
            prediction.error || "Video generation failed or was cancelled.",
        },
        { status: 500 }
      );
    }

    // Output may be a string URL or array of URLs
    const output = prediction.output;
    const videoUrl = Array.isArray(output) ? output[0] : output;

    if (!videoUrl) {
      return Response.json(
        { error: "No video URL returned from Replicate." },
        { status: 500 }
      );
    }

    return Response.json({ videoUrl });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
