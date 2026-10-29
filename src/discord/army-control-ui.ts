import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,StringSelectMenuBuilder,
  TextInputBuilder,TextInputStyle,type ButtonInteraction,type ChatInputCommandInteraction,
  type ModalSubmitInteraction,type StringSelectMenuInteraction
} from "discord.js";
import {BATTLE_UNIT_STATS,type BattleUnitType,type SiegeAssetType} from "../domain/battle.js";
import {SIEGE_ASSET_BATTLE_STATS} from "../domain/battle.js";
import {UNITS} from "../domain/catalog.js";
import {number} from "../domain/format.js";
import {armyService,type ArmyPoolView,type ArmyView} from "../services/army-service.js";
import {gameService,GameError,type CountryDocument} from "../services/game-service.js";
import {assertCountryAccess,assertCountryExecutiveAccess} from "./auth.js";
import {compactUuid,expandUuid} from "./document-component-id.js";

type ComponentRow=ActionRowBuilder<StringSelectMenuBuilder>|ActionRowBuilder<ButtonBuilder>;

const trim=(value:string,limit:number)=>value.length<=limit?value:`${value.slice(0,Math.max(0,limit-2))}…`;
const unitLabel=(unitType:BattleUnitType)=>BATTLE_UNIT_STATS[unitType]?.label??UNITS[unitType]?.name??unitType;

function armySummary(document:CountryDocument,armies:ArmyView[],pool:ArmyPoolView,selectedArmyId:string|null):EmbedBuilder{
  const armyTotal=armies.reduce((sum,army)=>sum+army.total,0);
  const remaining=Math.max(0,document.militaryLimit-document.militaryUsed);
  const garrisonAndOther=Math.max(0,document.militaryUsed-armyTotal-pool.grandTotal);
  const armyLines=armies.length?armies.map((army)=>[
    army.id===selectedArmyId?"▶":"•",
    army.id===selectedArmyId?`**${army.name}**`:army.name,
    `— **${number(army.total)}** asker`,
    army.active_battle_id?"• ⚔️ Savaşta":""
  ].filter(Boolean).join(" ")).join("\n"):"Kurulmuş bir ordu bulunmuyor.";
  return new EmbedBuilder()
    .setColor(document.militaryUsed>document.militaryLimit?0xa9483d:0xc59b45)
    .setTitle(`⚔️ ${document.country.name} • Ordu Komuta Merkezi`)
    .setDescription(`Devletin askerî kapasitesi, kalıcı orduları ve henüz orduya bağlanmamış birlikleri.`)
    .addFields(
      {name:"🎖️ Askerî Kapasite",value:`Mevcut: **${number(document.militaryUsed)}**\nSınır: **${number(document.militaryLimit)}**\nKalan: **${number(remaining)}**`,inline:true},
      {name:"⚔️ Ordu Mevcudu",value:`Ordu sayısı: **${number(armies.length)}**\nOrdulara bağlı: **${number(armyTotal)}**\nGarnizon ve diğer: **${number(garrisonAndOther)}**`,inline:true},
      {name:"🪖 Boş Asker Havuzu",value:`Toplam: **${number(pool.grandTotal)}**\nYerleşke: **${number(pool.settlements.filter((item)=>item.total>0).length)}**`,inline:true},
      {name:"📋 Ordular",value:trim(armyLines,700)}
    )
    .setFooter({text:"Aşağıdan ordu seç; havuz aktarımını aynı ekrandan yönet."});
}

