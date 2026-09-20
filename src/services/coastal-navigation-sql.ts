/** A coastal settlement hex is navigable only when an actual sea hex touches it. */
export function coastalPortSql(hex: string): string {
  return `(${hex}.domain='LAND' AND ${hex}.passable
    AND EXISTS (SELECT 1 FROM settlement_map_positions coastal_position
      JOIN settlements coastal_settlement ON coastal_settlement.id=coastal_position.settlement_id
      WHERE coastal_position.hex_id=${hex}.id AND coastal_settlement.is_coastal)
    AND EXISTS (SELECT 1 FROM map_hexes coastal_sea
      WHERE coastal_sea.guild_id=${hex}.guild_id AND coastal_sea.domain='SEA' AND coastal_sea.passable
        AND ABS(coastal_sea.q-${hex}.q)<=1 AND ABS(coastal_sea.r-${hex}.r)<=1
        AND ABS((coastal_sea.q+coastal_sea.r)-(${hex}.q+${hex}.r))<=1))`;
}
