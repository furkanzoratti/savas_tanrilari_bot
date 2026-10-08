import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,MessageFlags,
  ModalBuilder,TextInputBuilder,TextInputStyle,
  type AutocompleteInteraction,type ButtonInteraction,type ChatInputCommandInteraction,type Client,type ModalSubmitInteraction
} from "discord.js";
import {BIRTH_ATTEMPT_COOLDOWN_TURNS,DYNASTY_GENDER_LABELS,DYNASTY_HEALTH_LABELS,MINIMUM_MARRIAGE_AGE,type DynastyGender,type DynastyHealth} from "../domain/dynasty.js";
import {dynastyService,type DynastyMarriageProposalView,type DynastyTurnResult,type DynastyView} from "../services/dynasty-service.js";
import {gameService,GameError} from "../services/game-service.js";
import {logger} from "../logger.js";
import {isGameMaster,requireGameMaster,resolveCountry} from "./auth.js";
import {playerMentionPayload} from "./player-mentions.js";
import {
  dynastyViewAsset,type DynastyViewBannerKey,
  DYNASTY_MARRIAGE_BANNER_NAME,DYNASTY_MARRIAGE_BANNER_PATH,DYNASTY_MARRIAGE_BANNER_URL
} from "./assets.js";

const number=(value:number)=>value.toLocaleString("tr-TR");
const age=(value:number|null)=>value===null?"yaş bilinmiyor":number(value)+" yaş";
const dynastyViewAttachment=(key:DynastyViewBannerKey)=>{
  const asset=dynastyViewAsset(key);
  return new AttachmentBuilder(asset.path,{name:asset.name});
};

export type DynastyDeathLogPublishState="NO_LOGS"|"NO_CHANNEL"|"CHANNEL_UNAVAILABLE"|"PUBLISHED"|"FAILED";

export interface DynastyDeathLogPublishResult{
  state:DynastyDeathLogPublishState;channelId:string|null;publishedBatches:number;publishedEntries:number;
}

const errorMessage=(error:unknown)=>error instanceof Error?error.message:String(error);

function birthResultMessage(result:Awaited<ReturnType<typeof dynastyService.attemptBirth>>):string{
  const roll=result.attemptRoll+(result.ageModifier>=0?" + "+result.ageModifier:" − "+Math.abs(result.ageModifier));
  if(!result.success)return "🕯️ **Çocuk denemesi başarısız oldu.**\nDoğum zarı: **"+roll+" = "+(result.attemptRoll+result.ageModifier)+"** • Gerekli sonuç: **11**\nYeni deneme iki tur sonra yapılabilir.";
  const gender=result.childGender==="MALE"?"erkek":"kız";
  const complication=result.complication==="DEATH"
    ?" **"+result.motherName+"** doğum komplikasyonu nedeniyle hayatını kaybetti."
    :result.complication==="ILLNESS"
      ?" **"+result.motherName+"** hastalandı ve 3 tur yeni gebelik deneyemeyecek."
      :" Doğum sorunsuz tamamlandı.";
  return "👶 **Doğum başarılı.**\nDoğum zarı: **"+roll+" = "+(result.attemptRoll+result.ageModifier)+"**\n"+
    "Cinsiyet zarı: **1d2 → "+result.genderRoll+"** • Çocuk **"+gender+"**.\n"+complication+"\n\nŞimdi çocuğa isim verin.";
}

function birthNameButton(countryId:string,result:Awaited<ReturnType<typeof dynastyService.attemptBirth>>):ActionRowBuilder<ButtonBuilder>[] {
  if(!result.success||!result.pendingBirthId)return[];
  return[new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("dynasty_birth_name|"+countryId+"|"+result.pendingBirthId)
      .setLabel("Çocuğa İsim Ver").setEmoji("👶").setStyle(ButtonStyle.Primary)
  )];
}

