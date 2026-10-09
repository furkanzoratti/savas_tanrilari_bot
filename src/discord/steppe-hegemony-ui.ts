import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,MessageFlags,StringSelectMenuBuilder,
  type ButtonInteraction,type ChatInputCommandInteraction,type StringSelectMenuInteraction,type TextChannel
} from "discord.js";
import { STEPPE_TRIBUTE_RESPONSES,type SteppeTributeResponse } from "../domain/steppe-hegemony.js";
import { diplomacyService } from "../services/diplomacy-service.js";
import { gameService,GameError } from "../services/game-service.js";
import { steppeHegemonyService,type SteppeTributeOfferView } from "../services/steppe-hegemony-service.js";
import { isGameMaster,resolveCountry } from "./auth.js";
import { playerMentionPayload } from "./player-mentions.js";

const RESPONSE_COLORS:Record<SteppeTributeResponse,number>={FULL:0x2e8b57,HALF:0xd4a72c,NONE:0xb22222};

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
  if(configured!==interaction.channelId)throw new GameError(`Bozkır haraç teklifleri yalnızca <#${configured}> kanalında gönderilebilir.`);
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
  if(interaction.commandName!=="bozkir")return false;
  if(!interaction.guildId)throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  const action=interaction.options.getSubcommand();
  if(action!=="harac")throw new GameError("Bu bozkır işlemi desteklenmiyor.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const channel=await requireDiplomacyChannel(interaction);
  const country=await resolveCountry(interaction,interaction.options.getString("ulke"));
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
