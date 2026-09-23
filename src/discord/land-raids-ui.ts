import { ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,type AutocompleteInteraction,type ButtonInteraction,type ChatInputCommandInteraction } from "discord.js";
import { gold } from "../domain/format.js";
import type { LandRaidTier,LandRaidType } from "../domain/land-raids.js";
import { gameService,GameError } from "../services/game-service.js";
import { landRaidsService,type LandRaidView } from "../services/land-raids-service.js";
import { isGameMaster,requireGameMaster } from "./auth.js";
import { LAND_RAID_BANNER_NAME,LAND_RAID_BANNER_PATH,LAND_RAID_BANNER_URL } from "./assets.js";

const LABELS:Record<LandRaidTier,string>={CRITICAL_FAILURE:"Kritik Başarısızlık",LOW:"Sınırlı Sonuç",MEDIUM:"Başarılı",HIGH:"Büyük Başarı",TOP:"Üstün Başarı"};
const typeFor=(command:string):LandRaidType=>command==="bolgesel-yagma"?"REGIONAL":"CITY";
const titleFor=(type:LandRaidType)=>type==="REGIONAL"?"Bölgesel Yağma":"Şehir Talanı";

function rollButton(view:LandRaidView){return new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
  .setCustomId(`land_raid_roll|${view.id}`).setStyle(ButtonStyle.Danger).setEmoji("🎲").setLabel(`${view.roll_sides===20?"1d20":"1d100"} Yağma Zarını At`));}
function secretButton(view:LandRaidView){return new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
  .setCustomId(`land_raid_secret|${view.id}`).setStyle(ButtonStyle.Secondary).setEmoji("🔒").setLabel("Yönetici Sonucunu Gör"));}
function components(view:LandRaidView){return view.status==="WAITING_ROLL"?[rollButton(view)]:view.status==="RESOLVED"?[secretButton(view)]:[];}

function publicEmbed(view:LandRaidView):EmbedBuilder{
  const waiting=view.status==="WAITING_ROLL",cancelled=view.status==="CANCELLED",title=titleFor(view.raid_type);
  const embed=new EmbedBuilder().setColor(cancelled?0x6b7280:waiting?0xc28436:(view.loot_amount||view.slave_amount)?0x8b5a2b:0x991b1b)
    .setTitle(cancelled?`🏳️ ${title} İptal Edildi`:waiting?`🔥 ${title} — Zar Bekleniyor`:`🔥 ${title} Sonucu`)
    .setDescription(`**${view.raider_country_name} / ${view.army_name}** → **${view.target_country_name} / ${view.target_settlement_name}**`)
    .addFields({name:"Yağmacı Ordu",value:`${view.army_name} • ${view.army_strength.toLocaleString("tr-TR")} asker`,inline:true},
      {name:"Oyun Turu",value:String(view.game_turn),inline:true},{name:"Kazanç Yerleşkesi",value:view.payout_settlement_name,inline:true})
    .setImage(LAND_RAID_BANNER_URL);
  if(waiting)embed.addFields({name:"Sıradaki İşlem",value:`Yağmacı devletin bir oyuncusu aşağıdaki düğmeyle **1d${view.roll_sides}** atar. Yönetici gerekirse vekâleten atabilir. Zar yalnızca bir kez kullanılabilir; sonucu yalnızca yönetici görür.`});
  else if(!cancelled)embed.addFields({name:"Ele Geçirilenler",value:`🪙 **${gold(view.loot_amount??0)}**\n⛓️ **${(view.slave_amount??0).toLocaleString("tr-TR")} Köle**\nAltın ve köleler doğrudan **${view.payout_settlement_name}** yerleşkesine aktarıldı.`});
  return embed;
}

