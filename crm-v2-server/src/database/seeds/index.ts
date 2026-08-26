import { DataSource } from 'typeorm';
import { seedRolesAndPermissions } from './seed-roles-permissions';
import { seedAdminUser } from './seed-admin-user';

export async function runSeeds(dataSource: DataSource) {
  console.log('🌱 Starting database seeding...\n');

  try {
    await seedRolesAndPermissions(dataSource);
    await seedAdminUser(dataSource);
    console.log('\n✅ All seeds completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running seeds:', error);
    throw error;
  }
}
