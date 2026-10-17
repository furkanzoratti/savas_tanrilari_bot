import { z } from "zod";
import { adminConfig } from "./config.js";
import { adminPool, withAdminTransaction, type AdminDbClient } from "./db.js";
import {
  ESPIONAGE_PUBLICATION_DEFAULTS,
  ESPIONAGE_PUBLICATION_IMAGE_KEYS,
  ESPIONAGE_PUBLICATION_PLACEHOLDERS,
  espionagePublicationPlaceholders,
  espionagePublicationTemplate,
  type EspionagePublicationImageKey,
  type EspionagePublicationOutcome,
  type PlayerEspionageTarget
} from "../domain/espionage-publications.js";
import { PLAYER_ESPIONAGE_TARGETS } from "../domain/espionage.js";
import { ESPIONAGE_TARGETS } from "../domain/espionage.js";

const settlementChannelSchema = z.object({
  settlementId: z.string().uuid(),
  channel: z.string().trim().max(120).default("")
});

const templateSchema = z.object({
  targetType: z.string().refine((value): value is PlayerEspionageTarget => (PLAYER_ESPIONAGE_TARGETS as readonly string[]).includes(value), "Geçersiz casusluk görevi."),
  outcome: z.enum(["SUCCESS", "FAILURE"]),
  titleTemplate: z.string().trim().min(2).max(100),
  bodyTemplate: z.string().trim().min(10).max(1800),
  imageKey: z.string().nullable().optional(),
  enabled: z.boolean()
});

const resetTemplateSchema = z.object({
  targetType: z.string().refine((value): value is PlayerEspionageTarget => (PLAYER_ESPIONAGE_TARGETS as readonly string[]).includes(value), "Geçersiz casusluk görevi."),
  outcome: z.enum(["SUCCESS", "FAILURE"])
});

const allowedPlaceholderKeys = new Set(ESPIONAGE_PUBLICATION_PLACEHOLDERS.map((item) => item.key));
const allowedImageKeys = new Set<string>(ESPIONAGE_PUBLICATION_IMAGE_KEYS);

