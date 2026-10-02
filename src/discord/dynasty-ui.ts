import {AttachmentBuilder,ChannelType,EmbedBuilder,MessageFlags,type AutocompleteInteraction,type ChatInputCommandInteraction,type Client} from "discord.js";
import {DYNASTY_GENDER_LABELS,DYNASTY_HEALTH_LABELS,MINIMUM_MARRIAGE_AGE,type DynastyGender,type DynastyHealth} from "../domain/dynasty.js";
import {dynastyService,type DynastyTurnResult,type DynastyView} from "../services/dynasty-service.js";
import {gameService,GameError} from "../services/game-service.js";
import {logger} from "../logger.js";
import {isGameMaster,requireGameMaster,resolveCountry} from "./auth.js";
import {
  DYNASTY_BANNER_NAME,DYNASTY_BANNER_PATH,DYNASTY_BANNER_URL,
  DYNASTY_MARRIAGE_BANNER_NAME,DYNASTY_MARRIAGE_BANNER_PATH,DYNASTY_MARRIAGE_BANNER_URL
} from "./assets.js";

const number=(value:number)=>value.toLocaleString("tr-TR");
const age=(value:number|null)=>value===null?"yaş bilinmiyor":number(value)+" yaş";

export type DynastyDeathLogPublishState="NO_LOGS"|"NO_CHANNEL"|"CHANNEL_UNAVAILABLE"|"PUBLISHED"|"FAILED";

export interface DynastyDeathLogPublishResult{
  state:DynastyDeathLogPublishState;channelId:string|null;publishedBatches:number;publishedEntries:number;
}

const errorMessage=(error:unknown)=>error instanceof Error?error.message:String(error);

export async function publishDynastyDeathLogs(client:Client,guildId:string):Promise<DynastyDeathLogPublishResult>{
  const batches=await dynastyService.pendingDeathLogBatches(guildId);
  if(!batches.length)return{state:"NO_LOGS",channelId:null,publishedBatches:0,publishedEntries:0};
  const channelId=await dynastyService.deathLogChannel(guildId);
  if(!channelId)return{state:"NO_CHANNEL",channelId:null,publishedBatches:0,publishedEntries:0};
  const channel=await client.channels.fetch(channelId).catch(()=>null);
  if(!channel?.isTextBased()||channel.isDMBased())
    return{state:"CHANNEL_UNAVAILABLE",channelId,publishedBatches:0,publishedEntries:0};
  let publishedBatches=0;
  let publishedEntries=0;
  for(const batch of batches){
    try{
      for(let index=0;index<batch.entries.length;index+=12){
        await channel.send({embeds:[new EmbedBuilder()
          .setColor(0x4b4d52)
          .setTitle("⚰️ "+batch.countryName+" • Ölüm Zarları • Tur "+batch.gameTurn)
          .setDescription(batch.entries.slice(index,index+12).join("\n\n").slice(0,4000))
          .setFooter({text:"60 yaşın üzerindeki yaşayan hanedan üyeleri otomatik kontrol edilir."})]});
      }
      await dynastyService.markDeathLogPublished(batch.dynastyId,batch.gameTurn);
      publishedBatches+=1;
      publishedEntries+=batch.entries.length;
    }catch(error){
      await dynastyService.markDeathLogFailed(batch.dynastyId,batch.gameTurn,errorMessage(error)).catch(()=>undefined);
      logger.error({error,guildId,channelId,dynastyId:batch.dynastyId,turn:batch.gameTurn},"Hanedan ölüm zarı logu yayımlanamadı");
      return{state:"FAILED",channelId,publishedBatches,publishedEntries};
    }
  }
  return{state:"PUBLISHED",channelId,publishedBatches,publishedEntries};
}

