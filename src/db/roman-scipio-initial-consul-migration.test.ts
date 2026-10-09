import {describe,expect,it} from "vitest";
import {romanScipioInitialConsulMigration} from "./roman-scipio-initial-consul-migration.js";

describe("Roma başlangıç konsülü",()=>{
  it("Scipio ailesini mevcut turda göreve getirip ilk seçimi altı tur sonraya kurar",()=>{
    expect(romanScipioInitialConsulMigration.version).toBe(157);
    expect(romanScipioInitialConsulMigration.sql).toContain("current_consul_family_id=family.id");
    expect(romanScipioInitialConsulMigration.sql).toContain("term_started_turn=guild.current_turn");
    expect(romanScipioInitialConsulMigration.sql).toContain("next_election_turn=guild.current_turn+6");
    expect(romanScipioInitialConsulMigration.sql).toContain("status='CANCELLED'");
  });
});
