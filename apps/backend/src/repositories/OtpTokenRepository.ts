import { prisma } from "../lib/prisma.js";

interface IOtpTokenRecord {
  id: string;
  userId: string;
  hashedOtp: string;
  expiresAt: Date;
  createdAt: Date;
}

function toRecord(raw: {
  id: string;
  userId: string;
  hashedOtp: string;
  expiresAt: Date;
  createdAt: Date;
}): IOtpTokenRecord {
  return {
    id: raw.id,
    userId: raw.userId,
    hashedOtp: raw.hashedOtp,
    expiresAt: raw.expiresAt,
    createdAt: raw.createdAt,
  };
}

export const OtpTokenRepository = {
  async deleteAllByUserId(userId: string): Promise<void> {
    await prisma.otpToken.deleteMany({ where: { userId } });
  },

  async create(data: { userId: string; hashedOtp: string; expiresAt: Date }): Promise<IOtpTokenRecord> {
    const record = await prisma.otpToken.create({ data });
    return toRecord(record);
  },

  async findByUserId(userId: string): Promise<IOtpTokenRecord | null> {
    const record = await prisma.otpToken.findFirst({ where: { userId } });
    if (!record) return null;
    return toRecord(record);
  },

  async deleteById(id: string): Promise<void> {
    await prisma.otpToken.delete({ where: { id } });
  },
};
