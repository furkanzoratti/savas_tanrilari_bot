export const navalReadyRepairReconciliationMigration = {
  version: 198,
  name: "naval_ready_repair_reconciliation",
  sql: `
    UPDATE fleet_repair_groups repair
       SET status='READY',
           completed_at=COALESCE(repair.completed_at,NOW())
      FROM guilds guild
     WHERE repair.guild_id=guild.discord_id
       AND repair.status='REPAIRING'
       AND repair.completion_turn<=guild.current_turn;

    UPDATE naval_ship_damage damage
       SET current_hp=damage.max_hp,
           status='READY',
           updated_at=NOW()
      FROM fleet_repair_groups repair
     WHERE damage.repair_group_id=repair.id
       AND repair.status='READY'
       AND (damage.current_hp<>damage.max_hp OR damage.status<>'READY');
  `
} as const;
