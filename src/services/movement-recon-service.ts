import { randomInt } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { GameError } from "./game-service.js";
import { hexDistance, parseHexCoordinate, reconTerrainBonus, resolveReconRoll,
  resolveUnobservedDetection, scoutSizeModifiers, targetVisibility, type ReconKind, type ReconRollResult } from "../domain/movement.js";
import { isObservedHex } from "../domain/observer-coverage.js";

export interface ReconMovement {
  orderId: string;
  countryId: string;
  armyId: string;
  steps: readonly { fromHexId: string; toHexId: string }[];
}

interface Hex { id: string; coordinate: string; terrain: string; owner_country_id: string | null; region_key: string | null; }
interface Post { id: string; country_id: string; region_key: string; source_settlement_id: string; center: string; }
interface Scout { army_id: string; country_id: string; effective_strength: number; coordinate: string;
  light_cavalry: number; horse_archers: number; heavy_cavalry: number; }

async function targetFacts(client: DbClient, armyId: string): Promise<{
  soldiers: number; units: Array<{ type: string; quantity: number }>; siege: string[]; commander: boolean;
  scoutExposure: number;
}> {
  const army = (await client.query<{ commander_character_id: string | null }>(
    "SELECT commander_character_id FROM armies WHERE id=$1", [armyId]
  )).rows[0];
  const units = (await client.query<{ unit_type: string; quantity: number }>(
    "SELECT unit_type,SUM(quantity)::integer AS quantity FROM army_units WHERE army_id=$1 GROUP BY unit_type ORDER BY unit_type", [armyId]
  )).rows.map((row) => ({ type: row.unit_type, quantity: Number(row.quantity) }));
  const siege = (await client.query<{ asset_type: string }>(
    "SELECT DISTINCT asset_type FROM army_siege_assets WHERE army_id=$1 AND quantity>0 ORDER BY asset_type", [armyId]
  )).rows.map((row) => row.asset_type);
  const detachment = (await client.query<{ effective_strength: number }>(
    "SELECT effective_strength FROM army_scout_detachments WHERE army_id=$1 AND status='ACTIVE'", [armyId]
  )).rows[0];
  return { soldiers: units.reduce((sum,row) => sum+row.quantity,0), units, siege,
    commander: Boolean(army?.commander_character_id),
    scoutExposure: scoutSizeModifiers(Number(detachment?.effective_strength ?? 0)).detectionBonusForEnemy };
}

function broadRange(soldiers: number): string {
  if (soldiers < 1_000) return "1–999";
  if (soldiers < 5_000) return "1.000–4.999";
  if (soldiers < 15_000) return "5.000–14.999";
  if (soldiers < 30_000) return "15.000–29.999";
  return "30.000+";
}

function approximateDirection(from: string,to: string): string {
  const left = parseHexCoordinate(from);
  const right = parseHexCoordinate(to);
  const horizontal = right.column > left.column ? "doğu" : right.column < left.column ? "batı" : "";
  const vertical = right.row > left.row ? "güney" : right.row < left.row ? "kuzey" : "";
  return [vertical,horizontal].filter(Boolean).join("-") || "yakın çevre";
}

export function buildReconReport(result: ReconRollResult, target: Awaited<ReturnType<typeof targetFacts>>,
  from: string, to: string): Record<string, unknown> {
  const base: Record<string, unknown> = { tier: result.tier, label: result.label,
    direction: approximateDirection(from,to), sizeBand: broadRange(target.soldiers) };
  if (result.informationLevel >= 2) base.mainUnitTypes = [...target.units]
    .sort((a,b) => b.quantity-a.quantity).slice(0,3).map((unit) => unit.type);
  if (result.informationLevel >= 3) {
    base.hex = to;
    base.approximateSoldiers = Math.max(100,Math.round(target.soldiers/500)*500);
    base.siegeTypes = target.siege;
  }
  if (result.informationLevel >= 4) {
    base.soldiers = target.soldiers;
    base.composition = target.units;
    base.commanderPresent = target.commander;
  }
  return base;
}

