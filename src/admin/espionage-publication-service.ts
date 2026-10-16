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
  const [settlementResult, overrideResult] = await Promise.all([
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

  return {
    summary: {
      settlements: settlementResult.rows.length,
      mappedSettlements: mapped,
      unmappedSettlements: settlementResult.rows.length - mapped,
      templates: templates.length,
      customizedTemplates: overrideResult.rows.length,
      enabledTemplates: templates.filter((item) => item.enabled).length
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
