import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,StringSelectMenuBuilder,
  TextInputBuilder,TextInputStyle,type ButtonInteraction,type ChatInputCommandInteraction,
  type ModalSubmitInteraction,type StringSelectMenuInteraction
} from "discord.js";
import type {NavalUnitType} from "../domain/battle.js";
import {SHIPS} from "../domain/catalog.js";
import {number} from "../domain/format.js";
import {fleetService,type FleetPoolView,type FleetView} from "../services/fleet-service.js";
import {navalRepairService} from "../services/naval-repair-service.js";
import {gameService,GameError} from "../services/game-service.js";
import {assertCountryAccess,assertCountryExecutiveAccess} from "./auth.js";
import {compactUuid,expandUuid} from "./document-component-id.js";
import {renderFleetEmbed} from "./fleet-embed.js";

type ComponentRow=ActionRowBuilder<StringSelectMenuBuilder>|ActionRowBuilder<ButtonBuilder>;
const trim=(value:string,limit:number)=>value.length<=limit?value:`${value.slice(0,Math.max(0,limit-2))}…`;
const shipLabel=(shipType:NavalUnitType)=>SHIPS[shipType]?.name??shipType;

function fleetSummary(input:{
  countryName:string;fleets:FleetView[];pool:FleetPoolView;selectedFleetId:string|null;
  repairCount:number;repairShips:number;
}):EmbedBuilder{
  const fleetShips=input.fleets.reduce((sum,fleet)=>sum+fleet.totalShips,0);
  const crew=input.fleets.reduce((sum,fleet)=>sum+fleet.crew,0);
  const transport=input.fleets.reduce((sum,fleet)=>sum+fleet.transportCapacity,0);
  const damaged=input.fleets.reduce((sum,fleet)=>sum+Number(fleet.damagedTotal??0),0);
  const disabled=input.fleets.reduce((sum,fleet)=>sum+Number(fleet.disabledTotal??0),0);
  const lines=input.fleets.length?input.fleets.map((fleet)=>[
    fleet.id===input.selectedFleetId?"▶":"•",fleet.id===input.selectedFleetId?`**${fleet.name}**`:fleet.name,
    `— **${number(fleet.totalShips)}** gemi`,fleet.active_battle_id?"• ⚔️ Savaşta":""
  ].filter(Boolean).join(" ")).join("\n"):"Kurulmuş bir filo bulunmuyor.";
  return new EmbedBuilder().setColor(disabled?0xa9483d:0x2878a8)
    .setTitle(`⚓ ${input.countryName} • Filo Komuta Merkezi`)
    .setDescription("Devletin filoları, gemi durumları ve henüz bir filoya bağlanmamış liman rezervleri.")
    .addFields(
      {name:"🚢 Donanma",value:`Filo sayısı: **${number(input.fleets.length)}**\nFilolara bağlı: **${number(fleetShips)}**\nBoş liman rezervi: **${number(input.pool.grandTotal)}**`,inline:true},
      {name:"🛠️ Gemi Durumu",value:`Hasarlı: **${number(damaged)}**\nİş göremez: **${number(disabled)}**\nTamir filosu: **${number(input.repairCount)}** • ${number(input.repairShips)} gemi`,inline:true},
      {name:"👥 Kapasite",value:`Mürettebat: **${number(crew)}**\nAsker taşıma: **${number(transport)}**`,inline:true},
      {name:"📋 Filolar",value:trim(lines,700)}
    ).setFooter({text:"Aşağıdan filo seç; liman rezervi aktarımını aynı ekrandan yönet."});
}

function poolDetail(countryName:string,pool:FleetPoolView):EmbedBuilder{
  const populated=pool.settlements.filter((settlement)=>settlement.total>0);
  const sections=populated.map((settlement)=>[
    `**⚓ ${settlement.settlement_name} — ${number(settlement.total)} gemi**`,
    settlement.ships.map((ship)=>`• ${shipLabel(ship.ship_type)}: **${number(ship.available)}**`).join("\n")
  ].join("\n"));
  return new EmbedBuilder().setColor(pool.grandTotal?0x2f6f8f:0x6b6b6b)
    .setTitle(`🚢 ${countryName} • Boş Gemi Havuzu`)
    .setDescription(trim(sections.length?sections.join("\n\n"):"Filolara tahsis edilmemiş gemi bulunmuyor.",1_200))
    .setFooter({text:`Toplam müsait: ${number(pool.grandTotal)} gemi • Tamirdeki gemiler havuza dahil değildir`});
}