async function recordCheck(client: DbClient, input: {
  guildId: string; turn: number; kind: ReconKind; region: string | null; observerCountryId: string;
  targetCountryId: string; observerArmyId: string | null; targetArmyId: string;
  orderId: string; modifier: number; from: string; to: string; dedupeKey: string;
}): Promise<ReconRollResult | null> {
  if (input.region !== null) {
    const alreadyRolled = await client.query(
      `SELECT 1 FROM reconnaissance_checks WHERE guild_id=$1 AND game_turn=$2
        AND observer_country_id=$3 AND region_key=$4
        AND check_kind IN ('REGIONAL_OBSERVER','MOBILE_SCOUT')
        AND status IN ('PENDING','RESOLVED') LIMIT 1`,
      [input.guildId,input.turn,input.observerCountryId,input.region]
    );
    if (alreadyRolled.rowCount) return null;
  }
  const natural = randomInt(1,21);
  const result = resolveReconRoll(input.kind,natural,input.modifier);
  const facts = await targetFacts(client,input.targetArmyId);
  const check = (await client.query<{ id: string }>(
    `INSERT INTO reconnaissance_checks
      (guild_id,game_turn,check_kind,region_key,observer_country_id,target_country_id,
       observer_army_id,target_army_id,movement_order_id,natural_roll,modifier,total,result_tier,
       information_level,status,dedupe_key,secret_payload,resolved_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'RESOLVED',$15,$16::jsonb,NOW())
     ON CONFLICT DO NOTHING RETURNING id`,
    [input.guildId,input.turn,input.kind,input.region,input.observerCountryId,input.targetCountryId,
      input.observerArmyId,input.targetArmyId,input.orderId,natural,input.modifier,result.total,result.tier,
      result.informationLevel,input.dedupeKey,JSON.stringify({ from:input.from,to:input.to,facts })]
  )).rows[0];
  if (!check) return null;
  if (result.opponentFreeAction) await client.query(
    `INSERT INTO movement_events(guild_id,game_turn,movement_order_id,event_type,audience,dedupe_key,payload)
     VALUES($1,$2,$3,'SCOUT_CRITICAL_FAILURE','ADMIN',$4,$5::jsonb) ON CONFLICT DO NOTHING`,
    [input.guildId,input.turn,input.orderId,`scout-failure:${check.id}`,
      JSON.stringify({ scoutArmyId:input.observerArmyId,enemyArmyId:input.targetArmyId,
        note:"Keşif felaketi: düşman aksiyonu GM kararı gerektirir; otomatik savaş veya baskın başlatılmadı." })]
  );
  if (result.informationLevel) await client.query(
    `INSERT INTO intelligence_reports(reconnaissance_check_id,recipient_country_id,available_turn,information_level,payload)
     VALUES($1,$2,$3,$4,$5::jsonb)`,
    [check.id,input.observerCountryId,input.turn,result.informationLevel,
      JSON.stringify(buildReconReport(result,facts,input.from,input.to))]
  );
  return result;
}

