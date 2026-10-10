import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,MessageFlags,StringSelectMenuBuilder,
  type ButtonInteraction,type ChatInputCommandInteraction,type StringSelectMenuInteraction,type TextChannel
} from "discord.js";
import { STEPPE_TRIBUTE_RESPONSES,type SteppeTributeResponse } from "../domain/steppe-hegemony.js";
import {STEPPE_WAR_CALL_RESPONSES,steppeLoyaltyLabel,type SteppeWarCallResponse} from "../domain/steppe-politics.js";
import { diplomacyService } from "../services/diplomacy-service.js";
import { gameService,GameError } from "../services/game-service.js";
import { steppeHegemonyService,type SteppeTributeOfferView } from "../services/steppe-hegemony-service.js";
import {steppePoliticsService,type SteppePoliticsView,type SteppeWarCallResponseView,type SteppeWarCallView} from "../services/steppe-politics-service.js";
import { isGameMaster,requireGameMaster,resolveCountry } from "./auth.js";
import { playerMentionPayload } from "./player-mentions.js";

const RESPONSE_COLORS:Record<SteppeTributeResponse,number>={FULL:0x2e8b57,HALF:0xd4a72c,NONE:0xb22222};

function delta(value:number):string{return value>0?`+${value}`:String(value);}

function steppeHierarchyEmbed(view:SteppePoliticsView):EmbedBuilder{
  const khan=view.titles.find((title)=>title.tier==="KHAN");
  const landholders=view.titles.filter((title)=>title.tier==="LANDHOLDER");
  const lines:string[]=[];
  if(khan){
    const direct=khan.holdings.map((holding)=>holding.name).join(", ")||"Doğrudan toprak bağlanmadı";
    lines.push(`👑 **${khan.titleName}** — ${khan.holderName}${khan.holderUserId?` • <@${khan.holderUserId}>`:""}`);
    lines.push(`↳ Hanın doğrudan toprakları: **${direct}**`);
  }
  for(const lord of landholders){
    const lands=lord.holdings.map((holding)=>holding.name).join(", ")||"Toprak bağlanmadı";
    lines.push(`\n├─ 🌾 **${lord.titleName}** — ${lord.holderName}${lord.holderUserId?` • <@${lord.holderUserId}>`:""}`);
    lines.push(`│  Topraklar: **${lands}**`);
    lines.push(`│  Hana sadakat **${lord.loyalty}/100** • İlişki **${lord.relationScore>0?"+":""}${lord.relationScore}**`);
  }
  return new EmbedBuilder().setColor(0x9b6b30).setTitle(`🐎 ${view.countryName} • Bozkır Hiyerarşisi`)
    .setDescription(lines.join("\n")||"Henüz unvan kaydı bulunmuyor.")
    .addFields(
      {name:"👑 Han Otoritesi",value:`**${view.authority}/100**`,inline:true},
      {name:"🏹 Han",value:khan?"1":"0",inline:true},
      {name:"🌾 Toprak Ağası",value:String(landholders.length),inline:true}
    ).setFooter({text:`Tur ${view.currentTurn} • Bot karar vermez; siyasi sonuçları kaydeder.`});
}

function steppeRelationsEmbed(view:SteppePoliticsView):EmbedBuilder{
  const lines=view.titles.filter((title)=>title.tier==="LANDHOLDER").map((title)=>
    `🌾 **${title.titleName}** → ${title.liegeTitleName??"Han kaydı yok"}\n`+
    `↳ Sadakat **${title.loyalty}/100 • ${steppeLoyaltyLabel(title.loyalty)}** • Kişisel ilişki **${title.relationScore>0?"+":""}${title.relationScore}**`
  );
  const events=view.events.slice(0,8).map((event)=>
    `• Tur ${event.turn} • ${event.description}`+
    `${event.loyaltyDelta||event.relationDelta||event.authorityDelta?` (${delta(event.loyaltyDelta)} sadakat, ${delta(event.relationDelta)} ilişki, ${delta(event.authorityDelta)} otorite)`:""}`
  );
  return new EmbedBuilder().setColor(0x806040).setTitle(`🤝 ${view.countryName} • Bozkır İlişkileri`)
    .setDescription(lines.join("\n\n")||"İlişki kaydı bulunmuyor.")
    .addFields({name:"📜 Son Siyasi Kayıtlar",value:(events.join("\n")||"Henüz olay kaydı yok.").slice(0,1024)});
}

