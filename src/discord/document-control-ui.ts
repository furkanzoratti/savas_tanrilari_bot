import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import { BUILDING_CATEGORIES, BUILDINGS, CITY_POLICIES, UNITS, type CityPolicyKey } from "../domain/catalog.js";
import { gold, number } from "../domain/format.js";
import { isScandinavianArmyUnitType } from "../domain/scandinavian-army.js";
import { isSpecialUnitType } from "../domain/special-units.js";
import { isSteppeArmyUnitType } from "../domain/steppe-army.js";
import {
  buildingPurchaseTerms, gameService, GameError, modifiedBuildingPurchaseCost,
  modifiedUnitPurchaseCost, unitPurchaseCost, type CountryDocument
} from "../services/game-service.js";
import { cityService } from "../services/city-service.js";
import { assertCountryAccess, assertCountryExecutiveAccess } from "./auth.js";
import { buildingChoices, unitChoices } from "./commands.js";
import {compactUuid,expandUuid} from "./document-component-id.js";
import { renderDocument } from "./document.js";

type DocumentView = "general" | "economy" | "military" | "development";
type ComponentRow = ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>;

const VIEW_LABELS:Record<DocumentView,string>={
  general:"Genel Bakış",economy:"Ekonomi ve Kaynaklar",military:"Askerî Durum",development:"İmar ve Yönetim"
};

function safeView(value:string|undefined):DocumentView{
  return value&&value in VIEW_LABELS?value as DocumentView:"general";
}

function countrySummary(document:CountryDocument):EmbedBuilder{
  const capital=document.settlements.find((settlement)=>settlement.isCapital);
  const negativeTreasuries=document.settlements.filter((settlement)=>Number(settlement.local_treasury)<0).length;
  const activeRebellions=document.settlements.filter((settlement)=>settlement.rebellion_active).length;
  const activeConstructions=document.settlements.reduce((sum,settlement)=>sum+settlement.buildings.filter((building)=>building.status==="BUILDING").length,0);
  const alerts=[
    document.netIncome<0?`📉 Dönem dengesi **${gold(document.netIncome)}** açık veriyor.`:null,
    negativeTreasuries?`⚠️ **${negativeTreasuries}** yerleşkenin yerel hazinesi ekside.`:null,
    document.militaryUsed>document.militaryLimit?"⚔️ Askerî kapasite sınırı aşılmış durumda.":null,
    activeRebellions?`🔥 **${activeRebellions}** yerleşkede açık isyan bulunuyor.`:null
  ].filter((line):line is string=>Boolean(line));
  return new EmbedBuilder()
    .setColor(alerts.length?0xa4663f:0xc59b45)
    .setTitle(`📜 ${document.country.name} • Devlet Yönetimi`)
    .setDescription([
      `**Tur ${document.guild.current_turn}** • ${document.guild.turn_phase==="OPEN"?"Hareketler Açık":document.guild.turn_phase==="CLOSED"?"Hareketler Kapalı":"Olaylar Çözülüyor"}`,
      `👑 Başkent: **${capital?.name??"Belirlenmedi"}**${activeConstructions?` • 🏗️ ${activeConstructions} etkin inşaat`:""}`,
      ...(alerts.length?["",...alerts]:[])
    ].join("\n"))
    .addFields(
      {name:"🏦 Toplam Hazine",value:`**${gold(document.country.treasury)}**`,inline:true},
      {name:"📈 Dönem Dengesi",value:`**${document.netIncome>=0?"+":""}${gold(document.netIncome)}**`,inline:true},
      {name:"👥 Özgür Nüfus",value:`**${number(document.freePopulation)}**`,inline:true},
      {name:"⚔️ Askerî Kapasite",value:`**${number(document.militaryUsed)} / ${number(document.militaryLimit)}**`,inline:true},
      {name:"🏛️ Yerleşkeler",value:`**${number(document.settlements.length)}**`,inline:true},
      {name:"👑 Yönetim",value:document.playerIds.length?document.playerIds.map((id)=>`<@${id}>`).join(" • "):"Oyuncu atanmamış.",inline:true}
    )
    .setFooter({text:"Aşağıdan yerleşke ve görünüm seç; işlemleri aynı ekrandan yönet."});
}

