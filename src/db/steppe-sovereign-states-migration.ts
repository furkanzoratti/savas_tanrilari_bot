export const steppeSovereignStatesMigration={
  version:181,
  name:"retire_steppe_titles_and_form_sovereign_states",
  sql:`
    ALTER TABLE countries
      ADD COLUMN IF NOT EXISTS is_steppe_state BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TEMP TABLE steppe_state_partition_seed_v181(
      source_country_name TEXT NOT NULL,
      new_country_name TEXT NOT NULL,
      first_settlement_name TEXT NOT NULL,
      second_settlement_name TEXT NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO steppe_state_partition_seed_v181 VALUES
      ('Dingling Konfederasyonu','Baykal Devleti','Barguzin Vadisi','Uda Otlakları'),
      ('Dingling Konfederasyonu','Sayan Devleti','Sayan Yaylası','Yukarı Yenisey'),
      ('Xianbei Konfederasyonu','Hangay Devleti','Hangay Yaylası','Orhun Kavşağı'),
      ('Xianbei Konfederasyonu','Khentii Devleti','Khentii Otlakları','Ongin Geçidi'),
      ('Xiongnu Konfederasyonu','Onon Devleti','Onon Geçidi','Argun Otlakları'),
      ('Xiongnu Konfederasyonu','Hulun Devleti','Hulun Gölü','Buir Gölü'),
      ('Xiongnu Konfederasyonu','Khingan Devleti','Büyük Khingan','Nen Nehri Pazarı');

    UPDATE countries
       SET is_steppe_state=TRUE
     WHERE status='ACTIVE' AND lower(name) IN (
       lower('Dingling Konfederasyonu'),lower('Xianbei Konfederasyonu'),lower('Xiongnu Konfederasyonu')
     );

    UPDATE countries target
       SET status='ACTIVE',destroyed_turn=NULL,destroyed_reason=NULL,destroyed_by=NULL,destroyed_at=NULL,
           primary_culture_group=source.primary_culture_group,is_steppe_state=FALSE
      FROM steppe_state_partition_seed_v181 seed
      JOIN countries source ON lower(source.name)=lower(seed.source_country_name) AND source.status='ACTIVE'
     WHERE target.guild_id=source.guild_id AND lower(target.name)=lower(seed.new_country_name);

    INSERT INTO countries(guild_id,name,treasury,primary_culture_group,is_steppe_state)
    SELECT source.guild_id,seed.new_country_name,0,source.primary_culture_group,FALSE
      FROM steppe_state_partition_seed_v181 seed
      JOIN countries source ON lower(source.name)=lower(seed.source_country_name) AND source.status='ACTIVE'
     WHERE NOT EXISTS(
       SELECT 1 FROM countries existing
        WHERE existing.guild_id=source.guild_id AND lower(existing.name)=lower(seed.new_country_name)
     )
    ON CONFLICT(guild_id,name) DO NOTHING;

    CREATE TEMP TABLE steppe_state_partition_runtime_v181 ON COMMIT DROP AS
    SELECT DISTINCT source.guild_id,source.id AS source_country_id,target.id AS target_country_id,
           seed.source_country_name,seed.new_country_name,title.id AS title_id,title.holder_user_id,
           dynasty.id AS dynasty_id
      FROM steppe_state_partition_seed_v181 seed
      JOIN countries source ON lower(source.name)=lower(seed.source_country_name) AND source.status='ACTIVE'
      JOIN countries target ON target.guild_id=source.guild_id AND lower(target.name)=lower(seed.new_country_name)
      JOIN settlements settlement ON settlement.country_id=source.id
       AND lower(settlement.name) IN (lower(seed.first_settlement_name),lower(seed.second_settlement_name))
      JOIN steppe_title_holdings holding ON holding.settlement_id=settlement.id
      JOIN steppe_internal_titles title ON title.id=holding.title_id AND title.tier='LANDHOLDER' AND title.status='ACTIVE'
      LEFT JOIN dynasties dynasty ON dynasty.steppe_title_id=title.id;

    CREATE TEMP TABLE steppe_retired_title_runtime_v181 ON COMMIT DROP AS
    SELECT runtime.guild_id,runtime.source_country_id,runtime.target_country_id,runtime.title_id,
           runtime.holder_user_id,runtime.dynasty_id
      FROM steppe_state_partition_runtime_v181 runtime;

    UPDATE battles battle
       SET status='CANCELLED'
     WHERE battle.status NOT IN ('FINISHED','CANCELLED')
       AND EXISTS(
         SELECT 1 FROM battle_sides side_record
          JOIN steppe_retired_title_runtime_v181 retired ON retired.title_id=side_record.steppe_title_id
         WHERE side_record.battle_id=battle.id
       );

    CREATE TEMP TABLE steppe_moved_armies_v181 ON COMMIT DROP AS
    SELECT army.id AS army_id,army.country_id AS source_country_id,retired.target_country_id,
           army.commander_character_id
      FROM armies army
      JOIN steppe_retired_title_runtime_v181 retired ON retired.title_id=army.steppe_title_id;

    INSERT INTO battle_side_participants(battle_id,side_key,country_id,is_primary,composition,initial_composition)
    SELECT DISTINCT assignment.battle_id,assignment.side_key,moved.target_country_id,FALSE,'{}'::jsonb,'{}'::jsonb
      FROM battle_army_assignments assignment
      JOIN steppe_moved_armies_v181 moved ON moved.army_id=assignment.army_id
     WHERE moved.target_country_id<>moved.source_country_id
    ON CONFLICT(battle_id,country_id) DO NOTHING;

    UPDATE battle_army_assignments assignment
       SET country_id=moved.target_country_id
      FROM steppe_moved_armies_v181 moved
     WHERE assignment.army_id=moved.army_id;

    UPDATE country_characters character
       SET country_id=moved.target_country_id
      FROM steppe_moved_armies_v181 moved
     WHERE character.id=moved.commander_character_id
       AND moved.target_country_id<>moved.source_country_id;

    UPDATE armies army
       SET country_id=moved.target_country_id,steppe_title_id=NULL,updated_at=NOW()
      FROM steppe_moved_armies_v181 moved
     WHERE army.id=moved.army_id;

    INSERT INTO settlement_ownership_history(
      guild_id,settlement_id,previous_country_id,new_country_id,acquired_turn,change_type,details
    )
    SELECT source.guild_id,settlement.id,source.id,target.id,guild.current_turn,'ADMIN',
           jsonb_build_object('source','STEPPE_SOVEREIGN_STATES_V181','reason','Toprak Ağalığının bağımsız devlete dönüştürülmesi')
      FROM steppe_state_partition_seed_v181 seed
      JOIN countries source ON lower(source.name)=lower(seed.source_country_name) AND source.status='ACTIVE'
      JOIN countries target ON target.guild_id=source.guild_id AND lower(target.name)=lower(seed.new_country_name)
      JOIN guilds guild ON guild.discord_id=source.guild_id
      JOIN settlements settlement ON settlement.country_id=source.id
       AND lower(settlement.name) IN (lower(seed.first_settlement_name),lower(seed.second_settlement_name))
    ON CONFLICT DO NOTHING;

    UPDATE settlements settlement
       SET country_id=target.id,is_conquered=FALSE,conquered_turn=NULL
      FROM steppe_state_partition_seed_v181 seed
      JOIN countries source ON lower(source.name)=lower(seed.source_country_name) AND source.status='ACTIVE'
      JOIN countries target ON target.guild_id=source.guild_id AND lower(target.name)=lower(seed.new_country_name)
     WHERE settlement.country_id=source.id
       AND lower(settlement.name) IN (lower(seed.first_settlement_name),lower(seed.second_settlement_name));

    UPDATE rebel_factions faction
       SET against_country_id=settlement.country_id,updated_at=NOW()
      FROM settlements settlement
     WHERE faction.settlement_id=settlement.id
       AND faction.against_country_id<>settlement.country_id;

    INSERT INTO country_members(country_id,discord_user_id)
    SELECT target_country_id,holder_user_id
      FROM steppe_retired_title_runtime_v181
     WHERE holder_user_id IS NOT NULL
    ON CONFLICT(country_id,discord_user_id) DO NOTHING;

    DELETE FROM country_members membership
     USING steppe_state_partition_runtime_v181 runtime
     WHERE membership.country_id=runtime.source_country_id
       AND membership.discord_user_id=runtime.holder_user_id
       AND runtime.holder_user_id IS NOT NULL
       AND NOT EXISTS(
         SELECT 1 FROM steppe_internal_titles khan
         JOIN steppe_confederations confederation ON confederation.id=khan.confederation_id
          WHERE confederation.country_id=runtime.source_country_id AND confederation.status='ACTIVE'
            AND khan.tier='KHAN' AND khan.status='ACTIVE'
            AND khan.holder_user_id=runtime.holder_user_id
       );

    UPDATE dynasties dynasty
       SET country_id=retired.target_country_id,steppe_title_id=NULL,updated_at=NOW()
      FROM steppe_retired_title_runtime_v181 retired
     WHERE dynasty.id=retired.dynasty_id
       AND NOT EXISTS(
         SELECT 1 FROM dynasties existing
          WHERE existing.country_id=retired.target_country_id AND existing.steppe_title_id IS NULL
            AND existing.id<>dynasty.id
       );

    UPDATE dynasty_members member
       SET title='Hükümdar',updated_at=NOW()
      FROM dynasties dynasty
      JOIN steppe_state_partition_runtime_v181 runtime ON runtime.target_country_id=dynasty.country_id
     WHERE member.dynasty_id=dynasty.id AND dynasty.steppe_title_id IS NULL
       AND member.is_monarch=TRUE AND member.status='ALIVE';
    UPDATE dynasty_members member
       SET title='Hükümdar Eşi',relation='Hükümdarın Eşi',updated_at=NOW()
      FROM dynasties dynasty
      JOIN steppe_state_partition_runtime_v181 runtime ON runtime.target_country_id=dynasty.country_id
     WHERE member.dynasty_id=dynasty.id AND dynasty.steppe_title_id IS NULL
       AND (member.title='Toprak Ağası Eşi' OR member.relation='Toprak Ağası Eşi');

    UPDATE battle_sides side_record SET steppe_title_id=NULL
     WHERE side_record.steppe_title_id IN (SELECT title_id FROM steppe_retired_title_runtime_v181);
    UPDATE steppe_internal_conflicts SET status='CANCELLED',resolved_by='SYSTEM:STEPPE_SOVEREIGN_STATES_V181',
           resolution_reason='Bozkır iç unvan sistemi kaldırıldı.',updated_at=NOW()
     WHERE status='ACTIVE';
    UPDATE steppe_war_calls SET status='CANCELLED',closed_by='SYSTEM:STEPPE_SOVEREIGN_STATES_V181',closed_at=NOW()
     WHERE status='OPEN';

    DELETE FROM steppe_title_holdings
     WHERE title_id IN (SELECT title_id FROM steppe_retired_title_runtime_v181);
    DELETE FROM steppe_common_holdings
     WHERE confederation_id IN (SELECT id FROM steppe_confederations WHERE status='ACTIVE');
    UPDATE steppe_internal_titles SET status='REMOVED',liege_title_id=NULL,holder_user_id=NULL,updated_at=NOW()
     WHERE status='ACTIVE' AND tier='LANDHOLDER';

    UPDATE countries country
       SET treasury=COALESCE((SELECT SUM(settlement.local_treasury) FROM settlements settlement WHERE settlement.country_id=country.id),0)
     WHERE country.id IN (
       SELECT source_country_id FROM steppe_state_partition_runtime_v181
       UNION SELECT target_country_id FROM steppe_state_partition_runtime_v181
     );
  `
} as const;
