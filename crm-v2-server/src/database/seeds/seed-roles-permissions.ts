import { DataSource } from 'typeorm';
import { Role } from '../../auth/entities/role.entity';
import { Permission } from '../../auth/entities/permission.entity';
import { RolePermission } from '../../auth/entities/role-permission.entity';

interface RolePermissionData {
  role: string;
  action: string;
  subject: string;
  conditions: string | null;
}

export async function seedRolesAndPermissions(dataSource: DataSource) {
  const roleRepository = dataSource.getRepository(Role);
  const permissionRepository = dataSource.getRepository(Permission);
  const rolePermissionRepository = dataSource.getRepository(RolePermission);

  console.log('ðŸŒ± Seeding roles and permissions...');

  // ========================
  // All role-permission assignments
  // Subjects: Dashboard, Lead, LeadActivity, Deal, User, Company,
  //           Report, Quote, Invoice, Raffle, PaymentTerm, Installment,
  //           Payment, Product
  // ========================

  const rolePermissionsData: RolePermissionData[] = [
    // ========================
    // Admin â€” manage all
    // ========================
    { role: 'admin', action: 'manage', subject: 'Dashboard', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Lead', conditions: null },
    { role: 'admin', action: 'manage', subject: 'LeadActivity', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Deal', conditions: null },
    { role: 'admin', action: 'manage', subject: 'User', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Company', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Report', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Quote', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Invoice', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Raffle', conditions: null },
    { role: 'admin', action: 'manage', subject: 'PaymentTerm', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Installment', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Payment', conditions: null },
    { role: 'admin', action: 'manage', subject: 'Product', conditions: null },

    // ========================
    // Admin Support â€” same full access as admin. The role shipped in
    // production with ZERO permission rows, so admin_support users could
    // see nothing (empty CASL ability + no matching nav). Grant it the
    // same manage-all set as admin.
    // ========================
    { role: 'admin_support', action: 'manage', subject: 'Dashboard', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Lead', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'LeadActivity', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Deal', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'User', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Company', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Report', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Quote', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Invoice', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Raffle', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'PaymentTerm', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Installment', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Payment', conditions: null },
    { role: 'admin_support', action: 'manage', subject: 'Product', conditions: null },

    // ========================
    // Manager â€” read-only on most entities
    // ========================
    { role: 'manager', action: 'read', subject: 'Dashboard', conditions: null },
    { role: 'manager', action: 'read', subject: 'Report', conditions: null },
    { role: 'manager', action: 'read', subject: 'User', conditions: null },
    { role: 'manager', action: 'read', subject: 'Lead', conditions: null },
    { role: 'manager', action: 'read', subject: 'Deal', conditions: null },
    { role: 'manager', action: 'read', subject: 'Quote', conditions: null },
    { role: 'manager', action: 'read', subject: 'Invoice', conditions: null },
    { role: 'manager', action: 'read', subject: 'Company', conditions: null },
    { role: 'manager', action: 'read', subject: 'Raffle', conditions: null },
    { role: 'manager', action: 'read', subject: 'PaymentTerm', conditions: null },
    { role: 'manager', action: 'read', subject: 'Installment', conditions: null },
    { role: 'manager', action: 'read', subject: 'Payment', conditions: null },
    { role: 'manager', action: 'read', subject: 'Product', conditions: null },

    // ========================
    // Sales Manager â€” full CRUD on sales entities
    // ========================
    { role: 'sales_manager', action: 'read', subject: 'Dashboard', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Report', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'User', conditions: null },
    // Company
    { role: 'sales_manager', action: 'create', subject: 'Company', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Company', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Company', conditions: null },
    // Lead
    { role: 'sales_manager', action: 'create', subject: 'Lead', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Lead', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Lead', conditions: null },
    { role: 'sales_manager', action: 'delete', subject: 'Lead', conditions: null },
    // LeadActivity
    { role: 'sales_manager', action: 'create', subject: 'LeadActivity', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'LeadActivity', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'LeadActivity', conditions: null },
    // Deal
    { role: 'sales_manager', action: 'create', subject: 'Deal', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Deal', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Deal', conditions: null },
    { role: 'sales_manager', action: 'delete', subject: 'Deal', conditions: null },
    // Quote
    { role: 'sales_manager', action: 'create', subject: 'Quote', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Quote', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Quote', conditions: null },
    { role: 'sales_manager', action: 'delete', subject: 'Quote', conditions: null },
    // Invoice
    { role: 'sales_manager', action: 'create', subject: 'Invoice', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Invoice', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Invoice', conditions: null },
    { role: 'sales_manager', action: 'delete', subject: 'Invoice', conditions: null },
    // Raffle
    { role: 'sales_manager', action: 'create', subject: 'Raffle', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Raffle', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Raffle', conditions: null },
    { role: 'sales_manager', action: 'delete', subject: 'Raffle', conditions: null },
    // PaymentTerm
    { role: 'sales_manager', action: 'create', subject: 'PaymentTerm', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'PaymentTerm', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'PaymentTerm', conditions: null },
    // Installment
    { role: 'sales_manager', action: 'read', subject: 'Installment', conditions: null },
    // Payment
    { role: 'sales_manager', action: 'create', subject: 'Payment', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Payment', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Payment', conditions: null },
    { role: 'sales_manager', action: 'delete', subject: 'Payment', conditions: null },
    // Product
    { role: 'sales_manager', action: 'create', subject: 'Product', conditions: null },
    { role: 'sales_manager', action: 'read', subject: 'Product', conditions: null },
    { role: 'sales_manager', action: 'update', subject: 'Product', conditions: null },

    // ========================
    // Sales Rep â€” limited access, own records via conditions
    // ========================
    { role: 'sales_rep', action: 'read', subject: 'Dashboard', conditions: null },
    { role: 'sales_rep', action: 'read', subject: 'User', conditions: '{"id":"${id}"}' },
    // Lead
    { role: 'sales_rep', action: 'create', subject: 'Lead', conditions: null },
    { role: 'sales_rep', action: 'read', subject: 'Lead', conditions: '{"ownerId":"${id}"}' },
    { role: 'sales_rep', action: 'update', subject: 'Lead', conditions: '{"ownerId":"${id}"}' },
    // LeadActivity
    { role: 'sales_rep', action: 'create', subject: 'LeadActivity', conditions: '{"leadId":"${id}"}' },
    { role: 'sales_rep', action: 'read', subject: 'LeadActivity', conditions: '{"createdBy":"${id}"}' },
    { role: 'sales_rep', action: 'update', subject: 'LeadActivity', conditions: '{"createdBy":"${id}"}' },
    // Deal
    { role: 'sales_rep', action: 'create', subject: 'Deal', conditions: null },
    { role: 'sales_rep', action: 'read', subject: 'Deal', conditions: '{"assignedTo":"${id}"}' },
    { role: 'sales_rep', action: 'update', subject: 'Deal', conditions: '{"assignedTo":"${id}"}' },
    // Company
    { role: 'sales_rep', action: 'create', subject: 'Company', conditions: null },
    { role: 'sales_rep', action: 'read', subject: 'Company', conditions: null },
    { role: 'sales_rep', action: 'update', subject: 'Company', conditions: null },
    // Quote
    { role: 'sales_rep', action: 'create', subject: 'Quote', conditions: null },
    { role: 'sales_rep', action: 'read', subject: 'Quote', conditions: '{"createdBy":"${id}"}' },
    { role: 'sales_rep', action: 'update', subject: 'Quote', conditions: '{"createdBy":"${id}"}' },
    // Invoice
    { role: 'sales_rep', action: 'create', subject: 'Invoice', conditions: null },
    { role: 'sales_rep', action: 'read', subject: 'Invoice', conditions: '{"createdBy":"${id}"}' },
    { role: 'sales_rep', action: 'update', subject: 'Invoice', conditions: '{"createdBy":"${id}"}' },
    // PaymentTerm
    { role: 'sales_rep', action: 'read', subject: 'PaymentTerm', conditions: null },
    // Installment
    { role: 'sales_rep', action: 'read', subject: 'Installment', conditions: null },
    // Payment
    { role: 'sales_rep', action: 'create', subject: 'Payment', conditions: null },
    { role: 'sales_rep', action: 'read', subject: 'Payment', conditions: null },
    // Product
    { role: 'sales_rep', action: 'read', subject: 'Product', conditions: null },
  ];

  // Extract unique permissions
  const uniquePermissions = Array.from(
    new Map(
      rolePermissionsData.map((rp) => [
        `${rp.action}:${rp.subject}`,
        { action: rp.action, subject: rp.subject },
      ]),
    ).values(),
  );

  // Create or get permissions
  const permissionMap = new Map<string, Permission>();
  for (const permData of uniquePermissions) {
    let permission = await permissionRepository.findOne({
      where: { action: permData.action, subject: permData.subject },
    });

    if (!permission) {
      permission = permissionRepository.create({
        action: permData.action,
        subject: permData.subject,
        description: `${permData.action} ${permData.subject}`,
      });
      await permissionRepository.save(permission);
      console.log(
        `  âœ“ Created permission: ${permData.action}:${permData.subject}`,
      );
    } else {
      console.log(
        `  â„¹ Permission exists: ${permData.action}:${permData.subject}`,
      );
    }

    permissionMap.set(`${permData.action}:${permData.subject}`, permission);
  }

  // Extract unique roles. `finance` carries no CASL permission rows —
  // it exists for the cash-requisition approval chain, whose routes
  // are gated by @Roles(name) checks — but it must still be seeded so
  // admins can assign it to users.
  const uniqueRoleNames = Array.from(
    new Set([...rolePermissionsData.map((rp) => rp.role), 'finance']),
  );

  const roleDescriptions: Record<string, string> = {
    admin: 'System administrator with full access',
    admin_support: 'Admin support with full administrative access',
    manager: 'Manager with reporting and user access',
    'sales_manager': 'Sales manager with full sales access',
    sales_rep: 'Sales agent with limited access to own records',
    finance: 'Finance officer — approves and pays cash requisitions',
  };

  // Create or get roles
  const roleMap = new Map<string, Role>();
  for (const roleName of uniqueRoleNames) {
    let role = await roleRepository.findOne({
      where: { name: roleName },
    });

    if (!role) {
      role = roleRepository.create({
        name: roleName,
        description: roleDescriptions[roleName] || `${roleName} role`,
        is_system_role: true,
      });
      await roleRepository.save(role);
      console.log(`  âœ“ Created role: ${roleName}`);
    } else {
      console.log(`  â„¹ Role exists: ${roleName}`);
    }

    roleMap.set(roleName, role);
  }

  // Create role permissions
  for (const rpData of rolePermissionsData) {
    const role = roleMap.get(rpData.role);
    const permission = permissionMap.get(`${rpData.action}:${rpData.subject}`);

    if (!role || !permission) {
      console.log(
        `  âš  Skipping: ${rpData.role} - ${rpData.action}:${rpData.subject} (not found)`,
      );
      continue;
    }

    const existingRolePermission = await rolePermissionRepository.findOne({
      where: {
        role_id: role.id,
        permission_id: permission.id,
      },
    });

    if (!existingRolePermission) {
      const rolePermission = rolePermissionRepository.create({
        role_id: role.id,
        permission_id: permission.id,
        conditions: rpData.conditions ?? undefined,
      });
      await rolePermissionRepository.save(rolePermission);
      console.log(
        `  âœ“ Linked: ${rpData.role} -> ${rpData.action}:${rpData.subject}${rpData.conditions ? ' (with conditions)' : ''}`,
      );
    } else {
      console.log(
        `  â„¹ Link exists: ${rpData.role} -> ${rpData.action}:${rpData.subject}`,
      );
    }
  }

  console.log('âœ… Roles and permissions seeded successfully!');
}
