// Cloudflare Pages Function — simpan/hapus subscription push di KV.
// Binding yang diperlukan: KV namespace bernama SUBS (di dashboard Pages).
// Tidak ada kripto di sini — pengiriman push dilakukan worker (web-push, Node).

async function hash(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.SUBS) return new Response("KV SUBS belum di-bind", { status: 500 });
  let sub;
  try {
    sub = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!sub || !sub.endpoint) return new Response("bad subscription", { status: 400 });
  await env.SUBS.put("sub:" + (await hash(sub.endpoint)), JSON.stringify(sub));
  return new Response("ok", { status: 201 });
}

export async function onRequestDelete({ request, env }) {
  if (!env.SUBS) return new Response("KV SUBS belum di-bind", { status: 500 });
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (body && body.endpoint) await env.SUBS.delete("sub:" + (await hash(body.endpoint)));
  return new Response("ok");
}