/** Secret checks run inside the same transaction as movement; reruns are deduplicated. */
export async function resolveMovementRecon(client: DbClient, guildId: string, turn: number,
  movements: readonly ReconMovement[]): Promise<number> {
  const active = movements.filter((item) => item.steps.length);
  if (!active.length) return 0;
  const hexRows = (await client.query<Hex>(
    "SELECT id,coordinate,terrain,owner_country_id,region_key FROM map_hexes WHERE guild_id=$1", [guildId]
  )).rows;
  const hexById = new Map(hexRows.map((hex) => [hex.id,hex]));
  const posts = (await client.query<Post>(
    `SELECT post.id,post.country_id,post.region_key,post.source_settlement_id,hex.coordinate AS center
       FROM regional_observer_posts post JOIN map_hexes hex ON hex.id=post.hex_id
       JOIN settlements settlement ON settlement.id=post.source_settlement_id AND settlement.country_id=post.country_id
       JOIN unit_stacks stack ON stack.settlement_id=settlement.id AND stack.unit_type='observer' AND stack.quantity>0
      WHERE post.guild_id=$1 AND post.status='ACTIVE'`, [guildId]
  )).rows;
  const scouts = (await client.query<Scout>(
    `SELECT scout.army_id,army.country_id,scout.effective_strength,scout.light_cavalry,
            scout.horse_archers,scout.heavy_cavalry,hex.coordinate
       FROM army_scout_detachments scout JOIN armies army ON army.id=scout.army_id
       JOIN army_map_positions position ON position.army_id=army.id
       JOIN map_hexes hex ON hex.id=position.hex_id
      WHERE army.guild_id=$1 AND scout.status='ACTIVE'`, [guildId]
  )).rows;
  let recorded = 0;
  for (const post of posts) {
    const contact = active.flatMap((moving) => moving.steps.map((step) => ({ moving, step,
      from:hexById.get(step.fromHexId),to:hexById.get(step.toHexId) })))
      .find((item) => item.moving.countryId !== post.country_id && item.to && isObservedHex(post.center,item.to.coordinate));
    if (!contact?.to || !contact.from) continue;
    const facts = await targetFacts(client,contact.moving.armyId);
    const modifier = targetVisibility(facts.soldiers,facts.siege.length>0,false) + facts.scoutExposure +
      reconTerrainBonus("REGIONAL_OBSERVER",contact.to.terrain as Parameters<typeof reconTerrainBonus>[1],true);
    const result = await recordCheck(client,{ guildId,turn,kind:"REGIONAL_OBSERVER",region:post.region_key,
      observerCountryId:post.country_id,targetCountryId:contact.moving.countryId,observerArmyId:null,
      targetArmyId:contact.moving.armyId,orderId:contact.moving.orderId,modifier,
      from:contact.from.coordinate,to:contact.to.coordinate,
      dedupeKey:`observer:${turn}:${post.country_id}:${post.region_key}` });
    if (!result) continue;
    recorded += 1;
    if (result.observerExposed) {
      const enemyScout = (await client.query<{ effective_strength: number }>(
        `SELECT effective_strength FROM army_scout_detachments
         WHERE army_id=$1 AND status='ACTIVE' AND effective_strength>=200`, [contact.moving.armyId]
      )).rows[0];
      let counterTier: string | null = null;
      if (enemyScout) {
        const previous = (await client.query<{ check_kind: string; result_tier: string | null }>(
          `SELECT check_kind,result_tier FROM reconnaissance_checks WHERE guild_id=$1 AND game_turn=$2
           AND observer_country_id=$3 AND region_key=$4
           AND check_kind IN ('REGIONAL_OBSERVER','MOBILE_SCOUT') AND status='RESOLVED'
           ORDER BY created_at LIMIT 1`,
          [guildId,turn,contact.moving.countryId,post.region_key]
        )).rows[0];
        if (previous) counterTier = previous.check_kind === "MOBILE_SCOUT" ? previous.result_tier : null;
        else {
          const natural = randomInt(1,21);
          const counter = resolveReconRoll("MOBILE_SCOUT",natural,scoutSizeModifiers(Number(enemyScout.effective_strength)).rollBonus);
          const inserted = await client.query(
            `INSERT INTO reconnaissance_checks
             (guild_id,game_turn,check_kind,region_key,observer_country_id,target_country_id,
              observer_army_id,movement_order_id,natural_roll,modifier,total,result_tier,information_level,
              status,dedupe_key,secret_payload,resolved_at)
             VALUES($1,$2,'MOBILE_SCOUT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'RESOLVED',$13,$14::jsonb,NOW())
             ON CONFLICT DO NOTHING`,
            [guildId,turn,post.region_key,contact.moving.countryId,post.country_id,contact.moving.armyId,
              contact.moving.orderId,natural,scoutSizeModifiers(Number(enemyScout.effective_strength)).rollBonus,
              counter.total,counter.tier,counter.informationLevel,
              `counter-scout:${turn}:${contact.moving.countryId}:${post.region_key}`,
              JSON.stringify({ exposedObserverPostId:post.id })]
          );
          if (inserted.rowCount) { counterTier = counter.tier; recorded += 1; }
        }
      }
      const destroyed = counterTier === "STRONG" || counterTier === "SHARP" || counterTier === "SUPERIOR";
      await client.query(
        `UPDATE regional_observer_posts SET status=$2,ineffective_until_turn=$3,updated_at=NOW()
         WHERE id=$1`, [post.id,destroyed ? "DESTROYED" : "INEFFECTIVE",destroyed ? null : turn+1]
      );
      if (destroyed) {
        await client.query("DELETE FROM unit_stacks WHERE settlement_id=$1 AND unit_type='observer'",[post.source_settlement_id]);
        await client.query(
          `INSERT INTO movement_events(guild_id,game_turn,movement_order_id,event_type,audience,dedupe_key,payload)
           VALUES($1,$2,$3,'OBSERVER_DESTROYED','ADMIN',$4,$5::jsonb) ON CONFLICT DO NOTHING`,
          [guildId,turn,contact.moving.orderId,`observer-destroyed:${post.id}:${turn}`,
            JSON.stringify({ observerPostId:post.id,settlementId:post.source_settlement_id,enemyArmyId:contact.moving.armyId })]
        );
      }
    }
  }
  for (const scout of scouts) {
    const available = (await client.query<{ unit_type: string; quantity: number }>(
      `SELECT unit_type,SUM(quantity)::integer AS quantity FROM army_units
       WHERE army_id=$1 AND unit_type IN ('light_cavalry','horse_archer','heavy_cavalry') GROUP BY unit_type`,
      [scout.army_id]
    )).rows;
    const byType = new Map(available.map((unit) => [unit.unit_type,Number(unit.quantity)]));
    if (Number(scout.light_cavalry) > (byType.get("light_cavalry") ?? 0) ||
        Number(scout.horse_archers) > (byType.get("horse_archer") ?? 0) ||
        Number(scout.heavy_cavalry) > (byType.get("heavy_cavalry") ?? 0)) continue;
    const contact = active.flatMap((moving) => moving.steps.map((step) => ({ moving, step,
      from:hexById.get(step.fromHexId),to:hexById.get(step.toHexId) })))
      .find((item) => item.moving.countryId !== scout.country_id && item.to &&
        hexDistance(parseHexCoordinate(scout.coordinate),parseHexCoordinate(item.to.coordinate)) <= 1);
    if (!contact?.to || !contact.from) continue;
    const facts = await targetFacts(client,contact.moving.armyId);
    const modifier = scoutSizeModifiers(Number(scout.effective_strength)).rollBonus +
      reconTerrainBonus("MOBILE_SCOUT",contact.to.terrain as Parameters<typeof reconTerrainBonus>[1],false) +
      targetVisibility(facts.soldiers,facts.siege.length>0,false) + facts.scoutExposure;
    const result = await recordCheck(client,{ guildId,turn,kind:"MOBILE_SCOUT",region:contact.to.region_key,
      observerCountryId:scout.country_id,targetCountryId:contact.moving.countryId,observerArmyId:scout.army_id,
      targetArmyId:contact.moving.armyId,orderId:contact.moving.orderId,modifier,
      from:contact.from.coordinate,to:contact.to.coordinate,
      dedupeKey:`scout:${turn}:${scout.army_id}` });
    if (!result) continue;
    recorded += 1;
    if (result.tier === "CRITICAL_FAILURE" || result.label === "Dağılmış Keşif") await client.query(
      `UPDATE army_scout_detachments SET status=$2,unavailable_until_turn=$3,updated_at=NOW() WHERE army_id=$1`,
      [scout.army_id,result.tier === "CRITICAL_FAILURE" ? "CUT_OFF" : "DISPERSED",turn+1]
    );
  }
  for (const moving of active) {
    for (const step of moving.steps) {
      const from = hexById.get(step.fromHexId);
      const to = hexById.get(step.toHexId);
      if (!from || !to || !to.owner_country_id || to.owner_country_id === moving.countryId || !to.region_key) continue;
      if (posts.some((post) => post.country_id === to.owner_country_id && isObservedHex(post.center,to.coordinate))) continue;
      const facts = await targetFacts(client,moving.armyId);
      const modifier = targetVisibility(facts.soldiers,facts.siege.length>0,false);
      const natural = randomInt(1,21);
      const result = resolveUnobservedDetection(natural,modifier);
      const check = (await client.query<{ id: string }>(
        `INSERT INTO reconnaissance_checks
          (guild_id,game_turn,check_kind,region_key,observer_country_id,target_country_id,target_army_id,
           movement_order_id,natural_roll,modifier,total,result_tier,information_level,status,dedupe_key,secret_payload,resolved_at)
         VALUES($1,$2,'UNOBSERVED_RUMOR',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'RESOLVED',$13,$14::jsonb,NOW())
         ON CONFLICT DO NOTHING RETURNING id`,
        [guildId,turn,to.region_key,to.owner_country_id,moving.countryId,moving.armyId,moving.orderId,
          natural,modifier,result.total,result.tier,
          result.tier === "UNDETECTED" || result.tier === "CRITICAL_FAILURE" ? 0 : 1,
          `rumor:${turn}:${to.owner_country_id}:${to.region_key}`,
          JSON.stringify({ from:from.coordinate,to:to.coordinate,facts })]
      )).rows[0];
      if (!check) continue;
      recorded += 1;
      if (result.tier !== "UNDETECTED" && result.tier !== "CRITICAL_FAILURE") await client.query(
        `INSERT INTO intelligence_reports(reconnaissance_check_id,recipient_country_id,available_turn,information_level,payload)
         VALUES($1,$2,$3,1,$4::jsonb)`,
        [check.id,to.owner_country_id,turn+(result.tier === "DELAYED_RUMOR" ? 1 : 0),
          JSON.stringify({ label:"Askerî hareketlilik söylentisi",direction:approximateDirection(from.coordinate,to.coordinate),
            sizeBand:facts.soldiers < 5000 ? "Küçük" : facts.soldiers < 30000 ? "Orta" : "Büyük" })]
      );
    }
  }
  return recorded;
}

