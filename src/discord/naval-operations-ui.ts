import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,
  type AutocompleteInteraction,type ButtonInteraction,type ChatInputCommandInteraction
} from "discord.js";
import { gold } from "../domain/format.js";
import type { NavalRaidTier } from "../domain/naval-operations.js";
import { gameService,GameError } from "../services/game-service.js";
import { navalOperationsService,type NavalBlockadeView,type NavalRaidView } from "../services/naval-operations-service.js";
import { isGameMaster,requireGameMaster } from "./auth.js";
import {
  HARBOR_BLOCKADE_BANNER_NAME,HARBOR_BLOCKADE_BANNER_PATH,HARBOR_BLOCKADE_BANNER_URL,
  NAVAL_RAID_BANNER_NAME,NAVAL_RAID_BANNER_PATH,NAVAL_RAID_BANNER_URL
} from "./assets.js";

const RAID_TIER_LABELS:Record<NavalRaidTier,string>={
  CRITICAL_FAILURE:"Kritik Başarısızlık",FAILED:"Başarısız",PARTIAL:"Kısmi Başarı",SUCCESS:"Başarılı",SUPERIOR:"Üstün Başarı"
};

function blockadeEmbed(view:NavalBlockadeView,lifted=false):EmbedBuilder{
  const hunger=view.starvation_adjusted
    ?lifted?"Kuşatma sürüyorsa eksilen 1 açlık turu geri verildi.":"Abluka Uzmanı Sv3: kuşatma erzak dayanıklılığı tek seferlik 1 tur azaltıldı."
    :"Kuşatma açlık süresine ek etki uygulanmadı.";
  return new EmbedBuilder()
    .setColor(lifted?0x6b7280:0x2563eb)
    .setTitle(lifted?"⚓ Abluka Kaldırıldı":"⚓ Deniz Ablukası Başladı")
    .setDescription(`**${view.blockader_country_name}** filosu **${view.target_country_name} / ${view.target_settlement_name}** kıyılarını ${lifted?"serbest bıraktı":"abluka altına aldı"}.`)
    .addFields(
      {name:"Abluka Filosu",value:`${view.fleet_name}${view.admiral_name?` • Amiral ${view.admiral_name}`:" • Amiral yok"}`,inline:true},
      {name:"Deniz Ticareti Etkisi",value:lifted?"Kesinti sona erdi.":`Yerleşkenin deniz ticareti geliri **%${view.sea_trade_loss_percent}** azalır.`,inline:true},
      {name:"Kuşatma Etkisi",value:hunger}
    )
    .setImage(HARBOR_BLOCKADE_BANNER_URL)
    .setFooter({text:`Başlangıç turu: ${view.started_turn}${view.ended_turn!==null?` • Bitiş turu: ${view.ended_turn}`:""}`});
}

function raidButton(id:string):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`naval_raid_roll|${id}`).setStyle(ButtonStyle.Primary).setEmoji("🎲").setLabel("Yağma Zarını At")
  );
}

function raidSecretButton(id:string):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`naval_raid_secret|${id}`).setStyle(ButtonStyle.Secondary).setEmoji("🔒").setLabel("Yönetici Sonucunu Gör")
  );
}

function raidComponents(view:NavalRaidView):ActionRowBuilder<ButtonBuilder>[] {
  if(view.status==="WAITING_ROLL")return [raidButton(view.id)];
  if(view.status==="RESOLVED")return [raidSecretButton(view.id)];
  return [];
}

