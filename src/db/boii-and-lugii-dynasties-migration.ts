export const boiiAndLugiiDynastiesMigration={
  version:115,
  name:"boii_age_correction_and_lugii_dynasty",
  sql:`
    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT country.guild_id,country.id,
           CASE WHEN lower(country.name)=lower('Boylar') THEN 'Boii Hanedanı' ELSE 'Lugii Hanedanı' END,
           'system:boii-lugii-v115'
      FROM countries country
     WHERE lower(country.name) IN (lower('Boylar'),lower('Lugiler'))
    ON CONFLICT(country_id) DO UPDATE SET
      name=EXCLUDED.name,updated_at=NOW();

    CREATE TEMP TABLE boii_lugii_members_v115(
      country_name TEXT NOT NULL,
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
      PRIMARY KEY(country_name,member_key)
    ) ON COMMIT DROP;

    INSERT INTO boii_lugii_members_v115(
      country_name,member_key,member_name,gender,age,title,relation,is_monarch,is_heir,
      succession_rank,spouse_key,mother_key,father_key
    ) VALUES
      ('Boylar','critasiros','Critasiros Boii','MALE',56,'Kral','Hükümdar',TRUE,FALSE,NULL,'sirona_boii',NULL,NULL),
      ('Boylar','sirona_boii','Sirona Boii','FEMALE',54,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'critasiros',NULL,NULL),
      ('Boylar','epona','Epona Boii','FEMALE',38,'Prenses','Hükümdarın kızı',FALSE,FALSE,1,NULL,'sirona_boii','critasiros'),
      ('Boylar','fiona','Fiona Boii','FEMALE',35,'Prenses','Hükümdarın kızı',FALSE,FALSE,2,NULL,'sirona_boii','critasiros'),
      ('Boylar','stannislaw','Stannislaw Boii','MALE',32,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'sirona_boii','critasiros'),
      ('Boylar','alaric','Alaric Boii','MALE',29,'Prens','Hükümdarın oğlu',FALSE,FALSE,4,NULL,'sirona_boii','critasiros'),
      ('Boylar','brennus','Brennus Boii','MALE',27,'Prens','Hükümdarın oğlu',FALSE,FALSE,5,NULL,'sirona_boii','critasiros'),

      ('Lugiler','leubogast','Leubogast','MALE',52,'Kral','Hükümdar',TRUE,FALSE,NULL,'camma',NULL,NULL),
      ('Lugiler','camma','Camma','FEMALE',50,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'leubogast',NULL,NULL),
      ('Lugiler','ariovist','Ariovist','MALE',34,'Prens','Hükümdarın oğlu',FALSE,FALSE,1,NULL,'camma','leubogast'),
      ('Lugiler','segestes','Segestes','MALE',29,'Prens','Hükümdarın oğlu',FALSE,FALSE,2,NULL,'camma','leubogast'),
      ('Lugiler','ganna','Ganna','FEMALE',31,'Prenses','Hükümdarın kızı',FALSE,FALSE,3,NULL,'camma','leubogast'),
      ('Lugiler','sirona_lugii','Sirona','FEMALE',27,'Prenses','Hükümdarın kızı',FALSE,FALSE,4,NULL,'camma','leubogast');

    UPDATE dynasty_members member
       SET is_monarch=FALSE,is_heir=FALSE,updated_at=NOW()
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
     WHERE member.dynasty_id=dynasty.id
       AND lower(country.name) IN (lower('Boylar'),lower('Lugiler'));

    UPDATE dynasty_members member
       SET age=seed.age,title=seed.title,relation=seed.relation,status='ALIVE',health='HEALTHY',
           sick_until_turn=NULL,is_monarch=seed.is_monarch,is_heir=seed.is_heir,
           succession_rank=seed.succession_rank,born_turn=guild.current_turn-seed.age,
           died_turn=NULL,death_reason=NULL,updated_at=NOW()
      FROM boii_lugii_members_v115 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name)
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN dynasties dynasty ON dynasty.country_id=country.id
     WHERE member.dynasty_id=dynasty.id AND lower(member.name)=lower(seed.member_name);

    INSERT INTO dynasty_members(
      dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
      succession_rank,born_turn
    )
    SELECT dynasty.id,seed.member_name,seed.gender,seed.age,seed.title,seed.relation,
           'ALIVE','HEALTHY',seed.is_monarch,seed.is_heir,seed.succession_rank,
           guild.current_turn-seed.age
      FROM boii_lugii_members_v115 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name)
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN dynasties dynasty ON dynasty.country_id=country.id
    ON CONFLICT(dynasty_id,lower(name)) DO NOTHING;

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,updated_at=NOW()
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN boii_lugii_members_v115 seed ON lower(seed.country_name)=lower(country.name)
      JOIN boii_lugii_members_v115 spouse_seed
        ON spouse_seed.country_name=seed.country_name AND spouse_seed.member_key=seed.spouse_key
      JOIN dynasty_members spouse
        ON spouse.dynasty_id=dynasty.id AND lower(spouse.name)=lower(spouse_seed.member_name)
     WHERE member.dynasty_id=dynasty.id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET mother_id=mother.id,updated_at=NOW()
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN boii_lugii_members_v115 seed ON lower(seed.country_name)=lower(country.name)
      JOIN boii_lugii_members_v115 mother_seed
        ON mother_seed.country_name=seed.country_name AND mother_seed.member_key=seed.mother_key
      JOIN dynasty_members mother
        ON mother.dynasty_id=dynasty.id AND lower(mother.name)=lower(mother_seed.member_name)
     WHERE member.dynasty_id=dynasty.id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET father_id=father.id,updated_at=NOW()
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN boii_lugii_members_v115 seed ON lower(seed.country_name)=lower(country.name)
      JOIN boii_lugii_members_v115 father_seed
        ON father_seed.country_name=seed.country_name AND father_seed.member_key=seed.father_key
      JOIN dynasty_members father
        ON father.dynasty_id=dynasty.id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.dynasty_id=dynasty.id AND lower(member.name)=lower(seed.member_name);
  `
} as const;
