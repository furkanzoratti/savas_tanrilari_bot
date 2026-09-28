export const pontusSinopArmyRestorationMigration = {
  version: 94,
  name: "restore_pontus_sinop_evacuated_army",
  sql: `
    DO $$
    DECLARE
      transfer_log audit_logs%ROWTYPE;
      pontus_id UUID;
      amasya_id UUID;
      amasya_name TEXT;
      sinop_id UUID;
      restored_army_id UUID;
      restored_total INTEGER;
      current_turn INTEGER;
    BEGIN
      SELECT log.*
        INTO transfer_log
        FROM audit_logs log
        JOIN countries source_country
          ON source_country.id::text=log.details->>'fromCountryId'
         AND source_country.guild_id=log.guild_id
       WHERE log.action='SETTLEMENT_TRANSFER'
         AND lower(source_country.name)=lower('Pontus')
         AND COALESCE((log.details->>'removedArmyPersonnel')::integer,0)=13200
         AND COALESCE((log.details->>'preservedArmyPersonnel')::integer,0)=0
         AND NOT EXISTS (
           SELECT 1 FROM audit_logs restored
            WHERE restored.guild_id=log.guild_id
              AND restored.action='pontus.sinop.army.restore'
              AND restored.details->>'transferAuditId'=log.id::text
         )
       ORDER BY log.created_at DESC
       LIMIT 1;

      IF transfer_log.id IS NULL THEN
        RETURN;
      END IF;

      pontus_id := (transfer_log.details->>'fromCountryId')::uuid;
      sinop_id := transfer_log.entity_id::uuid;

      IF NOT EXISTS (
        SELECT 1 FROM settlements settlement
         WHERE settlement.id=sinop_id AND lower(settlement.name)=lower('Sinop')
      ) THEN
        RAISE EXCEPTION 'Pontus/Sinop asker onarımı durduruldu: devir yerleşkesi doğrulanamadı';
      END IF;

      SELECT settlement.id,settlement.name
        INTO amasya_id,amasya_name
        FROM settlements settlement
       WHERE settlement.country_id=pontus_id
         AND lower(settlement.name)=lower('Amasya')
       FOR UPDATE;

      IF amasya_id IS NULL THEN
        RAISE EXCEPTION 'Pontus/Sinop asker onarımı durduruldu: Pontus devletine bağlı Amasya bulunamadı';
      END IF;

      SELECT guild.current_turn
        INTO current_turn
        FROM guilds guild
       WHERE guild.discord_id=transfer_log.guild_id;

      CREATE TEMP TABLE pontus_sinop_restore_units(
        unit_type TEXT PRIMARY KEY,
        quantity INTEGER NOT NULL
      ) ON COMMIT DROP;

      -- 23 Eylül 2026 10:41:55 UTC tam yedeğinde Sinop'ta bulunan saha askerleri.
      INSERT INTO pontus_sinop_restore_units(unit_type,quantity) VALUES
        ('light_infantry',2800),
        ('slinger',1000),
        ('archer',2000),
        ('heavy_infantry',200),
        ('heavy_cavalry',1200);

      -- Yedekten sonra tamamlanıp devirden önce birliğe katılan eğitim dalgaları.
      INSERT INTO pontus_sinop_restore_units(unit_type,quantity)
      SELECT recruitment.unit_type,SUM(wave.quantity)::integer
        FROM recruitment_orders recruitment
        JOIN recruitment_waves wave ON wave.order_id=recruitment.id
       WHERE recruitment.settlement_id=sinop_id
         AND wave.processed_at>'2026-09-23T10:41:55.446Z'::timestamptz
         AND wave.processed_at<=transfer_log.created_at
       GROUP BY recruitment.unit_type
      ON CONFLICT(unit_type)
      DO UPDATE SET quantity=pontus_sinop_restore_units.quantity+EXCLUDED.quantity;

      -- Aynı zaman aralığında Sinop stokundan terhis edilen askerler geri getirilmez.
      UPDATE pontus_sinop_restore_units restored
         SET quantity=restored.quantity-disbanded.quantity
        FROM (
          SELECT log.details->>'unitType' AS unit_type,
                 SUM((log.details->>'quantity')::integer)::integer AS quantity
            FROM audit_logs log
           WHERE log.guild_id=transfer_log.guild_id
             AND log.action='UNIT_DISBAND'
             AND log.details->>'settlementId'=sinop_id::text
             AND log.created_at>'2026-09-23T10:41:55.446Z'::timestamptz
             AND log.created_at<=transfer_log.created_at
           GROUP BY log.details->>'unitType'
        ) disbanded
       WHERE restored.unit_type=disbanded.unit_type;

      IF EXISTS (SELECT 1 FROM pontus_sinop_restore_units WHERE quantity<=0) THEN
        RAISE EXCEPTION 'Pontus/Sinop asker onarımı durduruldu: yeniden kurulan bileşimde geçersiz miktar var';
      END IF;

      SELECT COALESCE(SUM(quantity),0)::integer
        INTO restored_total
        FROM pontus_sinop_restore_units;

      IF restored_total<>13200 THEN
        RAISE EXCEPTION 'Pontus/Sinop asker onarımı durduruldu: doğrulanan toplam 13.200 yerine %',restored_total;
      END IF;

      INSERT INTO armies(guild_id,country_id,name,created_turn,created_by)
      VALUES(
        transfer_log.guild_id,
        pontus_id,
        'Sinop Tahliye Ordusu',
        current_turn,
        transfer_log.actor_user_id
      )
      RETURNING id INTO restored_army_id;

      INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
      SELECT amasya_id,unit_type,quantity,'GARRISON','ARMY'
        FROM pontus_sinop_restore_units
      ON CONFLICT(settlement_id,unit_type,status,force_type)
      DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity;

      INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
      SELECT restored_army_id,amasya_id,amasya_name,unit_type,quantity
        FROM pontus_sinop_restore_units;

      INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
      SELECT transfer_log.guild_id,
             transfer_log.actor_user_id,
             'pontus.sinop.army.restore',
             'army',
             restored_army_id,
             jsonb_build_object(
               'transferAuditId',transfer_log.id,
               'lostSettlementId',sinop_id,
               'maintenanceSettlementId',amasya_id,
               'maintenanceSettlementName',amasya_name,
               'quantity',restored_total,
               'composition',(
                 SELECT jsonb_object_agg(unit_type,quantity ORDER BY unit_type)
                   FROM pontus_sinop_restore_units
               )
             );
    END $$;
  `
} as const;
