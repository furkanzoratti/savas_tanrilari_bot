export const scandinavianDynastiesMigration={
  version:203,
  name:"scandinavian_country_dynasties",
  sql:`
    CREATE TEMP TABLE scandinavian_dynasty_countries_v203(
      country_name TEXT PRIMARY KEY,
      seed_key TEXT NOT NULL,
      dynasty_name TEXT NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO scandinavian_dynasty_countries_v203(country_name,seed_key,dynasty_name) VALUES
      ('Kimbriler','CIMBRI','Boiorigid Hanedanı'),
      ('Kimbri Krallığı','CIMBRI','Boiorigid Hanedanı'),
      ('Hedinler','CHAEDINI','Hadding Hanedanı'),
      ('Hedin Krallığı','CHAEDINI','Hadding Hanedanı'),
      ('Chaedinler','CHAEDINI','Hadding Hanedanı'),
      ('Gautlar','GAUT','Hretheling Hanedanı'),
      ('Gaut Krallığı','GAUT','Hretheling Hanedanı'),
      ('Suionlar','SUION','Yngling Hanedanı'),
      ('Suion Krallığı','SUION','Yngling Hanedanı');

    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT country.guild_id,country.id,seed.dynasty_name,'system:scandinavian-dynasties-v203'
      FROM scandinavian_dynasty_countries_v203 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name)
    ON CONFLICT(country_id) WHERE steppe_title_id IS NULL DO NOTHING;

    CREATE TEMP TABLE scandinavian_dynasty_targets_v203 ON COMMIT DROP AS
    SELECT dynasty.id AS dynasty_id,country.id AS country_id,seed.seed_key,seed.dynasty_name,guild.current_turn
      FROM scandinavian_dynasty_countries_v203 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name)
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN dynasties dynasty ON dynasty.country_id=country.id AND dynasty.steppe_title_id IS NULL
     WHERE NOT EXISTS(SELECT 1 FROM dynasty_members member WHERE member.dynasty_id=dynasty.id);

    UPDATE dynasties dynasty
       SET name=target.dynasty_name,updated_at=NOW()
      FROM scandinavian_dynasty_targets_v203 target
     WHERE dynasty.id=target.dynasty_id;

    CREATE TEMP TABLE scandinavian_dynasty_members_v203(
      seed_key TEXT NOT NULL,
      member_key TEXT NOT NULL,
      member_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      age INTEGER NOT NULL,
      title TEXT NOT NULL,
      relation TEXT NOT NULL,
      is_monarch BOOLEAN NOT NULL,
      is_heir BOOLEAN NOT NULL,
      succession_rank INTEGER,
      spouse_key TEXT,
      mother_key TEXT,
      father_key TEXT,
      PRIMARY KEY(seed_key,member_key)
    ) ON COMMIT DROP;

    INSERT INTO scandinavian_dynasty_members_v203(
      seed_key,member_key,member_name,gender,age,title,relation,is_monarch,is_heir,
      succession_rank,spouse_key,mother_key,father_key
    ) VALUES
      ('CIMBRI','boiorix','Boiorix Boiorigid','MALE',48,'Kral','Hükümdar',TRUE,FALSE,NULL,'brunhilda',NULL,NULL),
      ('CIMBRI','brunhilda','Brunhilda Boiorigid','FEMALE',40,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'boiorix',NULL,NULL),
      ('CIMBRI','lugius','Lugius Boiorigid','MALE',24,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'brunhilda','boiorix'),
      ('CIMBRI','claodicus','Claodicus Boiorigid','MALE',21,'Prens','Hükümdarın oğlu',FALSE,FALSE,2,NULL,'brunhilda','boiorix'),
      ('CIMBRI','caesorix','Caesorix Boiorigid','MALE',18,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'brunhilda','boiorix'),
      ('CIMBRI','albruna','Albruna Boiorigid','FEMALE',20,'Prenses','Hükümdarın kızı',FALSE,FALSE,4,NULL,'brunhilda','boiorix'),
      ('CIMBRI','harigast','Harigast Boiorigid','MALE',43,'Prens','Hükümdarın kardeşi',FALSE,FALSE,5,NULL,NULL,NULL),
      ('CIMBRI','ganna','Ganna Boiorigid','FEMALE',38,'Prenses','Hükümdarın kardeşi',FALSE,FALSE,6,NULL,NULL,NULL),

      ('CHAEDINI','hadding','Hadding Hadding','MALE',47,'Kral','Hükümdar',TRUE,FALSE,NULL,'groa',NULL,NULL),
      ('CHAEDINI','groa','Groa Hadding','FEMALE',40,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'hadding',NULL,NULL),
      ('CHAEDINI','gram','Gram Hadding','MALE',22,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'groa','hadding'),
      ('CHAEDINI','signy','Signy Hadding','FEMALE',20,'Prenses','Hükümdarın kızı',FALSE,FALSE,2,NULL,'groa','hadding'),
      ('CHAEDINI','hedin','Hedin Hadding','MALE',17,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'groa','hadding'),
      ('CHAEDINI','svipdag','Svipdag Hadding','MALE',15,'Prens','Hükümdarın oğlu',FALSE,FALSE,4,NULL,'groa','hadding'),
      ('CHAEDINI','hogni','Högni Hadding','MALE',44,'Prens','Hükümdarın kardeşi',FALSE,FALSE,5,NULL,NULL,NULL),
      ('CHAEDINI','hilde','Hilde Hadding','FEMALE',38,'Prenses','Hükümdarın kardeşi',FALSE,FALSE,6,NULL,NULL,NULL),

      ('GAUT','hrethel','Hrethel Hretheling','MALE',52,'Kral','Hükümdar',TRUE,FALSE,NULL,'hygd',NULL,NULL),
      ('GAUT','hygd','Hygd Hretheling','FEMALE',44,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'hrethel',NULL,NULL),
      ('GAUT','hygelac','Hygelac Hretheling','MALE',25,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'hygd','hrethel'),
      ('GAUT','herebeald','Herebeald Hretheling','MALE',23,'Prens','Hükümdarın oğlu',FALSE,FALSE,2,NULL,'hygd','hrethel'),
      ('GAUT','haethcyn','Hæthcyn Hretheling','MALE',20,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'hygd','hrethel'),
      ('GAUT','freawaru','Freawaru Hretheling','FEMALE',18,'Prenses','Hükümdarın kızı',FALSE,FALSE,4,NULL,'hygd','hrethel'),
      ('GAUT','beowulf','Beowulf Hretheling','MALE',16,'Prens','Hükümdarın oğlu',FALSE,FALSE,5,NULL,'hygd','hrethel'),
      ('GAUT','swerting','Swerting Hretheling','MALE',46,'Prens','Hükümdarın kardeşi',FALSE,FALSE,6,NULL,NULL,NULL),

      ('SUION','aun','Aun Yngling','MALE',50,'Kral','Hükümdar',TRUE,FALSE,NULL,'alfhild',NULL,NULL),
      ('SUION','alfhild','Alfhild Yngling','FEMALE',43,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'aun',NULL,NULL),
      ('SUION','egil','Egil Yngling','MALE',25,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'alfhild','aun'),
      ('SUION','ottar','Ottar Yngling','MALE',22,'Prens','Hükümdarın oğlu',FALSE,FALSE,2,NULL,'alfhild','aun'),
      ('SUION','adils','Adils Yngling','MALE',18,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'alfhild','aun'),
      ('SUION','yrsa','Yrsa Yngling','FEMALE',17,'Prenses','Hükümdarın kızı',FALSE,FALSE,4,NULL,'alfhild','aun'),
      ('SUION','domalde','Domalde Yngling','MALE',45,'Prens','Hükümdarın kardeşi',FALSE,FALSE,5,NULL,NULL,NULL),
      ('SUION','disa','Disa Yngling','FEMALE',39,'Prenses','Hükümdarın kardeşi',FALSE,FALSE,6,NULL,NULL,NULL);

    INSERT INTO dynasty_members(
      dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
      succession_rank,born_turn
    )
    SELECT target.dynasty_id,seed.member_name,seed.gender,seed.age,seed.title,seed.relation,
           'ALIVE','HEALTHY',seed.is_monarch,seed.is_heir,seed.succession_rank,
           target.current_turn-seed.age
      FROM scandinavian_dynasty_targets_v203 target
      JOIN scandinavian_dynasty_members_v203 seed ON seed.seed_key=target.seed_key
    ON CONFLICT(dynasty_id,lower(name)) DO NOTHING;

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,updated_at=NOW()
      FROM scandinavian_dynasty_targets_v203 target
      JOIN scandinavian_dynasty_members_v203 seed ON seed.seed_key=target.seed_key
      JOIN scandinavian_dynasty_members_v203 spouse_seed
        ON spouse_seed.seed_key=seed.seed_key AND spouse_seed.member_key=seed.spouse_key
      JOIN dynasty_members spouse
        ON spouse.dynasty_id=target.dynasty_id AND lower(spouse.name)=lower(spouse_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET mother_id=mother.id,updated_at=NOW()
      FROM scandinavian_dynasty_targets_v203 target
      JOIN scandinavian_dynasty_members_v203 seed ON seed.seed_key=target.seed_key
      JOIN scandinavian_dynasty_members_v203 mother_seed
        ON mother_seed.seed_key=seed.seed_key AND mother_seed.member_key=seed.mother_key
      JOIN dynasty_members mother
        ON mother.dynasty_id=target.dynasty_id AND lower(mother.name)=lower(mother_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET father_id=father.id,updated_at=NOW()
      FROM scandinavian_dynasty_targets_v203 target
      JOIN scandinavian_dynasty_members_v203 seed ON seed.seed_key=target.seed_key
      JOIN scandinavian_dynasty_members_v203 father_seed
        ON father_seed.seed_key=seed.seed_key AND father_seed.member_key=seed.father_key
      JOIN dynasty_members father
        ON father.dynasty_id=target.dynasty_id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);
  `
} as const;
