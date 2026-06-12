import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// vi.mock calls must appear before any imports that transitively load the
// mocked modules. Vitest hoists them automatically.

vi.mock("../../../repositories/UserRepository.js", () => ({
  UserRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updatePasswordHash: vi.fn(),
  },
}));

vi.mock("../../../repositories/OtpTokenRepository.js", () => ({
  OtpTokenRepository: {
    deleteAllByUserId: vi.fn(),
    create: vi.fn(),
    findByUserId: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../../../repositories/RefreshTokenRepository.js", () => ({
  RefreshTokenRepository: {
    create: vi.fn(),
    findByToken: vi.fn(),
    revoke: vi.fn(),
    revokeAllByUserId: vi.fn(),
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$12$mockedhashvalue"),
    compare: vi.fn(),
  },
}));

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return {
    ...actual,
    randomInt: vi.fn().mockReturnValue(123456),
  };
});

import { UserRepository } from "../../../repositories/UserRepository.js";
import { OtpTokenRepository } from "../../../repositories/OtpTokenRepository.js";
import { AuthService } from "../../../services/AuthService.js";

const mockUser = {
  id: "user-uuid-1",
  email: "user@example.com",
  passwordHash: "$2b$12$somehash",
  createdAt: new Date("2024-01-01"),
};

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// AuthService.forgotPassword
// ---------------------------------------------------------------------------

describe("AuthService.forgotPassword", () => {
  it("AC-S1: registered email — returns message, creates OtpToken row, logs OTP to console", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.deleteAllByUserId).mockResolvedValue(undefined);
    vi.mocked(OtpTokenRepository.create).mockResolvedValue({
      id: "otp-uuid-1",
      userId: mockUser.id,
      hashedOtp: "$2b$12$mockedhashvalue",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await AuthService.forgotPassword({ email: "user@example.com" });

    expect(result).toEqual({ message: "If that email is registered, an OTP has been sent." });

    // OTP token must be invalidated first, then created
    expect(OtpTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(mockUser.id);
    expect(OtpTokenRepository.create).toHaveBeenCalledOnce();

    // Verify the create payload shape
    const createArg = vi.mocked(OtpTokenRepository.create).mock.calls[0]?.[0];
    expect(createArg?.userId).toBe(mockUser.id);
    expect(typeof createArg?.hashedOtp).toBe("string");
    expect(createArg?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // OTP must be logged to console
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("AC-S2: unknown email — returns same message, no OtpToken created, console.log NOT called", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await AuthService.forgotPassword({ email: "nobody@example.com" });

    expect(result).toEqual({ message: "If that email is registered, an OTP has been sent." });

    expect(OtpTokenRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(OtpTokenRepository.create).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("AC-S3: second request — deleteAllByUserId called BEFORE create (invalidates old OTP)", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);

    const callOrder: string[] = [];
    vi.mocked(OtpTokenRepository.deleteAllByUserId).mockImplementation(async () => {
      callOrder.push("delete");
    });
    vi.mocked(OtpTokenRepository.create).mockImplementation(async () => {
      callOrder.push("create");
      return {
        id: "otp-uuid-1",
        userId: mockUser.id,
        hashedOtp: "$2b$12$mockedhashvalue",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
      };
    });

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await AuthService.forgotPassword({ email: "user@example.com" });

    expect(callOrder).toEqual(["delete", "create"]);
  });

  it("AC-S1 extra: OTP expiresAt is approximately 10 minutes in the future", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.deleteAllByUserId).mockResolvedValue(undefined);
    vi.mocked(OtpTokenRepository.create).mockResolvedValue({
      id: "otp-uuid-1",
      userId: mockUser.id,
      hashedOtp: "$2b$12$mockedhashvalue",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const before = Date.now();
    await AuthService.forgotPassword({ email: "user@example.com" });
    const after = Date.now();

    const createArg = vi.mocked(OtpTokenRepository.create).mock.calls[0]?.[0];
    const expiresAtMs = createArg?.expiresAt.getTime() ?? 0;
    const tenMinMs = 10 * 60 * 1000;

    // expiresAt should be within 1 second of (now + 10 min)
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + tenMinMs - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + tenMinMs + 1000);
  });

  it("AC-S1 extra: findByEmail is called with lowercased email", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);

    await AuthService.forgotPassword({ email: "User@Example.COM" });

    expect(UserRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
  });
});
