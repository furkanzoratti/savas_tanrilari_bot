export const romanRepublicSenateSeatsMigration={
  version:154,
  name:"roman_republic_senate_seat_distribution",
  sql:`
    UPDATE roman_families family
       SET senate_seats=CASE
         WHEN lower(family.name) IN ('scipio ailesi','scipio') THEN 18
         WHEN lower(family.name) IN ('magnus ailesi','magnus') THEN 18
         WHEN lower(family.name) IN ('cato ailesi','cato') THEN 12
         WHEN lower(family.name) IN ('nero ailesi','nero') THEN 12
         WHEN lower(family.name) IN (
           'julius ailesi','aemilius ailesi','fabius ailesi','valerius ailesi',
           'licinius ailesi','junius ailesi','servilius ailesi','caecilius ailesi'
         ) THEN 5
         ELSE family.senate_seats
       END,
       updated_at=NOW()
      FROM roman_republics republic
      JOIN countries country ON country.id=republic.country_id
     WHERE family.republic_id=republic.id
       AND republic.status='ACTIVE'
       AND lower(country.name) LIKE 'roma%'
       AND lower(family.name) IN (
         'scipio ailesi','scipio','magnus ailesi','magnus','cato ailesi','cato','nero ailesi','nero',
         'julius ailesi','aemilius ailesi','fabius ailesi','valerius ailesi',
         'licinius ailesi','junius ailesi','servilius ailesi','caecilius ailesi'
       );
  `
} as const;
