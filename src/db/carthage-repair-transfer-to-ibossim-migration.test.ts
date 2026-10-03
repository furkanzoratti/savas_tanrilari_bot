import {describe,expect,it} from "vitest";
import {carthageRepairTransferToIbossimMigration} from "./carthage-repair-transfer-to-ibossim-migration.js";

describe("Carthage repair transfer to Ibossim migration",()=>{
  it("moves only the active named fleet repair and keeps its schedule",()=>{
    expect(carthageRepairTransferToIbossimMigration.version).toBe(123);
    expect(carthageRepairTransferToIbossimMigration.name).toBe("carthage_repair_transfer_to_ibossim");
    expect(carthageRepairTransferToIbossimMigration.sql).toContain("lower(country.name)=lower('Büyük Kartaca')");
    expect(carthageRepairTransferToIbossimMigration.sql).toContain("lower(source_fleet.name)=lower('AKDENİZ DENİZ KUVVETLERİ')");
    expect(carthageRepairTransferToIbossimMigration.sql).toContain("lower(ibossim.name)=lower('Ibossim')");
    expect(carthageRepairTransferToIbossimMigration.sql).toContain("repair.status='REPAIRING'");
    expect(carthageRepairTransferToIbossimMigration.sql).toContain("shipyard_level=ibossim_shipyard.level::integer");
    expect(carthageRepairTransferToIbossimMigration.sql).not.toContain("completion_turn=");
  });
});
