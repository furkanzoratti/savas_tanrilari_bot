export const dynastyInitialRostersMigration={
  version:109,
  name:"initial_dynasty_rosters_with_thirty_year_offset",
  sql:`
    ALTER TABLE dynasty_members ALTER COLUMN age DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS dynasty_member_name_unique
      ON dynasty_members(dynasty_id,lower(name));

    CREATE TEMP TABLE dynasty_seed_countries(
      country_name TEXT PRIMARY KEY,
      dynasty_name TEXT NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO dynasty_seed_countries(country_name,dynasty_name) VALUES
      ('Britanya','York Hanedanı'),
      ('Fenike-Aram','Nikator Hanedanlığı'),
      ('Büyük Kartaca','Barca Hanedanı'),
      ('Boylar','Boii Hanedanı'),
      ('Karnutlar','Fareus Hanedanlığı'),
      ('Sardes','Heraklid Hanedanı'),
      ('Nebatiler','Karib Hanedanı'),
      ('Persler','Hayyam Hanedanı'),
      ('Sebe','Sebe Hanedanı'),
      ('Mısır','Horusbu Hanedanı'),
      ('Sarmatya','Skolot Hanedanı'),
      ('Gallaekler','Albioni Hanedanı'),
      ('Bosporos Krallığı','Spartokos Hanedanı'),
      ('Ermenistan','Nişanyan Hanedanı'),
      ('Medya','Astiyagid Hanedanı'),
      ('Greko-Baktriya','Eucratid Hanedanı'),
      ('Bergama','Soter Hanedanı'),
      ('Saketler','Saket Hanedanı'),
      ('Hindu Kuş','Paropamisad Hanedanı'),
      ('Satraplar','Kshaharata Hanedanı'),
      ('Pandaya','Pandaya Hanedanı'),
      ('Satavahana','Satavahana Hanedanı'),
      ('Şunga','Şunga Hanedanı'),
      ('Panchala','Mitra Hanedanı'),
      ('Kosola','Datta Hanedanı'),
      ('Anuradhapura','Anuradha Hanedanı'),
      ('Malaya','Kedah Hanedanı');

    INSERT INTO dynasties(guild_id,country_id,name,created_by)
    SELECT country.guild_id,country.id,seed.dynasty_name,'system:dynasty-seed-v109'
      FROM dynasty_seed_countries seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name)
    ON CONFLICT(country_id) DO UPDATE SET name=EXCLUDED.name,updated_at=NOW();

    CREATE TEMP TABLE dynasty_seed_members(
      country_name TEXT NOT NULL,
      member_key TEXT NOT NULL,
      member_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      age INTEGER,
      title TEXT NOT NULL,
      relation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ALIVE',
      is_monarch BOOLEAN NOT NULL DEFAULT FALSE,
      is_heir BOOLEAN NOT NULL DEFAULT FALSE,
      succession_rank INTEGER,
      spouse_key TEXT,
      mother_key TEXT,
      father_key TEXT,
      PRIMARY KEY(country_name,member_key)
    ) ON COMMIT DROP;

    INSERT INTO dynasty_seed_members(
      country_name,member_key,member_name,gender,age,title,relation,status,
      is_monarch,is_heir,succession_rank,spouse_key,mother_key,father_key
    ) VALUES
      ('Britanya','ecbert','Ecbert York','MALE',65,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'cecilia',NULL,NULL),
      ('Britanya','cecilia','Cecilia York','FEMALE',NULL,'Kraliçe','Hükümdarın merhum eşi','DEAD',FALSE,FALSE,NULL,'ecbert',NULL,NULL),
      ('Britanya','aethelwulf','Aethelwulf York','MALE',44,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'cecilia','ecbert'),
      ('Britanya','cedric','Cedric York','MALE',42,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'cecilia','ecbert'),
      ('Britanya','athelstan','Athelstan York','MALE',40,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'cecilia','ecbert'),
      ('Britanya','alysia','Alysia York','FEMALE',38,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'cecilia','ecbert'),

      ('Fenike-Aram','antiokus','I. Antiokus Nikator','MALE',61,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,NULL,NULL,NULL),
      ('Fenike-Aram','perdikkas','I. Perdikkas Nikator','MALE',47,'Prens','Merhum Seleukos Nikator''un oğlu','ALIVE',FALSE,FALSE,1,NULL,NULL,'seleukos'),
      ('Fenike-Aram','dimitrios','I. Dimitrios Nikator','MALE',42,'Prens','Merhum Seleukos Nikator''un oğlu','ALIVE',FALSE,FALSE,2,NULL,NULL,'seleukos'),
      ('Fenike-Aram','seleukos','I. Seleukos Nikator','MALE',NULL,'Merhum Kral','Önceki hükümdar','DEAD',FALSE,FALSE,NULL,NULL,NULL,NULL),

      ('Büyük Kartaca','hannibal','I. Hannibal Barca','MALE',65,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'sophonisba',NULL,NULL),
      ('Büyük Kartaca','sophonisba','Sophonisba Barca','FEMALE',66,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'hannibal',NULL,NULL),
      ('Büyük Kartaca','ibrahim','İbrahim Barca','MALE',49,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'sophonisba','hannibal'),
      ('Büyük Kartaca','hasdrubal','Hasdrubal Barca','MALE',42,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'sophonisba','hannibal'),
      ('Büyük Kartaca','mago','Mago Barca','MALE',41,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'sophonisba','hannibal'),
      ('Büyük Kartaca','imilce','Imilce Barca','FEMALE',37,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'sophonisba','hannibal'),

      ('Boylar','critasiros','Critasiros Boii','MALE',66,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'sirona',NULL,NULL),
      ('Boylar','sirona','Sirona Boii','FEMALE',64,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'critasiros',NULL,NULL),
      ('Boylar','epona','Epona Boii','FEMALE',48,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'sirona','critasiros'),
      ('Boylar','fiona','Fiona Boii','FEMALE',45,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'sirona','critasiros'),
      ('Boylar','stannislaw','Stannislaw Boii','MALE',42,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'sirona','critasiros'),
      ('Boylar','alaric','Alaric Boii','MALE',39,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'sirona','critasiros'),
      ('Boylar','brennus','Brennus Boii','MALE',37,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,5,NULL,'sirona','critasiros'),

      ('Karnutlar','faretton','Faretton Fareus','MALE',67,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,NULL,NULL,NULL),
      ('Karnutlar','joffrey','Joffrey Fareus','MALE',46,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,NULL,'faretton'),
      ('Karnutlar','johanna','Johanna Fareus','FEMALE',45,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,NULL,'faretton'),
      ('Karnutlar','tommen','Tommen Fareus','MALE',44,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,NULL,'faretton'),

      ('Sardes','asterion','Asterion Heraklid','MALE',65,'Yönetici','Hükümdar','ALIVE',TRUE,FALSE,NULL,'asteria',NULL,NULL),
      ('Sardes','asteria','Asteria Heraklid','FEMALE',64,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'asterion',NULL,NULL),
      ('Sardes','leontes','Leontes Heraklid','MALE',49,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'asteria','asterion'),
      ('Sardes','kyra','Kyra Heraklid','FEMALE',47,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'asteria','asterion'),
      ('Sardes','damon','Damon Heraklid','MALE',46,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'asteria','asterion'),
      ('Sardes','evander','Evander Heraklid','MALE',43,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'asteria','asterion'),
      ('Sardes','selene','Selene Heraklid','FEMALE',38,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,5,NULL,'asteria','asterion'),

      ('Nebatiler','marzan','Marzan bin Abu Karib abdUzza','MALE',67,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'zaila',NULL,NULL),
      ('Nebatiler','zaila','Zaila bin Attar','FEMALE',64,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'marzan',NULL,NULL),
      ('Nebatiler','haddad','Haddad','MALE',51,'Prens','Hükümdarın oğlu','ALIVE',FALSE,TRUE,1,NULL,'zaila','marzan'),
      ('Nebatiler','leila','Leila','FEMALE',50,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,2,NULL,'zaila','marzan'),
      ('Nebatiler','saara','Şaara','MALE',49,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,3,NULL,'zaila','marzan'),
      ('Nebatiler','asharu','Asharu','FEMALE',48,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,4,NULL,'zaila','marzan'),
      ('Nebatiler','belheru','Belheru','MALE',47,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,5,NULL,'zaila','marzan'),

      ('Persler','daryus','Daryuş Hayyam','MALE',76,'Şah','Hükümdar','ALIVE',TRUE,FALSE,NULL,'zendaya',NULL,NULL),
      ('Persler','zendaya','Zendaya Hayyam','FEMALE',70,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'daryus',NULL,NULL),
      ('Persler','meryem','Meryem Hayyam','FEMALE',54,'Prenses','Hükümdarın kız kardeşi','ALIVE',FALSE,FALSE,6,NULL,NULL,NULL),
      ('Persler','gulsifte','Gülşifte Hayyam','FEMALE',49,'Prenses','Hükümdarın kız kardeşi','ALIVE',FALSE,FALSE,7,NULL,NULL,NULL),
      ('Persler','artuna','Artuna Hayyam','FEMALE',50,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,2,NULL,'zendaya','daryus'),
      ('Persler','abbas','Abbas Kiarostami Hayyam','MALE',49,'Prens','Hükümdarın oğlu','ALIVE',FALSE,TRUE,1,NULL,'zendaya','daryus'),
      ('Persler','atossa','Atossa Hayyam','FEMALE',45,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,3,NULL,'zendaya','daryus'),
      ('Persler','amtarda','Amtarda Hayyam','FEMALE',40,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,4,NULL,'zendaya','daryus'),
      ('Persler','selahaddin','Selahaddin Hayyam','MALE',38,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,5,NULL,'zendaya','daryus'),

      ('Sebe','hakim','Hâkim bin Abu Bekr Al Sebe','MALE',61,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'zeyneb',NULL,NULL),
      ('Sebe','zeyneb','Zeyneb','FEMALE',57,'Hanım','Hükümdarın birincil eşi','ALIVE',FALSE,FALSE,NULL,'hakim',NULL,NULL),
      ('Sebe','meryem','Meryem','FEMALE',55,'Hanım','Hükümdarın hanımı','ALIVE',FALSE,FALSE,NULL,NULL,NULL,NULL),
      ('Sebe','aisha','Aisha','FEMALE',51,'Hanım','Hükümdarın hanımı','ALIVE',FALSE,FALSE,NULL,NULL,NULL,NULL),
      ('Sebe','leila','Leila','FEMALE',51,'Hanım','Hükümdarın hanımı','ALIVE',FALSE,FALSE,NULL,NULL,NULL,NULL),
      ('Sebe','hafsa','Hafsa','FEMALE',49,'Hanım','Hükümdarın hanımı','ALIVE',FALSE,FALSE,NULL,NULL,NULL,NULL),
      ('Sebe','omar','Omar','MALE',41,'Prens','Hükümdarın oğlu','ALIVE',FALSE,TRUE,1,NULL,NULL,'hakim'),
      ('Sebe','salman','Salman','MALE',41,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,2,NULL,NULL,'hakim'),
      ('Sebe','ruqiyya','Ruqiyya','FEMALE',40,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,3,NULL,NULL,'hakim'),
      ('Sebe','faisal','Faisal','MALE',39,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,4,NULL,NULL,'hakim'),
      ('Sebe','yakub','Yakub','MALE',38,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,5,NULL,NULL,'hakim'),
      ('Sebe','hadijeh','Hadijeh','FEMALE',37,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,6,NULL,NULL,'hakim'),
      ('Sebe','yousef','Yousef','MALE',37,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,7,NULL,NULL,'hakim'),
      ('Sebe','khalid','Khalid','MALE',35,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,8,NULL,NULL,'hakim'),
      ('Sebe','fatimah','Fatimah','FEMALE',34,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,9,NULL,NULL,'hakim'),
      ('Sebe','zahra','Zahra','FEMALE',33,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,10,NULL,NULL,'hakim'),
      ('Sebe','yahya','Yahya','MALE',32,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,11,NULL,NULL,'hakim'),
      ('Sebe','alqasim','Al Qasim','MALE',31,'Prens','Hükümdarın oğlu','ALIVE',FALSE,FALSE,12,NULL,NULL,'hakim'),

      ('Mısır','tutankamon','Tutankamon Horusbu','MALE',67,'Firavun','Hükümdar','ALIVE',TRUE,FALSE,NULL,'tutankadin',NULL,NULL),
      ('Mısır','tutankadin','Tutankadın Horusbu','FEMALE',64,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'tutankamon',NULL,NULL),
      ('Mısır','kleopatra','Kleopatra','FEMALE',45,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'tutankadin','tutankamon'),
      ('Mısır','ramses','Ramses','MALE',44,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'tutankadin','tutankamon'),
      ('Mısır','pyrus','Pyrus','MALE',41,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'tutankadin','tutankamon'),
      ('Mısır','thutmose','Thutmose','MALE',38,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'tutankadin','tutankamon'),

      ('Sarmatya','ateas','Ateas Skolot','MALE',54,'Han','Hükümdar','ALIVE',TRUE,FALSE,NULL,'tuma','tomris','targitay'),
      ('Sarmatya','tuma','Ayrıca Tuma','FEMALE',52,'Hatun','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'ateas',NULL,NULL),
      ('Sarmatya','zarina','Zarina Skolot','FEMALE',51,'Prenses','Hükümdarın kız kardeşi','ALIVE',FALSE,FALSE,1,NULL,'tomris','targitay'),
      ('Sarmatya','orikia','Orikia Skolot','FEMALE',46,'Prenses','Hükümdarın kız kardeşi','ALIVE',FALSE,FALSE,2,NULL,'tomris','targitay'),
      ('Sarmatya','madyas','Madyas Skolot','MALE',44,'Prens','Hükümdarın erkek kardeşi','ALIVE',FALSE,FALSE,3,NULL,'tomris','targitay'),
      ('Sarmatya','arsak','Arsak Skolot','MALE',82,'Lord','Hanedan üyesi','ALIVE',FALSE,FALSE,4,NULL,NULL,NULL),
      ('Sarmatya','amage','Amage Skolot','FEMALE',67,'Leydi','Hanedan üyesi','ALIVE',FALSE,FALSE,5,NULL,NULL,NULL),
      ('Sarmatya','tirgutawiya','Tirgutawiya Skolot','FEMALE',45,'Leydi','Hanedan üyesi','ALIVE',FALSE,FALSE,6,NULL,NULL,NULL),
      ('Sarmatya','targitay','Targitay Skolot','MALE',NULL,'Merhum Han','Önceki hükümdar','DEAD',FALSE,FALSE,NULL,'tomris',NULL,NULL),
      ('Sarmatya','tomris','Tomris Skolot','FEMALE',NULL,'Merhum Hatun','Önceki hükümdarın eşi','DEAD',FALSE,FALSE,NULL,'targitay',NULL,NULL),

      ('Gallaekler','segomo','Segomo Albioni','MALE',62,'Princeps','Hükümdar','ALIVE',TRUE,FALSE,NULL,'apana',NULL,NULL),
      ('Gallaekler','apana','Apana Albioni','FEMALE',59,'Princepsa','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'segomo',NULL,NULL),
      ('Gallaekler','nicer','Nicer Albioni','MALE',40,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'apana','segomo'),
      ('Gallaekler','medena','Medena Albioni','FEMALE',37,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'apana','segomo'),
      ('Gallaekler','vandalius','Vandalius Albioni','MALE',32,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'apana','segomo'),
      ('Gallaekler','corocotta','Corocotta Albioni','MALE',88,'Lord','Hükümdarın amcası • Başkomutan/Brixton','ALIVE',FALSE,FALSE,6,NULL,NULL,NULL),
      ('Gallaekler','boudina','Boudina Albioni','FEMALE',56,'Prenses','Hükümdarın kız kardeşi','ALIVE',FALSE,FALSE,5,NULL,NULL,NULL),
      ('Gallaekler','boddocus','Boddocus Albioni','MALE',47,'Prens','Hükümdarın küçük kardeşi • Varis adayı','ALIVE',FALSE,FALSE,1,NULL,NULL,NULL),

      ('Bosporos Krallığı','spartokos','IV. Spartokos','MALE',64,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'glykeia',NULL,NULL),
      ('Bosporos Krallığı','glykeia','Glykeia','FEMALE',59,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'spartokos',NULL,NULL),
      ('Bosporos Krallığı','pairisades','V. Pairisades','MALE',42,'Veliaht Prens','Hükümdarın oğlu','ALIVE',FALSE,TRUE,1,NULL,'glykeia','spartokos'),
      ('Bosporos Krallığı','satyros','II. Satyros','MALE',61,'Prens','Hükümdarın erkek kardeşi','ALIVE',FALSE,FALSE,2,NULL,NULL,NULL),
      ('Bosporos Krallığı','leukon','II. Leukon','MALE',38,'Prens','Hükümdarın yeğeni','ALIVE',FALSE,FALSE,3,NULL,NULL,'satyros'),
      ('Bosporos Krallığı','alkathoe','Alkathoe','FEMALE',56,'Prenses','Hükümdarın kız kardeşi • Pantikapaion','ALIVE',FALSE,FALSE,4,NULL,NULL,NULL),

      ('Ermenistan','sevan','Sevan Nişanyan','MALE',51,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,NULL,NULL,NULL),
      ('Ermenistan','arsen','Arsen Nişanyan','MALE',34,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,NULL,'sevan'),
      ('Ermenistan','tavit','Tavit Nişanyan','MALE',32,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,NULL,'sevan'),
      ('Ermenistan','mihran','Mihran Nişanyan','FEMALE',31,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,3,NULL,NULL,'sevan'),
      ('Ermenistan','iris','İris Nişanyan','FEMALE',29,'Prenses','Hükümdarın kızı','ALIVE',FALSE,FALSE,4,NULL,NULL,'sevan'),

      ('Medya','cyaxares','Cyaxares Astiyagid','MALE',44,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'amytis',NULL,NULL),
      ('Medya','amytis','Amytis Astiyagid','FEMALE',40,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'cyaxares',NULL,NULL),
      ('Medya','arbaces','Arbaces Astiyagid','MALE',21,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'amytis','cyaxares'),
      ('Medya','atossa','Atossa Astiyagid','FEMALE',18,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'amytis','cyaxares'),
      ('Medya','daryus','Daryuş Astiyagid','MALE',13,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'amytis','cyaxares'),

      ('Greko-Baktriya','demetrius','I. Demetrius Eucratid','MALE',27,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'helena',NULL,NULL),
      ('Greko-Baktriya','helena','Helena Eucratid','FEMALE',24,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'demetrius',NULL,NULL),
      ('Greko-Baktriya','alexander','Alexander Eucratid','MALE',12,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'helena','demetrius'),
      ('Greko-Baktriya','callinicus','Callinicus Eucratid','MALE',25,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'helena','demetrius'),
      ('Greko-Baktriya','olimpias','Olimpias Eucratid','FEMALE',21,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'helena','demetrius'),

      ('Bergama','attalos_soter','I. Attalos Soter','MALE',54,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'apollonis',NULL,NULL),
      ('Bergama','apollonis','Kyzikoslu Apollonis','FEMALE',32,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'attalos_soter',NULL,NULL),
      ('Bergama','eumenis','Eumenis','MALE',17,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'apollonis','attalos_soter'),
      ('Bergama','attalos','Attalos','MALE',15,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'apollonis','attalos_soter'),
      ('Bergama','filetairos','Filetairos','MALE',12,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'apollonis','attalos_soter'),
      ('Bergama','atheneaos','Atheneaos','MALE',10,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'apollonis','attalos_soter'),

      ('Saketler','alperen','I Alperen Saket','MALE',40,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'nile',NULL,NULL),
      ('Saketler','nile','Nile Saket','FEMALE',38,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'alperen',NULL,NULL),
      ('Saketler','demure','Demure Saker','FEMALE',22,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,1,NULL,'nile','alperen'),
      ('Saketler','ademure','Ademure Saket','MALE',15,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'nile','alperen'),
      ('Saketler','edemure','Edemure Saket','MALE',15,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'nile','alperen'),
      ('Saketler','keira','Keira Saket','FEMALE',11,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,4,NULL,'nile','alperen'),

      ('Hindu Kuş','vasudeva','Vasudeva Paropamisad','MALE',43,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'roxana',NULL,NULL),
      ('Hindu Kuş','roxana','Roxana Paropamisad','FEMALE',37,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'vasudeva',NULL,NULL),
      ('Hindu Kuş','ashvaka','Ashvaka Paropamisad','MALE',18,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'roxana','vasudeva'),
      ('Hindu Kuş','rudraka','Rudraka Paropamisad','MALE',14,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'roxana','vasudeva'),
      ('Hindu Kuş','berenika','Berenika Paropamisad','FEMALE',11,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'roxana','vasudeva'),

      ('Satraplar','bhumaka','Bhumaka Kshaharata','MALE',46,'Mahakshatrapa','Hükümdar','ALIVE',TRUE,FALSE,NULL,'rudradama',NULL,NULL),
      ('Satraplar','rudradama','Rudradama Kshaharata','FEMALE',39,'Mahadevi','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'bhumaka',NULL,NULL),
      ('Satraplar','nahapana','Nahapana Kshaharata','MALE',19,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'rudradama','bhumaka'),
      ('Satraplar','damasena','Damasena Kshaharata','MALE',15,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'rudradama','bhumaka'),
      ('Satraplar','dakshamitra','Dakshamitra Kshaharata','FEMALE',13,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'rudradama','bhumaka'),

      ('Pandaya','neduncheliyan','Neduncheliyan Pandaya','MALE',41,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'kopperundevi',NULL,NULL),
      ('Pandaya','kopperundevi','Kopperundevi Pandaya','FEMALE',35,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'neduncheliyan',NULL,NULL),
      ('Pandaya','mudukudumi','Mudukudumi Pandaya','MALE',17,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'kopperundevi','neduncheliyan'),
      ('Pandaya','maran','Maran Pandaya','MALE',14,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'kopperundevi','neduncheliyan'),
      ('Pandaya','alli','Alli Pandaya','FEMALE',10,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'kopperundevi','neduncheliyan'),

      ('Satavahana','simuka','Simuka Satavahana','MALE',39,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'nayanika',NULL,NULL),
      ('Satavahana','nayanika','Devi Nayanika','FEMALE',33,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'simuka',NULL,NULL),
      ('Satavahana','kanha','Kanha Satavahana','MALE',16,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'nayanika','simuka'),
      ('Satavahana','satakarni','Satakarni Satavahana','MALE',12,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'nayanika','simuka'),
      ('Satavahana','gautami','Gautami Satavahana','FEMALE',9,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'nayanika','simuka'),

      ('Şunga','pushyamitra','Pushyamitra Şunga','MALE',47,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'dharini',NULL,NULL),
      ('Şunga','dharini','Dharini Şunga','FEMALE',40,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'pushyamitra',NULL,NULL),
      ('Şunga','agnimitra','Agnimitra Şunga','MALE',21,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'dharini','pushyamitra'),
      ('Şunga','vasumitra','Vasumitra Şunga','MALE',15,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'dharini','pushyamitra'),
      ('Şunga','malavika','Malavika Şunga','FEMALE',13,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'dharini','pushyamitra'),

      ('Panchala','indramitra','Indramitra Mitra','MALE',42,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'vasumati',NULL,NULL),
      ('Panchala','vasumati','Vasumati Mitra','FEMALE',36,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'indramitra',NULL,NULL),
      ('Panchala','phalgunimitra','Phalgunimitra Mitra','MALE',18,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'vasumati','indramitra'),
      ('Panchala','suryamitra','Suryamitra Mitra','MALE',14,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'vasumati','indramitra'),
      ('Panchala','yashomati','Yashomati Mitra','FEMALE',11,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'vasumati','indramitra'),

      ('Kosola','dhanadeva','Dhanadeva Datta','MALE',44,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'kausalya',NULL,NULL),
      ('Kosola','kausalya','Kausalya Datta','FEMALE',38,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'dhanadeva',NULL,NULL),
      ('Kosola','muladeva','Muladeva Datta','MALE',20,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'kausalya','dhanadeva'),
      ('Kosola','vishakhadatta','Vishakhadatta Datta','MALE',15,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'kausalya','dhanadeva'),
      ('Kosola','padmavati','Padmavati Datta','FEMALE',12,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'kausalya','dhanadeva'),

      ('Anuradhapura','tissa','Devanampiya Tissa','MALE',48,'Kral','Hükümdar','ALIVE',TRUE,FALSE,NULL,'anula',NULL,NULL),
      ('Anuradhapura','anula','Anula','FEMALE',37,'Kraliçe','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'tissa',NULL,NULL),
      ('Anuradhapura','uttiya','Uttiya','MALE',45,'Veliaht Prens','Hükümdarın erkek kardeşi','ALIVE',FALSE,TRUE,1,NULL,NULL,NULL),
      ('Anuradhapura','mahasiva','Mahasiva','MALE',40,'Prens','Hükümdarın erkek kardeşi','ALIVE',FALSE,FALSE,2,NULL,NULL,NULL),
      ('Anuradhapura','sumana','Sumana','FEMALE',16,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'anula','tissa'),

      ('Malaya','merong','Merong Mahawangsa','MALE',42,'Raja','Hükümdar','ALIVE',TRUE,FALSE,NULL,'cempaka',NULL,NULL),
      ('Malaya','cempaka','Cempaka','FEMALE',34,'Rani','Hükümdarın eşi','ALIVE',FALSE,FALSE,NULL,'merong',NULL,NULL),
      ('Malaya','mahapudisat','Merong Mahapudisat','MALE',17,'Veliaht Prens','Hükümdarın çocuğu','ALIVE',FALSE,TRUE,1,NULL,'cempaka','merong'),
      ('Malaya','sarjuna','Ganjil Sarjuna','MALE',13,'Prens','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,2,NULL,'cempaka','merong'),
      ('Malaya','serimaya','Seri Maya','FEMALE',9,'Prenses','Hükümdarın çocuğu','ALIVE',FALSE,FALSE,3,NULL,'cempaka','merong');

    INSERT INTO dynasty_members(
      dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
      succession_rank,born_turn,died_turn,death_reason
    )
    SELECT dynasty.id,seed.member_name,seed.gender,seed.age,seed.title,seed.relation,seed.status,'HEALTHY',
           seed.is_monarch,seed.is_heir,seed.succession_rank,
           CASE WHEN seed.status='ALIVE' THEN guild.current_turn-seed.age ELSE NULL END,
           NULL,CASE WHEN seed.status='DEAD' THEN 'Başlangıç kaydı: merhum' ELSE NULL END
      FROM dynasty_seed_members seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name)
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN dynasties dynasty ON dynasty.country_id=country.id
    ON CONFLICT(dynasty_id,lower(name)) DO UPDATE SET
      gender=EXCLUDED.gender,age=EXCLUDED.age,title=EXCLUDED.title,relation=EXCLUDED.relation,
      status=EXCLUDED.status,health='HEALTHY',is_monarch=EXCLUDED.is_monarch,is_heir=EXCLUDED.is_heir,
      succession_rank=EXCLUDED.succession_rank,born_turn=EXCLUDED.born_turn,
      died_turn=EXCLUDED.died_turn,death_reason=EXCLUDED.death_reason,updated_at=NOW();

    UPDATE dynasty_members member
       SET spouse_id=spouse.id,updated_at=NOW()
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN dynasty_seed_members seed ON lower(seed.country_name)=lower(country.name)
      JOIN dynasty_seed_members spouse_seed
        ON spouse_seed.country_name=seed.country_name AND spouse_seed.member_key=seed.spouse_key
      JOIN dynasty_members spouse
        ON spouse.dynasty_id=dynasty.id AND lower(spouse.name)=lower(spouse_seed.member_name)
     WHERE member.dynasty_id=dynasty.id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET mother_id=mother.id,updated_at=NOW()
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN dynasty_seed_members seed ON lower(seed.country_name)=lower(country.name)
      JOIN dynasty_seed_members mother_seed
        ON mother_seed.country_name=seed.country_name AND mother_seed.member_key=seed.mother_key
      JOIN dynasty_members mother
        ON mother.dynasty_id=dynasty.id AND lower(mother.name)=lower(mother_seed.member_name)
     WHERE member.dynasty_id=dynasty.id AND lower(member.name)=lower(seed.member_name);

    UPDATE dynasty_members member
       SET father_id=father.id,updated_at=NOW()
      FROM dynasties dynasty
      JOIN countries country ON country.id=dynasty.country_id
      JOIN dynasty_seed_members seed ON lower(seed.country_name)=lower(country.name)
      JOIN dynasty_seed_members father_seed
        ON father_seed.country_name=seed.country_name AND father_seed.member_key=seed.father_key
      JOIN dynasty_members father
        ON father.dynasty_id=dynasty.id AND lower(father.name)=lower(father_seed.member_name)
     WHERE member.dynasty_id=dynasty.id AND lower(member.name)=lower(seed.member_name);
  `
} as const;
