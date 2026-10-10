import { EmbedBuilder } from "discord.js";
import { CULTURE_GROUPS } from "../domain/cultures.js";
import { gold,number } from "../domain/format.js";
import { prosperityTier } from "../domain/stability.js";
import type { CountryDocument } from "../services/game-service.js";
import { SETTLEMENTS_OVERVIEW_BANNER_URL } from "./assets.js";

const PAGE_SIZE=6;

export interface SettlementsOverviewScope{
  visibleSettlementIds:readonly string[];
  roleLabel:string;
}

function dominantBelief(settlement:CountryDocument["settlements"][number]):string{
  const shares=settlement.religionDistribution??[];
  if(!shares.length)return "Kayıt yok";
  const strongest=[...shares].sort((left,right)=>(right.primaryPercent+right.secondaryPercent)-(left.primaryPercent+left.secondaryPercent))[0]!;
  const total=strongest.primaryPercent+strongest.secondaryPercent;
  return `${strongest.religionLabel} %${number(total)}${strongest.secondaryPercent>0?` • ${strongest.secondaryLabel} %${number(strongest.secondaryPercent)}`:""}`;
}

function settlementStatus(settlement:CountryDocument["settlements"][number]):string{
  if(settlement.rebellion_active)return "🔥 Açık İsyan";
  if(settlement.isBesieged)return "🏰 Kuşatma Altında";
  if(settlement.is_conquered)return "⚠️ Asimilasyon Sürüyor";
  if(settlement.ruin_stage>0)return "🏚️ Haraplık Etkisi";
  return "✅ Düzenli";
}

export function renderSettlementsOverview(document:CountryDocument,scope?:SettlementsOverviewScope):EmbedBuilder[]{
  const visibleIds=scope?new Set(scope.visibleSettlementIds):null;
  const detailedSettlements=visibleIds?document.settlements.filter((settlement)=>visibleIds.has(settlement.id)):document.settlements;
  const hiddenSettlementCount=document.settlements.length-detailedSettlements.length;
  const pages=Math.max(1,Math.ceil(detailedSettlements.length/PAGE_SIZE));
  const cultureLabel=CULTURE_GROUPS[document.country.primary_culture_group]?.label??document.country.primary_culture_group;
  return Array.from({length:pages},(_,page)=>{
    const settlements=detailedSettlements.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    const summary=page===0?[
      scope
        ? `🏘️ **Devlet Yerleşkeleri:** ${document.settlements.length} • **Ayrıntılı Erişim:** ${detailedSettlements.length} • 🏺 **Ana Kültür:** ${cultureLabel}`
        : `🏘️ **Yerleşke Sayısı:** ${document.settlements.length} • 🏺 **Ana Kültür:** ${cultureLabel}`,
      `🏦 **Toplam Yerel Hazine:** ${gold(document.country.treasury)}`,
      `💰 **Dönem Geliri:** ${gold(document.totalPayableIncome)} • **Toplam Bakım:** −${gold(document.totalUpkeep)} • **Net:** ${document.netIncome>=0?"+":""}${gold(document.netIncome)}`,
      `⚔️ **Devlet Askerî Kapasitesi:** ${number(document.militaryUsed)} / ${number(document.militaryLimit)}`,
      scope&&hiddenSettlementCount>0
        ? `🔒 **${hiddenSettlementCount} yerleşke**, devlet toplamlarına dahildir; ${scope.roleLabel} için ayrıntıları kapalıdır.`
        : ""
    ].filter(Boolean).join("\n"):`Yerleşke görünümü devam ediyor • Sayfa **${page+1}/${pages}**`;
    const embed=new EmbedBuilder()
      .setColor(0xb58b32)
      .setTitle(`🏛️ ${document.country.name} • ${scope?scope.roleLabel:"Yerleşkelerim"}${pages>1?` • ${page+1}/${pages}`:""}`)
      .setFooter({text:"Gelirler mevcut refah, kültür, din, seferberlik ve diğer etkin koşullar uygulanmış dönem değerleridir."});
    if(page===0)embed.setImage(SETTLEMENTS_OVERVIEW_BANNER_URL);
    if(!settlements.length){
      embed.setDescription(`${summary}\n\n### Yerleşke Bulunmuyor\nBu devletin hâlen bağlı bir yerleşkesi yok.`);
      return embed;
    }
    const settlementBlocks=settlements.map((settlement)=>{
      const culture=CULTURE_GROUPS[settlement.culture_group]?.label??settlement.culture_group;
      const cultureCompatible=settlement.culture_group===document.country.primary_culture_group;
      const net=settlement.payableIncome-settlement.totalSettlementUpkeep;
      const prosperity=prosperityTier(Number(settlement.prosperity));
      return [
          `### 🏛️ ${settlement.name} • ${settlementStatus(settlement)}`,
          `🏦 **Hazine:** ${gold(settlement.local_treasury)} • **Dönem Geliri:** ${gold(settlement.payableIncome)} • **Net:** ${net>=0?"+":""}${gold(net)}`,
          `⚔️ **Yerel Askerî Kapasite:** ${number(settlement.militaryUsed)} / ${number(settlement.militaryLimit)}`,
          `🏺 **Kültür:** ${culture} • ${cultureCompatible?"✅ Uyumlu":"⚠️ Yabancı"}`,
          `⛩️ **Din ve Mezhep:** ${dominantBelief(settlement)}`,
          `🌿 **Refah:** ${settlement.prosperity}/100 • ${prosperity.label}`,
          `🔥 **İsyan Durumu:** ${settlement.rebellion_progress}/100 • **Tur Riski:** %${number(settlement.rebellionRisk)}${settlement.rebelFaction?` • **${settlement.rebelFaction.display_name}**`:""}`
        ].join("\n");
    });
    embed.setDescription([summary,...settlementBlocks].join("\n\n"));
    return embed;
  });
}
