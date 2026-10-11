export const steppeTitleDynastiesMigration={
  version:179,
  name:"steppe_title_family_trees",
  sql:`
    ALTER TABLE dynasties
      ADD COLUMN IF NOT EXISTS steppe_title_id UUID REFERENCES steppe_internal_titles(id) ON DELETE CASCADE;

    ALTER TABLE dynasties DROP CONSTRAINT IF EXISTS dynasties_country_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS dynasties_one_country_house_idx
      ON dynasties(country_id) WHERE steppe_title_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS dynasties_one_steppe_title_house_idx
      ON dynasties(steppe_title_id) WHERE steppe_title_id IS NOT NULL;

    INSERT INTO dynasties(guild_id,country_id,steppe_title_id,name,created_by)
    SELECT confederation.guild_id,confederation.country_id,title.id,
           LEFT(CASE WHEN title.tier='KHAN'
             THEN title.holder_name||' Han Hanesi'
             ELSE title.holder_name||' Hanesi' END,80),
           'system:steppe-title-families-v179'
      FROM steppe_internal_titles title
      JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
     WHERE title.status='ACTIVE' AND confederation.status='ACTIVE'
    ON CONFLICT(steppe_title_id) WHERE steppe_title_id IS NOT NULL DO NOTHING;

    INSERT INTO dynasty_members(
      dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,succession_rank,born_turn
    )
    SELECT dynasty.id,title.holder_name,'MALE',NULL,
           title.title_name,'Hane Reisi','ALIVE','HEALTHY',TRUE,FALSE,NULL,
           NULL
      FROM dynasties dynasty
      JOIN steppe_internal_titles title ON title.id=dynasty.steppe_title_id
     WHERE NOT EXISTS(SELECT 1 FROM dynasty_members member WHERE member.dynasty_id=dynasty.id);

    INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,member_id,details)
    SELECT dynasty.id,guild.current_turn,'DYNASTY_CREATED',member.id,
           jsonb_build_object('name',dynasty.name,'source','STEPPE_TITLE_FAMILY','titleId',title.id,'titleName',title.title_name)
      FROM dynasties dynasty
      JOIN steppe_internal_titles title ON title.id=dynasty.steppe_title_id
      JOIN guilds guild ON guild.discord_id=dynasty.guild_id
      JOIN dynasty_members member ON member.dynasty_id=dynasty.id AND member.is_monarch=TRUE
     WHERE NOT EXISTS(
       SELECT 1 FROM dynasty_events event
        WHERE event.dynasty_id=dynasty.id AND event.event_type='DYNASTY_CREATED'
     );
  `
} as const;
