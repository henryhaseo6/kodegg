# Font untuk OG image (di-commit sengaja)

`gen-og.mjs` render teks OG lewat **@napi-rs/canvas** (register TTF + `fillText`).
sharp/librsvg TIDAK dipakai untuk teks karena di Windows mengabaikan font custom
(render fallback sistem) dan buggy saat render text→path. Font di-bake di sini
supaya generator self-contained.

**Kritis:** `SpaceGrotesk-700.ttf` harus = versi Space Grotesk yang dipakai
situs, yaitu **variable font Google Fonts di-instance ke wght tetap**. Jangan
pakai cut floriankarsten (letterform beda dari Google).

## Cara regen (butuh Python + fonttools)

```bash
pip install fonttools brotli
# variable font Google (sumber woff2 situs)
curl -sL "https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf" -o sg-var.ttf
# instance ke bobot tetap (700 utk heading/wordmark, 400 utk subtitle)
python -m fontTools.varLib.instancer sg-var.ttf wght=700 -o SpaceGrotesk-700.ttf
python -m fontTools.varLib.instancer sg-var.ttf wght=400 -o SpaceGrotesk-400.ttf
# rapikan name table → family "Space Grotesk", subfamily "Bold"/"Regular"
python - <<'PY'
from fontTools.ttLib import TTFont
def fix(path, sub):
    f=TTFont(path); n=f['name']
    for nid,val in {1:'Space Grotesk',2:sub,4:'Space Grotesk '+sub,6:'SpaceGrotesk-'+sub,16:'Space Grotesk',17:sub}.items():
        n.setName(val,nid,3,1,0x409); n.setName(val,nid,1,0,0)
    if sub=='Bold':
        f['head'].macStyle|=0x01; f['OS/2'].fsSelection=(f['OS/2'].fsSelection & ~0x40)|0x20
    f.save(path)
fix('SpaceGrotesk-700.ttf','Bold'); fix('SpaceGrotesk-400.ttf','Regular')
PY
```

`SpaceMono-Bold.ttf` = Space Mono Bold dari Google Fonts apa adanya.
Ketiga font berlisensi **OFL 1.1**.
