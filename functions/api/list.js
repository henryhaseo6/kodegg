// Cloudflare Pages Function — daftar semua subscription (untuk worker pengirim
// push di GitHub Actions). DILINDUNGI secret: header Authorization: Bearer
// <PUSH_SECRET> (env var PUSH_SECRET di project Pages). Jangan diakses publik.

export async function onRequestGet({ request, env }) {
  if (!env.SUBS) return new Response("KV SUBS belum di-bind", { status: 500 });
  const auth = request.headers.get("authorization") || "";
  if (!env.PUSH_SECRET || auth !== `Bearer ${env.PUSH_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const out = [];
  let cursor;
  do {
    const list = await env.SUBS.list({ prefix: "sub:", cursor });
    for (const k of list.keys) {
      const v = await env.SUBS.get(k.name);
      if (v) out.push(JSON.parse(v));
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);
  return Response.json(out);
}
