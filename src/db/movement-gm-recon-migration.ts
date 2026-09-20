export const movementGmReconMigration={
  version:73,
  name:"gm_intelligence_supplement_kind",
  sql:`
    ALTER TABLE reconnaissance_checks DROP CONSTRAINT IF EXISTS reconnaissance_checks_check_kind_check;
    ALTER TABLE reconnaissance_checks ADD CONSTRAINT reconnaissance_checks_check_kind_check
      CHECK (check_kind IN ('REGIONAL_OBSERVER','MOBILE_SCOUT','UNOBSERVED_RUMOR','GM_REPORT'));
  `
} as const;
