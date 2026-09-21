import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../../../capacitor.config";

const queue = vi.hoisted(() => ({
  enqueueAction: vi.fn(async () => "fm_test"),
  createQueuedActionId: vi.fn(() => "fm_test"),
}));
vi.mock("./queue", () => queue);

import { executeOrQueueAdminMutation } from "./admin-mutation";

const mutation = {
  path: "/api/admin/tables/table-1",
  method: "PUT" as const,
  body: { isOccupied: true },
};

describe("native navigation configuration", () => {
  it("keeps all same-origin app routes inside the navigation boundary", () => {
    // App must always boot into the staff login screen and must never
    // allow arbitrary external origins inside the WebView.
    expect(config.server?.appStartPath).toBe("/admin/login");
    expect(config.server?.allowNavigation ?? []).not.toContain("*");

    // `server.url` is only emitted for live-reload dev
    // (CAPACITOR_SERVER_URL set). Otherwise the app falls back to the
    // bundled `www/` build, so no `url` should be present.
    const url = config.server?.url;
    if (url) {
      const base = url;
      expect(new URL(base).pathname).toBe("/");
      for (const path of ["/admin", "/admin/orders", "/order/order-1", "/admin/login"]) {
        expect(new URL(path, base).href.startsWith(base)).toBe(true);
      }
      expect(new URL("/admin", "https://external.invalid").href.startsWith(base)).toBe(false);
    } else {
      expect(url).toBeUndefined();
    }
  });
});

describe("offline mutation delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("queues offline changes for the authenticated actor without sending", async () => {
    const result = await executeOrQueueAdminMutation({ actorId: "staff-1", online: false, mutation });
    expect(result).toEqual({ queued: true, mutationId: "fm_test" });
    expect(queue.enqueueAction).toHaveBeenCalledWith({
      id: "fm_test", type: "ADMIN_MUTATION", actorId: "staff-1", payload: mutation,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains the same mutation ID after a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Network unavailable"));
    await expect(executeOrQueueAdminMutation({ actorId: "staff-1", online: true, mutation }))
      .resolves.toEqual({ queued: true, mutationId: "fm_test" });
    expect(fetch).toHaveBeenCalledWith(mutation.path, expect.objectContaining({
      headers: expect.objectContaining({ "X-Farman-Mutation-Id": "fm_test" }),
    }));
    expect(queue.enqueueAction).toHaveBeenCalledWith(expect.objectContaining({ id: "fm_test" }));
  });

  it("does not queue authorization failures", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    await expect(executeOrQueueAdminMutation({ actorId: "staff-1", online: true, mutation })).rejects.toThrow("Forbidden");
    expect(queue.enqueueAction).not.toHaveBeenCalled();
  });

  it("surfaces local persistence failure instead of claiming the change was saved", async () => {
    queue.enqueueAction.mockRejectedValueOnce(new Error("Storage full"));
    await expect(executeOrQueueAdminMutation({ actorId: "staff-1", online: false, mutation })).rejects.toThrow("Storage full");
  });
});
