export const espionagePublicationActivationMigration = {
  version: 214,
  name: "espionage_publication_activation",
  sql: `
    UPDATE espionage_public_templates
       SET enabled=TRUE,
           updated_at=NOW()
     WHERE enabled=FALSE;
  `
} as const;