function secretEmbed(view:LandRaidView):EmbedBuilder{
  const embed=new EmbedBuilder().setColor(0x4b5563).setTitle(`🔒 ${titleFor(view.raid_type)} — Gizli Yönetici Raporu`)
    .setDescription(`**${view.raider_country_name} / ${view.army_name}** → **${view.target_country_name} / ${view.target_settlement_name}**`)
    .addFields({name:"Durum",value:view.status,inline:true},{name:"Ordu / Nüfus",value:`${view.army_strength.toLocaleString("tr-TR")} / ${view.target_population_before.toLocaleString("tr-TR")}`,inline:true},
      {name:"Gelir Dayanağı",value:gold(view.income_basis),inline:true});
  if(view.status==="WAITING_ROLL")return embed.addFields({name:"Yağma Zarı",value:"Henüz atılmadı."});
  if(view.status==="CANCELLED")return embed.addFields({name:"Sonuç",value:"Operasyon zar atılmadan iptal edildi."});
  return embed.addFields(
    {name:"Gizli Zar",value:`1d${view.roll_sides}: **${view.roll_value}** ${view.size_modifier>=0?"+":"−"} ${Math.abs(view.size_modifier)} = **${view.roll_total}**\n**${LABELS[view.result_tier!]}**`,inline:true},
    {name:"Ganimet",value:`${gold(view.loot_amount??0)} • ${(view.slave_amount??0).toLocaleString("tr-TR")} köle`,inline:true},
    {name:"Hedef Etkisi",value:`Nüfus kaybı: **${(view.population_loss??0).toLocaleString("tr-TR")}** (%${view.population_loss_percent??0})\nSonraki Alım Turu gelir cezası: **%${view.income_penalty_percent??0}**${view.army_exposed?"\n⚠️ Yağmacı ordunun konumu açığa çıktı.":""}`}
  );
}

function banner(){return new AttachmentBuilder(LAND_RAID_BANNER_PATH,{name:LAND_RAID_BANNER_NAME});}
async function refresh(interaction:ChatInputCommandInteraction|ButtonInteraction,view:LandRaidView){
  if(!view.public_channel_id||!view.public_message_id)return;
  try{const channel=await interaction.client.channels.fetch(view.public_channel_id);if(!channel?.isTextBased()||channel.isDMBased()||!("messages" in channel))return;
    const message=await channel.messages.fetch(view.public_message_id);await message.edit({embeds:[publicEmbed(view)],components:components(view)});
  }catch(error){console.error("Kara yağması kartı güncellenemedi",{raidId:view.id,error});}
}

export async function handleLandRaidsCommand(interaction:ChatInputCommandInteraction):Promise<boolean>{
  if(!["bolgesel-yagma","sehir-talani"].includes(interaction.commandName))return false;
  requireGameMaster(interaction);if(!interaction.guildId||!interaction.channelId)throw new GameError("Sunucu veya kanal bulunamadı.");
  const sub=interaction.options.getSubcommand(),type=typeFor(interaction.commandName);await interaction.deferReply({ephemeral:sub==="detay"});
  if(sub==="baslat"){
    const view=await landRaidsService.startRaid({guildId:interaction.guildId,actorId:interaction.user.id,type,channelId:interaction.channelId,
      raiderCountryId:interaction.options.getString("yagmaci-ulke",true),armyId:interaction.options.getString("ordu",true),
      targetCountryId:interaction.options.getString("hedef-ulke",true),targetSettlementId:interaction.options.getString("hedef-yerleske",true),
      payoutSettlementId:interaction.options.getString("kazanc-yerleskesi",true)});
    await interaction.editReply({embeds:[publicEmbed(view)],components:[rollButton(view)],files:[banner()]});
    const message=await interaction.fetchReply();await landRaidsService.attachMessage(interaction.guildId,view.id,interaction.channelId,message.id);
  }else if(sub==="iptal"){
    const view=await landRaidsService.cancelRaid({guildId:interaction.guildId,actorId:interaction.user.id,raidId:interaction.options.getString("yagma",true)});
    await refresh(interaction,view);await interaction.editReply({embeds:[publicEmbed(view)],files:[banner()]});
  }else{
    const view=await landRaidsService.getRaid(interaction.guildId,interaction.options.getString("yagma",true));await interaction.editReply({embeds:[secretEmbed(view)]});
  }
  return true;
}

