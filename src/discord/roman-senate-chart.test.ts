import {describe,expect,it} from "vitest";
import {renderRomanSenateChart,romanFamilyColor,romanSenateLegend} from "./roman-senate-chart.js";

describe("Dinamik Roma Senatosu görseli",()=>{
  const families=[
    {name:"Scipio Ailesi",senateSeats:18},
    {name:"Magnus Ailesi",senateSeats:18},
    {name:"Cato Ailesi",senateSeats:12},
    {name:"Nero Ailesi",senateSeats:12},
    {name:"Julius Ailesi",senateSeats:40}
  ];
  it("100 koltuğu güncel aile renkleriyle geçerli PNG olarak üretir",()=>{
    const image=renderRomanSenateChart(families as never);
    expect([...image.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
    expect(image.length).toBeGreaterThan(10_000);
  });
  it("aile renklerini sabit tutar ve açıklamada koltukları listeler",()=>{
    expect(romanFamilyColor("Scipio Ailesi").hex).toBe("#d4af37");
    expect(romanSenateLegend(families as never)).toContain("Magnus Ailesi** — 18 koltuk");
  });
});
