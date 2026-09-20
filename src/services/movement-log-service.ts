import { ChannelType, EmbedBuilder, PermissionFlagsBits, type Client } from "discord.js";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { logger } from "../logger.js";
import { GameError } from "./game-service.js";

interface MovementAuditRow {
  id:string; guild_id:string; actor_user_id:string; action:string; entity_id:string|null;
  details:Record<string,unknown>; created_at:Date;
}

const ACTIONS:Record<string,{title:string;color:number}>={
  MOVEMENT_ORDER_SUBMIT:{title:"🧭 Hareket emri verildi",color:0x4975b9},
  MOVEMENT_ORDER_CANCEL:{title:"⛔ Hareket emri iptal edildi",color:0xb85454},
  MOVEMENT_ORDER_RESUME:{title:"▶️ Hareket emri sürdürüldü",color:0x58a86b},
  MOVEMENT_ORDER_STAGE:{title:"🗺️ Birlik hareketi çözüldü",color:0x4975b9},
  MOVEMENT_STAGE_RESOLVE:{title:"📋 Hareket aşaması tamamlandı",color:0x8191a7},
  MOVEMENT_ENCOUNTER_DECIDE:{title:"⚔️ Hex karşılaşması kararı",color:0xc28649},
  MOVEMENT_CONFIGURE:{title:"⚙️ Hareket sistemi ayarı",color:0x8191a7},
  FORMATION_POSITION:{title:"📍 Birlik başlangıç konumu",color:0x8191a7},
  FORMATION_POSITION_CORRECT:{title:"📍 Birlik konumu düzeltildi",color:0xc28649},
  MAP_HEX_UPSERT:{title:"🗺️ Hex haritası düzenlendi",color:0x8191a7},
  R56_MAP_IMPORT:{title:"🗺️ R56 haritası aktarıldı",color:0x8191a7},
  SEA_PASSAGE_SET:{title:"🌊 Deniz geçişi tanımlandı",color:0x8191a7},
  ARMY_SCOUT_ASSIGN:{title:"🕵️ Keşif birliği atandı",color:0x8881bd},
  ARMY_SCOUT_WITHDRAW:{title:"🕵️ Keşif birliği geri çekildi",color:0x8881bd},
  ARMY_EMBARK:{title:"⛵ Ordu gemiye bindi",color:0x4975b9},
  ARMY_DISEMBARK:{title:"⚓ Ordu karaya çıktı",color:0x4975b9},
  ARMY_DISEMBARK_GM:{title:"⚓ Yönetici çıkarma kararı",color:0xc28649},
  ARMY_MUSTER_SUBMIT:{title:"⚔️ Asker intikali başladı",color:0x4975b9},
  ARMY_MUSTER_STAGE:{title:"⚔️ Asker intikali çözüldü",color:0x4975b9},
  ARMY_MUSTER_JOIN:{title:"✅ Askerler orduya katıldı",color:0x58a86b},
  ARMY_MUSTER_RETURNED:{title:"↩️ Askerler kaynağa döndü",color:0x58a86b},
  ARMY_MUSTER_RESUME:{title:"▶️ Asker intikali sürdürüldü",color:0x58a86b},
  ARMY_MUSTER_RECALL:{title:"↩️ Askerler geri çağrıldı",color:0xc28649},
  ARMY_MUSTER_CANCEL:{title:"⛔ Asker intikali iptal edildi",color:0xb85454},
  GM_RECON_REPORT:{title:"🕵️ Yönetici istihbaratı eklendi",color:0x8881bd}
};

