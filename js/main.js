/*
 * main.js
 * ---------------------------------------------------------------------
 * Titik awal aplikasi di halaman index.html:
 *   1. menunggu font huruf 3D (Oswald) siap
 *   2. membuat scene lewat createBundaranScene() dari scene.js
 *   3. menyesuaikan ukuran kanvas dengan bingkainya (ResizeObserver)
 *   4. menghubungkan tombol kontrol (pagi/malam, orbit, air mancur, kamera, layar penuh)
 *   5. menjalankan loop animasi, dan menjeda loop saat kanvas tidak terlihat di layar
 */

(async function main() {
  const frame = document.getElementById("viewer");
  const canvas = document.getElementById("stage");
  const loading = document.getElementById("loading");
  const $ = (id) => document.getElementById(id);

  /* ---------- 1. tunggu font untuk huruf 3D (maksimal 2,5 detik) ---------- */
  try {
    await Promise.race([
      document.fonts.load('700 200px "Oswald"'),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) {
    /* font cadangan tetap dipakai */
  }

  /* ---------- 2. bangun scene ---------- */
  let app;
  try {
    app = createBundaranScene(canvas);
  } catch (err) {
    loading.textContent = "Scene gagal dimuat: " + err.message;
    console.error(err);
    return;
  }
  // memudahkan demo lewat console browser, mis. bundaran.setNight(1)
  window.bundaran = app;

  /* ---------- 3. ukuran kanvas mengikuti bingkai ---------- */
  const fit = () => {
    const r = frame.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) app.resize(r.width, r.height);
  };
  new ResizeObserver(fit).observe(frame);
  fit();

  /* ---------- 4. tombol kontrol ---------- */
  const setMode = (n) => {
    app.setNight(n);
    $("btnDay").setAttribute("aria-pressed", String(!n));
    $("btnNight").setAttribute("aria-pressed", String(!!n));
  };
  $("btnDay").addEventListener("click", () => setMode(0));
  $("btnNight").addEventListener("click", () => setMode(1));

  const orbitBtn = $("btnOrbit");
  const showOrbit = (on) => {
    orbitBtn.setAttribute("aria-pressed", String(on));
    orbitBtn.textContent = on ? "Orbit 360° aktif" : "Orbit 360° jeda";
  };
  orbitBtn.addEventListener("click", () => showOrbit(app.toggleOrbit()));

  $("btnFountain").addEventListener("click", (e) => {
    e.currentTarget.setAttribute("aria-pressed", String(app.toggleFountain()));
  });
  $("btnReset").addEventListener("click", () => app.resetCamera());
  $("btnPhoto").addEventListener("click", () => {
    app.photoView();
    showOrbit(false);
  });

  // layar penuh untuk bingkai kanvas (tidak semua perangkat mendukung)
  $("btnFull").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch (e) {
      $("btnFull").disabled = true;
    }
  });

  // tombol N di keyboard = ganti pagi/malam
  addEventListener("keydown", (e) => {
    if (e.key === "n" || e.key === "N") setMode(app.isNight() ? 0 : 1);
  });

  // pengguna yang memilih "kurangi gerakan" mendapat putaran kamera lebih pelan
  app.setReducedMotion(matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- 5. loop animasi ---------- */
  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }).observe(frame);

  const clock = new GL3D.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (visible) app.update(dt, clock.elapsedTime);
    requestAnimationFrame(loop);
  }
  loop();

  loading.classList.add("is-done");
})();
