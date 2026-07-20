// Metadata YouTube otomatis (judul/deskripsi/tag SEO) dari data game + kode.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SITE = "https://kodegg.com";

const pascal = (s) => s.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

/**
 * @param {{name, platform:'ROBLOX'|'MOBILE', slug, codes:[{code,reward}], activeCount, now:Date}} o
 * @returns {{title, description, tags:string[]}}
 */
export function buildMetadata({ name, platform, slug, codes, activeCount, now }) {
  const my = `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const isRoblox = platform === "ROBLOX";
  const url = `${SITE}/id/${isRoblox ? "roblox" : "game"}/${slug}/`;
  const tag = pascal(name); // "BloxFruits"

  // Judul (<=100 char): "[Game] Codes" (search global EN) + "Kode Terbaru" (search ID).
  let title = `${name} Codes (${my}) 🎁 Kode Terbaru — KodeGG`;
  if (title.length > 100) title = `${name} Codes (${my}) — Kode Terbaru`.slice(0, 100);

  const codeLines = codes.slice(0, 8).map((c) => `• ${c.code}${c.reward ? ` — ${c.reward}` : ""}`).join("\n");
  const description =
    `Kode redeem ${name} terbaru & aktif ${my}! ${activeCount} kode aktif, semua terverifikasi.\n\n` +
    `🎁 KODE:\n${codeLines}\n\n` +
    `✅ Full list + cara redeem (auto-update tiap jam):\n${url}\n\n` +
    `KodeGG — portal kode redeem game online & Roblox. 200+ game, kode terverifikasi cross-check, update otomatis tiap jam.\n` +
    `🔔 Subscribe & nyalain lonceng biar gak ketinggalan kode baru!\n\n` +
    `— The latest working ${name} codes for ${my} (updated hourly). Full list + how to redeem: ${url}\n\n` +
    `#Shorts #${tag} #${tag}Codes #${isRoblox ? "RobloxCodes #Roblox" : "GameCodes"} #RedeemCodes #KodeRedeem #KodeGG`;

  const tags = [
    name, `${name} codes`, `${name} code`, `${name} redeem codes`, `kode ${name}`, `${name} ${my}`,
    isRoblox ? "roblox codes" : "redeem codes", isRoblox ? "roblox" : "game codes",
    "redeem codes", "kode redeem", "free codes", "kodegg", "new codes",
  ];
  return { title, description: description.slice(0, 4900), tags };
}
