import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,MessageFlags,StringSelectMenuBuilder,
  type AutocompleteInteraction,type ButtonInteraction,type ChatInputCommandInteraction,type StringSelectMenuInteraction,type TextChannel
} from "discord.js";
import { STEPPE_TRIBUTE_RESPONSES,type SteppeTributeResponse } from "../domain/steppe-hegemony.js";
import {STEPPE_CONFLICT_LABELS,STEPPE_WAR_CALL_RESPONSES,type SteppeWarCallResponse} from "../domain/steppe-politics.js";
import { diplomacyService } from "../services/diplomacy-service.js";
import { gameService,GameError } from "../services/game-service.js";
import {
  steppeHegemonyService,type SteppeGreatKhanateView,type SteppeGreatKhanateWarCallResponseView,
  type SteppeGreatKhanateWarCallView,type SteppeTributeOfferView
} from "../services/steppe-hegemony-service.js";
import {steppePoliticsService,type SteppePoliticsView,type SteppeWarCallResponseView,type SteppeWarCallView} from "../services/steppe-politics-service.js";
import {steppeKurultayService,type SteppeKurultayView} from "../services/steppe-kurultay-service.js";
import { isGameMaster,requireGameMaster,resolveCountry } from "./auth.js";
import { playerMentionPayload } from "./player-mentions.js";

const RESPONSE_COLORS:Record<SteppeTributeResponse,number>={FULL:0x2e8b57,HALF:0xd4a72c,NONE:0xb22222};

function delta(value:number):string{return value>0?`+${value}`:String(value);}

export function steppeKurultayEmbed(view:SteppeKurultayView):EmbedBuilder{
  const castPoints=view.voters.filter((voter)=>voter.candidateTitleId).reduce((sum,voter)=>sum+voter.weight,0);
  const totalPoints=view.voters.reduce((sum,voter)=>sum+voter.weight,0);
  const candidateLines=view.candidates.map((candidate,index)=>
    `${index+1}. 👑 **${candidate.holderName}** — ${candidate.titleName}\n`+
    `↳ ${candidate.countryName} • **${candidate.points} puan** • ${candidate.ballotCount} seçmen oyu`
  );
  const status=view.status==="OPEN"?"Oy kullanımı açık":view.status==="COMPLETED"?"Sonuçlandı":"İptal edildi";
  return new EmbedBuilder().setColor(view.status==="OPEN"?0xd4a72c:0x3f7f5f)
    .setTitle(`🏕️ ${view.sequence}. Büyük Bozkır Kurultayı`)
    .setDescription([
      `**Durum:** ${status}`,
      `**Mevcut Hanlar Hanı Devleti:** ${view.incumbentCountryName}`,
      `**Açılış Turu:** ${view.startedTurn}`,
      view.winnerTitleName?`**Seçilen Hanlar Hanı:** ${view.winnerTitleName}`:"",
      "",
      "### Han Adayları",
      candidateLines.join("\n\n")||"Etkin Han adayı bulunmuyor.",
      "",
      `**Katılım:** ${view.voters.filter((voter)=>voter.candidateTitleId).length}/${view.voters.length} seçmen • ${castPoints}/${totalPoints} oy puanı`,
      "**Oy Ağırlığı:** Han 2 puan • Vassal devlet 1 puan • Yalnız Hanlar aday olabilir"
    ].filter(Boolean).join("\n").slice(0,4000))
    .setFooter({text:view.status==="OPEN"?"Aşağıdaki menüden bir Han seçin. Her Han ve vassal devlet yalnız bir kez oy kullanabilir.":`Sonraki Kurultay: Tur ${view.nextKurultayTurn}`});
}

export function steppeKurultayComponents(view:SteppeKurultayView):ActionRowBuilder<StringSelectMenuBuilder>[] {
  if(view.status!=="OPEN"||!view.candidates.length)return[];
  return[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`steppe_kurultay_vote|${view.id}`)
      .setPlaceholder("Hanlar Hanı adayını seç ve oyunu kullan")
      .addOptions(view.candidates.slice(0,25).map((candidate)=>({
        label:candidate.holderName.slice(0,100),
        description:`${candidate.titleName} • ${candidate.countryName}`.slice(0,100),
        value:candidate.titleId
      })))
  )];
}

