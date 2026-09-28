const serviceName = process.env.RAILWAY_SERVICE_NAME?.trim().toLocaleLowerCase("tr-TR");

if (serviceName === "operasyon-masasi") {
  await import("./admin/server.js");
} else {
  await import("./register-commands.js");
  await import("./index.js");
}
