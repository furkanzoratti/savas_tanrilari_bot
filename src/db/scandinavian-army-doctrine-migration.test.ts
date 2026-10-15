import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { scandinavianArmyDoctrineMigration } from "./scandinavian-army-doctrine-migration.js";

describe("scandinavian army doctrine migration", () => {
  it("marks the Scandinavian states and permits their three manually unlockable units", () => {
    expect(scandinavianArmyDoctrineMigration.version).toBe(204);
    expect(scandinavianArmyDoctrineMigration.sql).toContain("is_scandinavian_state");
    expect(scandinavianArmyDoctrineMigration.sql).toContain("'CIMBRIC','CHAEDINIAN','GAUT_SUIONIC'");
    expect(scandinavianArmyDoctrineMigration.sql).toContain("lower('Svege Krallığı')");
    expect(scandinavianArmyDoctrineMigration.sql).toContain("'scandinavian_berserker'");
    expect(scandinavianArmyDoctrineMigration.sql).toContain("'scandinavian_spearmen'");
    expect(scandinavianArmyDoctrineMigration.sql).toContain("'scandinavian_hunters'");
    expect(scandinavianArmyDoctrineMigration.sql).not.toContain("INSERT INTO country_special_unit_unlocks");
    expect(migrations).toContain(scandinavianArmyDoctrineMigration);
  });
});
