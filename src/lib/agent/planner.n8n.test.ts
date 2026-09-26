import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createEvent } = vi.hoisted(() => ({ createEvent: vi.fn().mockResolvedValue({ id: "event" }) }));
vi.mock("@/lib/db", () => ({ prisma: { agentMonitorEvent: { create: createEvent } } }));
vi.mock("@/lib/ai/settings", () => ({ getAiSettings: vi.fn().mockResolvedValue({ enabled: true, provider: "zhipu", model: "glm-4" }) }));

import { plan } from "./planner";

describe("n8n planner bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_ENGINE = "n8n";
    process.env.N8N_WEBHOOK_URL = "http://n8n.test/webhook/farman-agent";
    process.env.N8N_BRIDGE_TOKEN = "test-bridge-token";
  });
  afterEach(() => {
    delete process.env.AGENT_ENGINE;
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_BRIDGE_TOKEN;
    vi.unstubAllGlobals();
  });

  it("accepts a schema-valid proposal and stores the supervisor assessment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      output: JSON.stringify({ steps: [{ tool: "list_inventory", input: { lowOnly: true, take: 10 } }] }),
      assessment: { severity: "WARNING", category: "MISSING_EVIDENCE", summary: "Check stock source", details: "Use a fresh read." },
      workflowId: "farman-agent-v1",
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const sessionKey = "a".repeat(64);
    const result = await plan("مواد کم کدامند؟", [], [], [], sessionKey, true);
    expect(result.steps[0].tool).toBe("list_inventory");
    expect(fetchMock.mock.calls[0][1].headers["X-Farman-Agent-Token"]).toBe("test-bridge-token");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ sessionKey, allowDatabaseInsights: true });
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ severity: "WARNING" }) }));
  });

  it("blocks a critical supervisor finding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      output: JSON.stringify({ steps: [{ tool: "list_inventory", input: {} }] }),
      assessment: { severity: "CRITICAL", category: "UNSAFE_WRITE", summary: "Unsafe request", details: "Blocked." },
    }) }));
    await expect(plan("test")).rejects.toMatchObject({ code: "PLAN_UNSUPPORTED_OR_UNAVAILABLE" });
    expect(createEvent).toHaveBeenCalledOnce();
  });

  it("records a workflow failure for the support log", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection failed")));
    await expect(plan("test")).rejects.toMatchObject({ code: "PLAN_UNSUPPORTED_OR_UNAVAILABLE" });
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: "WORKFLOW_ERROR", severity: "CRITICAL" }) }));
  });
});
