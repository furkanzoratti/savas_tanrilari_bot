import { RELIGIONS } from "../domain/religions.js";

const religionKeys = Object.keys(RELIGIONS).map((key)=>`'${key}'`).join(",");

export const religionsMigration = {
  version: 101,
  name: "settlement_religions_and_initial_assignments",
  sql: `
    ALTER TABLE settlements ADD COLUMN IF NOT EXISTS religion_key TEXT;
    ALTER TABLE settlements ADD COLUMN IF NOT EXISTS religion_adherence_percent NUMERIC(5,2);

    UPDATE settlements SET religion_key=CASE
      WHEN lower(name) IN ('pantikapaion','phanagoria','tanais') THEN 'BOSPORAN_SYNCRETISM'
      WHEN lower(name) IN ('kudüs','kudus') THEN 'JUDAISM'
      WHEN lower(name) IN ('ibossim','kart hadaşt','kart hadast','gadira') THEN 'PUNIC_FAITH'
      WHEN lower(name) IN ('roma','ariminum','brundisium','cosentia','neapolis','patavium','velathri') THEN 'ROMAN_FAITH'
      WHEN lower(name) IN ('eudaemon','gerrha','marib','maskat') THEN 'SOUTH_ARABIAN_FAITH'
      WHEN lower(name) IN ('rajagriha','champa','anga') THEN 'JAINISM'
      WHEN lower(name) IN ('puskalavati','sagala','taxila','sravasti','vaisali','tamralipti','tosali','anuradhapura') THEN 'BUDDHISM'
      WHEN culture_group IN ('BRITTONIC','CELTIC') THEN 'CELTIC_FAITH'
      WHEN culture_group='GERMANIC' THEN 'GERMANIC_FAITH'
      WHEN culture_group='BALTIC' THEN 'BALTIC_FAITH'
      WHEN culture_group='IBERIAN' THEN 'IBERIAN_FAITH'
      WHEN culture_group='ITALIC' THEN 'ITALIC_FAITH'
      WHEN culture_group IN ('ILLYRO_PANNONIAN','THRACIAN') THEN 'THRACO_ILLYRIAN_FAITH'
      WHEN culture_group='DACO_GETIC' THEN 'ZALMOXIAN_FAITH'
      WHEN culture_group IN ('SARMATIAN','SCYTHIAN') THEN 'SCYTHO_SARMATIAN_FAITH'
      WHEN culture_group='HELLENIC' THEN 'HELLENIC_FAITH'
      WHEN culture_group='PUNIC' THEN 'PUNIC_FAITH'
      WHEN culture_group IN ('BERBER','LIBYAN') THEN 'LIBYAN_BERBER_FAITH'
      WHEN culture_group='ANATOLIAN' THEN 'ANATOLIAN_FAITHS'
      WHEN culture_group='ARMENIAN' THEN 'ARMENIAN_FAITH'
      WHEN culture_group='CAUCASIAN' THEN 'CAUCASIAN_FAITH'
      WHEN culture_group='LEVANTINE' THEN 'PHOENICIAN_CANAANITE_FAITH'
      WHEN culture_group='MESOPOTAMIAN' THEN 'MESOPOTAMIAN_FAITH'
      WHEN culture_group='EGYPTIAN' THEN 'EGYPTIAN_FAITH'
      WHEN culture_group IN ('KUSHITIC','HABESHA') THEN 'KUSH_NUBIAN_FAITH'
      WHEN culture_group='ARABIAN' THEN 'NABATAEAN_FAITH'
      WHEN culture_group='WEST_IRANIAN' THEN 'ZOROASTRIANISM'
      WHEN culture_group='EAST_IRANIAN' THEN 'HELLENO_IRANIAN_SYNCRETISM'
      WHEN culture_group='GANDHARAN' THEN 'BUDDHISM'
      WHEN culture_group='MADHYADESHI' THEN 'BRAHMANISM'
      WHEN culture_group='MAGADHAN' THEN 'BUDDHISM'
      WHEN culture_group='KALINGAN' THEN 'BUDDHISM'
      WHEN culture_group IN ('MAHARASHTRI','ANDHRA') THEN 'BRAHMANISM'
      WHEN culture_group='TAMIL' THEN 'DRAVIDIAN_FAITHS'
      WHEN culture_group='SOUTHEAST_ASIAN' THEN 'BUDDHISM'
      ELSE 'HELLENIC_FAITH'
    END WHERE religion_key IS NULL;

    UPDATE settlements SET religion_adherence_percent=75 WHERE religion_adherence_percent IS NULL;
    ALTER TABLE settlements ALTER COLUMN religion_key SET NOT NULL;
    ALTER TABLE settlements ALTER COLUMN religion_adherence_percent SET DEFAULT 75;
    ALTER TABLE settlements ALTER COLUMN religion_adherence_percent SET NOT NULL;
    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_religion_key_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_religion_key_check CHECK (religion_key IN (${religionKeys}));
    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_religion_adherence_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_religion_adherence_check CHECK (religion_adherence_percent BETWEEN 0 AND 100);
    CREATE INDEX IF NOT EXISTS settlements_country_religion_idx ON settlements(country_id,religion_key);
  `
} as const;