function marriageProposalEmbed(proposal:DynastyMarriageProposalView):EmbedBuilder{
  const pending=proposal.status==="PENDING";
  const accepted=proposal.status==="ACCEPTED";
  const title=pending?"💍 Hanedan Evliliği Teklifi":accepted?"✅ Hanedan Evliliği Kabul Edildi":"❌ Hanedan Evliliği "+(proposal.status==="REJECTED"?"Reddedildi":"İptal Edildi");
  const status=pending
    ?"**"+proposal.target_country_name+"** oyuncuları veya oyun yöneticisi aşağıdaki düğmelerden cevap verebilir."
    :accepted
      ?"Teklif kabul edildi ve evlilik iki hanedana işlendi."
      :proposal.status==="REJECTED"?"Teklif reddedildi.":"Teklif geri çekildi veya iptal edildi.";
  return new EmbedBuilder()
    .setColor(pending?0xc59b45:accepted?0x4f9d69:0xa33b3b)
    .setTitle(title).setImage(DYNASTY_MARRIAGE_BANNER_URL)
    .setDescription(
      "**Teklif Eden:** "+proposal.proposer_country_name+" • "+proposal.proposer_member_name+"\n"+
      "**Hedef:** "+proposal.target_country_name+" • "+proposal.target_member_name+"\n\n"+status
    )
    .setFooter({text:"Teklif • "+proposal.id});
}

function marriageProposalButtons(proposal:DynastyMarriageProposalView):ActionRowBuilder<ButtonBuilder>[] {
  if(proposal.status!=="PENDING")return[];
  return[new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("dynasty_marriage_accept|"+proposal.id).setLabel("Kabul Et").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("dynasty_marriage_reject|"+proposal.id).setLabel("Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
  )];
}

async function refreshMarriageProposalMessage(client:Client,proposal:DynastyMarriageProposalView):Promise<boolean>{
  if(!proposal.public_channel_id||!proposal.public_message_id)return false;
  const channel=await client.channels.fetch(proposal.public_channel_id).catch(()=>null);
  if(!channel?.isTextBased()||channel.isDMBased())return false;
  const message=await channel.messages.fetch(proposal.public_message_id).catch(()=>null);
  if(!message)return false;
  await message.edit({embeds:[marriageProposalEmbed(proposal)],components:marriageProposalButtons(proposal)});
  return true;
}

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

type DynastyMember=DynastyView["members"][number];

function fit(value:string,maximum=1024):string{
  if(value.length<=maximum)return value;
  return value.slice(0,Math.max(0,maximum-18)).trimEnd()+"\n… devamı komutta";
}

function memberName(member:DynastyMember,includeTitle=true):string{
  const prefix=member.status==="DEAD"?"† ":"";
  return prefix+(includeTitle?member.title+" ":"")+member.name+(member.age===null?"":" — "+member.age);
}

function memberOrder(left:DynastyMember,right:DynastyMember):number{
  if(left.is_monarch!==right.is_monarch)return left.is_monarch?-1:1;
  if(left.is_heir!==right.is_heir)return left.is_heir?-1:1;
  if(left.succession_rank!==right.succession_rank)return (left.succession_rank??9999)-(right.succession_rank??9999);
  return (right.age??-1)-(left.age??-1)||left.name.localeCompare(right.name,"tr");
}

function childrenOf(view:DynastyView,parentId:string):DynastyMember[]{
  return view.members.filter((member)=>member.mother_id===parentId||member.father_id===parentId).sort(memberOrder);
}

function generationOf(view:DynastyView,member:DynastyMember,memo=new Map<string,number>(),trail=new Set<string>()):number{
  const known=memo.get(member.id);if(known)return known;
  if(trail.has(member.id))return 1;
  const nextTrail=new Set(trail).add(member.id);
  const parents=[member.mother_id,member.father_id]
    .map((id)=>view.members.find((candidate)=>candidate.id===id)).filter((parent):parent is DynastyMember=>Boolean(parent));
  const generation=parents.length?Math.max(...parents.map((parent)=>generationOf(view,parent,memo,nextTrail)))+1:1;
  memo.set(member.id,generation);return generation;
}

function marriageOnly(member:DynastyMember):boolean{
  const relation=member.relation.toLocaleLowerCase("tr-TR");
  if(member.is_monarch)return false;
  return relation.includes("evlilik yoluyla")||relation.endsWith(" eşi")||relation.endsWith(" eş")||
    relation.includes("soylu")||relation.includes("gelini")||relation.includes("damadı")||
    relation.includes("yengesi")||relation.includes("eniştesi")||relation.includes("üvey");
}

function dynastyStats(view:DynastyView){
  const living=view.members.filter((member)=>member.status==="ALIVE");
  const localMarriage=living.filter(marriageOnly);
  const ownIds=new Set(view.members.map((member)=>member.id));
  const externalSpouses=new Set(living.filter((member)=>member.spouse_id&&!ownIds.has(member.spouse_id)&&member.spouse_status!=="DEAD").map((member)=>member.spouse_id!));
  const generations=living.filter((member)=>!marriageOnly(member)).map((member)=>generationOf(view,member));
  return{
    living,dead:view.members.filter((member)=>member.status==="DEAD"),
    bloodLiving:Math.max(0,living.length-localMarriage.length),marriageLiving:localMarriage.length+externalSpouses.size,
    livingGenerations:generations.length?Math.max(...generations):0
  };
}

