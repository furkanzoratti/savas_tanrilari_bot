export const academyRoleConstraintRepairMigration = {
  version: 150,
  name: "academy_role_constraints_runtime_repair",
  sql: `
    -- Version 37 bazı çalışan veritabanlarında eski haliyle uygulanmıştı. Eski
    -- migration dosyasını düzeltmek uygulanmış şemayı değiştirmediği için
    -- Akademi Sv2/Sv3 Diplomat seçimleri hâlâ eski CHECK kısıtına takılabiliyordu.
    ALTER TABLE academy_training_sessions
      DROP CONSTRAINT IF EXISTS academy_training_sessions_roll_sides_check;
    ALTER TABLE academy_training_sessions
      ADD CONSTRAINT academy_training_sessions_roll_sides_check
      CHECK (roll_sides IN (20,30,40));

    ALTER TABLE academy_training_sessions
      DROP CONSTRAINT IF EXISTS academy_training_sessions_excluded_role_check;
    ALTER TABLE academy_training_sessions
      ADD CONSTRAINT academy_training_sessions_excluded_role_check
      CHECK (excluded_role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT'));

    ALTER TABLE academy_training_sessions
      DROP CONSTRAINT IF EXISTS academy_training_sessions_selected_role_check;
    ALTER TABLE academy_training_sessions
      ADD CONSTRAINT academy_training_sessions_selected_role_check
      CHECK (selected_role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT'));

    ALTER TABLE academy_training_sessions
      DROP CONSTRAINT IF EXISTS academy_training_sessions_result_role_check;
    ALTER TABLE academy_training_sessions
      ADD CONSTRAINT academy_training_sessions_result_role_check
      CHECK (result_role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT'));
  `
} as const;
