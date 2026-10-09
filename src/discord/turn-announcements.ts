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
  romanPolitics?:{
    proposalResults:Array<{countryName:string;title:string;passed:boolean;yesWeight:number;noWeight:number;requiredWeight:number}>;
    officeYields:Array<{familyName:string;characterName:string;officeLabel:string;treasury:number;influence:number;reputation:number;scandal:number;completed:boolean}>;
    lawEffects:Array<{countryName:string;lawTitle:string;summary:string}>;
  };
}

function fieldValue(lines: string[]): string {
  return lines.join("\n").slice(0, 1_024);
}

type TurnAnnouncementField = { name: string; value: string; inline?: boolean };

const TURN_CARD_MAX_TEXT = 5_800;
const SECOND_CARD_FIELD_NAMES = new Set([
  "⚔️ Savaş Yorgunluğu",
  "🔥 İsyanlar",
  "🌿 Refah ve İsyan Gerilimi",
  "⚠️ Huzursuzluk Olayları",
  "🏰 Kuşatma Erzak Durumu",
  "🏛️ Panteon Kredisi Ödemeleri",
  "📉 Uygulanan Gelir Cezaları",
  "\u{1FA99} Yerleşkeye Ulaşan Paralı Askerler",
  "\u{1F4B0} Paralı Asker Bakımları",
  "\u26A0\uFE0F Ödenemeyen Paralı Asker Bakımları",
  "\u{1F4DC} Sona Eren Paralı Asker Sözleşmeleri"
]);

export function turnAnnouncementTextLength(embed: EmbedBuilder): number {
  const data = embed.toJSON();
  return (data.title?.length ?? 0)
    + (data.description?.length ?? 0)
    + (data.footer?.text.length ?? 0)
    + (data.author?.name.length ?? 0)
    + (data.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

function shortenedField(field: TurnAnnouncementField, maximumValueLength: number): TurnAnnouncementField {
  if (field.value.length <= maximumValueLength) return field;
  const suffix = "\n… Liste kısaltıldı.";
  return {
    ...field,
    value: field.value.slice(0, Math.max(1, maximumValueLength - suffix.length)) + suffix
  };
}

function splitAdvanceFields(
  fields: TurnAnnouncementField[],
  firstBase: EmbedBuilder,
  secondBase: EmbedBuilder
): [TurnAnnouncementField[], TurnAnnouncementField[]] {
  const preferred = fields.findIndex((field) => SECOND_CARD_FIELD_NAMES.has(field.name));
  const preferredSplit = preferred < 0 ? Math.ceil(fields.length / 2) : preferred;
  for (let maximumValueLength = 1_024; maximumValueLength >= 96; maximumValueLength -= 32) {
    const fitted = fields.map((field) => shortenedField(field, maximumValueLength));
    let best: { split: number; score: number } | null = null;
    for (let split = 0; split <= fitted.length; split += 1) {
      const firstLength = turnAnnouncementTextLength(firstBase)
        + fitted.slice(0, split).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
      const secondLength = turnAnnouncementTextLength(secondBase)
        + fitted.slice(split).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
      if (firstLength > TURN_CARD_MAX_TEXT || secondLength > TURN_CARD_MAX_TEXT) continue;
      const score = Math.abs(firstLength - secondLength) + Math.abs(split - preferredSplit) * 80;
      if (!best || score < best.score) best = { split, score };
    }
    if (best) return [fitted.slice(0, best.split), fitted.slice(best.split)];
  }
  return [[], fields.map((field) => shortenedField(field, 96))];
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
  if (input.garrisonUpgradeDetails?.length) embed.addFields({
    name: "🛡️ Garnizonu Tamamlanan Yerleşkeler",
    value: fieldValue((input.garrisonReplenishmentCompletedDetails ?? []).map((item) => `• **${item.settlementName}** — ${item.personnel.toLocaleString("tr-TR")} asker`))
  });
  if (input.garrisonReplenishmentStartedDetails?.length) embed.addFields({
    name: "🛡️ Başlatılan Zorunlu Garnizon Yenilemeleri",
    value: fieldValue(input.garrisonReplenishmentStartedDetails.map((item) =>
      `• **${item.settlementName}** — ${item.personnel.toLocaleString("tr-TR")} asker • ${item.cost.toLocaleString("tr-TR")} Altın • Tur ${item.completionTurn}`
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
  if(input.romanFamilyIncomeDetails?.some((item)=>item.total>0))embed.addFields({
    name:"🏛️ Roma Siyasi Aile Gelirleri",
    value:fieldValue(input.romanFamilyIncomeDetails.filter((item)=>item.total>0).map((item)=>
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
  const escalations=input.stability?.settlements.filter((item)=>!item.outbreak&&item.rebellionAfter!==item.rebellionBefore)??[];
  if(escalations.length)embed.addFields({
    name:"🌿 Refah ve İsyan Gerilimi",
    value:fieldValue(escalations.slice(0,20).map((item)=>
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
  return embed;
}

export function turnAnnouncementCards(input: TurnAnnouncementInput): EmbedBuilder[] {
  const announcement = turnAnnouncement(input);
  if (input.kind !== "ADVANCE") return [announcement];

  const source = announcement.toJSON();
  const first = new EmbedBuilder()
    .setColor(source.color ?? 0xb58b32)
    .setTitle(`⚔️ TUR ${input.turn} BAŞLADI • 1/2`)
    .setDescription(source.description ?? "Yeni rol turu açılmıştır.")
    .setImage(TURN_BANNER_URL)
    .setFooter({ text: source.footer?.text ?? "Antik Medeniyetler Role Play • Resmî Tur Duyurusu" })
    .setTimestamp();
  const second = new EmbedBuilder()
    .setColor(source.color ?? 0xb58b32)
    .setTitle(`📜 TUR ${input.turn} SONUÇLARI • 2/2`)
    .setDescription("Tur ilerletilirken işlenen ekonomi, toplum, savaş yorgunluğu ve diğer sistem sonuçları.")
    .setFooter({ text: source.footer?.text ?? "Antik Medeniyetler Role Play • Resmî Tur Duyurusu" })
    .setTimestamp();

  const fields = (source.fields ?? []).map((field) => ({
    name: field.name,
    value: field.value,
    ...(field.inline === undefined ? {} : { inline: field.inline })
  }));
  const [firstFields, secondFields] = splitAdvanceFields(fields, first, second);
  if (firstFields.length) first.addFields(firstFields);
  if (secondFields.length) second.addFields(secondFields);
  else second.setDescription("Bu tur ek ayrıntılı sistem sonucu oluşmadı.");
  return [first, second];
}
