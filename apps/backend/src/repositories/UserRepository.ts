import { prisma } from "../lib/prisma.js";

interface IUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export const UserRepository = {
  async findByEmail(email: string): Promise<IUserRecord | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return { id: user.id, email: user.email, passwordHash: user.passwordHash, createdAt: user.createdAt };
  },

  async findById(id: string): Promise<IUserRecord | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return { id: user.id, email: user.email, passwordHash: user.passwordHash, createdAt: user.createdAt };
  },

  async create(data: { email: string; passwordHash: string }): Promise<IUserRecord> {
    const user = await prisma.user.create({ data });
    return { id: user.id, email: user.email, passwordHash: user.passwordHash, createdAt: user.createdAt };
  },

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },
};
