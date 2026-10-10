export const centralAsianQiangCorrectionMigration={
  version:173,
  name:"central_asian_qiang_country_correction",
  sql:`
    DO $$
    DECLARE
      old_country RECORD;
      duplicate_qiang_id UUID;
    BEGIN
      FOR old_country IN
        SELECT id,guild_id
          FROM countries
         WHERE lower(name)=lower('Zhang Zhung')
      LOOP
        SELECT id INTO duplicate_qiang_id
          FROM countries
         WHERE guild_id=old_country.guild_id
           AND lower(name)=lower('Qiang Kabileleri')
           AND id<>old_country.id
         LIMIT 1;

        IF duplicate_qiang_id IS NOT NULL THEN
          DELETE FROM countries WHERE id=duplicate_qiang_id;
        END IF;

        UPDATE countries
           SET name='Qiang Kabileleri',status='ACTIVE',primary_culture_group='QIANG'
         WHERE id=old_country.id;
      END LOOP;
    END
    $$;

    DELETE FROM settlements settlement
     USING countries country
     WHERE settlement.country_id=country.id
       AND lower(country.name)=lower('Qiang Kabileleri')
       AND lower(settlement.name) IN (lower('Hehuang Vadisi'),lower('Minshan Yaylaları'));

    UPDATE countries
       SET primary_culture_group='QIANG'
     WHERE lower(name)=lower('Qiang Kabileleri');

    UPDATE settlements settlement
       SET culture_group='QIANG',
           religion_key='QIANG_MOUNTAIN_FAITH',
           minority_religion_key=secondary_religion_for('QIANG_MOUNTAIN_FAITH')
      FROM countries country
     WHERE settlement.country_id=country.id
       AND lower(country.name)=lower('Qiang Kabileleri')
       AND lower(settlement.name) IN (
         lower('Zhang Zhung'),lower('Kunlun Yaylası'),lower('Yarlung Vadisi')
       );

    DELETE FROM settlement_religion_shares shares
     USING settlements settlement,countries country
     WHERE shares.settlement_id=settlement.id
       AND settlement.country_id=country.id
       AND lower(country.name)=lower('Qiang Kabileleri')
       AND lower(settlement.name) IN (
         lower('Zhang Zhung'),lower('Kunlun Yaylası'),lower('Yarlung Vadisi')
       );

    INSERT INTO settlement_religion_shares(
      settlement_id,religion_key,primary_percent,secondary_percent
    )
    SELECT settlement.id,'QIANG_MOUNTAIN_FAITH',settlement.religion_adherence_percent,
           100-settlement.religion_adherence_percent
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id
     WHERE lower(country.name)=lower('Qiang Kabileleri')
       AND lower(settlement.name) IN (
         lower('Zhang Zhung'),lower('Kunlun Yaylası'),lower('Yarlung Vadisi')
       )
    ON CONFLICT(settlement_id,religion_key) DO UPDATE SET
      primary_percent=EXCLUDED.primary_percent,
      secondary_percent=EXCLUDED.secondary_percent;
  `
} as const;