function spouseText(view:DynastyView,member:DynastyMember):string{
  if(!member.spouse_name)return"Eşi yok";
  const spouse=view.members.find((candidate)=>candidate.id===member.spouse_id);
  const deceased=(spouse?.status??member.spouse_status)==="DEAD"?"† ":"";
  const title=member.spouse_title?member.spouse_title+" ":"";
  const originDynasty=spouse?.birth_dynasty_name??member.spouse_birth_dynasty_name??member.spouse_dynasty_name;
  const originCountry=spouse?.birth_country_name??member.spouse_birth_country_name??member.spouse_country_name;
  const foreignOrigin=originCountry!==null&&(originCountry!==view.country_name||originDynasty!==view.name);
  const origin=foreignOrigin?[originDynasty,originCountry].filter(Boolean).join(" • "):"";
  return deceased+title+member.spouse_name+(member.spouse_age===null?"":" — "+member.spouse_age)+(origin?" ["+origin+"]":"");
}

function coupleAttempt(view:DynastyView,member:DynastyMember):number|null{
  if(!member.spouse_id)return null;
  const first=member.id<member.spouse_id?member.id:member.spouse_id;
  const second=member.id<member.spouse_id?member.spouse_id:member.id;
  return view.birth_attempts.find((attempt)=>attempt.first_member_id===first&&attempt.second_member_id===second)?.last_attempt_turn??null;
}

function attemptStatus(view:DynastyView,member:DynastyMember):string{
  const last=coupleAttempt(view,member);
  if(last===null)return"Son deneme: Yok • Yeni deneme: ✅ Uygun";
  const next=last+BIRTH_ATTEMPT_COOLDOWN_TURNS;
  return "Son deneme: Tur "+last+" • Yeni deneme: "+(view.current_turn>=next?"✅ Uygun":"Tur "+next);
}

function dynastyTreeLines(view:DynastyView):string[]{
  const treeMembers=view.members.filter((member)=>!marriageOnly(member));
  const treeIds=new Set(treeMembers.map((member)=>member.id));
  const roots=treeMembers.filter((member)=>
    ![member.mother_id,member.father_id].some((parentId)=>parentId&&treeIds.has(parentId))
  ).sort(memberOrder);
  const visited=new Set<string>();
  const lines:string[]=[];
  const walk=(member:DynastyMember,prefix:string,connector:string,depth:number,isRoot=false)=>{
    if(visited.has(member.id)||depth>6)return;
    visited.add(member.id);
    const badge=member.is_monarch?"👑 ":member.is_heir?"📜 ":"";
    const spouse=member.spouse_id?view.members.find((candidate)=>candidate.id===member.spouse_id):undefined;
    const marriage=member.spouse_name?" ━━ 💍 "+spouseText(view,member):"";
    lines.push(prefix+(isRoot?"":connector)+badge+memberName(member)+marriage);
    if(spouse&&marriageOnly(spouse))visited.add(spouse.id);
    const children=childrenOf(view,member.id).filter((child)=>!visited.has(child.id));
    const childPrefix=isRoot?prefix:prefix+(connector==="└─ "?"   ":"│  ");
    children.forEach((child,index)=>walk(child,childPrefix,index===children.length-1?"└─ ":"├─ ",depth+1));
  };
  roots.forEach((root,index)=>{walk(root,"","",1,true);if(index<roots.length-1)lines.push("");});
  return lines.length?lines:["Kayıtlı hanedan üyesi bulunmuyor."];
}

function successionMembers(view:DynastyView):DynastyMember[]{
  return view.members.filter((member)=>member.status==="ALIVE"&&!member.is_monarch&&member.succession_rank!==null)
    .sort((left,right)=>(left.succession_rank??9999)-(right.succession_rank??9999));
}

