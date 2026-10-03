export const carthageRepairTransferToIbossimMigration = {
  version: 123,
  name: "carthage_repair_transfer_to_ibossim",
  sql: `
    UPDATE fleet_repair_groups repair
       SET repair_settlement_id=ibossim.id,
           shipyard_level=ibossim_shipyard.level::integer
      FROM countries country,
           fleets source_fleet,
           settlements ibossim,
           buildings ibossim_shipyard
     WHERE repair.country_id=country.id
       AND repair.source_fleet_id=source_fleet.id
       AND source_fleet.country_id=country.id
       AND ibossim.country_id=country.id
       AND ibossim_shipyard.settlement_id=ibossim.id
       AND ibossim_shipyard.building_type='shipyard'
       AND ibossim_shipyard.status='ACTIVE'
       AND ibossim_shipyard.level>0
       AND country.status='ACTIVE'
       AND lower(country.name)=lower('Büyük Kartaca')
       AND lower(source_fleet.name)=lower('AKDENİZ DENİZ KUVVETLERİ')
       AND lower(ibossim.name)=lower('Ibossim')
       AND repair.status='REPAIRING';
  `
} as const;