interface TemplateOverrideRow {
  target_type: PlayerEspionageTarget;
  outcome: EspionagePublicationOutcome;
  title_template: string;
  body_template: string;
  image_key: EspionagePublicationImageKey | null;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

interface PublicationEventRow {
  source:"ESPIONAGE"|"DEATH";
  id:string;
  game_turn:number;
  event_type:string;
  country_name:string|null;
  settlement_name:string|null;
  subject_name:string|null;
  outcome:"SUCCESS"|"FAILURE"|null;
  effect_text:string|null;
  delivery_status:"PENDING"|"PUBLISHED"|"FAILED"|"SKIPPED"|"UNKNOWN";
  posted_at:string|null;
  publish_attempts:number;
  last_error:string|null;
  created_at:string;
}

function channelId(input: string): string | null {
  if (!input.trim()) return null;
  const match = input.match(/\d{15,25}/u);
  if (!match) throw new Error("Discord kanal ID'si veya <#kanal> etiketi girin.");
  return match[0];
}

function validatePlaceholders(title: string, body: string): void {
  const invalid = [...new Set([...espionagePublicationPlaceholders(title), ...espionagePublicationPlaceholders(body)])]
    .filter((key) => !allowedPlaceholderKeys.has(key as never));
  if (invalid.length) throw new Error(`Desteklenmeyen değişken: ${invalid.map((key) => `{{${key}}}`).join(", ")}`);
}

async function audit(
  client: AdminDbClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: unknown
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [adminConfig.guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function dashboard() {
  const [settlementResult, overrideResult,eventResult] = await Promise.all([
    adminPool.query<{
      id: string;
      name: string;
      country_id: string;
      country_name: string;
      channel_id: string | null;
    }>(
      `SELECT settlement.id,settlement.name,settlement.country_id,country.name AS country_name,
              settlement.espionage_event_channel_id AS channel_id
         FROM settlements settlement
         JOIN countries country ON country.id=settlement.country_id
        WHERE country.guild_id=$1
        ORDER BY country.name,settlement.name`,
      [adminConfig.guildId]
    ),
    adminPool.query<TemplateOverrideRow>(
      `SELECT target_type,outcome,title_template,body_template,image_key,enabled,updated_by,updated_at
         FROM espionage_public_templates
        WHERE guild_id=$1`,
      [adminConfig.guildId]
    ),
    adminPool.query<PublicationEventRow>(
      `WITH state AS (
         SELECT current_turn FROM guilds WHERE discord_id=$1
       ), events AS (
         SELECT 'ESPIONAGE'::text AS source,operation.id,operation.resolve_turn AS game_turn,
                operation.target_type AS event_type,target.name AS country_name,
                settlement.name AS settlement_name,
                COALESCE(target_character.name,target_dynasty.name,target_roman.name,target_army.name) AS subject_name,
                CASE WHEN operation.severity IS NOT NULL AND operation.severity<>'NONE' THEN 'SUCCESS' ELSE 'FAILURE' END AS outcome,
                operation.effect_text,operation.public_delivery_status AS delivery_status,
                operation.public_posted_at AS posted_at,operation.public_publish_attempts AS publish_attempts,
                operation.public_last_error AS last_error,COALESCE(operation.resolved_at,operation.created_at) AS created_at
           FROM espionage_operations operation
           JOIN countries target ON target.id=operation.target_country_id
           JOIN settlements settlement ON settlement.id=operation.target_settlement_id
           LEFT JOIN country_characters target_character ON target_character.id=operation.target_character_id
           LEFT JOIN dynasty_members target_dynasty ON operation.target_noble_type='DYNASTY' AND target_dynasty.id=operation.target_noble_id
           LEFT JOIN roman_family_members target_roman ON operation.target_noble_type='ROMAN_FAMILY' AND target_roman.id=operation.target_noble_id
           LEFT JOIN armies target_army ON target_army.id=operation.target_army_id
          WHERE operation.guild_id=$1 AND operation.status='RESOLVED'
            AND operation.resolve_turn>=GREATEST((SELECT current_turn FROM state)-7,0)
         UNION ALL
         SELECT 'DEATH'::text AS source,publication.id,publication.game_turn,
                publication.subject_type AS event_type,country.name AS country_name,
                settlement.name AS settlement_name,publication.subject_name,NULL::text AS outcome,
                COALESCE(publication.death_reason,publication.subject_role) AS effect_text,
                CASE WHEN publication.public_posted_at IS NOT NULL THEN 'PUBLISHED'
                     WHEN publication.last_error IS NOT NULL THEN 'FAILED' ELSE 'PENDING' END AS delivery_status,
                publication.public_posted_at AS posted_at,publication.publish_attempts,
                publication.last_error,publication.created_at
           FROM death_publications publication
           LEFT JOIN countries country ON country.id=publication.country_id
           LEFT JOIN settlements settlement ON settlement.id=CASE
             WHEN publication.subject_type IN ('DYNASTY_MEMBER','ROMAN_FAMILY_MEMBER') THEN
               COALESCE(
                 country.capital_settlement_id,
                 (SELECT fallback.id FROM settlements fallback
                   WHERE fallback.country_id=country.id
                   ORDER BY fallback.population DESC,fallback.name,fallback.id LIMIT 1)
               )
             ELSE publication.settlement_id
           END
          WHERE publication.guild_id=$1
            AND publication.game_turn>=GREATEST((SELECT current_turn FROM state)-7,0)
       )
       SELECT * FROM events ORDER BY game_turn DESC,created_at DESC LIMIT 500`,
      [adminConfig.guildId]
    )
  ]);

  const overrides = new Map(overrideResult.rows.map((row) => [`${row.target_type}:${row.outcome}`, row]));
  const templates = ESPIONAGE_PUBLICATION_DEFAULTS.map((defaults) => {
    const custom = overrides.get(`${defaults.targetType}:${defaults.outcome}`);
    const effectiveImageKey=custom ? custom.image_key : defaults.imageKey;
    return {
      ...defaults,
      ...(custom ? {
        titleTemplate: custom.title_template,
        bodyTemplate: custom.body_template,
        imageKey: custom.image_key,
        enabled: custom.enabled
      } : {}),
      customized: Boolean(custom),
      updatedBy: custom?.updated_by ?? null,
      updatedAt: custom?.updated_at ?? null,
      imageUrl: effectiveImageKey ? `/espionage-events/${effectiveImageKey}` : null
    };
  });
  const mapped = settlementResult.rows.filter((row) => row.channel_id).length;
  const events=eventResult.rows.map((row)=>({
    source:row.source,
    id:row.id,
    turn:Number(row.game_turn),
    type:row.event_type,
    typeLabel:row.source==="ESPIONAGE"
      ? ESPIONAGE_TARGETS[row.event_type as keyof typeof ESPIONAGE_TARGETS]?.label??row.event_type
      : row.event_type==="ACADEMY_CHARACTER"?"Karakter ölümü"
        :row.event_type==="DYNASTY_MEMBER"?"Hanedan ölümü":"Roma ailesi ölümü",
    countryName:row.country_name,
    settlementName:row.settlement_name,
    subjectName:row.subject_name,
    outcome:row.outcome,
    effectText:row.effect_text,
    status:row.delivery_status,
    postedAt:row.posted_at,
    attempts:Number(row.publish_attempts),
    failureReason:row.last_error,
    createdAt:row.created_at
  }));

  return {
    summary: {
      settlements: settlementResult.rows.length,
      mappedSettlements: mapped,
      unmappedSettlements: settlementResult.rows.length - mapped,
      templates: templates.length,
      customizedTemplates: overrideResult.rows.length,
      enabledTemplates: templates.filter((item) => item.enabled).length,
      publishedEvents:events.filter((item)=>item.status==="PUBLISHED").length,
      failedEvents:events.filter((item)=>item.status==="FAILED").length,
      pendingEvents:events.filter((item)=>item.status==="PENDING").length,
      unknownEvents:events.filter((item)=>item.status==="UNKNOWN").length
    },
    settlements: settlementResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      countryId: row.country_id,
      countryName: row.country_name,
      channelId: row.channel_id,
      configured: Boolean(row.channel_id)
    })),
    templates,
    events,
    eventTurns:[...new Set(events.map((event)=>event.turn))],
    detectionPreviews:[
      {key:"CAPTURED",label:"Casus yakalandı",description:"Casusun adı ve gönderen devlet açıkça paylaşılır.",imageUrl:"/espionage-events/captured-spy-success.png"},
      {key:"COUNTRY_IDENTIFIED",label:"Casus kaçtı, kaynak tespit edildi",description:"Casusun adı gizli kalır; operasyonu gönderen devlet açıklanır.",imageUrl:"/espionage-events/spy-country-identified.png"},
      {key:"INTERVENTION_NOTICED",label:"Dış müdahale fark edildi",description:"Casus ve devlet açıklanmaz; yalnız dış müdahale ihtimali belirtilir.",imageUrl:"/espionage-events/captured-spy-failure.png"},
      {key:"UNTRACED",label:"İz bulunamadı",description:"Casusun akıbetine ilişkin ikinci bir yayın gösterilmez.",imageUrl:"/espionage-events/spy-untraced.png"}
    ],
    deathPreviews:[
      {key:"MONARCH",label:"Hükümdar ölümü",title:"⚰️ Roma Hükümdarını Kaybetti",description:"Cornelius Hanedanı mensubu 68 yaşındaki Kral Marcus, ilerleyen yaşı nedeniyle hayatını kaybetti. Ölüm haberi Roma kayıtlarına geçti.",imageUrl:"/death-events/dynasty-deaths-banner.png"},
      {key:"MALE",label:"Erkek karakter ölümü",title:"⚰️ Cassius Hayatını Kaybetti",description:"Trakya hizmetindeki 47 yaşındaki Komutan Cassius, savaş sırasında hayatını kaybetti. Ölüm haberi Atina kayıtlarına geçti.",imageUrl:"/death-events/dynasty-death-male-banner.png"},
      {key:"FEMALE",label:"Kadın karakter ölümü",title:"⚰️ Julii Ailesi • Yas Haberi",description:"Julii ailesi mensubu 61 yaşındaki Livia, ilerleyen yaşı nedeniyle hayatını kaybetti. Ölüm haberi Roma kayıtlarına geçti.",imageUrl:"/death-events/dynasty-death-female-banner.png"}
    ],
    placeholders: ESPIONAGE_PUBLICATION_PLACEHOLDERS,
    images: ESPIONAGE_PUBLICATION_IMAGE_KEYS.map((key) => ({ key, url: `/espionage-events/${key}` }))
  };
}