export async function handleLandRaidsButton(interaction:ButtonInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("land_raid_roll|")&&!interaction.customId.startsWith("land_raid_secret|"))return false;
  if(!interaction.guildId)throw new GameError("Sunucu bulunamadı.");const id=interaction.customId.split("|")[1];if(!id)throw new GameError("Yağma düğmesi bozuk.");
  if(interaction.customId.startsWith("land_raid_secret|")){if(!isGameMaster(interaction))throw new GameError("Bu gizli raporu yalnızca oyun yöneticisi görüntüleyebilir.");
    await interaction.deferReply({ephemeral:true});await interaction.editReply({embeds:[secretEmbed(await landRaidsService.getRaid(interaction.guildId,id))]});return true;}
  await interaction.deferUpdate();const result=await landRaidsService.resolveRaid({guildId:interaction.guildId,actorId:interaction.user.id,raidId:id,isGameMaster:isGameMaster(interaction)});
  await interaction.editReply({content:`🎲 <@${interaction.user.id}> yağma zarını attı${result.isProxy?" **(Yönetici vekili)**":""}. Sonuç gizli işlendi.`,embeds:[publicEmbed(result.raid)],components:[secretButton(result.raid)]});
  if(interaction.message.id!==result.raid.public_message_id)await refresh(interaction,result.raid);return true;
}

const matches=(value:string,query:string)=>!query||value.toLocaleLowerCase("tr-TR").includes(query);
export async function handleLandRaidsAutocomplete(interaction:AutocompleteInteraction):Promise<boolean>{
  if(!["bolgesel-yagma","sehir-talani"].includes(interaction.commandName))return false;
  if(!interaction.guildId||!isGameMaster(interaction)){await interaction.respond([]);return true;}
  const focused=interaction.options.getFocused(true),query=String(focused.value).toLocaleLowerCase("tr-TR").trim(),type=typeFor(interaction.commandName);
  if(["yagmaci-ulke","hedef-ulke"].includes(focused.name)){const rows=await gameService.listCountries(interaction.guildId);await interaction.respond(rows.filter(r=>matches(r.name,query)).slice(0,25).map(r=>({name:r.name.slice(0,100),value:r.id})));return true;}
  if(focused.name==="ordu"){const country=interaction.options.getString("yagmaci-ulke");if(!country){await interaction.respond([]);return true;}const rows=await landRaidsService.listArmies(interaction.guildId,country);
    await interaction.respond(rows.filter(r=>matches(r.name,query)).slice(0,25).map(r=>({name:`${r.name} • ${r.total.toLocaleString("tr-TR")} asker`.slice(0,100),value:r.id})));return true;}
  if(focused.name==="hedef-yerleske"){const raider=interaction.options.getString("yagmaci-ulke"),target=interaction.options.getString("hedef-ulke");if(!raider||!target){await interaction.respond([]);return true;}
    const rows=await landRaidsService.listRaidTargets(interaction.guildId,raider,target,type);await interaction.respond(rows.filter(r=>matches(r.name,query)).slice(0,25).map(r=>({name:r.name.slice(0,100),value:r.id})));return true;}
  if(focused.name==="kazanc-yerleskesi"){const country=interaction.options.getString("yagmaci-ulke");if(!country){await interaction.respond([]);return true;}
    const rows=await landRaidsService.listSettlements(interaction.guildId,country);await interaction.respond(rows.filter(r=>matches(r.name,query)).slice(0,25).map(r=>({name:r.name.slice(0,100),value:r.id})));return true;}
  if(focused.name==="yagma"){const rows=await landRaidsService.listRaids(interaction.guildId,type,interaction.options.getSubcommand(false)==="detay");
    await interaction.respond(rows.filter(r=>matches(`${r.raider_country_name} ${r.target_settlement_name}`,query)).slice(0,25).map(r=>({name:`${r.raider_country_name} • ${r.army_name} → ${r.target_settlement_name}`.slice(0,100),value:r.id})));return true;}
  await interaction.respond([]);return true;
}
