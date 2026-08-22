import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  agents,
  approval,
  budgetCategories,
  company,
  offers,
  suppliers as supplierRecords,
  workflows,
} from "@/lib/mock-data";

export const dynamic = "force-dynamic";

const LINK_TARGETS = new Set([
  "approval",
  "compare",
  "execution",
  "workflow",
  "audit",
  "finance",
  "tasks",
]);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSnapshot(): string {
  const packaging = budgetCategories.find((c) => c.id === "cat-packaging");
  const nameOf = (id: string) =>
    supplierRecords.find((s) => s.id === id)?.name ?? id;

  const offerLines = offers
    .map((o) => {
      const rec = o.id === "off-packline" ? " [RECOMMENDED]" : "";
      return `  - ${nameOf(o.supplierId)}${rec}: $${o.total.toLocaleString()} total, ${o.leadTimeDays}-day lead, ${o.reliabilityDisplay}, ${o.paymentTerms}, policy ${o.policyCheck.state}${o.reliabilityConfidence === "unproven" ? ", NO delivery history (new supplier)" : ""}`;
    })
    .join("\n");

  const jobLines = workflows
    .filter((w) => w.id !== "wf-1042")
    .map((w) => `  - ${w.id} "${w.title}" (${"$" + (w.amount ?? 0).toLocaleString()}): ${w.statusLine}`)
    .join("\n");

  return [
    `Company: ${company.name}. Cash position $${company.cashPosition.toLocaleString()}. Packaging budget remaining $${(packaging ? packaging.monthlyCap - packaging.committed : 0).toLocaleString()} of a $${(packaging?.monthlyCap ?? 0).toLocaleString()} monthly cap.`,
    ``,
    `Main job wf-1042 "Q4 retail packaging — 50,000 kraft pouches, needed by Sep 28":`,
    `  Stages Specify/Source/Compare are COMPLETE. It is now WAITING ON THE USER's director approval (${approval.requiredBecause}).`,
    offerLines,
    `  Farman recommends Packline Industries because it is the lowest-cost offer that meets the Sep 28 deadline with the strongest delivery record. VerdePack is cheaper but misses the deadline and has no history; Summit meets the deadline but costs $2,500 more with an 89% on-time rate.`,
    ``,
    `Other jobs:`,
    jobLines,
    ``,
    `Agents you may assign work to:`,
    ...agents.map(
      (a) => `  - ${a.name}: ${a.purpose} Escalates when: ${a.escalatesWhen.join("; ")}.`,
    ),
  ].join("\n");
}

const SYSTEM_PROMPT = `You are Farman's orchestrator — the coordinator inside a procurement execution product for Meridian Roasters. The user talks to you in plain language; you decide what should happen and which specialist agents do it.

Voice rules (mandatory):
- Say "Farman recommends X because…", never "the AI thinks". Never use the words AI, magic, autopilot, genius, robot.
- Use plain verbs: run, approve, execute, review, waiting, completed, blocked.
- Approvals phrased like "Approval required: policy POL-2 threshold exceeded."
- Sentence case. No emojis. Reply in at most 80 words unless listing facts.

Grounding rules:
- Answer status/factual questions ONLY from the workspace snapshot below. Never invent orders, prices, or suppliers.
- If something is genuinely missing, ask ONE short follow-up question in reply.
- When the user asks to buy or arrange something NEW, or MODIFIES an earlier request (item, quantity, budget, timing) in their latest message, always emit a fresh create_job action carrying the FULL updated details.
- Approval facts are exact: POL-2 requires director approval ONLY above $10,000. For amounts at or below $10,000 set needs_approval=false unless the snapshot shows another policy truly applies (new-supplier award at $5,000+ under POL-5). Never claim a threshold is exceeded when the amount does not exceed it.
- Prefer "Farman will…" over "I will…" in reply.
- When the user references the Q4 packaging order, include matching link actions so they can open the real screens.

Respond with ONLY a JSON object (no markdown fences):
{
  "reply": "string",
  "dispatch": [{"agent": "Sourcing agent|Evaluation agent|Finance agent|Farman orchestrator", "instruction": "specific instruction"}],
  "actions": [{"type":"link","target":"approval|compare|execution|workflow|audit|finance|tasks","label":"button label"} | {"type":"create_job","title":"sentence-case title","stages":["Specify","Source","Compare","Approve","Execute","Complete"],"needs_approval":true,"amount":123,"policy_note":"plain-language reason"}]
}
Keep dispatch to at most 3 entries and actions to at most 3. Omit dispatch/actions arrays when not needed.`;

