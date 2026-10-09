import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags,ModalBuilder,StringSelectMenuBuilder,
  TextInputBuilder,TextInputStyle,type AutocompleteInteraction,type ButtonInteraction,type ChatInputCommandInteraction,type Client,
  type ModalSubmitInteraction,type StringSelectMenuInteraction
} from "discord.js";
import {
  ROMAN_BALLOT_INFLUENCE_CAP,ROMAN_BUSINESSES,ROMAN_CANDIDACY_INFLUENCE_COST,
  ROMAN_GOVERNOR_NET_INCOME_PERCENT,ROMAN_OFFICES,ROMAN_RELATION_ACTIONS,ROMAN_SENATE_PROPOSALS,isRomanBusinessType,
  type RomanOfficeKey,type RomanProposalType,type RomanRelationAction
} from "../domain/roman-republic.js";
import { gold,number } from "../domain/format.js";
import {MINIMUM_MARRIAGE_AGE} from "../domain/dynasty.js";
import { gameService,GameError } from "../services/game-service.js";
import { romanRepublicService,type RomanFamilyView,type RomanRepublicView } from "../services/roman-republic-service.js";
import {romanFamilyLifeService,type RomanFamilyBirthAttemptResult,type RomanFamilyMarriageProposalView} from "../services/roman-family-life-service.js";
import {romanPoliticsService,type RomanPoliticsView} from "../services/roman-politics-service.js";
import { isGameMaster,requireGameMaster } from "./auth.js";
import {romanViewAsset,type RomanViewBannerKey} from "./assets.js";
import {renderRomanSenateChart,romanSenateLegend} from "./roman-senate-chart.js";
import {playerMentionPayload} from "./player-mentions.js";

const SENATE_CHART_NAME="roman-senate-seats.png";

function romanFiles(...keys:RomanViewBannerKey[]):AttachmentBuilder[]{
  return [...new Set(keys)].map((key)=>{const asset=romanViewAsset(key);return new AttachmentBuilder(asset.path,{name:asset.name});});
}

function senateChartFile(view:RomanRepublicView):AttachmentBuilder{
  return new AttachmentBuilder(renderRomanSenateChart(view.families),{name:SENATE_CHART_NAME});
}

function familyIncome(family:RomanFamilyView):number{
  return family.businesses.reduce((sum,business)=>sum+business.turnIncome,0)+(family.isConsulFamily?500:0);
}

function marriageProposalEmbed(proposal:RomanFamilyMarriageProposalView):EmbedBuilder{
  const pending=proposal.status==="PENDING";
  const accepted=proposal.status==="ACCEPTED";
  const title=pending?"💍 Roma Aile Evliliği Teklifi":accepted?"✅ Roma Aile Evliliği Kabul Edildi"
    :proposal.status==="REJECTED"?"❌ Roma Aile Evliliği Reddedildi":"↩️ Roma Aile Evliliği Teklifi Geri Çekildi";
  const status=pending
    ?`**${proposal.target_family_name}** ailesinin yöneticisi veya oyun yöneticisi aşağıdaki düğmelerden cevap verebilir.`
    :accepted?"Teklif kabul edildi ve evlilik iki aileye işlendi."
      :proposal.status==="REJECTED"?"Teklif hedef aile tarafından reddedildi.":"Teklif sahibi tarafından geri çekildi.";
  return new EmbedBuilder().setColor(pending?0xc59b45:accepted?0x4f9d69:proposal.status==="REJECTED"?0xa33b3b:0x747f8d).setTitle(title)
    .setDescription([
      `**${proposal.proposer_family_name}** ailesinden **${proposal.proposer_member_name}**`,
      `**${proposal.target_family_name}** ailesinden **${proposal.target_member_name}** ile evlenmek üzere teklif edildi.`,
      "",status
    ].join("\n")).setImage(romanViewAsset("family").url);
}

function marriageProposalButtons(proposal:RomanFamilyMarriageProposalView):ActionRowBuilder<ButtonBuilder>[] {
  if(proposal.status!=="PENDING")return[];
  return[new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`roman-marriage-accept|${proposal.id}`).setLabel("Kabul Et").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`roman-marriage-reject|${proposal.id}`).setLabel("Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
  )];
}

async function refreshMarriageProposalMessage(client:Client,proposal:RomanFamilyMarriageProposalView):Promise<boolean>{
  if(!proposal.public_channel_id||!proposal.public_message_id)return false;
  const channel=await client.channels.fetch(proposal.public_channel_id).catch(()=>null);
  if(!channel?.isTextBased()||channel.isDMBased())return false;
  const message=await channel.messages.fetch(proposal.public_message_id).catch(()=>null);
  if(!message)return false;
  await message.edit({embeds:[marriageProposalEmbed(proposal)],components:marriageProposalButtons(proposal)});
  return true;
}

function birthResultMessage(result:RomanFamilyBirthAttemptResult):string{
  const roll=`🎲 **1d20:** ${result.attemptRoll}${result.ageModifier>=0?" + ":" - "}${Math.abs(result.ageModifier)} = **${result.attemptRoll+result.ageModifier}**`;
  if(!result.success)return `${roll}\n❌ **${result.motherName}** ile **${result.fatherName}** için çocuk denemesi başarısız oldu.`;
  const gender=result.childGender==="MALE"?"Erkek":"Kız";
  const complication=result.complication==="DEATH"?`⚰️ ${result.motherName} doğum sırasında hayatını kaybetti.`
    :result.complication==="ILLNESS"?`🩺 ${result.motherName} hastalandı ve 3 tur yeni gebelik deneyemeyecek.`
      :"✅ Doğum sorunsuz tamamlandı.";
  return `${roll}\n👶 Doğum başarılı • **${gender} çocuk**\n${complication}\nÇocuğun adını aşağıdaki düğmeyle belirleyin.`;
}

function birthNameButton(countryId:string,result:RomanFamilyBirthAttemptResult):ActionRowBuilder<ButtonBuilder>[] {
  if(!result.success||!result.pendingBirthId)return[];
  return[new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`roman-birth-name|${countryId}|${result.pendingBirthId}`).setLabel("Çocuğa Ad Ver").setEmoji("👶").setStyle(ButtonStyle.Primary)
  )];
}

function statusEmbed(view:RomanRepublicView):EmbedBuilder{
  const consul=view.families.find((family)=>family.isConsulFamily);
  const allocatedSeats=view.families.reduce((sum,family)=>sum+family.senateSeats,0);
  const familyLines=view.families.map((family,index)=>{
    const head=family.members.find((member)=>member.position==="HEAD");
    const portfolio=family.businesses.length
      ?family.businesses.map((business)=>ROMAN_BUSINESSES[business.type].emoji+" "+ROMAN_BUSINESSES[business.type].label).join(", ")
      :"İşletme yok";
    return `${index+1}. ${family.isConsulFamily?"🏛️ ":""}**${family.name}** — 🏅 ${number(family.politicalInfluence)} nüfuz • 🪑 ${number(family.senateSeats)} koltuk\n`+
      `↳ 🏦 ${gold(family.treasury)} • İtibar ${family.reputation}/100 • Skandal ${family.scandal}/100 • ${family.politicalBloc}\n`+
      `↳ Tur geliri **${gold(familyIncome(family))}** • ${head?`Yönetici ${head.name}`:"Yönetici kaydı yok"} • ${portfolio}`;
  });
  return new EmbedBuilder()
    .setColor(0x8b1e24)
    .setTitle(`🏛️ ${view.countryName} • Roma Cumhuriyeti`)
    .setDescription([
      `**Mevcut Konsül Ailesi:** ${consul?consul.name:"Henüz belirlenmedi"}`,
      `**Görev Dönemi:** ${view.termStartedTurn===null?"Başlamadı":`Tur ${view.termStartedTurn}–${(view.nextElectionTurn??view.termStartedTurn)-1}`}`,
      `**Sonraki Seçim:** ${view.nextElectionTurn===null?"Belirlenmedi":`Tur ${view.nextElectionTurn}`} • Dönem uzunluğu: **${view.termLength} tur**`,
      `**Senato:** ${number(allocatedSeats)}/${number(view.senateTotalSeats)} koltuk dolu • Aile başına en fazla **${number(view.familySeatCap)}**`,
      view.election?.status==="OPEN"?`🗳️ **${view.election.sequence}. Konsül Seçimi açık** • Oyların son turu: **${view.election.closesTurn}**`:"",
      "",
      "**Roma Siyasi Aileleri**",
      familyLines.join("\n\n")||"Henüz siyasi aile kurulmadı."
    ].join("\n").slice(0,4000))
    .setImage(romanViewAsset("republic").url)
    .setFooter({text:"Aile hazineleri devletten ayrıdır. Senato koltukları her konsül seçimi sonunda siyasi performansa göre 3–35 sınırında yenilenir."});
}