function raidEmbed(view:NavalRaidView):EmbedBuilder{
  const waiting=view.status==="WAITING_ROLL";
  const cancelled=view.status==="CANCELLED";
  const embed=new EmbedBuilder()
    .setColor(cancelled?0x6b7280:waiting?0xf59e0b:view.loot_amount?0x16a34a:0xdc2626)
    .setTitle(cancelled?"🏳️ Deniz Yağması İptal Edildi":waiting?"🏴‍☠️ Deniz Yağması — Zar Bekleniyor":"🏴‍☠️ Deniz Yağması Sonucu")
    .setDescription(`**${view.raider_country_name} / ${view.fleet_name}** → **${view.target_country_name} / ${view.target_settlement_name}**`)
    .addFields(
      {name:"Yağmacı Filo",value:`${view.fleet_name}${view.admiral_name?` • Amiral ${view.admiral_name}`:" • Amiral yok"}`,inline:true},
      {name:"Oyun Turu",value:String(view.game_turn),inline:true}
    )
    .setImage(NAVAL_RAID_BANNER_URL);
  if(waiting){
    embed.addFields({name:"Sıradaki İşlem",value:"Yağmacı devletin bir oyuncusu aşağıdaki düğmeyle **1d20** atar. Yönetici gerekirse vekâleten atabilir. Zar yalnızca bir kez kullanılabilir."});
  }else if(!cancelled){
    embed.addFields({name:"Ele Geçirilen Ganimet",value:view.loot_amount
      ?`**${gold(view.loot_amount)}**\nHedef yerleşke bu tutarı sonraki Alım Turunda eksik alacak.`
      :"Herhangi bir altın ele geçirilemedi.\nZar sonucu gizli olarak yöneticiye kaydedildi."});
  }
  return embed;
}

function raidSecretEmbed(view:NavalRaidView):EmbedBuilder{
  const waiting=view.status==="WAITING_ROLL";
  const embed=new EmbedBuilder().setColor(0x4b5563).setTitle("🔒 Deniz Yağması — Gizli Yönetici Raporu")
    .setDescription(`**${view.raider_country_name} / ${view.fleet_name}** → **${view.target_country_name} / ${view.target_settlement_name}**`)
    .addFields({name:"Durum",value:view.status,inline:true},{name:"Gelir Dayanağı",value:gold(view.income_basis??0),inline:true});
  if(waiting)return embed.addFields({name:"Yağma Zarı",value:"Henüz atılmadı."});
  if(view.status==="CANCELLED")return embed.addFields({name:"Sonuç",value:"Operasyon zar atılmadan iptal edildi."});
  return embed.addFields(
    {name:"Gizli Yağma Zarı",value:`1d20: **${view.roll_value}**${view.roll_bonus?` + ${view.roll_bonus}`:""} = **${view.roll_total}**\n**${RAID_TIER_LABELS[view.result_tier!] }**`,inline:true},
    {name:"Gelir Cezası",value:`Ganimet: **${gold(view.loot_amount??0)}**\nBekleyen kesinti: **${gold(view.income_deduction_remaining??0)}**`,inline:true},
    {name:"Gizli Yakalanma Denetimi",value:`1d20: **${view.detection_roll}**${view.detection_modifier?` ${view.detection_modifier>0?"+":"−"} ${Math.abs(view.detection_modifier)}`:""} = **${view.detection_total}**\n${view.detected?"🚨 Filo tespit edildi. Savunan taraf müdahale ederse deniz savaşı açılabilir.":"🌫️ Filo tespit edilmeden uzaklaştı."}`},
    {name:"Kesinti Durumu",value:view.income_deduction_applied_turn!==null?`Tur ${view.income_deduction_applied_turn} Alım Turunda tamamen uygulandı.`:"Sonraki Alım Turunu bekliyor."}
  );
}

function blockadeFile():AttachmentBuilder{return new AttachmentBuilder(HARBOR_BLOCKADE_BANNER_PATH,{name:HARBOR_BLOCKADE_BANNER_NAME});}
function raidFile():AttachmentBuilder{return new AttachmentBuilder(NAVAL_RAID_BANNER_PATH,{name:NAVAL_RAID_BANNER_NAME});}

