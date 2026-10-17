import { resolve } from "node:path";
import { AttachmentBuilder,EmbedBuilder,type Client } from "discord.js";
import { logger } from "../logger.js";
import {
  deathPublicationService,type DeathPublicationView
} from "../services/death-publication-service.js";

function deathClause(reason: string | null): string {
  const value=(reason??"").trim().toLocaleLowerCase("tr-TR");
  if (!value) return "hayatını kaybetti";
  if (value.includes("yaşlılık")) return "ilerleyen yaşı nedeniyle hayatını kaybetti";
  if (value.includes("doğum komplikasyonu")) return "doğum sırasında ortaya çıkan komplikasyonlar nedeniyle hayatını kaybetti";
  if (value.includes("suikast")) return "uğradığı suikast sonucunda hayatını kaybetti";
  if (value.includes("kaçır") && value.includes("infaz")) return "tutsaklığının ardından infaz edildi";
  if ((value.includes("yakalan") || value.includes("esaret")) && value.includes("infaz")) return "yakalandıktan sonra infaz edildi";
  if (value.includes("savaş")) return "savaş sırasında hayatını kaybetti";
  return "hayatını kaybetti";
}

function identity(publication: DeathPublicationView): string {
  const role=publication.subject_role?.trim();
  const age=publication.subject_age===null?"":`${publication.subject_age.toLocaleString("tr-TR")} yaşındaki `;
  const person=`${age}${role?`${role} `:""}${publication.subject_name}`;
  if (publication.subject_type==="ACADEMY_CHARACTER") {
    return `**${publication.country_name??"Bir devlet"}** hizmetindeki **${person}**`;
  }
  if (publication.subject_type==="DYNASTY_MEMBER") {
    return `**${publication.subject_lineage??publication.country_name??"Hanedan"}** mensubu **${person}**`;
  }
  return `**${publication.subject_lineage??"Roma ailesi"}** mensubu **${age}${publication.subject_name}**`;
}

function title(publication: DeathPublicationView): string {
  if (publication.subject_type==="ACADEMY_CHARACTER") return `⚰️ ${publication.subject_name} Hayatını Kaybetti`;
  if (publication.was_monarch) return `⚰️ ${publication.country_name??publication.subject_lineage??"Devlet"} Hükümdarını Kaybetti`;
  if (publication.subject_type==="DYNASTY_MEMBER") return `⚰️ ${publication.subject_lineage??"Hanedan"} Hanedanında Yas`;
  return `⚰️ ${publication.subject_lineage??"Roma Ailesi"} • Yas Haberi`;
}

function imageName(publication: DeathPublicationView): string {
  if (publication.was_monarch) return "dynasty-deaths-banner.png";
  if (publication.subject_gender==="MALE") return "dynasty-death-male-banner.png";
  if (publication.subject_gender==="FEMALE") return "dynasty-death-female-banner.png";
  return "dynasty-deaths-banner.png";
}

function deathEmbed(publication: DeathPublicationView,attachmentName:string):EmbedBuilder {
  const location=publication.settlement_name
    ? ` Ölüm haberi **${publication.settlement_name}** kayıtlarına geçti.`
    : " Ölüm kaydı resmî kayıtlara geçti.";
  return new EmbedBuilder()
    .setColor(0x5b4a42)
    .setTitle(title(publication).slice(0,256))
    .setDescription(`${identity(publication)}, ${deathClause(publication.death_reason)}.${location}`.slice(0,4096))
    .setImage(`attachment://${attachmentName}`)
    .setFooter({text:`${publication.country_name??"Devlet kaydı"} • Tur ${publication.game_turn}`});
}

export async function publishPendingDeathPublications(
  client:Client,guildId:string
):Promise<{published:number;skipped:number;failed:number}> {
  let published=0;
  let skipped=0;
  let failed=0;
  const channels=new Map<string,Awaited<ReturnType<Client["channels"]["fetch"]>>>();
  for (const publication of await deathPublicationService.pending(guildId)) {
    if (!publication.channel_id) {
      await deathPublicationService.markFailed(
        publication.id,
        publication.subject_type==="ACADEMY_CHARACTER"
          ? "Ölüm yerleşkesinin olay kanalı eşleştirilmemiş."
          : "Ülkenin güncel başkentinin olay kanalı eşleştirilmemiş."
      );
      failed+=1;
      continue;
    }
    try {
      let channel=channels.get(publication.channel_id);
      if (channel===undefined) {
        channel=await client.channels.fetch(publication.channel_id).catch(()=>null);
        channels.set(publication.channel_id,channel);
      }
      if (!channel?.isTextBased() || channel.isDMBased()) throw new Error("Yerleşke olay kanalı bulunamadı veya metin kanalı değil.");
      const sourceName=imageName(publication);
      const attachmentName=`death-${publication.id}.png`;
      await channel.send({
        embeds:[deathEmbed(publication,attachmentName)],
        files:[new AttachmentBuilder(resolve(process.cwd(),"assets",sourceName),{name:attachmentName})]
      });
      await deathPublicationService.markPosted(publication.id);
      published+=1;
    } catch (error) {
      failed+=1;
      const message=error instanceof Error?error.message:String(error);
      await deathPublicationService.markFailed(publication.id,message).catch(()=>undefined);
      logger.error({error,guildId,publicationId:publication.id},"Ölüm olayı yerleşke kanalına yayımlanamadı");
    }
  }
  return{published,skipped,failed};
}