function familyEmbed(view:RomanRepublicView,family:RomanFamilyView):EmbedBuilder{
  const rows=family.businesses.map((business)=>{
    const definition=ROMAN_BUSINESSES[business.type];
    return `${definition.emoji} **${definition.label}** — ${business.settlementName}\n↳ Tur geliri ${gold(business.turnIncome)} • Tur ${business.acquiredTurn}`;
  });
  const memberRows=family.members.map((member)=>{
    const links=[member.spouseName?`Eş: ${member.spouseName}`:"",member.motherName?`Anne: ${member.motherName}`:"",member.fatherName?`Baba: ${member.fatherName}`:""]
      .filter(Boolean).join(" • ");
    return `${member.gender==="MALE"?"👨":"👩"} **${member.name}** — ${member.age} yaş • ${member.relation}${links?`\n↳ ${links}`:""}`;
  });
  return new EmbedBuilder()
    .setColor(family.isConsulFamily?0xc59b45:0x5865f2)
    .setTitle(`${family.isConsulFamily?"🏛️":"🏺"} ${family.name} • Aile Mülkü`)
    .addFields(
      {name:"🏦 Aile Hazinesi",value:gold(family.treasury),inline:true},
      {name:"🏅 Siyasi Nüfuz",value:number(family.politicalInfluence),inline:true},
      {name:"🪑 Senato Koltuğu",value:number(family.senateSeats),inline:true},
      {name:"🏛️ Siyasi Kimlik",value:`${family.politicalBloc}\nİtibar **${family.reputation}/100** • Skandal **${family.scandal}/100**`},
      {name:"👥 Aile Oyuncuları",value:family.playerIds.length?family.playerIds.map((id)=>`<@${id}>${id===family.leaderUserId?" • Lider":""}`).join("\n"):"Oyuncu atanmamış."},
      {name:"🌿 Aile Üyeleri",value:(memberRows.join("\n\n")||"Bu siyasi aile için henüz karakter kadrosu girilmemiş.").slice(0,1024)},
      {name:"💰 Tur Başına Kazanım",value:`İşletmeler: **${gold(family.businesses.reduce((sum,item)=>sum+item.turnIncome,0))}**${family.isConsulFamily?"\nKonsül ödeneği: **"+gold(500)+"**":""}`},
      {name:"🏪 İşletme Portföyü",value:(rows.join("\n\n")||"Bu ailenin işletmesi bulunmuyor.").slice(0,1024)}
    )
    .setImage(romanViewAsset("family").url)
    .setFooter({text:"İşletme satın alımını aile lideri yapar; bedel aile hazinesinden kesilir."});
}

function catalogEmbed():EmbedBuilder{
  return new EmbedBuilder().setColor(0x9b6b30).setTitle("🏪 Roma • Satın Alınabilir İşletmeler")
    .setDescription((Object.entries(ROMAN_BUSINESSES).map(([,business])=>
      `${business.emoji} **${business.label}**\n`+
      `↳ Alım ${gold(business.purchaseCost)} • Her tur ${gold(business.turnIncome)} • +${business.influenceOnPurchase} nüfuz • Aile sınırı ${business.familyLimit}\n`+
      `_${business.description}_`
    ).join("\n\n")).slice(0,4000))
    .setImage(romanViewAsset("business").url)
    .setFooter({text:"Siyasi nüfuz; adaylıkta, seçim desteğinde ve Roma iç siyasetinde harcanır."});
}

function electionEmbed(view:RomanRepublicView):EmbedBuilder{
  const election=view.election;
  if(!election)return new EmbedBuilder().setColor(0x6b7280).setTitle(`🗳️ ${view.countryName} • Konsül Seçimi`)
    .setDescription("Henüz seçim kaydı bulunmuyor.").setImage(romanViewAsset("election").url);
  const winner=election.winnerFamilyId?view.families.find((family)=>family.id===election.winnerFamilyId):null;
  const candidateLines=election.candidates.map((candidate,index)=>{
    const total=candidate.seatWeight+candidate.influenceSupport;
    return `${index+1}. **${candidate.candidateName}** — ${candidate.familyName}\n`+
      `↳ ${candidate.votes} aile • ${candidate.seatWeight} koltuk oyu • +${candidate.influenceSupport} nüfuz • **${total} toplam ağırlık**`;
  });
  return new EmbedBuilder().setColor(election.status==="OPEN"?0xd4a72c:0x3f7f5f)
    .setTitle(`🗳️ ${view.countryName} • ${election.sequence}. Konsül Seçimi`)
    .setDescription([
      `**Durum:** ${election.status==="OPEN"?"Oy kullanımı açık":election.status==="COMPLETED"?"Sonuçlandı":"İptal edildi"}`,
      `**Seçim Takvimi:** Tur ${election.startedTurn}–${election.closesTurn}`,
      winner?`**Kazanan Aile:** ${winner.name}`:"",
      "",
      candidateLines.join("\n\n")||"Henüz aday gösterilmedi.",
      "",
      `Adaylık bedeli **${ROMAN_CANDIDACY_INFLUENCE_COST} nüfuzdur**. Her aile bir kez oy verir; oy ağırlığı Senato koltuğu (koltuksuz ailede 1) + harcanan 0–${ROMAN_BALLOT_INFLUENCE_CAP} nüfuzdur.`
    ].filter(Boolean).join("\n").slice(0,4000))
    .setImage(romanViewAsset("election").url)
    .setFooter({text:`Oy kullanan aile: ${election.votedFamilyIds.length}/${view.families.length} • Verilen oy değiştirilemez.`});
}

function governorshipEmbed(view:RomanRepublicView):EmbedBuilder{
  const active=view.governorships.filter((item)=>item.status==="ACTIVE");
  const history=view.governorships.filter((item)=>item.status!=="ACTIVE").slice(0,8);
  const line=(item:(typeof view.governorships)[number])=>
    `🏺 **${item.settlementName}** — ${item.governorName}\n`+
    `↳ ${item.familyName} • Tur ${item.appointedTurn}–${item.endTurn} • Biriken ${gold(item.totalTreasuryIncome)} / +${item.totalInfluence} nüfuz`;
  return new EmbedBuilder().setColor(0x9b6b30).setTitle(`🏺 ${view.countryName} • Roma Valilikleri`)
    .setDescription([
      "**Etkin Valilikler**",
      active.map(line).join("\n\n")||"Etkin vali bulunmuyor.",
      history.length?"\n**Yakın Dönem Kayıtları**":"",
      history.map((item)=>`${item.status==="COMPLETED"?"✅":"⛔"} ${line(item)}`).join("\n\n")
    ].filter(Boolean).join("\n").slice(0,4000))
    .setImage(romanViewAsset("governorship").url)
    .setFooter({text:`Valilik 6 tur sürer; her tur +1 nüfuz, Alım Turunda pozitif net şehir gelirinin %${ROMAN_GOVERNOR_NET_INCOME_PERCENT}'i aile hazinesine aktarılır.`});
}

function influenceLedgerEmbed(familyName:string,entries:Array<{turn:number;delta:number;description:string}>):EmbedBuilder{
  return new EmbedBuilder().setColor(0x7c5cbb).setTitle(`🏅 ${familyName} • Siyasi Nüfuz Defteri`)
    .setDescription((entries.map((entry)=>
      `• **Tur ${entry.turn}** — ${entry.delta>=0?"+":""}${entry.delta} • ${entry.description}`
    ).join("\n")||"Henüz siyasi nüfuz hareketi bulunmuyor.").slice(0,4000)).setImage(romanViewAsset("family").url);
}

