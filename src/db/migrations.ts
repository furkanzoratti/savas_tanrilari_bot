export const migrations = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE guilds (
        discord_id TEXT PRIMARY KEY,
        current_turn INTEGER NOT NULL DEFAULT 1 CHECK (current_turn >= 1),
        turn_phase TEXT NOT NULL DEFAULT 'CLOSED' CHECK (turn_phase IN ('OPEN', 'CLOSED', 'RESOLVING')),
        acquisition_interval INTEGER NOT NULL DEFAULT 3 CHECK (acquisition_interval >= 1),
        announcement_channel_id TEXT,
        audit_channel_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE countries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        treasury BIGINT NOT NULL DEFAULT 0,
        mobilization TEXT NOT NULL DEFAULT 'PEACE' CHECK (mobilization IN ('PEACE', 'PARTIAL', 'GENERAL')),
        mobilization_started_turn INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (guild_id, name)
      );

      CREATE TABLE country_members (
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL,
        PRIMARY KEY (country_id, discord_user_id)
      );

      CREATE UNIQUE INDEX one_country_per_user_per_guild
        ON country_members(discord_user_id, country_id);

      CREATE TABLE settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        population BIGINT NOT NULL DEFAULT 0 CHECK (population >= 0),
        slave_population BIGINT NOT NULL DEFAULT 0 CHECK (slave_population >= 0),
        base_income BIGINT NOT NULL DEFAULT 0,
        base_population_growth BIGINT NOT NULL DEFAULT 0,
        manual_flat_income BIGINT NOT NULL DEFAULT 0,
        manual_income_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
        ruin_stage SMALLINT NOT NULL DEFAULT 0 CHECK (ruin_stage BETWEEN 0 AND 2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (country_id, name)
      );

      CREATE TABLE buildings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        building_type TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 3),
        target_level INTEGER CHECK (target_level BETWEEN 1 AND 3),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BUILDING')),
        started_turn INTEGER,
        completion_turn INTEGER,
        UNIQUE (settlement_id, building_type)
      );

      CREATE TABLE unit_stacks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        unit_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        status TEXT NOT NULL DEFAULT 'GARRISON' CHECK (status IN ('GARRISON', 'FIELD_FRIENDLY', 'FIELD_HOSTILE')),
        UNIQUE (settlement_id, unit_type, status)
      );

      CREATE TABLE recruitment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        unit_type TEXT NOT NULL,
        total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
        remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
        paid_amount BIGINT NOT NULL,
        ordered_turn INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'TRAINING' CHECK (status IN ('TRAINING', 'COMPLETED', 'CANCELLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE recruitment_waves (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES recruitment_orders(id) ON DELETE CASCADE,
        due_turn INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        processed_at TIMESTAMPTZ,
        UNIQUE (order_id, due_turn)
      );

      CREATE TABLE recruitment_usage (
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        acquisition_turn INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        PRIMARY KEY (settlement_id, acquisition_turn)
      );

      CREATE TABLE naval_units (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        ship_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        status TEXT NOT NULL DEFAULT 'RESERVE' CHECK (status IN ('RESERVE', 'ACTIVE', 'HOSTILE')),
        UNIQUE (settlement_id, ship_type, status)
      );

      CREATE TABLE naval_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        ship_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        paid_amount BIGINT NOT NULL,
        ordered_turn INTEGER NOT NULL,
        completion_turn INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'BUILDING' CHECK (status IN ('BUILDING', 'COMPLETED', 'CANCELLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE siege_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        location_note TEXT,
        UNIQUE NULLS NOT DISTINCT (country_id, settlement_id, asset_type, location_note)
      );

      CREATE TABLE transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        turn INTEGER NOT NULL,
        kind TEXT NOT NULL,
        amount BIGINT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE role_channels (
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      );

      CREATE TABLE role_messages (
        message_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        word_count INTEGER NOT NULL CHECK (word_count >= 0),
        message_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX role_messages_leaderboard_idx
        ON role_messages(guild_id, message_date, discord_user_id);

      CREATE TABLE processed_events (
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        event_key TEXT NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, event_key)
      );

      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        actor_user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    version: 2,
    name: "income_trade_and_role_reports",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS role_report_channel_id TEXT;
      ALTER TABLE guilds DROP CONSTRAINT IF EXISTS guilds_current_turn_check;
      ALTER TABLE guilds ADD CONSTRAINT guilds_current_turn_check CHECK (current_turn >= 0);

      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_income BIGINT NOT NULL DEFAULT 0 CHECK (tax_income >= 0);
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS land_trade_income BIGINT NOT NULL DEFAULT 0 CHECK (land_trade_income >= 0);
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS sea_trade_income BIGINT NOT NULL DEFAULT 0 CHECK (sea_trade_income >= 0);

      CREATE TABLE IF NOT EXISTS trade_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        proposer_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        receiver_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        proposer_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        receiver_settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE,
        route TEXT NOT NULL CHECK (route IN ('LAND', 'SEA')),
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'ENDED')),
        income_per_country BIGINT NOT NULL DEFAULT 250 CHECK (income_per_country >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        CHECK (proposer_country_id <> receiver_country_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS active_trade_pair_route_idx
        ON trade_agreements(
          guild_id,
          (LEAST(proposer_country_id, receiver_country_id)),
          (GREATEST(proposer_country_id, receiver_country_id)),
          route
        ) WHERE status IN ('PENDING', 'ACTIVE');

      CREATE INDEX IF NOT EXISTS trade_agreements_country_idx
        ON trade_agreements(proposer_country_id, receiver_country_id, status);
    `
  },
  {
    version: 3,
    name: "player_command_logs",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS command_log_channel_id TEXT;

      CREATE TABLE IF NOT EXISTS player_command_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL,
        command_name TEXT NOT NULL,
        command_text TEXT NOT NULL,
        success BOOLEAN,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS player_command_logs_recent_idx
        ON player_command_logs(guild_id, created_at DESC);
    `
  },
  {
    version: 4,
    name: "settlement_resources_and_resource_trade",
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'GRAIN';
      ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_resource_type_check;
      ALTER TABLE settlements ADD CONSTRAINT settlements_resource_type_check CHECK (resource_type IN (
        'GRAIN','IRON','TIMBER','MARBLE','HORSES','LEATHER','WINE','OLIVE','GLASS','GOLD','LEAD','AMBER','SILK','SPICES','PURPLE_DYE'
      ));

      DROP INDEX IF EXISTS active_trade_pair_route_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS active_trade_settlement_pair_idx
        ON trade_agreements((LEAST(proposer_settlement_id,receiver_settlement_id)),(GREATEST(proposer_settlement_id,receiver_settlement_id)),route)
        WHERE status IN ('PENDING','ACTIVE');

      UPDATE trade_agreements SET income_per_country=0;
      ALTER TABLE trade_agreements ALTER COLUMN income_per_country SET DEFAULT 0;
      UPDATE trade_agreements SET status='REJECTED',ended_at=NOW()
       WHERE status='PENDING' AND receiver_settlement_id IS NULL;
    `
  },
  {
    version: 5,
    name: "persistent_battle_system",
    sql: `
      CREATE TABLE IF NOT EXISTS battles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL, public_message_id TEXT,
        terrain TEXT NOT NULL CHECK (terrain IN ('OPEN_PLAIN','DESERT','FOREST','MARSH','MOUNTAIN','MOUNTAIN_PASS','RIVER_CROSSING','SIEGE','NAVAL')),
        narrative TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','WAITING_FIRST_ROLL','WAITING_SECOND_ROLL','READY_TO_RESOLVE','FINISHED','CANCELLED')),
        round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1), first_side TEXT NOT NULL CHECK (first_side IN ('A','B')),
        winner_side TEXT CHECK (winner_side IN ('A','B')), finish_reason TEXT, created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_battle_per_channel ON battles(guild_id,channel_id) WHERE status NOT IN ('FINISHED','CANCELLED');
      CREATE TABLE IF NOT EXISTS battle_sides (
        battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE, side_key TEXT NOT NULL CHECK (side_key IN ('A','B')),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE, controller TEXT NOT NULL CHECK (controller IN ('PLAYERS','GM')),
        initial_total INTEGER NOT NULL DEFAULT 0 CHECK (initial_total >= 0), current_total INTEGER NOT NULL DEFAULT 0 CHECK (current_total >= 0),
        total_losses INTEGER NOT NULL DEFAULT 0 CHECK (total_losses >= 0), pressure INTEGER NOT NULL DEFAULT 0 CHECK (pressure >= 0),
        composition JSONB NOT NULL DEFAULT '{}'::jsonb, seal TEXT NOT NULL, PRIMARY KEY (battle_id,side_key), UNIQUE (battle_id,country_id)
      );
      CREATE TABLE IF NOT EXISTS battle_rolls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        round_number INTEGER NOT NULL, side_key TEXT NOT NULL CHECK (side_key IN ('A','B')), roller_user_id TEXT NOT NULL,
        clash_total INTEGER NOT NULL CHECK (clash_total >= 0), damage_total INTEGER NOT NULL CHECK (damage_total >= 0),
        detail JSONB NOT NULL DEFAULT '{}'::jsonb, is_proxy BOOLEAN NOT NULL DEFAULT FALSE, manual BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (battle_id,round_number,side_key)
      );
      CREATE TABLE IF NOT EXISTS battle_rounds (
        battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE, round_number INTEGER NOT NULL,
        tier TEXT NOT NULL CHECK (tier IN ('BALANCED','MINOR','CLEAR','CRUSHING')), winner_side TEXT CHECK (winner_side IN ('A','B')),
        loss_a INTEGER NOT NULL, loss_b INTEGER NOT NULL, pressure_a INTEGER NOT NULL, pressure_b INTEGER NOT NULL,
        order_a TEXT NOT NULL CHECK (order_a IN ('ORDERED','WORN','SHAKEN','CRITICAL','BROKEN')),
        order_b TEXT NOT NULL CHECK (order_b IN ('ORDERED','WORN','SHAKEN','CRITICAL','BROKEN')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (battle_id,round_number)
      );
    `
  },
  {
    version: 6,
    name: "ambush_siege_and_naval_battles",
    sql: `
      ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_terrain_check;
      ALTER TABLE battles ADD CONSTRAINT battles_terrain_check CHECK (terrain IN (
        'OPEN_PLAIN','AMBUSH','DESERT','FOREST','MARSH','MOUNTAIN','MOUNTAIN_PASS','RIVER_CROSSING','SIEGE','NAVAL'
      ));
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS wall_max_hp INTEGER CHECK (wall_max_hp IS NULL OR wall_max_hp >= 0);
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS wall_current_hp INTEGER CHECK (wall_current_hp IS NULL OR wall_current_hp >= 0);
      ALTER TABLE battle_sides ADD COLUMN IF NOT EXISTS support_assets JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE battle_rolls ADD COLUMN IF NOT EXISTS wall_damage INTEGER NOT NULL DEFAULT 0 CHECK (wall_damage >= 0);
      ALTER TABLE battle_rounds ADD COLUMN IF NOT EXISTS wall_damage INTEGER NOT NULL DEFAULT 0 CHECK (wall_damage >= 0);
      UPDATE battles SET wall_max_hp=5000,wall_current_hp=5000 WHERE terrain='SIEGE' AND wall_max_hp IS NULL;
    `
  },
  {
    version: 7,
    name: "siege_structures_retreat_and_battle_casualties",
    sql: `
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS gate_max_hp INTEGER CHECK (gate_max_hp IS NULL OR gate_max_hp >= 0);
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS gate_current_hp INTEGER CHECK (gate_current_hp IS NULL OR gate_current_hp >= 0);
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS losses_applied_at TIMESTAMPTZ;
      ALTER TABLE battle_sides ADD COLUMN IF NOT EXISTS support_targets JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE battle_sides ADD COLUMN IF NOT EXISTS initial_composition JSONB NOT NULL DEFAULT '{}'::jsonb;
      UPDATE battle_sides SET initial_composition=composition WHERE initial_composition='{}'::jsonb;
      ALTER TABLE battle_rolls ADD COLUMN IF NOT EXISTS gate_damage INTEGER NOT NULL DEFAULT 0 CHECK (gate_damage >= 0);
      ALTER TABLE battle_rounds ADD COLUMN IF NOT EXISTS gate_damage INTEGER NOT NULL DEFAULT 0 CHECK (gate_damage >= 0);
      ALTER TABLE battle_rounds ADD COLUMN IF NOT EXISTS retreat_loss_a INTEGER NOT NULL DEFAULT 0 CHECK (retreat_loss_a >= 0);
      ALTER TABLE battle_rounds ADD COLUMN IF NOT EXISTS retreat_loss_b INTEGER NOT NULL DEFAULT 0 CHECK (retreat_loss_b >= 0);

      UPDATE battles
         SET wall_current_hp=ROUND(COALESCE(wall_current_hp,5000)::numeric / GREATEST(COALESCE(wall_max_hp,5000),1) * 30000),
             wall_max_hp=30000,
             gate_max_hp=15000,
             gate_current_hp=COALESCE(gate_current_hp,15000)
       WHERE terrain='SIEGE';

      CREATE TABLE IF NOT EXISTS battle_casualty_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        side_key TEXT NOT NULL CHECK (side_key IN ('A','B')),
        force_type TEXT NOT NULL,
        calculated_loss INTEGER NOT NULL CHECK (calculated_loss >= 0),
        applied_loss INTEGER NOT NULL CHECK (applied_loss >= 0),
        shortfall INTEGER NOT NULL CHECK (shortfall >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (battle_id,side_key,force_type)
      );
    `
  },
  {
    version: 8,
    name: "siege_bombardment_gate_and_population_casualties",
    sql: `
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS siege_phase TEXT;
      ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_siege_phase_check;
      ALTER TABLE battles ADD CONSTRAINT battles_siege_phase_check CHECK (siege_phase IS NULL OR siege_phase IN ('BOMBARDMENT','ASSAULT'));
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS bombardment_round INTEGER NOT NULL DEFAULT 0 CHECK (bombardment_round >= 0);

      UPDATE battles
         SET gate_current_hp=ROUND(COALESCE(gate_current_hp,15000)::numeric / GREATEST(COALESCE(gate_max_hp,15000),1) * 1000),
             gate_max_hp=1000,
             siege_phase=COALESCE(siege_phase,'BOMBARDMENT')
       WHERE terrain='SIEGE';

      ALTER TABLE battle_casualty_applications ADD COLUMN IF NOT EXISTS population_loss_applied INTEGER NOT NULL DEFAULT 0 CHECK (population_loss_applied >= 0);
      ALTER TABLE battle_casualty_applications ADD COLUMN IF NOT EXISTS population_shortfall INTEGER NOT NULL DEFAULT 0 CHECK (population_shortfall >= 0);

      CREATE TABLE IF NOT EXISTS battle_bombardments (
        battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        bombardment_number INTEGER NOT NULL CHECK (bombardment_number >= 1),
        actor_user_id TEXT NOT NULL,
        catapult_count INTEGER NOT NULL CHECK (catapult_count > 0),
        wall_damage INTEGER NOT NULL CHECK (wall_damage >= 0),
        wall_hp_after INTEGER NOT NULL CHECK (wall_hp_after >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (battle_id,bombardment_number)
      );
    `
  },
  {
    version: 9,
    name: "turn_bombardment_limits_and_conquered_settlements",
    sql: `
      ALTER TABLE battle_bombardments ADD COLUMN IF NOT EXISTS game_turn INTEGER;
      UPDATE battle_bombardments bb
         SET game_turn=g.current_turn
        FROM battles b JOIN guilds g ON g.discord_id=b.guild_id
       WHERE bb.battle_id=b.id AND bb.game_turn IS NULL;
      ALTER TABLE battle_bombardments ALTER COLUMN game_turn SET NOT NULL;
      CREATE INDEX IF NOT EXISTS battle_bombardments_turn_idx
        ON battle_bombardments(battle_id,game_turn);

      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS is_conquered BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS conquered_turn INTEGER;
    `
  },
  {
    version: 10,
    name: "settlement_culture_and_standard_garrisons",
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS culture_group TEXT NOT NULL DEFAULT 'UNASSIGNED';
      ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_culture_group_check;
      ALTER TABLE settlements ADD CONSTRAINT settlements_culture_group_check CHECK (culture_group IN (
        'UNASSIGNED','BRITTONIC','CELTIC','GERMANIC','BALTIC','IBERIAN','ITALIC','ILLYRO_PANNONIAN','DACO_GETIC','THRACIAN',
        'HELLENIC','PUNIC','BERBER','LIBYAN','EGYPTIAN','KUSHITIC','HABESHA','ARABIAN','LEVANTINE','MESOPOTAMIAN',
        'ANATOLIAN','ARMENIAN','CAUCASIAN','SARMATIAN','SCYTHIAN','WEST_IRANIAN','EAST_IRANIAN'
      ));
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS garrison_level INTEGER NOT NULL DEFAULT 0 CHECK (garrison_level >= 0);
      ALTER TABLE unit_stacks ADD COLUMN IF NOT EXISTS force_type TEXT NOT NULL DEFAULT 'ARMY';
      ALTER TABLE unit_stacks DROP CONSTRAINT IF EXISTS unit_stacks_force_type_check;
      ALTER TABLE unit_stacks ADD CONSTRAINT unit_stacks_force_type_check CHECK (force_type IN ('GARRISON','ARMY'));
      ALTER TABLE unit_stacks DROP CONSTRAINT IF EXISTS unit_stacks_settlement_id_unit_type_status_key;
      ALTER TABLE unit_stacks ADD CONSTRAINT unit_stacks_settlement_unit_status_force_key UNIQUE (settlement_id,unit_type,status,force_type);

      WITH standard AS (
        SELECT id,
          CASE WHEN population < 50000 THEN FLOOR(FLOOR(population * 0.01) * 0.40)::INTEGER ELSE FLOOR(population / 25000.0)::INTEGER * 100 END AS light_quantity,
          CASE WHEN population < 50000 THEN FLOOR(FLOOR(population * 0.01) * 0.40)::INTEGER ELSE FLOOR(population / 25000.0)::INTEGER * 100 END AS spear_quantity,
          CASE WHEN population < 50000 THEN (FLOOR(population * 0.01)::INTEGER - 2 * FLOOR(FLOOR(population * 0.01) * 0.40)::INTEGER) ELSE FLOOR(population / 25000.0)::INTEGER * 50 END AS archer_quantity
        FROM settlements
      ), stacks AS (
        SELECT id, 'light_infantry'::TEXT AS unit_type, light_quantity AS quantity FROM standard
        UNION ALL SELECT id, 'spear', spear_quantity FROM standard
        UNION ALL SELECT id, 'archer', archer_quantity FROM standard
      )
      INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
      SELECT id,unit_type,quantity,'GARRISON','GARRISON' FROM stacks WHERE quantity > 0
      ON CONFLICT(settlement_id,unit_type,status,force_type)
      DO UPDATE SET quantity=GREATEST(unit_stacks.quantity,EXCLUDED.quantity);

      UPDATE settlements SET garrison_level=CASE WHEN population < 50000 THEN 0 ELSE FLOOR(population / 25000.0)::INTEGER - 1 END;
    `
  },
  {
    version: 11,
    name: "settlement_treasury_and_income_model_v2",
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS local_treasury BIGINT NOT NULL DEFAULT 0 CHECK (local_treasury >= 0);
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS base_land_trade_income BIGINT NOT NULL DEFAULT 0 CHECK (base_land_trade_income >= 0);

      UPDATE settlements
         SET base_land_trade_income=GREATEST(0,base_income+tax_income+land_trade_income+sea_trade_income-FLOOR(population*0.03)::BIGINT)
       WHERE base_land_trade_income=0;
    `
  },
  {
    version: 12,
    name: "local_treasury_is_country_treasury_source",
    sql: `
      ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_local_treasury_check;

      WITH first_settlement AS (
        SELECT DISTINCT ON (country_id) id,country_id
          FROM settlements
         ORDER BY country_id,name,id
      )
      UPDATE settlements s
         SET local_treasury=s.local_treasury+c.treasury
        FROM first_settlement f
        JOIN countries c ON c.id=f.country_id
       WHERE s.id=f.id;

      UPDATE countries c
         SET treasury=(SELECT COALESCE(SUM(s.local_treasury),0)::bigint FROM settlements s WHERE s.country_id=c.id)
       WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.country_id=c.id);
    `
  },
  {
    version: 13,
    name: "mobilization_market_and_siege_production",
    sql: `
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS manpower_over_limit_since_turn INTEGER;
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS manpower_penalty_active BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS siege_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL CHECK (asset_type IN ('mantlet','ballista','wall_ballista','catapult','siege_tower')),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        paid_amount BIGINT NOT NULL CHECK (paid_amount >= 0),
        workshop_slots INTEGER NOT NULL CHECK (workshop_slots > 0),
        ordered_turn INTEGER NOT NULL,
        completion_turn INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'BUILDING' CHECK (status IN ('BUILDING','COMPLETED','CANCELLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS siege_orders_due_idx ON siege_orders(status,completion_turn);
      CREATE INDEX IF NOT EXISTS siege_orders_settlement_turn_idx ON siege_orders(settlement_id,ordered_turn);

      ALTER TABLE battles ADD COLUMN IF NOT EXISTS defender_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS active_siege_settlement_idx
        ON battles(defender_settlement_id) WHERE terrain='SIEGE' AND status NOT IN ('FINISHED','CANCELLED');
    `
  },
  {
    version: 14,
    name: "city_policies_academy_characters_and_building_balance",
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS is_coastal BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS last_acquisition_income BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS curia_guard_granted BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE settlements s SET is_coastal=TRUE
       WHERE EXISTS (SELECT 1 FROM buildings b WHERE b.settlement_id=s.id AND b.building_type IN ('port','shipyard'));

      CREATE TABLE IF NOT EXISTS settlement_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        policy_key TEXT NOT NULL CHECK (policy_key IN (
          'WAR_PREPARATION','GARRISON_REINFORCEMENT','CONSCRIPTION','MARKET_FAIRS',
          'STRICT_TAXATION','MERCHANT_LICENSE','ACCELERATED_CONSTRUCTION',
          'INFRASTRUCTURE_ROADS','MASTER_ARCHITECTURE'
        )),
        slot SMALLINT NOT NULL CHECK (slot IN (1,2)),
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE')),
        activation_turn INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (settlement_id,slot),
        UNIQUE (settlement_id,policy_key)
      );

      CREATE TABLE IF NOT EXISTS country_characters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        trained_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
        assigned_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('SPY','MERCHANT','COMMANDER')),
        skill_bonus INTEGER NOT NULL DEFAULT 0 CHECK (skill_bonus >= 0),
        assignment TEXT NOT NULL DEFAULT 'NONE' CHECK (assignment IN ('NONE','CURIA','AGORA')),
        trained_turn INTEGER NOT NULL,
        trained_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS country_characters_unique_name ON country_characters(country_id,lower(name));
      CREATE INDEX IF NOT EXISTS country_characters_assignment_idx ON country_characters(assigned_settlement_id,assignment);

      CREATE TABLE IF NOT EXISTS academy_training_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        academy_level SMALLINT NOT NULL CHECK (academy_level BETWEEN 1 AND 3),
        acquisition_turn INTEGER NOT NULL,
        roll_sides SMALLINT NOT NULL CHECK (roll_sides IN (20,30)),
        roll_value SMALLINT,
        excluded_role TEXT CHECK (excluded_role IN ('SPY','MERCHANT','COMMANDER')),
        selected_role TEXT CHECK (selected_role IN ('SPY','MERCHANT','COMMANDER')),
        result_role TEXT CHECK (result_role IN ('SPY','MERCHANT','COMMANDER')),
        skill_bonus INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING_ROLL' CHECK (status IN ('PENDING_ROLL','AWAITING_NAME','COMPLETED','CANCELLED')),
        initiated_by TEXT NOT NULL,
        character_id UUID REFERENCES country_characters(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (settlement_id,acquisition_turn)
      );

      CREATE TABLE IF NOT EXISTS settlement_conscriptions (
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        created_turn INTEGER NOT NULL,
        PRIMARY KEY(settlement_id,battle_id)
      );

      CREATE TABLE IF NOT EXISTS settlement_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        turn INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        chance INTEGER NOT NULL,
        roll INTEGER NOT NULL,
        triggered BOOLEAN NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pantheon_loans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        principal BIGINT NOT NULL CHECK (principal > 0),
        remaining_amount BIGINT NOT NULL CHECK (remaining_amount >= 0),
        issued_turn INTEGER NOT NULL,
        due_turn INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REPAID'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_pantheon_loan_per_country ON pantheon_loans(country_id) WHERE status='ACTIVE';

      ALTER TABLE siege_orders ADD COLUMN IF NOT EXISTS engineering_enhanced BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE siege_assets ADD COLUMN IF NOT EXISTS enhanced_quantity INTEGER NOT NULL DEFAULT 0 CHECK (enhanced_quantity >= 0);
      ALTER TABLE battle_sides ADD COLUMN IF NOT EXISTS support_enhanced JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE battle_sides ADD COLUMN IF NOT EXISTS temporary_militia INTEGER NOT NULL DEFAULT 0 CHECK (temporary_militia >= 0);
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS starvation_capacity INTEGER;
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS starvation_remaining INTEGER;
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS last_starvation_turn INTEGER;
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS defender_pantheon_pressure_used BOOLEAN NOT NULL DEFAULT FALSE;

      UPDATE battles b
         SET starvation_capacity=3+LEAST(5,
               COALESCE((SELECT CASE WHEN MAX(level)>=3 THEN 3 WHEN MAX(level)>=2 THEN 1 ELSE 0 END
                           FROM buildings WHERE settlement_id=b.defender_settlement_id AND building_type='farm' AND status='ACTIVE'),0)
             + COALESCE((SELECT CASE WHEN MAX(level)>=2 THEN 2 ELSE 0 END
                           FROM buildings WHERE settlement_id=b.defender_settlement_id AND building_type='aqueduct' AND status='ACTIVE'),0)),
             starvation_remaining=3+LEAST(5,
               COALESCE((SELECT CASE WHEN MAX(level)>=3 THEN 3 WHEN MAX(level)>=2 THEN 1 ELSE 0 END
                           FROM buildings WHERE settlement_id=b.defender_settlement_id AND building_type='farm' AND status='ACTIVE'),0)
             + COALESCE((SELECT CASE WHEN MAX(level)>=2 THEN 2 ELSE 0 END
                           FROM buildings WHERE settlement_id=b.defender_settlement_id AND building_type='aqueduct' AND status='ACTIVE'),0)),
             last_starvation_turn=g.current_turn
        FROM guilds g
       WHERE g.discord_id=b.guild_id AND b.terrain='SIEGE' AND b.defender_settlement_id IS NOT NULL
         AND b.status NOT IN ('FINISHED','CANCELLED') AND b.starvation_capacity IS NULL;
    `
  },
  {
    version: 15,
    name: "game_master_weighted_settlement_events",
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS black_market_active BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS epidemic_active BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS unrest_active BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS rebellion_active BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS settlement_event_draws (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (event_type IN ('BLACK_MARKET','EPIDEMIC','UNREST','REBELLION')),
        selected_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
        selected_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
        selected_settlement_name TEXT NOT NULL,
        selected_country_name TEXT NOT NULL,
        scope_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
        candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
        eligible_count INTEGER NOT NULL CHECK (eligible_count >= 0),
        excluded_count INTEGER NOT NULL CHECK (excluded_count >= 0),
        total_weight INTEGER NOT NULL CHECK (total_weight > 0),
        roll INTEGER NOT NULL CHECK (roll > 0),
        selected_weight INTEGER NOT NULL CHECK (selected_weight > 0),
        range_start INTEGER NOT NULL CHECK (range_start > 0),
        range_end INTEGER NOT NULL CHECK (range_end >= range_start),
        current_turn INTEGER NOT NULL,
        actor_user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPLIED','CANCELLED')),
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        applied_event_id UUID REFERENCES settlement_events(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        applied_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS settlement_event_draws_pending_idx
        ON settlement_event_draws(guild_id,event_type,created_at DESC) WHERE status='PENDING';
      CREATE INDEX IF NOT EXISTS settlement_events_triggered_history_idx
        ON settlement_events(settlement_id,event_type,turn DESC) WHERE triggered=TRUE;
    `
  },
  {
    version: 16,
    name: "curia_heavy_infantry_garrison_guards",
    sql: `
      UPDATE unit_stacks army
         SET quantity=GREATEST(0,army.quantity-500)
        FROM settlements settlement
       WHERE settlement.id=army.settlement_id
         AND settlement.curia_guard_granted=TRUE
         AND army.unit_type='light_infantry'
         AND army.status='GARRISON'
         AND army.force_type='ARMY';

      DELETE FROM unit_stacks army
       USING settlements settlement
       WHERE settlement.id=army.settlement_id
         AND settlement.curia_guard_granted=TRUE
         AND army.unit_type='light_infantry'
         AND army.status='GARRISON'
         AND army.force_type='ARMY'
         AND army.quantity=0;

      INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
      SELECT id,'heavy_infantry',200,'GARRISON','GARRISON'
        FROM settlements WHERE curia_guard_granted=TRUE
      ON CONFLICT(settlement_id,unit_type,status,force_type)
      DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity;
    `
  },
  {
    version: 17,
    name: "alliances_pacts_and_diplomacy_channel",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS diplomacy_channel_id TEXT;

      CREATE TABLE IF NOT EXISTS country_alliances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        proposer_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        receiver_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REJECTED','ENDED','CANCELLED')),
        offered_by TEXT NOT NULL,
        responded_by TEXT,
        channel_id TEXT,
        message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        CHECK (proposer_country_id <> receiver_country_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS country_alliances_open_pair_idx
        ON country_alliances(guild_id,LEAST(proposer_country_id,receiver_country_id),GREATEST(proposer_country_id,receiver_country_id))
        WHERE status IN ('PENDING','ACTIVE');
      CREATE INDEX IF NOT EXISTS country_alliances_receiver_idx ON country_alliances(receiver_country_id,status);
      CREATE INDEX IF NOT EXISTS country_alliances_proposer_idx ON country_alliances(proposer_country_id,status);

      CREATE TABLE IF NOT EXISTS diplomatic_pacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        founder_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
        purpose TEXT NOT NULL CHECK (char_length(purpose) BETWEEN 2 AND 200),
        description TEXT NOT NULL CHECK (char_length(description) BETWEEN 2 AND 1000),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS diplomatic_pacts_guild_name_idx
        ON diplomatic_pacts(guild_id,LOWER(name));

      CREATE TABLE IF NOT EXISTS pact_memberships (
        pact_id UUID NOT NULL REFERENCES diplomatic_pacts(id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(pact_id,country_id)
      );
      CREATE INDEX IF NOT EXISTS pact_memberships_country_idx ON pact_memberships(country_id);

      CREATE TABLE IF NOT EXISTS pact_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        pact_id UUID NOT NULL REFERENCES diplomatic_pacts(id) ON DELETE CASCADE,
        inviter_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        receiver_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
        invited_by TEXT NOT NULL,
        responded_by TEXT,
        channel_id TEXT,
        message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        CHECK (inviter_country_id <> receiver_country_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pact_pending_invitation_idx
        ON pact_invitations(pact_id,receiver_country_id) WHERE status='PENDING';
      CREATE INDEX IF NOT EXISTS pact_invitations_receiver_idx ON pact_invitations(receiver_country_id,status);
    `
  },
  {
    version: 18,
    name: "state_war_declarations_and_peace_treaties",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS war_announcement_channel_id TEXT;

      CREATE TABLE IF NOT EXISTS state_wars (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        attacker_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        defender_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 1000),
        declaration TEXT NOT NULL CHECK (char_length(declaration) BETWEEN 2 AND 2000),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
        started_turn INTEGER NOT NULL CHECK (started_turn >= 0),
        ended_turn INTEGER,
        declared_by TEXT NOT NULL,
        ended_by TEXT,
        channel_id TEXT,
        message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        CHECK (attacker_country_id <> defender_country_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS state_wars_active_pair_idx
        ON state_wars(guild_id,LEAST(attacker_country_id,defender_country_id),GREATEST(attacker_country_id,defender_country_id))
        WHERE status='ACTIVE';
      CREATE INDEX IF NOT EXISTS state_wars_attacker_idx ON state_wars(attacker_country_id,status);
      CREATE INDEX IF NOT EXISTS state_wars_defender_idx ON state_wars(defender_country_id,status);

      CREATE TABLE IF NOT EXISTS peace_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        war_id UUID NOT NULL REFERENCES state_wars(id) ON DELETE CASCADE,
        proposer_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        receiver_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        terms TEXT NOT NULL CHECK (char_length(terms) BETWEEN 2 AND 2000),
        indemnity_amount BIGINT NOT NULL DEFAULT 0 CHECK (indemnity_amount >= 0),
        payer_country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
        recipient_country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
        offered_turn INTEGER NOT NULL CHECK (offered_turn >= 0),
        resolved_turn INTEGER,
        offered_by TEXT NOT NULL,
        resolved_by TEXT,
        channel_id TEXT,
        message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        CHECK (proposer_country_id <> receiver_country_id),
        CHECK (
          (indemnity_amount=0 AND payer_country_id IS NULL AND recipient_country_id IS NULL)
          OR
          (indemnity_amount>0 AND payer_country_id IS NOT NULL AND recipient_country_id IS NOT NULL AND payer_country_id<>recipient_country_id)
        )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS peace_offers_pending_war_idx ON peace_offers(war_id) WHERE status='PENDING';
      CREATE INDEX IF NOT EXISTS peace_offers_receiver_idx ON peace_offers(receiver_country_id,status);
    `
  },
  {
    version: 19,
    name: "welcome_messages",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS welcome_channel_id TEXT;
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS welcome_message TEXT;
    `
  },
  {
    version: 20,
    name: "discord_country_roles",
    sql: `
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS discord_role_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS countries_discord_role_id_unique
        ON countries(discord_role_id) WHERE discord_role_id IS NOT NULL;
    `
  },
  {
    version: 21,
    name: "temporary_settlement_income_penalties",
    sql: `
      CREATE TABLE IF NOT EXISTS settlement_income_penalties (
        settlement_id UUID PRIMARY KEY REFERENCES settlements(id) ON DELETE CASCADE,
        penalty_percent SMALLINT NOT NULL CHECK (penalty_percent BETWEEN 1 AND 100),
        remaining_acquisition_turns INTEGER NOT NULL CHECK (remaining_acquisition_turns BETWEEN 1 AND 100),
        reason TEXT NOT NULL,
        created_turn INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    version: 22,
    name: "siege_critical_battle_order",
    sql: `
      ALTER TABLE battle_rounds DROP CONSTRAINT IF EXISTS battle_rounds_order_a_check;
      ALTER TABLE battle_rounds DROP CONSTRAINT IF EXISTS battle_rounds_order_b_check;
      ALTER TABLE battle_rounds ADD CONSTRAINT battle_rounds_order_a_check
        CHECK (order_a IN ('ORDERED','WORN','SHAKEN','CRITICAL','BROKEN'));
      ALTER TABLE battle_rounds ADD CONSTRAINT battle_rounds_order_b_check
        CHECK (order_b IN ('ORDERED','WORN','SHAKEN','CRITICAL','BROKEN'));
    `
  },
  {
    version: 23,
    name: "mercenary_contracts_and_battle_sources",
    sql: `
      CREATE TABLE IF NOT EXISTS mercenary_contracts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        company_key TEXT NOT NULL,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','UNPAID','ENDED','CANCELLED','DESTROYED')),
        hired_turn INTEGER NOT NULL,
        arrival_turn INTEGER NOT NULL,
        end_turn INTEGER NOT NULL,
        hire_cost BIGINT NOT NULL CHECK (hire_cost >= 0),
        turn_upkeep BIGINT NOT NULL CHECK (turn_upkeep >= 0),
        last_upkeep_turn INTEGER,
        unpaid_since_turn INTEGER,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (arrival_turn=hired_turn+1),
        CHECK (end_turn>=arrival_turn+2)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS mercenary_company_unavailable_idx
        ON mercenary_contracts(guild_id,company_key) WHERE status IN ('PENDING','ACTIVE','UNPAID');
      CREATE INDEX IF NOT EXISTS mercenary_contract_country_idx ON mercenary_contracts(country_id,status);
      CREATE TABLE IF NOT EXISTS mercenary_contract_units (
        contract_id UUID NOT NULL REFERENCES mercenary_contracts(id) ON DELETE CASCADE,
        unit_type TEXT NOT NULL,
        initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
        current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0),
        PRIMARY KEY(contract_id,unit_type)
      );
      CREATE TABLE IF NOT EXISTS mercenary_contract_ships (
        contract_id UUID NOT NULL REFERENCES mercenary_contracts(id) ON DELETE CASCADE,
        ship_type TEXT NOT NULL,
        initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
        current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0),
        PRIMARY KEY(contract_id,ship_type)
      );
      CREATE TABLE IF NOT EXISTS mercenary_contract_assets (
        contract_id UUID NOT NULL REFERENCES mercenary_contracts(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL,
        initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
        current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0),
        PRIMARY KEY(contract_id,asset_type)
      );
      CREATE TABLE IF NOT EXISTS battle_mercenary_assignments (
        battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        side_key TEXT NOT NULL CHECK (side_key IN ('A','B')),
        contract_id UUID NOT NULL REFERENCES mercenary_contracts(id) ON DELETE CASCADE,
        initial_land JSONB NOT NULL DEFAULT '{}'::jsonb,
        initial_ships JSONB NOT NULL DEFAULT '{}'::jsonb,
        initial_assets JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(battle_id,contract_id),
        UNIQUE(battle_id,side_key,contract_id)
      );
      ALTER TABLE battle_casualty_applications
        ADD COLUMN IF NOT EXISTS mercenary_loss_applied INTEGER NOT NULL DEFAULT 0 CHECK (mercenary_loss_applied >= 0);
    `
  },
  {
    version: 24,
    name: "mandatory_garrison_replenishment",
    sql: `
      CREATE TABLE IF NOT EXISTS garrison_replenishment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'BUILDING' CHECK (status IN ('BUILDING','COMPLETED','CANCELLED')),
        reason TEXT NOT NULL CHECK (reason IN ('CONQUEST','BATTLE_LOSS','ROUTINE')),
        light_infantry INTEGER NOT NULL DEFAULT 0 CHECK (light_infantry >= 0),
        spears INTEGER NOT NULL DEFAULT 0 CHECK (spears >= 0),
        archers INTEGER NOT NULL DEFAULT 0 CHECK (archers >= 0),
        personnel_reserved INTEGER NOT NULL CHECK (personnel_reserved > 0),
        paid_amount BIGINT NOT NULL CHECK (paid_amount >= 0),
        ordered_turn INTEGER NOT NULL,
        completion_turn INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        CHECK (completion_turn=ordered_turn+2),
        CHECK (personnel_reserved=light_infantry+spears+archers)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS garrison_replenishment_active_settlement_idx
        ON garrison_replenishment_orders(settlement_id) WHERE status='BUILDING';
      CREATE INDEX IF NOT EXISTS garrison_replenishment_due_idx
        ON garrison_replenishment_orders(completion_turn,status);
    `
  },
  {
    version: 25,
    name: "battle_side_coalitions",
    sql: `
      CREATE TABLE IF NOT EXISTS battle_side_participants (
        battle_id UUID NOT NULL,
        side_key TEXT NOT NULL CHECK (side_key IN ('A','B')),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        composition JSONB NOT NULL DEFAULT '{}'::jsonb,
        initial_composition JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(battle_id,country_id),
        FOREIGN KEY(battle_id,side_key) REFERENCES battle_sides(battle_id,side_key) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS battle_side_participants_side_idx
        ON battle_side_participants(battle_id,side_key);
      CREATE UNIQUE INDEX IF NOT EXISTS battle_side_participants_primary_idx
        ON battle_side_participants(battle_id,side_key) WHERE is_primary;
      INSERT INTO battle_side_participants(battle_id,side_key,country_id,is_primary,composition,initial_composition)
      SELECT battle_id,side_key,country_id,TRUE,composition,initial_composition FROM battle_sides
      ON CONFLICT(battle_id,country_id) DO NOTHING;
    `
  },
  {
    version: 26,
    name: "npc_auto_purchase",
    sql: `
      CREATE TABLE IF NOT EXISTS npc_auto_purchase_configs (
        guild_id TEXT PRIMARY KEY REFERENCES guilds(discord_id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        doctrine TEXT NOT NULL DEFAULT 'BALANCED' CHECK (doctrine IN ('BALANCED','DEFENSIVE','OFFENSIVE','CAVALRY','LIGHT_ARMY','HISTORICAL')),
        budget_percent INTEGER NOT NULL DEFAULT 70 CHECK (budget_percent BETWEEN 1 AND 100),
        target_fill_percent INTEGER NOT NULL DEFAULT 85 CHECK (target_fill_percent BETWEEN 1 AND 100),
        minimum_reserve BIGINT NOT NULL DEFAULT 1000 CHECK (minimum_reserve >= 0),
        scope TEXT NOT NULL DEFAULT 'ALL_PLAYERLESS' CHECK (scope IN ('ALL_PLAYERLESS','INCLUDED_ONLY')),
        updated_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS npc_auto_purchase_country_overrides (
        country_id UUID PRIMARY KEY REFERENCES countries(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'AUTO' CHECK (status IN ('AUTO','INCLUDE','EXCLUDE')),
        doctrine TEXT CHECK (doctrine IS NULL OR doctrine IN ('BALANCED','DEFENSIVE','OFFENSIVE','CAVALRY','LIGHT_ARMY','HISTORICAL')),
        updated_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS npc_auto_purchase_runs (
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        acquisition_turn INTEGER NOT NULL,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        doctrine TEXT NOT NULL CHECK (doctrine IN ('BALANCED','DEFENSIVE','OFFENSIVE','CAVALRY','LIGHT_ARMY','HISTORICAL')),
        status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETE','PARTIAL','FAILED')),
        summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        PRIMARY KEY(guild_id,acquisition_turn,country_id)
      );
      CREATE INDEX IF NOT EXISTS npc_auto_purchase_runs_turn_idx ON npc_auto_purchase_runs(guild_id,acquisition_turn,status);
    `
  },
  {
    version: 27,
    name: "country_special_unit_unlocks",
    sql: `
      CREATE TABLE IF NOT EXISTS country_special_unit_unlocks (
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        unit_type TEXT NOT NULL CHECK (unit_type IN ('legionary','hoplite','horse_archer','camel_cavalry','briton_longbow')),
        granted_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(country_id,unit_type)
      );
      CREATE INDEX IF NOT EXISTS country_special_unit_unlocks_country_idx ON country_special_unit_unlocks(country_id);
    `
  },
  {
    version: 28,
    name: "state_war_end_results",
    sql: `
      ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS winner_country_id UUID REFERENCES countries(id) ON DELETE SET NULL;
      ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS end_outcome TEXT
        CHECK (end_outcome IS NULL OR end_outcome IN ('ATTACKER_VICTORY','DEFENDER_VICTORY','WHITE_PEACE'));
      ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS end_description TEXT;
      CREATE INDEX IF NOT EXISTS state_wars_winner_idx ON state_wars(winner_country_id,status);
    `
  },
  {
    version: 29,
    name: "destroyed_country_lifecycle",
    sql: `
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','YOK_EDİLDİ'));
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS destroyed_turn INTEGER;
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS destroyed_reason TEXT;
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS destroyed_by TEXT;
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS destroyed_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS countries_guild_status_idx ON countries(guild_id,status,name);
    `
  },
  {
    version: 30,
    name: "repeatable_npc_auto_purchase",
    sql: `
      ALTER TABLE npc_auto_purchase_runs
        ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1);
    `
  },
  {
    version: 31,
    name: "formable_country_identities",
    sql: `
      ALTER TABLE countries ADD COLUMN IF NOT EXISTS active_formable_key TEXT;
      CREATE TABLE IF NOT EXISTS country_formations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        previous_name TEXT NOT NULL,
        formable_key TEXT NOT NULL,
        formed_name TEXT NOT NULL,
        formed_turn INTEGER NOT NULL CHECK (formed_turn >= 0),
        formed_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(country_id, formable_key)
      );
      CREATE INDEX IF NOT EXISTS country_formations_country_idx ON country_formations(country_id,created_at DESC);
    `
  },
  {
    version: 32,
    name: "daily_great_power_rankings",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS great_power_channel_id TEXT;
      CREATE TABLE IF NOT EXISTS great_power_snapshots (
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        snapshot_date DATE NOT NULL,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 10),
        secret_score BIGINT NOT NULL CHECK (secret_score >= 0),
        breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(guild_id,snapshot_date,country_id),
        UNIQUE(guild_id,snapshot_date,rank)
      );
      CREATE INDEX IF NOT EXISTS great_power_snapshots_recent_idx
        ON great_power_snapshots(guild_id,snapshot_date DESC,rank);
    `
  },
  {
    version: 33,
    name: "multi_country_war_fronts",
    sql: `
      ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS war_goal TEXT NOT NULL DEFAULT 'Belirtilmedi';
      ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS war_type TEXT NOT NULL DEFAULT 'COUNTRY'
        CHECK (war_type IN ('COUNTRY','PACT','FACTION'));
      ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS attacker_pact_id UUID REFERENCES diplomatic_pacts(id) ON DELETE SET NULL;
      ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS defender_pact_id UUID REFERENCES diplomatic_pacts(id) ON DELETE SET NULL;

      CREATE TABLE IF NOT EXISTS state_war_participants (
        war_id UUID NOT NULL REFERENCES state_wars(id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        side TEXT NOT NULL CHECK (side IN ('ATTACKER','DEFENDER')),
        join_source TEXT NOT NULL DEFAULT 'DECLARATION' CHECK (join_source IN ('DECLARATION','PACT','CALL')),
        joined_turn INTEGER NOT NULL CHECK (joined_turn >= 0),
        invited_by_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
        joined_by TEXT NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(war_id,country_id)
      );
      CREATE INDEX IF NOT EXISTS state_war_participants_country_idx
        ON state_war_participants(country_id,war_id);

      INSERT INTO state_war_participants(war_id,country_id,side,join_source,joined_turn,joined_by)
        SELECT id,attacker_country_id,'ATTACKER','DECLARATION',started_turn,declared_by FROM state_wars
        ON CONFLICT(war_id,country_id) DO NOTHING;
      INSERT INTO state_war_participants(war_id,country_id,side,join_source,joined_turn,joined_by)
        SELECT id,defender_country_id,'DEFENDER','DECLARATION',started_turn,declared_by FROM state_wars
        ON CONFLICT(war_id,country_id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS state_war_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        war_id UUID NOT NULL REFERENCES state_wars(id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        side TEXT NOT NULL CHECK (side IN ('ATTACKER','DEFENDER')),
        invited_by_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
        invited_turn INTEGER NOT NULL CHECK (invited_turn >= 0),
        responded_turn INTEGER,
        invited_by TEXT NOT NULL,
        responded_by TEXT,
        channel_id TEXT,
        message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS state_war_invitations_pending_unique
        ON state_war_invitations(war_id,country_id) WHERE status='PENDING';
      CREATE INDEX IF NOT EXISTS state_war_invitations_country_idx
        ON state_war_invitations(country_id,status,created_at DESC);
    `
  },
  {
    version: 34,
    name: "battle_phase_reveal_tracking",
    sql: `
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS bombardment_revealed BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE battles ADD COLUMN IF NOT EXISTS assault_revealed BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE battles SET bombardment_revealed=TRUE
        WHERE terrain='SIEGE' AND public_message_id IS NOT NULL;
      UPDATE battles SET assault_revealed=TRUE
        WHERE terrain='SIEGE' AND public_message_id IS NOT NULL AND siege_phase='ASSAULT';
    `
  },
  {
    version: 35,
    name: "scheduled_army_composition_activation",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS army_composition_activation_turn INTEGER;
      UPDATE guilds SET army_composition_activation_turn=current_turn+3 WHERE army_composition_activation_turn IS NULL;
      ALTER TABLE guilds ALTER COLUMN army_composition_activation_turn SET DEFAULT 4;
    `
  },
  {
    version: 36,
    name: "expanded_country_special_unit_unlocks",
    sql: `
      ALTER TABLE country_special_unit_unlocks DROP CONSTRAINT IF EXISTS country_special_unit_unlocks_unit_type_check;
      ALTER TABLE country_special_unit_unlocks ADD CONSTRAINT country_special_unit_unlocks_unit_type_check
        CHECK (unit_type IN ('legionary','hoplite','horse_archer','camel_cavalry','briton_longbow','persian_immortal','carthaginian_war_elephant','iberian_caetrati','germanic_shock_warrior'));
    `
  },
  {
    version: 37,
    name: "academy_diplomats_and_special_unit_repair",
    sql: `
      ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_role_check;
      ALTER TABLE country_characters ADD CONSTRAINT country_characters_role_check
        CHECK (role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT'));

      ALTER TABLE academy_training_sessions DROP CONSTRAINT IF EXISTS academy_training_sessions_roll_sides_check;
      ALTER TABLE academy_training_sessions ADD CONSTRAINT academy_training_sessions_roll_sides_check
        CHECK (roll_sides IN (20,30,40));
      ALTER TABLE academy_training_sessions DROP CONSTRAINT IF EXISTS academy_training_sessions_excluded_role_check;
      ALTER TABLE academy_training_sessions ADD CONSTRAINT academy_training_sessions_excluded_role_check
        CHECK (excluded_role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT'));
      ALTER TABLE academy_training_sessions DROP CONSTRAINT IF EXISTS academy_training_sessions_selected_role_check;
      ALTER TABLE academy_training_sessions ADD CONSTRAINT academy_training_sessions_selected_role_check
        CHECK (selected_role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT'));
      ALTER TABLE academy_training_sessions DROP CONSTRAINT IF EXISTS academy_training_sessions_result_role_check;
      ALTER TABLE academy_training_sessions ADD CONSTRAINT academy_training_sessions_result_role_check
        CHECK (result_role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT'));

      ALTER TABLE country_special_unit_unlocks DROP CONSTRAINT IF EXISTS country_special_unit_unlocks_unit_type_check;
      ALTER TABLE country_special_unit_unlocks ADD CONSTRAINT country_special_unit_unlocks_unit_type_check
        CHECK (unit_type IN ('legionary','hoplite','horse_archer','camel_cavalry','briton_longbow','persian_immortal','carthaginian_war_elephant','iberian_caetrati','germanic_shock_warrior'));
    `
  },
  {
    version: 38,
    name: "indefinite_mercenary_contracts",
    sql: `
      ALTER TABLE mercenary_contracts ALTER COLUMN end_turn DROP NOT NULL;
      UPDATE mercenary_contracts
         SET end_turn=NULL,updated_at=NOW()
       WHERE status IN ('PENDING','ACTIVE','UNPAID');
    `
  },
  {
    version: 39,
    name: "treasury_transfer_limits_and_vassalages",
    sql: `
      CREATE TABLE IF NOT EXISTS settlement_treasury_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        turn INTEGER NOT NULL CHECK (turn >= 0),
        source_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        target_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        amount BIGINT NOT NULL CHECK (amount > 0),
        actor_user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(guild_id,country_id,turn)
      );
      CREATE INDEX IF NOT EXISTS settlement_treasury_transfers_country_idx
        ON settlement_treasury_transfers(country_id,turn DESC);

      CREATE TABLE IF NOT EXISTS country_vassalages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        overlord_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        vassal_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
        started_turn INTEGER NOT NULL CHECK (started_turn >= 0),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_turn INTEGER,
        ended_by TEXT,
        ended_at TIMESTAMPTZ,
        CHECK (overlord_country_id <> vassal_country_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS country_vassalages_active_vassal_unique
        ON country_vassalages(vassal_country_id) WHERE status='ACTIVE';
      CREATE UNIQUE INDEX IF NOT EXISTS country_vassalages_active_pair_unique
        ON country_vassalages(overlord_country_id,vassal_country_id) WHERE status='ACTIVE';
      CREATE INDEX IF NOT EXISTS country_vassalages_overlord_idx
        ON country_vassalages(overlord_country_id,status);
    `
  },
  {
    version: 40,
    name: "six_turn_siege_starvation",
    sql: `
      UPDATE battles SET starvation_capacity=starvation_capacity+3,starvation_remaining=starvation_remaining+3
       WHERE terrain='SIEGE' AND status NOT IN ('FINISHED','CANCELLED')
         AND starvation_capacity IS NOT NULL AND starvation_remaining IS NOT NULL;
    `
  },
  {
    version: 41,
    name: "battle_participant_source_settlement",
    sql: `
      ALTER TABLE battle_side_participants ADD COLUMN IF NOT EXISTS source_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS battle_side_participants_source_settlement_idx
        ON battle_side_participants(source_settlement_id);
    `
  },
  {
    version: 42,
    name: "persistent_player_armies",
    sql: `
      ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_assignment_check;
      ALTER TABLE country_characters ADD CONSTRAINT country_characters_assignment_check
        CHECK (assignment IN ('NONE','CURIA','AGORA','ARMY'));

      CREATE TABLE IF NOT EXISTS armies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 60),
        commander_character_id UUID UNIQUE REFERENCES country_characters(id) ON DELETE SET NULL,
        created_turn INTEGER NOT NULL CHECK (created_turn >= 0),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS armies_country_name_unique ON armies(country_id,lower(name));
      CREATE INDEX IF NOT EXISTS armies_country_idx ON armies(country_id,created_at);

      CREATE TABLE IF NOT EXISTS army_units (
        army_id UUID NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        unit_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        PRIMARY KEY(army_id,settlement_id,unit_type)
      );
      CREATE INDEX IF NOT EXISTS army_units_settlement_idx ON army_units(settlement_id,unit_type);

      CREATE TABLE IF NOT EXISTS battle_army_assignments (
        battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        side_key TEXT NOT NULL CHECK (side_key IN ('A','B')),
        army_id UUID NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        initial_composition JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(battle_id,army_id)
      );
      CREATE INDEX IF NOT EXISTS battle_army_assignments_country_idx
        ON battle_army_assignments(battle_id,side_key,country_id);
      CREATE INDEX IF NOT EXISTS battle_army_assignments_army_idx
        ON battle_army_assignments(army_id,battle_id);
    `
  }] as const;
