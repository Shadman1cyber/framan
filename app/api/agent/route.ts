import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface Plan {
  title: string;
  summary: string;
  stages: string[];
  needs_approval: boolean;
  policy_note?: string;
  amount?: number;
}

const SYSTEM_PROMPT = `You are Farman's orchestrator agent for a procurement operations demo at Meridian Roasters.
A user states a business outcome. Draft the workflow plan that would execute it.
Respond with ONLY a JSON object, no markdown fences, matching exactly:
{
  "title": "short sentence-case job title, max 60 chars",
  "summary": "one plain sentence describing what will happen",
  "stages": ["Specify", "Source", "Compare", "Approve", "Execute", "Complete"],
  "needs_approval": true,
  "policy_note": "plain-language policy reason if approval needed, else omit",
  "amount": number_or_omit
}
Rules:
- Keep the standard six stages unless the outcome clearly needs fewer; never invent stage names.
- Set needs_approval=true and provide policy_note when an order exceeds $10,000 (policy POL-2).
- Sentence case everywhere. No emojis. No text outside the JSON.`;

function parsePlan(raw: string): Plan | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    if (
      typeof obj.title === "string" &&
      typeof obj.summary === "string" &&
      Array.isArray(obj.stages) &&
      obj.stages.every((s: unknown) => typeof s === "string")
    ) {
      return {
        title: obj.title,
        summary: obj.summary,
        stages: obj.stages,
        needs_approval: Boolean(obj.needs_approval),
        policy_note: typeof obj.policy_note === "string" ? obj.policy_note : undefined,
        amount: typeof obj.amount === "number" ? obj.amount : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Agent unavailable — no API key configured on the server." },
      { status: 500 },
    );
  }

  let intent = "";
  try {
    const body = (await req.json()) as { intent?: unknown };
    if (typeof body.intent === "string") intent = body.intent.trim();
  } catch {
    // fall through to validation
  }
  if (!intent || intent.length > 500) {
    return NextResponse.json(
      { ok: false, error: "State an outcome of up to 500 characters first." },
      { status: 400 },
    );
  }

  const baseUrl = process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4";
  const model = process.env.ZAI_MODEL ?? "glm-4.6";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: intent },
        ],
        temperature: 0.3,
        max_tokens: 1024,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `The orchestrator could not reach its planning service (${res.status}). Nothing was changed.`,
          detail: detail.slice(0, 300),
        },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const plan = parsePlan(content);
    if (!plan) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The orchestrator returned a plan it could not validate. Nothing was changed — try rephrasing the outcome.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? "The orchestrator timed out after 25 seconds while planning. Try again."
          : "The orchestrator is unreachable right now. Check the network and try again.",
      },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