function senateEmbed(view:RomanPoliticsView,families:RomanFamilyView[]=[]):EmbedBuilder{
  const open=view.proposals.filter((proposal)=>proposal.status==="OPEN");
  const recent=view.proposals.filter((proposal)=>proposal.status!=="OPEN").slice(0,5);
  const proposalLine=(proposal:(typeof view.proposals)[number])=>{
    const votes=proposal.votes.map((vote)=>`${vote.choice==="YES"?"✅":vote.choice==="NO"?"❌":"➖"} ${vote.familyName}: ${vote.totalWeight}`+
      `${vote.influenceSpent?` (+${vote.influenceSpent} nüfuz)`:""}${vote.npcScore===null?"":` • NPC eğilim ${vote.npcScore>=0?"+":""}${vote.npcScore}`}`).join(" • ");
    return `**${proposal.title}** — ${proposal.proposerFamilyName}\n`+
      `↳ ${proposal.description}\n↳ Eşik %${proposal.thresholdPercent} • Son Tur ${proposal.closesTurn}`+
      `${proposal.targetFamilyName?` • Hedef ${proposal.targetFamilyName}`:""}\n↳ ${votes||"Henüz oy kullanılmadı."}`;
  };
  const laws=view.laws.filter((law)=>law.status==="ACTIVE").map((law)=>
    `📜 **${law.title}** — Tur ${law.startedTurn}–${law.endTurn}`
  );
  const embed=new EmbedBuilder().setColor(0x8b1e24).setTitle(`🏛️ ${view.countryName} • Roma Senatosu`)
    .setDescription([
      "**Açık Teklifler**",open.map(proposalLine).join("\n\n")||"Açık teklif bulunmuyor.",
      "\n**Yürürlükteki Yasalar**",laws.join("\n")||"Yürürlükte yasa bulunmuyor.",
      recent.length?"\n**Sonuçlanan Son Teklifler**":"",
      recent.map((proposal)=>`${proposal.status==="PASSED"?"✅":"❌"} **${proposal.title}** — ${proposal.yesWeight}/${proposal.noWeight}`).join("\n")
    ].filter(Boolean).join("\n").slice(0,4000));
  if(families.length)embed.addFields({name:"🪑 100 Koltuklu Senato",value:romanSenateLegend(families).slice(0,1024)}).setImage(`attachment://${SENATE_CHART_NAME}`);
  return embed.setFooter({text:"NPC aileler; ilişki, güven, rekabet, hizip uyumu, öneren ailenin itibarı ve skandalına göre oy verir."});
}

function officesEmbed(view:RomanPoliticsView):EmbedBuilder{
  const rows=view.offices.map((office)=>{
    const definition=ROMAN_OFFICES[office.officeKey];
    return `${office.status==="ACTIVE"?"🏺":"📜"} **${definition.label} — ${office.characterName}**\n`+
      `↳ ${office.familyName} • Tur ${office.startedTurn}–${office.endTurn} • ${office.status==="ACTIVE"?"Görevde":"Tamamlandı"}`;
  });
  return new EmbedBuilder().setColor(0x9b6b30).setTitle(`🏺 ${view.countryName} • Cursus Honorum`)
    .setDescription((rows.join("\n\n")||"Henüz Roma makamı kaydı bulunmuyor.").slice(0,4000))
    .setImage(romanViewAsset("offices").url)
    .setFooter({text:"Quaestor → Aedilis/Praetor → Censor kariyer yolu karakter bazında takip edilir."});
}

function relationsEmbed(view:RomanPoliticsView,family:RomanFamilyView|null,gameMaster:boolean):EmbedBuilder{
  const source=gameMaster||!family?view.relations:view.relations.filter((relation)=>relation.familyAId===family.id||relation.familyBId===family.id);
  const rows=source.map((relation)=>{
    const state=relation.score>=50?"Müttefik":relation.score>=15?"Dostane":relation.score<=-50?"Düşman":relation.score<=-15?"Gergin":"Nötr";
    return `${relation.score>=15?"🤝":relation.score<=-15?"⚔️":"⚖️"} **${relation.familyAName} ↔ ${relation.familyBName}** — ${state}\n`+
      `↳ İlişki ${relation.score} • Güven ${relation.trust} • Rekabet ${relation.rivalry}${relation.lastReason?` • Son: ${relation.lastReason}`:""}`;
  });
  return new EmbedBuilder().setColor(0x5865f2).setTitle(`🤝 ${view.countryName} • Aile İlişkileri`)
    .setDescription((rows.join("\n\n")||"Aile ilişkisi bulunmuyor.").slice(0,4000)).setImage(romanViewAsset("family").url);
}

function standingsEmbed(view:RomanRepublicView):EmbedBuilder{
  return new EmbedBuilder().setColor(0x7c5cbb).setTitle(`🏅 ${view.countryName} • Aile İtibarı ve Skandallar`)
    .setDescription(view.families.map((family,index)=>
      `${index+1}. **${family.name}** — ${family.politicalBloc}\n↳ İtibar **${family.reputation}/100** • Skandal **${family.scandal}/100** • Nüfuz ${family.politicalInfluence}`
    ).join("\n\n").slice(0,4000)).setImage(romanViewAsset("family").url);
}

function electionComponents(view:RomanRepublicView):ActionRowBuilder<StringSelectMenuBuilder>[] {
  if(view.election?.status!=="OPEN"||!view.election.candidates.length)return[];
  return[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`roman-vote-pick|${view.countryId}`)
      .setPlaceholder("Konsül adayını seç")
      .addOptions(view.election.candidates.slice(0,25).map((candidate)=>({
        label:candidate.candidateName.slice(0,100),
        description:`${candidate.familyName} • ${candidate.seatWeight+candidate.influenceSupport} mevcut oy ağırlığı`.slice(0,100),
        value:candidate.id
      })))
  )];
}

function familySelectComponents(view:RomanRepublicView):ActionRowBuilder<StringSelectMenuBuilder>[] {
  if(!view.families.length)return[];
  return[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`roman-family-pick|${view.countryId}`)
      .setPlaceholder("Roma siyasi ailesini seç")
      .addOptions(view.families.slice(0,25).map((family)=>(
        {
          label:family.name.slice(0,100),
          description:`${family.senateSeats} koltuk • ${family.politicalInfluence} nüfuz • ${family.politicalBloc}`.slice(0,100),
          value:family.id,
          emoji:family.isConsulFamily?"🏛️":"🏺"
        }
      )))
  )];
}

function voteSupportComponents(countryId:string,candidateId:string):ActionRowBuilder<ButtonBuilder>{
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[0,2,5,10].map((amount)=>new ButtonBuilder()
      .setCustomId(`roman-vote|${countryId}|${candidateId}|${amount}`)
      .setLabel(amount?`Oy Ver • ${amount} Nüfuz`:"Oy Ver • Nüfuz Harcama")
      .setStyle(amount>=5?ButtonStyle.Primary:amount?ButtonStyle.Secondary:ButtonStyle.Success))
  );
}

function senateProposalComponents(view:RomanPoliticsView):ActionRowBuilder<StringSelectMenuBuilder>[] {
  const proposals=view.proposals.filter((proposal)=>proposal.status==="OPEN").slice(0,25);
  if(!proposals.length)return[];
  return[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`roman-senate-pick|${view.countryId}`)
      .setPlaceholder("Oylanacak Senato teklifini seç")
      .addOptions(proposals.map((proposal)=>({
        label:proposal.title.slice(0,100),
        description:`${proposal.proposerFamilyName} • eşik %${proposal.thresholdPercent} • son tur ${proposal.closesTurn}`.slice(0,100),
        value:proposal.id
      })))
  )];
}

function senateVoteComponents(countryId:string,proposalId:string):ActionRowBuilder<ButtonBuilder>[] {
  const row=(choice:"YES"|"NO",style:ButtonStyle)=>new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[0,2,5,10].map((amount)=>new ButtonBuilder()
      .setCustomId(`roman-senate-vote|${countryId}|${proposalId}|${choice}|${amount}`)
      .setLabel(`${choice==="YES"?"Evet":"Hayır"} • ${amount?`${amount} Nüfuz`:"Nüfuz Yok"}`)
      .setStyle(style))
  );
  return[
    row("YES",ButtonStyle.Success),
    row("NO",ButtonStyle.Danger),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`roman-senate-vote|${countryId}|${proposalId}|ABSTAIN|0`)
        .setLabel("Çekimser Kal").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function publicOverviewEmbed(view:RomanRepublicView):EmbedBuilder{
  const consul=view.families.find((family)=>family.isConsulFamily);
  const allocated=view.families.reduce((sum,family)=>sum+family.senateSeats,0);
  return new EmbedBuilder().setColor(0x8b1e24).setTitle(`🏛️ ${view.countryName} • Cumhuriyet Meydanı`)
    .setDescription([
      `**Konsül Ailesi:** ${consul?.name??"Henüz belirlenmedi"}`,
      `**Görev Dönemi:** ${view.termStartedTurn===null?"Başlamadı":`Tur ${view.termStartedTurn}–${(view.nextElectionTurn??view.termStartedTurn)-1}`}`,
      `**Sonraki Seçim:** ${view.nextElectionTurn===null?"Belirlenmedi":`Tur ${view.nextElectionTurn}`}`,
      `**Senato:** ${allocated}/${view.senateTotalSeats} koltuk • **Güncel Tur:** ${view.currentTurn}`,
      view.election?.status==="OPEN"?`🗳️ **${view.election.sequence}. Konsül Seçimi açık** • Son oy turu ${view.election.closesTurn}`:""
    ].filter(Boolean).join("\n"))
    .setImage(romanViewAsset("republic").url)
    .setFooter({text:"Bu panel tur, seçim, teklif ve koltuk değişimlerinde otomatik yenilenir."});
}

