import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import type { CityPolicyKey } from "../domain/catalog.js";
import {
  assessSettlementEventRisk, findWeightedSelection, SETTLEMENT_EVENT_TYPES,
  type EventRiskAssessment, type EventRiskFactor, type SettlementEventState, type SettlementEventType
} from "../domain/events.js";
import { isResourceType, type ResourceType } from "../domain/resources.js";
import { GameError } from "./game-service.js";

interface EventSettlementRow extends SettlementEventState {
  id: string;
  country_id: string;
  country_name: string;
  name: string;
  population: number;
  slave_population: number;
  ruin_stage: number;
  is_conquered: boolean;
  resource_type: string;
  besieged: boolean;
}


interface ActiveSettlementRow {
  id: string;
  country_id: string;
  country_name: string;
  name: string;
  black_market_active: boolean;
  epidemic_active: boolean;
  unrest_active: boolean;
  rebellion_active: boolean;
}
interface EventDrawRow {
  id: string;
  guild_id: string;
  event_type: SettlementEventType;
  selected_settlement_id: string | null;
  selected_country_id: string | null;
  selected_settlement_name: string;
  selected_country_name: string;
  scope_country_id: string | null;
  candidate_count: number;
  eligible_count: number;
  excluded_count: number;
  total_weight: number;
  roll: number;
  selected_weight: number;
  range_start: number;
  range_end: number;
  current_turn: number;
  actor_user_id: string;
  status: "PENDING" | "APPLIED" | "CANCELLED";
  details: { factors?: EventRiskFactor[] };
}

export interface SettlementEventCandidate extends EventRiskAssessment {
  settlementId: string;
  settlementName: string;
  countryId: string;
  countryName: string;
}

export interface SettlementEventRiskReport {
  type: SettlementEventType;
  currentTurn: number;
  scopeCountryId: string | null;
  totalCandidates: number;
  eligibleCandidates: number;
  excludedCandidates: number;
  totalWeight: number;
  candidates: SettlementEventCandidate[];
}

export interface SettlementEventDraw {
  id: string;
  type: SettlementEventType;
  settlementId: string;
  settlementName: string;
  countryId: string;
  countryName: string;
  currentTurn: number;
  candidateCount: number;
  eligibleCount: number;
  excludedCount: number;
  totalWeight: number;
  roll: number;
  selectedWeight: number;
  rangeStart: number;
  rangeEnd: number;
  factors: EventRiskFactor[];
}

export interface SettlementEventApplication {
  type: SettlementEventType;
  settlementId: string;
  settlementName: string;
  countryId: string;
  countryName: string;
  currentTurn: number;
  weight: number;
  drawId: string | null;
}

export interface ActiveSettlementEvent {
  type: SettlementEventType;
  settlementId: string;
  settlementName: string;
  countryId: string;
  countryName: string;
  startedTurn: number | null;
}

export interface ActiveSettlementEventReport {
  currentTurn: number;
  events: ActiveSettlementEvent[];
}

async function writeAudit(client: DbClient, guildId: string, actorId: string, action: string, settlementId: string, details: unknown): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'settlement',$4,$5::jsonb)",
    [guildId, actorId, action, settlementId, JSON.stringify(details)]
  );
}

