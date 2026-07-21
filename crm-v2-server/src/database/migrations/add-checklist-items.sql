-- Migration: Add checklist_items column to lead_qualification_criteria
-- Database: MySQL 8.0+
-- Date: 2026-01-27

-- ============================================
-- OPTION 1: If table doesn't exist, create it
-- ============================================

CREATE TABLE IF NOT EXISTS `lead_qualification_criteria` (
  `id` VARCHAR(36) PRIMARY KEY,
  `lead_id` VARCHAR(36) NOT NULL,

  -- BANT - Budget fields
  `budget_amount` DECIMAL(15, 2) NULL,
  `budget_currency` VARCHAR(20) NULL,
  `budget_notes` TEXT NULL,
  `budget_confirmed` TINYINT(1) DEFAULT 0,

  -- BANT - Authority fields
  `decision_maker_name` VARCHAR(255) NULL,
  `decision_maker_title` VARCHAR(255) NULL,
  `authority_notes` TEXT NULL,
  `authority_confirmed` TINYINT(1) DEFAULT 0,

  -- BANT - Need fields
  `pain_points` TEXT NULL,
  `desired_outcomes` TEXT NULL,
  `needs_notes` TEXT NULL,
  `needs_confirmed` TINYINT(1) DEFAULT 0,

  -- BANT - Timeline fields
  `target_decision_date` DATE NULL,
  `target_implementation_date` DATE NULL,
  `timeline_notes` TEXT NULL,
  `timeline_confirmed` TINYINT(1) DEFAULT 0,

  -- Flexible checklist system
  `checklist_items` JSON NULL COMMENT 'Flexible checklist for tracking qualification steps',

  -- Overall qualification
  `is_qualified` TINYINT(1) DEFAULT 0,
  `qualification_score` INT NULL,
  `qualified_by` VARCHAR(36) NULL,
  `qualified_at` DATETIME NULL,

  -- Timestamps
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign keys
  CONSTRAINT `FK_lead_qualification_criteria_lead`
    FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_lead_qualification_criteria_user`
    FOREIGN KEY (`qualified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,

  -- Indexes
  INDEX `IDX_lead_qualification_criteria_lead_id` (`lead_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- OPTION 2: If table exists, just add the column
-- ============================================

-- Check if column exists before adding
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lead_qualification_criteria'
  AND COLUMN_NAME = 'checklist_items'
);

-- Add column if it doesn't exist
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE `lead_qualification_criteria`
   ADD COLUMN `checklist_items` JSON NULL COMMENT ''Flexible checklist for tracking qualification steps''',
  'SELECT ''Column checklist_items already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- Add virtual column and index for efficient JSON querying
-- ============================================

-- This creates a virtual column that extracts the first checklist item's category
-- and indexes it for efficient filtering by category
ALTER TABLE `lead_qualification_criteria`
ADD COLUMN IF NOT EXISTS `checklist_category_index` VARCHAR(100)
  GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(checklist_items, '$[0].category'))) VIRTUAL,
ADD INDEX IF NOT EXISTS `IDX_checklist_items_category` (`checklist_category_index`);

-- ============================================
-- ROLLBACK (if needed)
-- ============================================

/*
-- To rollback, uncomment and run:

-- Drop the virtual column and index
ALTER TABLE `lead_qualification_criteria`
  DROP INDEX IF EXISTS `IDX_checklist_items_category`,
  DROP COLUMN IF EXISTS `checklist_category_index`;

-- Drop the checklist_items column
ALTER TABLE `lead_qualification_criteria`
  DROP COLUMN IF EXISTS `checklist_items`;

-- To completely drop the table (WARNING: This will delete all data)
-- DROP TABLE IF EXISTS `lead_qualification_criteria`;
*/
