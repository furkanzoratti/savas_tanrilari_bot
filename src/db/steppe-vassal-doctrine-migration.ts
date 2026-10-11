export const STEPPE_DOCTRINE_COUNTRIES=[
  "Xiongnu Konfederasyonu",
  "Dingling Konfederasyonu",
  "Xianbei Konfederasyonu",
  "Baykal Devleti",
  "Sayan Devleti",
  "Hangay Devleti",
  "Khentii Devleti",
  "Onon Devleti",
  "Hulun Devleti",
  "Khingan Devleti"
] as const;

const countryNames=STEPPE_DOCTRINE_COUNTRIES
  .map((name)=>`lower('${name.replaceAll("'","''")}')`)
  .join(",");

export const steppeVassalDoctrineMigration={
  version:184,
  name:"enable_steppe_doctrine_for_planned_vassal_states",
  sql:`
    UPDATE countries
       SET is_steppe_state=(lower(name) IN (${countryNames}));

    DELETE FROM country_special_unit_unlocks unlock
     USING countries country
     WHERE country.id=unlock.country_id
       AND unlock.unit_type IN ('horse_archer','steppe_cavalry','kurgan_shieldbearer','oba_archer')
       AND country.is_steppe_state=FALSE;

    INSERT INTO country_special_unit_unlocks(country_id,unit_type,granted_by)
    SELECT country.id,unit.unit_type,'SYSTEM:STEPPE_VASSAL_DOCTRINE_V184'
      FROM countries country
      CROSS JOIN (VALUES
        ('horse_archer'),('steppe_cavalry'),('kurgan_shieldbearer'),('oba_archer')
      ) AS unit(unit_type)
     WHERE country.status='ACTIVE' AND country.is_steppe_state=TRUE
    ON CONFLICT(country_id,unit_type) DO NOTHING;
  `
} as const;