function connectionLines(view:DynastyView):string[]{
  const seen=new Set<string>();const lines:string[]=[];
  for(const member of view.members.filter((candidate)=>candidate.status==="ALIVE"&&candidate.spouse_id)){
    const spouse=view.members.find((candidate)=>candidate.id===member.spouse_id);
    const originCountry=spouse?.birth_country_name??member.spouse_birth_country_name??member.spouse_country_name;
    const originDynasty=spouse?.birth_dynasty_name??member.spouse_birth_dynasty_name??member.spouse_dynasty_name;
    if(!originCountry||originCountry===view.country_name&&originDynasty===view.name)continue;
    const key=[member.id,member.spouse_id].sort().join(":");if(seen.has(key))continue;seen.add(key);
    lines.push("🤝 **"+originCountry+"** • "+(originDynasty??"Hanedan kaydı")+"\n↳ "+member.name+" × "+member.spouse_name);
  }
  return lines;
}

export function dynastyEmbed(view:DynastyView):EmbedBuilder{
  const stats=dynastyStats(view);
  const monarch=stats.living.find((member)=>member.is_monarch);
  const heir=stats.living.find((member)=>member.is_heir);
  const marital=!monarch?.spouse_name?"Bekâr":monarch.spouse_status==="DEAD"?"Dul":"Evli";
  const overview=[
    "**👑 Hanedan Başkanı:** "+(monarch?memberName(monarch):"⚠️ Veraset krizi"),
    "**⚔️ Hükümdar:** "+(monarch?monarch.title+" "+monarch.name:"Belirlenmedi"),
    "**🕊️ Durum:** "+marital,
    "**📜 Tahtın Varisi:** "+(heir?memberName(heir):"Belirlenmedi"),
    "**⚖️ Veraset Sistemi:** Erkek Öncelikli Primogenitür",
    "",
    "**👥 Yaşayan Kan Üyesi:** "+stats.bloodLiving+" • **💍 Evlilik Yoluyla Bağlı:** "+stats.marriageLiving,
    "**⚰️ Ölen Üye:** "+stats.dead.length+" • **🌳 Yaşayan Nesil:** "+stats.livingGenerations
  ].join("\n");
  const embed=new EmbedBuilder().setColor(0xc59b45).setTitle("👑 "+view.country_name.toLocaleUpperCase("tr-TR")+" • "+view.name.toLocaleUpperCase("tr-TR")).setDescription(overview).setImage(dynastyViewAsset("overview").url);
  embed.addFields({name:"🌳 SOY AĞACI",value:fit(dynastyTreeLines(view).join("\n"),900)});
  const succession=successionMembers(view);
  embed.addFields({name:"📜 VERASET",value:fit((monarch?"👑 Tahtta — "+memberName(monarch)+"\n":"")+(succession.length?succession.slice(0,10).map((member)=>"**#"+member.succession_rank+"** "+memberName(member)).join("\n"):"Uygun varis bulunmuyor."),850)});
  const connections=connectionLines(view);
  if(connections.length)embed.addFields({name:"🤝 HANEDAN BAĞLANTILARI",value:fit(connections.join("\n"),750)});
  const recent=view.events.map(recentEventLine).filter((line):line is string=>Boolean(line)).slice(0,8);
  if(recent.length)embed.addFields({name:"🗞️ SON OLAYLAR",value:fit(recent.join("\n"),750)});
  return embed.setFooter({text:"Tur "+view.current_turn+" • Ayrıntı: /hanedan kişi, soyagaci, veraset, evlilikler, cocuklar, olumler, gecmis"});
}

