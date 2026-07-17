import { defineConfig } from "astro/config";

// SSG: seluruh halaman dirender jadi HTML statis saat build. Ini alasan utama
// pindah dari .dc.html — mockup Design Component dirender di browser, sehingga
// crawler hanya melihat halaman kosong. Portal kode redeem hidup dari pencarian.
export default defineConfig({
  site: "https://kodegg.com",
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