function publicSenateEmbed(view:RomanPoliticsView,families:RomanFamilyView[]):EmbedBuilder{
  const open=view.proposals.filter((proposal)=>proposal.status==="OPEN");
  const laws=view.laws.filter((law)=>law.status==="ACTIVE");
  return new EmbedBuilder().setColor(0x8b1e24).setTitle("🏛️ Senato • 100 Koltuk")
    .setDescription([
      "**Açık Teklifler**",
      open.map((proposal)=>`• **${proposal.title}** — ${proposal.proposerFamilyName} • Eşik %${proposal.thresholdPercent} • Son Tur ${proposal.closesTurn}\n`+
        `  Evet ${proposal.yesWeight} • Hayır ${proposal.noWeight} • Çekimser ${proposal.abstainFamilies}`).join("\n")||"Açık teklif bulunmuyor.",
      "",
      "**Yürürlükteki Yasalar**",
      laws.map((law)=>`• ${law.title} • Tur ${law.startedTurn}–${law.endTurn}`).join("\n")||"Yürürlükte yasa bulunmuyor."
    ].join("\n").slice(0,2200))
    .addFields({name:"🎨 Aile Renkleri",value:romanSenateLegend(families).slice(0,1024)})
    .setImage(`attachment://${SENATE_CHART_NAME}`)
    .setFooter({text:"Her renk bir siyasi aileyi, her daire bir Senato koltuğunu temsil eder."});
}

function publicElectionEmbed(view:RomanRepublicView):EmbedBuilder|null{
  const election=view.election;
  if(!election)return null;
  const candidates=election.candidates.map((candidate,index)=>
    `${index+1}. **${candidate.candidateName}** — ${candidate.familyName} • ${candidate.seatWeight+candidate.influenceSupport} ağırlık`
  ).join("\n");
  return new EmbedBuilder().setColor(election.status==="OPEN"?0xd4a72c:0x3f7f5f)
    .setTitle(`🗳️ ${election.sequence}. Konsül Seçimi`)
    .setDescription([
      `**Durum:** ${election.status==="OPEN"?"Oy kullanımı açık":election.status==="COMPLETED"?"Sonuçlandı":"İptal edildi"}`,
      `**Takvim:** Tur ${election.startedTurn}–${election.closesTurn}`,
      candidates||"Henüz aday bulunmuyor."
    ].join("\n").slice(0,1500))
    .setImage(romanViewAsset("election").url);
}

function publicPanelComponents(view:RomanRepublicView,politics:RomanPoliticsView):Array<ActionRowBuilder<ButtonBuilder>|ActionRowBuilder<StringSelectMenuBuilder>>{
  const rows:Array<ActionRowBuilder<ButtonBuilder>|ActionRowBuilder<StringSelectMenuBuilder>>=[];
  rows.push(...familySelectComponents(view),...electionComponents(view),...senateProposalComponents(politics));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`roman-public-refresh|${view.countryId}`).setLabel("Paneli Yenile")
      .setEmoji("🔄").setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

async function publicPanelPayload(guildId:string,countryId:string){
  const view=await romanRepublicService.view(guildId,countryId);
  if(!view)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
  const politics=await romanPoliticsService.view(guildId,countryId);
  const embeds=[publicOverviewEmbed(view),publicSenateEmbed(politics,view.families)];
  const files=[...romanFiles("republic"),senateChartFile(view)];
  const publicElection=publicElectionEmbed(view);
  if(publicElection){embeds.push(publicElection);files.push(...romanFiles("election"));}
  return{view,embeds,files,components:publicPanelComponents(view,politics)};
}

export async function syncRomanPublicPanel(client:Client,guildId:string,countryId:string):Promise<boolean>{
  const payload=await publicPanelPayload(guildId,countryId);
  if(!payload.view.politicsChannelId)return false;
  const channel=await client.channels.fetch(payload.view.politicsChannelId).catch(()=>null);
  if(!channel?.isTextBased()||channel.isDMBased()||!channel.isSendable()||!("messages" in channel))return false;
  const existing=payload.view.politicsMessageId
    ?await channel.messages.fetch(payload.view.politicsMessageId).catch(()=>null)
    :null;
  const message=existing
    ?await existing.edit({embeds:payload.embeds,components:payload.components,files:payload.files,attachments:[]})
    :await channel.send({embeds:payload.embeds,components:payload.components,files:payload.files});
  if(message.id!==payload.view.politicsMessageId){
    await romanRepublicService.setPoliticsMessage({guildId,countryId,channelId:payload.view.politicsChannelId,messageId:message.id});
  }
  return true;
}

export async function removeRomanPublicPanel(client:Client,view:RomanRepublicView):Promise<void>{
  if(!view.politicsChannelId||!view.politicsMessageId)return;
  const channel=await client.channels.fetch(view.politicsChannelId).catch(()=>null);
  if(!channel?.isTextBased()||channel.isDMBased()||!("messages" in channel))return;
  const message=await channel.messages.fetch(view.politicsMessageId).catch(()=>null);
  await message?.delete().catch(()=>undefined);
}

export async function refreshRomanPublicPanels(client:Client,guildId:string):Promise<number>{
  const targets=await romanRepublicService.publicPanelTargets(guildId);
  let updated=0;
  for(const target of targets){
    try{
      if(await syncRomanPublicPanel(client,guildId,target.countryId))updated+=1;
    }catch(error){
      console.error("Roma kamu paneli yenilenemedi",{guildId,countryId:target.countryId,error});
    }
  }
  return updated;
}

async function requiredView(interaction:{guildId:string|null},countryId:string):Promise<RomanRepublicView>{
  const view=await romanRepublicService.view(interaction.guildId!,countryId);
  if(!view)throw new GameError("Bu devlet için Roma Cumhuriyeti sistemi kurulmamış.");
  return view;
}

async function resolveRomanCommandContext(interaction:ChatInputCommandInteraction):Promise<{
  country:{id:string;name:string};familyId:string|null;
}>{
  const guildId=interaction.guildId!;
  const access=await romanRepublicService.playerAccess(guildId,interaction.user.id);
  if(!isGameMaster(interaction)){
    if(!access)throw new GameError("Bir Roma siyasi ailesine atanmış değilsiniz.");
    return{country:{id:access.countryId,name:access.countryName},familyId:access.familyId};
  }
  const requested=interaction.options.getString("ulke");
  if(requested){
    const country=await gameService.countryByName(guildId,requested);
    if(!country)throw new GameError("Devlet bulunamadı.");
    return{country,familyId:access?.countryId===country.id?access.familyId:null};
  }
  if(access)return{country:{id:access.countryId,name:access.countryName},familyId:access.familyId};
  const view=await romanRepublicService.view(guildId);
  if(!view)throw new GameError("Bu sunucuda etkin Roma Cumhuriyeti sistemi bulunamadı.");
  return{country:{id:view.countryId,name:view.countryName},familyId:null};
}

