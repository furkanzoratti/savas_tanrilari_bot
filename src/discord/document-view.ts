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
