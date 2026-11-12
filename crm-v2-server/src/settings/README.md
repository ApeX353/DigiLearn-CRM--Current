# Settings Controller

This controller manages application settings including site information, contact details, logo, and configuration.

## Endpoints

### 1. Get Settings

**GET** `/api/sms/settings`

Returns current application settings.

**Authentication:** Public (no authentication required)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "site_name": "DigiLearn School Management System",
    "logo_url": "/uploads/logos/logo-1234567890.png",
    "primary_address": "123 School Street, Education City, EC 12345",
    "secondary_address": "P.O. Box 456, Education City, EC 12345",
    "primary_email": "info@digilearn.school",
    "secondary_email": "support@digilearn.school",
    "helpline": "1-800-DIGILEARN",
    "primary_phone": "+1-555-123-4567",
    "secondary_phone": "+1-555-123-4568",
    "fax": "+1-555-123-4569",
    "website": "https://www.digilearn.school",
    "description": "Leading school management system providing quality education",
    "social_media": {
      "facebook": "https://facebook.com/digilearn",
      "twitter": "https://twitter.com/digilearn",
      "linkedin": "https://linkedin.com/company/digilearn",
      "instagram": "https://instagram.com/digilearn",
      "youtube": "https://youtube.com/@digilearn"
    },
    "business_hours": {
      "monday": "8:00 AM - 5:00 PM",
      "tuesday": "8:00 AM - 5:00 PM",
      "wednesday": "8:00 AM - 5:00 PM",
      "thursday": "8:00 AM - 5:00 PM",
      "friday": "8:00 AM - 5:00 PM",
      "saturday": "8:00 AM - 12:00 PM",
      "sunday": "Closed"
    },
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 2. Update Settings

**PUT** `/api/sms/settings`

Update application settings.

**Authentication:** Required (Admin only)

**Request Body:**
```json
{
  "site_name": "DigiLearn School Management System",
  "primary_address": "123 School Street, Education City, EC 12345",
  "secondary_address": "P.O. Box 456, Education City, EC 12345",
  "primary_email": "info@digilearn.school",
  "secondary_email": "support@digilearn.school",
  "helpline": "1-800-DIGILEARN",
  "primary_phone": "+1-555-123-4567",
  "secondary_phone": "+1-555-123-4568",
  "fax": "+1-555-123-4569",
  "website": "https://www.digilearn.school",
  "description": "Leading school management system providing quality education",
  "social_media": {
    "facebook": "https://facebook.com/digilearn",
    "twitter": "https://twitter.com/digilearn",
    "linkedin": "https://linkedin.com/company/digilearn",
    "instagram": "https://instagram.com/digilearn",
    "youtube": "https://youtube.com/@digilearn"
  },
  "business_hours": {
    "monday": "8:00 AM - 5:00 PM",
    "tuesday": "8:00 AM - 5:00 PM",
    "wednesday": "8:00 AM - 5:00 PM",
    "thursday": "8:00 AM - 5:00 PM",
    "friday": "8:00 AM - 5:00 PM",
    "saturday": "8:00 AM - 12:00 PM",
    "sunday": "Closed"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Settings updated successfully",
  "data": { ...updated settings... }
}
```

---

### 3. Upload Logo

**POST** `/api/sms/settings/logo`

Upload application logo.

**Authentication:** Required (Admin only)

**Content-Type:** `multipart/form-data`

**Request:**
- Form field name: `logo`
- Accepted formats: JPEG, PNG, GIF, WebP
- Max file size: 5MB

**Response:**
```json
{
  "success": true,
  "message": "Logo uploaded successfully",
  "data": {
    "logo_url": "/uploads/logos/logo-1234567890.png"
  }
}
```

---

### 4. Delete Logo

**DELETE** `/api/sms/settings/logo`

Delete the current application logo.

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "success": true,
  "message": "Logo deleted successfully"
}
```

---

### 5. Reset Settings

**POST** `/api/sms/settings/reset`

Reset all settings to default values.

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "success": true,
  "message": "Settings reset to default values",
  "data": { ...default settings... }
}
```

---

## Error Responses

### 400 Bad Request (Invalid File)
```json
{
  "statusCode": 400,
  "message": "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed",
  "error": "Bad Request"
}
```

### 400 Bad Request (File Too Large)
```json
{
  "statusCode": 400,
  "message": "File size exceeds 5MB limit",
  "error": "Bad Request"
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

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "No logo found",
  "error": "Not Found"
}
```

---

## Usage Examples

### Get Settings (Public)

```bash
curl http://localhost:3005/api/sms/settings
```

### Update Settings

```bash
curl -X PUT http://localhost:3005/api/sms/settings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "site_name": "My School",
    "primary_email": "info@myschool.com",
    "primary_phone": "+1-555-123-4567"
  }'
```

### Upload Logo

```bash
curl -X POST http://localhost:3005/api/sms/settings/logo \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "logo=@/path/to/logo.png"
```

### Delete Logo

```bash
curl -X DELETE http://localhost:3005/api/sms/settings/logo \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Reset Settings

```bash
curl -X POST http://localhost:3005/api/sms/settings/reset \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Using JavaScript/TypeScript

### Get Settings

```typescript
const response = await fetch('http://localhost:3005/api/sms/settings');
const data = await response.json();
console.log(data.data);
```

### Update Settings

```typescript
const token = 'YOUR_JWT_TOKEN';

const response = await fetch('http://localhost:3005/api/sms/settings', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    site_name: 'My School',
    primary_email: 'info@myschool.com',
    primary_phone: '+1-555-123-4567'
  })
});

const data = await response.json();
```

### Upload Logo

```typescript
const token = 'YOUR_JWT_TOKEN';
const fileInput = document.getElementById('logo-input') as HTMLInputElement;
const file = fileInput.files[0];

const formData = new FormData();
formData.append('logo', file);

const response = await fetch('http://localhost:3005/api/sms/settings/logo', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const data = await response.json();
console.log(data.data.logo_url);
```

---

## Database Schema

The settings are stored in the `app_settings` table:

```sql
CREATE TABLE app_settings (
  id UUID PRIMARY KEY,
  site_name VARCHAR,
  logo_url VARCHAR,
  primary_address TEXT,
  secondary_address TEXT,
  primary_email VARCHAR,
  secondary_email VARCHAR,
  helpline VARCHAR,
  primary_phone VARCHAR,
  secondary_phone VARCHAR,
  fax VARCHAR,
  website VARCHAR,
  description TEXT,
  social_media JSONB,
  business_hours JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## Files

- `entities/settings.entity.ts` - Settings database entity
- `dto/update-settings.dto.ts` - DTO for updating settings
- `settings.service.ts` - Service handling settings business logic
- `settings.controller.ts` - Controller with all settings endpoints
- Module is registered in `sms.module.ts`

---

## File Storage

Uploaded logos are stored in:
- Directory: `uploads/logos/`
- Naming: `logo-{timestamp}.{extension}`
- Accessible via: `http://localhost:3005/uploads/logos/{filename}`
- Old logos are automatically deleted when new ones are uploaded

**Note:** Make sure to add `uploads/` to your `.gitignore` file to avoid committing uploaded files.