function memberLine(member:DynastyView["members"][number]):string{
  const badges=[member.is_monarch?"👑 Hükümdar":null,member.is_heir?"📜 Tahtın varisi":null]
    .filter(Boolean).join(" • ");
  const health=member.status==="DEAD"
    ?"Öldü"+(member.died_turn!==null?" • Tur "+member.died_turn:"")
    :DYNASTY_HEALTH_LABELS[member.health]+(member.health==="SICK"&&member.sick_until_turn!==null?" • Tur "+member.sick_until_turn+" sonuna kadar gebelik yok":"");
  const family=[member.spouse_name?"Eşi: "+member.spouse_name+(member.spouse_country_name?" ("+member.spouse_country_name+")":""):null,member.mother_name?"Annesi: "+member.mother_name:null,member.father_name?"Babası: "+member.father_name:null]
    .filter(Boolean).join(" • ");
  return "• **"+member.title+" "+member.name+"** — "+age(member.age)+" • "+DYNASTY_GENDER_LABELS[member.gender]+
    "\n↳ "+member.relation+" • "+health+(badges?" • "+badges:"")+(member.succession_rank!==null?" • Veraset #"+member.succession_rank:"")+
    (family?"\n↳ "+family:"");
}

function recentEventLine(event:DynastyView["events"][number]):string|null{
  const details=event.details??{};
  if(event.event_type==="BIRTH")return "👶 Tur "+event.game_turn+": **"+String(details.childName??"Çocuk")+"** dünyaya geldi.";
  if(event.event_type==="DEATH")return "⚰️ Tur "+event.game_turn+": **"+String(details.name??"Hanedan üyesi")+"** hayatını kaybetti.";
  if(event.event_type==="SUCCESSION")return "👑 Tur "+event.game_turn+": **"+String(details.name??"Yeni hükümdar")+"** tahta geçti.";
  if(event.event_type==="MARRIAGE")return "💍 Tur "+event.game_turn+": **"+String(details.memberName??"Üye")+"** ile **"+String(details.spouseName??"eş")+"** evlendi.";
  if(event.event_type==="MATERNAL_ILLNESS")return "🩺 Tur "+event.game_turn+": **"+String(details.name??"Hanedan üyesi")+"** doğum sonrasında hastalandı.";
  if(event.event_type==="RECOVERY")return "💚 Tur "+event.game_turn+": **"+String(details.name??"Hanedan üyesi")+"** iyileşti.";
  if(event.event_type==="SUCCESSION_CRISIS")return "⚠️ Tur "+event.game_turn+": Veraset krizi başladı.";
  return null;
}

export function dynastyEmbed(view:DynastyView):EmbedBuilder{
  const living=view.members.filter((member)=>member.status==="ALIVE");
  const dead=view.members.filter((member)=>member.status==="DEAD");
  const monarch=living.find((member)=>member.is_monarch);
  const heir=living.find((member)=>member.is_heir);
  const spouse=monarch?.spouse_id?living.find((member)=>member.id===monarch.spouse_id):null;
  const spouseText=spouse
    ?spouse.title+" "+spouse.name+" — "+age(spouse.age)
    :monarch?.spouse_name
      ?(monarch.spouse_title?monarch.spouse_title+" ":"")+monarch.spouse_name+
        (monarch.spouse_country_name?" ("+monarch.spouse_country_name+")":"")+" — "+age(monarch.spouse_age)
      :"Yok";
  const children=living.filter((member)=>member.mother_id===monarch?.id||member.father_id===monarch?.id);
  const other=living.filter((member)=>member.id!==monarch?.id&&member.id!==spouse?.id&&!children.some((child)=>child.id===member.id));
  const nextBirth=view.last_birth_attempt_turn===null?view.current_turn:view.last_birth_attempt_turn+2;
  const overview=[
    "**Hanedan:** "+view.name,
    "**Hükümdar:** "+(monarch?monarch.title+" "+monarch.name+" — "+age(monarch.age):"⚠️ Veraset krizi"),
    "**Eşi:** "+spouseText,
    "**Tahtın Varisi:** "+(heir?heir.title+" "+heir.name+" — "+age(heir.age):"Belirlenmedi"),
    "**Yaşayan Üye:** "+living.length+" • **Ölen Üye:** "+dead.length,
    "**Yeni çocuk denemesi:** "+(view.current_turn>=nextBirth?"Hazır":"Tur "+nextBirth)
  ].join("\n");
  const embed=new EmbedBuilder().setColor(0xc59b45).setTitle("👑 "+view.country_name+" • Hanedan Formu").setDescription(overview).setImage(DYNASTY_BANNER_URL);
  if(children.length)embed.addFields({name:"👶 Hükümdarın Çocukları",value:children.map(memberLine).join("\n\n").slice(0,1024)});
  if(other.length)embed.addFields({name:"🏛️ Diğer Hanedan Üyeleri",value:other.map(memberLine).join("\n\n").slice(0,1024)});
  const succession=living.filter((member)=>member.succession_rank!==null&&!member.is_monarch)
    .sort((left,right)=>Number(left.succession_rank)-Number(right.succession_rank));
  embed.addFields({name:"📜 Veraset Sırası",value:succession.length?succession.map((member)=>"**"+member.succession_rank+".** "+member.title+" "+member.name).join("\n").slice(0,1024):"Uygun varis bulunmuyor."});
  if(dead.length)embed.addFields({name:"⚰️ Ölen Hanedan Üyeleri",value:dead.slice(0,12).map((member)=>"• **"+member.name+"** — "+age(member.age)+" • "+(member.death_reason??"Ölüm nedeni kaydedilmedi")).join("\n").slice(0,1024)});
  const recent=view.events.map(recentEventLine).filter((line):line is string=>Boolean(line)).slice(0,8);
  if(recent.length)embed.addFields({name:"🗞️ Son Hanedan Olayları",value:recent.join("\n").slice(0,1024)});
  return embed.setFooter({text:"Tur "+view.current_turn+" • Her oyun turunda yaşayan üyeler 1 yaş alır."});
}

