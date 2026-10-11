import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("bozkır siyaseti yönetim paneli",()=>{
  it("yalnız Kurultay ve haraç işlemlerini gösterir",()=>{
    const html=read("./public/index.html");
    const app=read("./public/app.js");
    expect(html).toContain('data-route="steppe-politics"');
    expect(html).toContain("Bozkır Kurultayı");
    expect(app).toContain('api("/api/steppe-politics")');
    expect(app).toContain("Bozkır Kurultayı ve Haraç");
    expect(app).toContain("Son haraç teklifleri");
    expect(app).toContain("Otorite, bağlılık ve savaş çağrısı sistemi kullanılmaz.");
  });
});
