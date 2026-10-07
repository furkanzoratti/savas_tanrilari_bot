export const rebelBattleIntegrationMigration={
  version:145,
  name:"rebel_battle_integration_and_leaders",
  sql:`
    ALTER TABLE countries
      ADD COLUMN IF NOT EXISTS is_system_faction BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE rebel_factions
      ADD COLUMN IF NOT EXISTS army_name TEXT,
      ADD COLUMN IF NOT EXISTS leader_name TEXT,
      ADD COLUMN IF NOT EXISTS leader_skill_bonus SMALLINT;

    UPDATE rebel_factions faction
       SET army_name=COALESCE(faction.army_name,faction.display_name||' Ordusu'),
           leader_name=COALESCE(faction.leader_name,CASE settlement.culture_group
             WHEN 'HELLENIC' THEN 'Damon Kallistratos'
             WHEN 'PUNIC' THEN 'Hanno Giskonid'
             WHEN 'ITALIC' THEN 'Marcus Varro'
             WHEN 'EGYPTIAN' THEN 'Pamenes Hori'
             WHEN 'WEST_IRANIAN' THEN 'Artaban Surena'
             WHEN 'EAST_IRANIAN' THEN 'Spitamenes Baktriyalı'
             WHEN 'CELTIC' THEN 'Brennos Arvern'
             WHEN 'BRITTONIC' THEN 'Caratacos ap Brigantos'
             WHEN 'GERMANIC' THEN 'Arminius Cherusk'
             WHEN 'THRACIAN' THEN 'Seuthes Odrys'
             WHEN 'ARMENIAN' THEN 'Vardan Mamikon'
             WHEN 'SARMATIAN' THEN 'Amage Roxolan'
             WHEN 'SCYTHIAN' THEN 'Ateas Saka'
             WHEN 'ARABIAN' THEN 'Malik el-Kindi'
             WHEN 'LEVANTINE' THEN 'Mattanos Surî'
             WHEN 'MESOPOTAMIAN' THEN 'Nabû-bel Uruklu'
             WHEN 'ANATOLIAN' THEN 'Ariarathes Kappadok'
             ELSE 'Ariston Halk Önderi' END),
           leader_skill_bonus=COALESCE(faction.leader_skill_bonus,(1+MOD(hashtext(faction.id::text)::bigint+2147483648,3))::smallint)
      FROM settlements settlement
     WHERE settlement.id=faction.settlement_id;

    ALTER TABLE rebel_factions ALTER COLUMN army_name SET NOT NULL;
    ALTER TABLE rebel_factions ALTER COLUMN leader_name SET NOT NULL;
    ALTER TABLE rebel_factions ALTER COLUMN leader_skill_bonus SET NOT NULL;
    ALTER TABLE rebel_factions ALTER COLUMN leader_skill_bonus SET DEFAULT 1;
    ALTER TABLE rebel_factions DROP CONSTRAINT IF EXISTS rebel_factions_leader_skill_bonus_check;
    ALTER TABLE rebel_factions ADD CONSTRAINT rebel_factions_leader_skill_bonus_check
      CHECK (leader_skill_bonus BETWEEN 1 AND 3);

    ALTER TABLE battle_sides
      ADD COLUMN IF NOT EXISTS rebel_faction_id UUID REFERENCES rebel_factions(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS battle_sides_rebel_faction_idx
      ON battle_sides(rebel_faction_id) WHERE rebel_faction_id IS NOT NULL;
  `
} as const;
