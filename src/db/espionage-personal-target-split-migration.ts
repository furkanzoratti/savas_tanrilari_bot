export const espionagePersonalTargetSplitMigration = {
  version: 210,
  name: "espionage_personal_target_split",
  sql: `
    ALTER TABLE espionage_operations DROP CONSTRAINT IF EXISTS espionage_operations_target_type_check;
    ALTER TABLE espionage_operations ADD CONSTRAINT espionage_operations_target_type_check CHECK (target_type IN (
      'BUILDING_SABOTAGE','CONSTRUCTION_SABOTAGE','RECRUITMENT_SABOTAGE','PRODUCTION_SABOTAGE',
      'INCOME_SABOTAGE','TREASURY_INFILTRATION','TRADE_COLLAPSE','INCITE_PUBLIC','PARALYZE_GOVERNMENT',
      'AGGRAVATE_EVENT','SUPPLY_COLLAPSE','DESERTION','POISON_GARRISON','DESTROY_SIEGE_SUPPLIES',
      'SABOTAGE_FLEET','DISCREDIT','KIDNAP','ASSASSINATE',
      'CHARACTER_KIDNAP','NOBLE_KIDNAP','CHARACTER_ASSASSINATE','NOBLE_ASSASSINATE',
      'ECONOMIC','MILITARY','PUBLIC','NAVAL','CONSTRUCTION'
    ));
  `
} as const;