export async function refreshDynastyCard(client:Client,dynastyId:string):Promise<boolean>{
  const view=await dynastyService.viewById(dynastyId);
  if(!view?.published_channel_id||!view.published_message_id)return false;
  const channel=await client.channels.fetch(view.published_channel_id).catch(()=>null);
  if(!channel?.isTextBased()||channel.isDMBased())return false;
  const message=await channel.messages.fetch(view.published_message_id).catch(()=>null);
  if(!message)return false;
  const hasBanner=message.attachments.some((attachment)=>attachment.name===DYNASTY_BANNER_NAME);
  await message.edit({
    embeds:[dynastyEmbed(view)],
    ...(hasBanner?{}:{files:[new AttachmentBuilder(DYNASTY_BANNER_PATH,{name:DYNASTY_BANNER_NAME})]})
  });
  return true;
}

async function countryForAdmin(interaction:ChatInputCommandInteraction){
  const name=interaction.options.getString("ulke",true);
  const country=await gameService.countryByName(interaction.guildId!,name);
  if(!country)throw new GameError("Ülke bulunamadı.");
  return country;
}

export async function handleDynastyCommand(interaction:ChatInputCommandInteraction):Promise<boolean>{
  if(!interaction.guildId||!["hanedan","hanedan-yonetim"].includes(interaction.commandName))return false;
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(interaction.commandName==="hanedan"){
    const country=await resolveCountry(interaction,interaction.options.getString("ulke"));
    const view=await dynastyService.viewByCountry(country.id);
    if(!view)throw new GameError("Bu devlet için henüz hanedan oluşturulmadı.");
    if(sub==="bilgi"){
      await interaction.editReply({
        embeds:[dynastyEmbed(view)],
        files:[new AttachmentBuilder(DYNASTY_BANNER_PATH,{name:DYNASTY_BANNER_NAME})]
      });
    }else if(sub==="cocuk-dene"){
      const result=await dynastyService.attemptBirth({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        childName:interaction.options.getString("isim",true),
        parentMemberId:interaction.options.getString("ebeveyn")
      });
      const roll=result.attemptRoll+(result.ageModifier>=0?" + "+result.ageModifier:" − "+Math.abs(result.ageModifier));
      if(!result.success)await interaction.editReply("🕯️ **Çocuk denemesi başarısız oldu.**\nDoğum zarı: **"+roll+" = "+(result.attemptRoll+result.ageModifier)+"** • Gerekli sonuç: **11**\nYeni deneme iki tur sonra yapılabilir.");
      else{
        const gender=result.childGender==="MALE"?"erkek":"kız";
        const complication=result.complication==="DEATH"
          ?" **"+result.motherName+"** doğum komplikasyonu nedeniyle hayatını kaybetti."
          :result.complication==="ILLNESS"
            ?" **"+result.motherName+"** hastalandı ve 3 tur yeni gebelik deneyemeyecek."
            :" Doğum sorunsuz tamamlandı.";
        await interaction.editReply("👶 **"+result.childName+"** adlı "+gender+" çocuk hanedana katıldı.\nDoğum zarı: **"+roll+" = "+(result.attemptRoll+result.ageModifier)+"** • "+complication);
      }
      await refreshDynastyCard(interaction.client,view.id);
    }else if(sub==="evlilik-teklif"){
      const targetCountryName=interaction.options.getString("hedef-ulke",true);
      const targetCountry=await gameService.countryByName(interaction.guildId,targetCountryName);
      if(!targetCountry)throw new GameError("Hedef devlet bulunamadı.");
      if(targetCountry.id===country.id)throw new GameError("Bu komut yalnızca farklı devletlerin hanedanları arasındaki evlilik içindir.");
      if(!await dynastyService.viewByCountry(targetCountry.id))throw new GameError("Hedef devlet için henüz hanedan oluşturulmadı.");
      const proposal=await dynastyService.proposeMarriage({
        guildId:interaction.guildId,proposerCountryId:country.id,targetCountryId:targetCountry.id,
        proposerMemberId:interaction.options.getString("uye",true),targetMemberId:interaction.options.getString("hedef-uye",true),
        actorId:interaction.user.id
      });
      await interaction.editReply(
        "💍 Evlilik teklifi gönderildi: **"+proposal.proposer_member_name+"** ("+proposal.proposer_country_name+") → **"+
        proposal.target_member_name+"** ("+proposal.target_country_name+").\nTeklif kimliği: `"+proposal.id+"`"
      );
      const channel=interaction.channel;
      if(channel?.isTextBased()&&!channel.isDMBased())await channel.send({embeds:[new EmbedBuilder()
        .setColor(0xc59b45).setTitle("💍 Hanedan Evliliği Teklifi")
        .setImage(DYNASTY_MARRIAGE_BANNER_URL)
        .setDescription("**"+proposal.proposer_country_name+"**, **"+proposal.target_country_name+"** devletine hanedan evliliği teklif etti.\n\n"+
          "**"+proposal.proposer_member_name+"** × **"+proposal.target_member_name+"**\n\n"+
          "Hedef devlet `/hanedan evlilik-cevapla` ile teklifi yanıtlayabilir.")
        .setFooter({text:"Teklif • "+proposal.id})],files:[new AttachmentBuilder(DYNASTY_MARRIAGE_BANNER_PATH,{name:DYNASTY_MARRIAGE_BANNER_NAME})]}).catch(()=>undefined);
    }else if(sub==="evlilik-cevapla"){
      const decision=interaction.options.getString("karar",true) as "ACCEPT"|"REJECT";
      const result=await dynastyService.respondMarriage({
        guildId:interaction.guildId,responderCountryId:country.id,proposalId:interaction.options.getString("teklif",true),
        actorId:interaction.user.id,decision
      });
      const accepted=decision==="ACCEPT";
      await interaction.editReply(accepted
        ?"💍 Evlilik teklifi kabul edildi. **"+result.proposal.proposer_member_name+"** ile **"+result.proposal.target_member_name+"** evlendi."
        :"❌ Evlilik teklifi reddedildi.");
      for(const dynastyId of result.dynastyIds)await refreshDynastyCard(interaction.client,dynastyId).catch(()=>false);
      const channel=interaction.channel;
      if(channel?.isTextBased()&&!channel.isDMBased())await channel.send({embeds:[new EmbedBuilder()
        .setColor(accepted?0x4f9d69:0xa33b3b).setTitle(accepted?"💍 Hanedan Evliliği Gerçekleşti":"❌ Hanedan Evliliği Teklifi Reddedildi")
        .setImage(DYNASTY_MARRIAGE_BANNER_URL)
        .setDescription("**"+result.proposal.proposer_country_name+"** • "+result.proposal.proposer_member_name+"\n"+
          "**"+result.proposal.target_country_name+"** • "+result.proposal.target_member_name)],files:[new AttachmentBuilder(DYNASTY_MARRIAGE_BANNER_PATH,{name:DYNASTY_MARRIAGE_BANNER_NAME})]}).catch(()=>undefined);
    }else if(sub==="evlilik-teklifleri"){
      const proposals=await dynastyService.listMarriageProposals(interaction.guildId,country.id);
      if(!proposals.length){await interaction.editReply("Bu devlet için bekleyen evlilik teklifi bulunmuyor.");return true;}
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0xc59b45).setTitle("💍 "+country.name+" • Bekleyen Evlilik Teklifleri").setImage(DYNASTY_MARRIAGE_BANNER_URL)
        .setDescription(proposals.map((proposal)=>{
          const direction=proposal.target_country_id===country.id?"📥 Gelen":"📤 Giden";
          return direction+" • **"+proposal.proposer_member_name+"** ("+proposal.proposer_country_name+") × **"+
            proposal.target_member_name+"** ("+proposal.target_country_name+")\n`"+proposal.id+"`";
        }).join("\n\n").slice(0,4000))],files:[new AttachmentBuilder(DYNASTY_MARRIAGE_BANNER_PATH,{name:DYNASTY_MARRIAGE_BANNER_NAME})]});
    }else if(sub==="evlilik-geri-cek"){
      const proposal=await dynastyService.withdrawMarriage({
        guildId:interaction.guildId,proposerCountryId:country.id,proposalId:interaction.options.getString("teklif",true),actorId:interaction.user.id
      });
      await interaction.editReply("↩️ **"+proposal.target_country_name+"** devletine gönderilen hanedan evliliği teklifi geri çekildi.");
    }
    return true;
  }
  requireGameMaster(interaction);
  if(sub==="olum-log-kanali"){
    const operation=interaction.options.getString("islem",true);
    const selectedChannel=interaction.options.getChannel("kanal");
    if(operation==="set"){
      if(!selectedChannel||selectedChannel.type!==ChannelType.GuildText)throw new GameError("Bir sunucu metin kanalı seçmelisiniz.");
      await dynastyService.setDeathLogChannel(interaction.guildId,selectedChannel.id);
      const publication=await publishDynastyDeathLogs(interaction.client,interaction.guildId);
      await interaction.editReply(
        "✅ Hanedan ölüm zarı logları <#"+selectedChannel.id+"> kanalına gönderilecek."+
        (publication.state==="PUBLISHED"?" Kuyrukta bekleyen "+publication.publishedEntries+" kayıt da yayımlandı.":"")
      );
      return true;
    }
    if(operation==="clear"){
      await dynastyService.setDeathLogChannel(interaction.guildId,null);
      await interaction.editReply("✅ Ölüm zarı log kanalı kapatıldı. Yeni kayıtlar kanal ayarlanana kadar kaybolmadan kuyrukta bekleyecek.");
      return true;
    }
    const status=await dynastyService.deathLogStatus(interaction.guildId);
    const configured=status.channelId?await interaction.client.channels.fetch(status.channelId).catch(()=>null):null;
    if(operation==="test"){
      if(!configured?.isTextBased()||configured.isDMBased())throw new GameError("Ölüm zarı log kanalı ayarlı değil veya botun kanala erişimi yok.");
      await configured.send({embeds:[new EmbedBuilder()
        .setColor(0x57f287).setTitle("⚰️ Hanedan Ölüm Logu Testi")
        .setDescription("Kanal çalışıyor. Bekleyen ölüm zarı kayıtları şimdi kontrol ediliyor.")]});
      const publication=await publishDynastyDeathLogs(interaction.client,interaction.guildId);
      await interaction.editReply("✅ Test mesajı gönderildi."+(publication.state==="PUBLISHED"?" Bekleyen "+publication.publishedEntries+" kayıt da yayımlandı.":""));
      return true;
    }
    await interaction.editReply(
      "⚰️ **Hanedan Ölüm Logu Durumu**\nKanal: "+(status.channelId?"<#"+status.channelId+">":"Ayarlanmamış")+
      "\nErişim: **"+(configured?.isTextBased()&&!configured.isDMBased()?"Hazır":"Yok")+"**"+
      "\nBekleyen paket: **"+status.pendingBatches+"** • Bekleyen zar kaydı: **"+status.pendingEntries+"**"
    );
    return true;
  }
  if(sub==="ulkeler-arasi-evlendir"){
    const firstCountry=await gameService.countryByName(interaction.guildId,interaction.options.getString("birinci-ulke",true));
    const secondCountry=await gameService.countryByName(interaction.guildId,interaction.options.getString("ikinci-ulke",true));
    if(!firstCountry||!secondCountry)throw new GameError("Seçilen devletlerden biri bulunamadı.");
    const result=await dynastyService.forceCrossDynastyMarriage({
      guildId:interaction.guildId,firstCountryId:firstCountry.id,secondCountryId:secondCountry.id,
      firstMemberId:interaction.options.getString("birinci-uye",true),secondMemberId:interaction.options.getString("ikinci-uye",true),
      actorId:interaction.user.id
    });
    await refreshDynastyCard(interaction.client,result.first.dynasty_id).catch(()=>false);
    await refreshDynastyCard(interaction.client,result.second.dynasty_id).catch(()=>false);
    await interaction.editReply("✅ **"+result.first.name+"** ("+result.first.country_name+") ile **"+result.second.name+"** ("+result.second.country_name+") evlendirildi.");
    return true;
  }
  const country=await countryForAdmin(interaction);
  if(sub==="olustur"){
    const id=await dynastyService.create({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,name:interaction.options.getString("ad",true)});
    await interaction.editReply("✅ **"+country.name+"** için hanedan kaydı oluşturuldu. Üyeleri ekledikten sonra formu yayımlayabilirsin.");
    await refreshDynastyCard(interaction.client,id);
    return true;
  }
  const view=await dynastyService.viewByCountry(country.id);
  if(!view)throw new GameError("Bu devlet için önce `/hanedan-yonetim olustur` kullanılmalıdır.");
  if(sub==="uye-ekle"){
    const id=await dynastyService.addMember({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      name:interaction.options.getString("ad",true),gender:interaction.options.getString("cinsiyet",true) as DynastyGender,
      age:interaction.options.getInteger("yas",true),title:interaction.options.getString("unvan",true),
      relation:interaction.options.getString("akrabalik",true),isMonarch:interaction.options.getBoolean("hukumdar")??false,
      isHeir:interaction.options.getBoolean("varis")??false,successionRank:interaction.options.getInteger("veraset-sirasi"),
      spouseId:interaction.options.getString("es"),motherId:interaction.options.getString("anne"),fatherId:interaction.options.getString("baba")
    });
    await interaction.editReply("✅ Hanedan üyesi eklendi: **"+interaction.options.getString("ad",true)+"**.");
    await refreshDynastyCard(interaction.client,view.id);
    return true;
  }
  if(sub==="uye-duzenle"){
    await dynastyService.editMember({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,memberId:interaction.options.getString("uye",true),
      name:interaction.options.getString("ad"),age:interaction.options.getInteger("yas"),title:interaction.options.getString("unvan"),
      relation:interaction.options.getString("akrabalik"),successionRank:interaction.options.getInteger("veraset-sirasi"),
      health:interaction.options.getString("saglik") as DynastyHealth|null
    });
    await interaction.editReply("✅ Hanedan üyesi güncellendi.");
  }else if(sub==="evlendir"){
    await dynastyService.linkSpouses({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,memberId:interaction.options.getString("uye",true),spouseId:interaction.options.getString("es",true)});
    await interaction.editReply("✅ Evlilik bağı kaydedildi.");
  }else if(sub==="hukumdar-belirle"||sub==="varis-belirle"){
    await dynastyService.designate({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,memberId:interaction.options.getString("uye",true),kind:sub==="hukumdar-belirle"?"MONARCH":"HEIR"});
    await interaction.editReply("✅ "+(sub==="hukumdar-belirle"?"Hükümdar":"Taht varisi")+" güncellendi.");
  }else if(sub==="uye-oldur"){
    await dynastyService.manualDeath({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,memberId:interaction.options.getString("uye",true),reason:interaction.options.getString("neden",true)});
    await interaction.editReply("⚰️ Hanedan üyesinin ölümü kaydedildi; veraset otomatik yeniden hesaplandı.");
  }else if(sub==="form-yayinla"){
    const channel=interaction.channel;
    if(!channel?.isTextBased()||channel.isDMBased())throw new GameError("Hanedan formu yalnızca bir sunucu metin kanalında yayımlanabilir.");
    const message=await channel.send({
      embeds:[dynastyEmbed(view)],
      files:[new AttachmentBuilder(DYNASTY_BANNER_PATH,{name:DYNASTY_BANNER_NAME})]
    });
    await dynastyService.setPublishedMessage({dynastyId:view.id,channelId:channel.id,messageId:message.id});
    await interaction.editReply("✅ Hanedan formu bu kanalda yayımlandı. Doğum, ölüm ve yönetici değişikliklerinde otomatik güncellenecek.");
    return true;
  }
  await refreshDynastyCard(interaction.client,view.id);
  return true;
}

