export const romanRepublicPoliticsMigration={
  version:155,
  name:"roman_republic_senate_offices_relations",
  sql:`
    ALTER TABLE roman_families
      ADD COLUMN IF NOT EXISTS reputation INTEGER NOT NULL DEFAULT 50 CHECK(reputation BETWEEN 0 AND 100),
      ADD COLUMN IF NOT EXISTS scandal INTEGER NOT NULL DEFAULT 0 CHECK(scandal BETWEEN 0 AND 100),
      ADD COLUMN IF NOT EXISTS political_bloc TEXT NOT NULL DEFAULT 'CENTRIST'
        CHECK(political_bloc IN ('CENTRIST','OPTIMATES','POPULARES','EQUITES','MILITARISTS','TRADITIONALISTS'));

    UPDATE roman_families family SET political_bloc=CASE
      WHEN lower(family.name) IN ('scipio ailesi','scipio','servilius ailesi') THEN 'MILITARISTS'
      WHEN lower(family.name) IN ('magnus ailesi','magnus','aemilius ailesi','caecilius ailesi') THEN 'OPTIMATES'
      WHEN lower(family.name) IN ('cato ailesi','cato','fabius ailesi') THEN 'TRADITIONALISTS'
      WHEN lower(family.name) IN ('nero ailesi','nero','julius ailesi','junius ailesi') THEN 'POPULARES'
      WHEN lower(family.name) IN ('licinius ailesi','valerius ailesi') THEN 'EQUITES'
      ELSE family.political_bloc END
    FROM roman_republics republic JOIN countries country ON country.id=republic.country_id
    WHERE family.republic_id=republic.id AND lower(country.name) LIKE 'roma%';

    UPDATE roman_families family SET political_influence=GREATEST(family.political_influence,8)
      FROM roman_republics republic JOIN countries country ON country.id=republic.country_id
     WHERE family.republic_id=republic.id AND lower(country.name) LIKE 'roma%'
       AND lower(family.name) IN ('julius ailesi','aemilius ailesi','fabius ailesi','valerius ailesi',
         'licinius ailesi','junius ailesi','servilius ailesi','caecilius ailesi');

    CREATE TABLE IF NOT EXISTS roman_family_relations(
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      family_a_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      family_b_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN -100 AND 100),
      trust INTEGER NOT NULL DEFAULT 50 CHECK(trust BETWEEN 0 AND 100),
      rivalry INTEGER NOT NULL DEFAULT 0 CHECK(rivalry BETWEEN 0 AND 100),
      last_reason TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(republic_id,family_a_id,family_b_id),
      CHECK(family_a_id<family_b_id)
    );

    INSERT INTO roman_family_relations(republic_id,family_a_id,family_b_id)
    SELECT left_family.republic_id,left_family.id,right_family.id
      FROM roman_families left_family
      JOIN roman_families right_family ON right_family.republic_id=left_family.republic_id AND left_family.id<right_family.id
      JOIN roman_republics republic ON republic.id=left_family.republic_id AND republic.status='ACTIVE'
    ON CONFLICT DO NOTHING;

    UPDATE roman_family_relations relation SET
      score=CASE
        WHEN left_family.political_bloc=right_family.political_bloc THEN 15
        WHEN left_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND right_family.political_bloc='POPULARES' THEN -20
        WHEN right_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND left_family.political_bloc='POPULARES' THEN -20
        ELSE 0 END,
      trust=CASE WHEN left_family.political_bloc=right_family.political_bloc THEN 60 ELSE 50 END,
      rivalry=CASE
        WHEN left_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND right_family.political_bloc='POPULARES' THEN 15
        WHEN right_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND left_family.political_bloc='POPULARES' THEN 15
        ELSE 0 END,
      last_reason='Başlangıç siyasi hizip dengesi',updated_at=NOW()
    FROM roman_families left_family,roman_families right_family
    WHERE left_family.id=relation.family_a_id AND right_family.id=relation.family_b_id;

    CREATE TABLE IF NOT EXISTS roman_family_relation_events(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      family_a_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      family_b_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      score_delta INTEGER NOT NULL DEFAULT 0,
      trust_delta INTEGER NOT NULL DEFAULT 0,
      rivalry_delta INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS roman_family_relation_events_pair_idx
      ON roman_family_relation_events(republic_id,family_a_id,family_b_id,game_turn DESC);

    CREATE TABLE IF NOT EXISTS roman_senate_proposals(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      proposed_by_family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      proposal_type TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('MILITARY','ECONOMY','POPULAR','TRADITION','ADMINISTRATION')),
      title TEXT NOT NULL CHECK(char_length(title) BETWEEN 2 AND 100),
      description TEXT NOT NULL CHECK(char_length(description) BETWEEN 2 AND 1000),
      influence_cost INTEGER NOT NULL DEFAULT 0 CHECK(influence_cost>=0),
      threshold_percent INTEGER NOT NULL CHECK(threshold_percent BETWEEN 1 AND 100),
      opened_turn INTEGER NOT NULL,
      closes_turn INTEGER NOT NULL,
      duration_turns INTEGER NOT NULL DEFAULT 0 CHECK(duration_turns>=0),
      target_family_id UUID REFERENCES roman_families(id) ON DELETE SET NULL,
      target_character_name TEXT,
      office_key TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','PASSED','REJECTED','VETOED','CANCELLED')),
      yes_weight INTEGER NOT NULL DEFAULT 0,
      no_weight INTEGER NOT NULL DEFAULT 0,
      abstain_families INTEGER NOT NULL DEFAULT 0,
      resolved_turn INTEGER,
      resolved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS roman_senate_proposals_status_idx
      ON roman_senate_proposals(republic_id,status,closes_turn);

    CREATE TABLE IF NOT EXISTS roman_senate_votes(
      proposal_id UUID NOT NULL REFERENCES roman_senate_proposals(id) ON DELETE CASCADE,
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      choice TEXT NOT NULL CHECK(choice IN ('YES','NO','ABSTAIN')),
      seat_weight INTEGER NOT NULL CHECK(seat_weight>=0),
      influence_spent INTEGER NOT NULL DEFAULT 0 CHECK(influence_spent BETWEEN 0 AND 10),
      total_weight INTEGER NOT NULL CHECK(total_weight>=0),
      npc_score INTEGER,
      voted_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(proposal_id,family_id)
    );

    CREATE TABLE IF NOT EXISTS roman_laws(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      proposal_id UUID NOT NULL UNIQUE REFERENCES roman_senate_proposals(id) ON DELETE CASCADE,
      law_key TEXT NOT NULL,
      title TEXT NOT NULL,
      started_turn INTEGER NOT NULL,
      end_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','REPEALED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS roman_laws_active_idx ON roman_laws(republic_id,status,end_turn);
    CREATE TABLE IF NOT EXISTS roman_law_turn_runs(
      law_id UUID NOT NULL REFERENCES roman_laws(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(law_id,game_turn)
    );

    CREATE TABLE IF NOT EXISTS roman_office_holders(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      character_name TEXT NOT NULL CHECK(char_length(character_name) BETWEEN 2 AND 80),
      office_key TEXT NOT NULL CHECK(office_key IN ('QUAESTOR','AEDILE','PRAETOR','CENSOR','PONTIFEX_MAXIMUS')),
      source_proposal_id UUID REFERENCES roman_senate_proposals(id) ON DELETE SET NULL,
      started_turn INTEGER NOT NULL,
      end_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','REMOVED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roman_office_one_active_holder_idx
      ON roman_office_holders(republic_id,office_key) WHERE status='ACTIVE';
    CREATE UNIQUE INDEX IF NOT EXISTS roman_character_one_active_office_idx
      ON roman_office_holders(republic_id,lower(character_name)) WHERE status='ACTIVE';
    CREATE INDEX IF NOT EXISTS roman_office_career_idx
      ON roman_office_holders(family_id,lower(character_name),office_key,status);
    CREATE TABLE IF NOT EXISTS roman_office_turn_runs(
      office_holder_id UUID NOT NULL REFERENCES roman_office_holders(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      treasury_income BIGINT NOT NULL DEFAULT 0,
      influence_gain INTEGER NOT NULL DEFAULT 0,
      reputation_delta INTEGER NOT NULL DEFAULT 0,
      scandal_delta INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(office_holder_id,game_turn)
    );

    CREATE TABLE IF NOT EXISTS roman_family_action_runs(
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      target_family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      action_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(family_id,game_turn)
    );
  `
} as const;