function steppeCallsEmbed(view:SteppePoliticsView):EmbedBuilder{
  const labels:Record<string,string>={PENDING:"Yanıt bekleniyor",FULL:"Tam Katılım",LIMITED:"Sınırlı Destek",NEUTRAL:"Tarafsız",REFUSE:"Reddetti",UNANSWERED:"Cevapsız"};
  const lines=view.warCalls.map((call)=>{
    const responses=call.responses.map((response)=>`↳ **${response.titleName}:** ${labels[response.response]??response.response}`).join("\n");
    return `⚔️ **${call.targetLabel}** • Tur ${call.openedTurn} • ${call.status==="OPEN"?"Açık":"Kapalı"}\n${call.reason}\n${responses||"Han yanıtı yok"}\nKimlik: \`${call.id}\``;
  });
  return new EmbedBuilder().setColor(0x8f3d2e).setTitle(`📯 ${view.countryName} • Savaş Çağrıları`)
    .setDescription((lines.join("\n\n")||"Henüz savaş çağrısı yayımlanmadı.").slice(0,4000));
}

function steppeWarCallEmbed(view:SteppePoliticsView,call:SteppeWarCallView,response:SteppeWarCallResponseView):EmbedBuilder{
  return new EmbedBuilder().setColor(0x9b2f2f).setTitle("📯 Hanın Savaş Çağrısı")
    .setDescription(`**${view.countryName} Hanı**, **${response.titleName}** Toprak Ağasını savaşa çağırıyor.`)
    .addFields(
      {name:"⚔️ Hedef / Cephe",value:call.targetLabel,inline:true},
      {name:"🌾 Çağrılan Toprak Ağası",value:`${response.titleName} • ${response.holderName}`,inline:true},
      {name:"📜 Gerekçe",value:call.reason},
      {name:"Karar",value:"Aşağıdaki seçeneklerden biriyle yanıt verin. Bot yalnızca sadakat, ilişki ve otorite sonucunu kaydeder; orduları otomatik hareket ettirmez."}
    ).setFooter({text:`Çağrı ${call.id}`});
}

function steppeWarCallButtons(callId:string,titleId:string):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`steppe_war_call|${callId}|${titleId}|FULL`).setLabel("Tam Katılım").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`steppe_war_call|${callId}|${titleId}|LIMITED`).setLabel("Sınırlı Destek").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`steppe_war_call|${callId}|${titleId}|NEUTRAL`).setLabel("Tarafsız Kal").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`steppe_war_call|${callId}|${titleId}|REFUSE`).setLabel("Reddet").setStyle(ButtonStyle.Danger)
  );
}

export function steppeTributeOfferEmbed(offer:SteppeTributeOfferView):EmbedBuilder{
  return new EmbedBuilder()
    .setColor(0x9b6b30)
    .setTitle("🐎 Bozkır Haraç Talebi")
    .setDescription(`**${offer.hegemon_country_name}**, **${offer.tributary_country_name}** devletinden hegemonluk haracını talep ediyor.`)
    .addFields(
      {name:"👑 Hegemon Devlet",value:offer.hegemon_country_name,inline:true},
      {name:"🏹 Teklif Edilen Devlet",value:offer.tributary_country_name,inline:true},
      {name:"📜 Verilecek Yanıt",value:"Aşağıdaki seçimden **Tam Ödeme**, **Yarım Ödeme** veya **Ödeme Yok** kararını seçip **Teklifi Cevapla** düğmesine basın."}
    )
    .setFooter({text:"Yalnızca teklif edilen devletin oyuncuları veya oyun yöneticisi yanıtlayabilir."});
}

