import {ChannelType,EmbedBuilder,MessageFlags,type ChatInputCommandInteraction,type Client} from "discord.js";
import {logger} from "../logger.js";
import {GameError} from "../services/game-service.js";
import {worldHistoryService,type WorldChronicle} from "../services/world-history-service.js";
import {requireGameMaster} from "./auth.js";

const HISTORY_COLOR=0x7a4b2f;
const MAX_DESCRIPTION_LENGTH=3800;

export function chroniclePages(chronicle:Pick<WorldChronicle,"gameTurn"|"entries">):EmbedBuilder[]{
  const entries=chronicle.entries.length?chronicle.entries:["Bu tur kayda değer bir olay yaşanmadı."];
  const pages:string[]=[];
  let page="";
  for(const entry of entries){
    const candidate=page?`${page}\n\n${entry}`:entry;
    if(candidate.length>MAX_DESCRIPTION_LENGTH&&page){pages.push(page);page=entry;}
    else page=candidate;
  }
  if(page)pages.push(page);
  return pages.map((description,index)=>new EmbedBuilder().setColor(HISTORY_COLOR)
    .setTitle(index===0?`Dünya Tarihçesi • Tur ${chronicle.gameTurn}`:`Dünya Tarihçesi • Tur ${chronicle.gameTurn} • Devam`)
    .setDescription(description));
}

export async function publishPendingWorldChronicles(client:Client,guildId:string):Promise<{published:number;pending:number}>{
  const chronicles=await worldHistoryService.pending(guildId);
  let published=0;
  let pending=0;
  for(const chronicle of chronicles){
    if(!chronicle.channelId){pending+=1;continue;}
    if(!await worldHistoryService.claim(chronicle.id)){pending+=1;continue;}
    try{
      const channel=await client.channels.fetch(chronicle.channelId);
      if(!channel||!channel.isTextBased()||channel.isDMBased())throw new Error("Tarihçe kanalı bulunamadı veya metin kanalı değil.");
      let firstMessageId:string|null=null;
      for(const embed of chroniclePages(chronicle)){
        const message=await channel.send({embeds:[embed]});
        firstMessageId??=message.id;
      }
      await worldHistoryService.markPosted(chronicle.id,channel.id,firstMessageId!);
      published+=1;
    }catch(error){
      pending+=1;
      const message=error instanceof Error?error.message:String(error);
      await worldHistoryService.markFailed(chronicle.id,message).catch(()=>undefined);
      logger.error({error,guildId,chronicleId:chronicle.id,gameTurn:chronicle.gameTurn},"Dünya tarihçesi yayımlanamadı");
    }
  }
  return{published,pending};
}

export async function publishTurnChronicle(client:Client,guildId:string,gameTurn:number):Promise<{published:number;pending:number}>{
  await worldHistoryService.prepare(guildId,gameTurn);
  return publishPendingWorldChronicles(client,guildId);
}

export async function handleWorldHistoryChannelCommand(interaction:ChatInputCommandInteraction):Promise<void>{
  requireGameMaster(interaction);
  if(!interaction.guildId)throw new GameError("Sunucu bulunamadı.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const operation=interaction.options.getString("islem",true);
  const channel=interaction.options.getChannel("kanal");
  if(operation==="set"&&!channel)throw new GameError("Ayarlamak istediğiniz tarihçe kanalını seçmelisiniz.");
  if(channel&&channel.type!==ChannelType.GuildText)throw new GameError("Tarihçe kanalı bir sunucu metin kanalı olmalıdır.");
  await worldHistoryService.setChannel({guildId:interaction.guildId,actorId:interaction.user.id,
    channelId:operation==="set"?channel!.id:null});
  if(operation==="clear"){
    await interaction.editReply("Tarihçe yayını kapatıldı. Olay kayıtları korunacak ve yeniden kanal seçildiğinde bekleyen kronikler yayımlanabilecek.");
    return;
  }
  const result=await publishPendingWorldChronicles(interaction.client,interaction.guildId);
  await interaction.editReply(`Tarihçe kanalı <#${channel!.id}> olarak ayarlandı.${result.published?` Bekleyen **${result.published}** kronik yayımlandı.`:""}`+
    (result.pending?` **${result.pending}** kronik gönderilemedi ve yeniden denemek üzere korundu.`:""));
}