export async function handleRomanRepublicAutocomplete(interaction:AutocompleteInteraction):Promise<boolean>{
  if(interaction.commandName!=="roma")return false;
  const action=interaction.options.getSubcommand(false)??"";
  if(!["evlilik-teklif","evlilik-cevapla","cocuk-dene"].includes(action))return false;
  if(!interaction.guildId){await interaction.respond([]);return true;}
  const access=await romanRepublicService.playerAccess(interaction.guildId,interaction.user.id);
  const requestedCountry=interaction.options.getString("ulke");
  const country=requestedCountry&&isGameMaster(interaction)
    ?await gameService.countryByName(interaction.guildId,requestedCountry)
    :null;
  const view=country
    ?await romanRepublicService.view(interaction.guildId,country.id)
    :access?await romanRepublicService.view(interaction.guildId,access.countryId)
      :isGameMaster(interaction)?await romanRepublicService.view(interaction.guildId):null;
  if(!view){await interaction.respond([]);return true;}
  const focused=interaction.options.getFocused(true);
  const query=String(focused.value).toLocaleLowerCase("tr-TR").trim();
  const ownFamily=view.families.find((family)=>family.id===access?.familyId)
    ??view.families.find((family)=>family.playerIds.includes(interaction.user.id));
  if(focused.name==="uye"||focused.name==="ebeveyn"){
    const families=ownFamily?[ownFamily]:isGameMaster(interaction)?view.families:[];
    const members=families.flatMap((family)=>family.members.map((member)=>({family,member})))
      .filter(({member})=>focused.name==="ebeveyn"?Boolean(member.spouseName):member.age>=MINIMUM_MARRIAGE_AGE&&!member.spouseName)
      .filter(({family,member})=>!query||member.name.toLocaleLowerCase("tr-TR").includes(query)||family.name.toLocaleLowerCase("tr-TR").includes(query));
    await interaction.respond(members.slice(0,25).map(({family,member})=>({
      name:`${member.name} • ${family.name} • ${member.age} yaş`.slice(0,100),value:member.id
    })));
    return true;
  }
  if(focused.name==="hedef-aile"){
    await interaction.respond(view.families.filter((family)=>family.id!==ownFamily?.id)
      .filter((family)=>!query||family.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25)
      .map((family)=>({name:family.name,value:family.id})));
    return true;
  }
  if(focused.name==="hedef-uye"){
    const selected=interaction.options.getString("hedef-aile")?.trim().toLocaleLowerCase("tr-TR");
    const families=selected
      ?view.families.filter((family)=>family.id===selected||family.name.toLocaleLowerCase("tr-TR")===selected)
      :view.families.filter((family)=>family.id!==ownFamily?.id);
    const members=families.flatMap((family)=>family.members.map((member)=>({family,member})))
      .filter(({member})=>member.age>=MINIMUM_MARRIAGE_AGE&&!member.spouseName)
      .filter(({family,member})=>!query||member.name.toLocaleLowerCase("tr-TR").includes(query)||family.name.toLocaleLowerCase("tr-TR").includes(query));
    await interaction.respond(members.slice(0,25).map(({family,member})=>({
      name:`${member.name} • ${family.name} • ${member.age} yaş`.slice(0,100),value:member.id
    })));
    return true;
  }
  if(focused.name==="teklif"){
    const proposals=await romanFamilyLifeService.listProposals(interaction.guildId,view.countryId,interaction.user.id,isGameMaster(interaction));
    const directional=action==="evlilik-cevapla"&&ownFamily
      ?proposals.filter((proposal)=>proposal.target_family_id===ownFamily.id)
      :proposals;
    await interaction.respond(directional.filter((proposal)=>!query||
      `${proposal.proposer_member_name} ${proposal.target_member_name} ${proposal.proposer_family_name} ${proposal.target_family_name}`.toLocaleLowerCase("tr-TR").includes(query)
    ).slice(0,25).map((proposal)=>({
      name:`${proposal.proposer_member_name} → ${proposal.target_member_name}`.slice(0,100),value:proposal.id
    })));
    return true;
  }
  await interaction.respond([]);
  return true;
}

