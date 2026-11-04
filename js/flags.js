/*
 * flags.js
 * ---------------------------------------------------------------------
 * Desain 11 bendera (10 negara ASEAN + bendera ASEAN) yang digambar
 * dengan Canvas 2D. Hasil gambarnya dipakai sebagai tekstur kain bendera
 * di scene 3D (lihat fungsi flag() di scene.js).
 *
 * Setiap entri FLAG_DESIGNS adalah fungsi (g, w, h):
 *   g = konteks Canvas 2D, w/h = lebar & tinggi kanvas (rasio 3:2).
 * Bentuk lambang disederhanakan agar tetap terbaca dari jauh.
 */

const FLAG_TAU = Math.PI * 2;

/** Menggambar bintang bersudut lima di titik (x, y) dengan jari-jari luar R dan dalam r. */
const star = (g, x, y, R, r, fill, rot = -Math.PI / 2) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5,
      rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
};

/** Menggambar garis-garis horizontal berwarna dengan perbandingan tebal `weights`. */
const bands = (g, w, h, cols, weights) => {
  const tot = weights.reduce((a, b) => a + b, 0);
  let y = 0;
  cols.forEach((c, i) => {
    const hh = (h * weights[i]) / tot;
    g.fillStyle = c;
    g.fillRect(0, y, w, hh + 1);
    y += hh;
  });
};