function matchesView(fieldName:string,view:DocumentView):boolean{
  if(view==="general")return ["Kültür","Din ve Mezhep","Yerel Hazine","Nüfus","Refah ve İstikrar","Aktif Yerleşke Olayları","Süreli Gelir Cezası"].some((name)=>fieldName.includes(name));
  if(view==="economy")return ["Yerel Hazine","Gelir Kalemleri","Yerleşke Giderleri","Etkin Kaynaklar","Süreli Gelir Cezası"].some((name)=>fieldName.includes(name));
  if(view==="military")return ["Nüfus","Garnizon","Eğitilmiş Askerler","Paralı Askerler","Donanma","Tamir","Kuşatma"].some((name)=>fieldName.includes(name));
  return ["Binalar ve İnşaatlar","Şehir Politikaları","Aktif Yerleşke Olayları","Refah ve İstikrar","Büyük Proje"].some((name)=>fieldName.includes(name));
}

function settlementCard(document:CountryDocument,settlementId:string,view:DocumentView):EmbedBuilder{
  const rendered=renderDocument(document,{visibleSettlementIds:[settlementId],roleLabel:"Yerleşke Yönetimi"});
  const source=rendered[1];
  if(!source)throw new GameError("Yerleşke belgesi oluşturulamadı.");
  const json=source.toJSON();
  const matching=(json.fields??[]).filter((field)=>matchesView(field.name,view));
  let remainingFieldText=3_800;
  const fields=matching.flatMap((field)=>{
    const name=field.name.slice(0,256);
    const available=Math.min(1_024,remainingFieldText-name.length);
    if(available<80)return[];
    const value=field.value.length<=available?field.value:`${field.value.slice(0,Math.max(0,available-2))}…`;
    remainingFieldText-=name.length+value.length;
    return[{...field,name,value}];
  });
  return EmbedBuilder.from(json)
    .setTitle(`${json.title??"Yerleşke"} • ${VIEW_LABELS[view]}`.slice(0,256))
    .setFields(fields.length?fields:[{name:"Bilgi",value:"Bu görünümde gösterilecek etkin bir kayıt bulunmuyor."}])
    .setFooter({text:`${VIEW_LABELS[view]} • Seçilen yerleşkeye ait güncel değerler`});
}