export async function handleRomanRepublicCommand(interaction:ChatInputCommandInteraction):Promise<boolean>{
  if(!interaction.guildId)return false;
  if(interaction.commandName==="roma"){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const context=await resolveRomanCommandContext(interaction);
    const country=context.country;
    const action=interaction.options.getSubcommand();
    const view=await requiredView(interaction,country.id);
    if(action==="durum"||action==="aileler"){
      await interaction.editReply({embeds:[statusEmbed(view)],components:familySelectComponents(view),files:romanFiles("republic")});
      return true;
    }
    if(action==="aile-bilgi"){
      const requested=interaction.options.getString("aile",true).trim().toLocaleLowerCase("tr-TR");
      const family=view.families.find((item)=>item.id===requested||item.name.toLocaleLowerCase("tr-TR")===requested);
      if(!family)throw new GameError("Roma siyasi ailesi bulunamadı.");
      await interaction.editReply({embeds:[familyEmbed(view,family)],files:romanFiles("family")});
      return true;
    }
    if(action==="isletme-katalogu"){
      await interaction.editReply({embeds:[catalogEmbed()],files:romanFiles("business")});
      return true;
    }
    if(action==="secim"){
      await interaction.editReply({embeds:[electionEmbed(view)],components:electionComponents(view),files:romanFiles("election")});
      return true;
    }
    if(action==="valilikler"){
      await interaction.editReply({embeds:[governorshipEmbed(view)],files:romanFiles("governorship")});
      return true;
    }
    if(action==="senato"){
      const politics=await romanPoliticsService.view(interaction.guildId,country.id);
      await interaction.editReply({
        embeds:[senateEmbed(politics,view.families)],components:senateProposalComponents(politics),files:[senateChartFile(view)]
      });
      return true;
    }
    if(action==="makamlar"){
      await interaction.editReply({embeds:[officesEmbed(await romanPoliticsService.view(interaction.guildId,country.id))],files:romanFiles("offices")});
      return true;
    }
    if(action==="siyasi-durum"){
      await interaction.editReply({embeds:[standingsEmbed(view)],files:romanFiles("family")});
      return true;
    }
    if(action==="vali-ata"){
      const updated=await romanRepublicService.appointGovernor({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        settlement:interaction.options.getString("yerleske",true),family:interaction.options.getString("aile",true),
        governorName:interaction.options.getString("vali",true),gameMaster:isGameMaster(interaction)
      });
      await interaction.editReply({content:"✅ Roma şehir valisi atandı; görev süresi ve getirileri tur sistemi tarafından izlenecek.",embeds:[governorshipEmbed(updated)],files:romanFiles("governorship")});
      return true;
    }
    if(action==="vali-kaldir"){
      const updated=await romanRepublicService.removeGovernor({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        settlement:interaction.options.getString("yerleske",true),gameMaster:isGameMaster(interaction)
      });
      await interaction.editReply({content:"✅ Vali görevden alındı.",embeds:[governorshipEmbed(updated)],files:romanFiles("governorship")});
      return true;
    }
    const ownFamily=isGameMaster(interaction)
      ?view.families.find((family)=>family.id===context.familyId)??view.families.find((family)=>family.isConsulFamily)
      :view.families.find((family)=>family.id===context.familyId);
    if(!ownFamily)throw new GameError(isGameMaster(interaction)?"Önce konsül ailesini belirleyin.":"Bir Roma siyasi ailesine atanmış değilsiniz.");
    if(action==="ailem"||action==="isletmelerim"){
      await interaction.editReply({embeds:[familyEmbed(view,ownFamily)],files:romanFiles("family")});
      return true;
    }
    if(action==="evlilik-teklif"){
      const targetFamilyValue=interaction.options.getString("hedef-aile",true).trim().toLocaleLowerCase("tr-TR");
      const targetFamily=view.families.find((family)=>family.id===targetFamilyValue||family.name.toLocaleLowerCase("tr-TR")===targetFamilyValue);
      if(!targetFamily)throw new GameError("Hedef Roma siyasi ailesi bulunamadı.");
      const targetMemberValue=interaction.options.getString("hedef-uye",true);
      const targetMember=targetFamily.members.find((member)=>member.id===targetMemberValue||member.name.toLocaleLowerCase("tr-TR")===targetMemberValue.toLocaleLowerCase("tr-TR"));
      if(!targetMember)throw new GameError("Hedef üye seçilen Roma siyasi ailesine ait değil.");
      const proposal=await romanFamilyLifeService.proposeMarriage({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        proposerMember:interaction.options.getString("uye",true),targetMember:targetMember.id,gameMaster:isGameMaster(interaction)
      });
      await interaction.editReply(`💍 Evlilik teklifi gönderildi: **${proposal.proposer_member_name}** → **${proposal.target_member_name}**.\nTeklif kimliği: \`${proposal.id}\``);
      const channel=interaction.channel;
      if(channel?.isTextBased()&&!channel.isDMBased()){
        const notification=playerMentionPayload(targetFamily.playerIds,`**${targetFamily.name}** • Oyuncu atanmamış; oyun yöneticisi yanıtlayabilir.`);
        const message=await channel.send({
          content:notification.content,allowedMentions:notification.allowedMentions,
          embeds:[marriageProposalEmbed(proposal)],components:marriageProposalButtons(proposal),files:romanFiles("family")
        }).catch(()=>null);
        if(message)await romanFamilyLifeService.setProposalMessage({
          guildId:interaction.guildId,proposalId:proposal.id,channelId:channel.id,messageId:message.id
        });
      }
      return true;
    }
    if(action==="evlilik-cevapla"){
      const decision=interaction.options.getString("karar",true) as "ACCEPT"|"REJECT"|"WITHDRAW";
      if(decision==="WITHDRAW"){
        const proposal=await romanFamilyLifeService.withdrawMarriage({
          guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
          proposalId:interaction.options.getString("teklif",true),gameMaster:isGameMaster(interaction)
        });
        await interaction.editReply("↩️ Roma aile evliliği teklifi geri çekildi.");
        await refreshMarriageProposalMessage(interaction.client,proposal).catch(()=>false);
        return true;
      }
      const proposal=await romanFamilyLifeService.respondMarriage({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        proposalId:interaction.options.getString("teklif",true),decision,gameMaster:isGameMaster(interaction)
      });
      await interaction.editReply(decision==="ACCEPT"
        ?`💍 Teklif kabul edildi. **${proposal.proposer_member_name}** ile **${proposal.target_member_name}** evlendi.`
        :"❌ Roma aile evliliği teklifi reddedildi.");
      await refreshMarriageProposalMessage(interaction.client,proposal).catch(()=>false);
      await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
      return true;
    }
    if(action==="evlilik-teklifleri"){
      const proposals=await romanFamilyLifeService.listProposals(interaction.guildId,country.id,interaction.user.id,isGameMaster(interaction));
      if(!proposals.length){await interaction.editReply("Aileniz için bekleyen Roma aile evliliği teklifi bulunmuyor.");return true;}
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0xc59b45).setTitle("💍 Roma • Bekleyen Aile Evlilikleri")
        .setDescription(proposals.map((proposal)=>{
          const direction=proposal.target_family_id===ownFamily.id?"📥 Gelen":"📤 Giden";
          return `${direction} • **${proposal.proposer_member_name}** (${proposal.proposer_family_name}) × **${proposal.target_member_name}** (${proposal.target_family_name})\n\`${proposal.id}\``;
        }).join("\n\n").slice(0,4000)).setImage(romanViewAsset("family").url)],files:romanFiles("family")});
      return true;
    }
    if(action==="cocuk-dene"){
      const result=await romanFamilyLifeService.attemptBirth({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        parentMember:interaction.options.getString("ebeveyn",true),gameMaster:isGameMaster(interaction)
      });
      await interaction.editReply({content:birthResultMessage(result),components:birthNameButton(country.id,result)});
      return true;
    }
    if(action==="isletme-al"){
      const businessType=interaction.options.getString("isletme",true);
      if(!isRomanBusinessType(businessType))throw new GameError("Geçersiz işletme türü.");
      const result=await romanRepublicService.purchaseBusiness({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,businessType,
        settlement:interaction.options.getString("yerleske",true),gameMaster:isGameMaster(interaction)
      });
      const definition=ROMAN_BUSINESSES[businessType];
      await interaction.editReply({
        content:`✅ ${definition.emoji} **${definition.label}**, **${result.family.name}** tarafından satın alındı. `+
          `Aile hazinesinden **${gold(result.cost)}** kesildi ve aile **+${result.influence} siyasi nüfuz** kazandı.`,
        embeds:[familyEmbed(await requiredView(interaction,country.id),result.family)],files:romanFiles("family")
      });
      return true;
    }
    if(action==="aday-ol"){
      const updated=await romanRepublicService.nominate({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        candidateName:interaction.options.getString("aday",true),gameMaster:isGameMaster(interaction)
      });
      await interaction.editReply({content:`✅ **${ownFamily.name}** ailesinin konsül adayı kaydedildi; **${ROMAN_CANDIDACY_INFLUENCE_COST} nüfuz** harcandı.`,embeds:[electionEmbed(updated)],components:electionComponents(updated),files:romanFiles("election")});
      await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
      return true;
    }
    if(action==="oy-ver"){
      const influenceSpend=interaction.options.getInteger("destek")??0;
      const updated=await romanRepublicService.vote({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        candidate:interaction.options.getString("aday",true),influenceSpend,gameMaster:isGameMaster(interaction)
      });
      await interaction.editReply({content:`✅ **${ownFamily.name}** ailesinin oyu kaydedildi${influenceSpend?`; **${influenceSpend} nüfuz** seçim desteği olarak harcandı`:""}.`,embeds:[electionEmbed(updated)],files:romanFiles("election")});
      await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
      return true;
    }
    if(action==="nufuz-defteri"){
      const ledger=await romanRepublicService.influenceLedger(interaction.guildId,country.id,interaction.user.id,isGameMaster(interaction));
      await interaction.editReply({embeds:[influenceLedgerEmbed(ledger.familyName,ledger.entries)],files:romanFiles("family")});
      return true;
    }
    if(action==="iliskiler"){
      const politics=await romanPoliticsService.view(interaction.guildId,country.id);
      await interaction.editReply({embeds:[relationsEmbed(politics,ownFamily,isGameMaster(interaction))],files:romanFiles("family")});
      return true;
    }
    if(action==="teklif-sun"){
      const type=interaction.options.getString("tur",true) as RomanProposalType;
      if(!(type in ROMAN_SENATE_PROPOSALS))throw new GameError("Geçersiz Senato teklif türü.");
      const politics=await romanPoliticsService.proposeLaw({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        gameMaster:isGameMaster(interaction),type,title:interaction.options.getString("baslik",true),description:interaction.options.getString("aciklama",true)});
      const updatedView=await requiredView(interaction,country.id);
      await interaction.editReply({content:`✅ **${ownFamily.name}**, Senatoya **${ROMAN_SENATE_PROPOSALS[type].label}** türünde teklif sundu.`,embeds:[senateEmbed(politics,updatedView.families)],files:[senateChartFile(updatedView)]});
      await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
      return true;
    }
    if(action==="teklif-oyla"){
      const choice=interaction.options.getString("oy",true) as "YES"|"NO"|"ABSTAIN";
      const politics=await romanPoliticsService.vote({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        gameMaster:isGameMaster(interaction),proposal:interaction.options.getString("teklif",true),choice,
        influenceSpend:interaction.options.getInteger("destek")??0});
      const updatedView=await requiredView(interaction,country.id);
      await interaction.editReply({content:`✅ **${ownFamily.name}** ailesinin Senato oyu kaydedildi.`,embeds:[senateEmbed(politics,updatedView.families)],files:[senateChartFile(updatedView)]});
      await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
      return true;
    }
    if(action==="makam-adayi"){
      const officeKey=interaction.options.getString("makam",true) as RomanOfficeKey;
      if(!(officeKey in ROMAN_OFFICES))throw new GameError("Geçersiz Roma makamı.");
      const politics=await romanPoliticsService.proposeOffice({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        gameMaster:isGameMaster(interaction),officeKey,characterName:interaction.options.getString("aday",true)});
      const updatedView=await requiredView(interaction,country.id);
      await interaction.editReply({content:`✅ Adaylık Senatoya sunuldu: **${ROMAN_OFFICES[officeKey].label}**.`,embeds:[senateEmbed(politics,updatedView.families)],files:[senateChartFile(updatedView)]});
      await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
      return true;
    }
    if(action==="aile-eylemi"){
      const relationAction=interaction.options.getString("eylem",true) as RomanRelationAction;
      if(!(relationAction in ROMAN_RELATION_ACTIONS))throw new GameError("Geçersiz aile ilişkisi eylemi.");
      const politics=await romanPoliticsService.familyAction({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        gameMaster:isGameMaster(interaction),targetFamily:interaction.options.getString("hedef-aile",true),action:relationAction});
      await interaction.editReply({content:`✅ **${ROMAN_RELATION_ACTIONS[relationAction].label}** gerçekleştirildi.`,embeds:[relationsEmbed(politics,ownFamily,isGameMaster(interaction))],files:romanFiles("family")});
      return true;
    }
    throw new GameError("Desteklenmeyen Roma işlemi.");
  }

  if(interaction.commandName!=="roma-yonetim")return false;
  requireGameMaster(interaction);
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const action=interaction.options.getSubcommand();
  const country=await gameService.countryByName(interaction.guildId,interaction.options.getString("ulke",true));
  if(!country)throw new GameError("Devlet bulunamadı.");
  if(action==="kanal-ayarla"){
    const current=await requiredView(interaction,country.id);
    const operation=interaction.options.getString("islem",true);
    if(operation==="CLEAR"){
      await removeRomanPublicPanel(interaction.client,current);
      await romanRepublicService.setPoliticsChannel({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,channelId:null});
      await interaction.editReply("✅ Roma siyaseti kamu kanalı kapatıldı; eski kalıcı panel kaldırıldı.");
      return true;
    }
    const selectedChannel=interaction.options.getChannel("kanal",true);
    const channel=await interaction.client.channels.fetch(selectedChannel.id).catch(()=>null);
    if(!channel)throw new GameError("Seçilen kanal bulunamadı.");
    if(!channel.isTextBased()||channel.isDMBased()||!channel.isSendable())throw new GameError("Mesaj gönderilebilen bir sunucu metin kanalı seçmelisiniz.");
    await removeRomanPublicPanel(interaction.client,current);
    await romanRepublicService.setPoliticsChannel({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,channelId:channel.id});
    if(!await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id))throw new GameError("Roma paneli seçilen kanala gönderilemedi; botun kanalı görme, mesaj gönderme ve dosya ekleme izinlerini kontrol edin.");
    await interaction.editReply(`✅ Roma Senatosu ve konsül seçimleri artık <#${channel.id}> kanalındaki kalıcı, interaktif panelde yayımlanacak.`);
    return true;
  }
  if(action==="kur"){
    const view=await romanRepublicService.setup({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      termLength:interaction.options.getInteger("donem")??6
    });
    await interaction.editReply({content:`✅ **${country.name}** için Roma Cumhuriyeti ve **12 siyasi aile** kuruldu.`,embeds:[statusEmbed(view)],components:familySelectComponents(view),files:romanFiles("republic")});
    return true;
  }
  if(action==="aile-ekle"){
    const family=await romanRepublicService.addFamily({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      name:interaction.options.getString("aile",true),treasury:interaction.options.getInteger("hazine")??5_000,
      influence:interaction.options.getInteger("nufuz")??0,seats:interaction.options.getInteger("koltuk")??0
    });
    await interaction.editReply(`✅ **${family.name}** siyasi ailesi eklendi. Hazine **${gold(family.treasury)}** • Nüfuz **${family.politicalInfluence}** • Koltuk **${family.senateSeats}**.`);
    await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
    return true;
  }
  if(action==="oyuncu-ata"){
    const user=interaction.options.getUser("oyuncu",true);
    const family=await romanRepublicService.assignPlayer({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      family:interaction.options.getString("aile",true),userId:user.id,leader:interaction.options.getBoolean("lider")??false
    });
    await interaction.editReply(`✅ <@${user.id}>, **${family.name}** ailesine${family.leaderUserId===user.id?" aile lideri olarak":""} atandı.`);
    return true;
  }
  if(action==="konsul-ailesi"){
    const view=await romanRepublicService.setConsulFamily({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      family:interaction.options.getString("aile",true)
    });
    await interaction.editReply({content:"✅ Konsül ailesi değiştirildi; devlet icra yetkisi yeni aileye geçti.",embeds:[statusEmbed(view)],files:romanFiles("republic")});
    await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
    return true;
  }
  if(action==="aile-duzenle"){
    const family=await romanRepublicService.adjustFamily({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      family:interaction.options.getString("aile",true),treasuryDelta:interaction.options.getInteger("hazine")??0,
      influenceDelta:interaction.options.getInteger("nufuz")??0,reason:interaction.options.getString("neden",true)
    });
    await interaction.editReply(`✅ **${family.name}** güncellendi. Hazine **${gold(family.treasury)}** • Siyasi nüfuz **${number(family.politicalInfluence)}**.`);
    return true;
  }
  if(action==="koltuk-ayarla"){
    const view=await romanRepublicService.setSenateSeats({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      family:interaction.options.getString("aile",true),seats:interaction.options.getInteger("koltuk",true)
    });
    await interaction.editReply({content:"✅ Senato koltuk dağılımı güncellendi.",embeds:[statusEmbed(view)],files:romanFiles("republic")});
    await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
    return true;
  }
  if(action==="secim-baslat"){
    await romanRepublicService.startElection({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id});
    const view=await requiredView(interaction,country.id);
    await interaction.editReply({content:"✅ Konsül seçimi açıldı; aileler aday gösterebilir ve oy kullanabilir.",embeds:[electionEmbed(view)],files:romanFiles("election")});
    await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
    return true;
  }
  if(action==="secim-bitir"){
    const result=await romanRepublicService.resolveElection({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id});
    const changed=result.seatRenewal.changes.filter((change)=>change.seatDelta!==0)
      .sort((left,right)=>right.seatDelta-left.seatDelta||right.newSeats-left.newSeats);
    const seatSummary=changed.length?changed.map((change)=>
      `${change.seatDelta>0?"📈":"📉"} **${change.familyName}:** ${change.previousSeats} → ${change.newSeats} `+
      `(${change.seatDelta>0?"+":""}${change.seatDelta}; performans ${change.performanceScore>=0?"+":""}${change.performanceScore})`
    ).join("\n"):"Koltuk dağılımı bu dönem değişmedi.";
    await interaction.editReply({
      content:(`✅ **${result.candidateName}**, **${result.winnerFamily}** ailesi adına **${result.weight} oy ağırlığıyla** konsül seçildi.\n\n`+
        `🪑 **Senato Yenilemesi • Performans Dönemi Tur ${result.seatRenewal.previousTermStartedTurn}–${Math.max(result.seatRenewal.previousTermStartedTurn,result.seatRenewal.resolvedTurn-1)}**\n${seatSummary}`).slice(0,2000),
      embeds:[electionEmbed(result.view),statusEmbed(result.view)],files:romanFiles("election","republic")
    });
    await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
    return true;
  }
  if(action==="teklif-bitir"){
    const result=await romanPoliticsService.resolve({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      proposal:interaction.options.getString("teklif",true)});
    const updatedView=await requiredView(interaction,country.id);
    await interaction.editReply({content:`${result.result.passed?"✅ Teklif kabul edildi.":"❌ Teklif reddedildi."} `+
      `Evet **${result.result.yesWeight}** • Hayır **${result.result.noWeight}** • Gereken **${result.result.requiredWeight}**`,embeds:[senateEmbed(result.view,updatedView.families)],files:[senateChartFile(updatedView)]});
    await syncRomanPublicPanel(interaction.client,interaction.guildId,country.id);
    return true;
  }
  if(action==="itibar-skandal"){
    await romanPoliticsService.adjustStanding({guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      family:interaction.options.getString("aile",true),reputationDelta:interaction.options.getInteger("itibar")??0,
      scandalDelta:interaction.options.getInteger("skandal")??0,reason:interaction.options.getString("neden",true)});
    await interaction.editReply({content:"✅ Aile itibarı ve skandal kaydı güncellendi.",embeds:[standingsEmbed(await requiredView(interaction,country.id))],files:romanFiles("family")});
    return true;
  }
  if(action==="durum"){
    const view=await requiredView(interaction,country.id);
    await interaction.editReply({embeds:[statusEmbed(view)],components:familySelectComponents(view),files:romanFiles("republic")});
    return true;
  }
  throw new GameError("Desteklenmeyen Roma yönetim işlemi.");
}

