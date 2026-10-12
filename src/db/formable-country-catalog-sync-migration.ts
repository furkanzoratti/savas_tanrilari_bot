export const formableCountryCatalogSyncMigration = {
  version: 190,
  name: "formable_country_catalog_sync",
  sql: `
    UPDATE countries
       SET active_formable_key = NULL
     WHERE active_formable_key = 'GRECO_BACTRIAN_KINGDOM';

    DELETE FROM country_formations
     WHERE formable_key = 'GRECO_BACTRIAN_KINGDOM';
  `
} as const;