function dashboardComponents(document:CountryDocument,settlementId:string,view:DocumentView):ComponentRow[]{
  const country=compactUuid(document.country.id);
  const settlement=compactUuid(settlementId);
  const selected=document.settlements.find((item)=>item.id===settlementId)!;
  const settlements=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`ds|${country}|${view}`).setPlaceholder("Yönetilecek yerleşkeyi seç")
      .addOptions(document.settlements.slice(0,25).map((item)=>({
        label:`${item.isCapital?"👑 ":""}${item.name}`.slice(0,100),
        description:`${number(item.population)} nüfus • ${gold(Number(item.local_treasury))}`.slice(0,100),
        value:item.id,default:item.id===settlementId
      })))
  );
  const views=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`dv|${country}|${settlement}`).setPlaceholder("Belge görünümünü seç")
      .addOptions((Object.entries(VIEW_LABELS) as Array<[DocumentView,string]>).map(([value,label])=>({label,value,default:value===view})))
  );
  const hasCuria=selected.buildings.some((building)=>building.building_type==="curia"&&building.status==="ACTIVE"&&building.level>0);
  const actions=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`da|${country}|${settlement}|treasury|${view}`).setLabel("Hazine Aktar").setEmoji("💰").setStyle(ButtonStyle.Secondary).setDisabled(document.settlements.length<2),
    new ButtonBuilder().setCustomId(`da|${country}|${settlement}|build|${view}`).setLabel("Bina Yönet").setEmoji("🏗️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`da|${country}|${settlement}|unit|${view}`).setLabel("Asker Eğit").setEmoji("⚔️").setStyle(ButtonStyle.Primary).setDisabled(Boolean(selected.is_conquered)),
    new ButtonBuilder().setCustomId(`da|${country}|${settlement}|policy|${view}`).setLabel("Politikalar").setEmoji("⚖️").setStyle(ButtonStyle.Secondary).setDisabled(!hasCuria),
    new ButtonBuilder().setCustomId(`da|${country}|${settlement}|refresh|${view}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Success)
  );
  return[settlements,views,actions];
}

export async function documentDashboardPayload(countryId:string,settlementId?:string,view:DocumentView="general",content:string|null=null){
  const document=await gameService.document(countryId,{includeArmies:false});
  const selected=document.settlements.find((item)=>item.id===settlementId)
    ??document.settlements.find((item)=>item.isCapital)
    ??document.settlements[0];
  if(!selected)throw new GameError("Bu devletin yönetilebilecek bir yerleşkesi bulunmuyor.");
  return{content,embeds:[countrySummary(document),settlementCard(document,selected.id,view)],components:dashboardComponents(document,selected.id,view)};
}

export async function sendDocumentDashboard(interaction:ChatInputCommandInteraction,countryId:string):Promise<void>{
  await interaction.editReply(await documentDashboardPayload(countryId));
}

function backRow(countryId:string,settlementId:string,view:DocumentView):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`da|${compactUuid(countryId)}|${compactUuid(settlementId)}|refresh|${view}`).setLabel("Belgeye Dön").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
  );
}

function buildingOptions(document:CountryDocument,settlementId:string){
  const settlement=document.settlements.find((item)=>item.id===settlementId);
  if(!settlement)throw new GameError("Yerleşke bulunamadı.");
  const activePolicies=settlement.policies.filter((policy)=>policy.status==="ACTIVE").map((policy)=>policy.policy_key);
  const occupiedSlots=settlement.buildings.filter((building)=>building.level>0||building.status==="BUILDING").length;
  const hasPort=settlement.buildings.some((building)=>building.building_type==="port"&&(building.status==="ACTIVE"||building.status==="BUILDING")&&building.level>=1);
  return buildingChoices.flatMap((building)=>{
    const current=settlement.buildings.find((item)=>item.building_type===building.key);
    const next=(current?.level??0)+1;
    if(next>building.maxLevel||current?.status==="BUILDING")return[];
    if(!current&&occupiedSlots>=settlement.slotLimit)return[];
    if(building.key==="port"&&!settlement.is_coastal)return[];
    if((building.key==="shipyard"||building.key==="customs_house")&&!hasPort)return[];
    const terms=buildingPurchaseTerms(building.key,next,settlement.effectiveResources,activePolicies,document.country.active_formable_key,settlement.religionModifiers);
    const cost=modifiedBuildingPurchaseCost(terms.cost,document.greatProjectModifiers);
    return[{label:`${building.name} Sv${next}`.slice(0,100),description:`${BUILDING_CATEGORIES[building.category].label} • ${gold(cost)} • ${terms.duration} tur`.slice(0,100),value:building.key}];
  });
}

function unitMenus(document:CountryDocument,settlementId:string,view:DocumentView):ActionRowBuilder<StringSelectMenuBuilder>[] {
  const settlement=document.settlements.find((item)=>item.id===settlementId);
  if(!settlement)throw new GameError("Yerleşke bulunamadı.");
  const available=unitChoices.filter(([key])=>document.isSteppeConfederation
    ?isSteppeArmyUnitType(key)&&(document.specialUnitUnlocks??[]).includes(key)
    :document.isScandinavianState
      ?isScandinavianArmyUnitType(key)&&(document.specialUnitUnlocks??[]).includes(key)
      :!isSpecialUnitType(key)||(document.specialUnitUnlocks??[]).includes(key));
  return Array.from({length:Math.ceil(available.length/25)},(_,index)=>{
    const chunk=available.slice(index*25,index*25+25);
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`du|${compactUuid(document.country.id)}|${compactUuid(settlementId)}|${view}`).setPlaceholder(available.length>25?`Birim seç • ${index+1}/${Math.ceil(available.length/25)}`:"Eğitilecek birimi seç")
        .addOptions(chunk.map(([key,unit])=>({
          label:unit.name,
          description:`${gold(modifiedUnitPurchaseCost(unitPurchaseCost(key as keyof typeof UNITS,1_000,settlement.effectiveResources,settlement.policies.filter((policy)=>policy.status==="ACTIVE").map((policy)=>policy.policy_key),document.country.active_formable_key,settlement.religionModifiers),key as keyof typeof UNITS,document.greatProjectModifiers))} / 1.000`.slice(0,100),
          value:key
        })))
    );
  });
}

export async function handleDocumentSelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  const [kind,countryValue,settlementValue,extra]=interaction.customId.split("|");
  if(!["ds","dv","dbc","du","dts","dp"].includes(kind??""))return false;
  if(!interaction.guildId||!countryValue)throw new GameError("Belge etkileşimi geçersiz.");
  const countryId=expandUuid(countryValue);
  if(kind==="ds"){
    await interaction.deferUpdate();
    await assertCountryAccess(interaction,countryId);
    await interaction.editReply(await documentDashboardPayload(countryId,interaction.values[0],safeView(settlementValue)));
    return true;
  }
  if(!settlementValue)throw new GameError("Yerleşke bilgisi eksik.");
  const settlementId=expandUuid(settlementValue);
  if(kind==="dv"){
    await interaction.deferUpdate();
    await assertCountryAccess(interaction,countryId);
    await interaction.editReply(await documentDashboardPayload(countryId,settlementId,safeView(interaction.values[0])));
    return true;
  }
  if(kind==="dbc"){
    const buildingType=interaction.values[0]!;
    const building=BUILDINGS[buildingType];
    if(!building)throw new GameError("Bina bulunamadı.");
    await interaction.update({content:`**${building.name}** alımını onaylıyor musun? Güncel fiyat ve süre onay anında yeniden denetlenir.`,components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`dbx|${countryValue}|${settlementValue}|${buildingType}|${safeView(extra)}`).setLabel("Satın Al").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`da|${countryValue}|${settlementValue}|refresh|${safeView(extra)}`).setLabel("Vazgeç").setStyle(ButtonStyle.Secondary)
    )]});
    return true;
  }
  if(kind==="du"){
    const unitType=interaction.values[0]!;
    const modal=new ModalBuilder().setCustomId(`dum|${countryValue}|${settlementValue}|${unitType}|${safeView(extra)}`).setTitle("Asker Eğitimi");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("quantity").setLabel("Asker sayısı — 100'ün katı").setPlaceholder("Örn. 500").setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
    return true;
  }
  if(kind==="dts"){
    const sourceId=interaction.values[0]!;
    const modal=new ModalBuilder().setCustomId(`dtm|${countryValue}|${settlementValue}|${compactUuid(sourceId)}|${safeView(extra)}`).setTitle("Yerel Hazine Aktarımı");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Aktarılacak Altın").setPlaceholder("Örn. 2500").setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
    return true;
  }
  const slot=Number(extra) as 1|2;
  const selection=interaction.values[0]!;
  await interaction.deferUpdate();
  await assertCountryExecutiveAccess(interaction,countryId);
  if(selection==="REMOVE")await cityService.removePolicy({guildId:interaction.guildId,actorId:interaction.user.id,countryId,settlementId,slot});
  else await cityService.setPolicy({guildId:interaction.guildId,actorId:interaction.user.id,countryId,settlementId,policyKey:selection as CityPolicyKey,slot});
  await interaction.editReply(await documentDashboardPayload(countryId,settlementId,"development",selection==="REMOVE"?`✅ ${slot}. şehir politikası kaldırıldı.`:`✅ ${slot}. şehir politikası güncellendi.`));
  return true;
}

export async function handleDocumentButton(interaction:ButtonInteraction):Promise<boolean>{
  const [kind,countryValue,settlementValue,action,viewValue]=interaction.customId.split("|");
  if(!["da","dbx"].includes(kind??""))return false;
  if(!interaction.guildId||!countryValue||!settlementValue)throw new GameError("Belge düğmesi geçersiz.");
  const countryId=expandUuid(countryValue);
  const settlementId=expandUuid(settlementValue);
  const view=safeView(viewValue);
  if(kind==="dbx"){
    if(!action||!BUILDINGS[action])throw new GameError("Bina bilgisi geçersiz.");
    await interaction.deferUpdate();
    await assertCountryExecutiveAccess(interaction,countryId);
    const result=await gameService.purchaseBuilding({guildId:interaction.guildId,actorId:interaction.user.id,countryId,settlementId,buildingType:action});
    await interaction.editReply(await documentDashboardPayload(countryId,settlementId,"development",`✅ **${BUILDINGS[action].name} Sv${result.targetLevel}** satın alındı. ${gold(result.cost)} ödendi; **Tur ${result.completionTurn}** tamamlanacak.`));
    return true;
  }
  if(action==="refresh"){
    await interaction.deferUpdate();
    await assertCountryAccess(interaction,countryId);
    await interaction.editReply(await documentDashboardPayload(countryId,settlementId,view));
    return true;
  }
  await interaction.deferUpdate();
  await assertCountryExecutiveAccess(interaction,countryId);
  const document=await gameService.document(countryId,{includeArmies:false});
  const settlement=document.settlements.find((item)=>item.id===settlementId);
  if(!settlement)throw new GameError("Yerleşke bulunamadı.");
  if(action==="build"){
    const options=buildingOptions(document,settlementId);
    if(!options.length)throw new GameError("Bu yerleşkede alınabilecek veya yükseltilebilecek bina bulunmuyor.");
    await interaction.editReply({content:`🏗️ **${settlement.name}** için kurulacak veya yükseltilecek binayı seç.`,components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`dbc|${countryValue}|${settlementValue}|${view}`).setPlaceholder("Bina seç").addOptions(options.slice(0,25))),backRow(countryId,settlementId,view)]});
    return true;
  }
  if(action==="unit"){
    await interaction.editReply({content:`⚔️ **${settlement.name}** • Eğitim kapasitesi kalan: **${number(settlement.trainingRemaining??0)}**`,components:[...unitMenus(document,settlementId,view),backRow(countryId,settlementId,view)]});
    return true;
  }
  if(action==="treasury"){
    const sources=document.settlements.filter((item)=>item.id!==settlementId);
    const sourceMenu=new StringSelectMenuBuilder()
      .setCustomId(`dts|${countryValue}|${settlementValue}|${view}`)
      .setPlaceholder("Kaynak yerleşkeyi seç")
      .addOptions(sources.slice(0,25).map((item)=>({
        label:item.name.slice(0,100),
        description:`Yerel hazine: ${gold(Number(item.local_treasury))}`.slice(0,100),
        value:item.id
      })));
    await interaction.editReply({
      content:`💰 **${settlement.name}** yerel hazinesine aktarım yapacak kaynak şehri seç.`,
      components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sourceMenu),backRow(countryId,settlementId,view)]
    });
    return true;
  }
  if(action==="policy"){
    const options=(Object.entries(CITY_POLICIES) as Array<[CityPolicyKey,(typeof CITY_POLICIES)[CityPolicyKey]]>).map(([value,policy])=>({label:policy.label.slice(0,100),description:`${policy.category} • ${policy.description}`.slice(0,100),value}));
    const rows=([1,2] as const).map((slot)=>new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`dp|${countryValue}|${settlementValue}|${slot}`).setPlaceholder(`${slot}. politika yuvasını yönet`).addOptions([{label:`${slot}. politikayı kaldır`,value:"REMOVE",description:"Bu yuvadaki mevcut politikayı kaldırır"},...options])));
    await interaction.editReply({content:`⚖️ **${settlement.name}** için politika yuvasını ve uygulanacak politikayı seç.`,components:[...rows,backRow(countryId,settlementId,view)]});
    return true;
  }
  throw new GameError("Bu belge işlemi desteklenmiyor.");
}

export async function handleDocumentModal(interaction:ModalSubmitInteraction):Promise<boolean>{
  const [kind,countryValue,settlementValue,itemValue,viewValue]=interaction.customId.split("|");
  if(!["dum","dtm"].includes(kind??""))return false;
  if(!interaction.guildId||!countryValue||!settlementValue||!itemValue)throw new GameError("Belge formu geçersiz.");
  const countryId=expandUuid(countryValue);
  const settlementId=expandUuid(settlementValue);
  const view=safeView(viewValue);
  await assertCountryExecutiveAccess(interaction,countryId);
  await interaction.deferUpdate();
  if(kind==="dum"){
    const quantity=Number(interaction.fields.getTextInputValue("quantity").replaceAll(".","").replaceAll(",",""));
    if(!Number.isSafeInteger(quantity))throw new GameError("Geçerli bir tam sayı girilmelidir.");
    const unitType=itemValue as keyof typeof UNITS;
    if(!UNITS[unitType])throw new GameError("Birim türü geçersiz.");
    const result=await gameService.purchaseUnits({guildId:interaction.guildId,actorId:interaction.user.id,countryId,settlementId,unitType,quantity});
    await interaction.editReply(await documentDashboardPayload(countryId,settlementId,"military",`✅ ${number(quantity)} **${UNITS[unitType].name}** için ${gold(result.cost)} ödendi. Eğitim emri oluşturuldu.`));
    return true;
  }
  const amount=Number(interaction.fields.getTextInputValue("amount").replaceAll(".","").replaceAll(",",""));
  if(!Number.isSafeInteger(amount)||amount<=0)throw new GameError("Aktarım miktarı pozitif bir tam sayı olmalıdır.");
  const sourceId=expandUuid(itemValue);
  const result=await gameService.transferSettlementTreasury({guildId:interaction.guildId,actorId:interaction.user.id,countryId,sourceSettlementId:sourceId,targetSettlementId:settlementId,amount});
  await interaction.editReply(await documentDashboardPayload(countryId,settlementId,view,`✅ **${gold(result.amount)}**, **${result.sourceName}** şehrinden **${result.targetName}** şehrine aktarıldı.`));
  return true;
}
