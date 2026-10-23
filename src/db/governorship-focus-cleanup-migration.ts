export const governorshipFocusCleanupMigration = {
  version: 228,
  name: "remove_governorship_integration_focus",
  sql: `
    UPDATE country_characters character
       SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL
     WHERE character.assignment='GOVERNOR'
       AND EXISTS(
         SELECT 1 FROM settlement_governorships governorship
          WHERE governorship.character_id=character.id
            AND governorship.focus='INTEGRATION'
            AND governorship.status='ACTIVE'
       );

    UPDATE settlement_governorships
       SET status='ENDED',
           ended_turn=COALESCE(ended_turn,(SELECT current_turn FROM guilds WHERE discord_id=settlement_governorships.guild_id)),
           ended_reason=COALESCE(ended_reason,'Bütünleşme odağı kaldırıldı; asimilasyon diplomat göreviyle yürütülür.'),
           updated_at=NOW()
     WHERE status='ACTIVE' AND focus='INTEGRATION';

    ALTER TABLE settlement_governorships DROP CONSTRAINT IF EXISTS settlement_governorships_focus_check;
    ALTER TABLE settlement_governorships ADD CONSTRAINT settlement_governorships_focus_check CHECK(
      focus IN ('REVENUE','PUBLIC_ORDER','RECONSTRUCTION')
      OR (focus='INTEGRATION' AND status='ENDED')
    );
  `
} as const;