function controls(countryId:string,fleets:FleetView[],selected:FleetView|null,pool:FleetPoolView):ComponentRow[]{
  const country=compactUuid(countryId);
  const fleet=selected?compactUuid(selected.id):null;
  const rows:ComponentRow[]=[];
  if(fleets.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`fs|${country}`).setPlaceholder("Detayı gösterilecek filoyu seç")
      .addOptions(fleets.slice(0,25).map((item)=>({
        label:item.name.slice(0,100),description:`${number(item.totalShips)} gemi${item.active_battle_id?" • Savaşta":""}`.slice(0,100),
        value:item.id,default:item.id===selected?.id
      })))
  ));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`fc|${country}|${fleet??"none"}|prev`).setLabel("Önceki").setEmoji("◀️").setStyle(ButtonStyle.Secondary).setDisabled(fleets.length<2||!selected),
    new ButtonBuilder().setCustomId(`fc|${country}|${fleet??"none"}|next`).setLabel("Sonraki").setEmoji("▶️").setStyle(ButtonStyle.Secondary).setDisabled(fleets.length<2||!selected),
    new ButtonBuilder().setCustomId(`fc|${country}|${fleet??"none"}|all`).setLabel("Tüm Havuzu Aktar").setEmoji("📥").setStyle(ButtonStyle.Success).setDisabled(!selected||pool.grandTotal<1||Boolean(selected?.active_battle_id)),
    new ButtonBuilder().setCustomId(`fc|${country}|${fleet??"none"}|pick`).setLabel("Gemi Seçerek Aktar").setEmoji("🚢").setStyle(ButtonStyle.Primary).setDisabled(!selected||pool.grandTotal<1||Boolean(selected?.active_battle_id)),
    new ButtonBuilder().setCustomId(`fc|${country}|${fleet??"none"}|refresh`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

export async function fleetDashboardPayload(countryId:string,fleetValue?:string|null,content:string|null=null){
  const [document,fleets,pool,repairs]=await Promise.all([
    gameService.document(countryId,{includeArmies:false}),fleetService.listCountry(countryId),
    fleetService.unallocatedPool(countryId),navalRepairService.listCountry(countryId)
  ]);
  const selected=fleetValue
    ?fleets.find((fleet)=>fleet.id===fleetValue||fleet.name.toLocaleLowerCase("tr-TR")===fleetValue.toLocaleLowerCase("tr-TR"))??fleets[0]??null
    :fleets[0]??null;
  return{
    content,
    embeds:[
      fleetSummary({
        countryName:document.country.name,fleets,pool,selectedFleetId:selected?.id??null,
        repairCount:repairs.length,repairShips:repairs.reduce((sum,repair)=>sum+repair.totalShips,0)
      }),...(selected?[renderFleetEmbed(selected)]:[]),poolDetail(document.country.name,pool)
    ],components:controls(countryId,fleets,selected,pool)
  };
}

export async function sendFleetDashboard(interaction:ChatInputCommandInteraction,countryId:string,fleetValue?:string|null):Promise<void>{
  await interaction.editReply(await fleetDashboardPayload(countryId,fleetValue));
}

function backButton(countryId:string,fleetId:string):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`fc|${compactUuid(countryId)}|${compactUuid(fleetId)}|refresh`).setLabel("Filo Merkezine Dön").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
  );
}

export async function handleFleetControlSelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  const [kind,countryValue,fleetValue,settlementValue]=interaction.customId.split("|");
  if(!["fs","fps","fpu"].includes(kind??""))return false;
  if(!interaction.guildId||!countryValue)throw new GameError("Filo kontrol bilgisi geçersiz.");
  const countryId=expandUuid(countryValue);
  if(kind==="fs"){
    await interaction.deferUpdate();
    await assertCountryAccess(interaction,countryId);
    await interaction.editReply(await fleetDashboardPayload(countryId,interaction.values[0]));
    return true;
  }
  if(!fleetValue)throw new GameError("Filo bilgisi eksik.");
  const fleetId=expandUuid(fleetValue);
  if(kind==="fps"){
    await interaction.deferUpdate();
    await assertCountryExecutiveAccess(interaction,countryId);
    const settlementId=interaction.values[0]!;
    const ships=await fleetService.availableSettlementShips(countryId,settlementId);
    if(!ships.length)throw new GameError("Bu limanda aktarılabilecek boş gemi kalmadı.");
    await interaction.editReply({content:"Aktarılacak gemi türünü seç.",components:[
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`fpu|${countryValue}|${fleetValue}|${compactUuid(settlementId)}`).setPlaceholder("Gemi türünü seç")
          .addOptions(ships.slice(0,25).map((ship)=>({label:shipLabel(ship.ship_type),description:`${number(ship.available)} gemi müsait`,value:ship.ship_type})))
      ),backButton(countryId,fleetId)
    ]});
    return true;
  }
  if(!settlementValue)throw new GameError("Liman bilgisi eksik.");
  const shipType=interaction.values[0]!;
  const modal=new ModalBuilder().setCustomId(`fpm|${countryValue}|${fleetValue}|${settlementValue}|${shipType}`).setTitle("Filoya Gemi Aktar");
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId("quantity").setLabel("Aktarılacak gemi sayısı").setPlaceholder("Örn. 5").setStyle(TextInputStyle.Short).setRequired(true)
  ));
  await interaction.showModal(modal);
  return true;
}

