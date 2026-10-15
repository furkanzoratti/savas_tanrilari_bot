export const capitalCitiesMigration = {
  version: 209,
  name: "capital_cities",
  sql: `
    ALTER TABLE countries ADD COLUMN IF NOT EXISTS capital_settlement_id UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='countries_capital_settlement_id_fkey'
      ) THEN
        ALTER TABLE countries
          ADD CONSTRAINT countries_capital_settlement_id_fkey
          FOREIGN KEY(capital_settlement_id) REFERENCES settlements(id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS countries_capital_settlement_id_idx
      ON countries(capital_settlement_id);

    CREATE TEMP TABLE preferred_capitals_v209(
      country_name TEXT NOT NULL,
      settlement_name TEXT NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO preferred_capitals_v209(country_name,settlement_name) VALUES
      ('Roma','Roma'),
      ('Roma Cumhuriyeti','Roma'),
      ('Nil İmparatorluğu','İskenderiye'),
      ('Gaut Krallığı','Östergötland'),
      ('Satraplar','Bharakaccha'),
      ('Saketler','Anga'),
      ('Sarmatya','Solokha'),
      ('İberya','Kartuba'),
      ('Greko-Baktriya','Taxila'),
      ('Trakya','Atina'),
      ('Karnutlar','Treverorum'),
      ('Xianbei Konfederasyonu','Xianbei Dağı Ordugahı'),
      ('Xianbei Konfederasyonu','Xianbei Dağ Ordugahı'),
      ('Persis','Persepolis'),
      ('Büyük Kartaca','Kartaca'),
      ('Bosporos Krallığı','Pantikapaion'),
      ('Sebe','Eudaemon'),
      ('Büyük Britanya','Camulodunon');

    UPDATE countries country
       SET capital_settlement_id=settlement.id
      FROM preferred_capitals_v209 preferred
      JOIN settlements settlement ON lower(settlement.name)=lower(preferred.settlement_name)
     WHERE lower(country.name)=lower(preferred.country_name)
       AND settlement.country_id=country.id;

    UPDATE countries country
       SET capital_settlement_id=(
         SELECT settlement.id
           FROM settlements settlement
          WHERE settlement.country_id=country.id
          ORDER BY settlement.population DESC,settlement.name,settlement.id
          LIMIT 1
       )
     WHERE country.capital_settlement_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM settlements settlement
           WHERE settlement.id=country.capital_settlement_id
             AND settlement.country_id=country.id
        );
  `
} as const;
