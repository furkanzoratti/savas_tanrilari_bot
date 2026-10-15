import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { scandinavianNavalDoctrineMigration } from "./scandinavian-naval-doctrine-migration.js";

describe("scandinavian naval doctrine migration", () => {
  it("marks all four kingdoms and safely extends every constrained ship table", () => {
    expect(scandinavianNavalDoctrineMigration.version).toBe(205);
    for (const country of ["Svege Krallığı", "Kimbri Krallığı", "Hedin Krallığı", "Gaut Krallığı"]) {
      expect(scandinavianNavalDoctrineMigration.sql).toContain(`lower('${country}')`);
    }
    for (const table of ["fleet_ships", "naval_ship_damage", "battle_ship_hulls"]) {
      expect(scandinavianNavalDoctrineMigration.sql).toContain(`ALTER TABLE ${table}`);
    }
    expect(scandinavianNavalDoctrineMigration.sql).toContain("'kerkouros','hjortspring','trireme','quinquereme'");
    expect(scandinavianNavalDoctrineMigration.sql).not.toContain("DELETE FROM");
    expect(scandinavianNavalDoctrineMigration.sql).not.toContain("UPDATE naval_units");
    expect(migrations).toContain(scandinavianNavalDoctrineMigration);
  });
});