export function dynastyPersonEmbed(view:DynastyView,memberId:string):EmbedBuilder{
  const member=view.members.find((candidate)=>candidate.id===memberId);
  if(!member)throw new GameError("Hanedan üyesi bulunamadı.");
  const children=childrenOf(view,member.id);
  const position=member.is_monarch?"Hükümdar":member.is_heir?"Tahtın Varisi":member.succession_rank!==null?"Taht Sırasında":"Hanedan Üyesi";
  const lines=[
    "**🎂 Yaş:** "+age(member.age),"**"+(member.gender==="MALE"?"♂️":"♀️")+" Cinsiyet:** "+DYNASTY_GENDER_LABELS[member.gender],
    "**❤️ Durum:** "+(member.status==="DEAD"?"Öldü":DYNASTY_HEALTH_LABELS[member.health]),"",
    "**👑 Hanedan:** "+view.name,"**📜 Unvan:** "+member.title,"**🧬 Akrabalık:** "+member.relation,"**👑 Konum:** "+position,
    "**⚖️ Veraset:** "+(member.is_monarch?"Tahtta":member.succession_rank!==null?"#"+member.succession_rank:"Sırada değil"),"",
    "**👨 Baba:** "+(member.father_name??"Kayıt yok"),"**👩 Anne:** "+(member.mother_name??"Kayıt yok"),"",
    "**💍 Eşi:** "+spouseText(view,member),"",
    "**👶 Çocukları:**\n"+(children.length?children.map((child,index)=>(index===children.length-1?"└─ ":"├─ ")+memberName(child)+" "+(child.gender==="MALE"?"♂":"♀")).join("\n"):"└─ Çocuk yok"),"",
    "**📍 Bağlı Devlet:** "+view.country_name,"**🩸 Nesil:** "+generationOf(view,member)+". Nesil"
  ];
  if(member.spouse_id)lines.push("","**👶 Çocuk Denemesi:** "+attemptStatus(view,member));
  return new EmbedBuilder().setColor(member.status==="DEAD"?0x4b4d52:0xc59b45)
    .setTitle("👤 "+memberName(member).toLocaleUpperCase("tr-TR")).setDescription(fit(lines.join("\n"),3900)).setImage(dynastyViewAsset("person").url)
    .setFooter({text:view.country_name+" • "+view.name+" • Tur "+view.current_turn});
}

export function dynastyTreeEmbed(view:DynastyView):EmbedBuilder{
  return new EmbedBuilder().setColor(0x8b6f47).setTitle("🌳 "+view.name.toLocaleUpperCase("tr-TR")+" • SOY AĞACI")
    .setDescription(fit(dynastyTreeLines(view).join("\n"),3900)).setImage(dynastyViewAsset("familyTree").url)
    .setFooter({text:"Yaşayan ve ölen üyeler, eşler ve kayıtlı ebeveyn bağları gösterilir."});
}

export function dynastySuccessionEmbed(view:DynastyView):EmbedBuilder{
  const monarch=view.members.find((member)=>member.status==="ALIVE"&&member.is_monarch);
  const lines=successionMembers(view).map((member)=>"**#"+member.succession_rank+" "+memberName(member)+"**\n↳ "+member.relation);
  return new EmbedBuilder().setColor(0xc59b45).setTitle("📜 "+view.country_name.toLocaleUpperCase("tr-TR")+" • VERASET SIRASI")
    .setDescription("**👑 HÜKÜMDAR**\n"+(monarch?memberName(monarch):"⚠️ Veraset krizi")+"\n\n**📜 TAHT SIRASI**\n\n"+(lines.length?fit(lines.join("\n\n"),3200):"Uygun varis bulunmuyor.")+"\n\n**⚖️ Veraset Yasası:** Erkek Öncelikli Primogenitür\n**📌 Son Güncelleme:** Tur "+view.current_turn)
    .setImage(dynastyViewAsset("succession").url);
}

function marriageEntries(view:DynastyView):Array<{member:DynastyMember;children:DynastyMember[];block:string}>{
  const seen=new Set<string>();const entries:Array<{member:DynastyMember;children:DynastyMember[];block:string}>=[];
  for(const member of view.members.filter((candidate)=>candidate.spouse_id&&candidate.spouse_name)){
    const key=[member.id,member.spouse_id!].sort().join(":");if(seen.has(key))continue;seen.add(key);
    const children=view.members.filter((child)=>[child.mother_id,child.father_id].includes(member.id)&&[child.mother_id,child.father_id].includes(member.spouse_id));
    const block="**"+memberName(member)+"**\n×\n**"+spouseText(view,member)+"**\n"+(children.length?children.map((child,index)=>(index===children.length-1?"└─ ":"├─ ")+memberName(child)).join("\n"):"└─ Çocuk yok");
    entries.push({member,children,block});
  }
  return entries;
}

export function dynastyMarriagesEmbed(view:DynastyView):EmbedBuilder{
  const blocks=marriageEntries(view).map((entry)=>entry.block);const connections=connectionLines(view);
  return new EmbedBuilder().setColor(0xb86b77).setTitle("🤝 "+view.name.toLocaleUpperCase("tr-TR")+" • EVLİLİK BAĞLARI")
    .setDescription(fit(blocks.join("\n\n"),3500)||"Kayıtlı evlilik bulunmuyor.").setImage(dynastyViewAsset("marriages").url)
    .setFooter({text:"Aktif yabancı hanedan bağı: "+connections.length});
}