function armyDetail(army:ArmyView):EmbedBuilder{
  const units=Object.entries(army.composition)
    .filter(([,quantity])=>Number(quantity??0)>0)
    .sort((left,right)=>Number(right[1]??0)-Number(left[1]??0))
    .map(([unitType,quantity])=>`• **${number(Number(quantity))}** ${unitLabel(unitType as BattleUnitType)}`)
    .join("\n")||"Henüz asker tahsis edilmedi.";
  const sources=new Map<string,string[]>();
  for(const unit of army.units){
    const rows=sources.get(unit.settlement_name)??[];
    rows.push(`${number(unit.quantity)} ${unitLabel(unit.unit_type)}`);
    sources.set(unit.settlement_name,rows);
  }
  const origins=[...sources].map(([settlement,rows])=>`**${settlement}:** ${rows.join(" • ")}`).join("\n")||"Kaynak yerleşke bulunmuyor.";
  const siege=Object.entries(army.siegeComposition??{})
    .filter(([,quantity])=>Number(quantity??0)>0)
    .map(([assetType,quantity])=>{
      const enhanced=Number(army.enhancedSiegeComposition?.[assetType as SiegeAssetType]??0);
      return `• **${number(Number(quantity))}** ${SIEGE_ASSET_BATTLE_STATS[assetType as SiegeAssetType]?.label??assetType}${enhanced?` • ${number(enhanced)} geliştirilmiş`:""}`;
    }).join("\n")||"Kuşatma aleti tahsis edilmedi.";
  const percent=(value:number)=>`%${Math.round(value*100)}`;
  return new EmbedBuilder()
    .setColor(army.active_battle_id?0xb33a3a:0x3f7f5f)
    .setTitle(`⚔️ ${army.name} • Ordu Detayı`)
    .setDescription([
      `Toplam mevcut: **${number(army.total)}** • ${army.active_battle_id?"⚔️ Etkin savaşta":"✅ Kullanıma hazır"}`,
      `Komutan: **${army.commander_name??"Atanmamış"}**${army.commander_name?` (+${army.commander_skill_bonus})`:""}`
    ].join("\n"))
    .addFields(
      {name:"🧭 Kompozisyon",value:trim([`**${army.assessment.label}**`,`Hat ${percent(army.assessment.roleShares.line)} • Mızrak ${percent(army.assessment.roleShares.spear)} • Menzilli ${percent(army.assessment.roleShares.ranged)} • Hareketli ${percent(army.assessment.roleShares.mobile)}`,army.composition_active?`Çarpışma **×${army.assessment.clashMultiplier.toFixed(2)}** • Hasar **×${army.assessment.damageMultiplier.toFixed(2)}**`:`Katsayılar Tur ${army.composition_activation_turn??"?"} başlangıcında etkinleşir`].join("\n"),350)},
      {name:"🪖 Birlikler",value:trim(units,650),inline:true},
      {name:"🏛️ Kökenler",value:trim(origins,700),inline:true},
      {name:"🛠️ Kuşatma Aletleri",value:trim(siege,350)}
    );
}

