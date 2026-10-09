import {ROMAN_PLAYER_FAMILY_MEMBERS} from "../domain/roman-family-seed.js";

const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const rosterValues=ROMAN_PLAYER_FAMILY_MEMBERS.map((member)=>
  `(${quote(member.familyName)},${quote(member.key)},${quote(member.name)},${quote(member.gender)},${member.age},`+
  `${quote(member.position)},${quote(member.relation)},${member.spouseKey?quote(member.spouseKey):"NULL"},`+
  `${member.motherKey?quote(member.motherKey):"NULL"},${member.fatherKey?quote(member.fatherKey):"NULL"},${member.sortOrder})`
).join(",\n      ");

export const romanFamilyLifecycleMigration={
  version:161,
  name:"roman_family_lifecycle_and_player_rosters",
  sql:`
    ALTER TABLE roman_family_members DROP CONSTRAINT IF EXISTS roman_family_members_position_check;
    ALTER TABLE roman_family_members ADD CONSTRAINT roman_family_members_position_check
      CHECK(position IN ('HEAD','SPOUSE','CHILD','PARENT','HEAD_SIBLING','SPOUSE_SIBLING','HOUSEHOLD'));
    ALTER TABLE roman_family_members DROP CONSTRAINT IF EXISTS roman_family_members_age_check;
    ALTER TABLE roman_family_members ADD CONSTRAINT roman_family_members_age_check CHECK(age BETWEEN 0 AND 120);
    ALTER TABLE roman_family_members ADD COLUMN IF NOT EXISTS health TEXT NOT NULL DEFAULT 'HEALTHY';
    ALTER TABLE roman_family_members DROP CONSTRAINT IF EXISTS roman_family_members_health_check;
    ALTER TABLE roman_family_members ADD CONSTRAINT roman_family_members_health_check CHECK(health IN ('HEALTHY','SICK'));
    ALTER TABLE roman_family_members ADD COLUMN IF NOT EXISTS sick_until_turn INTEGER;
    ALTER TABLE roman_family_members ADD COLUMN IF NOT EXISTS born_turn INTEGER;
    ALTER TABLE roman_family_members ADD COLUMN IF NOT EXISTS died_turn INTEGER;
    ALTER TABLE roman_family_members ADD COLUMN IF NOT EXISTS death_reason TEXT;

    CREATE TABLE IF NOT EXISTS roman_family_lifecycle_runs(
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK(game_turn>=1),
      aged_members INTEGER NOT NULL DEFAULT 0 CHECK(aged_members>=0),
      birth_attempts INTEGER NOT NULL DEFAULT 0 CHECK(birth_attempts>=0),
      births INTEGER NOT NULL DEFAULT 0 CHECK(births>=0),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(family_id,game_turn)
    );

    CREATE TABLE IF NOT EXISTS roman_family_couple_birth_attempts(
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      first_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      second_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      last_attempt_turn INTEGER NOT NULL CHECK(last_attempt_turn>=1),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(family_id,first_member_id,second_member_id),
      CHECK(first_member_id<>second_member_id)
    );

    CREATE TEMP TABLE roman_player_family_roster_seed_v161(
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
    INSERT INTO roman_player_family_roster_seed_v161 VALUES
      ${rosterValues};

    INSERT INTO roman_family_members(family_id,name,gender,age,position,relation,sort_order)
    SELECT family.id,seed.member_name,seed.gender,seed.age,seed.position,seed.relation,seed.sort_order
      FROM roman_player_family_roster_seed_v161 seed
      JOIN roman_republics republic ON republic.status='ACTIVE'
      JOIN roman_families family ON family.republic_id=republic.id AND family.name=seed.family_name
    ON CONFLICT(family_id,lower(name)) DO UPDATE SET
      gender=EXCLUDED.gender,age=EXCLUDED.age,position=EXCLUDED.position,
      relation=EXCLUDED.relation,sort_order=EXCLUDED.sort_order,status='ALIVE',updated_at=NOW();

    UPDATE roman_family_members member
       SET spouse_id=spouse.id,mother_id=mother.id,father_id=father.id,updated_at=NOW()
      FROM roman_families family
      JOIN roman_player_family_roster_seed_v161 seed ON seed.family_name=family.name
      LEFT JOIN roman_player_family_roster_seed_v161 spouse_seed
        ON spouse_seed.family_name=seed.family_name AND spouse_seed.member_key=seed.spouse_key
      LEFT JOIN roman_player_family_roster_seed_v161 mother_seed
        ON mother_seed.family_name=seed.family_name AND mother_seed.member_key=seed.mother_key
      LEFT JOIN roman_player_family_roster_seed_v161 father_seed
        ON father_seed.family_name=seed.family_name AND father_seed.member_key=seed.father_key
      LEFT JOIN roman_family_members spouse
        ON spouse.family_id=family.id AND lower(spouse.name)=lower(spouse_seed.member_name)
      LEFT JOIN roman_family_members mother
        ON mother.family_id=family.id AND lower(mother.name)=lower(mother_seed.member_name)
      LEFT JOIN roman_family_members father
        ON father.family_id=family.id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.family_id=family.id AND lower(member.name)=lower(seed.member_name);
  `
} as const;
