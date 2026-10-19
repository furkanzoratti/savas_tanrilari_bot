import {describe,expect,it} from "vitest";
import {nilAcademyPendingCleanupMigration} from "./nil-academy-pending-cleanup-migration.js";

describe("Nil Akademi bekleyen eğitim temizliği",()=>{
  it("yalnızca Nil İmparatorluğunun tamamlanmamış eğitimlerini iptal eder",()=>{
    expect(nilAcademyPendingCleanupMigration.version).toBe(220);
    expect(nilAcademyPendingCleanupMigration.sql).toContain("country.name='Nil İmparatorluğu'");
    expect(nilAcademyPendingCleanupMigration.sql).toContain("status IN ('PENDING_ROLL','AWAITING_NAME')");
    expect(nilAcademyPendingCleanupMigration.sql).toContain("SET status='CANCELLED'");
  });
});
