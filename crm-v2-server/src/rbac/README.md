# RBAC Controller

This controller provides endpoints for managing Role-Based Access Control (RBAC) in the SMS application.

## Authentication & Authorization

All endpoints require:
- JWT authentication via Bearer token
- User must have `admin` role (except where noted)

## Endpoints

### Permission Management

### 1. Get All Permissions

**GET** `/api/sms/rbac/permissions`

Returns all active permissions in the system.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "action": "create",
      "subject": "User",
      "conditions": null,
      "description": "Create new users",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 10
}
```

---

### 2. Get Permissions by Role ID

**GET** `/api/sms/rbac/permissions/role/:roleId`

Returns all permissions assigned to a specific role.

**Parameters:**
- `roleId` (path): Role UUID

**Response:**
```json
{
  "success": true,
  "data": [...],
  "count": 5
}
```

---

### 3. Get Permissions by Role Name

**GET** `/api/sms/rbac/permissions/role?name=admin`

Returns all permissions assigned to a role by its name.

**Query Parameters:**
- `name` (required): Role name (e.g., "admin", "teacher", "student")

**Response:**
```json
{
  "success": true,
  "data": [...],
  "count": 5
}
```

---

### 4. Get Permissions for User

**GET** `/api/sms/rbac/permissions/user/:userId`

Returns all permissions for a specific user based on their assigned roles.

**Parameters:**
- `userId` (path): User UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "roles": [
      {
        "id": "uuid",
        "name": "admin",
        "description": "Administrator role",
        "is_active": true,
        "is_system_role": true
      }
    ],
    "permissions": [...]
  },
  "roles_count": 2,
  "permissions_count": 15
}
```

---

### 5. Get All Roles

**GET** `/api/sms/rbac/roles`

Returns all active roles with their permissions.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "admin",
      "description": "Administrator role",
      "is_active": true,
      "is_system_role": true,
      "permissions": [...]
    }
  ],
  "count": 3
}
```

---

### 6. Get Role by ID

**GET** `/api/sms/rbac/roles/:roleId`

Returns a specific role with its permissions.

**Parameters:**
- `roleId` (path): Role UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "admin",
    "description": "Administrator role",
    "is_active": true,
    "is_system_role": true,
    "permissions": [...]
  }
}
```

---

## Error Responses

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Role with ID {id} not found",
  "error": "Not Found"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

---

### 7. Create Permission

**POST** `/api/sms/rbac/permissions`

Create a new permission.

**Authentication:** Required (Admin only)

**Request Body:**
```json
{
  "action": "create",
  "subject": "User",
  "conditions": "{\"field\": \"ownerId\"}",
  "description": "Allows creating new users"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Permission created successfully",
  "data": {
    "id": "uuid",
    "action": "create",
    "subject": "User",
    "conditions": "{\"field\": \"ownerId\"}",
    "description": "Allows creating new users",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Response (409 Conflict):**
```json
{
  "statusCode": 409,
  "message": "Permission with action \"create\" and subject \"User\" already exists",
  "error": "Conflict"
}
```

---

### 8. Delete Permission

**DELETE** `/api/sms/rbac/permissions/:permissionId`

Soft delete a permission (sets is_active to false).

**Authentication:** Required (Admin only)

**Parameters:**
- `permissionId` (path): Permission UUID

**Response:**
```json
{
  "success": true,
  "message": "Permission deleted successfully"
}
```

---

### 9. Assign Permissions to Role

**POST** `/api/sms/rbac/roles/:roleId/permissions/assign`

Assign one or more permissions to a role.

**Authentication:** Required (Admin only)

**Parameters:**
- `roleId` (path): Role UUID

**Request Body:**
```json
{
  "permission_ids": [
    "permission-uuid-1",
    "permission-uuid-2",
    "permission-uuid-3"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Permissions assigned successfully",
  "data": {
    "id": "uuid",
    "name": "admin",
    "description": "Administrator role",
    "is_active": true,
    "is_system_role": true,
    "permissions": [...]
  }
}
```

**Error Responses:**

**400 Bad Request (Already Assigned):**
```json
{
  "statusCode": 400,
  "message": "All specified permissions are already assigned to this role",
  "error": "Bad Request"
}
```

**400 Bad Request (Invalid Permissions):**
```json
{
  "statusCode": 400,
  "message": "Some permissions not found: uuid-1, uuid-2",
  "error": "Bad Request"
}
```

---

### 10. Remove Permissions from Role

**POST** `/api/sms/rbac/roles/:roleId/permissions/unassign`

Remove one or more permissions from a role.

**Authentication:** Required (Admin only)

**Parameters:**
- `roleId` (path): Role UUID

**Request Body:**
```json
{
  "permission_ids": [
    "permission-uuid-1",
    "permission-uuid-2"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Permissions removed successfully",
  "data": {
    "id": "uuid",
    "name": "admin",
    "description": "Administrator role",
    "is_active": true,
    "is_system_role": true,
    "permissions": [...]
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "None of the specified permissions are assigned to this role",
  "error": "Bad Request"
}
```

---

## Usage Examples

### Using curl

```bash
# Get all permissions
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3005/api/sms/rbac/permissions

# Create a new permission
curl -X POST http://localhost:3005/api/sms/rbac/permissions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "subject": "User",
    "description": "Allows creating new users"
  }'

# Delete a permission
curl -X DELETE http://localhost:3005/api/sms/rbac/permissions/PERMISSION_UUID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Assign permissions to a role
curl -X POST http://localhost:3005/api/sms/rbac/roles/ROLE_UUID/permissions/assign \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permission_ids": ["uuid-1", "uuid-2", "uuid-3"]
  }'

# Remove permissions from a role
curl -X POST http://localhost:3005/api/sms/rbac/roles/ROLE_UUID/permissions/unassign \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permission_ids": ["uuid-1", "uuid-2"]
  }'

# Get permissions for a role
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3005/api/sms/rbac/permissions/role?name=admin

# Get user permissions
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3005/api/sms/rbac/permissions/user/USER_UUID

# Get all roles
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3005/api/sms/rbac/roles
```

### Using JavaScript/TypeScript

```typescript
const token = 'YOUR_JWT_TOKEN';

// Get all permissions
const response = await fetch('http://localhost:3005/api/sms/rbac/permissions', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const data = await response.json();

// Get permissions for a user
const userPermissions = await fetch(
  `http://localhost:3005/api/sms/rbac/permissions/user/${userId}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
```

## Files

- `rbac.controller.ts` - Controller with all RBAC endpoints
- `rbac.service.ts` - Service handling RBAC business logic
- Module is registered in `sms.module.ts`
