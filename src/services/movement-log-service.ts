import { ChannelType, EmbedBuilder, PermissionFlagsBits, type Client } from "discord.js";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { DbClient } from "../db/pool.js";
import { logger } from "../logger.js";
import { GameError } from "./game-service.js";

interface MovementAuditRow {
  id:string; guild_id:string; actor_user_id:string; action:string; entity_type?:string; entity_id:string|null;
  details:Record<string,unknown>; created_at:Date;
}
interface MovementLogContext {
  countryName?:string; formationName?:string; formationKind?:string;
  fleetName?:string; hexCountries?:Record<string,string>;
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
  ARMY_DISEMBARK_SUBMIT:{title:"⚓ Çıkarma emri verildi",color:0x4975b9},
  ARMY_DISEMBARK_BLOCKED:{title:"⚠️ Çıkarma emri durduruldu",color:0xc28649},
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
  speedBonus:"Kaynak hız bonusu (Hex)",speedSources:"Hız sağlayan kaynaklar",
  mode:"Hareket türü",coordinate:"Hex",route:"Rota",processed:"İşlenen emir",
  advanced:"İlerleyen",completed:"Varan",blocked:"Engellenen",ongoing:"Yolda",
  encounters:"Karşılaşma",reconChecks:"Keşif kontrolü",
  light_cavalry:"Hafif süvari",horse_archer:"Atlı okçu",heavy_cavalry:"Ağır süvari",
  effectiveStrength:"Etkin keşif gücü",rollBonus:"Keşif zarı bonusu",
  detectionBonusForEnemy:"Düşmanın fark etme bonusu",sea:"Deniz Hex",
  capacity:"Taşıma kapasitesi",before:"Önceki Hex",arrivedTurn:"Varış turu"
};
const STATUS_LABELS:Record<string,string>={
  SUBMITTED:"Bekliyor",IN_PROGRESS:"Yolda",BLOCKED:"Yönetici kararı bekliyor",
  COMPLETED:"Vardı",CANCELLED:"İptal",FAILED:"Başarısız"
};

function safe(value:unknown):string {
  return String(value??"—").replaceAll("@","＠").replaceAll("`","ˋ").slice(0,1000);
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function logContext(db:DbClient,row:MovementAuditRow):Promise<MovementLogContext>{
  const context:MovementLogContext={};
  const entityId=row.entity_id;
  const orderId=row.entity_type==="movement_order"?entityId:row.details?.orderId;
  if(typeof orderId==="string"&&UUID.test(orderId)){
    const order=(await db.query<{country_name:string;formation_name:string;formation_kind:string}>(
      `SELECT country.name AS country_name,COALESCE(army.name,fleet.name) AS formation_name,
              orders.formation_kind
         FROM movement_orders orders JOIN countries country ON country.id=orders.country_id
         LEFT JOIN armies army ON army.id=orders.army_id
         LEFT JOIN fleets fleet ON fleet.id=orders.fleet_id
        WHERE orders.id=$1 AND orders.guild_id=$2`,[orderId,row.guild_id])).rows[0];
    if(order){context.countryName=order.country_name;context.formationName=order.formation_name;context.formationKind=order.formation_kind;}
  }else if(entityId&&UUID.test(entityId)&&(row.entity_type==="army"||row.entity_type==="fleet")){
    const table=row.entity_type==="army"?"armies":"fleets";
    const formation=(await db.query<{country_name:string;formation_name:string}>(
      `SELECT country.name AS country_name,unit.name AS formation_name FROM ${table} unit
        JOIN countries country ON country.id=unit.country_id WHERE unit.id=$1 AND unit.guild_id=$2`,
      [entityId,row.guild_id])).rows[0];
    if(formation){context.countryName=formation.country_name;context.formationName=formation.formation_name;
      context.formationKind=row.entity_type.toUpperCase();}
  }
  if(typeof row.details?.fleetId==="string"&&UUID.test(row.details.fleetId)){
    const fleetName=(await db.query<{name:string}>(
      "SELECT name FROM fleets WHERE id=$1 AND guild_id=$2",[row.details.fleetId,row.guild_id])).rows[0]?.name;
    if(fleetName)context.fleetName=fleetName;
  }
  const coordinates=[...new Set([row.details?.start,row.details?.destination,row.details?.from,
    row.details?.to,row.details?.coordinate,row.details?.before,row.details?.sea]
    .filter((value):value is string=>typeof value==="string"&&/^[A-Z]{1,3}\d{1,2}$/i.test(value)))];
  if(coordinates.length){
    const hexes=(await db.query<{coordinate:string;country_name:string|null}>(
      `SELECT hex.coordinate,country.name AS country_name FROM map_hexes hex
        LEFT JOIN countries country ON country.id=hex.owner_country_id
        WHERE hex.guild_id=$1 AND hex.coordinate=ANY($2::text[])`,[row.guild_id,coordinates])).rows;
    context.hexCountries=Object.fromEntries(hexes.map((hex)=>[hex.coordinate,hex.country_name??"Sahipsiz / deniz"]));
  }
  return context;
}

export function movementLogEmbed(row:MovementAuditRow,context:MovementLogContext={}):EmbedBuilder {
  const meta=ACTIONS[row.action]??{title:"🗺️ Hareket kaydı",color:0x8191a7};
  const details=row.details??{};
  const fields=Object.entries(details).filter(([key,value])=>value!==null&&value!==undefined&&
    !/id$/i.test(key)&&key!=="formation"&&key!=="country"&&key!=="formationKind"&&
    !(typeof value==="string"&&UUID.test(value))).slice(0,18).map(([key,value])=>{
    const formatted=Array.isArray(value)?value.map(safe).join(" → ")
      : value && typeof value==="object"?JSON.stringify(value)
      : typeof value==="boolean"?(value?"Evet":"Hayır")
      : key==="status"?(STATUS_LABELS[String(value)]??safe(value))
      : key==="mode"?(String(value)==="NORMAL"?"Normal":String(value)==="STRATEGIC"?"Stratejik":safe(value))
      : safe(value);
    const place=typeof value==="string"?context.hexCountries?.[value]:undefined;
    const shown=place?`${formatted} (${safe(place)})`:formatted;
    return `**${safe(FIELD_LABELS[key]??key)}:** ${safe(shown).slice(0,220)}`;
  });
  const country=context.countryName??(typeof details.country==="string"?details.country:null);
  const formation=context.formationName??(typeof details.formation==="string"?details.formation:null);
  const kind=context.formationKind??details.formationKind;
  const summary=[country?`**Devlet:** ${safe(country)}`:null,
    formation?`**${kind==="FLEET"?"Filo":"Ordu"}:** ${safe(formation)}`:null,
    context.fleetName?`**Bağlı filo:** ${safe(context.fleetName)}`:null,
    /^\d{15,22}$/.test(row.actor_user_id)?`**Uygulayan:** <@${row.actor_user_id}>`:null,
    ...fields].filter(Boolean).join("\n");
  return new EmbedBuilder().setColor(meta.color).setTitle(meta.title)
    .setDescription((summary||"Ayrıntı yok.").slice(0,3900))
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
        `SELECT audit.id,audit.guild_id,audit.actor_user_id,audit.action,audit.entity_type,audit.entity_id,audit.details,audit.created_at
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
        const context=await logContext(db,row).catch((error)=>{
          logger.error({error,auditId:row.id},"Hareket logunun adları çözülemedi");return {};
        });
        const message=await channel.send({embeds:[movementLogEmbed(row,context)],allowedMentions:{parse:[]}});
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
