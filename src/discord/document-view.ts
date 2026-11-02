export type DocumentView = "general" | "economy" | "military" | "development";

export function matchesDocumentView(fieldName: string, view: DocumentView): boolean {
  if (view === "general") {
    return ["Kültür", "Din ve Mezhep", "Yerel Hazine", "Nüfus", "Refah ve İstikrar", "Aktif Yerleşke Olayları", "Süreli Gelir Cezası"]
      .some((name) => fieldName.includes(name));
  }
  if (view === "economy") {
    return ["Yerel Hazine", "Gelir Kalemleri", "Yerleşke Giderleri", "Etkin Kaynaklar", "Süreli Gelir Cezası"]
      .some((name) => fieldName.includes(name));
  }
  if (view === "military") {
    return ["Nüfus", "Ordu Limiti", "Eğitim Kapasitesi", "Rıhtım Kapasitesi", "Garnizon", "Eğitilmiş Askerler", "Paralı Askerler", "Donanma", "Tamir", "Kuşatma"]
      .some((name) => fieldName.includes(name));
  }
  return ["Binalar ve İnşaatlar", "Şehir Politikaları", "Aktif Yerleşke Olayları", "Refah ve İstikrar", "Büyük Proje"]
    .some((name) => fieldName.includes(name));
}

const FIELD_ORDER: Partial<Record<DocumentView, string[]>> = {
  general: [
    "Kültür",
    "Nüfus",
    "Refah ve İstikrar",
    "Din ve Mezhep",
    "Yerel Hazine",
    "Aktif Yerleşke Olayları",
    "Süreli Gelir Cezası"
  ]
};

export function orderDocumentViewFields<T extends { name: string }>(fields: T[], view: DocumentView): T[] {
  const order = FIELD_ORDER[view];
  if (!order) return fields;
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const leftRank = order.findIndex((name) => left.field.name.includes(name));
      const rightRank = order.findIndex((name) => right.field.name.includes(name));
      const normalizedLeft = leftRank === -1 ? order.length : leftRank;
      const normalizedRight = rightRank === -1 ? order.length : rightRank;
      return normalizedLeft - normalizedRight || left.index - right.index;
    })
    .map(({ field }) => field);
}
