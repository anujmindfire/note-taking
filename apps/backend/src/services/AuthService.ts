import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { randomInt } from "crypto";
import { ErrorCode } from "@noteapp/shared";
import type {
  TRegisterInput,
  TLoginInput,
  TRefreshInput,
  TForgotPasswordInput,
  TResetPasswordInput,
  IAuthResponse,
  IRegisterResponse,
  IRefreshResponse,
  IMessageResponse,
} from "@noteapp/shared";
import { UserRepository } from "../repositories/UserRepository.js";
import { RefreshTokenRepository } from "../repositories/RefreshTokenRepository.js";
import { OtpTokenRepository } from "../repositories/OtpTokenRepository.js";
import { signAccessToken } from "../utils/token.js";
import { createError } from "../middleware/errorHandler.js";

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

// Dummy hash used when the email is not found — prevents timing attacks by
// ensuring bcrypt.compare always runs regardless of whether the user exists.
const DUMMY_HASH = "$2b$12$invalidhashvaluethatisused.topreventtimingattacks.padding";

export const AuthService = {
  async register(input: TRegisterInput): Promise<IRegisterResponse> {
    const email = input.email.toLowerCase();
    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      throw createError(422, ErrorCode.EMAIL_TAKEN, "Email already exists");
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await UserRepository.create({ email, passwordHash });
    return { userId: user.id };
  },

  async login(input: TLoginInput): Promise<IAuthResponse> {
    const email = input.email.toLowerCase();
    const user = await UserRepository.findByEmail(email);

    if (!user) {
      // Run dummy compare to prevent timing-based email enumeration
      await bcrypt.compare(input.password, DUMMY_HASH);
      throw createError(401, ErrorCode.INVALID_CREDENTIALS, "Invalid email or password");
    }

    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatch) {
      throw createError(401, ErrorCode.INVALID_CREDENTIALS, "Invalid email or password");
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshTokenValue = uuidv4();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await RefreshTokenRepository.create({ userId: user.id, token: refreshTokenValue, expiresAt });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    };
  },

  async logout(data: { userId: string; refreshToken: string }): Promise<void> {
    const record = await RefreshTokenRepository.findByToken(data.refreshToken);
    if (!record || record.revokedAt !== null) {
      return;
    }
    await RefreshTokenRepository.revoke(data.refreshToken);
  },

  async forgotPassword(input: TForgotPasswordInput): Promise<IMessageResponse> {
    const email = input.email.toLowerCase();
    const message = "If that email is registered, an OTP has been sent.";
    const user = await UserRepository.findByEmail(email);

    if (!user) {
      return { message };
    }

    await OtpTokenRepository.deleteAllByUserId(user.id);

    const plainOtp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const hashedOtp = await bcrypt.hash(plainOtp, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await OtpTokenRepository.create({ userId: user.id, hashedOtp, expiresAt });
    console.log(`[OTP] Reset code for ${email}: ${plainOtp}`);

    return { message };
  },

  async resetPassword(input: TResetPasswordInput): Promise<IMessageResponse> {
    const email = input.email.toLowerCase();
    const user = await UserRepository.findByEmail(email);

    if (!user) {
      throw createError(400, ErrorCode.OTP_INVALID, "Invalid OTP");
    }

    const otpRecord = await OtpTokenRepository.findByUserId(user.id);

    if (!otpRecord) {
      throw createError(400, ErrorCode.OTP_INVALID, "Invalid OTP");
    }

    if (otpRecord.expiresAt < new Date()) {
      throw createError(410, ErrorCode.OTP_EXPIRED, "OTP has expired");
    }

    const isValid = await bcrypt.compare(input.otp, otpRecord.hashedOtp);
    if (!isValid) {
      throw createError(400, ErrorCode.OTP_INVALID, "Invalid OTP");
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await UserRepository.updatePasswordHash(user.id, newPasswordHash);
    await OtpTokenRepository.deleteById(otpRecord.id);
    await RefreshTokenRepository.revokeAllByUserId(user.id);

    return { message: "Password reset successfully." };
  },

  async refreshToken(input: TRefreshInput): Promise<IRefreshResponse> {
    const record = await RefreshTokenRepository.findByToken(input.refreshToken);

    if (!record || record.revokedAt !== null) {
      throw createError(401, ErrorCode.REFRESH_INVALID, "Refresh token is invalid or revoked");
    }

    if (record.expiresAt < new Date()) {
      throw createError(401, ErrorCode.REFRESH_EXPIRED, "Refresh token has expired");
    }

    await RefreshTokenRepository.revoke(input.refreshToken);

    const newToken = uuidv4();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await RefreshTokenRepository.create({ userId: record.userId, token: newToken, expiresAt: newExpiresAt });

    const user = await UserRepository.findById(record.userId);
    // user always exists — CASCADE delete on User removes RefreshTokens; orphan impossible
    const accessToken = signAccessToken({ userId: record.userId, email: user!.email });

    return { accessToken };
  },
};
