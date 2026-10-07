export const warExhaustionActivationBaselineMigration={
  version:144,
  name:"war_exhaustion_active_war_turn_baseline",
  sql:`
    -- Sistem açılmadan önce yaşanmış kayıp, yağma ve toprak kayıplarını geriye dönük
    -- ceza olarak yazma. Hâlen süren savaşlar için yalnızca ülkenin savaşa katıldığı
    -- turdan bugüne kadar geçen süreyi başlangıç yorgunluğu olarak tanı.
    WITH active_war_turns AS (
      SELECT participant.country_id,
             GREATEST(
               0,
               MAX(guild.current_turn-COALESCE(metrics.joined_turn,war.started_turn))
             )::integer AS elapsed_turns
        FROM state_war_participants participant
        JOIN state_wars war ON war.id=participant.war_id AND war.status='ACTIVE'
        JOIN countries country ON country.id=participant.country_id
        JOIN guilds guild ON guild.discord_id=country.guild_id
        LEFT JOIN state_war_country_metrics metrics
          ON metrics.war_id=war.id AND metrics.country_id=participant.country_id
       GROUP BY participant.country_id
    )
    UPDATE countries country
       SET war_exhaustion=LEAST(100,active_war_turns.elapsed_turns*2)
      FROM active_war_turns
     WHERE country.id=active_war_turns.country_id;
  `
} as const;
