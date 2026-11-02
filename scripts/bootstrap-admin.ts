import 'dotenv/config';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { APP_CONSTANTS } from '../src/config/constants';

export interface BootstrapResult {
  success: boolean;
  message: string;
  adminId?: string;
  adminEmail?: string;
}

export async function bootstrapInitialAdmin(): Promise<BootstrapResult> {
  const adminName = process.env.ADMIN_NAME?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  console.log('====================================================');
  console.log('StockFlow — Initial Administrator Account Bootstrap');
  console.log('====================================================');

  if (!adminName || !adminEmail || !adminPassword) {
    const errorMsg =
      'Missing required environment variables: ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must all be defined.';
    console.error(`❌ [Bootstrap Error] ${errorMsg}`);
    console.error('Example: ADMIN_NAME="System Admin" ADMIN_EMAIL="admin@stockflow.dev" ADMIN_PASSWORD="SecurePassword123!" npm run admin:bootstrap');
    return { success: false, message: errorMsg };
  }

  // 1. Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(adminEmail)) {
    const errorMsg = `Invalid email address format: '${adminEmail}'`;
    console.error(`❌ [Bootstrap Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 2. Validate password length
  if (adminPassword.length < 8) {
    const errorMsg = 'ADMIN_PASSWORD must be at least 8 characters long.';
    console.error(`❌ [Bootstrap Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 3. Safety Check: Enforce single initial administrator creation.
  // If an administrator already exists, do not silently create another one.
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    select: { id: true, email: true, createdAt: true },
  });

  if (existingAdmin) {
    const warnMsg = `An administrator account already exists (${existingAdmin.email}, ID: ${existingAdmin.id}). For system security, initial bootstrap can only provision the primary administrator.`;
    console.warn(`⚠️  [Safety Notice] ${warnMsg}`);
    console.warn('To manage users or assign additional administrators, sign in with an existing administrator account.');
    return { success: false, message: warnMsg };
  }

  // 4. Safety Check: If email is already taken by a non-admin account, fail safely without changing role or credentials.
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true, role: true },
  });

  if (existingUser) {
    const warnMsg = `A user with email '${adminEmail}' already exists with role '${existingUser.role}'. Existing user credentials and role were not modified.`;
    console.warn(`⚠️  [Safety Notice] ${warnMsg}`);
    return { success: false, message: warnMsg };
  }

  // 5. Securely hash password using standard bcrypt implementation
  const passwordHash = await bcrypt.hash(adminPassword, APP_CONSTANTS.PASSWORD_SALT_ROUNDS);

  // 6. Create initial administrator
  const admin = await prisma.user.create({
    data: {
      fullName: adminName,
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
    },
  });

  console.log('✅ Initial administrator successfully created:');
  console.log(`   User ID:   ${admin.id}`);
  console.log(`   Full Name: ${admin.fullName}`);
  console.log(`   Email:     ${admin.email}`);
  console.log(`   Role:      ${admin.role}`);
  console.log(`   Created:   ${admin.createdAt.toISOString()}`);
  console.log('   Security:  Password securely hashed with bcrypt (10 rounds). Plaintext credentials were not stored or logged.');

  return {
    success: true,
    message: 'Initial administrator successfully created',
    adminId: admin.id,
    adminEmail: admin.email,
  };
}

if (process.env.NODE_ENV !== 'test' && (require.main === module || process.argv[1]?.endsWith('bootstrap-admin.ts'))) {
  bootstrapInitialAdmin()
    .then((result) => {
      if (!result.success && result.message.startsWith('Missing required')) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Unexpected bootstrap failure:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