export function steppeTributeComponents(offerId:string,selected?:SteppeTributeResponse):[
  ActionRowBuilder<StringSelectMenuBuilder>,ActionRowBuilder<ButtonBuilder>
]{
  const choices=(Object.entries(STEPPE_TRIBUTE_RESPONSES) as Array<[SteppeTributeResponse,(typeof STEPPE_TRIBUTE_RESPONSES)[SteppeTributeResponse]]>);
  const menu=new StringSelectMenuBuilder()
    .setCustomId(`steppe_tribute_choice|${offerId}`)
    .setPlaceholder("Haraç yanıtını seç")
    .addOptions(choices.map(([value,item])=>({
      label:item.label,value,default:selected===value,
      description:value==="FULL"?"Haraç talebini eksiksiz karşıla":value==="HALF"?"Haraç talebinin yarısını karşıla":"Haraç ödemeyi reddet"
    })));
  const submit=new ButtonBuilder()
    .setCustomId(`steppe_tribute_submit|${offerId}|${selected??"WAIT"}`)
    .setLabel("Teklifi Cevapla")
    .setEmoji("📨")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!selected);
  return[
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(submit)
  ];
}

async function requireDiplomacyChannel(interaction:ChatInputCommandInteraction):Promise<TextChannel>{
  if(!interaction.guildId)throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  const configured=await diplomacyService.channel(interaction.guildId);
  if(!configured)throw new GameError("Önce yönetici /diplomasi-kanali komutuyla diplomasi kanalını seçmelidir.");
  if(configured!==interaction.channelId)throw new GameError(`Bozkır teklifleri ve savaş çağrıları yalnızca <#${configured}> kanalında gönderilebilir.`);
  if(!interaction.channel||interaction.channel.type!==ChannelType.GuildText)throw new GameError("Diplomasi kanalına mesaj gönderilemiyor.");
  return interaction.channel;
}

async function assertTargetAccess(
  interaction:StringSelectMenuInteraction|ButtonInteraction,offer:SteppeTributeOfferView
):Promise<void>{
  if(isGameMaster(interaction))return;
  const country=await gameService.countryForUser(interaction.guildId!,interaction.user.id);
  if(!country||country.id!==offer.tributary_country_id){
    throw new GameError("Bu haraç teklifini yalnızca teklif edilen bozkır devletinin oyuncuları yanıtlayabilir.");
  }
}

