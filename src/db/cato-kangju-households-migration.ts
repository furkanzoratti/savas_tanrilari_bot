export const catoKangjuHouseholdsMigration={
  version:197,
  name:"cato_and_kangju_households",
  sql:`
    CREATE TEMP TABLE cato_family_targets_v197 ON COMMIT DROP AS
    SELECT family.id AS family_id,guild.current_turn
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id AND republic.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=republic.guild_id
     WHERE lower(family.name)=lower('Cato ailesi')
       AND family.status='ACTIVE'
       AND NOT EXISTS(SELECT 1 FROM roman_family_members member WHERE member.family_id=family.id);

    CREATE TEMP TABLE cato_family_seed_v197(
      member_key TEXT PRIMARY KEY,member_name TEXT NOT NULL,gender TEXT NOT NULL,age INTEGER NOT NULL,
      position TEXT NOT NULL,relation TEXT NOT NULL,spouse_key TEXT,mother_key TEXT,father_key TEXT,sort_order INTEGER NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO cato_family_seed_v197 VALUES
      ('head','Marcus Porcius Cato','MALE',49,'HEAD','Pater Familias, Senatör','spouse','head_mother',NULL,1),
      ('spouse','Licinia Crassa','FEMALE',41,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('child_one','Marcus Porcius Cato Licinianus','MALE',22,'CHILD','Yöneticinin oğlu ve varisi',NULL,'spouse','head',3),
      ('child_two','Porcia Catonis','FEMALE',19,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('child_three','Gaius Porcius Cato','MALE',16,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',5),
      ('head_mother','Porcia Maior','FEMALE',68,'PARENT','Yöneticinin annesi',NULL,NULL,NULL,6),
      ('head_brother','Lucius Porcius Cato','MALE',45,'HEAD_SIBLING','Yöneticinin erkek kardeşi',NULL,'head_mother',NULL,7),
      ('spouse_brother','Publius Licinius Crassus','MALE',38,'SPOUSE_SIBLING','Yönetici eşinin erkek kardeşi',NULL,NULL,NULL,8);

    INSERT INTO roman_family_members(
      family_id,birth_family_id,name,gender,age,position,relation,status,health,born_turn,sort_order
    )
    SELECT target.family_id,target.family_id,seed.member_name,seed.gender,seed.age,seed.position,seed.relation,
           'ALIVE','HEALTHY',target.current_turn-seed.age,seed.sort_order
      FROM cato_family_targets_v197 target CROSS JOIN cato_family_seed_v197 seed
    ON CONFLICT(family_id,lower(name)) DO NOTHING;

    UPDATE roman_family_members member
       SET spouse_id=spouse.id,mother_id=mother.id,father_id=father.id,updated_at=NOW()
      FROM cato_family_targets_v197 target
      JOIN cato_family_seed_v197 seed ON TRUE
      LEFT JOIN cato_family_seed_v197 spouse_seed ON spouse_seed.member_key=seed.spouse_key
      LEFT JOIN cato_family_seed_v197 mother_seed ON mother_seed.member_key=seed.mother_key
      LEFT JOIN cato_family_seed_v197 father_seed ON father_seed.member_key=seed.father_key
      LEFT JOIN roman_family_members spouse ON spouse.family_id=target.family_id AND lower(spouse.name)=lower(spouse_seed.member_name)
      LEFT JOIN roman_family_members mother ON mother.family_id=target.family_id AND lower(mother.name)=lower(mother_seed.member_name)
      LEFT JOIN roman_family_members father ON father.family_id=target.family_id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.family_id=target.family_id AND lower(member.name)=lower(seed.member_name);

    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT country.guild_id,country.id,'Kangju Kraliyet Hanesi','system:cato-kangju-households-v197'
      FROM countries country
     WHERE lower(country.name)=lower('Kangju Konfederasyonu') AND country.status='ACTIVE'
    ON CONFLICT(country_id) DO NOTHING;

    CREATE TEMP TABLE kangju_dynasty_targets_v197 ON COMMIT DROP AS
    SELECT dynasty.id AS dynasty_id,guild.current_turn
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN guilds guild ON guild.discord_id=dynasty.guild_id
     WHERE lower(country.name)=lower('Kangju Konfederasyonu')
       AND country.status='ACTIVE'
       AND NOT EXISTS(SELECT 1 FROM dynasty_members member WHERE member.dynasty_id=dynasty.id);

    UPDATE dynasties dynasty SET name='Kangju Kraliyet Hanesi',updated_at=NOW()
      FROM kangju_dynasty_targets_v197 target WHERE dynasty.id=target.dynasty_id;

    CREATE TEMP TABLE kangju_dynasty_seed_v197(
      member_key TEXT PRIMARY KEY,member_name TEXT NOT NULL,gender TEXT NOT NULL,age INTEGER NOT NULL,
      title TEXT NOT NULL,relation TEXT NOT NULL,is_monarch BOOLEAN NOT NULL,is_heir BOOLEAN NOT NULL,
      succession_rank INTEGER,spouse_key TEXT,mother_key TEXT,father_key TEXT
    ) ON COMMIT DROP;
    INSERT INTO kangju_dynasty_seed_v197 VALUES
      ('head','Spitamenes Kangju','MALE',46,'Kangju Kralı','Hükümdar',TRUE,FALSE,NULL,'spouse','head_mother','head_father'),
      ('spouse','Roxana Kangju','FEMALE',39,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'head',NULL,NULL),
      ('heir','Bessos Kangju','MALE',19,'Veliaht','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'spouse','head'),
      ('daughter','Stateira Kangju','FEMALE',16,'Prenses','Hükümdarın kızı',FALSE,FALSE,2,NULL,'spouse','head'),
      ('head_father','Oxyartes Kangju','MALE',70,'Eski Kral','Hükümdarın babası',FALSE,FALSE,NULL,'head_mother',NULL,NULL),
      ('head_mother','Apama Kangju','FEMALE',66,'Ana Kraliçe','Hükümdarın annesi',FALSE,FALSE,NULL,'head_father',NULL,NULL),
      ('head_brother','Arsames Kangju','MALE',42,'Prens','Hükümdarın erkek kardeşi',FALSE,FALSE,3,NULL,'head_mother','head_father'),
      ('head_sister','Barsine Kangju','FEMALE',37,'Prenses','Hükümdarın kız kardeşi',FALSE,FALSE,4,NULL,'head_mother','head_father');

    INSERT INTO dynasty_members(
      dynasty_id,birth_dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
      succession_rank,born_turn
    )
    SELECT target.dynasty_id,target.dynasty_id,seed.member_name,seed.gender,seed.age,seed.title,seed.relation,
           'ALIVE','HEALTHY',seed.is_monarch,seed.is_heir,seed.succession_rank,target.current_turn-seed.age
      FROM kangju_dynasty_targets_v197 target CROSS JOIN kangju_dynasty_seed_v197 seed;

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,mother_id=mother.id,father_id=father.id,updated_at=NOW()
      FROM kangju_dynasty_targets_v197 target
      JOIN kangju_dynasty_seed_v197 seed ON TRUE
      LEFT JOIN kangju_dynasty_seed_v197 spouse_seed ON spouse_seed.member_key=seed.spouse_key
      LEFT JOIN kangju_dynasty_seed_v197 mother_seed ON mother_seed.member_key=seed.mother_key
      LEFT JOIN kangju_dynasty_seed_v197 father_seed ON father_seed.member_key=seed.father_key
      LEFT JOIN dynasty_members spouse ON spouse.dynasty_id=target.dynasty_id AND lower(spouse.name)=lower(spouse_seed.member_name)
      LEFT JOIN dynasty_members mother ON mother.dynasty_id=target.dynasty_id AND lower(mother.name)=lower(mother_seed.member_name)
      LEFT JOIN dynasty_members father ON father.dynasty_id=target.dynasty_id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);

    INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,details)
    SELECT target.dynasty_id,target.current_turn,'FAMILY_ROSTER_INITIALIZED',
           jsonb_build_object('source','CATO_KANGJU_HOUSEHOLDS_V197','memberCount',8)
      FROM kangju_dynasty_targets_v197 target;
  `
} as const;
