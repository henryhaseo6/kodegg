# Font untuk OG image (di-commit sengaja)

`gen-og.mjs` render teks OG lewat **fontconfig** (librsvg tak memuat @font-face
woff2). Font di-bake di sini supaya generator self-contained.

**Kritis:** `SpaceGrotesk-700.ttf` harus = versi Space Grotesk yang dipakai
situs, yaitu **variable font Google Fonts di-instance ke wght=700**. Jangan
pakai variable font apa adanya (FreeType tak apply weight axis → render tipis
~400) dan jangan pakai cut floriankarsten (letterform beda dari Google).

## Cara regen (butuh Python + fonttools)

```bash
pip install fonttools brotli
# 1. ambil variable font Google (persis yg jadi sumber woff2 situs)
curl -sL "https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf" -o SG-var.ttf
# 2. instance ke static 700
python -m fontTools.varLib.instancer SG-var.ttf wght=700 -o SpaceGrotesk-700.ttf
# 3. rapikan name table → family "Space Grotesk", subfamily "Bold"
python - <<'PY'
from fontTools.ttLib import TTFont
f=TTFont('SpaceGrotesk-700.ttf'); n=f['name']
for nid,val in {1:'Space Grotesk',2:'Bold',4:'Space Grotesk Bold',6:'SpaceGrotesk-Bold',16:'Space Grotesk',17:'Bold'}.items():
    n.setName(val,nid,3,1,0x409); n.setName(val,nid,1,0,0)
f['head'].macStyle|=0x01
f['OS/2'].fsSelection=(f['OS/2'].fsSelection & ~0x40)|0x20
f.save('SpaceGrotesk-700.ttf')
PY
```

`SpaceMono-Bold.ttf` = Space Mono Bold dari Google Fonts apa adanya (bukan variable).

Kedua font berlisensi **OFL 1.1**.