export async function handleFleetControlButton(interaction:ButtonInteraction):Promise<boolean>{
  const [kind,countryValue,fleetValue,action]=interaction.customId.split("|");
  if(kind!=="fc")return false;
  if(!interaction.guildId||!countryValue||!action)throw new GameError("Filo düğmesi geçersiz.");
  const countryId=expandUuid(countryValue);
  const fleetId=fleetValue&&fleetValue!=="none"?expandUuid(fleetValue):null;
  if(["prev","next","refresh"].includes(action)){
    await interaction.deferUpdate();
    await assertCountryAccess(interaction,countryId);
    let target=fleetId;
    if(action!=="refresh"){
      const fleets=await fleetService.listCountry(countryId);
      const index=Math.max(0,fleets.findIndex((fleet)=>fleet.id===fleetId));
      target=fleets.length?fleets[(index+(action==="next"?1:-1)+fleets.length)%fleets.length]!.id:null;
    }
    await interaction.editReply(await fleetDashboardPayload(countryId,target));
    return true;
  }
  if(!fleetId)throw new GameError("Önce bir filo oluşturulmalıdır.");
  await interaction.deferUpdate();
  await assertCountryExecutiveAccess(interaction,countryId);
  if(action==="all"){
    await interaction.editReply({content:"Boş gemi havuzundaki **bütün müsait gemiler** seçili filoya aktarılacak. Onaylıyor musun?",components:[
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`fc|${countryValue}|${fleetValue}|all_confirm`).setLabel("Tümünü Aktar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fc|${countryValue}|${fleetValue}|refresh`).setLabel("Vazgeç").setStyle(ButtonStyle.Secondary)
      )
    ]});
    return true;
  }
  if(action==="all_confirm"){
    const result=await fleetService.allocateEntirePool({guildId:interaction.guildId,countryId,actorId:interaction.user.id,fleet:fleetId});
    await interaction.editReply(await fleetDashboardPayload(countryId,fleetId,`✅ **${number(result.allocated)} gemi**, **${result.fleet.name}** filosuna aktarıldı.`));
    return true;
  }
  if(action==="pick"){
    const pool=await fleetService.unallocatedPool(countryId);
    const settlements=pool.settlements.filter((settlement)=>settlement.total>0);
    if(!settlements.length)throw new GameError("Boş gemi havuzunda aktarılabilecek gemi bulunmuyor.");
    await interaction.editReply({content:"Boş gemilerin alınacağı limanı seç.",components:[
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`fps|${countryValue}|${fleetValue}`).setPlaceholder("Boş gemisi bulunan limanı seç")
          .addOptions(settlements.slice(0,25).map((settlement)=>({label:settlement.settlement_name.slice(0,100),description:`${number(settlement.total)} gemi müsait`,value:settlement.settlement_id})))
      ),backButton(countryId,fleetId)
    ]});
    return true;
  }
  throw new GameError("Bu filo işlemi desteklenmiyor.");
}

export async function handleFleetControlModal(interaction:ModalSubmitInteraction):Promise<boolean>{
  const [kind,countryValue,fleetValue,settlementValue,shipValue]=interaction.customId.split("|");
  if(kind!=="fpm")return false;
  if(!interaction.guildId||!countryValue||!fleetValue||!settlementValue||!shipValue)throw new GameError("Filo aktarım formu geçersiz.");
  const countryId=expandUuid(countryValue);
  const fleetId=expandUuid(fleetValue);
  const settlementId=expandUuid(settlementValue);
  await interaction.deferUpdate();
  await assertCountryExecutiveAccess(interaction,countryId);
  const quantity=Number(interaction.fields.getTextInputValue("quantity").replaceAll(".","").replaceAll(",",""));
  if(!Number.isSafeInteger(quantity)||quantity<1)throw new GameError("Aktarılacak gemi sayısı pozitif bir tam sayı olmalıdır.");
  const fleet=await fleetService.addShips({
    guildId:interaction.guildId,countryId,actorId:interaction.user.id,fleet:fleetId,
    settlement:settlementId,shipType:shipValue as NavalUnitType,quantity
  });
  await interaction.editReply(await fleetDashboardPayload(countryId,fleet.id,`✅ **${number(quantity)} ${shipLabel(shipValue as NavalUnitType)}**, **${fleet.name}** filosuna aktarıldı.`));
  return true;
}
