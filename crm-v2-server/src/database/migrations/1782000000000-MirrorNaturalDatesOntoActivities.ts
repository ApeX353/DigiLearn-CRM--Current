import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A plan's date must live on the activity row itself.
 *
 * Everything that decides "does this record have a next step" — the
 * next-step compliance gate, the Already-planned picker, the Planned /
 * Next-step slot, the no-next-step dashboards — reads activities.due_at
 * / scheduled_at. But two creation paths stored the date only in the
 * type-specific sub-row:
 *
 *   - the Log Activity modal's meeting tab sends the date as
 *     meetings.start_time and nothing else (its due_at field is
 *     commented out), so a genuinely booked meeting read as "undated";
 *   - API callers could plan a call/WhatsApp with only
 *     calls.follow_up_date / whatsapp_messages.follow_up_date.
 *
 * Those rows passed the create-time date rule (resolveNextActionDate
 * reads the sub-row) yet failed every dated predicate afterwards: the
 * gate refused them as a future, "Already planned" rejected them as
 * dateless, and the Planned slot showed nothing while the meeting
 * existed. The service now mirrors the natural date onto the row at
 * create time; this backfills the rows that predate that fix.
 *
 * Step 3 is a guard for migration 1772: if any call/WhatsApp that 1772
 * flipped to completed turns out to carry a FUTURE follow_up_date in its
 * sub-row (a plan, not a log — none exist in the data this was tested
 * on, but production may differ), it is reopened as scheduled with that
 * date on the row. Fingerprint-scoped so genuine logged interactions
 * stay completed.
 *
 * Idempotent: every UPDATE's predicate matches nothing once applied.
 */
export class MirrorNaturalDatesOntoActivities1782000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Booked meetings whose only date is meetings.start_time.
    await queryRunner.query(`
      UPDATE activities a
         SET scheduled_at = m.start_time,
             updated_at   = NOW()
        FROM meetings m
       WHERE m.activity_id = a.id
         AND a.type = 'meeting'
         AND a.status NOT IN ('completed', 'cancelled')
         AND a.due_at IS NULL
         AND a.scheduled_at IS NULL
         AND m.start_time IS NOT NULL
    `);

    // 2. Planned calls / WhatsApps whose only date is the sub-row
    //    follow_up_date. Demo bookings likewise (planned_at).
    await queryRunner.query(`
      UPDATE activities a
         SET due_at     = c.follow_up_date,
             updated_at = NOW()
        FROM calls c
       WHERE c.activity_id = a.id
         AND a.type = 'call'
         AND a.status NOT IN ('completed', 'cancelled')
         AND a.due_at IS NULL
         AND a.scheduled_at IS NULL
         AND c.follow_up_date IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE activities a
         SET due_at     = w.follow_up_date,
             updated_at = NOW()
        FROM whatsapp_messages w
       WHERE w.activity_id = a.id
         AND a.type = 'whatsapp'
         AND a.status NOT IN ('completed', 'cancelled')
         AND a.due_at IS NULL
         AND a.scheduled_at IS NULL
         AND w.follow_up_date IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE activities a
         SET scheduled_at = d.planned_at,
             updated_at   = NOW()
        FROM demos d
       WHERE d.activity_id = a.id
         AND a.type = 'demo_booking'
         AND a.status NOT IN ('completed', 'cancelled')
         AND a.due_at IS NULL
         AND a.scheduled_at IS NULL
         AND d.planned_at IS NOT NULL
    `);

    // 3. Repair guard for 1772: a flipped call/WhatsApp whose sub-row
    //    carries a follow_up_date AFTER the moment it was logged was a
    //    plan, not a record — reopen it with its date on the row.
    await queryRunner.query(`
      UPDATE activities a
         SET status       = 'scheduled',
             completed_at = NULL,
             due_at       = x.follow_up_date,
             updated_at   = NOW()
        FROM (
              SELECT c.activity_id, c.follow_up_date FROM calls c
              UNION ALL
              SELECT w.activity_id, w.follow_up_date FROM whatsapp_messages w
             ) x
       WHERE x.activity_id = a.id
         AND a.type IN ('call', 'whatsapp')
         AND a.status = 'completed'
         AND a.completed_at = a.created_at
         AND a.completion_outcome IS NULL
         AND a.completion_note IS NULL
         AND a.due_at IS NULL
         AND a.scheduled_at IS NULL
         AND x.follow_up_date IS NOT NULL
         AND x.follow_up_date > a.created_at
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best effort: null out only the mirrors this migration could have
    // written (row date equals the sub-row date it was copied from).
    await queryRunner.query(`
      UPDATE activities a
         SET scheduled_at = NULL, updated_at = NOW()
        FROM meetings m
       WHERE m.activity_id = a.id
         AND a.type = 'meeting'
         AND a.scheduled_at = m.start_time
         AND a.due_at IS NULL
    `);
    await queryRunner.query(`
      UPDATE activities a
         SET due_at = NULL, updated_at = NOW()
        FROM calls c
       WHERE c.activity_id = a.id
         AND a.type = 'call'
         AND a.due_at = c.follow_up_date
         AND a.scheduled_at IS NULL
    `);
    await queryRunner.query(`
      UPDATE activities a
         SET due_at = NULL, updated_at = NOW()
        FROM whatsapp_messages w
       WHERE w.activity_id = a.id
         AND a.type = 'whatsapp'
         AND a.due_at = w.follow_up_date
         AND a.scheduled_at IS NULL
    `);
    await queryRunner.query(`
      UPDATE activities a
         SET scheduled_at = NULL, updated_at = NOW()
        FROM demos d
       WHERE d.activity_id = a.id
         AND a.type = 'demo_booking'
         AND a.scheduled_at = d.planned_at
         AND a.due_at IS NULL
    `);
    // Step 3's reopen is not reversed: those rows are plans either way.
  }
}
