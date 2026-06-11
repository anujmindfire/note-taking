import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import * as jwt from "jsonwebtoken";

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$12$mockedhashvalue"),
    compare: vi.fn(),
  },
}));

vi.mock("../../../repositories/UserRepository.js", () => ({
  UserRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../../repositories/RefreshTokenRepository.js", () => ({
  RefreshTokenRepository: {
    create: vi.fn(),
    findByToken: vi.fn(),
    revoke: vi.fn(),
  },
}));

import bcrypt from "bcrypt";
import { UserRepository } from "../../../repositories/UserRepository.js";
import { RefreshTokenRepository } from "../../../repositories/RefreshTokenRepository.js";
import { AuthService } from "../../../services/AuthService.js";
import { ErrorCode } from "@noteapp/shared";

const mockUser = {
  id: "user-uuid-1",
  email: "user@example.com",
  passwordHash: "$2b$12$somehash",
  createdAt: new Date("2024-01-01"),
};

const mockToken = {
  id: "token-uuid-1",
  userId: "user-uuid-1",
  token: "refresh-token-uuid",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  createdAt: new Date("2024-01-01"),
};

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthService.register", () => {
  it("AC-S1: valid registration", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(UserRepository.create).mockResolvedValue(mockUser);

    const result = await AuthService.register({ email: "User@Example.com", password: "Secret123" });

    expect(result).toEqual({ userId: mockUser.id });
    expect(UserRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
    expect(UserRepository.create).toHaveBeenCalledOnce();
  });

  it("AC-S2: duplicate email exact", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);

    await expect(AuthService.register({ email: "user@example.com", password: "Secret123" })).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
    });
  });

  it("AC-S3: duplicate email case-insensitive", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);

    await expect(AuthService.register({ email: "USER@EXAMPLE.COM", password: "Secret123" })).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
    });
    expect(UserRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
  });

  it("AC-S10: password not stored plaintext — hash passed to create", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(UserRepository.create).mockResolvedValue(mockUser);

    await AuthService.register({ email: "user@example.com", password: "Secret123" });

    const createCall = vi.mocked(UserRepository.create).mock.calls[0]?.[0];
    // bcrypt is mocked to return "$2b$12$mockedhashvalue" — not the raw password
    expect(createCall?.passwordHash).toBe("$2b$12$mockedhashvalue");
    expect(createCall?.passwordHash).not.toBe("Secret123");
    expect(createCall?.passwordHash).toMatch(/^\$2b\$/);
  });
});

describe("AuthService.login", () => {
  beforeEach(() => {
    vi.mocked(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true as never);
  });

  it("AC-S11: valid login — returns accessToken, refreshToken, user", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(RefreshTokenRepository.create).mockResolvedValue(mockToken);

    const result = await AuthService.login({ email: "user@example.com", password: "Secret123" });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result.user).toMatchObject({ id: mockUser.id, email: mockUser.email });
    expect(typeof result.user.createdAt).toBe("string");
  });

  it("AC-S12: accessToken has correct payload and 15-min expiry", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(RefreshTokenRepository.create).mockResolvedValue(mockToken);

    const result = await AuthService.login({ email: "user@example.com", password: "Secret123" });

    const decoded = jwt.decode(result.accessToken) as { userId: string; email: string; exp: number; iat: number };
    expect(decoded.userId).toBe(mockUser.id);
    expect(decoded.email).toBe(mockUser.email);
    expect(decoded.exp - decoded.iat).toBe(900); // 15 minutes = 900 seconds
  });

  it("AC-S13: refreshToken persisted — create called with correct userId and future expiresAt", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(RefreshTokenRepository.create).mockResolvedValue(mockToken);

    await AuthService.login({ email: "user@example.com", password: "Secret123" });

    const createCall = vi.mocked(RefreshTokenRepository.create).mock.calls[0]?.[0];
    expect(createCall?.userId).toBe(mockUser.id);
    expect(createCall?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("AC-S14: wrong password — throws INVALID_CREDENTIALS", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false as never);

    await expect(AuthService.login({ email: "user@example.com", password: "WrongPass1" })).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
  });

  it("AC-S15: unknown email — same INVALID_CREDENTIALS (no enumeration)", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);

    await expect(AuthService.login({ email: "nobody@example.com", password: "Secret123" })).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
    // Dummy compare still runs — bcrypt.compare called even when user not found
    expect(bcrypt.compare).toHaveBeenCalledOnce();
  });
});