export async function handleRomanRepublicSelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("roman-vote-pick|")&&!interaction.customId.startsWith("roman-senate-pick|")&&!interaction.customId.startsWith("roman-family-pick|"))return false;
  if(!interaction.guildId)throw new GameError("Sunucu bulunamadı.");
  if(interaction.customId.startsWith("roman-family-pick|")){
    const countryId=interaction.customId.split("|")[1];
    const familyId=interaction.values[0];
    if(!countryId||!familyId)throw new GameError("Roma aile menüsü bilgisi bozuk.");
    const view=await requiredView(interaction,countryId);
    const family=view.families.find((item)=>item.id===familyId);
    if(!family)throw new GameError("Seçilen Roma siyasi ailesi artık bulunmuyor.");
    await interaction.reply({flags:MessageFlags.Ephemeral,embeds:[familyEmbed(view,family)],files:romanFiles("family")});
    return true;
  }
  if(interaction.customId.startsWith("roman-senate-pick|")){
    const countryId=interaction.customId.split("|")[1];
    const proposalId=interaction.values[0];
    if(!countryId||!proposalId)throw new GameError("Senato oy formu bilgisi bozuk.");
    const politics=await romanPoliticsService.view(interaction.guildId,countryId);
    const proposal=politics.proposals.find((item)=>item.id===proposalId&&item.status==="OPEN");
    if(!proposal)throw new GameError("Bu Senato teklifi artık oylamaya açık değil.");
    await interaction.reply({
      flags:MessageFlags.Ephemeral,
      embeds:[new EmbedBuilder().setColor(0x8b1e24).setTitle("🏛️ Roma Senatosu • Aile Oy Formu").setDescription([
        `**Teklif:** ${proposal.title}`,
        `**Sunan Aile:** ${proposal.proposerFamilyName}`,
        `**Açıklama:** ${proposal.description}`,
        `**Kabul Eşiği:** %${proposal.thresholdPercent} • **Son Tur:** ${proposal.closesTurn}`,
        "",
        "Ailenizin Senato koltukları temel oy ağırlığıdır. Evet veya hayır yönünde ayrıca **0, 2, 5 ya da 10 siyasi nüfuz** harcayabilirsiniz. Çekimser oy ağırlık üretmez. Oy kesindir."
      ].join("\n"))],
      components:senateVoteComponents(countryId,proposalId)
    });
    return true;
  }
  const countryId=interaction.customId.split("|")[1];
  const candidateId=interaction.values[0];
  if(!countryId||!candidateId)throw new GameError("Seçim formu bilgisi bozuk.");
  const view=await requiredView(interaction,countryId);
  const candidate=view.election?.status==="OPEN"?view.election.candidates.find((item)=>item.id===candidateId):null;
  if(!candidate)throw new GameError("Bu konsül adayı artık açık seçimde bulunmuyor.");
  await interaction.reply({
    flags:MessageFlags.Ephemeral,
    embeds:[new EmbedBuilder().setColor(0xd4a72c).setTitle("🗳️ Roma Ailesi Oy Formu").setDescription([
      `**Aday:** ${candidate.candidateName}`,
      `**Aile:** ${candidate.familyName}`,
      "",
      "Ailenizin Senato koltuğu temel oy ağırlığıdır. Aşağıdan ayrıca **0, 2, 5 veya 10 siyasi nüfuz** desteği seçin.",
      "Bu seçim kesindir; aynı aile ikinci kez oy kullanamaz."
    ].join("\n"))],
    components:[voteSupportComponents(countryId,candidateId)]
  });
  return true;
}

