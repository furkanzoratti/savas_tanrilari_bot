export const namedRebelFactionsMigration={
  version:141,
  name:"contextual_rebel_faction_names",
  sql:`
    ALTER TABLE rebel_factions ADD COLUMN IF NOT EXISTS display_name TEXT;

    UPDATE rebel_factions faction
       SET display_name=CASE faction.faction_type
         WHEN 'SEPARATIST' THEN COALESCE(
           (SELECT restoration.name || ' Gönüllüleri' FROM countries restoration WHERE restoration.id=faction.restoration_country_id),
           settlement.name || ' Özgürlük Birliği'
         )
         WHEN 'RELIGIOUS' THEN settlement.name || ' İnanç Muhafızları'
         WHEN 'SLAVE' THEN settlement.name || ' Zincirkıranları'
         ELSE settlement.name || ' Halk Birliği'
       END
      FROM settlements settlement
     WHERE settlement.id=faction.settlement_id AND faction.display_name IS NULL;

    ALTER TABLE rebel_factions ALTER COLUMN display_name SET NOT NULL;
  `
} as const;