function controls(countryId:string,armies:ArmyView[],selected:ArmyView|null,pool:ArmyPoolView):ComponentRow[]{
  const country=compactUuid(countryId);
  const selectedArmy=selected?compactUuid(selected.id):null;
  const rows:ComponentRow[]=[];
  if(armies.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`as|${country}`).setPlaceholder("Detayı gösterilecek orduyu seç")
      .addOptions(armies.slice(0,25).map((army)=>({label:army.name.slice(0,100),description:`${number(army.total)} asker${army.active_battle_id?" • Savaşta":""}`.slice(0,100),value:army.id,default:army.id===selected?.id})))
  ));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ac|${country}|${selectedArmy??"none"}|prev`).setLabel("Önceki").setEmoji("◀️").setStyle(ButtonStyle.Secondary).setDisabled(armies.length<2||!selected),
    new ButtonBuilder().setCustomId(`ac|${country}|${selectedArmy??"none"}|next`).setLabel("Sonraki").setEmoji("▶️").setStyle(ButtonStyle.Secondary).setDisabled(armies.length<2||!selected),
    new ButtonBuilder().setCustomId(`ac|${country}|${selectedArmy??"none"}|all`).setLabel("Tüm Havuzu Aktar").setEmoji("📥").setStyle(ButtonStyle.Success).setDisabled(!selected||pool.grandTotal<1||Boolean(selected?.active_battle_id)),
    new ButtonBuilder().setCustomId(`ac|${country}|${selectedArmy??"none"}|pick`).setLabel("Birim Seçerek Aktar").setEmoji("🪖").setStyle(ButtonStyle.Primary).setDisabled(!selected||pool.grandTotal<1||Boolean(selected?.active_battle_id)),
    new ButtonBuilder().setCustomId(`ac|${country}|${selectedArmy??"none"}|refresh`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

export async function armyDashboardPayload(countryId:string,armyValue?:string|null,content:string|null=null){
  const [document,armies,pool]=await Promise.all([
    gameService.document(countryId,{includeArmies:false}),armyService.listCountry(countryId),armyService.unallocatedPool(countryId)
  ]);
  const selected=armyValue
    ?armies.find((army)=>army.id===armyValue||army.name.toLocaleLowerCase("tr-TR")===armyValue.toLocaleLowerCase("tr-TR"))??armies[0]??null
    :armies[0]??null;
  return{
    content,
    embeds:[armySummary(document,armies,pool,selected?.id??null),...(selected?[armyDetail(selected)]:[])],
    components:controls(countryId,armies,selected,pool)
  };
}

export async function sendArmyDashboard(interaction:ChatInputCommandInteraction,countryId:string,armyValue?:string|null):Promise<void>{
  await interaction.editReply(await armyDashboardPayload(countryId,armyValue));
}

function backButton(countryId:string,armyId:string):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ac|${compactUuid(countryId)}|${compactUuid(armyId)}|refresh`).setLabel("Komuta Merkezine Dön").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
  );
}

export async function handleArmyControlSelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  const [kind,countryValue,armyValue,settlementValue]=interaction.customId.split("|");
  if(!["as","aps","apu"].includes(kind??""))return false;
  if(!interaction.guildId||!countryValue)throw new GameError("Ordu kontrol bilgisi geçersiz.");
  const countryId=expandUuid(countryValue);
  if(kind==="as"){
    await interaction.deferUpdate();
    await assertCountryAccess(interaction,countryId);
    await interaction.editReply(await armyDashboardPayload(countryId,interaction.values[0]));
    return true;
  }
  if(!armyValue)throw new GameError("Ordu bilgisi eksik.");
  const armyId=expandUuid(armyValue);
  if(kind==="aps"){
    await interaction.deferUpdate();
    await assertCountryExecutiveAccess(interaction,countryId);
    const settlementId=interaction.values[0]!;
    const units=await armyService.availableSettlementUnits(countryId,settlementId);
    if(!units.length)throw new GameError("Bu yerleşkede aktarılabilecek boş birlik kalmadı.");
    await interaction.editReply({content:"Aktarılacak birlik türünü seç.",components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`apu|${countryValue}|${armyValue}|${compactUuid(settlementId)}`).setPlaceholder("Birim seç").addOptions(units.slice(0,25).map((unit)=>({label:unitLabel(unit.unit_type),description:`${number(unit.available)} asker müsait`,value:unit.unit_type})))
    ),backButton(countryId,armyId)]});
    return true;
  }
  if(!settlementValue)throw new GameError("Yerleşke bilgisi eksik.");
  const unitType=interaction.values[0]!;
  const modal=new ModalBuilder().setCustomId(`apm|${countryValue}|${armyValue}|${settlementValue}|${unitType}`).setTitle("Orduya Birlik Aktar");
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId("quantity").setLabel("Aktarılacak asker sayısı").setPlaceholder("Örn. 500").setStyle(TextInputStyle.Short).setRequired(true)
  ));
  await interaction.showModal(modal);
  return true;
}