async function riskReport(client: DbClient, guildId: string, type: SettlementEventType, scopeCountryId: string | null): Promise<SettlementEventRiskReport> {
  const guild = (await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId])).rows[0];
  if (!guild) throw new GameError("Sunucu oyun ayarları bulunamadı.");

  if (scopeCountryId) {
    const scope = await client.query("SELECT 1 FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [scopeCountryId, guildId]);
    if (!scope.rowCount) throw new GameError("Seçilen ülke bu Discord sunucusuna ait değil.");
  }

  const rows = (await client.query<EventSettlementRow>(
    `SELECT s.id,s.country_id,c.name AS country_name,s.name,s.population,s.slave_population,s.ruin_stage,
            s.is_conquered,s.resource_type,s.black_market_active,s.epidemic_active,s.unrest_active,s.rebellion_active,
            EXISTS(SELECT 1 FROM battles b WHERE b.defender_settlement_id=s.id AND b.terrain='SIEGE'
                       AND b.status NOT IN ('FINISHED','CANCELLED')) AS besieged
       FROM settlements s JOIN countries c ON c.id=s.country_id
      WHERE c.guild_id=$1 AND c.status='ACTIVE' AND ($2::uuid IS NULL OR c.id=$2::uuid)
      ORDER BY c.name,s.name,s.id`,
    [guildId, scopeCountryId]
  )).rows;

  if (!rows.length) {
    return { type, currentTurn: guild.current_turn, scopeCountryId, totalCandidates: 0, eligibleCandidates: 0,
      excludedCandidates: 0, totalWeight: 0, candidates: [] };
  }

  const ids = rows.map((settlement) => settlement.id);
  const buildingRows = (await client.query<{ settlement_id: string; building_type: string; level: number }>(
    "SELECT settlement_id,building_type,level FROM buildings WHERE settlement_id=ANY($1::uuid[]) AND status='ACTIVE' AND level>0", [ids]
  )).rows;
  const policyRows = (await client.query<{ settlement_id: string; policy_key: CityPolicyKey }>(
    "SELECT settlement_id,policy_key FROM settlement_policies WHERE settlement_id=ANY($1::uuid[]) AND status='ACTIVE'", [ids]
  )).rows;
  const merchantRows = (await client.query<{ assigned_settlement_id: string }>(
    "SELECT DISTINCT assigned_settlement_id FROM country_characters WHERE assigned_settlement_id=ANY($1::uuid[]) AND assignment='AGORA' AND role='MERCHANT'", [ids]
  )).rows;
  const tradedRows = (await client.query<{ settlement_id: string; resource_type: string }>(
    `SELECT ta.proposer_settlement_id AS settlement_id,receiver.resource_type
       FROM trade_agreements ta JOIN settlements receiver ON receiver.id=ta.receiver_settlement_id
      WHERE ta.guild_id=$1 AND ta.status='ACTIVE' AND ta.proposer_settlement_id=ANY($2::uuid[])
     UNION ALL
     SELECT ta.receiver_settlement_id AS settlement_id,proposer.resource_type
       FROM trade_agreements ta JOIN settlements proposer ON proposer.id=ta.proposer_settlement_id
      WHERE ta.guild_id=$1 AND ta.status='ACTIVE' AND ta.receiver_settlement_id=ANY($2::uuid[])`,
    [guildId, ids]
  )).rows;
  const historyRows = (await client.query<{ settlement_id: string; last_turn: number }>(
    "SELECT settlement_id,MAX(turn)::integer AS last_turn FROM settlement_events WHERE settlement_id=ANY($1::uuid[]) AND event_type=$2 AND triggered=TRUE GROUP BY settlement_id",
    [ids, type]
  )).rows;

  const buildings = new Map<string, Record<string, number>>();
  for (const row of buildingRows) {
    const values = buildings.get(row.settlement_id) ?? {};
    values[row.building_type] = row.level;
    buildings.set(row.settlement_id, values);
  }
  const policies = new Map<string, CityPolicyKey[]>();
  for (const row of policyRows) {
    const values = policies.get(row.settlement_id) ?? [];
    values.push(row.policy_key);
    policies.set(row.settlement_id, values);
  }
  const resources = new Map<string, ResourceType[]>();
  for (const row of rows) resources.set(row.id, isResourceType(row.resource_type) ? [row.resource_type] : []);
  for (const row of tradedRows) {
    if (!isResourceType(row.resource_type)) continue;
    const values = resources.get(row.settlement_id) ?? [];
    if (!values.includes(row.resource_type)) values.push(row.resource_type);
    resources.set(row.settlement_id, values);
  }
  const merchants = new Set(merchantRows.map((merchant) => merchant.assigned_settlement_id));
  const lastTurns = new Map(historyRows.map((row) => [row.settlement_id, row.last_turn]));

  const candidates = rows.map((settlement): SettlementEventCandidate => {
    const assessment = assessSettlementEventRisk(type, {
      population: settlement.population,
      slavePopulation: settlement.slave_population,
      ruinStage: settlement.ruin_stage,
      conquered: settlement.is_conquered,
      besieged: settlement.besieged,
      resources: resources.get(settlement.id) ?? [],
      buildings: buildings.get(settlement.id) ?? {},
      policies: policies.get(settlement.id) ?? [],
      assignedMerchant: merchants.has(settlement.id),
      state: settlement,
      currentTurn: guild.current_turn,
      lastTriggeredTurn: lastTurns.get(settlement.id) ?? null
    });
    return { ...assessment, settlementId: settlement.id, settlementName: settlement.name,
      countryId: settlement.country_id, countryName: settlement.country_name };
  }).sort((left, right) => right.weight - left.weight || left.countryName.localeCompare(right.countryName, "tr") || left.settlementName.localeCompare(right.settlementName, "tr"));

  const eligibleCandidates = candidates.filter((candidate) => candidate.weight > 0).length;
  return {
    type,
    currentTurn: guild.current_turn,
    scopeCountryId,
    totalCandidates: candidates.length,
    eligibleCandidates,
    excludedCandidates: candidates.length - eligibleCandidates,
    totalWeight: candidates.reduce((sum, candidate) => sum + candidate.weight, 0),
    candidates
  };
}

