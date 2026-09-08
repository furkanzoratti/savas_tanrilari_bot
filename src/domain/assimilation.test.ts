import { describe,expect,it } from "vitest";
import { assimilationCompletionTurn } from "./assimilation.js";

describe("otomatik asimilasyon süresi",()=>{
  it("Şarap erişimini bir tur indirim olarak uygular",()=>{
    expect(assimilationCompletionTurn({conqueredTurn:2,hasWine:true})).toBe(7);
  });

  it("Şarap ve Diplomat indirimlerini birlikte uygular",()=>{
    expect(assimilationCompletionTurn({conqueredTurn:2,hasWine:true,diplomatSkillBonus:1})).toBe(6);
    expect(assimilationCompletionTurn({conqueredTurn:2,hasWine:true,diplomatSkillBonus:2})).toBe(5);
  });

  it("Şarap yoksa mevcut altı turluk temel süreyi korur",()=>{
    expect(assimilationCompletionTurn({conqueredTurn:2,hasWine:false})).toBe(8);
  });
});
