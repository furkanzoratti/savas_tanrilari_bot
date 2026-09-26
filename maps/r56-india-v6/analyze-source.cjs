const path = require("node:path");

let sharp;
try { sharp = require("sharp"); }
catch { sharp = require("C:/Users/Frank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"); }

const source = path.join(__dirname, "source", "india-political-updated.png");

async function main() {
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = new Map();
  for (let y = 0; y < info.height; y += 2) {
    for (let x = 3900; x < info.width; x += 2) {
      const index = (y * info.width + x) * info.channels;
      const key = `${data[index]},${data[index + 1]},${data[index + 2]}`;
      colors.set(key, (colors.get(key) || 0) + 1);
    }
  }
  console.log(JSON.stringify({
    width: info.width,
    height: info.height,
    colors: [...colors].sort((a, b) => b[1] - a[1]).slice(0, 35)
  }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
