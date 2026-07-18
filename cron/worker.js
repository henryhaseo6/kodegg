// Cloudflare Worker — Cron Trigger untuk memicu workflow GitHub Actions
// "update-codes" TIAP JAM dengan andal. Cron GitHub sendiri sering ditunda/
// di-drop; cron Cloudflare presisi. Worker ini cuma memanggil GitHub API
// workflow_dispatch (butuh token), jadi workflow-nya tetap yang di repo.
//
// Deploy: Workers & Pages → Create → Worker → tempel kode ini.
// Bindings/secret (di Settings → Variables):
//   GITHUB_TOKEN  (Secret) : PAT fine-grained, izin Actions=Read&Write di repo
//   GH_REPO       (Text)   : henryhaseo6/kodegg
//   GH_WORKFLOW   (Text)   : update-codes.yml
//   TRIGGER_KEY   (Secret, opsional) : kunci utk uji manual via URL
// Trigger: Settings → Triggers → Cron Triggers → "0 * * * *" (tiap jam).

export default {
  // Dipanggil otomatis oleh Cron Trigger.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(trigger(env));
  },

  // Uji manual (opsional): buka https://<worker>.workers.dev/?key=TRIGGER_KEY
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) {
      return new Response("kodegg-cron aktif. Tambah ?key=... utk uji manual.", { status: 200 });
    }
    return new Response(await trigger(env));
  },
};

async function trigger(env) {
  const repo = env.GH_REPO || "henryhaseo6/kodegg";
  const wf = env.GH_WORKFLOW || "update-codes.yml";
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "kodegg-cron",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  // GitHub balas 204 No Content saat sukses.
  const msg = res.status === 204 ? "dispatched ✓" : `gagal ${res.status}: ${await res.text()}`;
  console.log("kodegg-cron:", msg);
  return msg;
}
