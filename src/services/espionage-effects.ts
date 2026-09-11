import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { BUILDINGS, SHIPS, SIEGE_ASSETS, UNITS, buildingBaseCost } from "../domain/catalog.js";
import type { EspionageSeverity, EspionageTarget } from "../domain/espionage.js";

export interface EspionageEffectOperation {
  attacker_country_id: string;
  target_country_id: string;
  target_settlement_id: string;
  target_character_id: string | null;
  target_army_id: string | null;
  spy_character_id: string;
  target_type: EspionageTarget;
}

const buildingTargets = new Set<EspionageTarget>(["ECONOMIC","MILITARY","PUBLIC","NAVAL"]);
const percent = (severity: EspionageSeverity, light: number, medium: number, heavy: number): number =>
  severity === "LIGHT" ? light : severity === "MEDIUM" ? medium : heavy;

interface RecruitmentWaveTarget {
  id: string;
  unit_type: string;
  quantity: number;
  due_turn: number;
}

interface ProductionOrderTarget {
  kind: "SHIP" | "SIEGE";
  id: string;
  item_type: string;
  quantity: number;
  completion_turn: number;
}

function limitedDetails(details: string[]): string {
  if (details.length <= 6) return details.join("; ");
  return details.slice(0, 6).join("; ") + `; +${details.length - 6} emir daha`;
}

function catalogName(catalog: Record<string, { name: string }>, key: string): string {
  return catalog[key]?.name ?? key;
}

export function recruitmentWaveLabel(wave: RecruitmentWaveTarget): string {
  const unitName = catalogName(UNITS, wave.unit_type);
  return `${Number(wave.quantity).toLocaleString("tr-TR")} ${unitName} (Tur ${wave.due_turn})`;
}

export function productionOrderLabel(order: ProductionOrderTarget): string {
  const name = order.kind === "SHIP" ? catalogName(SHIPS, order.item_type) : catalogName(SIEGE_ASSETS, order.item_type);
  return `${Number(order.quantity).toLocaleString("tr-TR")} ${name} (Tur ${order.completion_turn})`;
}

async function syncTreasury(client: DbClient, countryId: string): Promise<void> {
  await client.query(
    "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
    [countryId]
  );
}

export async function espionageTargetExists(client: DbClient, operation: EspionageEffectOperation): Promise<boolean> {
  if (buildingTargets.has(operation.target_type)) return true;
  const queries: Partial<Record<EspionageTarget,string>> = {
    CONSTRUCTION: "SELECT 1 FROM buildings WHERE settlement_id=$1 AND status='BUILDING' LIMIT 1",
    RECRUITMENT_SABOTAGE: "SELECT 1 FROM recruitment_orders recruit JOIN recruitment_waves wave ON wave.order_id=recruit.id WHERE recruit.settlement_id=$1 AND recruit.status='TRAINING' AND wave.processed_at IS NULL LIMIT 1",
    PRODUCTION_SABOTAGE: "SELECT 1 FROM naval_orders WHERE settlement_id=$1 AND status='BUILDING' UNION ALL SELECT 1 FROM siege_orders WHERE settlement_id=$1 AND status='BUILDING' LIMIT 1",
    TRADE_COLLAPSE: "SELECT 1 FROM trade_agreements WHERE status='ACTIVE' AND (proposer_settlement_id=$1 OR receiver_settlement_id=$1) LIMIT 1",
    PARALYZE_GOVERNMENT: "SELECT 1 FROM settlement_policies WHERE settlement_id=$1 AND status='ACTIVE' LIMIT 1",
    AGGRAVATE_EVENT: "SELECT 1 FROM settlements WHERE id=$1 AND (black_market_active OR epidemic_active OR unrest_active OR rebellion_active)",
    POISON_GARRISON: "SELECT 1 FROM unit_stacks WHERE settlement_id=$1 AND force_type='GARRISON' AND quantity>0 LIMIT 1",
    DESTROY_SIEGE_SUPPLIES: "SELECT 1 FROM battles WHERE defender_settlement_id=$1 AND terrain='SIEGE' AND status NOT IN ('FINISHED','CANCELLED') LIMIT 1",
    SABOTAGE_FLEET: "SELECT 1 FROM naval_units WHERE settlement_id=$1 AND quantity>0 LIMIT 1"
  };
  if (["SUPPLY_COLLAPSE","DESERTION"].includes(operation.target_type)) {
    if (!operation.target_army_id) return false;
    return Boolean((await client.query(
      "SELECT 1 FROM armies WHERE id=$1 AND country_id=$2",
      [operation.target_army_id,operation.target_country_id]
    )).rowCount);
  }
  if (["DISCREDIT","KIDNAP","ASSASSINATE"].includes(operation.target_type)) {
    if (!operation.target_character_id) return false;
    return Boolean((await client.query(
      "SELECT 1 FROM country_characters WHERE id=$1 AND country_id=$2 AND character_status='ACTIVE'",
      [operation.target_character_id,operation.target_country_id]
    )).rowCount);
  }
  const query = queries[operation.target_type];
  if (query) return Boolean((await client.query(query,[operation.target_settlement_id])).rowCount);
  return true;
}