export function greatKhanateEmbed(view:SteppeGreatKhanateView):EmbedBuilder{
  const members=view.members.map((member)=>
    `🏹 **${member.khanTitleName??`${member.countryName} Hanı`}** — ${member.khanHolderName??"Henüz Atanmadı"}`+
    `${member.khanHolderUserId?` • <@${member.khanHolderUserId}>`:""}\n`+
    `↳ **${member.countryName}** • Hanlar Hanının savaş çağrısı ve haraç düzenine bağlı`
  );
  return new EmbedBuilder().setColor(0xc6923b).setTitle(`👑 ${view.hegemonCountryName} • Hanlar Hanlığı`)
    .setDescription([
      `**Hanlar Hanı:** ${view.greatKhanHolderName??"Henüz Atanmadı"}${view.greatKhanHolderUserId?` • <@${view.greatKhanHolderUserId}>`:""}`,
      `**Üst Otorite:** ${view.authority}/100`,"",members.join("\n\n")||"Bağlı Han bulunmuyor."
    ].join("\n"))
    .setFooter({text:`Tur ${view.currentTurn} • Haraç ve üst savaş çağrıları bu katmanda yürütülür.`});
}

export function greatKhanateCallsEmbed(view:SteppeGreatKhanateView):EmbedBuilder{
  const labels:Record<string,string>={PENDING:"Yanıt bekleniyor",FULL:"Tam Katılım",LIMITED:"Sınırlı Destek",NEUTRAL:"Tarafsız",REFUSE:"Reddetti",UNANSWERED:"Cevapsız"};
  const lines=view.warCalls.map((call)=>{
    const responses=call.responses.map((response)=>`↳ **${response.khanTitleName??`${response.countryName} Hanı`}:** ${labels[response.response]??response.response}`).join("\n");
    return `⚔️ **${call.targetLabel}** • Tur ${call.openedTurn} • ${call.status==="OPEN"?"Açık":"Kapalı"}\n${call.reason}\n${responses||"Bağlı Han yanıtı yok"}\nKimlik: \`${call.id}\``;
  });
  return new EmbedBuilder().setColor(0x9b2f2f).setTitle("📯 Hanlar Hanı • Üst Savaş Çağrıları")
    .setDescription((lines.join("\n\n")||"Henüz üst savaş çağrısı yayımlanmadı.").slice(0,4000));
}

function greatKhanateWarCallEmbed(view:SteppeGreatKhanateView,call:SteppeGreatKhanateWarCallView,response:SteppeGreatKhanateWarCallResponseView):EmbedBuilder{
  return new EmbedBuilder().setColor(0xb66a2b).setTitle("📯 Hanlar Hanının Savaş Çağrısı")
    .setDescription(`**${view.hegemonCountryName} Hanlar Hanı**, **${response.khanTitleName??`${response.countryName} Hanı`}** makamını savaşa çağırıyor.`)
    .addFields(
      {name:"⚔️ Hedef / Cephe",value:call.targetLabel,inline:true},
      {name:"🏹 Çağrılan Han",value:`${response.countryName} • ${response.khanHolderName??"Henüz Atanmadı"}`,inline:true},
      {name:"📜 Gerekçe",value:call.reason},
      {name:"Karar",value:"Tam katılım, sınırlı destek, tarafsızlık veya ret seçeneklerinden biriyle yanıt verin. Eksik, olumsuz veya cevapsız yanıt Hanlar Hanı otoritesini düşürür; ordular otomatik hareket etmez."}
    ).setFooter({text:`Üst çağrı ${call.id}`});
}

function greatKhanateWarCallButtons(callId:string,countryId:string):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`steppe_overlord_war_call|${callId}|${countryId}|FULL`).setLabel("Tam Katılım").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`steppe_overlord_war_call|${callId}|${countryId}|LIMITED`).setLabel("Sınırlı Destek").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`steppe_overlord_war_call|${callId}|${countryId}|NEUTRAL`).setLabel("Tarafsız Kal").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`steppe_overlord_war_call|${callId}|${countryId}|REFUSE`).setLabel("Reddet").setStyle(ButtonStyle.Danger)
  );
}

