import { scandinavianDynastiesMigration } from "./scandinavian-dynasties-migration.js";

export const scandinavianDynastiesRepairMigration = {
  version: 207,
  name: "scandinavian_country_dynasties_repair",
  // Ülkeler v203 uygulandıktan sonra kurulmuş veya Svege adıyla eklenmiş olabilir.
  // İlk göç mevcut üyeli hanedanlara dokunmadığı için aynı güvenli tohumu tekrar çalıştırıyoruz.
  sql: scandinavianDynastiesMigration.sql
} as const;