export async function countryIntelligenceReports(guildId: string,countryId: string,currentTurn: number,page = 1): Promise<Array<{
  available_turn: number; payload: Record<string, unknown>;
}>> {
  const client = await pool.connect();
  try {
    return (await client.query<{ available_turn: number; payload: Record<string, unknown> }>(
      `SELECT report.available_turn,report.payload FROM intelligence_reports report
       JOIN reconnaissance_checks check_record ON check_record.id=report.reconnaissance_check_id
      WHERE check_record.guild_id=$1 AND report.recipient_country_id=$2 AND report.available_turn<=$3
      ORDER BY report.available_turn DESC,report.created_at DESC LIMIT 5 OFFSET $4`,
      [guildId,countryId,currentTurn,(page-1)*5]
    )).rows;
  } finally { client.release(); }
}

export async function adminReconChecks(guildId: string,page: number): Promise<Array<{
  game_turn: number; check_kind: string; observer_name: string | null; target_name: string;
  region_key: string | null; natural_roll: number | null; modifier: number; total: number | null; result_tier: string | null;
}>> {
  const client = await pool.connect();
  try {
    return (await client.query<{
      game_turn: number; check_kind: string; observer_name: string | null; target_name: string;
      region_key: string | null; natural_roll: number | null; modifier: number; total: number | null; result_tier: string | null;
    }>(`SELECT check_record.game_turn,check_record.check_kind,observer.name AS observer_name,
                target.name AS target_name,check_record.region_key,check_record.natural_roll,
                check_record.modifier,check_record.total,check_record.result_tier
           FROM reconnaissance_checks check_record
           LEFT JOIN countries observer ON observer.id=check_record.observer_country_id
           JOIN countries target ON target.id=check_record.target_country_id
          WHERE check_record.guild_id=$1 ORDER BY check_record.created_at DESC,check_record.id DESC
          LIMIT 10 OFFSET $2`, [guildId,(page-1)*10])).rows;
  } finally { client.release(); }
}

