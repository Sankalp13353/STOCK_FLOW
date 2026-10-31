import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { env } from '../src/config/env';
import { AuthenticatedUserPayload } from '../src/common/types';

export async function createTestUser(role: UserRole = UserRole.CUSTOMER) {
  const email = `test-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(7)}@stockflow.internal`;
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: `Test ${role}`,
      role,
    },
  });

  const payload: AuthenticatedUserPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' });

  return { user, token };
}

