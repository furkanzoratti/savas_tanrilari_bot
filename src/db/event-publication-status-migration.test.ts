import { describe,expect,it } from "vitest";
import { eventPublicationStatusMigration } from "./event-publication-status-migration.js";

describe("olay yayın durumları göçü",()=>{
  it("casusluk yayın denemelerini ve hata nedenini kalıcı tutar",()=>{
    expect(eventPublicationStatusMigration.version).toBe(217);
    expect(eventPublicationStatusMigration.sql).toContain("public_delivery_status");
    expect(eventPublicationStatusMigration.sql).toContain("public_publish_attempts");
    expect(eventPublicationStatusMigration.sql).toContain("public_last_error");
  });
});
