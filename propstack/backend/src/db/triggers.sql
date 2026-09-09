-- ============================================================
-- TRIGGER: auto-mark payments overdue + apply late fee
--
-- WHAT IT DOES (plain English):
--   Every time a payment row is inserted or updated, this trigger checks:
--   "is today past the due_date, and is the payment still unpaid?"
--   If yes, it flips status to 'overdue' and applies a flat late fee
--   (5% of the amount, only once — it won't keep re-applying).
--
-- WHY A TRIGGER (vs a scheduled cron job):
--   A trigger guarantees the rule is enforced at the DATA layer,
--   regardless of which application, script, or admin tool touches
--   the table. A cron job only catches rows at whatever interval it
--   runs. For a portfolio project, the trigger is also easier to
--   demo live: insert/update a row and immediately observe the effect.
--   (Real-world systems often use BOTH: a trigger for immediate
--   consistency and a nightly job as a safety net.)
--
-- LIKELY INTERVIEW QUESTIONS ON THIS PIECE:
--   1. "Why a trigger instead of application-level logic in Node?"
--      -> Because app-level logic can be bypassed (direct DB access,
--         another service, a manual UPDATE) — trigger = single source
--         of truth enforced by the DB itself.
--   2. "What's the difference between BEFORE and AFTER triggers here,
--       and why did you pick BEFORE?"
--      -> BEFORE lets us modify NEW.* before the row is written,
--         avoiding a second UPDATE statement (which AFTER would need).
--   3. "What happens if this trigger fires on every UPDATE, including
--       ones that just mark a payment as paid — could you get a race
--       condition or double fee?"
--      -> Guarded by "AND NEW.late_fee_applied = 0" so a fee is only
--         ever applied once per row, no matter how many times it's updated.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_late_fee()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.paid_date IS NULL
       AND NEW.due_date < CURRENT_DATE
       AND NEW.late_fee_applied = 0 THEN

        NEW.status := 'overdue';
        NEW.late_fee_applied := ROUND(NEW.amount * 0.05, 2);  -- 5% flat late fee
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_late_fee ON payments;

CREATE TRIGGER trg_apply_late_fee
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION apply_late_fee();

-- ============================================================
-- TRIGGER: auto-flip unit status to occupied/vacant based on lease status
--
-- WHAT IT DOES: when a lease becomes 'active', mark its unit 'occupied'.
-- When a lease becomes 'ended' or 'terminated', mark the unit 'vacant'
-- (only if no OTHER active lease exists on that unit).
-- ============================================================

CREATE OR REPLACE FUNCTION sync_unit_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE units SET status = 'occupied' WHERE id = NEW.unit_id;
    ELSIF NEW.status IN ('ended', 'terminated') THEN
        IF NOT EXISTS (
            SELECT 1 FROM leases
            WHERE unit_id = NEW.unit_id AND status = 'active' AND id <> NEW.id
        ) THEN
            UPDATE units SET status = 'vacant' WHERE id = NEW.unit_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_unit_status ON leases;

CREATE TRIGGER trg_sync_unit_status
    AFTER INSERT OR UPDATE ON leases
    FOR EACH ROW
    EXECUTE FUNCTION sync_unit_status();
