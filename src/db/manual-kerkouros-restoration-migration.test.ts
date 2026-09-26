import { describe,expect,it } from "vitest";
import { manualKerkourosRestorationMigration } from "./manual-kerkouros-restoration-migration.js";

describe("manual Kerkouros restoration migration",()=>{
  it("restores the requested eleven ships to settlement reserves",()=>{
    expect(manualKerkourosRestorationMigration.version).toBe(92);
    expect(manualKerkourosRestorationMigration.sql).toContain("('Büyük Kartaca','Lilybaeum',2)");
    expect(manualKerkourosRestorationMigration.sql).toContain("('Büyük Kartaca','Ibossim',3)");
    expect(manualKerkourosRestorationMigration.sql).toContain("('Mısır','Paraitonion',1)");
    expect(manualKerkourosRestorationMigration.sql).toContain("('Mısır','Kudüs',1)");
    expect(manualKerkourosRestorationMigration.sql).toContain("'kerkouros'");
    expect(manualKerkourosRestorationMigration.sql).toContain("'RESERVE'");
    expect(manualKerkourosRestorationMigration.sql).toContain("quantity=naval_units.quantity+EXCLUDED.quantity");
  });
});
