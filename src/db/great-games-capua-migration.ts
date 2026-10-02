export const greatGamesCapuaMigration = {
  version: 117,
  name: "turn_30_great_games_and_capua_gladiators",
  sql: `
    ALTER TABLE great_games_entries DROP CONSTRAINT IF EXISTS great_games_entries_game_type_check;
    ALTER TABLE great_games_entries ADD CONSTRAINT great_games_entries_game_type_check
      CHECK (game_type IN ('AUCTION','CHARIOT','CARAVAN','KINGS_BET','DIPLOMACY','GLADIATOR'));

    ALTER TABLE great_games_actions DROP CONSTRAINT IF EXISTS great_games_actions_game_type_check;
    ALTER TABLE great_games_actions ADD CONSTRAINT great_games_actions_game_type_check
      CHECK (game_type IN ('AUCTION','CHARIOT','CARAVAN','KINGS_BET','DIPLOMACY','GLADIATOR'));

    CREATE TABLE IF NOT EXISTS great_games_gladiators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      origin TEXT NOT NULL,
      style TEXT NOT NULL,
      power INTEGER NOT NULL CHECK (power BETWEEN 1 AND 100),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS great_games_gladiator_tournaments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      season_id UUID NOT NULL REFERENCES great_games_seasons(id) ON DELETE CASCADE,
      run_number INTEGER NOT NULL CHECK (run_number>0),
      status TEXT NOT NULL DEFAULT 'BETTING' CHECK (status IN ('BETTING','FIGHTING','COMPLETED','CANCELLED')),
      current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round BETWEEN 1 AND 5),
      champion_id UUID REFERENCES great_games_gladiators(id) ON DELETE SET NULL,
      started_by TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (season_id,run_number)
    );

    CREATE TABLE IF NOT EXISTS great_games_gladiator_matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tournament_id UUID NOT NULL REFERENCES great_games_gladiator_tournaments(id) ON DELETE CASCADE,
      round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 5),
      bracket_position INTEGER NOT NULL CHECK (bracket_position>0),
      fighter_a_id UUID REFERENCES great_games_gladiators(id) ON DELETE RESTRICT,
      fighter_b_id UUID REFERENCES great_games_gladiators(id) ON DELETE RESTRICT,
      winner_id UUID REFERENCES great_games_gladiators(id) ON DELETE RESTRICT,
      odds_a NUMERIC(6,2),
      odds_b NUMERIC(6,2),
      roll_a INTEGER,
      roll_b INTEGER,
      score_a INTEGER,
      score_b INTEGER,
      tie_breaks INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('WAITING','PENDING','FINISHED')),
      fought_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id,round,bracket_position),
      CHECK ((fighter_a_id IS NULL AND fighter_b_id IS NULL AND status='WAITING') OR
             (fighter_a_id IS NOT NULL AND fighter_b_id IS NOT NULL))
    );

    CREATE TABLE IF NOT EXISTS great_games_gladiator_bets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL REFERENCES great_games_gladiator_matches(id) ON DELETE CASCADE,
      bettor_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      fighter_id UUID NOT NULL REFERENCES great_games_gladiators(id) ON DELETE RESTRICT,
      amount BIGINT NOT NULL CHECK (amount BETWEEN 100 AND 5000),
      locked_odds NUMERIC(6,2) NOT NULL CHECK (locked_odds>=1),
      payout BIGINT NOT NULL DEFAULT 0 CHECK (payout>=0),
      status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED','WON','LOST','REFUNDED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settled_at TIMESTAMPTZ,
      UNIQUE (match_id,bettor_country_id)
    );

    CREATE INDEX IF NOT EXISTS great_games_gladiator_matches_round_idx
      ON great_games_gladiator_matches(tournament_id,round,status,bracket_position);
    CREATE INDEX IF NOT EXISTS great_games_gladiator_bets_match_idx
      ON great_games_gladiator_bets(match_id,status);

    WITH roster(name,origin,style) AS (VALUES
      ('Aelius Ferrum','Roma','Murmillo'),('Afer Fulmen','Kartaca','Retiarius'),
      ('Agron Taşkol','İlirya','Hoplomachus'),('Aias Bronzkol','Yunanistan','Murmillo'),
      ('Albanus Kurt','Capua','Secutor'),('Ardaric Ayı','Cermenya','Murmillo'),
      ('Ariston Mızrak','Atina','Hoplomachus'),('Arpad Bozkır','Sarmatya','Eques'),
      ('Atticus Gece','Roma','Thraex'),('Bato Kızıl','Dalmaçya','Secutor'),
      ('Belis Kumfırtınası','Suriye','Retiarius'),('Brennos Yaban','Galya','Murmillo'),
      ('Caius Çelik','Roma','Secutor'),('Cassianus Gölge','Capua','Thraex'),
      ('Crixos Yırtıcı','Galya','Murmillo'),('Dagan Denizkurdu','Fenike','Retiarius'),
      ('Damon Kalkan','Sparta','Hoplomachus'),('Decimus Kasırga','Roma','Murmillo'),
      ('Drustan Meşe','Britanya','Secutor'),('Einar Kuzgun','Cermenya','Thraex'),
      ('Enlil Aslanı','Babil','Hoplomachus'),('Evander Tunç','Epir','Murmillo'),
      ('Felix Akrep','Capua','Retiarius'),('Gannicus Şimşek','Galya','Dimachaerus'),
      ('Hanno Mor','Kartaca','Hoplomachus'),('Hasdran Fil Dişi','Afrika','Murmillo'),
      ('Heron Sessiz','Mısır','Retiarius'),('Iber Kıvrak','İberya','Thraex'),
      ('Icarus Köz','Rodos','Dimachaerus'),('Juba Çöl Aslanı','Numidya','Eques'),
      ('Kaeso Kıran','Roma','Murmillo'),('Kallias Altın','Korint','Hoplomachus'),
      ('Karanos Dağlı','Makedonya','Secutor'),('Kavi Kaplan','Hindistan','Hoplomachus'),
      ('Leontes Pençe','Sparta','Murmillo'),('Lucius Fırtına','Roma','Dimachaerus'),
      ('Mago Kara','Kartaca','Secutor'),('Marcellus Duvar','Capua','Murmillo'),
      ('Marius Kanat','Roma','Eques'),('Mazaios Boğa','Persya','Hoplomachus'),
      ('Nabû Keskin','Mezopotamya','Thraex'),('Nestor Yaşlı Kurt','Tesalya','Murmillo'),
      ('Odris Ayaz','Trakya','Thraex'),('Orgetorix Boynuz','Galya','Murmillo'),
      ('Pacuvius Ağ','Capua','Retiarius'),('Perseus Tunçbaş','Makedonya','Hoplomachus'),
      ('Quintus Örs','Roma','Secutor'),('Rhesos Gece Atı','Trakya','Eques'),
      ('Sabinus Kılıç','Roma','Dimachaerus'),('Sargon Kara Güneş','Asur','Murmillo'),
      ('Scylax Dalga','Kilikya','Retiarius'),('Segomaros Yaban Domuzu','Galya','Secutor'),
      ('Taharqa Nil Aslanı','Nubya','Hoplomachus'),('Tarvos Boynuz','Britanya','Murmillo'),
      ('Tigran Demirdağ','Ermenistan','Secutor'),('Tullus Kızıl Kum','Roma','Thraex'),
      ('Uldin Bozkurt','İskitya','Eques'),('Varro Kırık Diş','Capua','Murmillo'),
      ('Vercassivellaunos','Galya','Hoplomachus'),('Xanthos Çifte Bıçak','Girit','Dimachaerus'),
      ('Yarhibol Güneş','Palmira','Secutor'),('Zalmoxis Sis','Getya','Thraex'),
      ('Zenon Sessiz Adım','Kıbrıs','Retiarius'),('Zopyros Duvar','Persya','Murmillo')
    ), numbered AS (
      SELECT name,origin,style,row_number() OVER ()::integer AS rn FROM roster
    )
    INSERT INTO great_games_gladiators(code,name,origin,style,power)
    SELECT 'CAP-' || lpad(rn::text,2,'0'),name,origin,style,45 + ((rn*37) % 55)
      FROM numbered
    ON CONFLICT (name) DO UPDATE SET origin=EXCLUDED.origin,style=EXCLUDED.style,power=EXCLUDED.power,active=TRUE;
  `
} as const;