function convertDraw(row: EventDrawRow): SettlementEventDraw {
  if (!row.selected_settlement_id || !row.selected_country_id) throw new GameError("Seçilen yerleşke veya ülke artık mevcut değil.");
  return {
    id: row.id, type: row.event_type, settlementId: row.selected_settlement_id,
    settlementName: row.selected_settlement_name, countryId: row.selected_country_id,
    countryName: row.selected_country_name, currentTurn: row.current_turn,
    candidateCount: row.candidate_count, eligibleCount: row.eligible_count,
    excludedCount: row.excluded_count, totalWeight: row.total_weight, roll: row.roll,
    selectedWeight: row.selected_weight, rangeStart: row.range_start, rangeEnd: row.range_end,
    factors: row.details.factors ?? []
  };
}

export const eventService = {
  async active(input: { guildId: string }): Promise<ActiveSettlementEventReport> {
    return withTransaction(async (client) => {
      const guild = (await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [input.guildId])).rows[0];
      if (!guild) throw new GameError("Sunucu oyun ayarları bulunamadı.");
      const settlements = (await client.query<ActiveSettlementRow>(
        `SELECT s.id,s.country_id,c.name AS country_name,s.name,
                s.black_market_active,s.epidemic_active,s.unrest_active,s.rebellion_active
           FROM settlements s JOIN countries c ON c.id=s.country_id
          WHERE c.guild_id=$1 AND c.status='ACTIVE'
            AND (s.black_market_active OR s.epidemic_active OR s.unrest_active OR s.rebellion_active)
          ORDER BY c.name,s.name,s.id`,
        [input.guildId]
      )).rows;
      if (!settlements.length) return { currentTurn: guild.current_turn, events: [] };

      const history = (await client.query<{ settlement_id: string; event_type: SettlementEventType; started_turn: number }>(
        `SELECT settlement_id,event_type,MAX(turn)::integer AS started_turn
           FROM settlement_events
          WHERE settlement_id=ANY($1::uuid[]) AND triggered=TRUE
          GROUP BY settlement_id,event_type`,
        [settlements.map((settlement) => settlement.id)]
      )).rows;
      const startedTurns = new Map(history.map((row) => [`${row.settlement_id}:${row.event_type}`, row.started_turn]));
      const events: ActiveSettlementEvent[] = [];
      for (const settlement of settlements) {
        for (const type of Object.keys(SETTLEMENT_EVENT_TYPES) as SettlementEventType[]) {
          if (!settlement[SETTLEMENT_EVENT_TYPES[type].stateColumn]) continue;
          events.push({
            type,
            settlementId: settlement.id,
            settlementName: settlement.name,
            countryId: settlement.country_id,
            countryName: settlement.country_name,
            startedTurn: startedTurns.get(`${settlement.id}:${type}`) ?? null
          });
        }
      }
      events.sort((left, right) => left.countryName.localeCompare(right.countryName, "tr")
        || left.settlementName.localeCompare(right.settlementName, "tr")
        || left.type.localeCompare(right.type));
      return { currentTurn: guild.current_turn, events };
    });
  },

  async risks(input: { guildId: string; eventType: SettlementEventType; countryId?: string | null }): Promise<SettlementEventRiskReport> {
    return withTransaction((client) => riskReport(client, input.guildId, input.eventType, input.countryId ?? null));
  },

  async select(input: { guildId: string; actorId: string; eventType: SettlementEventType; countryId?: string | null }): Promise<SettlementEventDraw> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`event:${input.guildId}:${input.eventType}`]);
      const report = await riskReport(client, input.guildId, input.eventType, input.countryId ?? null);
      const eligible = report.candidates.filter((candidate) => candidate.weight > 0);
      if (!eligible.length) throw new GameError(`${SETTLEMENT_EVENT_TYPES[input.eventType].label} için uygun yerleşke bulunamadı; risk listesini kontrol edin.`);

      const roll = randomInt(1, report.totalWeight + 1);
      const selection = findWeightedSelection(eligible, roll);
      const selected = selection.selected;
      await client.query("UPDATE settlement_event_draws SET status='CANCELLED' WHERE guild_id=$1 AND event_type=$2 AND status='PENDING'", [input.guildId, input.eventType]);
      const result = await client.query<EventDrawRow>(
        `INSERT INTO settlement_event_draws(
           guild_id,event_type,selected_settlement_id,selected_country_id,selected_settlement_name,selected_country_name,
           scope_country_id,candidate_count,eligible_count,excluded_count,total_weight,roll,selected_weight,
           range_start,range_end,current_turn,actor_user_id,details
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb) RETURNING *`,
        [input.guildId, input.eventType, selected.settlementId, selected.countryId, selected.settlementName, selected.countryName,
          input.countryId ?? null, report.totalCandidates, report.eligibleCandidates, report.excludedCandidates,
          report.totalWeight, roll, selected.weight, selection.rangeStart, selection.rangeEnd,
          report.currentTurn, input.actorId, JSON.stringify({ factors: selected.factors })]
      );
      const draw = result.rows[0]!;
      await writeAudit(client, input.guildId, input.actorId, "SETTLEMENT_EVENT_SELECT", selected.settlementId,
        { eventType: input.eventType, drawId: draw.id, roll, totalWeight: report.totalWeight, selectedWeight: selected.weight });
      return convertDraw(draw);
    });
  },

  async apply(input: {
    guildId: string; actorId: string; eventType?: SettlementEventType;
    drawId?: string; countryId?: string; settlementId?: string;
  }): Promise<SettlementEventApplication> {
    return withTransaction(async (client) => {
      let draw: EventDrawRow | undefined;
      if (input.drawId) {
        draw = (await client.query<EventDrawRow>("SELECT * FROM settlement_event_draws WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.drawId, input.guildId])).rows[0];
        if (!draw) throw new GameError("Olay seçimi bulunamadı.");
      } else if (!input.countryId || !input.settlementId) {
        if (!input.eventType) throw new GameError("Uygulanacak olay türü seçilmelidir.");
        draw = (await client.query<EventDrawRow>(
          "SELECT * FROM settlement_event_draws WHERE guild_id=$1 AND event_type=$2 AND status='PENDING' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
          [input.guildId, input.eventType]
        )).rows[0];
        if (!draw) throw new GameError("Bekleyen olay seçimi yok. Önce /olay sec kullanın veya ülke ile yerleşkeyi birlikte belirtin.");
      }

      if (draw && draw.status !== "PENDING") throw new GameError("Bu olay seçimi daha önce kullanıldı veya yerine yeni bir seçim yapıldı.");
      const type = input.eventType ?? draw?.event_type;
      if (!type || (draw && type !== draw.event_type)) throw new GameError("Olay türü seçilen kayıtla uyuşmuyor.");
      const countryId = input.countryId ?? draw?.selected_country_id;
      const settlementId = input.settlementId ?? draw?.selected_settlement_id;
      if (!countryId || !settlementId) throw new GameError("Seçilen ülke veya yerleşke artık bulunmuyor.");

      const settlement = (await client.query<EventSettlementRow>(
        `SELECT s.*,c.name AS country_name,
                EXISTS(SELECT 1 FROM battles b WHERE b.defender_settlement_id=s.id AND b.terrain='SIEGE' AND b.status NOT IN ('FINISHED','CANCELLED')) AS besieged
           FROM settlements s JOIN countries c ON c.id=s.country_id
          WHERE s.id=$1 AND s.country_id=$2 AND c.guild_id=$3 FOR UPDATE OF s`,
        [settlementId, countryId, input.guildId]
      )).rows[0];
      if (!settlement) throw new GameError("Olay uygulanacak yerleşke bulunamadı veya sahipliği değişti.");

      const report = await riskReport(client, input.guildId, type, countryId);
      const assessment = report.candidates.find((candidate) => candidate.settlementId === settlement.id);
      if (!assessment || assessment.weight <= 0) throw new GameError(assessment?.blockedReason ?? "Yerleşke bu olaya uygun değil.");

      const definition = SETTLEMENT_EVENT_TYPES[type];
      const additional = type === "REBELLION" ? ",unrest_active=TRUE" : "";
      await client.query(`UPDATE settlements SET ${definition.stateColumn}=TRUE${additional} WHERE id=$1`, [settlement.id]);
      const result = await client.query<{ id: string }>(
        "INSERT INTO settlement_events(settlement_id,turn,event_type,chance,roll,triggered,details) VALUES($1,$2,$3,$4,$5,TRUE,$6::jsonb) RETURNING id",
        [settlement.id, report.currentTurn, type, assessment.weight, draw?.roll ?? 1,
          JSON.stringify({ source: draw ? "WEIGHTED_SELECTION" : "GAME_MASTER_DIRECT", drawId: draw?.id ?? null,
            totalWeight: draw?.total_weight ?? assessment.weight, factors: assessment.factors, actorId: input.actorId })]
      );
      if (draw) {
        await client.query("UPDATE settlement_event_draws SET status='APPLIED',applied_at=NOW(),applied_event_id=$1 WHERE id=$2", [result.rows[0]!.id, draw.id]);
      }
      await writeAudit(client, input.guildId, input.actorId, "SETTLEMENT_EVENT_APPLY", settlement.id,
        { eventType: type, drawId: draw?.id ?? null, turn: report.currentTurn, weight: assessment.weight });
      return {
        type, settlementId: settlement.id, settlementName: settlement.name, countryId: settlement.country_id,
        countryName: settlement.country_name, currentTurn: report.currentTurn, weight: assessment.weight,
        drawId: draw?.id ?? null
      };
    });
  },

  async resolve(input: { guildId: string; actorId: string; eventType: SettlementEventType; countryId: string; settlementId: string }): Promise<SettlementEventApplication> {
    return withTransaction(async (client) => {
      const result = await client.query<EventSettlementRow>(
        "SELECT s.*,c.name AS country_name FROM settlements s JOIN countries c ON c.id=s.country_id WHERE s.id=$1 AND s.country_id=$2 AND c.guild_id=$3 FOR UPDATE OF s",
        [input.settlementId, input.countryId, input.guildId]
      );
      const settlement = result.rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı veya bu sunucuya ait değil.");
      const definition = SETTLEMENT_EVENT_TYPES[input.eventType];
      if (!settlement[definition.stateColumn]) throw new GameError(`${settlement.name} yerleşkesinde aktif ${definition.label} olayı yok.`);
      await client.query(`UPDATE settlements SET ${definition.stateColumn}=FALSE WHERE id=$1`, [settlement.id]);
      const guild = (await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [input.guildId])).rows[0];
      if (!guild) throw new GameError("Sunucu oyun ayarları bulunamadı.");
      await writeAudit(client, input.guildId, input.actorId, "SETTLEMENT_EVENT_RESOLVE", settlement.id,
        { eventType: input.eventType, turn: guild.current_turn });
      return { type: input.eventType, settlementId: settlement.id, settlementName: settlement.name,
        countryId: settlement.country_id, countryName: settlement.country_name, currentTurn: guild.current_turn,
        weight: 0, drawId: null };
    });
  }
};
