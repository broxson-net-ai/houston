import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.hoisted ensures these are available before vi.mock factory runs
const mockDb = vi.hoisted(() => ({
  agent: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock next-auth
vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { email: "admin@test.com" } }),
}));

// Mock @houston/shared
vi.mock("@houston/shared", () => ({
  db: mockDb,
}));

// Import after mocks
import { GET, POST } from "../route";
import { GET as GET_ONE, PATCH, DELETE } from "../[id]/route";

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeRequestWithId(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents/agent-1", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/agents", () => {
  it("returns list of agents", async () => {
    mockDb.agent.findMany.mockResolvedValue([
      { id: "1", name: "Agent 1", routingKey: "agent-1" },
    ]);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].name).toBe("Agent 1");
  });
});

describe("POST /api/agents", () => {
  it("creates agent with valid body, returns 201", async () => {
    const newAgent = { id: "1", name: "Test Agent", routingKey: "test-agent" };
    mockDb.agent.create.mockResolvedValue(newAgent);

    const res = await POST(makeRequest("POST", { name: "Test Agent", routingKey: "test-agent" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Test Agent");
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest("POST", { routingKey: "test-agent" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 when routingKey is missing", async () => {
    const res = await POST(makeRequest("POST", { name: "Test Agent" }));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/agents/:id", () => {
  it("updates agent name", async () => {
    mockDb.agent.findUnique.mockResolvedValue({ id: "agent-1", name: "Old Name" });
    mockDb.agent.update.mockResolvedValue({ id: "agent-1", name: "New Name" });

    const req = new NextRequest("http://localhost:3000/api/agents/agent-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    const res = await PATCH(req, { params: { id: "agent-1" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("New Name");
  });
});

describe("DELETE /api/agents/:id", () => {
  it("deletes agent successfully", async () => {
    mockDb.agent.findUnique.mockResolvedValue({ id: "agent-1", name: "To Delete" });
    mockDb.agent.delete.mockResolvedValue({ id: "agent-1" });

    const req = new NextRequest("http://localhost:3000/api/agents/agent-1", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: { id: "agent-1" } });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent agent", async () => {
    mockDb.agent.findUnique.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/agents/nonexistent", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: { id: "nonexistent" } });
    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated requests", () => {
  it("returns 401 when not authenticated", async () => {
    const { getServerSession } = await import("next-auth/next");
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });
});
