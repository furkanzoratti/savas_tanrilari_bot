export const steppeTitleFamilyRostersMigration={
  version:180,
  name:"steppe_title_family_rosters",
  sql:`
    DROP TABLE IF EXISTS steppe_family_targets_v180;
    CREATE TEMP TABLE steppe_family_targets_v180 ON COMMIT DROP AS
    SELECT base.*,
           CASE WHEN lower(base.original_holder_name) IN (lower('Henüz Atanmadı'),lower('Henuz Atanmadi')) THEN
             CASE
               WHEN lower(base.country_name) LIKE '%xiongnu%' THEN (ARRAY['Modu Chanyu','Huyan Tulu','Lan Qutu','Xubu Dulu'])[((base.family_no-1)%4)+1]
               WHEN lower(base.country_name) LIKE '%xianbei%' THEN (ARRAY['Murong Shegui','Tuoba Lin','Yuwen Pugu','Duan Wuchen'])[((base.family_no-1)%4)+1]
               ELSE (ARRAY['Qara Tarkan','Bayan Erkin','Sayan Boro','Kutlug Bars'])[((base.family_no-1)%4)+1]
             END
           ELSE base.original_holder_name END AS root_name
      FROM (
        SELECT dynasty.id AS dynasty_id,title.id AS title_id,title.tier,title.title_name,title.holder_name AS original_holder_name,
               country.name AS country_name,guild.current_turn,
               ROW_NUMBER() OVER(PARTITION BY country.id ORDER BY CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.title_name) AS family_no,
               member.id AS root_id
          FROM dynasties dynasty
          JOIN steppe_internal_titles title ON title.id=dynasty.steppe_title_id AND title.status='ACTIVE'
          JOIN steppe_confederations confederation ON confederation.id=title.confederation_id AND confederation.status='ACTIVE'
          JOIN countries country ON country.id=confederation.country_id
          JOIN guilds guild ON guild.discord_id=confederation.guild_id
          JOIN dynasty_members member ON member.dynasty_id=dynasty.id AND member.is_monarch=TRUE AND member.status='ALIVE'
         WHERE (SELECT COUNT(*) FROM dynasty_members counted WHERE counted.dynasty_id=dynasty.id)=1
      ) base;

    UPDATE steppe_internal_titles title
       SET holder_name=target.root_name,updated_at=NOW()
      FROM steppe_family_targets_v180 target
     WHERE title.id=target.title_id
       AND lower(target.original_holder_name) IN (lower('Henüz Atanmadı'),lower('Henuz Atanmadi'));

    UPDATE dynasties dynasty
       SET name=LEFT(target.root_name||CASE target.tier WHEN 'KHAN' THEN ' Han Hanesi' ELSE ' Hanesi' END,80),updated_at=NOW()
      FROM steppe_family_targets_v180 target
     WHERE dynasty.id=target.dynasty_id
       AND lower(target.original_holder_name) IN (lower('Henüz Atanmadı'),lower('Henuz Atanmadi'));

    UPDATE dynasty_members member
       SET name=target.root_name,
           age=CASE target.tier WHEN 'KHAN' THEN 42 ELSE 38 END,
           born_turn=target.current_turn-CASE target.tier WHEN 'KHAN' THEN 42 ELSE 38 END,
           updated_at=NOW()
      FROM steppe_family_targets_v180 target
     WHERE member.id=target.root_id;

    INSERT INTO dynasty_members(dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,born_turn)
    SELECT target.dynasty_id,
           CASE
             WHEN lower(target.country_name) LIKE '%xiongnu%' THEN (ARRAY['Altani','Borte','Qulan','Yimeng'])[((target.family_no-1)%4)+1]
             WHEN lower(target.country_name) LIKE '%xianbei%' THEN (ARRAY['Murong Lian','Tuoba Yue','Yuwen Lan','Duan Ming'])[((target.family_no-1)%4)+1]
             ELSE (ARRAY['Saran','Ayana','Qulan','Altunai'])[((target.family_no-1)%4)+1]
           END,
           'FEMALE',CASE target.tier WHEN 'KHAN' THEN 36 ELSE 33 END,
           CASE target.tier WHEN 'KHAN' THEN 'Han Eşi' ELSE 'Toprak Ağası Eşi' END,
           'Hane Reisinin Eşi','ALIVE','HEALTHY',FALSE,FALSE,
           target.current_turn-CASE target.tier WHEN 'KHAN' THEN 36 ELSE 33 END
      FROM steppe_family_targets_v180 target;

    INSERT INTO dynasty_members(dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,born_turn)
    SELECT target.dynasty_id,
           CASE
             WHEN lower(target.country_name) LIKE '%xiongnu%' THEN (ARRAY['Touman','Jizhu','Xuluquan','Wuwei'])[((target.family_no-1)%4)+1]
             WHEN lower(target.country_name) LIKE '%xianbei%' THEN (ARRAY['Tulu','Mohan','Kebineng','Pifu'])[((target.family_no-1)%4)+1]
             ELSE (ARRAY['Boro','Tarkan','Erkin','Buka'])[((target.family_no-1)%4)+1]
           END,
           'MALE',CASE target.tier WHEN 'KHAN' THEN 66 ELSE 62 END,
           CASE target.tier WHEN 'KHAN' THEN 'Eski Han' ELSE 'Aksakal' END,
           'Hane Reisinin Babası','ALIVE','HEALTHY',FALSE,FALSE,
           target.current_turn-CASE target.tier WHEN 'KHAN' THEN 66 ELSE 62 END
      FROM steppe_family_targets_v180 target;

    INSERT INTO dynasty_members(dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,born_turn)
    SELECT target.dynasty_id,
           CASE
             WHEN lower(target.country_name) LIKE '%xiongnu%' THEN (ARRAY['Eje','Ulan','Yanzhi','Gua'])[((target.family_no-1)%4)+1]
             WHEN lower(target.country_name) LIKE '%xianbei%' THEN (ARRAY['Aru','Yuehua','Mingzhu','Lanying'])[((target.family_no-1)%4)+1]
             ELSE (ARRAY['Alun','Umay','Ilbilge','Yulduz'])[((target.family_no-1)%4)+1]
           END,
           'FEMALE',CASE target.tier WHEN 'KHAN' THEN 63 ELSE 59 END,
           'Hatun','Hane Reisinin Annesi','ALIVE','HEALTHY',FALSE,FALSE,
           target.current_turn-CASE target.tier WHEN 'KHAN' THEN 63 ELSE 59 END
      FROM steppe_family_targets_v180 target;

    UPDATE dynasty_members root
       SET spouse_id=spouse.id,father_id=father.id,mother_id=mother.id,updated_at=NOW()
      FROM steppe_family_targets_v180 target
      JOIN dynasty_members spouse ON spouse.dynasty_id=target.dynasty_id AND spouse.relation='Hane Reisinin Eşi'
      JOIN dynasty_members father ON father.dynasty_id=target.dynasty_id AND father.relation='Hane Reisinin Babası'
      JOIN dynasty_members mother ON mother.dynasty_id=target.dynasty_id AND mother.relation='Hane Reisinin Annesi'
     WHERE root.id=target.root_id;

    UPDATE dynasty_members spouse
       SET spouse_id=target.root_id,updated_at=NOW()
      FROM steppe_family_targets_v180 target
     WHERE spouse.dynasty_id=target.dynasty_id AND spouse.relation='Hane Reisinin Eşi';

    INSERT INTO dynasty_members(dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,succession_rank,mother_id,father_id,born_turn)
    SELECT target.dynasty_id,
           CASE
             WHEN lower(target.country_name) LIKE '%xiongnu%' THEN (ARRAY['Laoshang','Hulugu','Udan','Woyanqudi'])[((target.family_no-1)%4)+1]
             WHEN lower(target.country_name) LIKE '%xianbei%' THEN (ARRAY['Qifu','Yuwen','Duan','Helian'])[((target.family_no-1)%4)+1]
             ELSE (ARRAY['Kara Boro','Kutlug','Bars','Temur'])[((target.family_no-1)%4)+1]
           END,
           'MALE',CASE target.tier WHEN 'KHAN' THEN 37 ELSE 33 END,
           CASE target.tier WHEN 'KHAN' THEN 'Han Kardeşi' ELSE 'Ağa Kardeşi' END,
           'Hane Reisinin Erkek Kardeşi','ALIVE','HEALTHY',FALSE,FALSE,3,mother.id,father.id,
           target.current_turn-CASE target.tier WHEN 'KHAN' THEN 37 ELSE 33 END
      FROM steppe_family_targets_v180 target
      JOIN dynasty_members father ON father.dynasty_id=target.dynasty_id AND father.relation='Hane Reisinin Babası'
      JOIN dynasty_members mother ON mother.dynasty_id=target.dynasty_id AND mother.relation='Hane Reisinin Annesi';

    INSERT INTO dynasty_members(dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,succession_rank,mother_id,father_id,born_turn)
    SELECT target.dynasty_id,
           CASE
             WHEN lower(target.country_name) LIKE '%xiongnu%' THEN (ARRAY['Saranai','Yesui','Alci','Qutlu'])[((target.family_no-1)%4)+1]
             WHEN lower(target.country_name) LIKE '%xianbei%' THEN (ARRAY['Lihua','Ruolan','Xiaolian','Meilin'])[((target.family_no-1)%4)+1]
             ELSE (ARRAY['Aybuke','Bengisu','Aruna','Sevin'])[((target.family_no-1)%4)+1]
           END,
           'FEMALE',CASE target.tier WHEN 'KHAN' THEN 34 ELSE 30 END,
           CASE target.tier WHEN 'KHAN' THEN 'Han Kardeşi' ELSE 'Ağa Kardeşi' END,
           'Hane Reisinin Kız Kardeşi','ALIVE','HEALTHY',FALSE,FALSE,4,mother.id,father.id,
           target.current_turn-CASE target.tier WHEN 'KHAN' THEN 34 ELSE 30 END
      FROM steppe_family_targets_v180 target
      JOIN dynasty_members father ON father.dynasty_id=target.dynasty_id AND father.relation='Hane Reisinin Babası'
      JOIN dynasty_members mother ON mother.dynasty_id=target.dynasty_id AND mother.relation='Hane Reisinin Annesi';

    INSERT INTO dynasty_members(dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,succession_rank,mother_id,father_id,born_turn)
    SELECT target.dynasty_id,
           CASE
             WHEN lower(target.country_name) LIKE '%xiongnu%' THEN (ARRAY['Tumen','Jiyu','Huhanye','Zhizhi'])[((target.family_no-1)%4)+1]
             WHEN lower(target.country_name) LIKE '%xianbei%' THEN (ARRAY['Tanshihuai','Murong Hui','Tuoba Liwei','Yuwen Mohuai'])[((target.family_no-1)%4)+1]
             ELSE (ARRAY['Alp Boro','Ilter','Kagan','Tirig'])[((target.family_no-1)%4)+1]
           END,
           'MALE',CASE target.tier WHEN 'KHAN' THEN 18 ELSE 16 END,
           CASE target.tier WHEN 'KHAN' THEN 'Han Oğlu' ELSE 'Ağa Oğlu' END,
           'Hane Reisinin Oğlu','ALIVE','HEALTHY',FALSE,TRUE,1,spouse.id,target.root_id,
           target.current_turn-CASE target.tier WHEN 'KHAN' THEN 18 ELSE 16 END
      FROM steppe_family_targets_v180 target
      JOIN dynasty_members spouse ON spouse.dynasty_id=target.dynasty_id AND spouse.relation='Hane Reisinin Eşi';

    INSERT INTO dynasty_members(dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,succession_rank,mother_id,father_id,born_turn)
    SELECT target.dynasty_id,
           CASE
             WHEN lower(target.country_name) LIKE '%xiongnu%' THEN (ARRAY['Aybuke','Ilbilge','Yulduz','Alcina'])[((target.family_no-1)%4)+1]
             WHEN lower(target.country_name) LIKE '%xianbei%' THEN (ARRAY['Yueying','Mulan','Xiaoyan','Lanyue'])[((target.family_no-1)%4)+1]
             ELSE (ARRAY['Selenge','Aysun','Altincicek','Gunai'])[((target.family_no-1)%4)+1]
           END,
           'FEMALE',CASE target.tier WHEN 'KHAN' THEN 15 ELSE 13 END,
           CASE target.tier WHEN 'KHAN' THEN 'Han Kızı' ELSE 'Ağa Kızı' END,
           'Hane Reisinin Kızı','ALIVE','HEALTHY',FALSE,FALSE,2,spouse.id,target.root_id,
           target.current_turn-CASE target.tier WHEN 'KHAN' THEN 15 ELSE 13 END
      FROM steppe_family_targets_v180 target
      JOIN dynasty_members spouse ON spouse.dynasty_id=target.dynasty_id AND spouse.relation='Hane Reisinin Eşi';

    INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,details)
    SELECT target.dynasty_id,target.current_turn,'FAMILY_ROSTER_INITIALIZED',
           jsonb_build_object('source','STEPPE_TITLE_FAMILIES_V180','memberCount',8,'titleId',target.title_id,'titleName',target.title_name)
      FROM steppe_family_targets_v180 target;
  `
} as const;
