// Helper SEO kecil. Bulan+tahun untuk title/deskripsi ("Kode Redeem X Juli 2026")
// — sinyal kesegaran + dongkrak CTR untuk query "kode redeem ... terbaru".
// Dihitung saat build; karena situs rebuild tiap jam, bulan/tahun auto-update
// sendiri tiap ganti bulan tanpa intervensi.

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "Juli 2026" / "July 2026". Zona WIB agar batas bulan konsisten dg konten ID.
export function monthYear(lang, now = new Date()) {
  const jkt = new Date(now.getTime() + 7 * 3600 * 1000); // UTC → WIB (UTC+7)
  const m = (lang === "id" ? MONTHS_ID : MONTHS_EN)[jkt.getUTCMonth()];
  return `${m} ${jkt.getUTCFullYear()}`;
}
