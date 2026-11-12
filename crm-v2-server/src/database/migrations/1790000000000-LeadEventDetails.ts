import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeadEventDetails1790000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE leads
      ADD COLUMN event_category varchar(40),
      ADD COLUMN custom_event_name varchar(200),
      ADD CONSTRAINT leads_event_details_check CHECK (CASE
        WHEN event_category IS NULL THEN custom_event_name IS NULL
        WHEN event_category IN ('SPEECH_PRIZE_GIVING','PASAF','NAPH','NASH','MERIT_AWARDS') THEN custom_event_name IS NULL
        WHEN event_category = 'CUSTOM' THEN custom_event_name IS NOT NULL AND length(btrim(custom_event_name)) > 0
        ELSE false END)`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    const [row] = await queryRunner.query('SELECT count(*)::int AS count FROM leads WHERE event_category IS NOT NULL OR custom_event_name IS NOT NULL');
    if (row.count > 0) throw new Error('Export and explicitly clear lead event details before dropping these columns');
    await queryRunner.query('ALTER TABLE leads DROP CONSTRAINT leads_event_details_check, DROP COLUMN custom_event_name, DROP COLUMN event_category');
  }
}
