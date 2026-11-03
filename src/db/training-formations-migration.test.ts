import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("otomatik eğitim orduları ve filoları migrationı",()=>{
  const migration=migrations.find((item)=>item.version===241);

  it("eğitim oluşumlarının köken yerleşkesini ve tamamlanma turunu saklar",()=>{
    expect(migration?.name).toBe("automatic_training_armies_and_fleets");
    expect(migration?.sql).toContain("formation_kind TEXT NOT NULL DEFAULT 'PERMANENT'");
    expect(migration?.sql).toContain("origin_settlement_id UUID REFERENCES settlements(id)");
    expect(migration?.sql).toContain("completion_turn INTEGER");
    expect(migration?.sql).toContain("armies_training_formation_unique");
    expect(migration?.sql).toContain("fleets_training_formation_unique");
  });

  it("askeri geçmişi indeksler ve mevcut kayıtların devletini kalıcılaştırır",()=>{
    expect(migration?.sql).toContain("audit_logs_military_history_idx");
    expect(migration?.sql).toContain("jsonb_set(log.details,'{countryId}'");
  });
});
