import type { DbClient } from "../db/pool.js";
import { FORMABLE_COUNTRIES, type FormableCountryDefinition, type FormableCountryKey } from "../domain/formable-countries.js";
import { SHIPS } from "../domain/catalog.js";

export async function grantFormableFoundingReward(
  client: DbClient,
  countryId: string,
  formableKey: FormableCountryKey
): Promise<string[]> {
  const definition: FormableCountryDefinition = FORMABLE_COUNTRIES[formableKey];
  const reward = definition.foundingReward;
  if (!reward) return [];

  const shipReward = reward.shipsPerActiveShipyard;
  const shipyards = (await client.query<{ settlement_id: string; settlement_name: string }>(
    `SELECT s.id AS settlement_id,s.name AS settlement_name
       FROM settlements s JOIN buildings b ON b.settlement_id=s.id
      WHERE s.country_id=$1 AND b.building_type='shipyard' AND b.status='ACTIVE' AND b.level>0
      ORDER BY s.name FOR UPDATE OF s`,
    [countryId]
  )).rows;
  for (const settlement of shipyards) {
    await client.query(
      `INSERT INTO naval_units(settlement_id,ship_type,quantity,status)
       VALUES($1,$2,$3,'RESERVE')
       ON CONFLICT(settlement_id,ship_type,status)
       DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity`,
      [settlement.settlement_id,shipReward.shipType,shipReward.quantity]
    );
  }
  if (!shipyards.length) return ["Aktif Tersane bulunmadığı için kuruluş gemisi verilmedi."];
  const shipName = SHIPS[shipReward.shipType].name;
  return shipyards.map((settlement) => `${settlement.settlement_name}: +${shipReward.quantity} ${shipName}`);
}