/** Kumpulan fungsi penggambar bendera, dipanggil per nama. */
const FLAG_DESIGNS = {
  ASEAN: (g, w, h) => {
    g.fillStyle = "#0b3f9b";
    g.fillRect(0, 0, w, h);
    const cx = w / 2,
      cy = h / 2,
      R = h * 0.36;
    g.beginPath();
    g.arc(cx, cy, R, 0, FLAG_TAU);
    g.fillStyle = "#ffffff";
    g.fill();
    g.beginPath();
    g.arc(cx, cy, R * 0.9, 0, FLAG_TAU);
    g.fillStyle = "#d6262e";
    g.fill();
    g.strokeStyle = "#f6d317";
    g.lineCap = "round";
    g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i - 4.5) * 0.2;
      g.beginPath();
      g.moveTo(cx, cy + R * 0.6);
      g.quadraticCurveTo(
        cx + Math.cos(a) * R * 0.35,
        cy,
        cx + Math.cos(a) * R * 0.62,
        cy + Math.sin(a) * R * 0.62,
      );
      g.stroke();
      g.beginPath();
      g.ellipse(
        cx + Math.cos(a) * R * 0.62,
        cy + Math.sin(a) * R * 0.62,
        3,
        6,
        a + Math.PI / 2,
        0,
        FLAG_TAU,
      );
      g.fillStyle = "#f6d317";
      g.fill();
    }
  },
  Brunei: (g, w, h) => {
    g.fillStyle = "#f7e017";
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(0, h * 0.3);
    g.rotate(0.33);
    g.fillStyle = "#ffffff";
    g.fillRect(-20, 0, w * 1.3, h * 0.17);
    g.fillStyle = "#111";
    g.fillRect(-20, h * 0.17, w * 1.3, h * 0.13);
    g.restore();
    g.fillStyle = "#cf1126";
    g.beginPath();
    g.arc(w / 2, h * 0.56, h * 0.2, 0, Math.PI);
    g.fill();
    g.fillRect(w / 2 - 4, h * 0.25, 8, h * 0.4);
    g.beginPath();
    g.moveTo(w / 2 - h * 0.16, h * 0.33);
    g.lineTo(w / 2 + h * 0.16, h * 0.33);
    g.lineTo(w / 2, h * 0.42);
    g.fill();
  },
  Kamboja: (g, w, h) => {
    bands(g, w, h, ["#032ea1", "#e00025", "#032ea1"], [1, 2, 1]);
    g.fillStyle = "#fff";
    const cx = w / 2,
      b = h * 0.66;
    g.fillRect(cx - h * 0.36, b - 6, h * 0.72, 6);
    [
      [-0.3, 0.14],
      [-0.15, 0.2],
      [0, 0.27],
      [0.15, 0.2],
      [0.3, 0.14],
    ].forEach(([dx, t]) => {
      g.beginPath();
      g.moveTo(cx + dx * h - 9, b - 6);
      g.lineTo(cx + dx * h, b - 6 - t * h);
      g.lineTo(cx + dx * h + 9, b - 6);
      g.fill();
    });
  },
  Indonesia: (g, w, h) => bands(g, w, h, ["#e1262d", "#ffffff"], [1, 1]),
  Laos: (g, w, h) => {
    bands(g, w, h, ["#ce1126", "#002868", "#ce1126"], [1, 2, 1]);
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.2, 0, FLAG_TAU);
    g.fillStyle = "#fff";
    g.fill();
  },
  Malaysia: (g, w, h) => {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : "#cc0001";
      g.fillRect(0, (i * h) / 14, w, h / 14 + 1);
    }
    g.fillStyle = "#010066";
    g.fillRect(0, 0, w / 2, (h * 8) / 14);
    const cx = w * 0.2,
      cy = (h * 4) / 14;
    g.beginPath();
    g.arc(cx, cy, h * 0.2, 0, FLAG_TAU);
    g.fillStyle = "#fc0";
    g.fill();
    g.beginPath();
    g.arc(cx + h * 0.06, cy, h * 0.17, 0, FLAG_TAU);
    g.fillStyle = "#010066";
    g.fill();
    star(g, w * 0.36, cy, h * 0.15, h * 0.065, "#fc0");
  },
  Myanmar: (g, w, h) => {
    bands(g, w, h, ["#fecb00", "#34b233", "#ea2839"], [1, 1, 1]);
    star(g, w / 2, h * 0.55, h * 0.42, h * 0.17, "#ffffff");
  },
  Filipina: (g, w, h) => {
    bands(g, w, h, ["#0038a8", "#ce1126"], [1, 1]);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(h * 0.87, h / 2);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = "#fff";
    g.fill();
    g.beginPath();
    g.arc(h * 0.29, h / 2, h * 0.09, 0, FLAG_TAU);
    g.fillStyle = "#fcd116";
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.save();
      g.translate(h * 0.29, h / 2);
      g.rotate(a);
      g.fillRect(h * 0.1, -2, h * 0.08, 4);
      g.restore();
    }
    [
      [0.07, 0.12],
      [0.07, 0.88],
      [0.7, 0.5],
    ].forEach(([x, y]) => star(g, x * h, y * h, h * 0.05, h * 0.02, "#fcd116"));
  },
  Singapura: (g, w, h) => {
    bands(g, w, h, ["#ef3340", "#ffffff"], [1, 1]);
    g.beginPath();
    g.arc(w * 0.2, h * 0.25, h * 0.17, 0, FLAG_TAU);
    g.fillStyle = "#fff";
    g.fill();
    g.beginPath();
    g.arc(w * 0.25, h * 0.25, h * 0.16, 0, FLAG_TAU);
    g.fillStyle = "#ef3340";
    g.fill();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * FLAG_TAU) / 5;
      star(
        g,
        w * 0.32 + Math.cos(a) * h * 0.08,
        h * 0.25 + Math.sin(a) * h * 0.08,
        h * 0.035,
        h * 0.014,
        "#fff",
      );
    }
  },
  Thailand: (g, w, h) =>
    bands(g, w, h, ["#a51931", "#f4f5f8", "#2d2a4a", "#f4f5f8", "#a51931"], [1, 1, 2, 1, 1]),
  Vietnam: (g, w, h) => {
    g.fillStyle = "#da251d";
    g.fillRect(0, 0, w, h);
    star(g, w / 2, h / 2, h * 0.3, h * 0.12, "#ffff00");
  },
};
