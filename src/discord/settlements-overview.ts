import { EmbedBuilder } from "discord.js";
import { CULTURE_GROUPS } from "../domain/cultures.js";
import { gold,number } from "../domain/format.js";
import { prosperityTier } from "../domain/stability.js";
import type { CountryDocument } from "../services/game-service.js";
import { SETTLEMENTS_OVERVIEW_BANNER_URL } from "./assets.js";

const PAGE_SIZE=6;

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

export function renderSettlementsOverview(document:CountryDocument):EmbedBuilder[]{
  const pages=Math.max(1,Math.ceil(document.settlements.length/PAGE_SIZE));
  const cultureLabel=CULTURE_GROUPS[document.country.primary_culture_group]?.label??document.country.primary_culture_group;
  return Array.from({length:pages},(_,page)=>{
    const settlements=document.settlements.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    const embed=new EmbedBuilder()
      .setColor(0xb58b32)
      .setTitle(`🏛️ ${document.country.name} • Yerleşkelerim${pages>1?` • ${page+1}/${pages}`:""}`)
      .setDescription(page===0?[
        `🏘️ **Yerleşke Sayısı:** ${document.settlements.length} • 🏺 **Ana Kültür:** ${cultureLabel}`,
        `🏦 **Toplam Yerel Hazine:** ${gold(document.country.treasury)}`,
        `💰 **Dönem Geliri:** ${gold(document.totalPayableIncome)} • **Toplam Bakım:** −${gold(document.totalUpkeep)} • **Net:** ${document.netIncome>=0?"+":""}${gold(document.netIncome)}`,
        `⚔️ **Devlet Askerî Kapasitesi:** ${number(document.militaryUsed)} / ${number(document.militaryLimit)}`
      ].join("\n"):`Yerleşke görünümü devam ediyor • Sayfa **${page+1}/${pages}**`)
      .setFooter({text:"Gelirler mevcut refah, kültür, din, seferberlik ve diğer etkin koşullar uygulanmış dönem değerleridir."});
    if(page===0)embed.setImage(SETTLEMENTS_OVERVIEW_BANNER_URL);
    if(!settlements.length){
      embed.addFields({name:"Yerleşke bulunmuyor",value:"Bu devletin hâlen bağlı bir yerleşkesi yok."});
      return embed;
    }
    for(const settlement of settlements){
      const culture=CULTURE_GROUPS[settlement.culture_group]?.label??settlement.culture_group;
      const cultureCompatible=settlement.culture_group===document.country.primary_culture_group;
      const net=settlement.payableIncome-settlement.totalSettlementUpkeep;
      const prosperity=prosperityTier(Number(settlement.prosperity));
      embed.addFields({
        name:`🏛️ ${settlement.name} • ${settlementStatus(settlement)}`,
        value:[
          `🏦 **Hazine:** ${gold(settlement.local_treasury)} • **Dönem Geliri:** ${gold(settlement.payableIncome)} • **Net:** ${net>=0?"+":""}${gold(net)}`,
          `⚔️ **Yerel Askerî Kapasite:** ${number(settlement.militaryUsed)} / ${number(settlement.militaryLimit)}`,
          `🏺 **Kültür:** ${culture} • ${cultureCompatible?"✅ Uyumlu":"⚠️ Yabancı"}`,
          `⛩️ **Din ve Mezhep:** ${dominantBelief(settlement)}`,
          `🌿 **Refah:** ${settlement.prosperity}/100 • ${prosperity.label}`,
          `🔥 **İsyan Durumu:** ${settlement.rebellion_progress}/100 • **Tur Riski:** %${number(settlement.rebellionRisk)}`
        ].join("\n")
      });
    }
    return embed;
  });
}
