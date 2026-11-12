import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The owner asked for the diagnostics surface to be shown to support first
 * and to him later. This setting is that switch: false hides the
 * /diagnostics routes, the System Health page and the plain-language alerts
 * from the admin role; true shows them. Flipped in Settings, no deploy.
 */
export class DiagnosticsVisibility1794000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`INSERT INTO app_settings (key, value, data_type, description, category, is_public, is_active)
      SELECT 'diagnostics.visible_to_admin', 'false'::json, 'boolean',
             'Show System Health, the /diagnostics routes and the plain-language system alerts to the admin role (support always sees them)',
             'diagnostics', false, true
      WHERE NOT EXISTS (SELECT 1 FROM app_settings s WHERE s.key = 'diagnostics.visible_to_admin')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM app_settings WHERE key = 'diagnostics.visible_to_admin'`);
  }
}
