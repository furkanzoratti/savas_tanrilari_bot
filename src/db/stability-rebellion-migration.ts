export const stabilityRebellionMigration = {
  version: 140,
  name: "settlement_prosperity_and_rebellion_system",
  sql: `
    ALTER TABLE guilds
      ADD COLUMN IF NOT EXISTS stability_system_enabled BOOLEAN NOT NULL DEFAULT TRUE;

    ALTER TABLE countries
      ADD COLUMN IF NOT EXISTS war_exhaustion SMALLINT NOT NULL DEFAULT 0
        CHECK (war_exhaustion BETWEEN 0 AND 100),
      ADD COLUMN IF NOT EXISTS stability_observed_battle_losses BIGINT NOT NULL DEFAULT 0
        CHECK (stability_observed_battle_losses >= 0);

    -- Geçmiş savaş kayıpları yeni sistem açıldığı anda yeniden ceza üretmesin;
    -- yalnızca bundan sonraki farklar savaş yorgunluğuna yazılır.
    UPDATE countries country
       SET stability_observed_battle_losses=COALESCE((
         SELECT SUM(side.total_losses)::bigint
           FROM battle_sides side JOIN battles battle ON battle.id=side.battle_id
          WHERE side.country_id=country.id AND battle.status='FINISHED'
       ),0);

    ALTER TABLE settlements
      ADD COLUMN IF NOT EXISTS prosperity SMALLINT NOT NULL DEFAULT 50
        CHECK (prosperity BETWEEN 0 AND 100),
      ADD COLUMN IF NOT EXISTS rebellion_progress SMALLINT NOT NULL DEFAULT 0
        CHECK (rebellion_progress BETWEEN 0 AND 100),
      ADD COLUMN IF NOT EXISTS recent_uprising_until_turn INTEGER,
      ADD COLUMN IF NOT EXISTS rebellion_faction_type TEXT
        CHECK (rebellion_faction_type IS NULL OR rebellion_faction_type IN ('POPULAR','SEPARATIST','RELIGIOUS','SLAVE'));

    UPDATE settlements
       SET prosperity=CASE
         WHEN rebellion_active OR is_conquered OR ruin_stage>=2 THEN 0
         WHEN ruin_stage=1 THEN LEAST(prosperity,20)
         ELSE prosperity
       END,
       rebellion_progress=CASE
         WHEN rebellion_active THEN 100
         WHEN unrest_active THEN GREATEST(rebellion_progress,40)
         ELSE rebellion_progress
       END;

    CREATE TABLE IF NOT EXISTS settlement_ownership_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      previous_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      new_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      acquired_turn INTEGER NOT NULL CHECK (acquired_turn>=0),
      change_type TEXT NOT NULL CHECK (change_type IN (
        'LEGACY_INITIAL','CONQUEST','PEACE_TRANSFER','VOLUNTARY_TRANSFER','VASSAL_INTEGRATION','REBELLION','ADMIN'
      )),
      source_audit_id UUID REFERENCES audit_logs(id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(settlement_id,acquired_turn,new_country_id,change_type)
    );
    CREATE INDEX IF NOT EXISTS settlement_ownership_history_lookup_idx
      ON settlement_ownership_history(settlement_id,acquired_turn DESC,created_at DESC);
    CREATE INDEX IF NOT EXISTS settlement_ownership_history_country_idx
      ON settlement_ownership_history(new_country_id,settlement_id,acquired_turn DESC);

    INSERT INTO settlement_ownership_history(
      guild_id,settlement_id,previous_country_id,new_country_id,acquired_turn,change_type,source_audit_id,details
    )
    SELECT log.guild_id,settlement.id,source.id,target.id,
           GREATEST(0,COALESCE((log.details->>'conqueredTurn')::integer,0)),
           'CONQUEST',log.id,log.details
      FROM audit_logs log
      JOIN settlements settlement ON settlement.id::text=log.entity_id
      JOIN countries source ON source.id::text=log.details->>'fromCountryId'
      JOIN countries target ON target.id::text=log.details->>'toCountryId'
     WHERE log.action='SETTLEMENT_TRANSFER'
    ON CONFLICT DO NOTHING;

    INSERT INTO settlement_ownership_history(
      guild_id,settlement_id,previous_country_id,new_country_id,acquired_turn,change_type,details
    )
    SELECT country.guild_id,settlement.id,NULL,settlement.country_id,0,'LEGACY_INITIAL',
           jsonb_build_object('source','migration-current-owner')
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id
     WHERE NOT EXISTS (
       SELECT 1 FROM settlement_ownership_history history WHERE history.settlement_id=settlement.id
     )
    ON CONFLICT DO NOTHING;

    INSERT INTO settlement_ownership_history(
      guild_id,settlement_id,previous_country_id,new_country_id,acquired_turn,change_type,details
    )
    SELECT DISTINCT ON (history.settlement_id)
           history.guild_id,history.settlement_id,NULL,history.previous_country_id,0,'LEGACY_INITIAL',
           jsonb_build_object('source','migration-earliest-transfer')
      FROM settlement_ownership_history history
     WHERE history.change_type='CONQUEST' AND history.previous_country_id IS NOT NULL
     ORDER BY history.settlement_id,history.acquired_turn,history.created_at
    ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS rebel_factions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      against_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      faction_type TEXT NOT NULL CHECK (faction_type IN ('POPULAR','SEPARATIST','RELIGIOUS','SLAVE')),
      restoration_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      target_religion_key TEXT,
      target_culture_group TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ORGANIZING','ACTIVE','OCCUPYING','SUPPRESSED','ENFORCED')),
      started_turn INTEGER NOT NULL CHECK (started_turn>=0),
      outbreak_turn INTEGER CHECK (outbreak_turn IS NULL OR outbreak_turn>=started_turn),
      occupied_turn INTEGER CHECK (occupied_turn IS NULL OR occupied_turn>=COALESCE(outbreak_turn,started_turn)),
      demands_turn INTEGER CHECK (demands_turn IS NULL OR demands_turn>=COALESCE(occupied_turn,outbreak_turn,started_turn)),
      personnel INTEGER NOT NULL DEFAULT 0 CHECK (personnel>=0),
      military_power BIGINT NOT NULL DEFAULT 0 CHECK (military_power>=0),
      composition JSONB NOT NULL DEFAULT '{}'::jsonb,
      cause_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS rebel_factions_one_live_settlement_idx
      ON rebel_factions(settlement_id) WHERE status IN ('ORGANIZING','ACTIVE','OCCUPYING');
    CREATE INDEX IF NOT EXISTS rebel_factions_guild_status_idx
      ON rebel_factions(guild_id,status,started_turn);

    CREATE TABLE IF NOT EXISTS settlement_stability_turns (
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn>=0),
      prosperity_before SMALLINT NOT NULL CHECK (prosperity_before BETWEEN 0 AND 100),
      prosperity_after SMALLINT NOT NULL CHECK (prosperity_after BETWEEN 0 AND 100),
      unrest_risk SMALLINT NOT NULL CHECK (unrest_risk BETWEEN 0 AND 75),
      rebellion_before SMALLINT NOT NULL CHECK (rebellion_before BETWEEN 0 AND 100),
      rebellion_after SMALLINT NOT NULL CHECK (rebellion_after BETWEEN 0 AND 100),
      rebellion_roll SMALLINT CHECK (rebellion_roll IS NULL OR rebellion_roll BETWEEN 1 AND 100),
      faction_type TEXT CHECK (faction_type IS NULL OR faction_type IN ('POPULAR','SEPARATIST','RELIGIOUS','SLAVE')),
      factors JSONB NOT NULL DEFAULT '[]'::jsonb,
      outcome TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(settlement_id,game_turn)
    );
    CREATE INDEX IF NOT EXISTS settlement_stability_turns_recent_idx
      ON settlement_stability_turns(game_turn DESC,settlement_id);

    CREATE TABLE IF NOT EXISTS country_war_exhaustion_turns (
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn>=0),
      exhaustion_before SMALLINT NOT NULL CHECK (exhaustion_before BETWEEN 0 AND 100),
      exhaustion_after SMALLINT NOT NULL CHECK (exhaustion_after BETWEEN 0 AND 100),
      active_wars INTEGER NOT NULL DEFAULT 0 CHECK (active_wars>=0),
      new_battle_losses BIGINT NOT NULL DEFAULT 0 CHECK (new_battle_losses>=0),
      raids_suffered INTEGER NOT NULL DEFAULT 0 CHECK (raids_suffered>=0),
      settlements_lost INTEGER NOT NULL DEFAULT 0 CHECK (settlements_lost>=0),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(country_id,game_turn)
    );

    ALTER TABLE battles ADD COLUMN IF NOT EXISTS state_war_id UUID REFERENCES state_wars(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS battles_state_war_idx ON battles(state_war_id,status);
    ALTER TABLE naval_raids ADD COLUMN IF NOT EXISTS war_id UUID REFERENCES state_wars(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS state_war_country_metrics (
      war_id UUID NOT NULL REFERENCES state_wars(id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      joined_turn INTEGER NOT NULL CHECK (joined_turn>=0),
      starting_personnel BIGINT NOT NULL DEFAULT 0 CHECK (starting_personnel>=0),
      starting_military_power BIGINT NOT NULL DEFAULT 0 CHECK (starting_military_power>=0),
      cumulative_losses BIGINT NOT NULL DEFAULT 0 CHECK (cumulative_losses>=0),
      raids_suffered INTEGER NOT NULL DEFAULT 0 CHECK (raids_suffered>=0),
      settlements_lost INTEGER NOT NULL DEFAULT 0 CHECK (settlements_lost>=0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(war_id,country_id)
    );

    INSERT INTO rebel_factions(
      guild_id,settlement_id,against_country_id,faction_type,status,started_turn,outbreak_turn,cause_snapshot
    )
    SELECT country.guild_id,settlement.id,settlement.country_id,'POPULAR','ACTIVE',guild.current_turn,guild.current_turn,
           jsonb_build_object('source','legacy-rebellion')
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id
      JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE settlement.rebellion_active
    ON CONFLICT DO NOTHING;
  `
} as const;
