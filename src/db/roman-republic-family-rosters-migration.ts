export const romanRepublicFamilyRostersMigration={
  version:153,
  name:"roman_republic_family_rosters",
  sql:`
    CREATE TABLE IF NOT EXISTS roman_family_members(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(char_length(name) BETWEEN 2 AND 80),
      gender TEXT NOT NULL CHECK(gender IN ('MALE','FEMALE')),
      age INTEGER NOT NULL CHECK(age BETWEEN 0 AND 100),
      position TEXT NOT NULL CHECK(position IN ('HEAD','SPOUSE','CHILD','HEAD_SIBLING','SPOUSE_SIBLING')),
      relation TEXT NOT NULL CHECK(char_length(relation) BETWEEN 2 AND 120),
      spouse_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL,
      mother_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL,
      father_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'ALIVE' CHECK(status IN ('ALIVE','DEAD')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roman_family_members_name_unique
      ON roman_family_members(family_id,lower(name));
    CREATE INDEX IF NOT EXISTS roman_family_members_family_idx
      ON roman_family_members(family_id,status,sort_order);

    CREATE TEMP TABLE roman_family_roster_seed_v153(
      family_name TEXT NOT NULL,
      member_key TEXT NOT NULL,
      member_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      age INTEGER NOT NULL,
      position TEXT NOT NULL,
      relation TEXT NOT NULL,
      spouse_key TEXT,
      mother_key TEXT,
      father_key TEXT,
      sort_order INTEGER NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO roman_family_roster_seed_v153(
      family_name,member_key,member_name,gender,age,position,relation,spouse_key,mother_key,father_key,sort_order
    ) VALUES
      ('Julius ailesi','head','Gaius Julius Varro','MALE',48,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Julius ailesi','spouse','Aurelia Cotta','FEMALE',42,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Julius ailesi','child_one','Lucius Julius Varro','MALE',20,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Julius ailesi','child_two','Julia Varra','FEMALE',17,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Julius ailesi','head_sibling','Sextus Julius Varro','MALE',44,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Julius ailesi','spouse_sibling','Marcus Aurelius Cotta','MALE',39,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6),

      ('Aemilius ailesi','head','Marcus Aemilius Lepidus','MALE',50,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Aemilius ailesi','spouse','Cornelia Lentula','FEMALE',43,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Aemilius ailesi','child_one','Lucius Aemilius Lepidus','MALE',22,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Aemilius ailesi','child_two','Aemilia Lepida','FEMALE',18,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Aemilius ailesi','head_sibling','Quintus Aemilius Lepidus','MALE',46,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Aemilius ailesi','spouse_sibling','Tertia Cornelia Lentula','FEMALE',38,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6),

      ('Fabius ailesi','head','Quintus Fabius Maximus','MALE',47,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Fabius ailesi','spouse','Livia Drusa','FEMALE',41,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Fabius ailesi','child_one','Marcus Fabius Maximus','MALE',19,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Fabius ailesi','child_two','Fabia Maxima','FEMALE',16,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Fabius ailesi','head_sibling','Kaeso Fabius Maximus','MALE',43,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Fabius ailesi','spouse_sibling','Publius Livius Drusus','MALE',37,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6),

      ('Valerius ailesi','head','Marcus Valerius Messalla','MALE',45,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Valerius ailesi','spouse','Terentia Varrona','FEMALE',39,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Valerius ailesi','child_one','Manius Valerius Messalla','MALE',18,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Valerius ailesi','child_two','Valeria Messalla','FEMALE',14,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Valerius ailesi','head_sibling','Publius Valerius Messalla','MALE',41,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Valerius ailesi','spouse_sibling','Tullia Varrona','FEMALE',35,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6),

      ('Licinius ailesi','head','Publius Licinius Crassus','MALE',46,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Licinius ailesi','spouse','Mucia Tertia','FEMALE',40,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Licinius ailesi','child_one','Gaius Licinius Crassus','MALE',19,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Licinius ailesi','child_two','Licinia Crassa','FEMALE',15,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Licinius ailesi','head_sibling','Lucius Licinius Crassus','MALE',42,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Licinius ailesi','spouse_sibling','Quintus Mucius Tertius','MALE',36,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6),

      ('Junius ailesi','head','Decimus Junius Silanus','MALE',44,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Junius ailesi','spouse','Sempronia Graccha','FEMALE',38,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Junius ailesi','child_one','Marcus Junius Silanus','MALE',17,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Junius ailesi','child_two','Junia Silana','FEMALE',13,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Junius ailesi','head_sibling','Lucius Junius Silanus','MALE',40,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Junius ailesi','spouse_sibling','Gaius Sempronius Gracchus','MALE',34,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6),

      ('Servilius ailesi','head','Gnaeus Servilius Caepio','MALE',49,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Servilius ailesi','spouse','Claudia Pulchra','FEMALE',42,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Servilius ailesi','child_one','Quintus Servilius Caepio','MALE',21,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Servilius ailesi','child_two','Servilia Caepionis','FEMALE',18,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Servilius ailesi','head_sibling','Marcus Servilius Caepio','MALE',45,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Servilius ailesi','spouse_sibling','Appius Claudius Pulcher','MALE',39,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6),

      ('Caecilius ailesi','head','Quintus Caecilius Metellus','MALE',51,'HEAD','Aile yöneticisi','spouse',NULL,NULL,1),
      ('Caecilius ailesi','spouse','Calpurnia Pisona','FEMALE',44,'SPOUSE','Yöneticinin eşi','head',NULL,NULL,2),
      ('Caecilius ailesi','child_one','Lucius Caecilius Metellus','MALE',23,'CHILD','Yöneticinin oğlu',NULL,'spouse','head',3),
      ('Caecilius ailesi','child_two','Caecilia Metella','FEMALE',19,'CHILD','Yöneticinin kızı',NULL,'spouse','head',4),
      ('Caecilius ailesi','head_sibling','Gaius Caecilius Metellus','MALE',47,'HEAD_SIBLING','Yöneticinin kardeşi',NULL,NULL,NULL,5),
      ('Caecilius ailesi','spouse_sibling','Lucius Calpurnius Piso','MALE',40,'SPOUSE_SIBLING','Yönetici eşinin kardeşi',NULL,NULL,NULL,6);

    INSERT INTO roman_families(republic_id,name,treasury,political_influence,senate_seats)
    SELECT DISTINCT republic.id,seed.family_name,5000,0,0
      FROM roman_family_roster_seed_v153 seed
      JOIN roman_republics republic ON republic.status='ACTIVE'
      JOIN countries country ON country.id=republic.country_id
     WHERE lower(country.name) LIKE 'roma%'
    ON CONFLICT(republic_id,name) DO NOTHING;

    INSERT INTO roman_family_members(family_id,name,gender,age,position,relation,sort_order)
    SELECT family.id,seed.member_name,seed.gender,seed.age,seed.position,seed.relation,seed.sort_order
      FROM roman_family_roster_seed_v153 seed
      JOIN roman_republics republic ON republic.status='ACTIVE'
      JOIN countries country ON country.id=republic.country_id AND lower(country.name) LIKE 'roma%'
      JOIN roman_families family ON family.republic_id=republic.id AND family.name=seed.family_name
    ON CONFLICT(family_id,lower(name)) DO NOTHING;

    UPDATE roman_family_members member
       SET spouse_id=spouse.id,updated_at=NOW()
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id
      JOIN countries country ON country.id=republic.country_id AND lower(country.name) LIKE 'roma%'
      JOIN roman_family_roster_seed_v153 seed ON seed.family_name=family.name
      JOIN roman_family_roster_seed_v153 spouse_seed
        ON spouse_seed.family_name=seed.family_name AND spouse_seed.member_key=seed.spouse_key
      JOIN roman_family_members spouse ON spouse.family_id=family.id AND lower(spouse.name)=lower(spouse_seed.member_name)
     WHERE member.family_id=family.id AND lower(member.name)=lower(seed.member_name) AND seed.spouse_key IS NOT NULL;

    UPDATE roman_family_members member
       SET mother_id=mother.id,updated_at=NOW()
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id
      JOIN countries country ON country.id=republic.country_id AND lower(country.name) LIKE 'roma%'
      JOIN roman_family_roster_seed_v153 seed ON seed.family_name=family.name
      JOIN roman_family_roster_seed_v153 mother_seed
        ON mother_seed.family_name=seed.family_name AND mother_seed.member_key=seed.mother_key
      JOIN roman_family_members mother ON mother.family_id=family.id AND lower(mother.name)=lower(mother_seed.member_name)
     WHERE member.family_id=family.id AND lower(member.name)=lower(seed.member_name) AND seed.mother_key IS NOT NULL;

    UPDATE roman_family_members member
       SET father_id=father.id,updated_at=NOW()
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id
      JOIN countries country ON country.id=republic.country_id AND lower(country.name) LIKE 'roma%'
      JOIN roman_family_roster_seed_v153 seed ON seed.family_name=family.name
      JOIN roman_family_roster_seed_v153 father_seed
        ON father_seed.family_name=seed.family_name AND father_seed.member_key=seed.father_key
      JOIN roman_family_members father ON father.family_id=family.id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.family_id=family.id AND lower(member.name)=lower(seed.member_name) AND seed.father_key IS NOT NULL;
  `
} as const;