describe("AuthService.logout", () => {
  it("AC-S17: valid logout — revoke called with correct token", async () => {
    vi.mocked(RefreshTokenRepository.findByToken).mockResolvedValue(mockToken);
    vi.mocked(RefreshTokenRepository.revoke).mockResolvedValue(undefined);

    await expect(AuthService.logout({ userId: mockUser.id, refreshToken: mockToken.token })).resolves.toBeUndefined();
    expect(RefreshTokenRepository.revoke).toHaveBeenCalledWith(mockToken.token);
  });

  it("AC-S20: idempotent logout — already revoked, revoke NOT called", async () => {
    vi.mocked(RefreshTokenRepository.findByToken).mockResolvedValue({ ...mockToken, revokedAt: new Date() });

    await expect(AuthService.logout({ userId: mockUser.id, refreshToken: mockToken.token })).resolves.toBeUndefined();
    expect(RefreshTokenRepository.revoke).not.toHaveBeenCalled();
  });

  it("AC-S21: idempotent logout — unknown token, revoke NOT called", async () => {
    vi.mocked(RefreshTokenRepository.findByToken).mockResolvedValue(null);

    await expect(AuthService.logout({ userId: mockUser.id, refreshToken: "unknown-token" })).resolves.toBeUndefined();
    expect(RefreshTokenRepository.revoke).not.toHaveBeenCalled();
  });
});

describe("AuthService.refreshToken", () => {
  it("AC-S22: valid refresh — old token revoked, new token created, returns accessToken", async () => {
    vi.mocked(RefreshTokenRepository.findByToken).mockResolvedValue(mockToken);
    vi.mocked(RefreshTokenRepository.revoke).mockResolvedValue(undefined);
    vi.mocked(RefreshTokenRepository.create).mockResolvedValue({ ...mockToken, token: "new-token-uuid" });
    vi.mocked(UserRepository.findById).mockResolvedValue(mockUser);

    const result = await AuthService.refreshToken({ refreshToken: mockToken.token });

    expect(result).toHaveProperty("accessToken");
    expect(typeof result.accessToken).toBe("string");
    expect(RefreshTokenRepository.revoke).toHaveBeenCalledWith(mockToken.token);
    expect(RefreshTokenRepository.create).toHaveBeenCalledOnce();
  });

  it("AC-S23: refresh token not in DB — throws REFRESH_INVALID", async () => {
    vi.mocked(RefreshTokenRepository.findByToken).mockResolvedValue(null);

    await expect(AuthService.refreshToken({ refreshToken: "nonexistent" })).rejects.toMatchObject({
      code: ErrorCode.REFRESH_INVALID,
    });
  });

  it("AC-S24: refresh token revoked — throws REFRESH_INVALID", async () => {
    vi.mocked(RefreshTokenRepository.findByToken).mockResolvedValue({ ...mockToken, revokedAt: new Date() });

    await expect(AuthService.refreshToken({ refreshToken: mockToken.token })).rejects.toMatchObject({
      code: ErrorCode.REFRESH_INVALID,
    });
  });

  it("AC-S25: refresh token expired — throws REFRESH_EXPIRED", async () => {
    vi.mocked(RefreshTokenRepository.findByToken).mockResolvedValue({
      ...mockToken,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(AuthService.refreshToken({ refreshToken: mockToken.token })).rejects.toMatchObject({
      code: ErrorCode.REFRESH_EXPIRED,
    });
  });
});
