// Permission actions that can be performed
export enum Action {
  MANAGE = 'manage', // Full access to resource
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXPORT = 'export',
  IMPORT = 'import',
}

// Resources/subjects that permissions apply to
export enum Subject {
  ALL = 'all',
  USER = 'User',
  ROLE = 'Role',
  PERMISSION = 'Permission',
  REPORT = 'Report',
  SETTINGS = 'Settings',
  DEAL = 'Deal',
  LEAD = 'Lead',
  CONTACT = 'Contact',
  SCHOOL = 'School',
  INVOICE = 'Invoice',
  QUOTE = 'Quote',
  PAYMENT = 'Payment',
  PRODUCT = 'Product',
  PIPELINE = 'Pipeline',
}

// Predefined permission strings for common use cases
export const Permissions = {
  // User management
  MANAGE_USERS: 'manage:User',
  CREATE_USER: 'create:User',
  READ_USER: 'read:User',
  UPDATE_USER: 'update:User',
  DELETE_USER: 'delete:User',

  // Role management
  MANAGE_ROLES: 'manage:Role',
  CREATE_ROLE: 'create:Role',
  READ_ROLE: 'read:Role',
  UPDATE_ROLE: 'update:Role',
  DELETE_ROLE: 'delete:Role',

  // Permission management
  MANAGE_PERMISSIONS: 'manage:Permission',
  READ_PERMISSION: 'read:Permission',


  // Settings
  MANAGE_SETTINGS: 'manage:Settings',
  READ_SETTINGS: 'read:Settings',
  UPDATE_SETTINGS: 'update:Settings',
} as const;