export function dynastyChildrenEmbed(view:DynastyView):EmbedBuilder{
  const blocks=marriageEntries(view).map((entry)=>entry.block+"\n↳ "+attemptStatus(view,entry.member));
  const childIds=new Set(view.members.filter((member)=>member.mother_id||member.father_id).map((member)=>member.id));
  const couplesWithChildren=new Set(view.members.filter((member)=>member.spouse_id&&childrenOf(view,member.id).length).map((member)=>[member.id,member.spouse_id!].sort().join(":")));
  return new EmbedBuilder().setColor(0x78a7d8).setTitle("👶 "+view.name.toLocaleUpperCase("tr-TR")+" • YENİ NESİL")
    .setDescription(fit(blocks.join("\n\n"),3500)||"Kayıtlı evli çift bulunmuyor.").setImage(dynastyViewAsset("children").url)
    .setFooter({text:"Yaşayan yeni nesil: "+[...childIds].filter((id)=>view.members.find((member)=>member.id===id)?.status==="ALIVE").length+" • Çocuk sahibi çift: "+couplesWithChildren.size});
}

export function dynastyDeathsEmbed(view:DynastyView):EmbedBuilder{
  const dead=view.members.filter((member)=>member.status==="DEAD");
  const blocks=dead.map((member)=>{
    const children=childrenOf(view,member.id);
    return "**† "+member.title+" "+member.name+"**\n"+age(member.age)+" • "+member.relation+"\n"+
      "Çocukları: "+(children.length?children.map((child)=>child.name).join(", "):"Yok")+"\n"+
      "Ölüm: "+(member.death_reason??"Nedeni kaydedilmedi")+(member.died_turn===null?"":" • Tur "+member.died_turn);
  });
  return new EmbedBuilder().setColor(0x4b4d52).setTitle("⚰️ "+view.name.toLocaleUpperCase("tr-TR")+" • ÖLENLER")
    .setDescription(fit(blocks.join("\n\n"),3900)||"Kayıtlı ölüm bulunmuyor.").setImage(dynastyViewAsset("deaths").url);
}

function historyEventLine(event:DynastyView["events"][number]):string|null{
  const details=event.details??{};const basic=recentEventLine(event);
  if(basic)return basic;
  if(event.event_type==="BIRTH_ATTEMPT_FAILED")return "🕯️ Tur "+event.game_turn+": "+String(details.motherName??"Çift")+" için çocuk denemesi başarısız oldu.";
  if(event.event_type==="HEIR_DESIGNATED")return "📜 Tur "+event.game_turn+": **"+String(details.name??"Yeni varis")+"** tahtın varisi ilan edildi.";
  if(event.event_type==="MONARCH_DESIGNATED")return "👑 Tur "+event.game_turn+": **"+String(details.name??"Yeni hükümdar")+"** hükümdar ilan edildi.";
  if(event.event_type==="MEMBER_ADDED")return "👤 Tur "+event.game_turn+": **"+String(details.name??"Yeni üye")+"** hanedana eklendi.";
  if(event.event_type==="DYNASTY_CREATED")return "🏛️ Tur "+event.game_turn+": Hanedan kaydı oluşturuldu.";
  return null;
}

export function dynastyHistoryEmbed(view:DynastyView):EmbedBuilder{
  const lines=view.events.map(historyEventLine).filter((line):line is string=>Boolean(line));
  return new EmbedBuilder().setColor(0x7d6a58).setTitle("🗞️ "+view.name.toLocaleUpperCase("tr-TR")+" • TARİHÇE")
    .setDescription(fit(lines.join("\n\n"),3900)||"Kayıtlı hanedan olayı bulunmuyor.").setImage(dynastyViewAsset("history").url)
    .setFooter({text:"En yeni olaylar üstte gösterilir • Tur "+view.current_turn});
}

export function dynastyStatusEmbed(view:DynastyView):EmbedBuilder{
  const stats=dynastyStats(view);const monarch=stats.living.find((member)=>member.is_monarch);const heir=stats.living.find((member)=>member.is_heir);
  return new EmbedBuilder().setColor(0xc59b45).setTitle("👑 "+view.name.toLocaleUpperCase("tr-TR"))
    .setDescription([
      "**Hükümdar:**\n"+(monarch?memberName(monarch):"Belirlenmedi"),"**Varis:**\n"+(heir?memberName(heir):"Belirlenmedi"),
      "**Yaşayan Kan Üyesi:** "+stats.bloodLiving,"**Evlilik Yoluyla Bağlı:** "+stats.marriageLiving,"**Ölen:** "+stats.dead.length,
      "**Nesil:** "+stats.livingGenerations,"**Taht Sırası:** "+successionMembers(view).length+" kişi","**Yabancı Hanedan Bağı:** "+connectionLines(view).length
    ].join("\n\n")).setImage(dynastyViewAsset("status").url).setFooter({text:view.country_name+" • Tur "+view.current_turn});
}

