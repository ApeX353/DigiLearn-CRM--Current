import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from the project root. `__dirname` is either
// `dist/database` (prod) or `src/database` (ts-node), so two levels
// up reaches the project root in both layouts.
config({ path: join(__dirname, '../../.env') });

// TypeORM CLI datasource (used by `typeorm migration:run` etc.). The
// running app uses DatabaseConfigService which reads the same env
// values; this file must mirror that configuration or CLI migrations
// will talk to the wrong database.
export const AppDataSource = new DataSource({
  type: (process.env.DB_TYPE as 'postgres') || 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD as string,
  database: process.env.DATABASE_NAME,
  entities: [join(__dirname, '..', '**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  synchronize: false,
});
