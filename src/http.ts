import { createServer } from "node:http";
import type { Client } from "discord.js";
import { config } from "./config.js";

export function startHealthServer(client: Client) {
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      const ready = client.isReady();
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: ready, discord: client.ws.status }));
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(config.PORT, "0.0.0.0");
  return server;
}
