import 'dotenv/config';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { APP_CONSTANTS } from '../src/config/constants';
import { promptText, promptPassword, isValidEmail, isValidPassword } from './prompt-utils';

export interface BootstrapResult {
  success: boolean;
  message: string;
  adminId?: string;
  adminEmail?: string;
}

export interface BootstrapOptions {
  name?: string;
  email?: string;
  password?: string;
  interactive?: boolean;
}

export async function bootstrapInitialAdmin(options?: BootstrapOptions): Promise<BootstrapResult> {
  console.log('====================================================');
  console.log('StockFlow — Initial Administrator Account Bootstrap');
  console.log('====================================================');

  // 1. Safety Check: Enforce single initial administrator creation.
  // If an administrator already exists, abort immediately before prompting or hashing.
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    select: { id: true, email: true, createdAt: true },
  });

  if (existingAdmin) {
    const warnMsg = `An administrator account already exists (${existingAdmin.email}, ID: ${existingAdmin.id}). For system security, initial bootstrap can only provision the primary administrator.`;
    console.warn(`⚠️  [Safety Notice] ${warnMsg}`);
    console.warn('To provision additional administrators, use: npm run admin:create');
    return { success: false, message: warnMsg };
  }

  // 2. Resolve credentials from options, environment variables, or interactive prompt
  let adminName = options?.name?.trim() || process.env.ADMIN_NAME?.trim();
  let adminEmail = options?.email?.trim().toLowerCase() || process.env.ADMIN_EMAIL?.trim().toLowerCase();
  let adminPassword = options?.password || process.env.ADMIN_PASSWORD;

  const canPrompt = options?.interactive !== false && Boolean(process.stdin.isTTY);

  if ((!adminName || !adminEmail || !adminPassword) && canPrompt) {
    console.log('Required credentials not supplied via environment variables. Entering secure interactive setup...\n');

    if (!adminName) {
      adminName = await promptText('Enter Administrator Full Name');
    }

    if (!adminEmail) {
      adminEmail = (await promptText('Enter Administrator Email Address')).toLowerCase();
    }

    if (!adminPassword) {
      adminPassword = await promptPassword('Enter Administrator Password (hidden)');
      const confirmPassword = await promptPassword('Confirm Administrator Password (hidden)');
      if (adminPassword !== confirmPassword) {
        const errorMsg = 'Passwords do not match.';
        console.error(`❌ [Bootstrap Error] ${errorMsg}`);
        return { success: false, message: errorMsg };
      }
    }
  }

  if (!adminName || !adminEmail || !adminPassword) {
    const errorMsg =
      'Missing required credentials. In non-interactive mode, set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD environment variables.';
    console.error(`❌ [Bootstrap Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 3. Validate name format
  if (adminName.length < 2) {
    const errorMsg = 'Administrator full name must be at least 2 characters long.';
    console.error(`❌ [Bootstrap Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 4. Validate email format
  if (!isValidEmail(adminEmail)) {
    const errorMsg = `Invalid email address format: '${adminEmail}'`;
    console.error(`❌ [Bootstrap Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 5. Validate password requirements
  const passwordValidation = isValidPassword(adminPassword);
  if (!passwordValidation.valid) {
    const errorMsg = passwordValidation.reason || 'Password does not meet complexity requirements.';
    console.error(`❌ [Bootstrap Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 6. Safety Check: If email is already taken by an existing non-admin account, refuse to overwrite or promote.
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true, role: true },
  });

  if (existingUser) {
    const warnMsg = `A user with email '${adminEmail}' already exists with role '${existingUser.role}'. Existing user credentials and role were not modified.`;
    console.warn(`⚠️  [Safety Notice] ${warnMsg}`);
    return { success: false, message: warnMsg };
  }

  // 7. Securely hash password using standard bcrypt configuration
  const passwordHash = await bcrypt.hash(adminPassword, APP_CONSTANTS.PASSWORD_SALT_ROUNDS);

  // 8. Create initial administrator and audit record atomically
  const admin = await prisma.$transaction(async (tx) => {
    const newAdmin = await tx.user.create({
      data: {
        fullName: adminName!,
        email: adminEmail!,
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

    // Record audit event in Outbox
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'USER',
        aggregateId: newAdmin.id,
        eventType: 'ADMIN_ACCOUNT_BOOTSTRAPPED',
        payload: {
          adminId: newAdmin.id,
          adminEmail: newAdmin.email,
          adminFullName: newAdmin.fullName,
          bootstrappedAt: newAdmin.createdAt.toISOString(),
          method: 'CLI_BOOTSTRAP',
        },
      },
    });

    return newAdmin;
  });

  console.log('\n✅ Initial administrator successfully created:');
  console.log(`   User ID:   ${admin.id}`);
  console.log(`   Full Name: ${admin.fullName}`);
  console.log(`   Email:     ${admin.email}`);
  console.log(`   Role:      ${admin.role}`);
  console.log(`   Created:   ${admin.createdAt.toISOString()}`);
  console.log('   Security:  Password securely hashed with bcrypt (10 rounds). Plaintext credentials were not stored or logged.');
  console.log('   Audit:     Logged ADMIN_ACCOUNT_BOOTSTRAPPED event to outbox.');

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