export async function refreshDynastyCard(client:Client,dynastyId:string):Promise<boolean>{
  const view=await dynastyService.viewById(dynastyId);
  if(!view?.published_channel_id||!view.published_message_id)return false;
  const channel=await client.channels.fetch(view.published_channel_id).catch(()=>null);
  if(!channel?.isTextBased()||channel.isDMBased())return false;
  const message=await channel.messages.fetch(view.published_message_id).catch(()=>null);
  if(!message)return false;
  const asset=dynastyViewAsset("overview");
  const hasBanner=message.attachments.some((attachment)=>attachment.name===asset.name);
  await message.edit({
    embeds:[dynastyEmbed(view)],
    ...(hasBanner?{}:{files:[new AttachmentBuilder(asset.path,{name:asset.name})]})
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
        files:[dynastyViewAttachment("overview")]
      });
    }else if(sub==="kisi"){
      await interaction.editReply({
        embeds:[dynastyPersonEmbed(view,interaction.options.getString("uye",true))],
        files:[dynastyViewAttachment("person")]
      });
    }else if(sub==="soyagaci"||sub==="veraset"||sub==="evlilikler"||sub==="cocuklar"||sub==="olumler"||sub==="gecmis"||sub==="durum"){
      const embed=sub==="soyagaci"?dynastyTreeEmbed(view)
        :sub==="veraset"?dynastySuccessionEmbed(view)
          :sub==="evlilikler"?dynastyMarriagesEmbed(view)
            :sub==="cocuklar"?dynastyChildrenEmbed(view)
              :sub==="olumler"?dynastyDeathsEmbed(view)
                :sub==="gecmis"?dynastyHistoryEmbed(view)
                  :dynastyStatusEmbed(view);
      const bannerKey:DynastyViewBannerKey=sub==="soyagaci"?"familyTree":sub==="veraset"?"succession":sub==="evlilikler"?"marriages":sub==="cocuklar"?"children":sub==="olumler"?"deaths":sub==="gecmis"?"history":"status";
      await interaction.editReply({embeds:[embed],files:[dynastyViewAttachment(bannerKey)]});
    }else if(sub==="cocuk-dene"){
      const result=await dynastyService.attemptBirth({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        parentMemberId:interaction.options.getString("ebeveyn")
      });
      await interaction.editReply({content:birthResultMessage(result),components:birthNameButton(country.id,result)});
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
      if(channel?.isTextBased()&&!channel.isDMBased()){
        const players=await gameService.playerIds(targetCountry.id);
        const notification=playerMentionPayload(players,"**"+targetCountry.name+"** • Oyuncu atanmamış; oyun yöneticisi yanıtlayabilir.");
        const message=await channel.send({
          content:notification.content,allowedMentions:notification.allowedMentions,
          embeds:[marriageProposalEmbed(proposal)],components:marriageProposalButtons(proposal),
          files:[new AttachmentBuilder(DYNASTY_MARRIAGE_BANNER_PATH,{name:DYNASTY_MARRIAGE_BANNER_NAME})]
        }).catch(()=>null);
        if(message)await dynastyService.setMarriageProposalMessage({
          guildId:interaction.guildId,proposalId:proposal.id,channelId:channel.id,messageId:message.id
        });
      }
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
      await refreshMarriageProposalMessage(interaction.client,result.proposal).catch(()=>false);
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
      await refreshMarriageProposalMessage(interaction.client,proposal).catch(()=>false);
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
  if(sub==="cocuk-dene"){
    const result=await dynastyService.attemptBirth({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      parentMemberId:interaction.options.getString("ebeveyn",true),allowAnyMarriedMember:true
    });
    await interaction.editReply({content:birthResultMessage(result),components:birthNameButton(country.id,result)});
    await refreshDynastyCard(interaction.client,view.id);
    return true;
  }
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
      files:[dynastyViewAttachment("overview")]
    });
    await dynastyService.setPublishedMessage({dynastyId:view.id,channelId:channel.id,messageId:message.id});
    await interaction.editReply("✅ Hanedan formu bu kanalda yayımlandı. Doğum, ölüm ve yönetici değişikliklerinde otomatik güncellenecek.");
    return true;
  }
  await refreshDynastyCard(interaction.client,view.id);
  return true;
}

