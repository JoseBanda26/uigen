import { test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockSign = vi.fn().mockResolvedValue("mock-token");
const mockSignJWTInstance = {
  setProtectedHeader: vi.fn().mockReturnThis(),
  setExpirationTime: vi.fn().mockReturnThis(),
  setIssuedAt: vi.fn().mockReturnThis(),
  sign: mockSign,
};
const MockSignJWT = vi.fn().mockReturnValue(mockSignJWTInstance);

vi.mock("jose", () => ({
  SignJWT: MockSignJWT,
  jwtVerify: vi.fn(),
}));

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookieSet,
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

import { createSession } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  mockSign.mockResolvedValue("mock-token");
});

test("createSession signs a JWT with the correct payload", async () => {
  await createSession("user-1", "user@example.com");

  expect(MockSignJWT).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", email: "user@example.com" })
  );
  expect(mockSignJWTInstance.setProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
  expect(mockSignJWTInstance.setExpirationTime).toHaveBeenCalledWith("7d");
  expect(mockSignJWTInstance.setIssuedAt).toHaveBeenCalled();
  expect(mockSign).toHaveBeenCalled();
});

test("createSession sets an http-only cookie with the signed token", async () => {
  await createSession("user-1", "user@example.com");

  expect(mockCookieSet).toHaveBeenCalledWith(
    "auth-token",
    "mock-token",
    expect.objectContaining({ httpOnly: true, path: "/" })
  );
});

test("createSession sets cookie expiry ~7 days in the future", async () => {
  const before = Date.now();
  await createSession("user-1", "user@example.com");
  const after = Date.now();

  const [, , options] = mockCookieSet.mock.calls[0];
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  expect(options.expires.getTime()).toBeGreaterThanOrEqual(before + sevenDays - 1000);
  expect(options.expires.getTime()).toBeLessThanOrEqual(after + sevenDays + 1000);
});