export async function handleRomanRepublicButton(interaction:ButtonInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("roman-vote|")&&!interaction.customId.startsWith("roman-senate-vote|")&&
    !interaction.customId.startsWith("roman-public-refresh|")&&!interaction.customId.startsWith("roman-birth-name|")&&
    !interaction.customId.startsWith("roman-marriage-accept|")&&!interaction.customId.startsWith("roman-marriage-reject|"))return false;
  if(!interaction.guildId)throw new GameError("Sunucu bulunamadı.");
  const marriageMatch=/^roman-marriage-(accept|reject)\|(.+)$/.exec(interaction.customId);
  if(marriageMatch){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const proposal=await romanFamilyLifeService.proposalById(interaction.guildId,marriageMatch[2]!);
    if(proposal.status!=="PENDING")throw new GameError("Bu Roma aile evliliği teklifi daha önce sonuçlandırılmış.");
    const decision=marriageMatch[1]==="accept"?"ACCEPT":"REJECT";
    const result=await romanFamilyLifeService.respondMarriage({
      guildId:interaction.guildId,countryId:proposal.country_id,actorId:interaction.user.id,
      proposalId:proposal.id,decision,gameMaster:isGameMaster(interaction)
    });
    await interaction.message.edit({
      embeds:[marriageProposalEmbed(result)],components:marriageProposalButtons(result)
    }).catch(()=>undefined);
    await interaction.editReply(decision==="ACCEPT"
      ?`✅ Teklif kabul edildi. **${result.proposer_member_name}** ile **${result.target_member_name}** evlendi.`
      :"❌ Roma aile evliliği teklifi reddedildi.");
    await syncRomanPublicPanel(interaction.client,interaction.guildId,proposal.country_id);
    return true;
  }
  if(interaction.customId.startsWith("roman-birth-name|")){
    const [,countryId,sessionId]=interaction.customId.split("|");
    if(!countryId||!sessionId)throw new GameError("Roma çocuk adlandırma bilgisi bozuk.");
    const modal=new ModalBuilder().setCustomId(`roman-birth-name-modal|${countryId}|${sessionId}`).setTitle("Roma Ailesi • Çocuğa Ad Ver");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("child-name").setLabel("Çocuğun adı").setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(80).setRequired(true)
    ));
    await interaction.showModal(modal);
    return true;
  }
  if(interaction.customId.startsWith("roman-public-refresh|")){
    const countryId=interaction.customId.split("|")[1];
    if(!countryId)throw new GameError("Roma paneli bilgisi bozuk.");
    await interaction.deferUpdate();
    await syncRomanPublicPanel(interaction.client,interaction.guildId,countryId);
    await interaction.followUp({content:"✅ Roma siyasi paneli güncellendi.",flags:MessageFlags.Ephemeral});
    return true;
  }
  if(interaction.customId.startsWith("roman-senate-vote|")){
    const [,countryId,proposalId,choiceRaw,influenceRaw]=interaction.customId.split("|");
    const choice=choiceRaw as "YES"|"NO"|"ABSTAIN";
    const influenceSpend=Number(influenceRaw);
    if(!countryId||!proposalId||!["YES","NO","ABSTAIN"].includes(choice)||![0,2,5,10].includes(influenceSpend))throw new GameError("Senato oy formu bilgisi bozuk.");
    await interaction.deferUpdate();
    const politics=await romanPoliticsService.vote({guildId:interaction.guildId,countryId,actorId:interaction.user.id,
      gameMaster:isGameMaster(interaction),proposal:proposalId,choice,influenceSpend});
    const view=await requiredView(interaction,countryId);
    const access=await romanRepublicService.playerAccess(interaction.guildId,interaction.user.id);
    const family=view.families.find((item)=>item.id===access?.familyId)??view.families.find((item)=>item.isConsulFamily);
    await interaction.editReply({
      content:`✅ **${family?.name??"Roma siyasi ailesi"}** Senato oyunu kullandı${influenceSpend?`; **${influenceSpend} nüfuz** harcandı`:""}.`,
      embeds:[senateEmbed(politics,view.families)],components:[],files:[senateChartFile(view)]
    });
    await syncRomanPublicPanel(interaction.client,interaction.guildId,countryId);
    return true;
  }
  const [,countryId,candidateId,influenceRaw]=interaction.customId.split("|");
  const influenceSpend=Number(influenceRaw);
  if(!countryId||!candidateId||![0,2,5,10].includes(influenceSpend))throw new GameError("Oy formu bilgisi bozuk.");
  await interaction.deferUpdate();
  const updated=await romanRepublicService.vote({
    guildId:interaction.guildId,countryId,actorId:interaction.user.id,candidate:candidateId,
    influenceSpend,gameMaster:isGameMaster(interaction)
  });
  const access=await romanRepublicService.playerAccess(interaction.guildId,interaction.user.id);
  const family=updated.families.find((item)=>item.id===access?.familyId)??updated.families.find((item)=>item.isConsulFamily);
  await interaction.editReply({
    content:`✅ **${family?.name??"Roma siyasi ailesi"}** oyunu kullandı${influenceSpend?`; **${influenceSpend} nüfuz** harcandı`:""}.`,
    embeds:[electionEmbed(updated)],components:[],files:romanFiles("election")
  });
  await syncRomanPublicPanel(interaction.client,interaction.guildId,countryId);
  return true;
}

export async function handleRomanRepublicModal(interaction:ModalSubmitInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("roman-birth-name-modal|"))return false;
  if(!interaction.guildId)throw new GameError("Sunucu bulunamadı.");
  const [,countryId,sessionId]=interaction.customId.split("|");
  if(!countryId||!sessionId)throw new GameError("Roma çocuk adlandırma formu bozuk.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const result=await romanFamilyLifeService.nameBirth({
    guildId:interaction.guildId,countryId,actorId:interaction.user.id,sessionId,
    childName:interaction.fields.getTextInputValue("child-name"),gameMaster:isGameMaster(interaction)
  });
  await interaction.editReply(`👶 **${result.childName}**, **${result.familyName}** ailesine kaydedildi.`);
  await syncRomanPublicPanel(interaction.client,interaction.guildId,countryId);
  return true;
}
