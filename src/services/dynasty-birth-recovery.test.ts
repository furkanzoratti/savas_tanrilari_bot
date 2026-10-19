import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const service=readFileSync(new URL("./dynasty-service.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../discord/dynasty-ui.ts",import.meta.url),"utf8");

describe("dynasty pending birth recovery",()=>{
  it("isim düğmesi kaybolan başarılı doğumu yeni zar atmadan yeniden açar",()=>{
    expect(service).toContain("session.status='PENDING_NAME'");
    expect(service).toContain("success:true,resumed:true");
    expect(service).toContain("pendingBirthId:pendingName.id");
    expect(ui).toContain("İsim bekleyen doğum yeniden açıldı.");
    expect(ui).toContain("Yeni doğum zarı atılmadı");
  });

  it("başarısız doğum sonucunu bekleyen isim oturumu gibi işaretlemez",()=>{
    expect(service).toContain("success:false,resumed:false");
    expect(service).toContain("pendingBirthId:null");
  });

  it("hane oyuncusunun bütün yaşayan evli çiftleri seçmesine izin verirken yönetici geçişini ayrı tutar",()=>{
    expect(ui).toContain("parentMemberId,dynastyId:view.id,allowAnyMarriedMember:true");
    expect(service).toContain("allowAnyMarriedMember?:boolean;allowManager?:boolean");
    expect(service).toContain("pendingName.initiated_by!==input.actorId&&!input.allowManager");
    expect(service).toContain("managerOverride:Boolean(input.allowManager)");
  });
});