export async function handleDynastyButton(interaction:ButtonInteraction):Promise<boolean>{
  if(interaction.customId.startsWith("dynasty_birth_name|")){
    const [,countryId,pendingBirthId]=interaction.customId.split("|");
    if(!interaction.guildId||!countryId||!pendingBirthId)throw new GameError("Doğum isimlendirme düğmesi geçersiz.");
    const modal=new ModalBuilder()
      .setCustomId("dynasty_birth_modal|"+countryId+"|"+pendingBirthId)
      .setTitle("Hanedan Çocuğuna İsim Ver")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("child_name").setLabel("Çocuğun adı")
          .setPlaceholder("Örn. Alexandros").setStyle(TextInputStyle.Short)
          .setMinLength(2).setMaxLength(80).setRequired(true)
      ));
    await interaction.showModal(modal);
    return true;
  }
  const marriageMatch=/^dynasty_marriage_(accept|reject)\|(.+)$/.exec(interaction.customId);
  if(!marriageMatch)return false;
  if(!interaction.guildId)throw new GameError("Sunucu bulunamadı.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const decision=marriageMatch[1]==="accept"?"ACCEPT":"REJECT";
  const proposal=await dynastyService.marriageProposalById(interaction.guildId,marriageMatch[2]!);
  if(proposal.status!=="PENDING")throw new GameError("Bu evlilik teklifi daha önce sonuçlandırılmış.");
  if(!isGameMaster(interaction)){
    const country=await gameService.countryForUser(interaction.guildId,interaction.user.id);
    if(!country||country.id!==proposal.target_country_id)
      throw new GameError("Bu evlilik teklifini yalnızca hedef devletin oyuncuları veya oyun yöneticisi yanıtlayabilir.");
  }
  const result=await dynastyService.respondMarriage({
    guildId:interaction.guildId,responderCountryId:proposal.target_country_id,proposalId:proposal.id,
    actorId:interaction.user.id,decision
  });
  const accepted=decision==="ACCEPT";
  await interaction.message.edit({
    embeds:[marriageProposalEmbed(result.proposal)],components:marriageProposalButtons(result.proposal)
  }).catch(()=>undefined);
  for(const dynastyId of result.dynastyIds)await refreshDynastyCard(interaction.client,dynastyId).catch(()=>false);
  await interaction.editReply(accepted
    ?"✅ Teklif kabul edildi. **"+result.proposal.proposer_member_name+"** ile **"+result.proposal.target_member_name+"** evlendi."
    :"❌ Evlilik teklifi reddedildi.");
  return true;
}

export async function handleDynastyModal(interaction:ModalSubmitInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("dynasty_birth_modal|"))return false;
  const [,countryId,pendingBirthId]=interaction.customId.split("|");
  if(!interaction.guildId||!countryId||!pendingBirthId)throw new GameError("Doğum isimlendirme formu geçersiz.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const result=await dynastyService.nameBirth({
    guildId:interaction.guildId,countryId,actorId:interaction.user.id,pendingBirthId,
    childName:interaction.fields.getTextInputValue("child_name"),allowManager:isGameMaster(interaction)
  });
  const gender=result.childGender==="MALE"?"erkek":"kız";
  await interaction.editReply("👶 **"+result.childName+"** adlı "+gender+" çocuk hanedana kaydedildi.\n"+
    "Anne: **"+result.motherName+"** • Baba: **"+result.fatherName+"**");
  if(interaction.message?.editable)await interaction.message.edit({components:[]}).catch(()=>undefined);
  await refreshDynastyCard(interaction.client,result.dynastyId);
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
    const candidates=(view?.members??[]).filter((member)=>{
      if(member.status!=="ALIVE"||!member.spouse_id)return false;
      if(interaction.commandName==="hanedan-yonetim")return true;
      return member.id!==monarch?.id&&(member.mother_id===monarch?.id||member.father_id===monarch?.id);
    });
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
    }else if(sub==="kisi"&&focused.name==="uye"){
      const requested=interaction.options.getString("ulke");
      country=requested&&isGameMaster(interaction)
        ?await gameService.countryByName(interaction.guildId,requested)
        :await gameService.countryForUser(interaction.guildId,interaction.user.id);
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
