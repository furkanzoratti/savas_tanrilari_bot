import { RELIGIONS } from "../domain/religions.js";

const religionKeys = Object.keys(RELIGIONS).map((key) => `'${key}'`).join(",");

export const religionDistributionMigration = {
  version: 104,
  name: "settlement_religion_percentage_distribution",
  sql: `
    CREATE TABLE IF NOT EXISTS settlement_religion_shares (
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      religion_key TEXT NOT NULL CHECK (religion_key IN (${religionKeys})),
      primary_percent NUMERIC(5,2) NOT NULL CHECK (primary_percent BETWEEN 0 AND 100),
      secondary_percent NUMERIC(5,2) NOT NULL CHECK (secondary_percent BETWEEN 0 AND 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (settlement_id,religion_key),
      CHECK (primary_percent + secondary_percent > 0),
      CHECK (primary_percent + secondary_percent <= 100)
    );

    INSERT INTO settlement_religion_shares(settlement_id,religion_key,primary_percent,secondary_percent)
    SELECT id,religion_key,religion_adherence_percent,100-religion_adherence_percent
      FROM settlements
    ON CONFLICT(settlement_id,religion_key) DO NOTHING;

    CREATE INDEX IF NOT EXISTS settlement_religion_shares_religion_idx
      ON settlement_religion_shares(religion_key,settlement_id);

    CREATE OR REPLACE FUNCTION validate_and_sync_settlement_religion_shares()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      target_settlement UUID;
      share_total NUMERIC(7,2);
      leading_religion TEXT;
      leading_primary NUMERIC(5,2);
    BEGIN
      IF TG_OP='DELETE' THEN
        target_settlement := OLD.settlement_id;
      ELSE
        target_settlement := NEW.settlement_id;
      END IF;

      IF NOT EXISTS(SELECT 1 FROM settlements WHERE id=target_settlement) THEN
        RETURN NULL;
      END IF;

      SELECT COALESCE(SUM(primary_percent+secondary_percent),0)
        INTO share_total
        FROM settlement_religion_shares
       WHERE settlement_id=target_settlement;

      IF share_total <> 100 THEN
        RAISE EXCEPTION 'Yerleşke din dağılımı toplamı 100 olmalıdır; mevcut toplam: %',share_total;
      END IF;

      SELECT shares.religion_key,shares.primary_percent
        INTO leading_religion,leading_primary
        FROM settlement_religion_shares shares
        JOIN settlements settlement ON settlement.id=shares.settlement_id
       WHERE shares.settlement_id=target_settlement
       ORDER BY (shares.primary_percent+shares.secondary_percent) DESC,
                (shares.religion_key=settlement.religion_key) DESC,
                shares.religion_key
       LIMIT 1;

      UPDATE settlements
         SET religion_key=leading_religion,
             religion_adherence_percent=leading_primary
       WHERE id=target_settlement;
      RETURN NULL;
    END
    $$;

    DROP TRIGGER IF EXISTS settlement_religion_shares_validate_sync ON settlement_religion_shares;
    CREATE CONSTRAINT TRIGGER settlement_religion_shares_validate_sync
      AFTER INSERT OR UPDATE OR DELETE ON settlement_religion_shares
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_and_sync_settlement_religion_shares();

    CREATE OR REPLACE FUNCTION initialize_settlement_religion_shares()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO settlement_religion_shares(
        settlement_id,religion_key,primary_percent,secondary_percent
      ) VALUES (
        NEW.id,NEW.religion_key,NEW.religion_adherence_percent,100-NEW.religion_adherence_percent
      ) ON CONFLICT(settlement_id,religion_key) DO NOTHING;
      RETURN NEW;
    END
    $$;

    DROP TRIGGER IF EXISTS settlements_religion_shares_initialize ON settlements;
    CREATE TRIGGER settlements_religion_shares_initialize
      AFTER INSERT ON settlements
      FOR EACH ROW EXECUTE FUNCTION initialize_settlement_religion_shares();
  `
} as const;