async function setSettlementChannel(actorId: string, raw: unknown) {
  const input = settlementChannelSchema.parse(raw);
  const nextChannelId = channelId(input.channel);
  return withAdminTransaction(async (client) => {
    const before = (await client.query<{ id: string; name: string; channel_id: string | null }>(
      `SELECT settlement.id,settlement.name,settlement.espionage_event_channel_id AS channel_id
         FROM settlements settlement
         JOIN countries country ON country.id=settlement.country_id
        WHERE settlement.id=$1 AND country.guild_id=$2
        FOR UPDATE OF settlement`,
      [input.settlementId, adminConfig.guildId]
    )).rows[0];
    if (!before) throw new Error("Yerleşke bulunamadı.");
    await client.query(
      `UPDATE settlements settlement
          SET espionage_event_channel_id=$1
        WHERE settlement.id=$2
          AND EXISTS (
            SELECT 1 FROM countries country
             WHERE country.id=settlement.country_id AND country.guild_id=$3
          )`,
      [nextChannelId, input.settlementId, adminConfig.guildId]
    );
    await audit(client, actorId, "ESPIONAGE_PUBLICATION_CHANNEL_SET", "settlement", input.settlementId, {
      settlementName: before.name,
      beforeChannelId: before.channel_id,
      afterChannelId: nextChannelId
    });
    return { ok: true, settlementId: input.settlementId, channelId: nextChannelId };
  });
}

