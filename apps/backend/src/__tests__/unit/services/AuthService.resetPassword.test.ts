import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

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
    hash: vi.fn().mockResolvedValue("$2b$12$newhashedpassword"),
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

import bcrypt from "bcrypt";
import { UserRepository } from "../../../repositories/UserRepository.js";
import { OtpTokenRepository } from "../../../repositories/OtpTokenRepository.js";
import { RefreshTokenRepository } from "../../../repositories/RefreshTokenRepository.js";
import { AuthService } from "../../../services/AuthService.js";
import { ErrorCode } from "@noteapp/shared";

const mockUser = {
  id: "user-uuid-1",
  email: "user@example.com",
  passwordHash: "$2b$12$somehash",
  createdAt: new Date("2024-01-01"),
};

const validOtpRecord = {
  id: "otp-uuid-1",
  userId: mockUser.id,
  hashedOtp: "$2b$12$hashedotp",
  expiresAt: new Date(Date.now() + 10 * 60 * 1000), // not expired
  createdAt: new Date(),
};

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// AuthService.resetPassword
// ---------------------------------------------------------------------------

describe("AuthService.resetPassword", () => {
  it("AC-S6: valid OTP + valid new password — returns success message, updates password, deletes OTP, revokes tokens", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.findByUserId).mockResolvedValue(validOtpRecord);
    vi.mocked(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true as never);
    vi.mocked(UserRepository.updatePasswordHash).mockResolvedValue(undefined);
    vi.mocked(OtpTokenRepository.deleteById).mockResolvedValue(undefined);
    vi.mocked(RefreshTokenRepository.revokeAllByUserId).mockResolvedValue(undefined);

    const result = await AuthService.resetPassword({
      email: "user@example.com",
      otp: "123456",
      newPassword: "NewSecret1",
    });

    expect(result).toEqual({ message: "Password reset successfully." });

    expect(UserRepository.updatePasswordHash).toHaveBeenCalledWith(mockUser.id, expect.any(String));
    expect(OtpTokenRepository.deleteById).toHaveBeenCalledWith(validOtpRecord.id);
    expect(RefreshTokenRepository.revokeAllByUserId).toHaveBeenCalledWith(mockUser.id);
  });

  it("AC-S7: expired OTP — throws OTP_EXPIRED with statusCode 410", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.findByUserId).mockResolvedValue({
      ...validOtpRecord,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    });

    await expect(
      AuthService.resetPassword({
        email: "user@example.com",
        otp: "123456",
        newPassword: "NewSecret1",
      })
    ).rejects.toMatchObject({
      code: ErrorCode.OTP_EXPIRED,
      statusCode: 410,
    });
  });

  it("AC-S8: wrong OTP — bcrypt.compare returns false — throws OTP_INVALID with statusCode 400", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.findByUserId).mockResolvedValue(validOtpRecord);
    vi.mocked(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false as never);

    await expect(
      AuthService.resetPassword({
        email: "user@example.com",
        otp: "000000",
        newPassword: "NewSecret1",
      })
    ).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
      statusCode: 400,
    });
  });

  it("AC-S9: no OTP record for user — throws OTP_INVALID", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.findByUserId).mockResolvedValue(null);

    await expect(
      AuthService.resetPassword({
        email: "user@example.com",
        otp: "123456",
        newPassword: "NewSecret1",
      })
    ).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
  });

  it("AC-S10: unknown email — throws OTP_INVALID (anti-enumeration)", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);

    await expect(
      AuthService.resetPassword({
        email: "nobody@example.com",
        otp: "123456",
        newPassword: "NewSecret1",
      })
    ).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });

    // Should not reach OTP lookup when user not found
    expect(OtpTokenRepository.findByUserId).not.toHaveBeenCalled();
  });

  it("AC-S13: OTP single-use — deleteById called with OTP record id after successful reset", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.findByUserId).mockResolvedValue(validOtpRecord);
    vi.mocked(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true as never);
    vi.mocked(UserRepository.updatePasswordHash).mockResolvedValue(undefined);
    vi.mocked(OtpTokenRepository.deleteById).mockResolvedValue(undefined);
    vi.mocked(RefreshTokenRepository.revokeAllByUserId).mockResolvedValue(undefined);

    await AuthService.resetPassword({
      email: "user@example.com",
      otp: "123456",
      newPassword: "NewSecret1",
    });

    expect(OtpTokenRepository.deleteById).toHaveBeenCalledWith(validOtpRecord.id);
  });

  it("AC-S14: after reset, revokeAllByUserId called with correct userId", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.findByUserId).mockResolvedValue(validOtpRecord);
    vi.mocked(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true as never);
    vi.mocked(UserRepository.updatePasswordHash).mockResolvedValue(undefined);
    vi.mocked(OtpTokenRepository.deleteById).mockResolvedValue(undefined);
    vi.mocked(RefreshTokenRepository.revokeAllByUserId).mockResolvedValue(undefined);

    await AuthService.resetPassword({
      email: "user@example.com",
      otp: "123456",
      newPassword: "NewSecret1",
    });

    expect(RefreshTokenRepository.revokeAllByUserId).toHaveBeenCalledWith(mockUser.id);
  });

  it("AC-S6 extra: new password is hashed before calling updatePasswordHash", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(OtpTokenRepository.findByUserId).mockResolvedValue(validOtpRecord);
    vi.mocked(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true as never);
    vi.mocked(UserRepository.updatePasswordHash).mockResolvedValue(undefined);
    vi.mocked(OtpTokenRepository.deleteById).mockResolvedValue(undefined);
    vi.mocked(RefreshTokenRepository.revokeAllByUserId).mockResolvedValue(undefined);

    await AuthService.resetPassword({
      email: "user@example.com",
      otp: "123456",
      newPassword: "NewSecret1",
    });

    const updateArg = vi.mocked(UserRepository.updatePasswordHash).mock.calls[0];
    // The second argument should be the hashed value from bcrypt.hash (mocked to "$2b$12$newhashedpassword")
    expect(updateArg?.[1]).not.toBe("NewSecret1");
    expect(updateArg?.[1]).toMatch(/^\$2b\$/);
  });

  it("AC-S10 extra: email is lowercased before lookup", async () => {
    vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);

    await expect(
      AuthService.resetPassword({
        email: "User@EXAMPLE.COM",
        otp: "123456",
        newPassword: "NewSecret1",
      })
    ).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID });

    expect(UserRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
  });
});
