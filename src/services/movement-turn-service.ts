import type { DbClient } from "../db/pool.js";
import { eligibleForMovementStage, selectTurnMovementSteps, type MovementResolutionStage, type ResolutionStep } from "../domain/movement-resolution.js";
import type { FormationKind, MovementOrderStatus } from "../domain/movement.js";
import { GameError } from "./game-service.js";
import { resolveMovementRecon } from "./movement-recon-service.js";
import { fleetCargoSnapshot } from "./movement-transport-service.js";
import { resolveArmyMusterStage, type MusterStageSummary } from "./army-muster-service.js";
import { fleetAccessibleStep } from "../domain/coastal-navigation.js";
import { coastalPortSql } from "./coastal-navigation-sql.js";

export interface MovementStageSummary {
  enabled: boolean;
  stage: MovementResolutionStage;
  turn: number;
  processed: number;
  advanced: number;
  completed: number;
  blocked: number;
  ongoing: number;
  ownershipUpdates: number;
  alreadyProcessed: boolean;
  reconChecks: number;
  muster: MusterStageSummary;
  encounters: number;
}

interface OrderRow {
  id: string;
  country_id: string;
  country_name:string;
  formation_name:string;
  formation_kind: FormationKind;
  army_id: string | null;
  fleet_id: string | null;
  status: MovementOrderStatus;
  issued_turn: number;
  current_step: number;
  last_processed_turn: number | null;
  start_hex_id: string;
  effective_allowance: number;
  metadata: Record<string, unknown>;
}

interface StepRow extends ResolutionStep {
  domain: string;
  coastal_port: boolean;
  from_domain: string;
  from_coastal_port: boolean;
  passable: boolean;
  owner_country_id: string | null;
}

interface PositionRow {
  formation_kind: FormationKind;
  formation_id: string;
  country_id: string;
  hex_id: string;
}

interface PlannedOrder {
  order: OrderRow;
  position: PositionRow | null;
  steps: StepRow[];
  traversed: StepRow[];
  blockedReason: string | null;
  encounter: { hexId: string; kind: "LAND_ENTRY" | "CONTACT"; otherFormationId?: string; otherOrderId?: string } | null;
}

function key(kind: FormationKind, id: string): string { return `${kind}:${id}`; }

function blockAt(plan: PlannedOrder, stepIndex: number, reason: string): void {
  const index = plan.traversed.findIndex((step) => step.stepIndex === stepIndex);
  if (index < 0) return;
  plan.traversed = plan.traversed.slice(0, index);
  plan.blockedReason = reason;
}

async function loadSteps(client: DbClient, orderId: string): Promise<StepRow[]> {
  const rows = (await client.query<{
    step_index: number; from_hex_id: string; to_hex_id: string; movement_cost: number;
    domain: string; coastal_port: boolean; from_domain: string; from_coastal_port: boolean;
    passable: boolean; owner_country_id: string | null;
  }>(
    `SELECT step.step_index,step.from_hex_id,step.to_hex_id,step.movement_cost,
            target.domain,target.passable,target.owner_country_id,
            source.domain AS from_domain,${coastalPortSql("source")} AS from_coastal_port,
            ${coastalPortSql("target")} AS coastal_port
       FROM movement_order_steps step JOIN map_hexes target ON target.id=step.to_hex_id
       JOIN map_hexes source ON source.id=step.from_hex_id
      WHERE step.order_id=$1 ORDER BY step.step_index`,
    [orderId]
  )).rows;
  return rows.map((row) => ({
    stepIndex: Number(row.step_index), fromHexId: row.from_hex_id, toHexId: row.to_hex_id,
    cost: Number(row.movement_cost), domain: row.domain, coastal_port: row.coastal_port,
    from_domain: row.from_domain, from_coastal_port: row.from_coastal_port, passable: row.passable,
    owner_country_id: row.owner_country_id
  }));
}

