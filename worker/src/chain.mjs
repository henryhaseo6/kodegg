// Helper rantai fallback: coba sumber berurutan sampai ada yang berhasil.
//
// Dipakai baik untuk kode maupun icon. Prinsipnya sama dengan permintaan:
// jangan bergantung pada satu sumber — kalau A gagal/kosong, lanjut ke B, C, …
//
// "Berhasil" ditentukan oleh `accept(hasil)` (default: hasil truthy & tidak
// kosong). Sumber yang melempar error dianggap gagal dan dicatat, bukan
// menjatuhkan seluruh proses.

const nonEmpty = (v) =>
  v != null && (Array.isArray(v) ? v.length > 0 : Boolean(v));

/**
 * @param {Array<{name: string, run: () => Promise<any>}>} sources
 * @param {object} [opt]
 * @param {(result: any) => boolean} [opt.accept] kriteria "berhasil"
 * @param {(msg: string) => void}   [opt.log]    pencatat jejak percobaan
 * @returns {Promise<{ value: any, source: string|null, tried: string[] }>}
 */
export async function firstOk(sources, opt = {}) {
  const accept = opt.accept ?? nonEmpty;
  const log = opt.log ?? (() => {});
  const tried = [];

  for (const src of sources) {
    tried.push(src.name);
    try {
      const value = await src.run();
      if (accept(value)) {
        if (tried.length > 1) log(`✓ ${src.name} (setelah ${tried.slice(0, -1).join(", ")} gagal)`);
        return { value, source: src.name, tried };
      }
      log(`· ${src.name}: kosong, lanjut fallback`);
    } catch (err) {
      log(`· ${src.name}: ${err.message}, lanjut fallback`);
    }
  }

  return { value: null, source: null, tried };
}

/**
 * Jalankan SEMUA sumber (paralel) dan kembalikan yang berhasil beserta yang
 * gagal. Dipakai saat kelengkapan lebih penting daripada berhenti di satu
 * sumber — mis. kode redeem: gabungkan hasil semua penyedia agar tidak
 * ketinggalan kode yang hanya ada di salah satunya.
 *
 * @param {Array<{name: string, run: () => Promise<any>}>} sources
 * @returns {Promise<{ ok: Array<{name,value}>, failed: Array<{name,error}> }>}
 */
export async function collectAll(sources) {
  const settled = await Promise.all(
    sources.map(async (s) => {
      try {
        return { name: s.name, ok: true, value: await s.run() };
      } catch (err) {
        return { name: s.name, ok: false, error: err.message };
      }
    }),
  );
  return {
    ok: settled.filter((s) => s.ok).map(({ name, value }) => ({ name, value })),
    failed: settled.filter((s) => !s.ok).map(({ name, error }) => ({ name, error })),
  };
}