export async function handleSteppeHegemonyCommand(interaction:ChatInputCommandInteraction):Promise<boolean>{
  if(!["bozkir","bozkir-yonetim"].includes(interaction.commandName))return false;
  if(!interaction.guildId)throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  const action=interaction.options.getSubcommand();
  if(interaction.commandName==="bozkir-yonetim"){
    requireGameMaster(interaction);
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const country=await gameService.countryByName(interaction.guildId,interaction.options.getString("ulke",true));
    if(!country)throw new GameError("Devlet bulunamadı.");
    let view:SteppePoliticsView;
    if(action==="kur")view=await steppePoliticsService.setup({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      holderName:interaction.options.getString("han",true),holderUserId:interaction.options.getUser("oyuncu")?.id??null,
      authority:interaction.options.getInteger("otorite")??70});
    else if(action==="unvan-ekle")view=await steppePoliticsService.addTitle({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      titleName:interaction.options.getString("unvan",true),
      holderName:interaction.options.getString("sahip",true),holderUserId:interaction.options.getUser("oyuncu")?.id??null,
      loyalty:interaction.options.getInteger("sadakat")??60,relationScore:interaction.options.getInteger("iliski")??0});
    else if(action==="toprak-bagla")view=await steppePoliticsService.assignHolding({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      title:interaction.options.getString("unvan",true),settlement:interaction.options.getString("yerleske",true)});
    else if(action==="deger-ayarla")view=await steppePoliticsService.setValues({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      title:interaction.options.getString("unvan"),authority:interaction.options.getInteger("otorite"),loyalty:interaction.options.getInteger("sadakat"),
      relationScore:interaction.options.getInteger("iliski"),reason:interaction.options.getString("gerekce",true)});
    else if(action==="cagri-kapat")view=await steppePoliticsService.closeWarCall({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      warCallId:interaction.options.getString("cagri",true)});
    else throw new GameError("Bu bozkır yönetim işlemi desteklenmiyor.");
    await interaction.editReply({content:"✅ Bozkır iç siyaseti güncellendi.",embeds:[steppeHierarchyEmbed(view)]});
    return true;
  }
  const country=await resolveCountry(interaction,interaction.options.getString("ulke"));
  if(action==="durum"||action==="hiyerarsi"||action==="iliskiler"||action==="cagrilar"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const view=await steppePoliticsService.view(interaction.guildId,country.id);
    if(!view)throw new GameError("Bu devlet için bozkır iç siyaseti henüz kurulmamış.");
    const embed=action==="iliskiler"?steppeRelationsEmbed(view):action==="cagrilar"?steppeCallsEmbed(view):steppeHierarchyEmbed(view);
    await interaction.editReply({embeds:[embed]});
    return true;
  }
  if(action==="savas-cagrisi"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const channel=await requireDiplomacyChannel(interaction);
    const call=await steppePoliticsService.openWarCall({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      targetLabel:interaction.options.getString("hedef",true),reason:interaction.options.getString("gerekce",true),gameMaster:isGameMaster(interaction)});
    const view=await steppePoliticsService.view(interaction.guildId,country.id);if(!view)throw new GameError("Bozkır iç siyaseti bulunamadı.");
    let published=0;
    for(const response of call.responses){
      const notification=playerMentionPayload(response.holderUserId?[response.holderUserId]:[],`**${response.titleName}** • Oyuncu atanmamış; oyun yöneticisi yanıtlayabilir.`);
      const message=await channel.send({content:notification.content,allowedMentions:notification.allowedMentions,
        embeds:[steppeWarCallEmbed(view,call,response)],components:[steppeWarCallButtons(call.id,response.titleId)]});
      await steppePoliticsService.attachWarCallMessage(call.id,response.titleId,channel.id,message.id);published++;
    }
    await interaction.editReply(`✅ **${country.name}** Hanı adına ${published} Toprak Ağasına savaş çağrısı gönderildi. Ordular otomatik hareket ettirilmedi.`);
    return true;
  }
  if(action!=="harac")throw new GameError("Bu bozkır işlemi desteklenmiyor.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const channel=await requireDiplomacyChannel(interaction);
  const offers=await steppeHegemonyService.offerTributes({
    guildId:interaction.guildId,actorId:interaction.user.id,hegemonCountryId:country.id
  });
  let published=0;
  const failed:string[]=[];
  for(const offer of offers){
    try{
      const players=await gameService.playerIds(offer.tributary_country_id);
      const notification=playerMentionPayload(players,`**${offer.tributary_country_name}** • Oyuncu atanmamış; oyun yöneticisi yanıtlayabilir.`);
      const message=await channel.send({
        content:notification.content,embeds:[steppeTributeOfferEmbed(offer)],
        components:steppeTributeComponents(offer.id),allowedMentions:notification.allowedMentions
      });
      await steppeHegemonyService.attachMessage(offer.id,channel.id,message.id);
      published++;
    }catch{
      failed.push(offer.tributary_country_name);
      await steppeHegemonyService.cancelOffer(interaction.guildId,offer.id).catch(()=>undefined);
    }
  }
  if(!published)throw new GameError("Haraç teklifleri oluşturuldu fakat Discord kanalına gönderilemedi; teklifler güvenle iptal edildi.");
  await interaction.editReply(
    `✅ **${country.name}** adına ${published} bozkır devletine ayrı haraç teklifi gönderildi.`+
    (failed.length?`\n⚠️ Gönderilemeyen ve iptal edilen teklifler: ${failed.join(", ")}. Komut yeniden kullanılabilir.`:"")
  );
  return true;
}

export async function handleSteppeHegemonySelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  const match=/^steppe_tribute_choice\|([0-9a-f-]+)$/i.exec(interaction.customId);
  if(!match)return false;
  if(!interaction.guildId)throw new GameError("Bu teklif yalnızca sunucu içinde yanıtlanabilir.");
  const offer=await steppeHegemonyService.getOffer(match[1]!);
  if(!offer||offer.guild_id!==interaction.guildId)throw new GameError("Bozkır haraç teklifi bulunamadı.");
  if(offer.response!=="PENDING")throw new GameError("Bu haraç teklifi daha önce sonuçlandırılmış.");
  await assertTargetAccess(interaction,offer);
  const selected=interaction.values[0] as SteppeTributeResponse;
  if(!STEPPE_TRIBUTE_RESPONSES[selected])throw new GameError("Geçersiz haraç yanıtı.");
  await interaction.update({components:steppeTributeComponents(offer.id,selected)});
  return true;
}

