import { EmbedBuilder } from "discord.js";
import { TURN_BANNER_URL } from "./assets.js";

export type TurnAnnouncement = "ADVANCE" | "OPEN" | "PAUSE" | "CLOSE";

export interface TurnAnnouncementInput {
  kind: TurnAnnouncement;
  turn: number;
  acquisition?: boolean;
  completedBuildings?: number;
  recruitmentArrivals?: number;
  completedShips?: number;
  completedSiegeAssets?: number;
  garrisonUpgrades?: number;
  completedBuildingDetails?: Array<{ settlementName: string; buildingName: string; level: number }>;
  recruitmentArrivalDetails?: Array<{ settlementName: string; unitName: string; quantity: number }>;
  completedShipDetails?: Array<{ settlementName: string; shipName: string; quantity: number }>;
  completedRepairDetails?: Array<{ countryName:string;repairFleetName:string;settlementName:string;ships:number }>;
  completedSiegeDetails?: Array<{ settlementName: string; assetName: string; quantity: number }>;
  garrisonReplenishmentStartedDetails?: Array<{ settlementName: string; personnel: number; cost: number; completionTurn: number; reason: string }>;
  garrisonReplenishmentCompletedDetails?: Array<{ settlementName: string; personnel: number }>;
  garrisonUpgradeDetails?: string[];
  activatedPolicyDetails?: Array<{ settlementName: string; policyName: string }>;
  unrestDetails?: Array<{ settlementName: string; chance: number; roll: number }>;
  starvationDetails?: Array<{ settlementName: string; remaining: number; capacity: number }>;
  pantheonLoanDetails?: Array<{ settlementName: string; amount: number; remaining: number }>;
  incomePenaltyDetails?: Array<{ settlementName: string; percent: number; deductedAmount: number; remainingAcquisitionTurns: number; reason: string }>;
  mercenaryArrivalDetails?: Array<{ countryName: string; settlementName: string; companyName: string; upkeep: number }>;
  mercenaryUpkeepDetails?: Array<{ countryName: string; companyName: string; amount: number }>;
  mercenaryUnpaidDetails?: Array<{ countryName: string; companyName: string; amount: number }>;
  mercenaryEndedDetails?: Array<{ countryName: string; companyName: string; reason: string }>;
  assimilatedSettlementDetails?: Array<{ countryName: string; settlementName: string; diplomatName: string | null }>;
  christianSpreadDetails?: Array<{
    targetCountryName:string;targetSettlementName:string;
    beforePercent:number;afterPercent:number;
    beforeCatholicPercent:number;afterCatholicPercent:number;
    conversionPercent:number;completed:boolean;
  }>;
  lastStandDetails?:Array<{
    kind:"STARTED"|"ONGOING"|"RECOVERED"|"FAILED";
    countryName:string;deadlineTurn:number;remainingTurns:number;armyPersonnel:number;
    settlementName:string|null;reason:string|null;
  }>;
  stability?:{
    enabled:boolean;
    warExhaustion:Array<{countryName:string;before:number;after:number;activeWars:number;newBattleLosses:number;raidsSuffered:number;settlementsLost:number}>;
    settlements:Array<{countryName:string;settlementName:string;prosperityBefore:number;prosperityAfter:number;rebellionBefore:number;rebellionAfter:number;unrestRisk:number;roll:number|null;factionType:string|null;factionName:string|null;outbreak:boolean;rebelPersonnel:number;rebelMilitaryPower:number}>;
  };
  romanFamilyIncomeDetails?:Array<{familyName:string;businessIncome:number;consulStipend:number;total:number}>;
  romanGovernorshipDetails?:Array<{countryName:string;familyName:string;governorName:string;settlementName:string;treasuryShare:number;influenceGain:number;completed:boolean}>;
  romanElectionOpenedDetails?:Array<{countryName:string;sequence:number;closesTurn:number}>;
  romanFamilyLifecycleDetails?:Array<{familyName:string;agedMembers:number;birthAttempts:number;births:number;events:string[]}>;
  countryEconomyDetails?:Array<{
    countryName:string;buildingIncome:number;taxIncome:number;landTradeIncome:number;seaTradeIncome:number;
    upkeep:number;net:number;populationGain:number;settlementCount:number;
  }>;
  romanPolitics?:{
    proposalResults:Array<{countryName:string;title:string;passed:boolean;yesWeight:number;noWeight:number;requiredWeight:number}>;
    officeYields:Array<{familyName:string;characterName:string;officeLabel:string;treasury:number;influence:number;reputation:number;scandal:number;completed:boolean}>;
    lawEffects:Array<{countryName:string;lawTitle:string;summary:string}>;
  };
  movement?:{
    enabled:boolean;stage:string;turn:number;processed:number;advanced:number;completed:number;blocked:number;ongoing:number;
    ownershipUpdates:number;alreadyProcessed:boolean;reconChecks:number;encounters:number;
    muster:{processed:number;advanced:number;joined:number;blocked:number;waiting:number};
    disembarkations:{processed:number;completed:number;blocked:number};
  };
  characterAutomation?:{
    espionageResolved:number;espionagePublished:number;characterEvents:number;characterPublished:number;
    dynastyProcessed:number;dynastyEvents:number;dynastyDeathChecks:number;dynastyDeathLogsPublished:number;
    dynastyNpcBirths:number;dynastyNpcMarriages:number;warnings:string[];
  };
}

