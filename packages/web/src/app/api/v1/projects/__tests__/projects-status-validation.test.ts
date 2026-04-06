import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockShared = vi.hoisted(() => ({
  createCpProject: vi.fn(),
  listCpProjects: vi.fn(),
  getCpProject: vi.fn(),
  updateCpProject: vi.fn(),
  CpProjectStatus: {
    DRAFT: "DRAFT",
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    ARCHIVED: "ARCHIVED",
  },
  CpTrustMode: {
    STRICT: "STRICT",
    BALANCED: "BALANCED",
    TRUSTED: "TRUSTED",
  },
  CpDocMode: {
    MANAGED: "MANAGED",
    FROZEN: "FROZEN",
    EXTERNAL_IMPORT: "EXTERNAL_IMPORT",
  },
}));

const mockSession = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock("@houston/shared", () => mockShared);
vi.mock("@/lib/session", () => mockSession);

import { POST } from "../route";
import { PATCH } from "../[id]/route";

function makeRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Project status validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.requireAuth.mockResolvedValue(null);
  });

  it("rejects invalid project status in POST /api/v1/projects", async () => {
    const req = makeRequest("http://localhost:3000/api/v1/projects", "POST", {
      slug: "test-project",
      title: "Test Project",
      status: "DONE",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid project status");
    expect(body.details.allowed).toEqual(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
    expect(mockShared.createCpProject).not.toHaveBeenCalled();
  });

  it("rejects invalid project status in PATCH /api/v1/projects/:id", async () => {
    const req = makeRequest("http://localhost:3000/api/v1/projects/project-1", "PATCH", {
      status: "DONE",
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "project-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid project status");
    expect(body.details.allowed).toEqual(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
    expect(mockShared.updateCpProject).not.toHaveBeenCalled();
  });

  it("accepts valid project status in PATCH /api/v1/projects/:id", async () => {
    mockShared.updateCpProject.mockResolvedValue({ id: "project-1", status: "ARCHIVED" });
    const req = makeRequest("http://localhost:3000/api/v1/projects/project-1", "PATCH", {
      status: "ARCHIVED",
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "project-1" }) });
    expect(res.status).toBe(200);
    expect(mockShared.updateCpProject).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ status: "ARCHIVED" })
    );
  });
});
