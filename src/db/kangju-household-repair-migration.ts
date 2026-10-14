export const kangjuHouseholdRepairMigration={
  version:199,
  name:"kangju_household_name_and_roster_repair",
  sql:`
    CREATE TEMP TABLE kangju_country_targets_v199 ON COMMIT DROP AS
    SELECT country.id AS country_id,country.guild_id,guild.current_turn
      FROM countries country JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE country.status='ACTIVE'
       AND (
         country.primary_culture='KANGJU'
         OR lower(country.name) IN (lower('Kangju Konfederasyonu'),lower('Kangkü Konfederasyonu'))
       );

    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT target.guild_id,target.country_id,'Kangkü Kraliyet Hanesi','system:kangju-household-repair-v199'
      FROM kangju_country_targets_v199 target
    ON CONFLICT(country_id) WHERE steppe_title_id IS NULL DO NOTHING;

    CREATE TEMP TABLE kangju_dynasty_targets_v199 ON COMMIT DROP AS
    SELECT dynasty.id AS dynasty_id,target.current_turn
      FROM kangju_country_targets_v199 target
      JOIN dynasties dynasty ON dynasty.country_id=target.country_id AND dynasty.steppe_title_id IS NULL;

    UPDATE dynasties dynasty SET name='Kangkü Kraliyet Hanesi',updated_at=NOW()
      FROM kangju_dynasty_targets_v199 target WHERE dynasty.id=target.dynasty_id;

    CREATE TEMP TABLE kangju_dynasty_seed_v199(
      member_key TEXT PRIMARY KEY,member_name TEXT NOT NULL,gender TEXT NOT NULL,age INTEGER NOT NULL,
      title TEXT NOT NULL,relation TEXT NOT NULL,succession_rank INTEGER,
      spouse_key TEXT,mother_key TEXT,father_key TEXT
    ) ON COMMIT DROP;
    INSERT INTO kangju_dynasty_seed_v199 VALUES
      ('head','Spitamenes Kangju','MALE',46,'Kangkü Kralı','Hükümdar',NULL,'spouse','head_mother','head_father'),
      ('spouse','Roxana Kangju','FEMALE',39,'Kraliçe','Hükümdarın eşi',NULL,'head',NULL,NULL),
      ('heir','Bessos Kangju','MALE',19,'Veliaht','Hükümdarın oğlu',1,NULL,'spouse','head'),
      ('daughter','Stateira Kangju','FEMALE',16,'Prenses','Hükümdarın kızı',2,NULL,'spouse','head'),
      ('head_father','Oxyartes Kangju','MALE',70,'Eski Kral','Hükümdarın babası',NULL,'head_mother',NULL,NULL),
      ('head_mother','Apama Kangju','FEMALE',66,'Ana Kraliçe','Hükümdarın annesi',NULL,'head_father',NULL,NULL),
      ('head_brother','Arsames Kangju','MALE',42,'Prens','Hükümdarın erkek kardeşi',3,NULL,'head_mother','head_father'),
      ('head_sister','Barsine Kangju','FEMALE',37,'Prenses','Hükümdarın kız kardeşi',4,NULL,'head_mother','head_father');

    INSERT INTO dynasty_members(
      dynasty_id,birth_dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
      succession_rank,born_turn
    )
    SELECT target.dynasty_id,target.dynasty_id,seed.member_name,seed.gender,seed.age,seed.title,seed.relation,
           'ALIVE','HEALTHY',FALSE,FALSE,seed.succession_rank,target.current_turn-seed.age
      FROM kangju_dynasty_targets_v199 target CROSS JOIN kangju_dynasty_seed_v199 seed
    ON CONFLICT(dynasty_id,lower(name)) DO NOTHING;

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,mother_id=mother.id,father_id=father.id,
           birth_dynasty_id=COALESCE(member.birth_dynasty_id,target.dynasty_id),updated_at=NOW()
      FROM kangju_dynasty_targets_v199 target
      JOIN kangju_dynasty_seed_v199 seed ON TRUE
      LEFT JOIN kangju_dynasty_seed_v199 spouse_seed ON spouse_seed.member_key=seed.spouse_key
      LEFT JOIN kangju_dynasty_seed_v199 mother_seed ON mother_seed.member_key=seed.mother_key
      LEFT JOIN kangju_dynasty_seed_v199 father_seed ON father_seed.member_key=seed.father_key
      LEFT JOIN dynasty_members spouse ON spouse.dynasty_id=target.dynasty_id AND lower(spouse.name)=lower(spouse_seed.member_name)
      LEFT JOIN dynasty_members mother ON mother.dynasty_id=target.dynasty_id AND lower(mother.name)=lower(mother_seed.member_name)
      LEFT JOIN dynasty_members father ON father.dynasty_id=target.dynasty_id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members head SET is_monarch=TRUE,updated_at=NOW()
      FROM kangju_dynasty_targets_v199 target
     WHERE head.dynasty_id=target.dynasty_id AND lower(head.name)=lower('Spitamenes Kangju')
       AND head.status='ALIVE'
       AND NOT EXISTS(
         SELECT 1 FROM dynasty_members monarch
          WHERE monarch.dynasty_id=target.dynasty_id AND monarch.status='ALIVE' AND monarch.is_monarch=TRUE
       );

    UPDATE dynasty_members heir SET is_heir=TRUE,updated_at=NOW()
      FROM kangju_dynasty_targets_v199 target
     WHERE heir.dynasty_id=target.dynasty_id AND lower(heir.name)=lower('Bessos Kangju')
       AND heir.status='ALIVE'
       AND NOT EXISTS(
         SELECT 1 FROM dynasty_members current_heir
          WHERE current_heir.dynasty_id=target.dynasty_id AND current_heir.status='ALIVE' AND current_heir.is_heir=TRUE
       );

    INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,details)
    SELECT target.dynasty_id,target.current_turn,'FAMILY_ROSTER_INITIALIZED',
           jsonb_build_object('source','KANGJU_HOUSEHOLD_REPAIR_V199','memberCount',8)
      FROM kangju_dynasty_targets_v199 target
     WHERE NOT EXISTS(
       SELECT 1 FROM dynasty_events event
        WHERE event.dynasty_id=target.dynasty_id
          AND event.details->>'source'='KANGJU_HOUSEHOLD_REPAIR_V199'
     );
  `
} as const;
