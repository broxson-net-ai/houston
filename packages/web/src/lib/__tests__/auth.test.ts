import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// vi.hoisted ensures these are available before vi.mock factory runs
const mockDb = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

// Mock the @houston/shared module
vi.mock("@houston/shared", () => ({
  db: mockDb,
}));

// Import after mocks are set up
import { authorize } from "../auth";

describe("auth.authorize", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null for missing credentials", async () => {
    const result = await authorize(undefined);
    expect(result).toBeNull();
  });

  it("returns null for empty credentials", async () => {
    const result = await authorize({ email: "", password: "" });
    expect(result).toBeNull();
  });

  it("returns null for unknown email", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    const result = await authorize({
      email: "unknown@test.com",
      password: "password",
    });

    expect(result).toBeNull();
  });

  it("returns null for wrong password", async () => {
    const hash = await bcrypt.hash("correctpassword", 12);
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
      passwordHash: hash,
    });

    const result = await authorize({
      email: "test@test.com",
      password: "wrongpassword",
    });

    expect(result).toBeNull();
  });

  it("returns user object for correct credentials", async () => {
    const hash = await bcrypt.hash("correctpassword", 12);
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
      passwordHash: hash,
    });

    const result = await authorize({
      email: "test@test.com",
      password: "correctpassword",
    });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({ id: "user-1", email: "test@test.com" });
  });
});
