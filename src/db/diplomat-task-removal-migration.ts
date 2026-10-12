export const diplomatTaskRemovalMigration={
  version:188,
  name:"remove_diplomatic_vassalization_and_sovereignty_defense",
  sql:`
    UPDATE diplomat_operations
       SET status='CANCELLED',
           completion_text='Bu diplomat görevi sistemden kaldırıldı.',
           updated_at=NOW()
     WHERE task_type='VASSALIZE'
       AND status IN ('TRAVELING','ACTIVE','PAUSED');

    UPDATE country_characters character
       SET assignment='NONE',
           assigned_settlement_id=NULL,
           assignment_ready_turn=NULL
     WHERE character.role='DIPLOMAT'
       AND character.character_status='ACTIVE'
       AND character.assignment IN ('DIPLOMAT_VASSALIZE','DIPLOMAT_DEFENSE')
       AND NOT EXISTS (
         SELECT 1
           FROM diplomat_operations operation
          WHERE operation.diplomat_character_id=character.id
            AND operation.status IN ('TRAVELING','ACTIVE','PAUSED')
            AND operation.task_type<>'VASSALIZE'
       );
  `
} as const;