export async function handleDynastyAutocomplete(interaction:AutocompleteInteraction):Promise<boolean>{
  if(!interaction.guildId||!["hanedan","hanedan-yonetim"].includes(interaction.commandName))return false;
  const focused=interaction.options.getFocused(true);
  const sub=interaction.options.getSubcommand(false);
  const query=String(focused.value).toLocaleLowerCase("tr-TR");
  if(["ulke","hedef-ulke","birinci-ulke","ikinci-ulke"].includes(focused.name)){
    const countries=await gameService.listCountries(interaction.guildId);
    await interaction.respond(countries.filter((country)=>!query||country.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((country)=>({name:country.name,value:country.name})));
    return true;
  }
  if(focused.name==="teklif"&&(sub==="evlilik-cevapla"||sub==="evlilik-geri-cek")){
    const requested=interaction.options.getString("ulke");
    const country=requested&&isGameMaster(interaction)
      ?await gameService.countryByName(interaction.guildId,requested)
      :await gameService.countryForUser(interaction.guildId,interaction.user.id);
    const proposals=country?await dynastyService.listMarriageProposals(interaction.guildId,country.id):[];
    await interaction.respond(proposals.filter((proposal)=>sub==="evlilik-cevapla"?proposal.target_country_id===country?.id:proposal.proposer_country_id===country?.id)
      .filter((proposal)=>!query||(proposal.proposer_member_name+" "+proposal.target_member_name+" "+proposal.proposer_country_name).toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((proposal)=>({
        name:(proposal.proposer_country_name+": "+proposal.proposer_member_name+" × "+proposal.target_member_name).slice(0,100),value:proposal.id
      })));
    return true;
  }
  if(focused.name==="ebeveyn"&&sub==="cocuk-dene"){
    const requested=interaction.options.getString("ulke");
    const country=requested&&isGameMaster(interaction)
      ?await gameService.countryByName(interaction.guildId,requested)
      :await gameService.countryForUser(interaction.guildId,interaction.user.id);
    const view=country?await dynastyService.viewByCountry(country.id):null;
    const monarch=view?.members.find((member)=>member.status==="ALIVE"&&member.is_monarch);
    const candidates=(view?.members??[]).filter((member)=>
      member.status==="ALIVE"&&Boolean(member.spouse_id)&&member.id!==monarch?.id&&
      (member.mother_id===monarch?.id||member.father_id===monarch?.id)
    );
    await interaction.respond(candidates
      .filter((member)=>!query||(member.name+" "+member.title+" "+member.spouse_name).toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((member)=>({
        name:(member.title+" "+member.name+" × "+(member.spouse_name??"Eş kaydı")+" • "+age(member.age)).slice(0,100),value:member.id
      })));
    return true;
  }
  if(["uye","es","anne","baba","hedef-uye","birinci-uye","ikinci-uye"].includes(focused.name)){
    let country=null as Awaited<ReturnType<typeof gameService.countryByName>>;
    let marriageSelection=false;
    if(sub==="evlilik-teklif"&&focused.name==="uye"){
      const requested=interaction.options.getString("ulke");
      country=requested&&isGameMaster(interaction)
        ?await gameService.countryByName(interaction.guildId,requested)
        :await gameService.countryForUser(interaction.guildId,interaction.user.id);
      marriageSelection=true;
    }else if(sub==="evlilik-teklif"&&focused.name==="hedef-uye"){
      const countryName=interaction.options.getString("hedef-ulke");
      country=countryName?await gameService.countryByName(interaction.guildId,countryName):null;
      marriageSelection=true;
    }else if(sub==="ulkeler-arasi-evlendir"&&focused.name==="birinci-uye"){
      const countryName=interaction.options.getString("birinci-ulke");
      country=countryName?await gameService.countryByName(interaction.guildId,countryName):null;
      marriageSelection=true;
    }else if(sub==="ulkeler-arasi-evlendir"&&focused.name==="ikinci-uye"){
      const countryName=interaction.options.getString("ikinci-ulke");
      country=countryName?await gameService.countryByName(interaction.guildId,countryName):null;
      marriageSelection=true;
    }else{
      const countryName=interaction.options.getString("ulke");
      country=countryName?await gameService.countryByName(interaction.guildId,countryName):null;
    }
    const view=country?await dynastyService.viewByCountry(country.id):null;
    const selectedMember=interaction.options.getString("uye");
    const candidates=(view?.members??[]).filter((member)=>member.status==="ALIVE"&&member.id!==selectedMember)
      .filter((member)=>!marriageSelection||(member.age!==null&&member.age>=MINIMUM_MARRIAGE_AGE&&!member.spouse_id));
    await interaction.respond(candidates.filter((member)=>!query||(member.name+" "+member.title).toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((member)=>({name:(member.title+" "+member.name+" • "+age(member.age)).slice(0,100),value:member.id})));
    return true;
  }
  await interaction.respond([]);
  return true;
}

export async function processDynastyAutomation(client:Client,guildId:string,turn:number):Promise<DynastyTurnResult&{
  deathLogsPublished:number;deathLogWarning:string|null;
}>{
  const result=await dynastyService.processTurn(guildId,turn);
  for(const dynastyId of await dynastyService.publishedDynastyIds(guildId))await refreshDynastyCard(client,dynastyId).catch(()=>false);
  const groups=new Map<string,string[]>();
  for(const event of result.events){
    const rows=groups.get(event.dynastyId)??[];rows.push(event.text);groups.set(event.dynastyId,rows);
  }
  for(const [dynastyId,events] of groups){
    const view=await dynastyService.viewById(dynastyId);
    if(!view?.published_channel_id)continue;
    const channel=await client.channels.fetch(view.published_channel_id).catch(()=>null);
    if(channel?.isTextBased()&&!channel.isDMBased())await channel.send({embeds:[new EmbedBuilder().setColor(0xc59b45).setTitle("👑 "+view.country_name+" • Hanedan Olayları • Tur "+turn).setDescription(events.join("\n\n").slice(0,4000))]}).catch(()=>undefined);
  }
  const publication=await publishDynastyDeathLogs(client,guildId);
  const deathLogWarning=publication.state==="NO_CHANNEL"
    ?"Ölüm zarları atıldı fakat ölüm log kanalı ayarlı olmadığı için kayıtlar kuyrukta bekliyor."
    :publication.state==="CHANNEL_UNAVAILABLE"
      ?"Ölüm log kanalı bulunamadı veya botun kanala erişimi yok; kayıtlar kuyrukta bekliyor."
      :publication.state==="FAILED"
        ?"Ölüm zarı kayıtları Discord kanalına gönderilemedi; kayıtlar kaybolmadı ve kuyrukta bekliyor."
        :null;
  return{...result,deathLogsPublished:publication.publishedEntries,deathLogWarning};
}