export async function handleArmyControlButton(interaction:ButtonInteraction):Promise<boolean>{
  const [kind,countryValue,armyValue,action]=interaction.customId.split("|");
  if(kind!=="ac")return false;
  if(!interaction.guildId||!countryValue||!action)throw new GameError("Ordu düğmesi geçersiz.");
  const countryId=expandUuid(countryValue);
  const armyId=armyValue&&armyValue!=="none"?expandUuid(armyValue):null;
  if(["prev","next","refresh"].includes(action)){
    await interaction.deferUpdate();
    await assertCountryAccess(interaction,countryId);
    let target=armyId;
    if(action!=="refresh"){
      const armies=await armyService.listCountry(countryId);
      const index=Math.max(0,armies.findIndex((army)=>army.id===armyId));
      target=armies.length?armies[(index+(action==="next"?1:-1)+armies.length)%armies.length]!.id:null;
    }
    await interaction.editReply(await armyDashboardPayload(countryId,target));
    return true;
  }
  if(!armyId)throw new GameError("Önce bir ordu oluşturulmalıdır.");
  await interaction.deferUpdate();
  await assertCountryExecutiveAccess(interaction,countryId);
  if(action==="all"){
    await interaction.editReply({content:"Asker havuzundaki **bütün müsait birlikler** seçili orduya aktarılacak. Onaylıyor musun?",components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ac|${countryValue}|${armyValue}|all_confirm`).setLabel("Tümünü Aktar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ac|${countryValue}|${armyValue}|refresh`).setLabel("Vazgeç").setStyle(ButtonStyle.Secondary)
    )]});
    return true;
  }
  if(action==="all_confirm"){
    const result=await armyService.allocateEntirePool({guildId:interaction.guildId,countryId,actorId:interaction.user.id,army:armyId});
    await interaction.editReply(await armyDashboardPayload(countryId,armyId,`✅ **${number(result.allocated)} asker**, **${result.army.name}** ordusuna aktarıldı.`));
    return true;
  }
  if(action==="pick"){
    const pool=await armyService.unallocatedPool(countryId);
    const settlements=pool.settlements.filter((settlement)=>settlement.total>0);
    if(!settlements.length)throw new GameError("Asker havuzunda aktarılabilecek birlik bulunmuyor.");
    await interaction.editReply({content:"Boş birliklerin alınacağı yerleşkeyi seç.",components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`aps|${countryValue}|${armyValue}`).setPlaceholder("Boş askeri bulunan yerleşkeyi seç").addOptions(settlements.slice(0,25).map((settlement)=>({label:settlement.settlement_name.slice(0,100),description:`${number(settlement.total)} asker müsait`,value:settlement.settlement_id})))
    ),backButton(countryId,armyId)]});
    return true;
  }
  throw new GameError("Bu ordu işlemi desteklenmiyor.");
}

export async function handleArmyControlModal(interaction:ModalSubmitInteraction):Promise<boolean>{
  const [kind,countryValue,armyValue,settlementValue,unitValue]=interaction.customId.split("|");
  if(kind!=="apm")return false;
  if(!interaction.guildId||!countryValue||!armyValue||!settlementValue||!unitValue)throw new GameError("Ordu aktarım formu geçersiz.");
  const countryId=expandUuid(countryValue);
  const armyId=expandUuid(armyValue);
  const settlementId=expandUuid(settlementValue);
  await interaction.deferUpdate();
  await assertCountryExecutiveAccess(interaction,countryId);
  const quantity=Number(interaction.fields.getTextInputValue("quantity").replaceAll(".","").replaceAll(",",""));
  if(!Number.isSafeInteger(quantity)||quantity<1)throw new GameError("Aktarılacak asker sayısı pozitif bir tam sayı olmalıdır.");
  const army=await armyService.addUnits({guildId:interaction.guildId,countryId,actorId:interaction.user.id,army:armyId,settlement:settlementId,unitType:unitValue as BattleUnitType,quantity});
  await interaction.editReply(await armyDashboardPayload(countryId,army.id,`✅ **${number(quantity)} ${unitLabel(unitValue as BattleUnitType)}**, **${army.name}** ordusuna aktarıldı.`));
  return true;
}