async function refreshRaidCard(interaction:ChatInputCommandInteraction|ButtonInteraction,view:NavalRaidView):Promise<void>{
  if(!view.public_channel_id||!view.public_message_id)return;
  try{
    const channel=await interaction.client.channels.fetch(view.public_channel_id);
    if(!channel?.isTextBased()||channel.isDMBased()||!("messages" in channel))return;
    const message=await channel.messages.fetch(view.public_message_id);
    await message.edit({embeds:[raidEmbed(view)],components:raidComponents(view)});
  }catch(error){console.error("Deniz yağması kartı güncellenemedi",{raidId:view.id,error});}
}

export async function handleNavalOperationsCommand(interaction:ChatInputCommandInteraction):Promise<boolean>{
  if(!["abluka","deniz-yagmasi"].includes(interaction.commandName))return false;
  requireGameMaster(interaction);
  if(!interaction.guildId||!interaction.channelId)throw new GameError("Sunucu veya kanal bulunamadı.");
  const sub=interaction.options.getSubcommand();
  await interaction.deferReply({ephemeral:interaction.commandName==="deniz-yagmasi"&&sub==="detay"});
  if(interaction.commandName==="abluka"){
    if(sub==="baslat"){
      const view=await navalOperationsService.startBlockade({
        guildId:interaction.guildId,actorId:interaction.user.id,
        blockaderCountryId:interaction.options.getString("ablukaci-ulke",true),fleetId:interaction.options.getString("filo",true),
        targetCountryId:interaction.options.getString("hedef-ulke",true),targetSettlementId:interaction.options.getString("hedef-yerleske",true)
      });
      await interaction.editReply({embeds:[blockadeEmbed(view)],files:[blockadeFile()]});
    }else{
      const view=await navalOperationsService.liftBlockade({guildId:interaction.guildId,actorId:interaction.user.id,blockadeId:interaction.options.getString("abluka",true)});
      await interaction.editReply({embeds:[blockadeEmbed(view,true)],files:[blockadeFile()]});
    }
    return true;
  }
  if(sub==="detay"){
    const view=await navalOperationsService.getRaid(interaction.guildId,interaction.options.getString("yagma",true));
    await interaction.editReply({embeds:[raidSecretEmbed(view)]});
  }else if(sub==="baslat"){
    const view=await navalOperationsService.startRaid({
      guildId:interaction.guildId,actorId:interaction.user.id,channelId:interaction.channelId,
      raiderCountryId:interaction.options.getString("yagmaci-ulke",true),fleetId:interaction.options.getString("filo",true),
      targetCountryId:interaction.options.getString("hedef-ulke",true),targetSettlementId:interaction.options.getString("hedef-yerleske",true)
    });
    await interaction.editReply({embeds:[raidEmbed(view)],components:[raidButton(view.id)],files:[raidFile()]});
    const message=await interaction.fetchReply();
    await navalOperationsService.attachRaidMessage(interaction.guildId,view.id,interaction.channelId,message.id);
  }else{
    const view=await navalOperationsService.cancelRaid({guildId:interaction.guildId,actorId:interaction.user.id,raidId:interaction.options.getString("yagma",true)});
    await refreshRaidCard(interaction,view);
    await interaction.editReply({embeds:[raidEmbed(view)],files:[raidFile()]});
  }
  return true;
}

