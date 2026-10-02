export const additionalDynastyRostersMigration={
  version:113,
  name:"athens_mediterranean_and_regional_dynasty_rosters",
  sql:`
    CREATE TEMP TABLE additional_dynasty_countries_v113(
      country_name TEXT PRIMARY KEY,
      dynasty_name TEXT NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO additional_dynasty_countries_v113(country_name,dynasty_name) VALUES
      ('Atina','Alkmaionid Hanedanı'),
      ('Akdeniz Ligi','Thalassid Hanedanı'),
      ('Skordiskler','Bathanatid Hanedanı'),
      ('Apuller','Daunid Hanedanı'),
      ('Getler','Dromikhaitid Hanedanı'),
      ('Galatya','Deiotarid Hanedanı'),
      ('Pontus','Mithridatid Hanedanı');

    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT country.guild_id,country.id,seed.dynasty_name,'system:additional-dynasties-v113'
      FROM additional_dynasty_countries_v113 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name)
    ON CONFLICT(country_id) DO NOTHING;

    CREATE TEMP TABLE additional_dynasty_targets_v113 ON COMMIT DROP AS
    SELECT dynasty.id AS dynasty_id,country.name AS country_name,guild.current_turn
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN additional_dynasty_countries_v113 seed ON lower(seed.country_name)=lower(country.name)
     WHERE NOT EXISTS(
       SELECT 1 FROM dynasty_members member WHERE member.dynasty_id=dynasty.id
     );

    UPDATE dynasties dynasty
       SET name=seed.dynasty_name,updated_at=NOW()
      FROM additional_dynasty_targets_v113 target
      JOIN additional_dynasty_countries_v113 seed ON lower(seed.country_name)=lower(target.country_name)
     WHERE dynasty.id=target.dynasty_id;

    CREATE TEMP TABLE additional_dynasty_members_v113(
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

    INSERT INTO additional_dynasty_members_v113(
      country_name,member_key,member_name,gender,age,title,relation,is_monarch,is_heir,
      succession_rank,spouse_key,mother_key,father_key
    ) VALUES
      ('Atina','perikles','Perikles Alkmaionid','MALE',46,'Archon','Hükümdar',TRUE,FALSE,NULL,'aspasia',NULL,NULL),
      ('Atina','aspasia','Aspasia Alkmaionid','FEMALE',38,'Archontissa','Hükümdarın eşi',FALSE,FALSE,NULL,'perikles',NULL,NULL),
      ('Atina','paralos','Paralos Alkmaionid','MALE',19,'Veliaht','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'aspasia','perikles'),
      ('Atina','xanthippos','Xanthippos Alkmaionid','MALE',17,'Prens','Hükümdarın oğlu',FALSE,FALSE,2,NULL,'aspasia','perikles'),
      ('Atina','agariste','Agariste Alkmaionid','FEMALE',14,'Prenses','Hükümdarın kızı',FALSE,FALSE,3,NULL,'aspasia','perikles'),

      ('Akdeniz Ligi','leandros','Leandros Thalassid','MALE',43,'Hegemon','Hükümdar',TRUE,FALSE,NULL,'eirene',NULL,NULL),
      ('Akdeniz Ligi','eirene','Eirene Thalassid','FEMALE',36,'Hegemon Eşi','Hükümdarın eşi',FALSE,FALSE,NULL,'leandros',NULL,NULL),
      ('Akdeniz Ligi','nikandros','Nikandros Thalassid','MALE',18,'Veliaht','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'eirene','leandros'),
      ('Akdeniz Ligi','thaleia','Thaleia Thalassid','FEMALE',15,'Prenses','Hükümdarın kızı',FALSE,FALSE,2,NULL,'eirene','leandros'),
      ('Akdeniz Ligi','dorian','Dorian Thalassid','MALE',11,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'eirene','leandros'),

      ('Skordiskler','bathanatos','Bathanatos Skordisk','MALE',45,'Kral','Hükümdar',TRUE,FALSE,NULL,'teuta',NULL,NULL),
      ('Skordiskler','teuta','Teuta Skordisk','FEMALE',38,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'bathanatos',NULL,NULL),
      ('Skordiskler','cavaros','Cavaros Skordisk','MALE',20,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'teuta','bathanatos'),
      ('Skordiskler','andia','Andia Skordisk','FEMALE',17,'Prenses','Hükümdarın kızı',FALSE,FALSE,2,NULL,'teuta','bathanatos'),
      ('Skordiskler','brennos','Brennos Skordisk','MALE',13,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'teuta','bathanatos'),

      ('Apuller','dasius','Dasius Daunid','MALE',42,'Kral','Hükümdar',TRUE,FALSE,NULL,'bircenna',NULL,NULL),
      ('Apuller','bircenna','Bircenna Daunid','FEMALE',35,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'dasius',NULL,NULL),
      ('Apuller','artas','Artas Daunid','MALE',18,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'bircenna','dasius'),
      ('Apuller','opla','Opla Daunid','FEMALE',15,'Prenses','Hükümdarın kızı',FALSE,FALSE,2,NULL,'bircenna','dasius'),
      ('Apuller','messapos','Messapos Daunid','MALE',10,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'bircenna','dasius'),

      ('Getler','dromikhaites','Dromikhaites Getid','MALE',48,'Basileus','Hükümdar',TRUE,FALSE,NULL,'meda',NULL,NULL),
      ('Getler','meda','Meda Getid','FEMALE',40,'Basilissa','Hükümdarın eşi',FALSE,FALSE,NULL,'dromikhaites',NULL,NULL),
      ('Getler','cothelas','Cothelas Getid','MALE',22,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'meda','dromikhaites'),
      ('Getler','zalmodegikos','Zalmodegikos Getid','MALE',18,'Prens','Hükümdarın oğlu',FALSE,FALSE,2,NULL,'meda','dromikhaites'),
      ('Getler','dapyx','Dapyx Getid','MALE',14,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'meda','dromikhaites'),

      ('Galatya','deiotaros','Deiotaros Tolistobog','MALE',46,'Tetrark','Hükümdar',TRUE,FALSE,NULL,'stratonike',NULL,NULL),
      ('Galatya','stratonike','Stratonike Tolistobog','FEMALE',39,'Tetrark Eşi','Hükümdarın eşi',FALSE,FALSE,NULL,'deiotaros',NULL,NULL),
      ('Galatya','brogitaros','Brogitaros Tolistobog','MALE',21,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'stratonike','deiotaros'),
      ('Galatya','adobogiona','Adobogiona Tolistobog','FEMALE',18,'Prenses','Hükümdarın kızı',FALSE,FALSE,2,NULL,'stratonike','deiotaros'),
      ('Galatya','amyntas','Amyntas Tolistobog','MALE',14,'Prens','Hükümdarın oğlu',FALSE,FALSE,3,NULL,'stratonike','deiotaros'),

      ('Pontus','mithridates','I. Mithridates Ktistes','MALE',47,'Kral','Hükümdar',TRUE,FALSE,NULL,'laodike',NULL,NULL),
      ('Pontus','laodike','Laodike Mithridatid','FEMALE',39,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL,'mithridates',NULL,NULL),
      ('Pontus','ariobarzanes','Ariobarzanes Mithridatid','MALE',22,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'laodike','mithridates'),
      ('Pontus','mithridates_ii','II. Mithridates Mithridatid','MALE',18,'Prens','Hükümdarın oğlu',FALSE,FALSE,2,NULL,'laodike','mithridates'),
      ('Pontus','laodike_ii','Laodike Genç','FEMALE',15,'Prenses','Hükümdarın kızı',FALSE,FALSE,3,NULL,'laodike','mithridates');

    INSERT INTO dynasty_members(
      dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
      succession_rank,born_turn
    )
    SELECT target.dynasty_id,seed.member_name,seed.gender,seed.age,seed.title,seed.relation,
           'ALIVE','HEALTHY',seed.is_monarch,seed.is_heir,seed.succession_rank,
           target.current_turn-seed.age
      FROM additional_dynasty_targets_v113 target
      JOIN additional_dynasty_members_v113 seed ON lower(seed.country_name)=lower(target.country_name);

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,updated_at=NOW()
      FROM additional_dynasty_targets_v113 target
      JOIN additional_dynasty_members_v113 seed ON lower(seed.country_name)=lower(target.country_name)
      JOIN additional_dynasty_members_v113 spouse_seed
        ON spouse_seed.country_name=seed.country_name AND spouse_seed.member_key=seed.spouse_key
      JOIN dynasty_members spouse
        ON spouse.dynasty_id=target.dynasty_id AND lower(spouse.name)=lower(spouse_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET mother_id=mother.id,updated_at=NOW()
      FROM additional_dynasty_targets_v113 target
      JOIN additional_dynasty_members_v113 seed ON lower(seed.country_name)=lower(target.country_name)
      JOIN additional_dynasty_members_v113 mother_seed
        ON mother_seed.country_name=seed.country_name AND mother_seed.member_key=seed.mother_key
      JOIN dynasty_members mother
        ON mother.dynasty_id=target.dynasty_id AND lower(mother.name)=lower(mother_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET father_id=father.id,updated_at=NOW()
      FROM additional_dynasty_targets_v113 target
      JOIN additional_dynasty_members_v113 seed ON lower(seed.country_name)=lower(target.country_name)
      JOIN additional_dynasty_members_v113 father_seed
        ON father_seed.country_name=seed.country_name AND father_seed.member_key=seed.father_key
      JOIN dynasty_members father
        ON father.dynasty_id=target.dynasty_id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.dynasty_id=target.dynasty_id AND lower(member.name)=lower(seed.member_name);
  `
} as const;