/** Explicit GM intelligence supplement: never rewrites or conceals the original secret die. */
export async function adminIssueReconReport(input:{
  guildId:string;actorId:string;recipientCountryId:string;targetCountryId:string;
  informationLevel:number;note:string;coordinate:string;
}):Promise<void>{
  await withTransaction(async(client)=>{
    const note=input.note.trim();
    if(note.length<5 || note.length>500)throw new GameError("İstihbarat notu 5–500 karakter olmalıdır.");
    if(!Number.isInteger(input.informationLevel)||input.informationLevel<0||input.informationLevel>4)
      throw new GameError("Bilgi seviyesi 0–4 arasında tam sayı olmalıdır.");
    if(input.recipientCountryId===input.targetCountryId)throw new GameError("Bir devlet kendisini hedef olarak seçemez.");
    const guild=(await client.query<{current_turn:number}>(
      "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE",[input.guildId]
    )).rows[0];
    if(!guild)throw new GameError("Sunucu oyun kaydı bulunamadı.");
    const countries=await client.query(
      "SELECT id FROM countries WHERE guild_id=$1 AND id=ANY($2::uuid[])",
      [input.guildId,[input.recipientCountryId,input.targetCountryId]]
    );
    if(countries.rowCount!==2)throw new GameError("İstihbaratın iki devleti de bu sunucuda bulunmalıdır.");
    const hex=(await client.query<{coordinate:string;region_key:string|null}>(
      "SELECT coordinate,region_key FROM map_hexes WHERE guild_id=$1 AND coordinate=upper($2)",
      [input.guildId,input.coordinate.trim()]
    )).rows[0];
    if(!hex)throw new GameError("İstihbaratın bağlanacağı geçerli Hex bulunamadı.");
    const dedupeKey=`gm-recon:${randomUUID()}`;
    const check=(await client.query<{id:string}>(
      `INSERT INTO reconnaissance_checks(guild_id,game_turn,check_kind,region_key,observer_country_id,target_country_id,
         modifier,result_tier,information_level,status,dedupe_key,secret_payload,resolved_at)
       VALUES($1,$2,'GM_REPORT',$3,$4,$5,0,'GM_REPORT',$6,'RESOLVED',$7,$8::jsonb,NOW()) RETURNING id`,
      [input.guildId,guild.current_turn,hex.region_key,input.recipientCountryId,input.targetCountryId,
        input.informationLevel,dedupeKey,JSON.stringify({manual:true,note,hex:hex.coordinate,actorId:input.actorId})]
    )).rows[0]!;
    await client.query(
      `INSERT INTO intelligence_reports(reconnaissance_check_id,recipient_country_id,available_turn,information_level,payload)
       VALUES($1,$2,$3,$4,$5::jsonb)`,
      [check.id,input.recipientCountryId,guild.current_turn,input.informationLevel,
        JSON.stringify({label:"Yönetici İstihbaratı",manualNote:note,hex:hex.coordinate,tier:"GM_REPORT"})]
    );
    await client.query(
      `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'GM_RECON_REPORT','reconnaissance_check',$3,$4::jsonb)`,
      [input.guildId,input.actorId,check.id,JSON.stringify({recipientCountryId:input.recipientCountryId,
        targetCountryId:input.targetCountryId,informationLevel:input.informationLevel,note,hex:hex.coordinate})]
    );
  });
}