export async function applyEspionageEffect(
  client: DbClient,
  operation: EspionageEffectOperation,
  severity: EspionageSeverity,
  turn: number,
  selectedBuilding?: { building_type: string; level: number; target_level?: number | null; construction_paid_amount?: number } | null
): Promise<string> {
  if (severity === "NONE") return "Operasyon başarısız oldu; mekanik etki oluşmadı.";
  if (buildingTargets.has(operation.target_type) && selectedBuilding) {
    const name = BUILDINGS[selectedBuilding.building_type]?.name ?? selectedBuilding.building_type;
    const targetName = `${name} Sv${selectedBuilding.level}`;
    if (severity === "LIGHT") {
      await client.query("UPDATE buildings SET status='SABOTAGED',sabotaged_until_turn=$1,sabotage_repair_cost=0 WHERE settlement_id=$2 AND building_type=$3", [turn+2,operation.target_settlement_id,selectedBuilding.building_type]);
      return targetName+" 2 tur devre dışı bırakıldı.";
    }
    if (severity === "MEDIUM") {
      await client.query("UPDATE buildings SET status='SABOTAGED',sabotaged_until_turn=$1,sabotage_repair_cost=0 WHERE settlement_id=$2 AND building_type=$3", [turn+3,operation.target_settlement_id,selectedBuilding.building_type]);
      const treasury = (await client.query<{local_treasury:number}>("SELECT local_treasury FROM settlements WHERE id=$1 FOR UPDATE",[operation.target_settlement_id])).rows[0]?.local_treasury??0;
      const charged = Math.min(1000,Number(treasury));
      const balance = Number(treasury)-charged;
      await client.query("UPDATE settlements SET local_treasury=$1 WHERE id=$2", [balance,operation.target_settlement_id]);
      await syncTreasury(client,operation.target_country_id);
      if (charged>0) await client.query(
        `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
         VALUES($1,$2,$3,'ESPIONAGE_DAMAGE',$4,$5,$6,$7::jsonb)`,
        [operation.target_country_id,operation.target_settlement_id,turn,-charged,name+" sabotaj onarım zararı",balance,JSON.stringify({severity,targetType:operation.target_type})]
      );
      return targetName+" 3 tur kapandı ve 1.000 Altın onarım gideri doğdu.";
    }
    const repair = Math.ceil(buildingBaseCost(selectedBuilding.building_type,Math.max(1,selectedBuilding.level))/2);
    await client.query("UPDATE buildings SET status='SABOTAGED',sabotaged_until_turn=NULL,sabotage_repair_cost=$1 WHERE settlement_id=$2 AND building_type=$3", [repair,operation.target_settlement_id,selectedBuilding.building_type]);
    return targetName+" HASARLI duruma geçti; "+repair.toLocaleString("tr-TR")+" Altın ödenene kadar çalışmayacak.";
  }
  if (operation.target_type === "CONSTRUCTION" && selectedBuilding) {
    const name = BUILDINGS[selectedBuilding.building_type]?.name ?? selectedBuilding.building_type;
    const targetName = `${name} Sv${selectedBuilding.target_level ?? selectedBuilding.level + 1}`;
    if (severity !== "HEAVY") {
      const delay = severity === "LIGHT" ? 2 : 3;
      await client.query("UPDATE buildings SET completion_turn=completion_turn+$1 WHERE settlement_id=$2 AND building_type=$3 AND status='BUILDING'", [delay,operation.target_settlement_id,selectedBuilding.building_type]);
      return targetName+" inşaatı "+delay+" tur geciktirildi.";
    }
    const refund = Math.floor(Number(selectedBuilding.construction_paid_amount??0)/2);
    if (selectedBuilding.level > 0) {
      await client.query("UPDATE buildings SET status='ACTIVE',target_level=NULL,started_turn=NULL,completion_turn=NULL,construction_paid_amount=0 WHERE settlement_id=$1 AND building_type=$2", [operation.target_settlement_id,selectedBuilding.building_type]);
    } else {
      await client.query("DELETE FROM buildings WHERE settlement_id=$1 AND building_type=$2 AND status='BUILDING'", [operation.target_settlement_id,selectedBuilding.building_type]);
    }
    let balance: number|null = null;
    if (refund>0) balance=Number((await client.query<{local_treasury:number}>("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2 RETURNING local_treasury", [refund,operation.target_settlement_id])).rows[0]?.local_treasury??0);
    await syncTreasury(client,operation.target_country_id);
    if (refund>0) await client.query(
      `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
       VALUES($1,$2,$3,'ESPIONAGE_REFUND',$4,$5,$6,$7::jsonb)`,
      [operation.target_country_id,operation.target_settlement_id,turn,refund,name+" sabotaj sonrası inşaat iadesi",balance,JSON.stringify({severity,targetType:operation.target_type})]
    );
    return targetName+" inşaatı iptal edildi; "+refund.toLocaleString("tr-TR")+" Altın iade edildi.";
  }
  if (operation.target_type === "RECRUITMENT_SABOTAGE") {
    const waves = (await client.query<RecruitmentWaveTarget>(
      `SELECT wave.id,recruit.unit_type,wave.quantity,wave.due_turn
         FROM recruitment_waves wave
         JOIN recruitment_orders recruit ON recruit.id=wave.order_id
        WHERE recruit.settlement_id=$1 AND recruit.status='TRAINING' AND wave.processed_at IS NULL
        ORDER BY wave.due_turn,recruit.created_at,wave.id
        FOR UPDATE OF wave`,
      [operation.target_settlement_id]
    )).rows;
    if (!waves.length) return "Uygun asker alım dalgası bulunamadı; mekanik etki oluşmadı.";
    if (severity === "LIGHT") {
      const target = waves[0];
      if (!target) return "Uygun asker alım dalgası bulunamadı; mekanik etki oluşmadı.";
      await client.query("UPDATE recruitment_waves SET due_turn=due_turn+2 WHERE id=$1", [target.id]);
      return `Etkilenen alım: ${recruitmentWaveLabel(target)} → teslim Tur ${target.due_turn + 2}.`;
    }
    if (severity === "HEAVY") {
      await client.query("UPDATE recruitment_waves wave SET quantity=GREATEST(1,FLOOR(wave.quantity*0.8)::integer),due_turn=due_turn+2 FROM recruitment_orders recruit WHERE recruit.id=wave.order_id AND recruit.settlement_id=$1 AND recruit.status='TRAINING' AND wave.processed_at IS NULL", [operation.target_settlement_id]);
      await client.query("UPDATE recruitment_orders recruit SET remaining_quantity=(SELECT COALESCE(SUM(wave.quantity),0)::integer FROM recruitment_waves wave WHERE wave.order_id=recruit.id AND wave.processed_at IS NULL) WHERE recruit.settlement_id=$1 AND recruit.status='TRAINING'", [operation.target_settlement_id]);
      const details = waves.map((wave) => {
        const remaining = Math.max(1, Math.floor(Number(wave.quantity) * 0.8));
        const lost = Number(wave.quantity) - remaining;
        const unitName = catalogName(UNITS, wave.unit_type);
        return `${unitName}: ${Number(wave.quantity).toLocaleString("tr-TR")}→${remaining.toLocaleString("tr-TR")} (${lost.toLocaleString("tr-TR")} kayıp), Tur ${wave.due_turn}→${wave.due_turn + 2}`;
      });
      return `Etkilenen alımlar: ${limitedDetails(details)}.`;
    }
    await client.query("UPDATE recruitment_waves wave SET due_turn=due_turn+2 FROM recruitment_orders recruit WHERE recruit.id=wave.order_id AND recruit.settlement_id=$1 AND recruit.status='TRAINING' AND wave.processed_at IS NULL", [operation.target_settlement_id]);
    return `Etkilenen alımlar: ${limitedDetails(waves.map((wave) => `${recruitmentWaveLabel(wave)}→Tur ${wave.due_turn + 2}`))}.`;
  }
  if (operation.target_type === "PRODUCTION_SABOTAGE") {
    const orders = (await client.query<ProductionOrderTarget>(
      `SELECT 'SHIP'::text AS kind,id,ship_type AS item_type,quantity,completion_turn
         FROM naval_orders WHERE settlement_id=$1 AND status='BUILDING'
       UNION ALL
       SELECT 'SIEGE'::text AS kind,id,asset_type AS item_type,quantity,completion_turn
         FROM siege_orders WHERE settlement_id=$1 AND status='BUILDING'
       ORDER BY completion_turn,id`,
      [operation.target_settlement_id]
    )).rows;
    if (!orders.length) return "Uygun gemi veya kuşatma üretimi bulunamadı; mekanik etki oluşmadı.";
    const chosen = orders[randomInt(0,orders.length)];
    if (severity === "LIGHT" && chosen) {
      await client.query("UPDATE "+(chosen.kind==="SHIP"?"naval_orders":"siege_orders")+" SET completion_turn=completion_turn+2 WHERE id=$1", [chosen.id]);
      return `Etkilenen üretim: ${productionOrderLabel(chosen)} → tamamlanma Tur ${chosen.completion_turn + 2}.`;
    }
    if (severity === "HEAVY" && chosen) {
      await client.query("UPDATE "+(chosen.kind==="SHIP"?"naval_orders":"siege_orders")+" SET status='CANCELLED' WHERE id=$1", [chosen.id]);
      await client.query("UPDATE naval_orders SET completion_turn=completion_turn+2 WHERE settlement_id=$1 AND status='BUILDING'", [operation.target_settlement_id]);
      await client.query("UPDATE siege_orders SET completion_turn=completion_turn+2 WHERE settlement_id=$1 AND status='BUILDING'", [operation.target_settlement_id]);
      const delayed = orders.filter((order) => order.id !== chosen.id);
      const delayedText = delayed.length
        ? limitedDetails(delayed.map((order) => `${productionOrderLabel(order)}→Tur ${order.completion_turn + 2}`))
        : "başka aktif üretim emri yok";
      return `İadesiz yok edilen üretim: ${productionOrderLabel(chosen)}. Geciktirilen üretimler: ${delayedText}.`;
    }
    await client.query("UPDATE naval_orders SET completion_turn=completion_turn+2 WHERE settlement_id=$1 AND status='BUILDING'", [operation.target_settlement_id]);
    await client.query("UPDATE siege_orders SET completion_turn=completion_turn+2 WHERE settlement_id=$1 AND status='BUILDING'", [operation.target_settlement_id]);
    return `Etkilenen üretimler: ${limitedDetails(orders.map((order) => `${productionOrderLabel(order)}→Tur ${order.completion_turn + 2}`))}.`;
  }
  if (operation.target_type === "INCOME_SABOTAGE") {
    const reduction = percent(severity,10,20,30);
    const duration = severity === "HEAVY" ? 2 : 1;
    await client.query(
      "INSERT INTO settlement_income_penalties(settlement_id,penalty_percent,remaining_acquisition_turns,reason,created_turn,created_by) VALUES($1,$2,$3,'Casusluk: Gelir Sabotajı',$4,'SYSTEM') ON CONFLICT(settlement_id) DO UPDATE SET penalty_percent=GREATEST(settlement_income_penalties.penalty_percent,EXCLUDED.penalty_percent),remaining_acquisition_turns=GREATEST(settlement_income_penalties.remaining_acquisition_turns,EXCLUDED.remaining_acquisition_turns),reason=EXCLUDED.reason,updated_at=NOW()",
      [operation.target_settlement_id,reduction,duration,turn]
    );
    return "Yerleşke geliri "+duration+" Alım Turu boyunca %"+reduction+" azaltıldı.";
  }
  if (operation.target_type === "TREASURY_INFILTRATION") {
    const rate = percent(severity,5,10,20);
    const target = (await client.query<{ local_treasury: number }>("SELECT local_treasury FROM settlements WHERE id=$1 FOR UPDATE",[operation.target_settlement_id])).rows[0]!;
    const stolen = Math.floor(Number(target.local_treasury)*rate/100);
    const home = (await client.query<{ id: string }>("SELECT COALESCE(trained_settlement_id,(SELECT id FROM settlements WHERE country_id=$2 ORDER BY population DESC LIMIT 1)) AS id FROM country_characters WHERE id=$1",[operation.spy_character_id,operation.attacker_country_id])).rows[0]?.id;
    const targetBalance=Number((await client.query<{local_treasury:number}>("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2 RETURNING local_treasury",[stolen,operation.target_settlement_id])).rows[0]?.local_treasury??0);
    const homeBalance=home ? Number((await client.query<{local_treasury:number}>("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2 RETURNING local_treasury",[stolen,home])).rows[0]?.local_treasury??0) : null;
    await syncTreasury(client,operation.target_country_id); await syncTreasury(client,operation.attacker_country_id);
    if (stolen>0) {
      await client.query(
        `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
         VALUES($1,$2,$3,'ESPIONAGE_THEFT',$4,'Casusluk: hazine sızdırma kaybı',$5,$6::jsonb)`,
        [operation.target_country_id,operation.target_settlement_id,turn,-stolen,targetBalance,JSON.stringify({severity,rate})]
      );
      if (home) await client.query(
        `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
         VALUES($1,$2,$3,'ESPIONAGE_THEFT_INCOME',$4,'Casusluk: hazine sızdırma kazancı',$5,$6::jsonb)`,
        [operation.attacker_country_id,home,turn,stolen,homeBalance,JSON.stringify({severity,rate})]
      );
    }
    return "Hedef hazinenin %"+rate+"'i sızdırıldı; tutar saldıran oyuncuya açıklanmayacak.";
  }
  if (operation.target_type === "TRADE_COLLAPSE") {
    const agreements = (await client.query<{ id: string }>("SELECT id FROM trade_agreements WHERE status='ACTIVE' AND (proposer_settlement_id=$1 OR receiver_settlement_id=$1) ORDER BY created_at",[operation.target_settlement_id])).rows;
    const chosen = agreements[randomInt(0,agreements.length)];
    if (severity === "LIGHT" && chosen) {
      await client.query("UPDATE trade_agreements SET suspended_until_turn=$1 WHERE id=$2",[turn+2,chosen.id]);
      return "Rastgele bir ticari ilişki 2 tur askıya alındı.";
    }
    if (severity === "HEAVY" && chosen) {
      await client.query("UPDATE trade_agreements SET status='ENDED',ended_at=NOW() WHERE id=$1",[chosen.id]);
      await client.query("UPDATE trade_agreements SET suspended_until_turn=$1 WHERE status='ACTIVE' AND (proposer_settlement_id=$2 OR receiver_settlement_id=$2)",[turn+3,operation.target_settlement_id]);
      return "Bir ticaret antlaşması sona erdi; diğer ilişkiler 3 tur askıya alındı.";
    }
    await client.query("UPDATE trade_agreements SET suspended_until_turn=$1 WHERE status='ACTIVE' AND (proposer_settlement_id=$2 OR receiver_settlement_id=$2)",[turn+2,operation.target_settlement_id]);
    return "Şehrin bütün ticari ilişkileri 2 tur askıya alındı.";
  }
  if (operation.target_type === "INCITE_PUBLIC") {
    await client.query(
      severity === "HEAVY"
        ? "UPDATE settlements SET rebellion_active=TRUE,unrest_active=TRUE WHERE id=$1"
        : "UPDATE settlements SET unrest_active=TRUE WHERE id=$1",
      [operation.target_settlement_id]
    );
    return severity === "HEAVY" ? "Yerleşkede doğrudan isyan başladı." : (severity === "MEDIUM" ? "Orta şiddette huzursuzluk başladı." : "Huzursuzluk başladı.");
  }
  if (operation.target_type === "PARALYZE_GOVERNMENT") {
    const duration = severity === "HEAVY" ? 3 : 2;
    if (severity === "LIGHT") {
      await client.query("UPDATE settlement_policies SET suspended_until_turn=$1 WHERE id=(SELECT id FROM settlement_policies WHERE settlement_id=$2 AND status='ACTIVE' ORDER BY slot LIMIT 1)",[turn+duration,operation.target_settlement_id]);
    } else {
      await client.query("UPDATE settlement_policies SET suspended_until_turn=$1 WHERE settlement_id=$2 AND status='ACTIVE'",[turn+duration,operation.target_settlement_id]);
      if (severity === "HEAVY") await client.query("UPDATE buildings SET status='SABOTAGED',sabotaged_until_turn=$1 WHERE settlement_id=$2 AND building_type='curia' AND status='ACTIVE'",[turn+2,operation.target_settlement_id]);
    }
    return severity === "LIGHT" ? "Bir şehir politikası 2 tur kapandı." : "Şehir politikaları "+duration+" tur kapandı"+(severity==="HEAVY" ? "; Curia etkileri 2 tur devre dışı." : ".");
  }
  if (operation.target_type === "AGGRAVATE_EVENT") {
    if (severity === "HEAVY") {
      await client.query("UPDATE settlements SET unrest_active=TRUE,rebellion_active=TRUE WHERE id=$1",[operation.target_settlement_id]);
      return "Kontrol altındaki olay yeniden etkinleşti ve yayılmaya hazır hâle geldi.";
    }
    if (severity === "MEDIUM") await client.query("UPDATE settlements SET rebellion_active=CASE WHEN unrest_active THEN TRUE ELSE rebellion_active END,unrest_active=TRUE WHERE id=$1",[operation.target_settlement_id]);
    return severity === "MEDIUM" ? "Aktif olay bir şiddet kademesi yükseltildi." : "Aktif olayın etkisi 2 tur uzatıldı.";
  }
  if (operation.target_type === "SUPPLY_COLLAPSE" && operation.target_army_id) {
    const multiplier = severity === "LIGHT" ? 0.95 : severity === "MEDIUM" ? 0.90 : 0.85;
    const rounds = severity === "LIGHT" ? 1 : 2;
    await client.query("INSERT INTO army_temporary_effects(army_id,effect_type,clash_multiplier,damage_multiplier,rounds_remaining,disable_doctrine_first_round,created_turn) VALUES($1,'SUPPLY_COLLAPSE',$2,$2,$3,$4,$5)",[operation.target_army_id,multiplier,rounds,severity==="HEAVY",turn]);
    return "Hedef ordunun ilk "+rounds+" savaş turunda çarpışma ve hasarı ×"+multiplier.toFixed(2)+" olacak.";
  }
  if (operation.target_type === "DESERTION" && operation.target_army_id) {
    const rate = percent(severity,3,7,15);
    const units = (await client.query<{ settlement_id: string; unit_type: string; quantity: number }>("SELECT settlement_id,unit_type,quantity FROM army_units WHERE army_id=$1 FOR UPDATE",[operation.target_army_id])).rows;
    let total = 0;
    for (const unit of units) {
      const lost = Math.floor(Number(unit.quantity)*rate/100); if (!lost) continue; total += lost;
      await client.query("UPDATE army_units SET quantity=quantity-$1 WHERE army_id=$2 AND settlement_id=$3 AND unit_type=$4",[lost,operation.target_army_id,unit.settlement_id,unit.unit_type]);
      await client.query("DELETE FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3 AND quantity<=0",[operation.target_army_id,unit.settlement_id,unit.unit_type]);
      await client.query("UPDATE unit_stacks SET quantity=GREATEST(0,quantity-$1) WHERE id=(SELECT id FROM unit_stacks WHERE settlement_id=$2 AND unit_type=$3 AND force_type='ARMY' ORDER BY quantity DESC LIMIT 1)",[lost,unit.settlement_id,unit.unit_type]);
      await client.query("UPDATE settlements SET population=population+$1 WHERE id=$2",[lost,unit.settlement_id]);
    }
    return "Ordunun %"+rate+"'i firar etti; "+total.toLocaleString("tr-TR")+" kişi kaynak yerleşkelerinin nüfusuna döndü.";
  }
  if (operation.target_type === "POISON_GARRISON") {
    const rate = percent(severity,5,10,20);
    await client.query("UPDATE unit_stacks SET quantity=GREATEST(0,quantity-FLOOR(quantity*$1/100)::integer) WHERE settlement_id=$2 AND force_type='GARRISON'",[rate,operation.target_settlement_id]);
    return "Garnizonun %"+rate+"'i kaybedildi; otomatik yenileme başlatılmadı.";
  }
  if (operation.target_type === "DESTROY_SIEGE_SUPPLIES") {
    const reduction = percent(severity,2,3,4);
    await client.query("UPDATE battles SET starvation_remaining=GREATEST(0,COALESCE(starvation_remaining,0)-$1) WHERE defender_settlement_id=$2 AND terrain='SIEGE' AND status NOT IN ('FINISHED','CANCELLED')",[reduction,operation.target_settlement_id]);
    return "Kuşatma açlık dayanıklılığı "+reduction+" tur azaltıldı.";
  }
  if (operation.target_type === "SABOTAGE_FLEET") {
    const ships = (await client.query<{ id: string; quantity: number }>("SELECT id,quantity FROM naval_units WHERE settlement_id=$1 AND quantity>0 FOR UPDATE",[operation.target_settlement_id])).rows;
    const total = ships.reduce((sum,row)=>sum+Number(row.quantity),0);
    const destroyRate = severity === "LIGHT" ? 0 : severity === "MEDIUM" ? 5 : 10;
    const disableRate = severity === "LIGHT" ? 10 : severity === "HEAVY" ? 10 : 0;
    for (const ship of ships) {
      const destroyed = Math.floor(Number(ship.quantity)*destroyRate/100);
      await client.query("UPDATE naval_units SET quantity=quantity-$1,disabled_until_turn=CASE WHEN $2>0 THEN $3 ELSE disabled_until_turn END WHERE id=$4",[destroyed,disableRate,turn+2,ship.id]);
    }
    return Math.floor(total*destroyRate/100).toLocaleString("tr-TR")+" gemi birimi yok edildi; filonun %"+disableRate+" kadarı 2 tur kullanılamaz.";
  }
  if (["DISCREDIT","KIDNAP","ASSASSINATE"].includes(operation.target_type) && operation.target_character_id) {
    const duration = operation.target_type === "DISCREDIT" ? percent(severity,2,4,6)
      : operation.target_type === "KIDNAP" ? (severity === "LIGHT" ? 2 : severity === "MEDIUM" ? 4 : 0)
      : severity === "LIGHT" ? 3 : severity === "MEDIUM" ? 6 : 0;
    if (operation.target_type === "ASSASSINATE" && severity === "HEAVY") {
      await client.query("UPDATE country_characters SET character_status='DEAD',assignment='NONE',assigned_settlement_id=NULL,unavailable_until_turn=NULL WHERE id=$1",[operation.target_character_id]);
      return "Hedef karakter kalıcı olarak öldürüldü; bütün görevleri sona erdi.";
    }
    await client.query("UPDATE merchant_operations SET status='CANCELLED',updated_at=NOW() WHERE merchant_character_id=$1 AND status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED')",[operation.target_character_id]);
    await client.query("UPDATE diplomat_operations SET status='CANCELLED',updated_at=NOW() WHERE diplomat_character_id=$1 AND status IN ('TRAVELING','ACTIVE','PAUSED')",[operation.target_character_id]);
    await client.query("UPDATE country_characters SET assignment='CAPTURED',assigned_settlement_id=$1,unavailable_until_turn=$2,specialization_progress=CASE WHEN $3 THEN 0 ELSE specialization_progress END WHERE id=$4",[operation.target_settlement_id,duration>0?turn+duration:null,operation.target_type==="DISCREDIT"&&severity==="HEAVY",operation.target_character_id]);
    if (operation.target_type === "KIDNAP" && severity === "HEAVY") return "Hedef karakter süresiz esir alındı.";
    return "Hedef karakter "+duration+" tur kullanılamayacak.";
  }
  return "Operasyon başarıyla sonuçlandı.";
}