function steppeHierarchyEmbed(view:SteppePoliticsView):EmbedBuilder{
  const khan=view.titles.find((title)=>title.tier==="KHAN");
  const lines:string[]=[];
  if(khan){
    const direct=khan.holdings.map((holding)=>holding.name).join(", ")||"Doğrudan toprak bağlanmadı";
    lines.push(`👑 **${khan.titleName}** — ${khan.holderName}${khan.holderUserId?` • <@${khan.holderUserId}>`:""}`);
    lines.push(`↳ Devletin doğrudan yerleşkeleri: **${direct}**`);
  }
  return new EmbedBuilder().setColor(0x9b6b30).setTitle(`🐎 ${view.countryName} • Han Makamı`)
    .setDescription(lines.join("\n")||"Etkin Han kaydı bulunmuyor.")
    .addFields(
      {name:"🏹 Siyasi Kademe",value:"**Han**",inline:true},
      {name:"🏕️ Kurultay Oyu",value:"**2 puan**",inline:true},
      {name:"⚔️ Ordu Doktrini",value:"**Bozkır**",inline:true}
    ).setFooter({text:`Tur ${view.currentTurn} • Normal vassallar ayrı devlet kayıtlarıyla yönetilir.`});
}

function steppeConflictsEmbed(view:SteppePoliticsView):EmbedBuilder{
  const battleStatuses:Record<string,string>={DRAFT:"Taslak",ACTIVE:"Sürüyor",FINISHED:"Bitti",CANCELLED:"İptal"};
  const rows=view.conflicts.map((conflict)=>
    `${conflict.status==="ACTIVE"?"🔥":"⚔️"} **${STEPPE_CONFLICT_LABELS[conflict.type]}** • Tur ${conflict.openedTurn} • ${conflict.status==="ACTIVE"?"Aktif":conflict.status==="RESOLVED"?"Sonuçlandı":"İptal"}\n`+
    `**${conflict.attackerTitleName}** → **${conflict.defenderTitleName}**${conflict.objectiveSettlementName?` • Hedef: **${conflict.objectiveSettlementName}**`:""}\n`+
    `${conflict.reason}${conflict.battleId?`\nSavaş dosyası: \`${conflict.battleId}\` • **${battleStatuses[conflict.battleStatus??""]??conflict.battleStatus??"Durum bilinmiyor"}**`:""}`+
    `${conflict.winnerTitleName?`\nKazanan: **${conflict.winnerTitleName}**${conflict.resolutionReason?` • ${conflict.resolutionReason}`:""}`:""}\nKimlik: \`${conflict.id}\``
  );
  return new EmbedBuilder().setColor(0x9b2f2f).setTitle(`⚔️ ${view.countryName} • Bozkır İç Savaşları`)
    .setDescription((rows.join("\n\n")||"Henüz bozkır iç savaşı kaydı bulunmuyor.").slice(0,4000))
    .setFooter({text:"İlan edilen taraflar /savas baslat seçimlerinde görünür. İç savaş ilanı ve sonucu otoriteyi değiştirmez."});
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
      {name:"Karar",value:"Aşağıdaki seçeneklerden biriyle yanıt verin. Eksik, olumsuz veya cevapsız yanıt Han otoritesini düşürür; orduları otomatik hareket ettirmez."}
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
    .setDescription(`**${offer.hegemon_country_name}**, **${offer.tributary_country_name}** devletinden bozkır haracı talep ediyor.`)
    .addFields(
      {name:"👑 Haraç Talep Eden",value:offer.hegemon_country_name,inline:true},
      {name:"🏹 Yanıtlayacak Devlet",value:offer.tributary_country_name,inline:true},
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

async function resolveSteppeCountry(interaction:ChatInputCommandInteraction,requested?:string|null){
  if(!interaction.guildId)throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  if(requested&&isGameMaster(interaction))return resolveCountry(interaction,requested);
  const country=await gameService.countryForUser(interaction.guildId,interaction.user.id)
    ??await steppePoliticsService.countryForTitleHolder(interaction.guildId,interaction.user.id);
  if(!country)throw new GameError("Discord hesabına atanmış bir bozkır devleti veya unvanı bulunamadı.");
  return country;
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

export async function handleSteppeHegemonyAutocomplete(interaction:AutocompleteInteraction):Promise<boolean>{
  if(!["bozkir","bozkir-yonetim"].includes(interaction.commandName))return false;
  if(!interaction.guildId){await interaction.respond([]);return true;}
  const focused=interaction.options.getFocused(true);
  const query=String(focused.value).toLocaleLowerCase("tr-TR").trim();
  const gameMaster=isGameMaster(interaction);
  const hegemony=await steppeHegemonyService.view(interaction.guildId);
  if(focused.name==="ulke"){
    if(!gameMaster){
      const own=await gameService.countryForUser(interaction.guildId,interaction.user.id)
        ??await steppePoliticsService.countryForTitleHolder(interaction.guildId,interaction.user.id);
      const allowed=own&&(!query||own.name.toLocaleLowerCase("tr-TR").includes(query))?[own]:[];
      await interaction.respond(allowed.map((country)=>({name:country.name.slice(0,100),value:country.name})));
      return true;
    }
    let countries=hegemony
      ?[{id:hegemony.hegemonCountryId,name:hegemony.hegemonCountryName},...hegemony.members.map((member)=>({id:member.countryId,name:member.countryName}))]
      :[];
    if(!countries.length)countries=(await gameService.listCountries(interaction.guildId))
      .filter((country)=>country.name.toLocaleLowerCase("tr-TR").includes("konfederasyon"));
    await interaction.respond(countries.filter((country)=>!query||country.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((country)=>({name:country.name.slice(0,100),value:country.name})));
    return true;
  }
  if(["saldiran","savunan","kazanan"].includes(focused.name)){
    const titles=await steppePoliticsService.titleChoices(interaction.guildId);
    const visible=focused.name==="saldiran"&&!gameMaster?titles.filter((title)=>title.holder_user_id===interaction.user.id):titles;
    await interaction.respond(visible.filter((title)=>!query||
      `${title.title_name} ${title.holder_name} ${title.country_name}`.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((title)=>({name:`${title.title_name} • ${title.holder_name} / ${title.country_name}`.slice(0,100),value:title.id})));
    return true;
  }
  if(focused.name==="kurultay"){
    const kurultay=await steppeKurultayService.view(interaction.guildId);
    const choices=kurultay?.status==="OPEN"&&(!query||`${kurultay.sequence} kurultay`.includes(query))
      ?[{name:`${kurultay.sequence}. Büyük Bozkır Kurultayı • Tur ${kurultay.startedTurn}`.slice(0,100),value:kurultay.id}]:[];
    await interaction.respond(choices);
    return true;
  }
  if(focused.name==="ordu"){
    const title=interaction.options.getString("unvan");
    const armies=title?await steppePoliticsService.armyChoices(interaction.guildId,title):[];
    await interaction.respond(armies.filter((army)=>!query||army.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25)
      .map((army)=>({name:`${army.name} • ${Number(army.total).toLocaleString("tr-TR")}${army.steppe_title_id?" • bağlı":""}`.slice(0,100),value:army.id})));
    return true;
  }
  if(focused.name==="hedef-yerleske"){
    const defender=interaction.options.getString("savunan");
    const titles=await steppePoliticsService.titleChoices(interaction.guildId);
    const selectedTitle=titles.find((title)=>title.id===defender);
    const selectedView=selectedTitle?await steppePoliticsService.view(interaction.guildId,selectedTitle.country_id):null;
    const holdings=selectedView?.titles.find((title)=>title.id===defender)?.holdings??[];
    await interaction.respond(holdings.filter((holding)=>!query||holding.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((holding)=>({name:holding.name.slice(0,100),value:holding.id})));
    return true;
  }
  const selected=interaction.options.getString("ulke");
  const country=selected
    ?await gameService.countryByName(interaction.guildId,selected)
    :gameMaster&&hegemony?await gameService.countryByName(interaction.guildId,hegemony.hegemonCountryName)
      :await gameService.countryForUser(interaction.guildId,interaction.user.id)
        ??await steppePoliticsService.countryForTitleHolder(interaction.guildId,interaction.user.id);
  if(!country){await interaction.respond([]);return true;}
  const view=await steppePoliticsService.view(interaction.guildId,country.id);
  if(focused.name==="unvan"){
    const action=interaction.options.getSubcommand(false);
    const all=action==="ordu-bagla"?await steppePoliticsService.titleChoices(interaction.guildId):null;
    const titles=all?all.filter((title)=>gameMaster||title.holder_user_id===interaction.user.id):(view?.titles??[]);
    await interaction.respond(titles.filter((title)=>!query||
      `${"titleName" in title?title.titleName:title.title_name} ${"holderName" in title?title.holderName:title.holder_name}`.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((title)=>({name:`${"titleName" in title?title.titleName:title.title_name} • ${"holderName" in title?title.holderName:title.holder_name}`.slice(0,100),value:title.id})));
    return true;
  }
  if(focused.name==="yerleske"){
    const settlements=await gameService.listSettlements(country.id);
    await interaction.respond(settlements.filter((settlement)=>!query||settlement.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((settlement)=>({name:settlement.name.slice(0,100),value:settlement.id})));
    return true;
  }
  if(focused.name==="cagri"){
    const action=interaction.options.getSubcommand(false);
    const calls=action==="ust-cagri-kapat"?(hegemony?.warCalls??[]):(view?.warCalls??[]);
    await interaction.respond(calls.filter((call)=>call.status==="OPEN"&&
      (!query||`${call.targetLabel} ${call.reason}`.toLocaleLowerCase("tr-TR").includes(query)))
      .slice(0,25).map((call)=>({name:`${call.targetLabel} • Tur ${call.openedTurn}`.slice(0,100),value:call.id})));
    return true;
  }
  if(focused.name==="ic-savas"){
    const conflicts=(view?.conflicts??[]).filter((conflict)=>conflict.status==="ACTIVE");
    await interaction.respond(conflicts.filter((conflict)=>!query||`${conflict.attackerTitleName} ${conflict.defenderTitleName}`.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((conflict)=>({name:`${conflict.attackerTitleName} → ${conflict.defenderTitleName}`.slice(0,100),value:conflict.id})));
    return true;
  }
  await interaction.respond([]);
  return true;
}

export async function handleSteppeHegemonyCommand(interaction:ChatInputCommandInteraction):Promise<boolean>{
  if(!["bozkir","bozkir-yonetim"].includes(interaction.commandName))return false;
  if(!interaction.guildId)throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  const action=interaction.options.getSubcommand();
  const allowedActions=interaction.commandName==="bozkir"
    ?new Set(["harac","kurultay"])
    :new Set(["kurultay-baslat","kurultay-bitir"]);
  if(!allowedActions.has(action))throw new GameError("Bu eski bozkır işlemi kaldırıldı. Bozkır devletleri artık normal devlet komutlarını kullanır.");
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
    });
    else if(action==="toprak-bagla")view=await steppePoliticsService.assignHolding({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      title:interaction.options.getString("unvan",true),settlement:interaction.options.getString("yerleske",true)});
    else if(action==="deger-ayarla")view=await steppePoliticsService.setAuthority({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      authority:interaction.options.getInteger("otorite",true),reason:interaction.options.getString("gerekce",true)});
    else if(action==="ust-otorite-ayarla"){
      const greatKhanate=await steppeHegemonyService.setAuthority({guildId:interaction.guildId,actorId:interaction.user.id,
        hegemonCountryId:country.id,authority:interaction.options.getInteger("otorite",true),reason:interaction.options.getString("gerekce",true)});
      await interaction.editReply({content:"✅ Hanlar Hanı otoritesi yönetici kararıyla güncellendi.",embeds:[greatKhanateEmbed(greatKhanate)]});
      return true;
    }
    else if(action==="kurultay-baslat"){
      const channel=await requireDiplomacyChannel(interaction);
      const kurultay=await steppeKurultayService.start({guildId:interaction.guildId,actorId:interaction.user.id,hegemonCountryId:country.id});
      const notification=playerMentionPayload(kurultay.voters.map((voter)=>voter.holderUserId).filter((id):id is string=>Boolean(id)),
        "Han ve vassal seçmenlerine oyuncu atanmamış; NPC oyları yönetim panelinden kullanılabilir.");
      const message=await channel.send({content:notification.content,allowedMentions:notification.allowedMentions,
        embeds:[steppeKurultayEmbed(kurultay)],components:steppeKurultayComponents(kurultay)});
      await steppeKurultayService.attachMessage(kurultay.id,channel.id,message.id);
      await interaction.editReply(`✅ **${kurultay.sequence}. Büyük Bozkır Kurultayı** açıldı. Oyuncu oy formu <#${channel.id}> kanalına gönderildi.`);
      return true;
    }
    else if(action==="kurultay-bitir"){
      const openKurultay=await steppeKurultayService.view(interaction.guildId);
      if(!openKurultay||openKurultay.status!=="OPEN")throw new GameError("Sonuçlandırılabilecek açık Kurultay bulunmuyor.");
      if(openKurultay.incumbentCountryId!==country.id)throw new GameError("Seçilen devlet mevcut Hanlar Hanı devleti değil.");
      const result=await steppeKurultayService.complete({guildId:interaction.guildId,actorId:interaction.user.id,
        electionId:interaction.options.getString("kurultay",true)});
      if(result.view.channelId&&result.view.messageId){
        const channel=await interaction.client.channels.fetch(result.view.channelId).catch(()=>null);
        if(channel?.isTextBased()&&!channel.isDMBased()&&"messages" in channel){
          const message=await channel.messages.fetch(result.view.messageId).catch(()=>null);
          await message?.edit({embeds:[steppeKurultayEmbed(result.view)],components:[]}).catch(()=>undefined);
        }
      }
      await interaction.editReply({content:`✅ **${result.winnerTitleName}**, **${result.points} oy puanıyla** Hanlar Hanı seçildi. Hanlar Hanlığı artık **${result.winnerCountryName}** tarafından yönetiliyor. Sonraki Kurultay: **Tur ${result.nextKurultayTurn}**.`,
        embeds:[steppeKurultayEmbed(result.view)]});
      return true;
    }
    else if(action==="cagri-kapat")view=await steppePoliticsService.closeWarCall({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      warCallId:interaction.options.getString("cagri",true)});
    else if(action==="ust-cagri-kapat"){
      const greatKhanate=await steppeHegemonyService.view(interaction.guildId);
      if(!greatKhanate||greatKhanate.hegemonCountryId!==country.id)throw new GameError("Seçilen devlet mevcut Hanlar Hanı devleti değil.");
      await steppeHegemonyService.closeWarCall({guildId:interaction.guildId,actorId:interaction.user.id,
        warCallId:interaction.options.getString("cagri",true)});
      await interaction.editReply({content:"✅ Hanlar Hanının üst savaş çağrısı sonuçlandırıldı.",embeds:[greatKhanateCallsEmbed((await steppeHegemonyService.view(interaction.guildId))!)]});
      return true;
    }
    else if(action==="ic-savas-sonuclandir"){
      const result=await steppePoliticsService.resolveConflict({guildId:interaction.guildId,actorId:interaction.user.id,
        conflictId:interaction.options.getString("ic-savas",true),winnerTitle:interaction.options.getString("kazanan",true),
        reason:interaction.options.getString("gerekce",true)});
      await interaction.editReply(`✅ İç savaş **${result.winnerTitleName}** zaferiyle Tur **${result.turn}** tarihinde sonuçlandırıldı. Varsa hedef yerleşke kazanana bağlandı.`);
      return true;
    }
    else throw new GameError("Bu bozkır yönetim işlemi desteklenmiyor.");
    await interaction.editReply({content:"✅ Bozkır iç siyaseti güncellendi.",embeds:[steppeHierarchyEmbed(view)]});
    return true;
  }
  const country=await resolveSteppeCountry(interaction,interaction.options.getString("ulke"));
  if(action==="kurultay"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const kurultay=await steppeKurultayService.view(interaction.guildId);
    if(!kurultay)throw new GameError("Henüz Hanlar Hanı Kurultayı kaydı bulunmuyor.");
    await interaction.editReply({embeds:[steppeKurultayEmbed(kurultay)],components:steppeKurultayComponents(kurultay)});
    return true;
  }
  if(action==="hanlar-hanligi"||action==="hanlar-hani-cagrilari"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const view=await steppeHegemonyService.view(interaction.guildId);
    if(!view)throw new GameError("Hanlar Hanlığı henüz kurulmamış.");
    if(country.id!==view.hegemonCountryId&&!view.members.some((member)=>member.countryId===country.id))
      throw new GameError("Seçilen devlet Hanlar Hanlığı yapısında bulunmuyor.");
    await interaction.editReply({embeds:[action==="hanlar-hani-cagrilari"?greatKhanateCallsEmbed(view):greatKhanateEmbed(view)]});
    return true;
  }
  if(action==="durum"||action==="hiyerarsi"||action==="cagrilar"||action==="ic-savaslar"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const view=await steppePoliticsService.view(interaction.guildId,country.id);
    if(!view)throw new GameError("Bu devlet için bozkır iç siyaseti henüz kurulmamış.");
    const embed=action==="cagrilar"?steppeCallsEmbed(view):action==="ic-savaslar"?steppeConflictsEmbed(view):steppeHierarchyEmbed(view);
    await interaction.editReply({embeds:[embed]});
    return true;
  }
  if(action==="ordu-bagla"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const result=await steppePoliticsService.assignArmy({guildId:interaction.guildId,actorId:interaction.user.id,
      title:interaction.options.getString("unvan",true),army:interaction.options.getString("ordu",true),gameMaster:isGameMaster(interaction)});
    await interaction.editReply(`✅ **${result.armyName}**, **${result.titleName}** kuvveti olarak kaydedildi. Artık etkin iç savaşlarda bu unvanın savaş kadrosuna eklenebilir.`);
    return true;
  }
  if(action==="ic-savas-ac"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const result=await steppePoliticsService.openConflict({guildId:interaction.guildId,actorId:interaction.user.id,
      attackerTitle:interaction.options.getString("saldiran",true),defenderTitle:interaction.options.getString("savunan",true),
      objectiveSettlement:interaction.options.getString("hedef-yerleske"),reason:interaction.options.getString("gerekce",true),
      gameMaster:isGameMaster(interaction)});
    await interaction.editReply(`⚔️ **${result.label}** başladı: **${result.attackerTitleName} → ${result.defenderTitleName}**.${result.objectiveSettlementName?` Hedef: **${result.objectiveSettlementName}**.`:""}\n\nTaraflar artık \`/savas baslat\` komutunda seçilebilir. Önce kullanılacak orduları \`/bozkir ordu-bagla\` ile unvanlara bağlayın.`);
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
  if(action==="hanlar-hani-cagrisi"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const channel=await requireDiplomacyChannel(interaction);
    const call=await steppeHegemonyService.openWarCall({guildId:interaction.guildId,actorId:interaction.user.id,
      hegemonCountryId:country.id,targetLabel:interaction.options.getString("hedef",true),
      reason:interaction.options.getString("gerekce",true),gameMaster:isGameMaster(interaction)});
    const view=await steppeHegemonyService.view(interaction.guildId);if(!view)throw new GameError("Hanlar Hanlığı bulunamadı.");
    let published=0;
    for(const response of call.responses){
      const players=response.khanHolderUserId?[response.khanHolderUserId]:await gameService.playerIds(response.countryId);
      const notification=playerMentionPayload(players,`**${response.countryName} Hanı** • Oyuncu atanmamış; oyun yöneticisi yanıtlayabilir.`);
      const message=await channel.send({content:notification.content,allowedMentions:notification.allowedMentions,
        embeds:[greatKhanateWarCallEmbed(view,call,response)],components:[greatKhanateWarCallButtons(call.id,response.countryId)]});
      await steppeHegemonyService.attachWarCallMessage(call.id,response.countryId,channel.id,message.id);published++;
    }
    await interaction.editReply(`✅ **${view.hegemonCountryName} Hanlar Hanı** adına ${published} bağlı Hana üst savaş çağrısı gönderildi. Ordular otomatik hareket ettirilmedi.`);
    return true;
  }
  if(action!=="harac")throw new GameError("Bu bozkır işlemi desteklenmiyor.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const channel=await requireDiplomacyChannel(interaction);
  const offers=await steppeHegemonyService.offerTributes({
    guildId:interaction.guildId,actorId:interaction.user.id,requesterCountryId:country.id
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
    `✅ **${country.name}** adına ${published} hedef devlete ayrı haraç teklifi gönderildi.`+
    (failed.length?`\n⚠️ Gönderilemeyen ve iptal edilen teklifler: ${failed.join(", ")}. Komut yeniden kullanılabilir.`:"")
  );
  return true;
}

export async function handleSteppeHegemonySelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  const kurultayMatch=/^steppe_kurultay_vote\|([0-9a-f-]+)$/i.exec(interaction.customId);
  if(kurultayMatch){
    if(!interaction.guildId)throw new GameError("Kurultay oyu yalnızca sunucu içinde kullanılabilir.");
    const candidateTitleId=interaction.values[0];
    if(!candidateTitleId)throw new GameError("Bir Han adayı seçmelisiniz.");
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const result=await steppeKurultayService.votePlayer({guildId:interaction.guildId,actorId:interaction.user.id,
      electionId:kurultayMatch[1]!,candidateTitleId});
    const candidate=result.view.candidates.find((item)=>item.titleId===candidateTitleId);
    await interaction.message.edit({embeds:[steppeKurultayEmbed(result.view)],components:steppeKurultayComponents(result.view)}).catch(()=>undefined);
    await interaction.editReply(`✅ **${result.voterName}** adına **${candidate?.holderName??"seçilen Han"}** için **${result.weight} puanlık** Kurultay oyun kaydedildi. Oy değiştirilemez.`);
    return true;
  }
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
  if(interaction.customId.startsWith("steppe_overlord_war_call|")||interaction.customId.startsWith("steppe_war_call|")){
    throw new GameError("Bozkır savaş çağrısı sistemi kaldırıldı. Savaş işlemlerinde normal devlet komutlarını kullanın.");
  }
  const overlordWarCallMatch=/^steppe_overlord_war_call\|([0-9a-f-]+)\|([0-9a-f-]+)\|(FULL|LIMITED|NEUTRAL|REFUSE)$/i.exec(interaction.customId);
  if(overlordWarCallMatch){
    if(!interaction.guildId)throw new GameError("Bu çağrı yalnızca sunucu içinde yanıtlanabilir.");
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const response=await steppeHegemonyService.warCallResponse(overlordWarCallMatch[1]!,overlordWarCallMatch[2]!);
    if(!response)throw new GameError("Hanlar Hanı savaş çağrısı yanıt kaydı bulunamadı.");
    const choice=overlordWarCallMatch[3]!.toUpperCase() as SteppeWarCallResponse;
    const result=await steppeHegemonyService.respondWarCall({guildId:interaction.guildId,actorId:interaction.user.id,
      warCallId:response.warCallId,countryId:response.countryId,response:choice,gameMaster:isGameMaster(interaction)});
    const effect=STEPPE_WAR_CALL_RESPONSES[choice];
    const embed=EmbedBuilder.from(interaction.message.embeds[0]!).setColor(effect.color).setTitle("📯 Hanlar Hanı Çağrısı Yanıtlandı")
      .setFields(
        {name:"🏹 Bağlı Han",value:`${response.khanTitleName??`${response.countryName} Hanı`} • ${response.khanHolderName??response.countryName}`,inline:true},
        {name:"📜 Karar",value:`**${effect.label}**`,inline:true},
        {name:"⚖️ Üst Otorite Sonucu",value:`Hanlar Hanı otoritesi ${delta(effect.authorityDelta)}`}
      ).setFooter({text:"Ordu hareketi veya savaş katılımı otomatik uygulanmadı."});
    await interaction.message.edit({content:`🏹 **${response.countryName} Hanı**, Hanlar Hanının savaş çağrısına **${effect.label}** yanıtını verdi.`,embeds:[embed],components:[]});
    await interaction.editReply(`✅ ${result.countryName} Hanının yanıtı kaydedildi; ordu hareketi yapılmadı.`);
    return true;
  }
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
        {name:"⚖️ Otorite Sonucu",value:`Han otoritesi ${delta(effect.authorityDelta)}`}
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
      {name:"👑 Haraç Talep Eden",value:result.hegemon_country_name,inline:true},
      {name:"🏹 Yanıtlayan Devlet",value:result.tributary_country_name,inline:true},
      {name:"📜 Karar",value:`**${label}**`,inline:true}
    )
    .setFooter({text:`${interaction.user.username} tarafından sonuçlandırıldı.`});
  await interaction.message.edit({
    content:`🐎 **${result.tributary_country_name}**, haraç talebine **${label}** yanıtını verdi.`,
    embeds:[embed],components:[],allowedMentions:{parse:[]}
  });
  await interaction.editReply("✅ Haraç teklifi sonuçlandırıldı.");
  return true;
}
