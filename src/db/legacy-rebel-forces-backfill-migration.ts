export const legacyRebelForcesBackfillMigration={
  version:143,
  name:"legacy_active_rebel_forces_backfill",
  sql:`
    WITH base AS (
      SELECT faction.id,faction.faction_type,
             GREATEST(0,settlement.population)::numeric AS free_population,
             GREATEST(0,settlement.slave_population)::numeric AS slave_population,
             GREATEST(0,country.war_exhaustion)::numeric AS war_exhaustion
        FROM rebel_factions faction
        JOIN settlements settlement ON settlement.id=faction.settlement_id
        JOIN countries country ON country.id=faction.against_country_id
       WHERE faction.status IN ('ACTIVE','OCCUPYING')
         AND faction.personnel=0
    ), force_size AS (
      SELECT id,faction_type,
             GREATEST(1000,LEAST(30000,FLOOR((free_population+slave_population)*0.20)))::integer AS force_cap,
             CASE faction_type
               WHEN 'SEPARATIST' THEN (free_population*0.08+slave_population*0.03)*(1+war_exhaustion/500)
               WHEN 'RELIGIOUS' THEN (free_population*0.07+slave_population*0.02)*(1+war_exhaustion/500)
               WHEN 'SLAVE' THEN (free_population*0.02+slave_population*0.20)*(1+war_exhaustion/500)
               ELSE (free_population*0.06+slave_population*0.02)*(1+war_exhaustion/500)
             END AS raw_personnel
        FROM base
    ), sized AS (
      SELECT id,faction_type,
             GREATEST(1000,LEAST(force_cap,ROUND(raw_personnel/100)*100))::integer AS personnel
        FROM force_size
    ), weights(faction_type,unit_key,share,sort_order,unit_power) AS (
      VALUES
        ('POPULAR','light_infantry',25,1,1.00),('POPULAR','spear',25,2,1.60),
        ('POPULAR','archer',15,3,2.00),('POPULAR','heavy_infantry',20,4,2.60),
        ('POPULAR','light_cavalry',10,5,2.40),('POPULAR','heavy_cavalry',5,6,3.30),
        ('SEPARATIST','light_infantry',15,1,1.00),('SEPARATIST','spear',20,2,1.60),
        ('SEPARATIST','archer',15,3,2.00),('SEPARATIST','heavy_infantry',25,4,2.60),
        ('SEPARATIST','light_cavalry',15,5,2.40),('SEPARATIST','heavy_cavalry',10,6,3.30),
        ('RELIGIOUS','light_infantry',20,1,1.00),('RELIGIOUS','spear',25,2,1.60),
        ('RELIGIOUS','archer',20,3,2.00),('RELIGIOUS','heavy_infantry',20,4,2.60),
        ('RELIGIOUS','light_cavalry',10,5,2.40),('RELIGIOUS','heavy_cavalry',5,6,3.30),
        ('SLAVE','light_infantry',30,1,1.00),('SLAVE','spear',30,2,1.60),
        ('SLAVE','slinger',15,3,1.30),('SLAVE','archer',10,4,2.00),
        ('SLAVE','heavy_infantry',10,5,2.60),('SLAVE','light_cavalry',5,6,2.40)
    ), allocated AS (
      SELECT sized.id,sized.personnel,weights.unit_key,weights.sort_order,weights.unit_power,
             FLOOR(sized.personnel*weights.share/100.0)::integer AS base_quantity,
             SUM(FLOOR(sized.personnel*weights.share/100.0)::integer) OVER (PARTITION BY sized.id) AS allocated_quantity
        FROM sized JOIN weights ON weights.faction_type=sized.faction_type
    ), finalized AS (
      SELECT id,personnel,unit_key,sort_order,unit_power,
             base_quantity+CASE WHEN sort_order=1 THEN personnel-allocated_quantity ELSE 0 END AS quantity
        FROM allocated
    ), summarized AS (
      SELECT id,MAX(personnel)::integer AS personnel,
             JSONB_OBJECT_AGG(unit_key,quantity ORDER BY sort_order) AS composition,
             ROUND(SUM(quantity*unit_power))::bigint AS military_power
        FROM finalized GROUP BY id
    )
    UPDATE rebel_factions faction
       SET personnel=summarized.personnel,
           composition=summarized.composition,
           military_power=summarized.military_power,
           cause_snapshot=COALESCE(faction.cause_snapshot,'{}'::jsonb)
             || jsonb_build_object('legacyForceBackfilled',TRUE),
           updated_at=NOW()
      FROM summarized
     WHERE faction.id=summarized.id;
  `
} as const;
