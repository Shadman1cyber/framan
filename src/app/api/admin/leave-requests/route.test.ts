import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "cashier-1", name: "سارا", email: "sara@example.com", role: "CASHIER" } as {
    id: string;
    name?: string | null;
    email?: string | null;
    role: "OWNER" | "CASHIER" | "CUSTOMER";
  } | null,
  deadlineH: 48,
}));

const db = vi.hoisted(() => ({
  staff: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  staffLeave: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/guards", () => ({ getSessionUser: async () => state.user }));
vi.mock("@/lib/operations", () => ({ getLeaveDeadlineHours: async () => state.deadlineH }));

import { GET, POST } from "./route";

function futureIso(hours: number) {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "cashier-1", name: "سارا", email: "sara@example.com", role: "CASHIER" };
  state.deadlineH = 48;
  db.staff.upsert.mockResolvedValue({ id: "staff-1" });
  db.staff.findUnique.mockResolvedValue({ id: "staff-2", name: "علی" });
  db.staff.findMany.mockResolvedValue([]);
  db.staffLeave.findFirst.mockResolvedValue(null);
  db.staffLeave.create.mockResolvedValue({ id: "leave-1", status: "PENDING" });
  db.staffLeave.findMany.mockResolvedValue([]);
});

describe("cashier leave requests", () => {
  it("binds a new request to the authenticated cashier when no staff is chosen", async () => {
    const from = futureIso(72);
    const to = futureIso(96);
    const res = await POST(new Request("http://localhost/api/admin/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reason: "سفر" }),
    }));

    expect(res.status).toBe(201);
    expect(db.staff.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "cashier-1" },
      create: expect.objectContaining({ userId: "cashier-1", name: "سارا" }),
    }));
    expect(db.staffLeave.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        staffId: "staff-1",
        type: "ADVANCE",
        status: "PENDING",
        reason: "سفر",
      }),
    });
  });

  it("lets the cashier request leave on behalf of any staff member", async () => {
    const from = futureIso(72);
    const to = futureIso(96);
    const res = await POST(new Request("http://localhost/api/admin/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reason: "سفر", staffId: "staff-2" }),
    }));

    expect(res.status).toBe(201);
    expect(db.staff.findUnique).toHaveBeenCalledWith({ where: { id: "staff-2" } });
    expect(db.staff.upsert).not.toHaveBeenCalled();
    expect(db.staffLeave.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ staffId: "staff-2", status: "PENDING" }),
    });
  });

  it("returns 404 when the chosen staff member does not exist", async () => {
    db.staff.findUnique.mockResolvedValueOnce(null);
    const res = await POST(new Request("http://localhost/api/admin/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: futureIso(72), to: futureIso(96), staffId: "missing" }),
    }));
    expect(res.status).toBe(404);
  });

  it("enforces the configured advance deadline", async () => {
    const res = await POST(new Request("http://localhost/api/admin/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: futureIso(24), to: futureIso(48) }),
    }));

    expect(res.status).toBe(400);
    expect(db.staff.upsert).not.toHaveBeenCalled();
    expect(db.staffLeave.create).not.toHaveBeenCalled();
  });

  it("returns full history plus staff list for the leaves tab", async () => {
    await GET();
    expect(db.staffLeave.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: "desc" },
    }));
    expect(db.staff.findMany).toHaveBeenCalled();
  });

  it("lets the owner read requests but not submit the cashier form", async () => {
    state.user = { id: "owner-1", role: "OWNER" };
    await GET();
    expect(db.staffLeave.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "desc" } }));

    const res = await POST(new Request("http://localhost/api/admin/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: futureIso(72), to: futureIso(96) }),
    }));
    expect(res.status).toBe(403);
  });
});