async function updateTemplate(actorId: string, raw: unknown) {
  const input = templateSchema.parse(raw);
  validatePlaceholders(input.titleTemplate, input.bodyTemplate);
  const imageKey = input.imageKey?.trim() || null;
  if (imageKey && !allowedImageKeys.has(imageKey)) throw new Error("Seçilen olay görseli tanınmıyor.");
  const defaults = espionagePublicationTemplate(input.targetType, input.outcome);
  if (!defaults) throw new Error("Hazır görev metni bulunamadı.");

  return withAdminTransaction(async (client) => {
    const before = (await client.query<TemplateOverrideRow>(
      `SELECT target_type,outcome,title_template,body_template,image_key,enabled,updated_by,updated_at
         FROM espionage_public_templates
        WHERE guild_id=$1 AND target_type=$2 AND outcome=$3
        FOR UPDATE`,
      [adminConfig.guildId, input.targetType, input.outcome]
    )).rows[0] ?? null;
    await client.query(
      `INSERT INTO espionage_public_templates(
         guild_id,target_type,outcome,title_template,body_template,image_key,enabled,updated_by,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT(guild_id,target_type,outcome) DO UPDATE SET
         title_template=EXCLUDED.title_template,
         body_template=EXCLUDED.body_template,
         image_key=EXCLUDED.image_key,
         enabled=EXCLUDED.enabled,
         updated_by=EXCLUDED.updated_by,
         updated_at=NOW()`,
      [adminConfig.guildId, input.targetType, input.outcome, input.titleTemplate, input.bodyTemplate, imageKey, input.enabled, actorId]
    );
    await audit(client, actorId, "ESPIONAGE_PUBLICATION_TEMPLATE_UPDATE", "espionage_public_template", `${input.targetType}:${input.outcome}`, {
      before: before ?? defaults,
      after: { ...input, imageKey }
    });
    return { ok: true, targetType: input.targetType, outcome: input.outcome };
  });
}

async function resetTemplate(actorId: string, raw: unknown) {
  const input = resetTemplateSchema.parse(raw);
  const defaults = espionagePublicationTemplate(input.targetType, input.outcome);
  if (!defaults) throw new Error("Hazır görev metni bulunamadı.");
  return withAdminTransaction(async (client) => {
    const removed = (await client.query<TemplateOverrideRow>(
      `DELETE FROM espionage_public_templates
        WHERE guild_id=$1 AND target_type=$2 AND outcome=$3
      RETURNING target_type,outcome,title_template,body_template,image_key,enabled,updated_by,updated_at`,
      [adminConfig.guildId, input.targetType, input.outcome]
    )).rows[0] ?? null;
    await audit(client, actorId, "ESPIONAGE_PUBLICATION_TEMPLATE_RESET", "espionage_public_template", `${input.targetType}:${input.outcome}`, {
      removed,
      restored: defaults
    });
    return { ok: true, targetType: input.targetType, outcome: input.outcome };
  });
}

export const adminEspionagePublicationService = {
  dashboard,
  setSettlementChannel,
  updateTemplate,
  resetTemplate
};
