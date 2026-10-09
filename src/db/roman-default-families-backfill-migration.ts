import {DEFAULT_ROMAN_FAMILIES,DEFAULT_ROMAN_NPC_MEMBERS} from "../domain/roman-family-seed.js";

const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const familyValues=DEFAULT_ROMAN_FAMILIES.map((family)=>
  `(${quote(family.name)},${family.seats},${family.influence},${quote(family.bloc)})`
).join(",\n      ");
const memberValues=DEFAULT_ROMAN_NPC_MEMBERS.map((member)=>
  `(${quote(member.familyName)},${quote(member.key)},${quote(member.name)},${quote(member.gender)},${member.age},`+
  `${quote(member.position)},${quote(member.relation)},${member.spouseKey?quote(member.spouseKey):"NULL"},`+
  `${member.motherKey?quote(member.motherKey):"NULL"},${member.fatherKey?quote(member.fatherKey):"NULL"},${member.sortOrder})`
).join(",\n      ");

export const romanDefaultFamiliesBackfillMigration={
  version:159,
  name:"roman_default_families_backfill",
  sql:`
    CREATE TEMP TABLE roman_family_seed_v159(
      family_name TEXT NOT NULL,
      senate_seats INTEGER NOT NULL,
      political_influence INTEGER NOT NULL,
      political_bloc TEXT NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO roman_family_seed_v159 VALUES
      ${familyValues};

    INSERT INTO roman_families(republic_id,name,treasury,political_influence,senate_seats,political_bloc)
    SELECT republic.id,seed.family_name,5000,seed.political_influence,seed.senate_seats,seed.political_bloc
      FROM roman_republics republic
      CROSS JOIN roman_family_seed_v159 seed
     WHERE republic.status='ACTIVE'
    ON CONFLICT(republic_id,name) DO UPDATE SET
      senate_seats=EXCLUDED.senate_seats,
      political_influence=GREATEST(roman_families.political_influence,EXCLUDED.political_influence),
      political_bloc=EXCLUDED.political_bloc,
      updated_at=NOW();

    CREATE TEMP TABLE roman_member_seed_v159(
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
    INSERT INTO roman_member_seed_v159 VALUES
      ${memberValues};

    INSERT INTO roman_family_members(family_id,name,gender,age,position,relation,sort_order)
    SELECT family.id,seed.member_name,seed.gender,seed.age,seed.position,seed.relation,seed.sort_order
      FROM roman_member_seed_v159 seed
      JOIN roman_republics republic ON republic.status='ACTIVE'
      JOIN roman_families family ON family.republic_id=republic.id AND family.name=seed.family_name
    ON CONFLICT(family_id,lower(name)) DO NOTHING;

    UPDATE roman_family_members member
       SET spouse_id=spouse.id,mother_id=mother.id,father_id=father.id,updated_at=NOW()
      FROM roman_families family
      JOIN roman_member_seed_v159 seed ON seed.family_name=family.name
      LEFT JOIN roman_member_seed_v159 spouse_seed
        ON spouse_seed.family_name=seed.family_name AND spouse_seed.member_key=seed.spouse_key
      LEFT JOIN roman_member_seed_v159 mother_seed
        ON mother_seed.family_name=seed.family_name AND mother_seed.member_key=seed.mother_key
      LEFT JOIN roman_member_seed_v159 father_seed
        ON father_seed.family_name=seed.family_name AND father_seed.member_key=seed.father_key
      LEFT JOIN roman_family_members spouse
        ON spouse.family_id=family.id AND lower(spouse.name)=lower(spouse_seed.member_name)
      LEFT JOIN roman_family_members mother
        ON mother.family_id=family.id AND lower(mother.name)=lower(mother_seed.member_name)
      LEFT JOIN roman_family_members father
        ON father.family_id=family.id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.family_id=family.id AND lower(member.name)=lower(seed.member_name);

    INSERT INTO roman_family_relations(republic_id,family_a_id,family_b_id,score,trust,rivalry,last_reason)
    SELECT republic.id,left_family.id,right_family.id,
      CASE
        WHEN left_family.political_bloc=right_family.political_bloc THEN 15
        WHEN left_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND right_family.political_bloc='POPULARES' THEN -20
        WHEN right_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND left_family.political_bloc='POPULARES' THEN -20
        ELSE 0 END,
      CASE WHEN left_family.political_bloc=right_family.political_bloc THEN 60 ELSE 50 END,
      CASE
        WHEN left_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND right_family.political_bloc='POPULARES' THEN 15
        WHEN right_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND left_family.political_bloc='POPULARES' THEN 15
        ELSE 0 END,
      'Başlangıç siyasi hizip dengesi'
      FROM roman_republics republic
      JOIN roman_families left_family ON left_family.republic_id=republic.id AND left_family.status='ACTIVE'
      JOIN roman_families right_family ON right_family.republic_id=republic.id AND right_family.status='ACTIVE' AND left_family.id<right_family.id
     WHERE republic.status='ACTIVE'
    ON CONFLICT DO NOTHING;

    WITH initialized AS(
      UPDATE roman_republics republic
         SET current_consul_family_id=scipio.id,
             term_length=6,
             term_started_turn=guild.current_turn,
             next_election_turn=guild.current_turn+6,
             updated_at=NOW()
        FROM roman_families scipio,guilds guild
       WHERE scipio.republic_id=republic.id
         AND lower(scipio.name)='scipio ailesi'
         AND guild.discord_id=republic.guild_id
         AND republic.status='ACTIVE'
         AND republic.current_consul_family_id IS NULL
      RETURNING republic.id,republic.term_started_turn,republic.next_election_turn,republic.current_consul_family_id
    )
    INSERT INTO roman_republic_events(republic_id,game_turn,event_type,family_id,details)
    SELECT initialized.id,initialized.term_started_turn,'INITIAL_CONSUL_SET',initialized.current_consul_family_id,
      jsonb_build_object('familyName','Scipio ailesi','nextElectionTurn',initialized.next_election_turn,'migration',159)
      FROM initialized;
  `
} as const;
