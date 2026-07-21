import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import * as argon2 from '@node-rs/argon2';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../auth/entities/role.entity';
import { AccountSecurity } from '../../auth/entities/account-security.entity';

/**
 * Bootstrap admin user for fresh databases.
 *
 * Idempotent: does nothing when ANY user already holds the admin role
 * (so it never touches an environment that is already set up), or when
 * a user with the configured email already exists.
 *
 * Configuration (all optional):
 *   ADMIN_EMAIL      — defaults to admin@digilearn.com
 *   ADMIN_PASSWORD   — if unset, a random password is generated and
 *                      printed ONCE to the boot log, and the account is
 *                      flagged requires_password_change so the operator
 *                      must rotate it on first login.
 *   ADMIN_FIRST_NAME / ADMIN_LAST_NAME — default "Admin" / "User"
 */
export async function seedAdminUser(dataSource: DataSource) {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);
  const securityRepository = dataSource.getRepository(AccountSecurity);

  console.log('🌱 Checking bootstrap admin user...');

  const adminRole = await roleRepository.findOne({ where: { name: 'admin' } });
  if (!adminRole) {
    // Roles are seeded before this runs (see seeds/index.ts); if the
    // role is missing something is wrong — bail loudly rather than
    // creating an unprivileged "admin".
    throw new Error(
      'seedAdminUser: admin role not found — run seedRolesAndPermissions first',
    );
  }

  // If anyone already has the admin role, this environment is set up.
  const existingAdmin = await userRepository
    .createQueryBuilder('user')
    .innerJoin('user.roles', 'role', 'role.name = :name', { name: 'admin' })
    .getOne();
  if (existingAdmin) {
    console.log(`  ℹ Admin user exists (${existingAdmin.email}) — skipping`);
    return;
  }

  const email = process.env.ADMIN_EMAIL || 'admin@digilearn.com';

  const existingByEmail = await userRepository.findOne({ where: { email } });
  if (existingByEmail) {
    console.log(`  ℹ User ${email} already exists — skipping admin bootstrap`);
    return;
  }

  const passwordProvided = !!process.env.ADMIN_PASSWORD;
  const password =
    process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');

  const user = userRepository.create({
    email,
    first_name: process.env.ADMIN_FIRST_NAME || 'Admin',
    last_name: process.env.ADMIN_LAST_NAME || 'User',
    is_active: true,
    roles: [adminRole],
  });
  await userRepository.save(user);

  const security = securityRepository.create({
    user_id: user.id,
    password_hash: await argon2.hash(password),
    email_verified: true,
    // A provided password is the operator's responsibility; a generated
    // one must be rotated on first login.
    requires_password_change: !passwordProvided,
  });
  await securityRepository.save(security);

  console.log(`  ✓ Created bootstrap admin: ${email}`);
  if (!passwordProvided) {
    // Printed exactly once, on the boot that created the account.
    console.log(
      `  ⚠ Generated admin password (rotate on first login): ${password}`,
    );
  }
}