function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "The orchestrator has no planning service configured on this server." },
      { status: 500 },
    );
  }

  let history: ChatMessage[] = [];
  try {
    const body = (await req.json()) as { messages?: unknown };
    if (Array.isArray(body.messages)) {
      history = body.messages
        .filter(
          (m): m is ChatMessage =>
            !!m &&
            typeof m === "object" &&
            ((m as ChatMessage).role === "user" ||
              (m as ChatMessage).role === "assistant") &&
            typeof (m as ChatMessage).content === "string",
        )
        .slice(-12)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 2000),
        }));
    }
  } catch {
    // fall through to validation
  }
  if (
    history.length === 0 ||
    history[history.length - 1].role !== "user" ||
    !history[history.length - 1].content.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: "Say what you need first — the orchestrator needs at least one request." },
      { status: 400 },
    );
  }

  const baseUrl = process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4";
  const model = process.env.ZAI_MODEL ?? "glm-4.6";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

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
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nWORKSPACE SNAPSHOT:\n${buildSnapshot()}`,
          },
          ...history,
          {
            role: "system",
            content:
              "Respond now with ONLY the JSON object — no prose before or after it.",
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
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
    const parsed = extractJson(content) as {
      reply?: unknown;
      dispatch?: unknown;
      actions?: unknown;
    } | null;

    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The orchestrator returned something it could not validate. Nothing was changed — say your need again in different words.",
          detail: content.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const dispatch = Array.isArray(parsed.dispatch)
      ? parsed.dispatch
          .filter(
            (d): d is { agent: string; instruction: string } =>
              !!d &&
              typeof d === "object" &&
              typeof (d as { agent?: unknown }).agent === "string" &&
              typeof (d as { instruction?: unknown }).instruction === "string",
          )
          .slice(0, 5)
      : [];

    type LinkAction = { type: "link"; target: string; label: string };
    type CreateJobAction = {
      type: "create_job";
      title: string;
      stages: string[];
      needs_approval: boolean;
      amount?: number;
      policy_note?: string;
    };
    const actions: Array<LinkAction | CreateJobAction> = [];

    if (Array.isArray(parsed.actions)) {
      for (const a of parsed.actions.slice(0, 3)) {
        if (!a || typeof a !== "object") continue;
        const obj = a as Record<string, unknown>;
        if (obj.type === "link" && typeof obj.target === "string" && LINK_TARGETS.has(obj.target)) {
          actions.push({
            type: "link",
            target: obj.target,
            label: typeof obj.label === "string" ? obj.label : "Open",
          });
        }
        if (
          obj.type === "create_job" &&
          typeof obj.title === "string" &&
          Array.isArray(obj.stages) &&
          obj.stages.every((s) => typeof s === "string") &&
          obj.stages.length > 0
        ) {
          actions.push({
            type: "create_job",
            title: obj.title.slice(0, 120),
            stages: (obj.stages as string[]).slice(0, 8),
            needs_approval: Boolean(obj.needs_approval),
            amount: typeof obj.amount === "number" ? obj.amount : undefined,
            policy_note:
              typeof obj.policy_note === "string" ? obj.policy_note : undefined,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      reply: parsed.reply.trim(),
      dispatch,
      actions,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? "The orchestrator timed out after 45 seconds while assigning work. Try again."
          : "The orchestrator is unreachable right now. Check the network and try again.",
      },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