let activeFieldCapture:string[]|null=null;

function fieldValue(lines: string[]): string {
  const value=lines.join("\n");
  activeFieldCapture?.push(value);
  return value.slice(0,1_024);
}

type TurnAnnouncementField = { name: string; value: string; inline?: boolean };

const TURN_CARD_MAX_TEXT = 5_800;
const TURN_CARD_MAX_FIELDS=25;
const fullAdvanceFields=new WeakMap<EmbedBuilder,TurnAnnouncementField[]>();

export function turnAnnouncementTextLength(embed: EmbedBuilder): number {
  const data = embed.toJSON();
  return (data.title?.length ?? 0)
    + (data.description?.length ?? 0)
    + (data.footer?.text.length ?? 0)
    + (data.author?.name.length ?? 0)
    + (data.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

function splitField(field:TurnAnnouncementField):TurnAnnouncementField[]{
  const pieces:string[]=[];
  for(const line of field.value.split("\n")){
    if(line.length<=1_024){pieces.push(line);continue;}
    for(let offset=0;offset<line.length;offset+=1_024)pieces.push(line.slice(offset,offset+1_024));
  }
  const values:string[]=[];
  let current="";
  for(const piece of pieces){
    const next=current?`${current}\n${piece}`:piece;
    if(next.length<=1_024){current=next;continue;}
    if(current)values.push(current);
    current=piece;
  }
  if(current||!values.length)values.push(current||"—");
  return values.map((value,index)=>({
    ...field,
    name:index===0?field.name:`${field.name} • Devam ${index+1}`.slice(0,256),
    value
  }));
}

function paginateFields(fields:TurnAnnouncementField[]):TurnAnnouncementField[][]{
  const chunks=fields.flatMap(splitField);
  const pages:TurnAnnouncementField[][]=[];
  let page:TurnAnnouncementField[]=[];
  let textLength=0;
  for(const field of chunks){
    const fieldLength=field.name.length+field.value.length;
    if(page.length&&(page.length>=TURN_CARD_MAX_FIELDS||textLength+fieldLength>TURN_CARD_MAX_TEXT-500)){
      pages.push(page);page=[];textLength=0;
    }
    page.push(field);textLength+=fieldLength;
  }
  if(page.length)pages.push(page);
  return pages.length?pages:[[]];
}

export function turnAnnouncement(input: TurnAnnouncementInput): EmbedBuilder {
  if (input.kind !== "ADVANCE") {
    const details = {
      OPEN: { color: 0x3f7f5f, title: `🟢 TUR ${input.turn} HAREKETLERE AÇILDI`, description: "Oyuncular askerî hareketlerini, diplomasilerini ve diğer tur hamlelerini gönderebilir. Hamlelerin açık ve eksiksiz yazılması gerekir." },
      PAUSE: { color: 0xd28b26, title: `⏸️ TUR ${input.turn} DURDURULDU`, description: "Yeni oyuncu hamleleri durdurulmuştur. Savaşlar, isyanlar ve tur içi olaylar oyun yöneticisi tarafından çözülmektedir." },
      CLOSE: { color: 0x8b1e1e, title: `🔴 TUR ${input.turn} KAPATILDI`, description: "Bu turun bütün hareketleri sona ermiştir. Yeni hamle gönderilemez; bir sonraki tur duyurusu beklenmelidir." }
    } as const;
    const selected = details[input.kind];
    return new EmbedBuilder().setColor(selected.color).setTitle(selected.title).setDescription(selected.description).setImage(TURN_BANNER_URL).setFooter({ text: "Antik Medeniyetler Role Play • Resmî Tur Duyurusu" }).setTimestamp();
  }

  activeFieldCapture=[];
  const embed = new EmbedBuilder()
    .setColor(0xb58b32)
    .setTitle(`⚔️ TUR ${input.turn} BAŞLADI`)
    .setDescription([
      "Yeni rol turu açılmıştır. Askerî hareketler, diplomatik girişimler ve devlet hamleleri işleme alınabilir.",
      input.acquisition ? "🪙 **Bu tur bir Alım Turudur.** Gelir, nüfus ve bakım sonuçları işlenmiştir." : "Bu tur standart rol turudur.",
      `🏗️ Tamamlanan bina: **${input.completedBuildings ?? 0}** • ⚔️ Katılan asker: **${(input.recruitmentArrivals ?? 0).toLocaleString("tr-TR")}**`,
      `🛡️ Tamamlanan garnizon: **${input.garrisonUpgrades ?? 0}** • 🚢 Tamamlanan gemi: **${input.completedShips ?? 0}** • 🛠️ Kuşatma aleti: **${input.completedSiegeAssets ?? 0}**`
    ].join("\n"))
    .setImage(TURN_BANNER_URL)
    .setFooter({ text: "Antik Medeniyetler Role Play • Resmî Tur Duyurusu" })
    .setTimestamp();

  if (input.completedBuildingDetails?.length) embed.addFields({
    name: "🏗️ Tamamlanan Binalar",
    value: fieldValue(input.completedBuildingDetails.map((item) => `• **${item.settlementName}** — ${item.buildingName} Sv${item.level}`))
  });
  if (input.recruitmentArrivalDetails?.length) embed.addFields({
    name: "⚔️ Orduya Katılan Birlikler",
    value: fieldValue(input.recruitmentArrivalDetails.map((item) => `• **${item.settlementName}** — ${item.quantity.toLocaleString("tr-TR")} ${item.unitName}`))
  });
  if (input.completedShipDetails?.length) embed.addFields({
    name: "🚢 Tamamlanan Gemiler",
    value: fieldValue(input.completedShipDetails.map((item) => `• **${item.settlementName}** — ${item.quantity.toLocaleString("tr-TR")} ${item.shipName}`))
  });
  if(input.completedRepairDetails?.length)embed.addFields({
    name:"🛠️ Tamiri Tamamlanan Filolar",
    value:fieldValue(input.completedRepairDetails.map((item)=>
      `• **${item.countryName} / ${item.repairFleetName}** — ${item.ships.toLocaleString("tr-TR")} gemi • ${item.settlementName}\n  /filo tamirden-ekle ile normal filoya aktarılabilir.`
    ))
  });
  if (input.completedSiegeDetails?.length) embed.addFields({
    name: "🛠️ Tamamlanan Kuşatma Aletleri",
    value: fieldValue(input.completedSiegeDetails.map((item) => `• **${item.settlementName}** — ${item.quantity.toLocaleString("tr-TR")} ${item.assetName}`))
  });
  if (input.garrisonReplenishmentCompletedDetails?.length||input.garrisonUpgradeDetails?.length) embed.addFields({
    name: "🛡️ Garnizonu Tamamlanan Yerleşkeler",
    value: fieldValue(input.garrisonReplenishmentCompletedDetails?.length
      ?input.garrisonReplenishmentCompletedDetails.map((item) => `• **${item.settlementName}** — ${item.personnel.toLocaleString("tr-TR")} asker`)
      :(input.garrisonUpgradeDetails??[]).map((settlementName)=>`• **${settlementName}**`))
  });
  if (input.garrisonReplenishmentStartedDetails?.length) embed.addFields({
    name: "🛡️ Başlatılan Zorunlu Garnizon Yenilemeleri",
    value: fieldValue(input.garrisonReplenishmentStartedDetails.map((item) =>
      `• **${item.settlementName}** — ${item.personnel.toLocaleString("tr-TR")} asker • ${item.cost.toLocaleString("tr-TR")} Altın • Tur ${item.completionTurn}`
      +` • ${item.reason}`
    ))
  });
  if (input.activatedPolicyDetails?.length) embed.addFields({
    name: "⚖️ Etkinleşen Şehir Politikaları",
    value: fieldValue(input.activatedPolicyDetails.map((item) => `• **${item.settlementName}** — ${item.policyName}`))
  });
  if (input.assimilatedSettlementDetails?.length) embed.addFields({
    name: "🤝 Tamamlanan Asimilasyonlar",
    value: fieldValue(input.assimilatedSettlementDetails.map((item) =>
      `• **${item.countryName} / ${item.settlementName}**${item.diplomatName ? ` — Diplomat: ${item.diplomatName}` : ""}`
    ))
  });
  if(input.countryEconomyDetails?.length)embed.addFields({
    name:"💰 Ülke Ekonomi Dökümü",
    value:fieldValue(input.countryEconomyDetails.map((item)=>
      `• **${item.countryName}** — Bina ${item.buildingIncome.toLocaleString("tr-TR")} • Vergi ${item.taxIncome.toLocaleString("tr-TR")} • Kara ${item.landTradeIncome.toLocaleString("tr-TR")} • Deniz ${item.seaTradeIncome.toLocaleString("tr-TR")} • Bakım −${item.upkeep.toLocaleString("tr-TR")} • **Net ${item.net>=0?"+":""}${item.net.toLocaleString("tr-TR")} Altın** • Nüfus +${item.populationGain.toLocaleString("tr-TR")} • ${item.settlementCount} yerleşke`
    ))
  });
  if(input.romanFamilyIncomeDetails?.length)embed.addFields({
    name:"🏛️ Roma Siyasi Aile Gelirleri",
    value:fieldValue(input.romanFamilyIncomeDetails.map((item)=>
      `• **${item.familyName}** — +${item.total.toLocaleString("tr-TR")} Altın`+
      ` • İşletmeler ${item.businessIncome.toLocaleString("tr-TR")}`+
      (item.consulStipend?` • Konsül ödeneği ${item.consulStipend.toLocaleString("tr-TR")}`:"")
    ))
  });
  if(input.romanGovernorshipDetails?.length)embed.addFields({
    name:"🏺 Roma Valilik Getirileri",
    value:fieldValue(input.romanGovernorshipDetails.map((item)=>
      `• **${item.familyName} / ${item.settlementName}** — ${item.governorName} • +${item.influenceGain} nüfuz`+
      (item.treasuryShare?` • +${item.treasuryShare.toLocaleString("tr-TR")} Altın`:` • Bu tur hazine payı yok`)+
      (item.completed?" • Görev süresi tamamlandı":"")
    ))
  });
  if(input.romanElectionOpenedDetails?.length)embed.addFields({
    name:"🗳️ Roma Konsül Seçimleri",
    value:fieldValue(input.romanElectionOpenedDetails.map((item)=>
      `• **${item.countryName}** — ${item.sequence}. seçim açıldı • Oyların son turu: **Tur ${item.closesTurn}**`
    ))
  });
  if(input.romanFamilyLifecycleDetails?.length)embed.addFields({
    name:"🌿 Roma Aile Yaşamı",
    value:fieldValue(input.romanFamilyLifecycleDetails.flatMap((item)=>[
      `• **${item.familyName}** — ${item.agedMembers} yaşayan üye yaşlandı • ${item.birthAttempts} çocuk denemesi • ${item.births} doğum`,
      ...item.events.map((event)=>`  ↳ ${event}`)
    ]))
  });
  if(input.romanPolitics?.proposalResults.length)embed.addFields({
    name:"🏛️ Roma Senatosu Sonuçları",
    value:fieldValue(input.romanPolitics.proposalResults.map((item)=>
      `• ${item.passed?"✅":"❌"} **${item.title}** — Evet ${item.yesWeight} • Hayır ${item.noWeight} • Gereken ${item.requiredWeight}`
    ))
  });
  if(input.romanPolitics?.officeYields.length)embed.addFields({
    name:"🏺 Roma Makamları",
    value:fieldValue(input.romanPolitics.officeYields.map((item)=>
      `• **${item.characterName} / ${item.officeLabel}** — ${item.familyName} • +${item.influence} nüfuz`+
      (item.treasury?` • +${item.treasury.toLocaleString("tr-TR")} Altın`:"")+
      (item.reputation?` • +${item.reputation} itibar`:"")+(item.scandal?` • ${item.scandal} skandal`:"")+(item.completed?" • Görev tamamlandı":"")
    ))
  });
  if(input.romanPolitics?.lawEffects.length)embed.addFields({
    name:"📜 Yürürlükteki Roma Yasaları",
    value:fieldValue(input.romanPolitics.lawEffects.map((item)=>`• **${item.lawTitle}** — ${item.summary}`))
  });
  if (input.christianSpreadDetails?.length) embed.addFields({
    name:"✝️ Hristiyan Sınır Yayılımı",
    value:fieldValue(input.christianSpreadDetails.map((item)=>
      `• **${item.targetCountryName} / ${item.targetSettlementName}** — Hristiyanlık %${item.beforePercent} → **%${item.afterPercent}** • Katoliklik %${item.beforeCatholicPercent} → **%${item.afterCatholicPercent}**${item.conversionPercent>0?` • Dönüşüm: +${item.conversionPercent} puan`:""}${item.completed?" • ✅ %70 hedefi tamamlandı; süreç durduruldu":""}`
    ))
  });
  if(input.lastStandDetails?.length)embed.addFields({
    name:"⚔️ Son Direniş Durumu",
    value:fieldValue(input.lastStandDetails.map((item)=>{
      if(item.kind==="ONGOING")return `• **${item.countryName}** — ${item.armyPersonnel.toLocaleString("tr-TR")} saha askeri • **${item.remainingTurns} tur** kaldı • Son gün Tur ${item.deadlineTurn}`;
      if(item.kind==="RECOVERED")return `• 🏛️ **${item.countryName}** — ${item.settlementName??"Eski yerleşke"} geri alındı; devlet yeniden toprak sahibi oldu.`;
      if(item.kind==="FAILED")return `• 🏴 **${item.countryName}** — ${item.reason??"Son Direniş başarısız oldu."}`;
      return `• ⚔️ **${item.countryName}** — Son Direniş başladı; son gün Tur ${item.deadlineTurn}.`;
    }))
  });
  if(input.stability?.warExhaustion.length)embed.addFields({
    name:"⚔️ Savaş Yorgunluğu",
    value:fieldValue(input.stability.warExhaustion.map((item)=>
      `• **${item.countryName}** — ${item.before} → **${item.after}**${item.activeWars?` • ${item.activeWars} savaş`:" • Barışta toparlanma"}${item.newBattleLosses?` • ${item.newBattleLosses.toLocaleString("tr-TR")} yeni kayıp`:""}${item.raidsSuffered?` • ${item.raidsSuffered} yağma`:""}${item.settlementsLost?` • ${item.settlementsLost} toprak kaybı`:""}`
    ))
  });
  const outbreaks=input.stability?.settlements.filter((item)=>item.outbreak)??[];
  if(outbreaks.length)embed.addFields({
    name:"🔥 İsyanlar",
    value:fieldValue(outbreaks.map((item)=>
      `• **${item.factionName??`${item.settlementName} İsyancıları`}** — ${item.countryName} / ${item.settlementName} • ${item.rebelPersonnel.toLocaleString("tr-TR")} eğitimli asker • Güç ${item.rebelMilitaryPower.toLocaleString("tr-TR")}`
    ))
  });
  const escalations=input.stability?.settlements.filter((item)=>!item.outbreak&&(
    item.rebellionAfter!==item.rebellionBefore||item.prosperityAfter!==item.prosperityBefore
  ))??[];
  if(escalations.length)embed.addFields({
    name:"🌿 Refah ve İsyan Gerilimi",
    value:fieldValue(escalations.map((item)=>
      `• **${item.countryName} / ${item.settlementName}** — Refah ${item.prosperityBefore}→${item.prosperityAfter} • İsyan ${item.rebellionBefore}→**${item.rebellionAfter}**${item.roll!==null?` • Risk %${item.unrestRisk}, Zar ${item.roll}`:""}`
    ))
  });
  if (input.unrestDetails?.length) embed.addFields({
    name: "⚠️ Huzursuzluk Olayları",
    value: fieldValue(input.unrestDetails.map((item) => `• **${item.settlementName}** — Risk %${item.chance} • Zar ${item.roll}`))
  });
  if (input.starvationDetails?.length) embed.addFields({
    name: "🏰 Kuşatma Erzak Durumu",
    value: fieldValue(input.starvationDetails.map((item) => `• **${item.settlementName}** — ${item.remaining}/${item.capacity} tur${item.remaining === 0 ? " • Erzak tükendi" : ""}`))
  });
  if (input.pantheonLoanDetails?.length) embed.addFields({
    name: "🏛️ Panteon Kredisi Ödemeleri",
    value: fieldValue(input.pantheonLoanDetails.map((item) => `• **${item.settlementName}** — ${item.amount.toLocaleString("tr-TR")} Altın ödendi • Kalan: ${item.remaining.toLocaleString("tr-TR")}`))
  });
  if (input.incomePenaltyDetails?.length) embed.addFields({
    name: "📉 Uygulanan Gelir Cezaları",
    value: fieldValue(input.incomePenaltyDetails.map((item) =>
      `• **${item.settlementName}** — %${item.percent} • ${item.deductedAmount.toLocaleString("tr-TR")} Altın kesildi • Kalan: ${item.remainingAcquisitionTurns} Alım Turu • ${item.reason}`
    ))
  });
  if (input.mercenaryArrivalDetails?.length) embed.addFields({
    name: "\u{1FA99} Yerleşkeye Ulaşan Paralı Askerler",
    value: fieldValue(input.mercenaryArrivalDetails.map((item) =>
      `- **${item.countryName} / ${item.settlementName}** - ${item.companyName} - Üç turluk bakım: ${item.upkeep.toLocaleString("tr-TR")} Altın`
    ))
  });
  if (input.mercenaryUpkeepDetails?.length) embed.addFields({
    name: "\u{1F4B0} Paralı Asker Bakımları",
    value: fieldValue(input.mercenaryUpkeepDetails.map((item) =>
      `- **${item.countryName}** - ${item.companyName}: üç turluk bakım -${item.amount.toLocaleString("tr-TR")} Altın`
    ))
  });
  if (input.mercenaryUnpaidDetails?.length) embed.addFields({
    name: "\u26A0\uFE0F Ödenemeyen Paralı Asker Bakımları",
    value: fieldValue(input.mercenaryUnpaidDetails.map((item) =>
      `- **${item.countryName}** - ${item.companyName}: ${item.amount.toLocaleString("tr-TR")} Altın - Hareket ve savaş kilitlendi`
    ))
  });
  if (input.mercenaryEndedDetails?.length) embed.addFields({
    name: "\u{1F4DC} Sona Eren Paralı Asker Sözleşmeleri",
    value: fieldValue(input.mercenaryEndedDetails.map((item) => `- **${item.countryName}** - ${item.companyName} - ${item.reason}`))
  });
  if(input.movement)embed.addFields({
    name:"🗺️ Hareket Çözümlemesi",
    value:fieldValue(input.movement.enabled?[
      `• **Tur ${input.movement.turn} / ${input.movement.stage}** — Emir ${input.movement.processed} • İlerleyen ${input.movement.advanced} • Varan ${input.movement.completed} • Devam eden ${input.movement.ongoing} • Engelli ${input.movement.blocked}`,
      `• Gizli keşif ${input.movement.reconChecks} • Karşılaşma/Hex dosyası ${input.movement.encounters} • Sahiplik güncellemesi ${input.movement.ownershipUpdates}`,
      `• Ordu toplama: ${input.movement.muster.processed} emir • ${input.movement.muster.advanced} ilerledi • ${input.movement.muster.joined} katıldı • ${input.movement.muster.blocked} engelli • ${input.movement.muster.waiting} bekliyor`,
      `• Çıkarma: ${input.movement.disembarkations.processed} emir • ${input.movement.disembarkations.completed} tamamlandı • ${input.movement.disembarkations.blocked} engelli`,
      ...(input.movement.alreadyProcessed?["• Bu hareket aşaması daha önce çözülmüştü; ikinci kez uygulanmadı."]:[])
    ]:["• Koordinatlı hareket sistemi bu tur etkin değil."])
  });
  if(input.characterAutomation)embed.addFields({
    name:"🧭 Karakter ve Hanedan Otomasyonu",
    value:fieldValue([
      `• Casusluk: ${input.characterAutomation.espionageResolved} sonuçlandı • ${input.characterAutomation.espionagePublished} loglandı`,
      `• Akademi karakterleri: ${input.characterAutomation.characterEvents} olay işlendi • ${input.characterAutomation.characterPublished} loglandı`,
      `• Hanedanlar: ${input.characterAutomation.dynastyProcessed} hane • ${input.characterAutomation.dynastyEvents} olay • ${input.characterAutomation.dynastyDeathChecks} ölüm zarı • ${input.characterAutomation.dynastyDeathLogsPublished} ölüm kaydı yayımlandı`,
      `• NPC hanedanları: ${input.characterAutomation.dynastyNpcBirths} doğum • ${input.characterAutomation.dynastyNpcMarriages} evlilik`,
      ...input.characterAutomation.warnings.map((warning)=>`• ⚠️ ${warning}`)
    ])
  });
  const captured=activeFieldCapture;
  activeFieldCapture=null;
  const renderedFields=(embed.toJSON().fields??[]).map((field,index)=>({
    name:field.name,value:captured?.[index]??field.value,...(field.inline===undefined?{}:{inline:field.inline})
  }));
  fullAdvanceFields.set(embed,renderedFields);
  return embed;
}

export function turnAnnouncementCards(input: TurnAnnouncementInput): EmbedBuilder[] {
  const announcement = turnAnnouncement(input);
  if (input.kind !== "ADVANCE") return [announcement];

  const source = announcement.toJSON();
  const sourceFields=fullAdvanceFields.get(announcement)??(source.fields??[]).map((field)=>({
    name:field.name,value:field.value,...(field.inline===undefined?{}:{inline:field.inline})
  }));
  const detailPages=paginateFields(sourceFields);
  const total=1+detailPages.length;
  const first = new EmbedBuilder()
    .setColor(source.color ?? 0xb58b32)
    .setTitle(`⚔️ TUR ${input.turn} BAŞLADI • 1/${total}`)
    .setDescription(source.description ?? "Yeni rol turu açılmıştır.")
    .setImage(TURN_BANNER_URL)
    .setFooter({ text: source.footer?.text ?? "Antik Medeniyetler Role Play • Resmî Tur Duyurusu" })
    .setTimestamp();
  const details=detailPages.map((fields,index)=>{
    const card=new EmbedBuilder()
      .setColor(source.color??0xb58b32)
      .setTitle(`📜 TUR ${input.turn} SONUÇLARI • ${index+2}/${total}`)
      .setDescription(index===0
        ?"Tur ilerletilirken işlenen bütün ekonomi, toplum, askerî hareket ve otomasyon sonuçları. Hiçbir kayıt kısaltılmaz; devam sayfaları sırayla yayımlanır."
        :"Tur sonuçlarının devamı.")
      .setFooter({text:source.footer?.text??"Antik Medeniyetler Role Play • Resmî Tur Duyurusu"})
      .setTimestamp();
    if(fields.length)card.addFields(fields);
    else card.setDescription("Bu tur ek ayrıntılı sistem sonucu oluşmadı.");
    return card;
  });
  return[first,...details];
}
