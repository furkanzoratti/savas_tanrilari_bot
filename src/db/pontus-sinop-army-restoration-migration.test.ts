import { describe, expect, it } from "vitest";
import { pontusSinopArmyRestorationMigration } from "./pontus-sinop-army-restoration-migration.js";

describe("pontus sinop army restoration migration", () => {
  it("restores the verified force only once and assigns its upkeep to Amasya", () => {
    expect(pontusSinopArmyRestorationMigration.version).toBe(94);
    expect(pontusSinopArmyRestorationMigration.sql).toContain("removedArmyPersonnel')::integer,0)=13200");
    expect(pontusSinopArmyRestorationMigration.sql).toContain("restored_total<>13200");
    expect(pontusSinopArmyRestorationMigration.sql).toContain("pontus.sinop.army.restore");
    expect(pontusSinopArmyRestorationMigration.sql).toContain("lower(settlement.name)=lower('Amasya')");
    expect(pontusSinopArmyRestorationMigration.sql).toContain("INSERT INTO army_units");
    expect(pontusSinopArmyRestorationMigration.sql).toContain("INSERT INTO unit_stacks");
  });
});
