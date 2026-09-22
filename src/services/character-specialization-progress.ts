import type { DbClient } from "../db/pool.js";
import { specializationLevel, type CharacterSpecialization } from "../domain/characters.js";

export async function awardCharacterSpecializationProgress(
  client: DbClient,
  characterId: string,
  specialization: CharacterSpecialization
): Promise<number> {
  const character = (await client.query<{ specialization: CharacterSpecialization | null; specialization_choice_credit: number }>(
    "SELECT specialization,specialization_choice_credit FROM country_characters WHERE id=$1 FOR UPDATE",
    [characterId]
  )).rows[0];
  if (!character || (character.specialization && character.specialization !== specialization)) return 0;
  const progress = Number((await client.query<{ successes: number }>(
    `INSERT INTO character_specialization_progress(character_id,specialization,successes)
     VALUES($1,$2,1)
     ON CONFLICT(character_id,specialization) DO UPDATE
       SET successes=character_specialization_progress.successes+1
     RETURNING successes`,
    [characterId,specialization]
  )).rows[0]!.successes);
  if (character.specialization === specialization) {
    await client.query(
      "UPDATE country_characters SET specialization_progress=$1,specialization_level=$2 WHERE id=$3",
      [progress,specializationLevel(progress),characterId]
    );
  } else {
    await client.query(
      "UPDATE country_characters SET specialization_progress=GREATEST(specialization_progress,$1+specialization_choice_credit) WHERE id=$2",
      [progress,characterId]
    );
  }
  return progress+Number(character.specialization_choice_credit??0);
}

export async function chooseCharacterSpecialization(
  client: DbClient,
  characterId: string,
  specialization: CharacterSpecialization
): Promise<number> {
  const character = (await client.query<{ specialization: CharacterSpecialization | null; specialization_choice_credit: number }>(
    "SELECT specialization,specialization_choice_credit FROM country_characters WHERE id=$1 FOR UPDATE",
    [characterId]
  )).rows[0];
  if (!character) return 0;
  if (character.specialization) return -1;
  const branch = Number((await client.query<{ successes: number }>(
    "SELECT successes FROM character_specialization_progress WHERE character_id=$1 AND specialization=$2",
    [characterId,specialization]
  )).rows[0]?.successes??0);
  const progress = branch+Number(character.specialization_choice_credit??0);
  if (progress<3) return progress;
  await client.query(
    `INSERT INTO character_specialization_progress(character_id,specialization,successes)
     VALUES($1,$2,$3)
     ON CONFLICT(character_id,specialization) DO UPDATE SET successes=GREATEST(character_specialization_progress.successes,EXCLUDED.successes)`,
    [characterId,specialization,progress]
  );
  await client.query(
    `UPDATE country_characters
        SET specialization=$1,specialization_progress=$2,specialization_level=$3,specialization_choice_credit=0
      WHERE id=$4`,
    [specialization,progress,specializationLevel(progress),characterId]
  );
  return progress;
}
