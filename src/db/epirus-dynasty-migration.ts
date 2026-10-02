export const epirusDynastyMigration={
  version:112,
  name:"epirus_aiakid_dynasty_roster",
  sql:`
    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT country.guild_id,country.id,'Aiakid Hanedanı','system:epirus-dynasty-v112'
      FROM countries country
     WHERE lower(country.name)=lower('Epir')
    ON CONFLICT(country_id) DO NOTHING;

    CREATE TEMP TABLE epirus_dynasty_targets_v112 ON COMMIT DROP AS
    SELECT dynasty.id AS dynasty_id,guild.current_turn
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE lower(country.name)=lower('Epir')
       AND NOT EXISTS(
         SELECT 1 FROM dynasty_members member WHERE member.dynasty_id=dynasty.id
       );

    UPDATE dynasties dynasty
       SET name='Aiakid Hanedanı',updated_at=NOW()
      FROM epirus_dynasty_targets_v112 target
     WHERE dynasty.id=target.dynasty_id;

    INSERT INTO dynasty_members(
      dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
      succession_rank,born_turn
    )
    SELECT target.dynasty_id,seed.name,seed.gender,seed.age,seed.title,seed.relation,
           'ALIVE','HEALTHY',seed.is_monarch,seed.is_heir,seed.succession_rank,
           target.current_turn-seed.age
      FROM epirus_dynasty_targets_v112 target
      CROSS JOIN (VALUES
        ('I. Pyrrhos Aiakid','MALE',48,'Kral','Hükümdar',TRUE,FALSE,NULL::integer),
        ('Lanassa Aiakid','FEMALE',42,'Kraliçe','Hükümdarın eşi',FALSE,FALSE,NULL::integer),
        ('Ptolemaios Aiakid','MALE',24,'Veliaht Prens','Hükümdarın oğlu',FALSE,TRUE,1),
        ('Olympias Aiakid','FEMALE',22,'Prenses','Hükümdarın kızı',FALSE,FALSE,2),
        ('Alexandros Aiakid','MALE',20,'Prens','Hükümdarın oğlu',FALSE,FALSE,3),
        ('Helenos Aiakid','MALE',17,'Prens','Hükümdarın oğlu',FALSE,FALSE,4)
      ) AS seed(name,gender,age,title,relation,is_monarch,is_heir,succession_rank);

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,updated_at=NOW()
      FROM epirus_dynasty_targets_v112 target,dynasty_members spouse
     WHERE member.dynasty_id=target.dynasty_id
       AND spouse.dynasty_id=target.dynasty_id
       AND (
         (member.name='I. Pyrrhos Aiakid' AND spouse.name='Lanassa Aiakid') OR
         (member.name='Lanassa Aiakid' AND spouse.name='I. Pyrrhos Aiakid')
       );

    UPDATE dynasty_members child
       SET mother_id=mother.id,father_id=father.id,updated_at=NOW()
      FROM epirus_dynasty_targets_v112 target
      JOIN dynasty_members mother
        ON mother.dynasty_id=target.dynasty_id AND mother.name='Lanassa Aiakid'
      JOIN dynasty_members father
        ON father.dynasty_id=target.dynasty_id AND father.name='I. Pyrrhos Aiakid'
     WHERE child.dynasty_id=target.dynasty_id
       AND child.name IN (
         'Ptolemaios Aiakid','Olympias Aiakid','Alexandros Aiakid','Helenos Aiakid'
       );
  `
} as const;
