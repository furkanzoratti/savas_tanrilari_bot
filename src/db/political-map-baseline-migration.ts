export const politicalMapBaselineMigration={
  version:245,
  name:"political_map_v8_ownership_baseline",
  sql:`
    -- R56-POLITICAL-v8 görseli bu göçün uygulandığı andaki siyasi durumu
    -- zaten içerir. Eski haritadan kalan değişim lekelerini bir defaya mahsus
    -- temizle; bundan sonraki barış devirleri güncel ülke kimliğiyle görünür.
    INSERT INTO visual_map_territory_baselines(settlement_id,guild_id,country_id)
    SELECT settlement.id,country.guild_id,settlement.country_id
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id
    ON CONFLICT(settlement_id) DO UPDATE
      SET guild_id=EXCLUDED.guild_id,
          country_id=EXCLUDED.country_id;
  `
} as const;
