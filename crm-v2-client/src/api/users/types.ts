export interface StaffUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  province?: string | null;
  avatar_url?: string | null;
  roles: { id: string; name: string }[];
  created_at: string;
  updated_at: string;
}

export interface CreateUserDto {
  email: string;
  first_name: string;
  last_name: string;
  password?: string;
  role_ids?: string[];
}

export interface UpdateUserDto {
  first_name?: string;
  last_name?: string;
  role_ids?: string[];
}
