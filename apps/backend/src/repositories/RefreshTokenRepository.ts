import { prisma } from "../lib/prisma.js";

interface IRefreshTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export const RefreshTokenRepository = {
  async create(data: { userId: string; token: string; expiresAt: Date }): Promise<IRefreshTokenRecord> {
    const record = await prisma.refreshToken.create({ data });
    return {
      id: record.id,
      userId: record.userId,
      token: record.token,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      createdAt: record.createdAt,
    };
  },

  async findByToken(token: string): Promise<IRefreshTokenRecord | null> {
    const record = await prisma.refreshToken.findUnique({ where: { token } });
    if (!record) return null;
    return {
      id: record.id,
      userId: record.userId,
      token: record.token,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      createdAt: record.createdAt,
    };
  },

  async revoke(token: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { token },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllByUserId(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
