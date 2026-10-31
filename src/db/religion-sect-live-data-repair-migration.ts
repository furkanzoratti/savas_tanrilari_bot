export const religionSectLiveDataRepairMigration={
  version:237,
  name:"religion_sect_live_data_repair",
  sql:`
    WITH missing_sect AS (
      SELECT settlement_id,religion_key,
             primary_percent+secondary_percent AS family_percent,
             ROUND((primary_percent+secondary_percent)*0.25,2) AS repaired_secondary
        FROM settlement_religion_shares
       WHERE secondary_percent=0 AND primary_percent>0
    )
    UPDATE settlement_religion_shares share
       SET primary_percent=missing_sect.family_percent-missing_sect.repaired_secondary,
           secondary_percent=missing_sect.repaired_secondary,
           updated_at=NOW()
      FROM missing_sect
     WHERE share.settlement_id=missing_sect.settlement_id
       AND share.religion_key=missing_sect.religion_key;

    UPDATE missionary_operations operation
       SET task_type='RELIGION',sect_key=NULL,
           converted_percent=LEAST(100,COALESCE((
             SELECT share.primary_percent+share.secondary_percent
               FROM settlement_religion_shares share
              WHERE share.settlement_id=operation.target_settlement_id
                AND share.religion_key=operation.religion_key
           ),operation.converted_percent,0)),
           updated_at=NOW()
     WHERE operation.status IN ('TRAVELING','ACTIVE')
       AND operation.task_type='RELIGION';

    UPDATE missionary_operations operation
       SET status='COMPLETED',updated_at=NOW()
     WHERE operation.status IN ('TRAVELING','ACTIVE')
       AND operation.task_type='RELIGION'
       AND COALESCE((
         SELECT share.primary_percent+share.secondary_percent
           FROM settlement_religion_shares share
          WHERE share.settlement_id=operation.target_settlement_id
            AND share.religion_key=operation.religion_key
       ),0)>=100;

    UPDATE country_characters character
       SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL
     WHERE character.role='MISSIONARY'
       AND character.assignment IN ('MISSIONARY_TRAVELING','MISSIONARY_CONVERSION')
       AND NOT EXISTS(
         SELECT 1 FROM missionary_operations operation
          WHERE operation.missionary_character_id=character.id
            AND operation.status IN ('TRAVELING','ACTIVE')
       );
  `
} as const;