export async function handleSteppeHegemonyButton(interaction:ButtonInteraction):Promise<boolean>{
  const warCallMatch=/^steppe_war_call\|([0-9a-f-]+)\|([0-9a-f-]+)\|(FULL|LIMITED|NEUTRAL|REFUSE)$/i.exec(interaction.customId);
  if(warCallMatch){
    if(!interaction.guildId)throw new GameError("Bu çağrı yalnızca sunucu içinde yanıtlanabilir.");
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const response=await steppePoliticsService.response(warCallMatch[1]!,warCallMatch[2]!);
    if(!response)throw new GameError("Savaş çağrısı yanıt kaydı bulunamadı.");
    const choice=warCallMatch[3]!.toUpperCase() as SteppeWarCallResponse;
    if(!isGameMaster(interaction)&&response.holderUserId!==interaction.user.id)throw new GameError("Bu çağrıyı yalnızca ilgili Toprak Ağası veya oyun yöneticisi yanıtlayabilir.");
    const result=await steppePoliticsService.respondWarCall({guildId:interaction.guildId,actorId:interaction.user.id,
      warCallId:response.warCallId,titleId:response.titleId,response:choice,gameMaster:isGameMaster(interaction)});
    const effect=STEPPE_WAR_CALL_RESPONSES[choice];
    const embed=EmbedBuilder.from(interaction.message.embeds[0]!).setColor(effect.color).setTitle("📯 Savaş Çağrısı Yanıtlandı")
      .setFields(
        {name:"🌾 Toprak Ağası",value:`${response.titleName} • ${response.holderName}`,inline:true},
        {name:"📜 Karar",value:`**${effect.label}**`,inline:true},
        {name:"⚖️ Siyasi Sonuç",value:`Sadakat ${delta(effect.loyaltyDelta)} • İlişki ${delta(effect.relationDelta)} • Otorite ${delta(effect.authorityDelta)}`}
      ).setFooter({text:"Ordu hareketi veya savaş katılımı otomatik uygulanmadı."});
    await interaction.message.edit({content:`🌾 **${response.titleName}**, Hanın savaş çağrısına **${effect.label}** yanıtını verdi.`,embeds:[embed],components:[]});
    await interaction.editReply("✅ Yanıt kaydedildi; ordu hareketi yapılmadı.");
    void result;
    return true;
  }
  const match=/^steppe_tribute_submit\|([0-9a-f-]+)\|(FULL|HALF|NONE|WAIT)$/i.exec(interaction.customId);
  if(!match)return false;
  if(!interaction.guildId)throw new GameError("Bu teklif yalnızca sunucu içinde yanıtlanabilir.");
  const response=match[2]!.toUpperCase();
  if(response==="WAIT")throw new GameError("Önce haraç yanıtını seçmelisiniz.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const offer=await steppeHegemonyService.getOffer(match[1]!);
  if(!offer||offer.guild_id!==interaction.guildId)throw new GameError("Bozkır haraç teklifi bulunamadı.");
  await assertTargetAccess(interaction,offer);
  const choice=response as SteppeTributeResponse;
  const result=await steppeHegemonyService.respond({
    guildId:interaction.guildId,actorId:interaction.user.id,tributaryCountryId:offer.tributary_country_id,
    offerId:offer.id,response:choice
  });
  const label=STEPPE_TRIBUTE_RESPONSES[choice].label;
  const embed=EmbedBuilder.from(interaction.message.embeds[0]!)
    .setColor(RESPONSE_COLORS[choice])
    .setTitle("🐎 Bozkır Haraç Teklifi Sonuçlandı")
    .setDescription(`**${result.tributary_country_name}**, **${result.hegemon_country_name}** devletinin haraç talebine yanıt verdi.`)
    .setFields(
      {name:"👑 Hegemon Devlet",value:result.hegemon_country_name,inline:true},
      {name:"🏹 Yanıtlayan Devlet",value:result.tributary_country_name,inline:true},
      {name:"📜 Karar",value:`**${label}**`}
    )
    .setFooter({text:`${interaction.user.username} tarafından sonuçlandırıldı.`});
  await interaction.message.edit({
    content:`🐎 **${result.tributary_country_name}**, haraç talebine **${label}** yanıtını verdi.`,
    embeds:[embed],components:[],allowedMentions:{parse:[]}
  });
  await interaction.editReply("✅ Haraç teklifi sonuçlandırıldı.");
  return true;
}
