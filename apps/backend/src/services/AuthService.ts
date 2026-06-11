import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { ErrorCode } from "@noteapp/shared";
import type {
  TRegisterInput,
  TLoginInput,
  TRefreshInput,
  IAuthResponse,
  IRegisterResponse,
  IRefreshResponse,
} from "@noteapp/shared";
import { UserRepository } from "../repositories/UserRepository.js";
import { RefreshTokenRepository } from "../repositories/RefreshTokenRepository.js";
import { signAccessToken } from "../utils/token.js";
import { createError } from "../middleware/errorHandler.js";

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
