export const activeCountryDynastiesMigration={
  version:223,
  name:"complete_active_country_dynasties",
  sql:`
    CREATE TEMP TABLE active_dynasty_seeds_v223(
      country_name TEXT PRIMARY KEY,
      dynasty_name TEXT NOT NULL,
      ruler_name TEXT NOT NULL,
      spouse_name TEXT NOT NULL,
      heir_name TEXT NOT NULL,
      daughter_name TEXT NOT NULL,
      brother_name TEXT NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO active_dynasty_seeds_v223 VALUES
      ('Baykal Devleti','Selenge Hanedanı','Bayan Selenge','Altani Selenge','Batu Selenge','Sarana Selenge','Temür Selenge'),
      ('Butan','Wangchuk Hanedanı','Jigme Wangchuk','Pema Wangchuk','Ugyen Wangchuk','Choden Wangchuk','Sangay Wangchuk'),
      ('Büyük Britanya','York Hanedanı','Ecbert York','Cecilia York','Aethelwulf York','Alysia York','Cedric York'),
      ('Getika','Dromikhaitid Hanedanı','Dromikhaites Getid','Meda Getid','Cothelas Getid','Bendis Getid','Dapyx Getid'),
      ('Hangay Devleti','Khongor Hanedanı','Mergen Khongor','Sarangerel Khongor','Boro Khongor','Altantsetseg Khongor','Arban Khongor'),
      ('Hulun Devleti','Ergün Hanedanı','Qara Ergün','Ujin Ergün','Tögüs Ergün','Alun Ergün','Buka Ergün'),
      ('İberya','Arganthonid Hanedanı','Arganthonios İber','Nikaia İber','Istolatius İber','Himilke İber','Indortes İber'),
      ('Kaşgar','Shule Hanedanı','Cheng Shule','Yutian Shule','Zhong Shule','Anxi Shule','Weitou Shule'),
      ('Khentii Devleti','Börtegin Hanedanı','Arslan Börtegin','Börte Börtegin','Tuman Börtegin','Alangua Börtegin','Kök Börtegin'),
      ('Khingan Devleti','Shiwei Hanedanı','Wulu Shiwei','Hulan Shiwei','Tuoba Shiwei','Yelü Shiwei','Muchen Shiwei'),
      ('Kimbritanya','Ascaucalid Hanedanı','Guntiar Ascaucalid','Thusnelda Ascaucalid','Segimer Ascaucalid','Albruna Ascaucalid','Inguiomer Ascaucalid'),
      ('Langkasuka','Langkasuka Hanedanı','Bhagadatta Langkasuka','Devi Langkasuka','Adityavarman Langkasuka','Candra Langkasuka','Rudravarman Langkasuka'),
      ('Nil İmparatorluğu','Horusbu Hanedanı','Ramses Horusbu','Nefertari Horusbu','Amunherkhepeshef Horusbu','Meritamen Horusbu','Khaemwaset Horusbu'),
      ('Onon Devleti','Onon Hanedanı','Boro Onon','Yesui Onon','Tolun Onon','Alan Onon','Qulan Onon'),
      ('Persis','Hayyam Hanedanı','Daryuş Hayyam','Zendaya Hayyam','Abbas Hayyam','Atossa Hayyam','Arsames Hayyam'),
      ('Qiang Kabileleri','Rgyalpo Hanedanı','Dondup Rgyalpo','Lhamo Rgyalpo','Tenzin Rgyalpo','Dolma Rgyalpo','Norbu Rgyalpo'),
      ('Sagartiya','Sagartid Hanedanı','Tritantaikhmes Sagartid','Amestris Sagartid','Artasyras Sagartid','Parysatis Sagartid','Arbaces Sagartid'),
      ('Sayan Devleti','Yenisey Hanedanı','Alptigin Yenisey','Ayana Yenisey','Külüg Yenisey','Umay Yenisey','Bars Yenisey'),
      ('Süevler','Hermerik Hanedanı','Hermerik Süev','Sunilda Süev','Rechila Süev','Galswintha Süev','Hunimund Süev'),
      ('Trakya','Odrysid Hanedanı','Seuthes Odrysid','Berenike Odrysid','Kotys Odrysid','Meda Odrysid','Teres Odrysid'),
      ('Usunlar','Kunmo Hanedanı','Nandoumi Kunmo','Jiaohe Kunmo','Liejiaomi Kunmo','Xijun Kunmo','Wengguimi Kunmo');

    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT country.guild_id,country.id,
           LEFT(COALESCE(seed.dynasty_name,
             regexp_replace(country.name,'[[:space:]]+(Devleti|Krallığı|Konfederasyonu|Kabileleri|İmparatorluğu|Ligi)$','','i')||' Hanedanı'),80),
           'SYSTEM:ACTIVE_DYNASTIES_V223'
      FROM countries country
      LEFT JOIN active_dynasty_seeds_v223 seed ON lower(seed.country_name)=lower(country.name)
     WHERE country.status='ACTIVE'
       AND lower(country.name)<>lower('Roma')
       AND COALESCE(country.is_steppe_state,FALSE)=FALSE
       AND NOT EXISTS(
         SELECT 1 FROM dynasties dynasty
          WHERE dynasty.country_id=country.id AND dynasty.steppe_title_id IS NULL
       )
    ON CONFLICT(country_id) WHERE steppe_title_id IS NULL DO NOTHING;

    CREATE TEMP TABLE active_dynasty_targets_v223 ON COMMIT DROP AS
    SELECT dynasty.id AS dynasty_id,country.id AS country_id,country.name AS country_name,
           guild.current_turn,
           COALESCE(seed.ruler_name,
             'I. '||regexp_replace(country.name,'[[:space:]]+(Devleti|Krallığı|Konfederasyonu|Kabileleri|İmparatorluğu|Ligi)$','','i')) AS ruler_name,
           COALESCE(seed.spouse_name,
             regexp_replace(country.name,'[[:space:]]+(Devleti|Krallığı|Konfederasyonu|Kabileleri|İmparatorluğu|Ligi)$','','i')||' Kraliçesi') AS spouse_name,
           COALESCE(seed.heir_name,
             regexp_replace(country.name,'[[:space:]]+(Devleti|Krallığı|Konfederasyonu|Kabileleri|İmparatorluğu|Ligi)$','','i')||' Veliahdı') AS heir_name,
           COALESCE(seed.daughter_name,
             regexp_replace(country.name,'[[:space:]]+(Devleti|Krallığı|Konfederasyonu|Kabileleri|İmparatorluğu|Ligi)$','','i')||' Prensesi') AS daughter_name,
           COALESCE(seed.brother_name,
             regexp_replace(country.name,'[[:space:]]+(Devleti|Krallığı|Konfederasyonu|Kabileleri|İmparatorluğu|Ligi)$','','i')||' Kardeşi') AS brother_name
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id AND country.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=dynasty.guild_id
      LEFT JOIN active_dynasty_seeds_v223 seed ON lower(seed.country_name)=lower(country.name)
     WHERE dynasty.steppe_title_id IS NULL
       AND lower(country.name)<>lower('Roma')
       AND COALESCE(country.is_steppe_state,FALSE)=FALSE
       AND NOT EXISTS(SELECT 1 FROM dynasty_members member WHERE member.dynasty_id=dynasty.id);

    CREATE TEMP TABLE active_dynasty_members_v223(
      dynasty_id UUID NOT NULL,
      current_turn INTEGER NOT NULL,
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
      PRIMARY KEY(dynasty_id,member_key)
    ) ON COMMIT DROP;

    INSERT INTO active_dynasty_members_v223
    SELECT target.dynasty_id,target.current_turn,member.member_key,
           LEFT(CASE member.member_key
             WHEN 'ruler' THEN target.ruler_name
             WHEN 'spouse' THEN target.spouse_name
             WHEN 'heir' THEN target.heir_name
             WHEN 'daughter' THEN target.daughter_name
             ELSE target.brother_name END,80),
           member.gender,member.age,member.title,member.relation,member.is_monarch,
           member.is_heir,member.succession_rank,member.spouse_key,member.mother_key,member.father_key
      FROM active_dynasty_targets_v223 target
      CROSS JOIN (VALUES
        ('ruler','MALE',48,'Hükümdar','Hükümdar',TRUE,FALSE,NULL::integer,'spouse',NULL,NULL),
        ('spouse','FEMALE',41,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL::integer,'ruler',NULL,NULL),
        ('heir','MALE',22,'Veliaht','Hükümdarın oğlu',FALSE,TRUE,1,NULL,'spouse','ruler'),
        ('daughter','FEMALE',18,'Prenses','Hükümdarın kızı',FALSE,FALSE,3,NULL,'spouse','ruler'),
        ('brother','MALE',44,'Prens','Hükümdarın erkek kardeşi',FALSE,FALSE,2,NULL,NULL,NULL)
      ) AS member(member_key,gender,age,title,relation,is_monarch,is_heir,succession_rank,spouse_key,mother_key,father_key);

    INSERT INTO dynasty_members(
      dynasty_id,birth_dynasty_id,name,gender,age,title,relation,status,health,
      is_monarch,is_heir,succession_rank,born_turn,trait_key
    )
    SELECT seed.dynasty_id,seed.dynasty_id,seed.member_name,seed.gender,seed.age,
           seed.title,seed.relation,'ALIVE','HEALTHY',seed.is_monarch,seed.is_heir,
           seed.succession_rank,seed.current_turn-seed.age,
           (ARRAY['ADIL','USTA_IDARECI','STRATEJIST','TICARET_HAMISI','BILGE',
                  'FATIH','ZALIM','COMERT','DINDAR','KURNAZ','DENIZCI','HIRSLI',
                  'SAVURGAN','HASTALIKLI','KARARSIZ','KORKAK'])[1+floor(random()*16)::integer]
      FROM active_dynasty_members_v223 seed
    ON CONFLICT(dynasty_id,lower(name)) DO NOTHING;

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,mother_id=mother.id,father_id=father.id,updated_at=NOW()
      FROM active_dynasty_members_v223 seed
      LEFT JOIN active_dynasty_members_v223 spouse_seed
        ON spouse_seed.dynasty_id=seed.dynasty_id AND spouse_seed.member_key=seed.spouse_key
      LEFT JOIN active_dynasty_members_v223 mother_seed
        ON mother_seed.dynasty_id=seed.dynasty_id AND mother_seed.member_key=seed.mother_key
      LEFT JOIN active_dynasty_members_v223 father_seed
        ON father_seed.dynasty_id=seed.dynasty_id AND father_seed.member_key=seed.father_key
      LEFT JOIN dynasty_members spouse
        ON spouse.dynasty_id=seed.dynasty_id AND lower(spouse.name)=lower(spouse_seed.member_name)
      LEFT JOIN dynasty_members mother
        ON mother.dynasty_id=seed.dynasty_id AND lower(mother.name)=lower(mother_seed.member_name)
      LEFT JOIN dynasty_members father
        ON father.dynasty_id=seed.dynasty_id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.dynasty_id=seed.dynasty_id AND lower(member.name)=lower(seed.member_name);

    INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,details)
    SELECT target.dynasty_id,target.current_turn,'FAMILY_ROSTER_INITIALIZED',
           jsonb_build_object('source','ACTIVE_DYNASTIES_V223','memberCount',5)
      FROM active_dynasty_targets_v223 target
     WHERE NOT EXISTS(
       SELECT 1 FROM dynasty_events event
        WHERE event.dynasty_id=target.dynasty_id AND event.event_type='FAMILY_ROSTER_INITIALIZED'
     );
  `
} as const;