export async function handleNavalOperationsButton(interaction:ButtonInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("naval_raid_roll|")&&!interaction.customId.startsWith("naval_raid_secret|"))return false;
  if(!interaction.guildId)throw new GameError("Sunucu bulunamadı.");
  const raidId=interaction.customId.split("|")[1];
  if(!raidId)throw new GameError("Yağma zarı düğmesi bozuk.");
  if(interaction.customId.startsWith("naval_raid_secret|")){
    if(!isGameMaster(interaction))throw new GameError("Bu gizli raporu yalnızca oyun yöneticisi görüntüleyebilir.");
    await interaction.deferReply({ephemeral:true});
    const view=await navalOperationsService.getRaid(interaction.guildId,raidId);
    await interaction.editReply({embeds:[raidSecretEmbed(view)]});
    return true;
  }
  await interaction.deferUpdate();
  const result=await navalOperationsService.resolveRaid({guildId:interaction.guildId,raidId,actorId:interaction.user.id,isGameMaster:isGameMaster(interaction)});
  await interaction.editReply({content:`🎲 <@${interaction.user.id}> yağma zarını attı${result.isProxy?" **(Yönetici vekili)**":""}. Sonuç gizli işlendi; yönetici kilitli düğmeden inceleyebilir.`,embeds:[raidEmbed(result.raid)],components:[raidSecretButton(result.raid.id)]});
  if(interaction.message.id!==result.raid.public_message_id)await refreshRaidCard(interaction,result.raid);
  return true;
}

function includesQuery(value:string,query:string):boolean{return !query||value.toLocaleLowerCase("tr-TR").includes(query);}

export async function handleNavalOperationsAutocomplete(interaction:AutocompleteInteraction):Promise<boolean>{
  if(!["abluka","deniz-yagmasi"].includes(interaction.commandName))return false;
  if(!interaction.guildId||!isGameMaster(interaction)){await interaction.respond([]);return true;}
  const focused=interaction.options.getFocused(true);
  const query=String(focused.value).toLocaleLowerCase("tr-TR").trim();
  if(["ablukaci-ulke","yagmaci-ulke","hedef-ulke"].includes(focused.name)){
    const countries=await gameService.listCountries(interaction.guildId);
    await interaction.respond(countries.filter((item)=>includesQuery(item.name,query)).slice(0,25).map((item)=>({name:item.name.slice(0,100),value:item.id})));
    return true;
  }
  if(focused.name==="filo"){
    const countryId=interaction.options.getString(interaction.commandName==="abluka"?"ablukaci-ulke":"yagmaci-ulke");
    if(!countryId){await interaction.respond([]);return true;}
    const fleets=await navalOperationsService.listCountryFleets(interaction.guildId,countryId);
    await interaction.respond(fleets.filter((item)=>includesQuery(item.name,query)).slice(0,25).map((item)=>({name:`${item.name} • ${item.total} gemi`.slice(0,100),value:item.id})));
    return true;
  }
  if(focused.name==="hedef-yerleske"){
    const countryId=interaction.options.getString("hedef-ulke");
    if(!countryId){await interaction.respond([]);return true;}
    const settlements=await navalOperationsService.listCoastalSettlements(interaction.guildId,countryId);
    await interaction.respond(settlements.filter((item)=>includesQuery(item.name,query)).slice(0,25).map((item)=>({name:`⚓ ${item.name}`.slice(0,100),value:item.id})));
    return true;
  }
  if(focused.name==="abluka"){
    const rows=await navalOperationsService.listActiveBlockades(interaction.guildId);
    await interaction.respond(rows.filter((item)=>includesQuery(`${item.blockader_country_name} ${item.target_settlement_name}`,query)).slice(0,25)
      .map((item)=>({name:`${item.blockader_country_name} • ${item.fleet_name} → ${item.target_settlement_name}`.slice(0,100),value:item.id})));
    return true;
  }
  if(focused.name==="yagma"){
    const rows=interaction.options.getSubcommand(false)==="detay"
      ?await navalOperationsService.listRecentRaids(interaction.guildId)
      :await navalOperationsService.listPendingRaids(interaction.guildId);
    await interaction.respond(rows.filter((item)=>includesQuery(`${item.raider_country_name} ${item.target_settlement_name}`,query)).slice(0,25)
      .map((item)=>({name:`${item.raider_country_name} • ${item.fleet_name} → ${item.target_settlement_name}`.slice(0,100),value:item.id})));
    return true;
  }
  await interaction.respond([]);
  return true;
}
