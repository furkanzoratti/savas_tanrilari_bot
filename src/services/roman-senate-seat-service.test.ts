import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("Roma Senatosu dönem performansı sınırı",()=>{
  it("başlangıç turunu dahil, seçim sonuç turunu hariç tutar",()=>{
    const source=readFileSync(new URL("./roman-senate-seat-service.ts",import.meta.url),"utf8");
    expect(source).toContain("resolved_turn>=$2 AND resolved_turn<$3");
    expect(source).toContain("ledger.game_turn>=$2 AND ledger.game_turn<$3");
    expect(source).toContain("end_turn>=$2 AND end_turn<$3");
    expect(source).not.toContain("BETWEEN $2 AND $3");
  });
});