const FIELD_LABELS:Record<string,string>={
  turn:"Tur",stage:"Aşama",status:"Durum",country:"Devlet",formation:"Birim",
  formationKind:"Tür",from:"Başlangıç Hex",to:"Varış Hex",start:"Başlangıç Hex",
  destination:"Hedef Hex",steps:"Toplam adım",stepsAdvanced:"Bu aşama ilerleme",
  currentStep:"Tamamlanan adım",totalSteps:"Rota uzunluğu",blockedReason:"Durma nedeni",
  reason:"Gerekçe",note:"Not",quantity:"Asker sayısı",unitType:"Birim türü",
  returning:"Geri dönüş",allowance:"Tur hareket hakkı",enabled:"Sistem açık",
  mode:"Hareket türü",coordinate:"Hex",route:"Rota",processed:"İşlenen emir",
  advanced:"İlerleyen",completed:"Varan",blocked:"Engellenen",ongoing:"Yolda",
  encounters:"Karşılaşma",reconChecks:"Keşif kontrolü"
};
const STATUS_LABELS:Record<string,string>={
  SUBMITTED:"Bekliyor",IN_PROGRESS:"Yolda",BLOCKED:"Yönetici kararı bekliyor",
  COMPLETED:"Vardı",CANCELLED:"İptal",FAILED:"Başarısız"
};

function safe(value:unknown):string {
  return String(value??"—").replaceAll("@","＠").replaceAll("`","ˋ").slice(0,1000);
}

export function movementLogEmbed(row:MovementAuditRow):EmbedBuilder {
  const meta=ACTIONS[row.action]??{title:"🗺️ Hareket kaydı",color:0x8191a7};
  const details=row.details??{};
  const fields=Object.entries(details).filter(([,value])=>value!==null&&value!==undefined).slice(0,18).map(([key,value])=>{
    const formatted=Array.isArray(value)?value.map(safe).join(" → ")
      : value && typeof value==="object"?JSON.stringify(value)
      : typeof value==="boolean"?(value?"Evet":"Hayır")
      : key==="status"?(STATUS_LABELS[String(value)]??safe(value)):safe(value);
    return `**${safe(FIELD_LABELS[key]??key)}:** ${safe(formatted).slice(0,220)}`;
  });
  return new EmbedBuilder().setColor(meta.color).setTitle(meta.title)
    .setDescription((`**İşlem:** ${safe(row.action)}\n**Kayıt:** \`${safe(row.entity_id??row.id)}\`\n`+
      `**Uygulayan:** ${safe(row.actor_user_id)}\n`+(fields.length?fields.join("\n"):"Ayrıntı yok.")).slice(0,3900))
    .setFooter({text:`Denetim kaydı ${row.id}`}).setTimestamp(row.created_at);
}

async function privateTextChannel(client:Client,guildId:string,channelId:string){
  const channel=await client.channels.fetch(channelId);
  if(!channel||channel.type!==ChannelType.GuildText||channel.guild.id!==guildId)
    throw new GameError("Hareket logu için bu sunucuya ait özel bir metin kanalı seçin.");
  if(!channel.permissionsFor(channel.guild.roles.everyone)||
    channel.permissionsFor(channel.guild.roles.everyone)!.has(PermissionFlagsBits.ViewChannel))
    throw new GameError("Hareket log kanalı @everyone tarafından görülebiliyor. Gizli emirler için önce kanalı özel yapın.");
  const bot=client.user;
  const exposed=[...channel.permissionOverwrites.cache.values()].some((entry)=>
    entry.allow.has(PermissionFlagsBits.ViewChannel)&&entry.id!==bot?.id&&
    !config.adminRoleIds.has(entry.id));
  if(exposed)throw new GameError("Hareket log kanalında yönetici dışı rol veya üyeye Görüntüle izni var; gizli kayıtlar için bu izni kaldırın.");
  if(!bot||!channel.permissionsFor(bot)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))
    throw new GameError("Botun hareket log kanalında Görüntüle, Mesaj Gönder ve Bağlantı Göm yetkileri olmalı.");
  return channel;
}

