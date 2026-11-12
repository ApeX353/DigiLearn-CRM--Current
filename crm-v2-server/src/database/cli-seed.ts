import 'reflect-metadata';
import { runSeeds } from './seeds';
import { AppDataSource } from './datasource';



async function seed() {
  try {
    console.log('📦 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✅ Database connected!\n');

    await runSeeds(AppDataSource);

    await AppDataSource.destroy();
    console.log('\n👋 Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
