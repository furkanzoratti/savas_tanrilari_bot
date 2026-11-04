import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const service=readFileSync(new URL("./training-formation-service.ts",import.meta.url),"utf8");
const game=readFileSync(new URL("./game-service.ts",import.meta.url),"utf8");

describe("eğitimden otomatik ordu ve filo oluşturma",()=>{
  it("adı üretim yerleşkesi ve tamamlanma turuyla kurar",()=>{
    expect(service).toContain("Tur ${turn} Eğitim Ordusu");
    expect(service).toContain("Tur ${turn} Üretim Filosu");
    expect(service).toContain("availableFormationName");
    expect(service).toContain("lower(name)=lower($2)");
  });

  it("aynı yerleşke ve turdaki tamamlanmaları tek eğitim oluşumunda toplar",()=>{
    expect(service).toContain("ON CONFLICT(country_id,origin_settlement_id,completion_turn)");
    expect(service).toContain("quantity=army_units.quantity+EXCLUDED.quantity");
    expect(service).toContain("quantity=fleet_ships.quantity+EXCLUDED.quantity");
  });

  it("tur ilerlemesindeki tamamlanmış kara ve deniz üretimlerini otomatik tahsis eder",()=>{
    expect(game).toContain("await assignCompletedTrainingToArmy(client");
    expect(game).toContain("await assignCompletedShipsToFleet(client");
    expect(game).toContain('wave.unit_type!=="observer"&&wave.unit_type!=="militia"');
  });

});