export async function resolveMovementStage(
  client: DbClient, guildId: string, actorId: string, turn: number, stage: MovementResolutionStage
): Promise<MovementStageSummary> {
  const disabled: MovementStageSummary = {
    enabled: false, stage, turn, processed: 0, advanced: 0, completed: 0,
    blocked: 0, ongoing: 0, ownershipUpdates: 0, alreadyProcessed: false, reconChecks: 0,
    muster: { processed:0,advanced:0,joined:0,blocked:0,waiting:0 }, encounters:0
  };
  const settings = (await client.query<{ enabled: boolean; map_revision: number }>(
    "SELECT enabled,map_revision FROM guild_movement_settings WHERE guild_id=$1 FOR UPDATE", [guildId]
  )).rows[0];
  if (!settings?.enabled) return disabled;

  if (stage === "ADVANCE") {
    const pending = await client.query(
      "SELECT 1 FROM movement_orders WHERE guild_id=$1 AND status='SUBMITTED' AND issued_turn<$2 LIMIT 1",
      [guildId, turn]
    );
    if (pending.rowCount) throw new GameError("Önce önceki turun hareket emirlerini /tur durdur ile çözümlemelisiniz.");
  }

  await client.query(
    "INSERT INTO movement_resolution_runs(guild_id,game_turn) VALUES($1,$2) ON CONFLICT DO NOTHING", [guildId, turn]
  );
  const run = (await client.query<{ summary: Record<string, MovementStageSummary> }>(
    "SELECT summary FROM movement_resolution_runs WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE", [guildId, turn]
  )).rows[0]!;
  const previous = run.summary?.[stage];
  if (previous) return { ...disabled,...previous,muster:previous.muster??disabled.muster,
    encounters:previous.encounters??0,alreadyProcessed:true };

  // Yerleşke devri haritanın ilk ithalindeki ülke rengini kalıcı sahipliğe dönüştürmez.
  const ownership = await client.query(
    `WITH region_owners AS (
       SELECT anchor.region_key,settlement.country_id
         FROM settlement_map_positions position
         JOIN map_hexes anchor ON anchor.id=position.hex_id
         JOIN settlements settlement ON settlement.id=position.settlement_id
        WHERE anchor.guild_id=$1 AND anchor.region_key IS NOT NULL
     )
     UPDATE map_hexes hex SET owner_country_id=owner.country_id,updated_at=NOW()
       FROM region_owners owner
      WHERE hex.guild_id=$1 AND hex.region_key=owner.region_key
        AND hex.owner_country_id IS DISTINCT FROM owner.country_id`,
    [guildId]
  );
  const ownershipUpdates = ownership.rowCount ?? 0;
  if (ownershipUpdates) {
    await client.query(
      "UPDATE guild_movement_settings SET map_revision=map_revision+1,updated_at=NOW() WHERE guild_id=$1", [guildId]
    );
  }
  const mapRevision = Number(settings.map_revision) + (ownershipUpdates ? 1 : 0);

  const orderRows = (await client.query<OrderRow>(
    `SELECT movement.id,movement.country_id,country.name AS country_name,
            COALESCE(army.name,fleet.name) AS formation_name,
            movement.formation_kind,movement.army_id,movement.fleet_id,movement.status,
            movement.issued_turn,movement.current_step,movement.last_processed_turn,
            movement.start_hex_id,movement.effective_allowance,movement.metadata
       FROM movement_orders movement JOIN countries country ON country.id=movement.country_id
       LEFT JOIN armies army ON army.id=movement.army_id
       LEFT JOIN fleets fleet ON fleet.id=movement.fleet_id
      WHERE movement.guild_id=$1 AND ${stage === "STOP"
        ? "movement.status='SUBMITTED' AND movement.issued_turn=$2"
        : "movement.status='IN_PROGRESS' AND movement.issued_turn<$2"}
        AND (movement.last_processed_turn IS NULL OR movement.last_processed_turn<$2)
      ORDER BY movement.created_at,movement.id FOR UPDATE OF movement`,
    [guildId, turn]
  )).rows;
  const positions = (await client.query<PositionRow>(
    `SELECT 'ARMY'::text AS formation_kind,army.id AS formation_id,army.country_id,position.hex_id
       FROM army_map_positions position JOIN armies army ON army.id=position.army_id WHERE army.guild_id=$1
     UNION ALL
     SELECT 'FLEET'::text AS formation_kind,fleet.id AS formation_id,fleet.country_id,position.hex_id
       FROM fleet_map_positions position JOIN fleets fleet ON fleet.id=position.fleet_id WHERE fleet.guild_id=$1`,
    [guildId]
  )).rows;
  const positionByFormation = new Map(positions.map((position) => [key(position.formation_kind, position.formation_id), position]));
  const occupancy = new Map<string, PositionRow[]>();
  for (const position of positions) {
    const place = key(position.formation_kind, position.hex_id);
    occupancy.set(place, [...(occupancy.get(place) ?? []), position]);
  }

  const plans: PlannedOrder[] = [];
  for (const order of orderRows) {
    if (!eligibleForMovementStage({
      status: order.status, issuedTurn: Number(order.issued_turn),
      lastProcessedTurn: order.last_processed_turn === null ? null : Number(order.last_processed_turn)
    }, turn, stage)) continue;
    const formationId = order.formation_kind === "ARMY" ? order.army_id! : order.fleet_id!;
    const position = positionByFormation.get(key(order.formation_kind, formationId)) ?? null;
    const steps = await loadSteps(client, order.id);
    const plan: PlannedOrder = { order, position, steps, traversed: [], blockedReason: null, encounter:null };
    const currentStep = Number(order.current_step);
    const expectedHex = currentStep === 0 ? order.start_hex_id : steps[currentStep - 1]?.toHexId;
    if (!position || position.country_id !== order.country_id || position.hex_id !== expectedHex) {
      plan.blockedReason = "Birliğin konumu veya sahibi kayıtlı hareket rotasıyla uyuşmuyor.";
    } else if (Number(order.metadata?.mapRevision) !== mapRevision) {
      plan.blockedReason = "Harita sahipliği veya sürümü değişti; rota yönetici tarafından incelenmeli.";
    } else if (order.formation_kind === "FLEET" && !(await fleetCargoSnapshot(client,formationId)).valid) {
      plan.blockedReason = "Filonun güncel asker veya kuşatma yükü kapasiteyi aşıyor.";
    } else if ((occupancy.get(key(order.formation_kind, position.hex_id)) ?? [])
      .some((item) => item.country_id !== order.country_id)) {
      plan.blockedReason = "Bulunulan Hex'te karşı tarafın birliği var; karşılaşma yönetici kararı gerektiriyor.";
      const enemy = (occupancy.get(key(order.formation_kind, position.hex_id)) ?? [])
        .find((item) => item.country_id !== order.country_id)!;
      plan.encounter = { hexId:position.hex_id,kind:"CONTACT",otherFormationId:enemy.formation_id };
    } else {
      try {
        const selected = selectTurnMovementSteps(steps, currentStep, Number(order.effective_allowance));
        plan.traversed = selected.traversed as StepRow[];
        let from = position.hex_id;
        for (const step of [...plan.traversed]) {
          let reason: string | null = null;
          if (step.fromHexId !== from || !step.passable || (order.formation_kind === "ARMY"
            ? step.domain !== "LAND"
            : !fleetAccessibleStep(step.from_domain,step.from_coastal_port,step.domain,step.coastal_port))) {
            reason = "Rota veya geçilebilir Hex türü değişti; yönetici incelemesi gerekiyor.";
          } else if (order.formation_kind === "FLEET" && step.coastal_port && step.owner_country_id !== order.country_id) {
            reason = "Yabancı kıyı yerleşkesine giriş yönetici kararı gerektiriyor.";
          } else if ((occupancy.get(key(order.formation_kind, step.toHexId)) ?? [])
            .some((item) => item.country_id !== order.country_id)) {
            reason = "Hedef Hex'te karşı tarafın birliği var; karşılaşma yönetici kararı gerektiriyor.";
            const enemy = (occupancy.get(key(order.formation_kind, step.toHexId)) ?? [])
              .find((item) => item.country_id !== order.country_id)!;
            plan.encounter = { hexId:step.toHexId,kind:"CONTACT",otherFormationId:enemy.formation_id };
          } else if (order.formation_kind === "ARMY" && step.owner_country_id !== null && step.owner_country_id !== order.country_id
            && !(Array.isArray(order.metadata?.authorizedHexIds) && order.metadata.authorizedHexIds.includes(step.toHexId))) {
            reason = "Başka devletin toprağına geçiş için yönetici kararı gerekiyor.";
            plan.encounter = { hexId:step.toHexId,kind:"LAND_ENTRY" };
          }
          if (reason) { blockAt(plan, step.stepIndex, reason); break; }
          from = step.toHexId;
        }
        if (!plan.blockedReason && !plan.traversed.length && selected.nextStep) {
          plan.blockedReason = "İlk kalan adımın maliyeti bu turun hareket hakkını aşıyor.";
        }
      } catch {
        plan.blockedReason = "Hareket rotası bozulmuş; yönetici incelemesi gerekiyor.";
      }
    }
    plans.push(plan);
  }

  // Aynı anda aynı Hex'e yaklaşan farklı devletler otomatik savaş başlatmaz.
  for (let left = 0; left < plans.length; left += 1) {
    for (let right = left + 1; right < plans.length; right += 1) {
      const a = plans[left]!;
      const b = plans[right]!;
      if (a.blockedReason || b.blockedReason) continue;
      if (a.order.formation_kind !== b.order.formation_kind || a.order.country_id === b.order.country_id) continue;
      const conflict = a.traversed.find((step) => b.traversed.some((other) =>
        other.toHexId === step.toHexId || (other.fromHexId === step.toHexId && other.toHexId === step.fromHexId)));
      if (!conflict) continue;
      const opposing = b.traversed.find((step) => step.toHexId === conflict.toHexId ||
        (step.fromHexId === conflict.toHexId && step.toHexId === conflict.fromHexId))!;
      const reason = "Karşı devletle eşzamanlı rota kesişmesi; yönetici incelemesi gerekiyor.";
      blockAt(a, conflict.stepIndex, reason);
      blockAt(b, opposing.stepIndex, reason);
      a.encounter = { hexId:conflict.toHexId,kind:"CONTACT",otherOrderId:b.order.id };
      b.encounter = { hexId:conflict.toHexId,kind:"CONTACT",otherOrderId:a.order.id };
    }
  }
  // İki farklı devlet aynı yabancı Hex sınırında durdurulduysa iki ayrı izin dosyası açma.
  for (let left=0;left<plans.length;left++) for(let right=left+1;right<plans.length;right++){
    const a=plans[left]!,b=plans[right]!;
    if(a.order.country_id===b.order.country_id || a.order.formation_kind!==b.order.formation_kind ||
      !a.encounter || !b.encounter || a.encounter.hexId!==b.encounter.hexId ||
      a.encounter.otherFormationId || b.encounter.otherFormationId)continue;
    a.encounter={hexId:a.encounter.hexId,kind:"CONTACT",otherOrderId:b.order.id};
    b.encounter={hexId:b.encounter.hexId,kind:"CONTACT",otherOrderId:a.order.id};
    a.blockedReason="Karşı devletle eşzamanlı rota kesişmesi; yönetici incelemesi gerekiyor.";
    b.blockedReason=a.blockedReason;
  }

  let encounters = 0;
  const seenPairs = new Set<string>();
  const orderByFormation = new Map(plans.filter((plan)=>Boolean(plan.blockedReason)).map((plan) => [key(plan.order.formation_kind,
    plan.order.formation_kind === "ARMY" ? plan.order.army_id! : plan.order.fleet_id!),plan.order.id]));
  for (const plan of plans) {
    if (!plan.blockedReason || !plan.encounter) continue;
    const encounter = plan.encounter;
    const otherId = encounter.otherOrderId ?? (encounter.otherFormationId
      ? orderByFormation.get(key(plan.order.formation_kind,encounter.otherFormationId)) : undefined);
    const pair = otherId ? [plan.order.id,otherId].sort() : null;
    const dedupe = pair ? pair.join(":") : `${plan.order.id}:${encounter.otherFormationId ?? encounter.hexId}`;
    if (seenPairs.has(dedupe)) continue;
    seenPairs.add(dedupe);
    const inserted = await client.query(
      `INSERT INTO movement_encounters(guild_id,game_turn,hex_id,case_kind,formation_kind,
         order_a_id,order_b_id,stationary_formation_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [guildId,turn,encounter.hexId,encounter.kind,plan.order.formation_kind,
        pair ? pair[0] : plan.order.id,pair ? pair[1] : null,pair ? null : encounter.otherFormationId ?? null]
    );
    encounters += inserted.rowCount ?? 0;
  }

  const summary: MovementStageSummary = {
    enabled: true, stage, turn, processed: plans.length, advanced: 0, completed: 0,
    blocked: 0, ongoing: 0, ownershipUpdates, alreadyProcessed: false, reconChecks: 0,
    muster: { processed:0,advanced:0,joined:0,blocked:0,waiting:0 }, encounters
  };
  summary.reconChecks = await resolveMovementRecon(client,guildId,turn,plans
    .filter((plan) => plan.order.formation_kind === "ARMY" && plan.traversed.length)
    .map((plan) => ({ orderId:plan.order.id,countryId:plan.order.country_id,armyId:plan.order.army_id!,
      steps:plan.traversed.map((step) => ({ fromHexId:step.fromHexId,toHexId:step.toHexId })) })));
  for (const plan of plans) {
    const { order, traversed, blockedReason, steps } = plan;
    const formationId = order.formation_kind === "ARMY" ? order.army_id! : order.fleet_id!;
    const currentStep = Number(order.current_step) + traversed.length;
    if (traversed.length) {
      const table = order.formation_kind === "ARMY" ? "army_map_positions" : "fleet_map_positions";
      const column = order.formation_kind === "ARMY" ? "army_id" : "fleet_id";
      const updated = await client.query(
        `UPDATE ${table} SET hex_id=$2,arrived_turn=$3,version=version+1,updated_at=NOW()
          WHERE ${column}=$1 AND hex_id=$4`,
        [formationId, traversed[traversed.length - 1]!.toHexId, turn, plan.position!.hex_id]
      );
      if (updated.rowCount !== 1) throw new GameError("Birlik konumu çözümleme sırasında değişti; işlem geri alındı.");
      await client.query(
        `UPDATE movement_order_steps SET status='RESOLVED',resolved_turn=$3,resolution=$4::jsonb
          WHERE order_id=$1 AND step_index=ANY($2::integer[]) AND status='PENDING'`,
        [order.id, traversed.map((step) => step.stepIndex), turn, JSON.stringify({ stage })]
      );
      summary.advanced += 1;
    }
    if (blockedReason && currentStep < steps.length) {
      await client.query(
        `UPDATE movement_order_steps SET status='BLOCKED',resolution=$3::jsonb
          WHERE order_id=$1 AND step_index=$2 AND status='PENDING'`,
        [order.id, currentStep + 1, JSON.stringify({ stage, reason: blockedReason })]
      );
    }
    const status: MovementOrderStatus = blockedReason ? "BLOCKED" : currentStep >= steps.length ? "COMPLETED" : "IN_PROGRESS";
    await client.query(
      `UPDATE movement_orders SET status=$2,current_step=$3,last_processed_turn=$4,
              blocked_reason=$5,updated_at=NOW() WHERE id=$1`,
      [order.id, status, currentStep, turn, blockedReason]
    );
    if(traversed.length||blockedReason||status==="COMPLETED"){
      const fromHexId=plan.position?.hex_id??order.start_hex_id;
      const toHexId=traversed.at(-1)?.toHexId??fromHexId;
      const codes=(await client.query<{id:string;coordinate:string}>(
        "SELECT id,coordinate FROM map_hexes WHERE id=ANY($1::uuid[])",[[fromHexId,toHexId]]
      )).rows;
      const byId=new Map(codes.map((hex)=>[hex.id,hex.coordinate]));
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'MOVEMENT_ORDER_STAGE','movement_order',$3,$4::jsonb)`,
        [guildId,actorId,order.id,JSON.stringify({turn,stage,status,country:order.country_name,
          formationKind:order.formation_kind,formation:order.formation_name,from:byId.get(fromHexId),to:byId.get(toHexId),
          stepsAdvanced:traversed.length,currentStep,totalSteps:steps.length,blockedReason})]
      );
    }
    if (status === "BLOCKED") summary.blocked += 1;
    else if (status === "COMPLETED") summary.completed += 1;
    else summary.ongoing += 1;
  }
  summary.muster = await resolveArmyMusterStage(client,guildId,actorId,turn,stage);
  const merged = { ...(run.summary ?? {}), [stage]: summary };
  const hasBlockedOrders = Object.values(merged).some((item) => item.blocked > 0 || item.muster?.blocked > 0);
  await client.query(
    `UPDATE movement_resolution_runs SET status=$3,processed_orders=processed_orders+$4,
            failed_orders=failed_orders+$5,summary=$6::jsonb,started_at=COALESCE(started_at,NOW()),
            completed_at=NOW() WHERE guild_id=$1 AND game_turn=$2`,
    [guildId, turn, hasBlockedOrders ? "PARTIAL" : "COMPLETED", summary.processed, summary.blocked, JSON.stringify(merged)]
  );
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'MOVEMENT_STAGE_RESOLVE','guild',$1,$3::jsonb)`,
    [guildId, actorId, JSON.stringify(summary)]
  );
  return summary;
}
