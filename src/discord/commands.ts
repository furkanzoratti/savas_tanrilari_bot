import { ChannelType, SlashCommandBuilder } from "discord.js";
import { BUILDINGS, MOBILIZATION_RULES, SHIPS, UNITS } from "../domain/catalog.js";

const countryOption = (option: any) => option.setName("ulke").setDescription("Yalnızca DM: işlem yapılacak ülke").setRequired(false);

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("belge").setDescription("Ülkenin güncel belgesini gösterir")
    .addStringOption(countryOption),
  new SlashCommandBuilder()
    .setName("alim").setDescription("Yerleşkede etkileşimli bina alımı başlatır")
    .addStringOption(countryOption),
  new SlashCommandBuilder()
    .setName("asker-alimi").setDescription("Etkileşimli asker alımı başlatır")
    .addStringOption(countryOption),
  new SlashCommandBuilder()
    .setName("gemi-alimi").setDescription("Etkileşimli gemi alımı başlatır")
    .addStringOption(countryOption),
  new SlashCommandBuilder()
    .setName("seferberlik").setDescription("Ülkenin seferberlik seviyesini değiştirir")
    .addStringOption((option) => option.setName("seviye").setDescription("Yeni seferberlik seviyesi").setRequired(true)
      .addChoices(...Object.entries(MOBILIZATION_RULES).map(([value, rule]) => ({ name: rule.label, value }))))
    .addStringOption(countryOption),
  new SlashCommandBuilder()
    .setName("zar").setDescription("Zar atar")
    .addIntegerOption((option) => option.setName("adet").setDescription("Zar adedi").setMinValue(1).setMaxValue(20).setRequired(true))
    .addIntegerOption((option) => option.setName("yuz").setDescription("Zarın yüz sayısı").setMinValue(2).setMaxValue(10_000).setRequired(true))
    .addIntegerOption((option) => option.setName("bonus").setDescription("Sonuca eklenecek bonus").setMinValue(-10_000).setMaxValue(10_000))
    .addBooleanOption((option) => option.setName("gizli").setDescription("Sonucu yalnızca sen gör")),
  new SlashCommandBuilder()
    .setName("rol-siralama").setDescription("Rol kanallarındaki kelime sıralamasını gösterir")
    .addStringOption((option) => option.setName("donem").setDescription("Sıralama dönemi").setRequired(true)
      .addChoices({ name: "Son 24 saat", value: "daily" }, { name: "Son 7 gün", value: "weekly" })),
  new SlashCommandBuilder()
    .setName("yonetim").setDescription("Oyun yöneticisi komutları")
    .addSubcommand((sub) => sub.setName("ulke-olustur").setDescription("Yeni ülke oluşturur")
      .addStringOption((o) => o.setName("ad").setDescription("Ülke adı").setRequired(true))
      .addIntegerOption((o) => o.setName("hazine").setDescription("Başlangıç hazinesi").setMinValue(0).setRequired(true)))
    .addSubcommand((sub) => sub.setName("oyuncu-ata").setDescription("Oyuncuyu ülkeye atar")
      .addStringOption((o) => o.setName("ulke").setDescription("Ülke adı").setRequired(true))
      .addUserOption((o) => o.setName("oyuncu").setDescription("Oyuncu").setRequired(true)))
    .addSubcommand((sub) => sub.setName("yerleske-ekle").setDescription("Ülkeye yerleşke ekler")
      .addStringOption((o) => o.setName("ulke").setDescription("Ülke adı").setRequired(true))
      .addStringOption((o) => o.setName("ad").setDescription("Yerleşke adı").setRequired(true))
      .addIntegerOption((o) => o.setName("nufus").setDescription("Özgür nüfus").setMinValue(0).setRequired(true))
      .addIntegerOption((o) => o.setName("kole").setDescription("Köle nüfusu").setMinValue(0).setRequired(true))
      .addIntegerOption((o) => o.setName("gelir").setDescription("Temel gelir").setMinValue(0).setRequired(true))
      .addIntegerOption((o) => o.setName("nufus-artisi").setDescription("Alım Turu temel nüfus artışı").setMinValue(0).setRequired(true)))
    .addSubcommand((sub) => sub.setName("tur-ilerlet").setDescription("Yeni turu açar ve bütün otomasyonları işler"))
    .addSubcommand((sub) => sub.setName("tur-durumu").setDescription("Turun hareket durumunu değiştirir")
      .addStringOption((o) => o.setName("durum").setDescription("Yeni durum").setRequired(true)
        .addChoices({ name: "Açık", value: "OPEN" }, { name: "Kapalı", value: "CLOSED" }, { name: "Olaylar çözülüyor", value: "RESOLVING" })))
    .addSubcommand((sub) => sub.setName("hazine").setDescription("Ülke hazinesini artırır veya azaltır")
      .addStringOption((o) => o.setName("ulke").setDescription("Ülke adı").setRequired(true))
      .addIntegerOption((o) => o.setName("miktar").setDescription("Negatif değer kullanılabilir").setRequired(true))
      .addStringOption((o) => o.setName("neden").setDescription("İşlem açıklaması").setRequired(true)))
    .addSubcommand((sub) => sub.setName("harap").setDescription("Yerleşkenin harap durumunu değiştirir")
      .addStringOption((o) => o.setName("ulke").setDescription("Ülke adı").setRequired(true))
      .addStringOption((o) => o.setName("yerleske").setDescription("Yerleşke adı").setRequired(true))
      .addBooleanOption((o) => o.setName("harap").setDescription("Harap mı?").setRequired(true)))
    .addSubcommand((sub) => sub.setName("oyunu-sifirla").setDescription("Bu sunucudaki bütün oyun verilerini kalıcı olarak siler")
      .addStringOption((o) => o.setName("onay").setDescription("Onaylamak için büyük harflerle SIFIRLA yazın").setRequired(true)))
    .addSubcommand((sub) => sub.setName("rol-kanali").setDescription("Kelime sayılacak rol kanalını ekler veya kaldırır")
      .addStringOption((o) => o.setName("islem").setDescription("İşlem").setRequired(true).addChoices({ name: "Ekle", value: "add" }, { name: "Kaldır", value: "remove" }))
      .addChannelOption((o) => o.setName("kanal").setDescription("Rol kanalı").addChannelTypes(ChannelType.GuildText).setRequired(true)))
].map((builder) => builder.toJSON());

export const buildingChoices = Object.values(BUILDINGS);
export const unitChoices = Object.entries(UNITS).filter(([key]) => key !== "observer");
export const shipChoices = Object.entries(SHIPS);