export const movementLogService={
  async ensureChannel(client:Client,guildId:string):Promise<string>{
    const existing=await this.channel(guildId);
    if(existing){await privateTextChannel(client,guildId,existing);return existing;}
    const guild=await client.guilds.fetch(guildId);
    const roles=await guild.roles.fetch();
    const overwrites=[
      {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
      {id:client.user!.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]},
      ...[...config.adminRoleIds].filter((id)=>roles.has(id)).map((id)=>({id,allow:[PermissionFlagsBits.ViewChannel]}))
    ];
    let created;
    try{
      created=await guild.channels.create({name:"hareket-loglari",type:ChannelType.GuildText,
        topic:"AMRP özel hareket emirleri ve tur çözüm kayıtları — yalnız oyun yöneticileri",
        permissionOverwrites:overwrites});
      await this.setChannel(client,guildId,created.id);
    }catch(error){
      logger.error({error,guildId},"Özel hareket log kanalı otomatik oluşturulamadı");
      throw new GameError("Özel hareket log kanalı kurulamadı. Bota Kanal Yönet izni verin veya /harita log-kanali ile özel bir kanal seçin.");
    }
    return created.id;
  },
  async setChannel(client:Client,guildId:string,channelId:string):Promise<void>{
    await privateTextChannel(client,guildId,channelId);
    await pool.query("UPDATE guilds SET movement_log_channel_id=$2,movement_log_started_at=COALESCE(movement_log_started_at,NOW()),updated_at=NOW() WHERE discord_id=$1",[guildId,channelId]);
  },
  async channel(guildId:string):Promise<string|null>{
    return (await pool.query<{movement_log_channel_id:string|null}>(
      "SELECT movement_log_channel_id FROM guilds WHERE discord_id=$1",[guildId]
    )).rows[0]?.movement_log_channel_id??null;
  },
  async publishPending(client:Client,guildId:string,limit=25):Promise<number>{
    const db=await pool.connect();
    let locked=false;
    try{
      locked=Boolean((await db.query<{locked:boolean}>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",[`movement-log:${guildId}`]
      )).rows[0]?.locked);
      if(!locked)return 0;
      const config=(await db.query<{movement_log_channel_id:string|null;movement_log_started_at:Date|null}>(
        "SELECT movement_log_channel_id,movement_log_started_at FROM guilds WHERE discord_id=$1",[guildId]
      )).rows[0];
      if(!config?.movement_log_channel_id||!config.movement_log_started_at)return 0;
      const channel=await privateTextChannel(client,guildId,config.movement_log_channel_id);
      const records=(await db.query<MovementAuditRow>(
        `SELECT audit.id,audit.guild_id,audit.actor_user_id,audit.action,audit.entity_id,audit.details,audit.created_at
           FROM audit_logs audit LEFT JOIN movement_log_deliveries sent ON sent.audit_log_id=audit.id
          WHERE audit.guild_id=$1 AND audit.created_at >= $2 AND sent.audit_log_id IS NULL
            AND (audit.action LIKE 'MOVEMENT_%' OR audit.action LIKE 'ARMY_MUSTER_%'
              OR audit.action LIKE 'FORMATION_POSITION%' OR audit.action LIKE 'ARMY_SCOUT_%'
              OR audit.action IN ('MAP_HEX_UPSERT','R56_MAP_IMPORT','SEA_PASSAGE_SET',
                'ARMY_EMBARK','ARMY_DISEMBARK','ARMY_DISEMBARK_GM','GM_RECON_REPORT'))
          ORDER BY audit.created_at,audit.id LIMIT $3`,
        [guildId,config.movement_log_started_at,Math.min(50,Math.max(1,limit))]
      )).rows;
      let published=0;
      for(const row of records){
        const message=await channel.send({embeds:[movementLogEmbed(row)],allowedMentions:{parse:[]}});
        await db.query(
          `INSERT INTO movement_log_deliveries(audit_log_id,guild_id,channel_id,message_id)
           VALUES($1,$2,$3,$4) ON CONFLICT(audit_log_id) DO NOTHING`,
          [row.id,guildId,channel.id,message.id]
        );
        published++;
      }
      return published;
    }finally{
      if(locked)await db.query("SELECT pg_advisory_unlock(hashtext($1))",[`movement-log:${guildId}`]).catch((error)=>
        logger.error({error,guildId},"Hareket log kilidi bırakılamadı"));
      db.release();
    }
  }
};
