# Bundaran ITS WebGL

Model 3D Bundaran ITS Surabaya dengan WebGL2 murni (tanpa library 3D).

**Kelompok**

1. Naura Taqiyya Mazi — NRP 5025241119
2. Riyannizaar Dwi Amarullah — NRP 5025241121

## Cara menjalankan

**Cara cepat:** buka `index.html` langsung di Chrome, Edge, atau Firefox.

**Disarankan untuk demo:** jalankan lewat server lokal supaya video YouTube ikut tampil
(YouTube kadang menolak diputar dari file yang dibuka langsung).

```bash
# dari dalam folder proyek
python -m http.server 8000
# lalu buka http://localhost:8000
```

Atau pakai ekstensi **Live Server** di VS Code (klik kanan `index.html` → _Open with Live Server_).

Butuh koneksi internet untuk font Google dan video YouTube. Scene 3D tetap jalan tanpa internet
(huruf memakai font cadangan).

## Struktur folder

```
index.html            halaman: anggota, perbandingan foto vs kanvas, video, pohon objek, tugas, sumber
css/style.css         tampilan halaman
js/engine.js          mesin GL3D: matematika, geometri, shader, bayangan, bloom, kamera orbit
js/flags.js           gambar 11 bendera (10 negara ASEAN + ASEAN) dengan Canvas 2D
js/scene.js           semua objek Bundaran ITS + animasi per frame
js/main.js            menyalakan scene, tombol kontrol, dan loop animasi
img/bundaran-its-asli.jpg   foto asli (resolusi ditingkatkan 2×)
```

Urutan pemuatan skrip: `engine.js` → `flags.js` → `scene.js` → `main.js`.

## Kontrol saat demo

| Aksi                | Cara                                   |
| ------------------- | -------------------------------------- |
| Putar kamera        | seret dengan mouse / satu jari         |
| Zoom                | scroll / cubit dua jari                |
| Pagi ↔ malam       | tombol **Pagi/Malam** atau tekan **N** |
| Samakan dengan foto | tombol **Sudut foto asli**             |
| Layar penuh         | tombol **Layar penuh**                 |

Lewat console browser juga bisa: `bundaran.setNight(1)`, `bundaran.toggleFountain()`,
`bundaran.photoView()`.
