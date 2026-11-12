-- Manual PostgreSQL helper migration: add checklist_items support to
-- lead_qualification_criteria.
--
-- The application uses TypeORM migrations (`*.ts`) for normal deployment.
-- This SQL file is retained as an idempotent manual helper only. Keep it
-- PostgreSQL-safe so it cannot be accidentally run against the production
-- database with MySQL syntax.

CREATE TABLE IF NOT EXISTS lead_qualification_criteria (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,

  -- BANT - Budget fields
  budget_amount numeric(15, 2),
  budget_currency varchar(20),
  budget_notes text,
  budget_confirmed boolean DEFAULT false,

  -- BANT - Authority fields
  decision_maker_name varchar(255),
  decision_maker_title varchar(255),
  authority_notes text,
  authority_confirmed boolean DEFAULT false,

  -- BANT - Need fields
  pain_points text,
  desired_outcomes text,
  needs_notes text,
  needs_confirmed boolean DEFAULT false,

  -- BANT - Timeline fields
  target_decision_date date,
  target_implementation_date date,
  timeline_notes text,
  timeline_confirmed boolean DEFAULT false,

  -- Flexible checklist system
  checklist_items jsonb,

  -- Overall qualification
  is_qualified boolean DEFAULT false,
  qualification_score integer,
  qualified_by uuid,
  qualified_at timestamptz,

  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_lead_qualification_criteria_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_qualification_criteria_user
    FOREIGN KEY (qualified_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_qualification_criteria_lead_id
  ON lead_qualification_criteria (lead_id);

ALTER TABLE lead_qualification_criteria
  ADD COLUMN IF NOT EXISTS checklist_items jsonb;

ALTER TABLE lead_qualification_criteria
  ADD COLUMN IF NOT EXISTS checklist_category_index varchar(100)
  GENERATED ALWAYS AS (checklist_items -> 0 ->> 'category') STORED;

CREATE INDEX IF NOT EXISTS idx_checklist_items_category
  ON lead_qualification_criteria (checklist_category_index);

-- Keep updated_at current for manual SQL usage.
CREATE OR REPLACE FUNCTION set_lead_qualification_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_qualification_updated_at
  ON lead_qualification_criteria;

CREATE TRIGGER trg_lead_qualification_updated_at
BEFORE UPDATE ON lead_qualification_criteria
FOR EACH ROW
EXECUTE FUNCTION set_lead_qualification_updated_at();

-- ROLLBACK NOTES:
-- DROP TRIGGER IF EXISTS trg_lead_qualification_updated_at ON lead_qualification_criteria;
-- DROP FUNCTION IF EXISTS set_lead_qualification_updated_at();
-- DROP INDEX IF EXISTS idx_checklist_items_category;
-- ALTER TABLE lead_qualification_criteria DROP COLUMN IF EXISTS checklist_category_index;
-- ALTER TABLE lead_qualification_criteria DROP COLUMN IF EXISTS checklist_items;
