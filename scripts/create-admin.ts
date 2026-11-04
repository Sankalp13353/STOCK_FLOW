import 'dotenv/config';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/database/prisma';
import { APP_CONSTANTS } from '../src/config/constants';
import { promptText, promptPassword, isValidEmail, isValidPassword } from './prompt-utils';

export interface CreateAdminResult {
  success: boolean;
  message: string;
  adminId?: string;
  adminEmail?: string;
  authorizedBy?: string;
}

export interface CreateAdminOptions {
  authorizerEmail?: string;
  authorizerPassword?: string;
  name?: string;
  email?: string;
  password?: string;
  interactive?: boolean;
}

export async function createAdditionalAdmin(options?: CreateAdminOptions): Promise<CreateAdminResult> {
  console.log('====================================================');
  console.log('StockFlow — Provision Additional Administrator Account');
  console.log('====================================================');

  const canPrompt = options?.interactive !== false && Boolean(process.stdin.isTTY);

  // 1. Authorizer Identification & Authentication
  let authorizerEmail = options?.authorizerEmail?.trim().toLowerCase() || process.env.AUTHORIZER_EMAIL?.trim().toLowerCase();
  let authorizerPassword = options?.authorizerPassword || process.env.AUTHORIZER_PASSWORD;

  if ((!authorizerEmail || !authorizerPassword) && canPrompt) {
    console.log('Authorization required. Enter credentials of an active Administrator:\n');
    if (!authorizerEmail) {
      authorizerEmail = (await promptText('Authorizing Admin Email')).toLowerCase();
    }
    if (!authorizerPassword) {
      authorizerPassword = await promptPassword('Authorizing Admin Password (hidden)');
    }
  }

  if (!authorizerEmail || !authorizerPassword) {
    const errorMsg =
      'Authorization credentials missing. Provide active Administrator email and password via prompt or AUTHORIZER_EMAIL and AUTHORIZER_PASSWORD environment variables.';
    console.error(`❌ [Authorization Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 2. Verify Authorizer against Database
  const authorizer = await prisma.user.findUnique({
    where: { email: authorizerEmail },
    select: { id: true, email: true, fullName: true, role: true, passwordHash: true },
  });

  if (!authorizer) {
    const errorMsg = 'Authorization failed: Invalid administrator credentials.';
    console.error(`❌ [Authorization Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  if (authorizer.role !== UserRole.ADMIN) {
    const errorMsg = `Authorization failed: User '${authorizerEmail}' does not have ADMIN privileges (Role: ${authorizer.role}).`;
    console.error(`❌ [Authorization Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  const isPasswordValid = await bcrypt.compare(authorizerPassword, authorizer.passwordHash);
  if (!isPasswordValid) {
    const errorMsg = 'Authorization failed: Invalid administrator credentials.';
    console.error(`❌ [Authorization Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  console.log(`\n🔒 Authorization verified: ${authorizer.fullName} (${authorizer.email})`);

  // 3. Collect New Admin Details
  let newAdminName = options?.name?.trim() || process.env.NEW_ADMIN_NAME?.trim();
  let newAdminEmail = options?.email?.trim().toLowerCase() || process.env.NEW_ADMIN_EMAIL?.trim().toLowerCase();
  let newAdminPassword = options?.password || process.env.NEW_ADMIN_PASSWORD;

  if ((!newAdminName || !newAdminEmail || !newAdminPassword) && canPrompt) {
    console.log('\nEnter details for the new Administrator account:\n');
    if (!newAdminName) {
      newAdminName = await promptText('New Admin Full Name');
    }
    if (!newAdminEmail) {
      newAdminEmail = (await promptText('New Admin Email Address')).toLowerCase();
    }
    if (!newAdminPassword) {
      newAdminPassword = await promptPassword('New Admin Password (min 8 chars, hidden)');
      const confirmPassword = await promptPassword('Confirm New Admin Password (hidden)');
      if (newAdminPassword !== confirmPassword) {
        const errorMsg = 'Passwords do not match.';
        console.error(`❌ [Input Error] ${errorMsg}`);
        return { success: false, message: errorMsg };
      }
    }
  }

  if (!newAdminName || !newAdminEmail || !newAdminPassword) {
    const errorMsg =
      'Missing new administrator details. In non-interactive mode, set NEW_ADMIN_NAME, NEW_ADMIN_EMAIL, and NEW_ADMIN_PASSWORD environment variables.';
    console.error(`❌ [Input Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 4. Validate New Admin Formats
  if (newAdminName.length < 2) {
    const errorMsg = 'Administrator full name must be at least 2 characters long.';
    console.error(`❌ [Input Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  if (!isValidEmail(newAdminEmail)) {
    const errorMsg = `Invalid email address format: '${newAdminEmail}'`;
    console.error(`❌ [Input Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  const passwordValidation = isValidPassword(newAdminPassword);
  if (!passwordValidation.valid) {
    const errorMsg = passwordValidation.reason || 'Password does not meet complexity requirements.';
    console.error(`❌ [Input Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 5. Enforce Account Uniqueness & Safety: Never overwrite or promote existing accounts
  const existingUser = await prisma.user.findUnique({
    where: { email: newAdminEmail },
    select: { id: true, email: true, role: true },
  });

  if (existingUser) {
    const errorMsg = `A user with email '${newAdminEmail}' already exists (Role: ${existingUser.role}). For security, existing accounts cannot be promoted or overwritten via this command.`;
    console.error(`❌ [Conflict Error] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  // 6. Hash New Admin Password
  const passwordHash = await bcrypt.hash(newAdminPassword, APP_CONSTANTS.PASSWORD_SALT_ROUNDS);

  // 7. Atomic Creation & Audit Logging
  const newAdmin = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: newAdminName!,
        email: newAdminEmail!,
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

    // Audit log in Outbox
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'USER',
        aggregateId: created.id,
        eventType: 'ADMIN_ACCOUNT_PROVISIONED',
        payload: {
          newAdminId: created.id,
          newAdminEmail: created.email,
          newAdminFullName: created.fullName,
          authorizedByAdminId: authorizer.id,
          authorizedByAdminEmail: authorizer.email,
          provisionedAt: created.createdAt.toISOString(),
          method: 'CLI_ADMIN_CREATE',
        },
      },
    });

    return created;
  });

  console.log('\n✅ Additional administrator successfully created:');
  console.log(`   User ID:       ${newAdmin.id}`);
  console.log(`   Full Name:     ${newAdmin.fullName}`);
  console.log(`   Email:         ${newAdmin.email}`);
  console.log(`   Role:          ${newAdmin.role}`);
  console.log(`   Authorized By: ${authorizer.fullName} (${authorizer.email})`);
  console.log(`   Created:       ${newAdmin.createdAt.toISOString()}`);
  console.log('   Audit:         Logged ADMIN_ACCOUNT_PROVISIONED event to outbox.');

  return {
    success: true,
    message: 'Additional administrator successfully created',
    adminId: newAdmin.id,
    adminEmail: newAdmin.email,
    authorizedBy: authorizer.email,
  };
}

if (process.env.NODE_ENV !== 'test' && (require.main === module || process.argv[1]?.endsWith('create-admin.ts'))) {
  createAdditionalAdmin()
    .then((result) => {
      if (!result.success) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Unexpected admin creation failure:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

