export const CULTURE_GROUPS = {
  UNASSIGNED: { label: "Belirlenmedi" },
  BRITTONIC: { label: "Britonik" },
  CELTIC: { label: "Keltik" },
  GERMANIC: { label: "Cermenik" },
  BALTIC: { label: "Baltık" },
  IBERIAN: { label: "İberik" },
  ITALIC: { label: "İtalik" },
  ILLYRO_PANNONIAN: { label: "İlir-Pannonik" },
  DACO_GETIC: { label: "Dako-Getik" },
  THRACIAN: { label: "Trak" },
  HELLENIC: { label: "Helenik" },
  PUNIC: { label: "Punik" },
  BERBER: { label: "Berberi" },
  LIBYAN: { label: "Libu" },
  EGYPTIAN: { label: "Mısır" },
  KUSHITIC: { label: "Kuşitik" },
  HABESHA: { label: "Habeş" },
  ARABIAN: { label: "Arap" },
  LEVANTINE: { label: "Levanten" },
  MESOPOTAMIAN: { label: "Mezopotamyalı" },
  ANATOLIAN: { label: "Anadolu" },
  ARMENIAN: { label: "Ermeni" },
  CAUCASIAN: { label: "Kafkas" },
  SARMATIAN: { label: "Sarmat" },
  SCYTHIAN: { label: "İskit" },
  WEST_IRANIAN: { label: "Batı İranik" },
  EAST_IRANIAN: { label: "Doğu İranik" }
} as const;

export type CultureGroup = keyof typeof CULTURE_GROUPS;

export const CULTURE_CHOICES = Object.entries(CULTURE_GROUPS)
  .filter(([key]) => key !== "UNASSIGNED")
  .map(([value, culture]) => ({ name: culture.label, value }));
