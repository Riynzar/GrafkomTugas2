/*
 * scene.js
 * ---------------------------------------------------------------------
 * Membangun seluruh objek 3D Bundaran ITS di atas mesin GL3D (engine.js):
 * langit, cahaya, tanah, plaza & jalan berpola, taman bunga, air mancur,
 * huruf 3D, gate bertiang gerigi, gerbang ITS, bendera ASEAN, lampu jalan,
 * pohon, dan mobil. Semua objek disusun sebagai pohon (scene graph):
 * induk (Group) memegang anak-anaknya sehingga posisi anak ikut induk.
 *
 * Fungsi utama: createBundaranScene(canvas) -> mengembalikan API kecil
 * (update, setNight, toggleOrbit, dst.) yang dipakai oleh main.js.
 * Bergantung pada: engine.js (GL3D) dan flags.js (FLAG_DESIGNS).
 */

/**
 * Membuat scene Bundaran ITS pada elemen <canvas>.
 * @param {HTMLCanvasElement} canvas kanvas tempat menggambar
 * @returns {object} API untuk mengontrol scene
 */
function createBundaranScene(canvas) {
  /* ================= RENDERER, SCENE, KAMERA, KONTROL ================= */
  const renderer = new GL3D.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 450);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = GL3D.PCFSoftShadowMap;
  renderer.toneMapping = GL3D.ACESFilmicToneMapping;
  renderer.outputColorSpace = GL3D.SRGBColorSpace;

  const scene = new GL3D.Scene();
  scene.fog = new GL3D.Fog(0xcfe0ef, 160, 420);
  const camera = new GL3D.PerspectiveCamera(
    50,
    (canvas.clientWidth || 16) / (canvas.clientHeight || 9),
    0.5,
    1200,
  );
  const HOME = new GL3D.Vector3(-64, 32, -24);
  camera.position.copy(HOME);

  const controls = new GL3D.OrbitControls(camera, canvas);
  controls.target.set(0, 3, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.55;
  controls.minDistance = 18;
  controls.maxDistance = 200;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.enablePan = false;

  // efek bloom (cahaya berpendar) + tone mapping ACES dikerjakan oleh renderer GL3D
  const bloom = renderer.bloom;
  Object.assign(bloom, { strength: 0.2, radius: 0.3, threshold: 0.92 });

  /* ================= FUNGSI BANTU ================= */
  // canvasTex: membuat tekstur dari gambar Canvas 2D (dipakai untuk semua pola permukaan)
  // noise: menaburkan titik terang/gelap acak supaya tekstur tidak terlihat datar
  // P: mengubah koordinat polar (jari-jari, sudut, tinggi) menjadi titik 3D
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    draw(g, w, h);
    const t = new GL3D.CanvasTexture(c);
    if (srgb) t.colorSpace = GL3D.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = GL3D.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function noise(g, w, h, amt, alpha = 0.08) {
    for (let i = 0; i < amt; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }
  const P = (r, a, y = 0) => new GL3D.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  // daftar material & cahaya yang berubah saat pergantian pagi/malam
  const nightables = []; // {mat, dayI, nightI} = kekuatan emisi siang & malam
  const glowMeshes = []; // bidang cahaya aditif yang hanya muncul saat malam
  function nightEmissive(mat, dayI, nightI) {
    nightables.push({ mat, dayI, nightI });
    return mat;
  }

  /* ================= KONSTANTA TATA LETAK (satuan meter) ================= */
  const R_ISLAND = 20,
    R_ROAD_OUT = 36,
    R_WALK = 41.5,
    R_PLAZA = 52;
  const ROAD_ANGLES = [Math.PI / 2, 3.575, -1.32]; // sudut jalan masuk: gerbang (tetap), jalan bawah kanopi, jalan kiri (mengikuti foto asli)
  const LET_CENTER = 0.3; // posisi tengah tulisan
  const GATE_A = Math.PI / 2;
  const ROAD_W = 16;

  /* ================= LANGIT: gradien, awan, bintang, bulan ================= */
  const skyUni = {
    top: { value: new GL3D.Color(0x3d7fd1) },
    bottom: { value: new GL3D.Color(0xdfeefa) },
    horizonGlow: { value: new GL3D.Color(0xfff2d8) },
  };
  const sky = new GL3D.Mesh(
    new GL3D.SphereGeometry(600, 32, 16),
    new GL3D.ShaderMaterial({
      side: GL3D.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUni,
      vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top,bottom,horizonGlow; varying vec3 vP;
    void main(){ float h=clamp(vP.y,0.,1.); vec3 c=mix(bottom,top,pow(h,.55)); c=mix(c,horizonGlow,exp(-h*14.)*.35); gl_FragColor=vec4(c,1.); }`,
    }),
  );
  scene.add(sky);
  // awan (terlihat saat pagi)
  const cloudTex = canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 14; i++) {
      const x = rnd(50, 206),
        y = rnd(50, 80),
        r = rnd(22, 44);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,.85)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  });
  const clouds = new GL3D.Group();
  for (let i = 0; i < 14; i++) {
    const m = new GL3D.Sprite(
      new GL3D.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.9,
      }),
    );
    const a = rnd(0, TAU),
      r = rnd(260, 380);
    m.position.set(Math.cos(a) * r, rnd(70, 140), Math.sin(a) * r);
    m.scale.set(rnd(120, 200), rnd(45, 70), 1);
    clouds.add(m);
  }
  scene.add(clouds);
  // bintang (terlihat saat malam)
  const starGeo = new GL3D.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 1400; i++) {
    const v = new GL3D.Vector3().randomDirection();
    if (v.y < 0.08) v.y = Math.abs(v.y) + 0.08;
    v.normalize().multiplyScalar(560);
    sp.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute("position", new GL3D.Float32BufferAttribute(sp, 3));
  const stars = new GL3D.Points(
    starGeo,
    new GL3D.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    }),
  );
  scene.add(stars);
  const moon = new GL3D.Mesh(
    new GL3D.SphereGeometry(9, 24, 16),
    new GL3D.MeshBasicMaterial({ color: 0xf4f1e0, transparent: true, opacity: 0, fog: false }),
  );
  moon.position.set(-220, 240, -300);
  scene.add(moon);

  /* ================= PENCAHAYAAN: langit-tanah, matahari (+bayangan), bulan ================= */
  const hemi = new GL3D.HemisphereLight(0xcfe6ff, 0x5b6b3a, 1.1);
  scene.add(hemi);
  const sun = new GL3D.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(70, 95, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -80,
    right: 80,
    top: 80,
    bottom: -80,
    near: 10,
    far: 300,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const moonLight = new GL3D.DirectionalLight(0x8fa8ff, 0);
  moonLight.position.set(-60, 90, -80);
  scene.add(moonLight);

  /* ================= TANAH RUMPUT ================= */
  const grassTex = canvasTex(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = "#5f8a3a";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = `hsla(${rnd(80, 105)},${rnd(35, 55)}%,${rnd(22, 42)}%,.55)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3);
      }
    },
    { repeat: [60, 60] },
  );
  const ground = new GL3D.Mesh(
    new GL3D.PlaneGeometry(900, 900),
    new GL3D.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ================= PLAZA: tekstur jalan bundaran dilukis dari atas ================= */
  const S = 4096,
    SC = S / (2 * R_PLAZA); // ukuran kanvas & piksel per meter
  const plazaTex = canvasTex(S, S, (g) => {
    const cx = S / 2,
      cy = S / 2,
      m = (r) => r * SC;
    const ring = (r0, r1, fill) => {
      g.beginPath();
      g.arc(cx, cy, m(r1), 0, TAU);
      g.arc(cx, cy, m(r0), 0, TAU, true);
      g.fillStyle = fill;
      g.fill();
    };
    const pt = (r, a) => [cx + Math.cos(a) * m(r), cy + Math.sin(a) * m(r)];
    // rumput sebagai dasar (huruf & tiang gate berdiri di atas rumput)
    g.fillStyle = "#5f8a3a";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 120000; i++) {
      g.fillStyle = `hsla(${rnd(80, 105)},45%,${rnd(24, 40)}%,.5)`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 4);
    }
    // ---- trotoar: abu-abu polos ----
    ring(R_ROAD_OUT, R_WALK, "#9a9c9f");
    g.save();
    g.strokeStyle = "rgba(60,62,66,.25)";
    g.lineWidth = 1.5;
    for (let r = R_ROAD_OUT + 0.5; r < R_WALK; r += 0.5) {
      g.beginPath();
      g.arc(cx, cy, m(r), 0, TAU);
      g.stroke();
    }
    const ns = Math.floor((TAU * R_WALK) / 0.5);
    for (let k = 0; k < ns; k++) {
      const a = (k / ns) * TAU;
      g.beginPath();
      g.moveTo(...pt(R_ROAD_OUT, a));
      g.lineTo(...pt(R_WALK, a));
      g.stroke();
    }
    g.restore();
    ring(R_ROAD_OUT, R_ROAD_OUT + 0.45, "#d4d3cf");
    ring(R_WALK - 0.3, R_WALK, "#c3c2be"); // kanstin
    // ---- jalan bundaran: paving berpola seperti aslinya ----
    // dasar paving abu-abu
    ring(R_ISLAND, 33, "#8b8d91");
    g.save();
    g.beginPath();
    g.arc(cx, cy, m(33), 0, TAU);
    g.arc(cx, cy, m(R_ISLAND), 0, TAU, true);
    g.clip();
    // 6 segitiga melengkung kuning pucat (alas di tepi luar, ujung ditarik ke tepi taman);
    // sisa abu-abu di antaranya membentuk 6 segitiga abu-abu
    const rI = 19.6,
      rO = 33.4,
      W6 = (TAU / 6) * 0.64,
      T1 = 0.9,
      T2 = T1 - W6;
    const side = (th, T, t) => pt(rO + (rI - rO) * t, th + T * Math.pow(t, 1.35));
    for (let i = 0; i < 6; i++) {
      const th0 = (i / 6) * TAU,
        th1 = th0 + W6;
      const n = 40;
      g.beginPath();
      g.moveTo(...side(th0, T1, 0));
      for (let k = 1; k <= n; k++) g.lineTo(...side(th0, T1, k / n)); // sudut kiri luar -> ujung
      for (let k = n; k >= 0; k--) g.lineTo(...side(th1, T2, k / n)); // ujung -> sudut kanan luar
      g.arc(cx, cy, m(rO), th1, th0, true);
      g.closePath();
      g.fillStyle = "#d8cba2";
      g.fill();
    }
    // tekstur sambungan paving
    g.globalAlpha = 0.08;
    g.strokeStyle = "#2c2a27";
    g.lineWidth = 1;
    for (let r = R_ISLAND; r < 33; r += 0.45) {
      g.beginPath();
      g.arc(cx, cy, m(r), 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    noise(g, S, S, 120000, 0.06);
    g.restore();
    // pinggiran krem di tepi taman
    ring(R_ISLAND, R_ISLAND + 0.7, "#cfc6b2");
    // pita bata merah di tepi luar jalan
    ring(33, 35.6, "#b24a4c");
    g.save();
    g.strokeStyle = "rgba(60,15,15,.3)";
    g.lineWidth = 1.2;
    for (let r = 33; r < 35.6; r += 0.33) {
      g.beginPath();
      g.arc(cx, cy, m(r), 0, TAU);
      g.stroke();
    }
    const nb = Math.floor((TAU * 35.6) / 0.5);
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU;
      g.beginPath();
      g.moveTo(...pt(33, a));
      g.lineTo(...pt(35.6, a));
      g.stroke();
    }
    g.restore();
    // marka putih: lingkaran tengah + garis melintang
    g.strokeStyle = "#f1efea";
    g.lineCap = "butt";
    g.lineWidth = m(0.3);
    g.beginPath();
    g.arc(cx, cy, m(26.8), 0, TAU);
    g.stroke();
    g.lineWidth = m(0.28);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.12;
      g.beginPath();
      g.moveTo(...pt(R_ISLAND + 0.7, a));
      g.lineTo(...pt(33, a));
      g.stroke();
    }
    // ---- jalan masuk (aspal) dengan ujung melengkung menyatu ke pita merah ----
    for (const a of ROAD_ANGLES) {
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      const Rc = 35.6,
        F = 6,
        hw = ROAD_W / 2;
      g.fillStyle = "#4b4e53";
      g.fillRect(m(Rc), -m(hw), m(R_PLAZA), m(2 * hw));
      for (const sgn of [-1, 1]) {
        const yA = sgn * (hw + F),
          xA = Math.sqrt(Rc * Rc - yA * yA),
          angA = Math.atan2(yA, xA);
        const B = [Rc + F * 0.9, sgn * hw],
          C = [Rc + 0.2, sgn * hw];
        g.beginPath();
        g.moveTo(m(Rc), 0);
        for (let k = 1; k <= 16; k++) {
          const an = (angA * k) / 16;
          g.lineTo(m(Math.cos(an) * Rc), m(Math.sin(an) * Rc));
        }
        g.quadraticCurveTo(m(C[0]), m(C[1]), m(B[0]), m(B[1]));
        g.lineTo(m(B[0]), 0);
        g.closePath();
        g.fillStyle = "#4b4e53";
        g.fill();
        // pita merah ikut membelok di tikungan lalu menyusuri tepi jalan
        g.beginPath();
        g.moveTo(m(xA), m(yA));
        g.quadraticCurveTo(m(C[0]), m(C[1]), m(B[0]), m(B[1]));
        g.lineTo(m(R_PLAZA), m(sgn * hw));
        g.strokeStyle = "#b24a4c";
        g.lineWidth = m(1.2);
        g.stroke();
        g.strokeStyle = "#d4d3cf";
        g.lineWidth = m(0.25);
        g.stroke();
      }
      g.fillStyle = "#d8d4c9";
      g.fillRect(m(43), -m(1), m(R_PLAZA), m(2)); // median jalan
      g.restore();
    }
    noise(g, S, S, 50000, 0.035);
  });
  const plaza = new GL3D.Mesh(
    new GL3D.CircleGeometry(R_PLAZA, 128),
    new GL3D.MeshStandardMaterial({ map: plazaTex, roughness: 0.92 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // lanjutan jalan masuk di luar plaza
  const roadTex = canvasTex(
    256,
    512,
    (g, w, h) => {
      g.fillStyle = "#4b4e53";
      g.fillRect(0, 0, w, h);
      noise(g, w, h, 6000, 0.07);
      g.fillStyle = "#d8d4c9";
      g.fillRect(w / 2 - 16, 0, 32, h);
      g.fillStyle = "#fff";
      for (let y = 0; y < h; y += 64) {
        g.fillRect(w * 0.25 - 3, y, 6, 32);
        g.fillRect(w * 0.75 - 3, y, 6, 32);
      }
    },
    { repeat: [1, 10] },
  );
  for (const a of ROAD_ANGLES) {
    const len = 260;
    const road = new GL3D.Mesh(
      new GL3D.PlaneGeometry(ROAD_W, len),
      new GL3D.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }),
    );
    const c = P(R_PLAZA - 1 + len / 2, a, 0.03);
    road.position.copy(c);
    road.receiveShadow = true;
    // arahkan sisi panjang bidang ke arah luar bundaran
    road.rotation.set(-Math.PI / 2, 0, 0);
    road.rotateOnWorldAxis(new GL3D.Vector3(0, 1, 0), -a + Math.PI / 2);
    scene.add(road);
  }

  /* ================= PULAU TENGAH: kanstin, rumput, taman bunga, pagar ================= */
  const island = new GL3D.Group();
  scene.add(island);
  const curbTex = canvasTex(
    512,
    32,
    (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? "#1d1d1d" : "#f2c418";
        g.fillRect((i * w) / 16, 0, w / 16, h);
      }
    },
    { repeat: [28, 1] },
  );
  const curb = new GL3D.Mesh(
    new GL3D.CylinderGeometry(R_ISLAND, R_ISLAND, 0.45, 128, 1, true),
    new GL3D.MeshStandardMaterial({ map: curbTex, roughness: 0.7 }),
  );
  curb.position.y = 0.22;
  island.add(curb);
  const islandGrassTex = canvasTex(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = "#6d9a3e";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `hsla(${rnd(78, 100)},50%,${rnd(28, 46)}%,.5)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3);
      }
    },
    { repeat: [10, 10] },
  );
  const grassMat = new GL3D.MeshStandardMaterial({ map: islandGrassTex, roughness: 1 });
  const top = new GL3D.Mesh(
    new GL3D.CylinderGeometry(R_ISLAND - 0.02, R_ISLAND - 0.02, 0.44, 128),
    grassMat,
  );
  top.position.y = 0.22;
  top.receiveShadow = true;
  island.add(top);
  // taman berpola bunga matahari di sekeliling air mancur
  const gardenTex = canvasTex(2048, 2048, (g, w, h) => {
    const c = w / 2,
      k = w / (2 * R_ISLAND);
    const pt = (r, a) => [c + Math.cos(a) * r * k, c + Math.sin(a) * r * k];
    g.fillStyle = "#6d9a3e";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60000; i++) {
      g.fillStyle = `hsla(${rnd(78, 100)},50%,${rnd(28, 46)}%,.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3);
    }
    const NP = 16;
    // kelopak kuning mengarah keluar, pangkalnya di tepi kolam
    for (let i = 0; i < NP; i++) {
      const a = (i / NP) * TAU,
        hw = (TAU / NP) * 0.5;
      g.beginPath();
      g.moveTo(...pt(9.9, a - hw));
      g.quadraticCurveTo(...pt(13.0, a - hw * 1.05), ...pt(15.8, a));
      g.quadraticCurveTo(...pt(13.0, a + hw * 1.05), ...pt(9.9, a + hw));
      g.closePath();
      g.fillStyle = "#e9cf1c";
      g.fill();
      g.strokeStyle = "#b49a10";
      g.lineWidth = 4;
      g.stroke();
      // setengah lingkaran DI DALAM kelopak (sisi datar menempel ke kolam)
      const [bx, by] = pt(9.95, a);
      g.beginPath();
      g.arc(bx, by, 1.6 * k, a - Math.PI / 2, a + Math.PI / 2);
      g.closePath();
      const gr = g.createRadialGradient(bx, by, 0, bx, by, 1.6 * k);
      gr.addColorStop(0, "#6e5a22");
      gr.addColorStop(1, "#8f8a34");
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "#5a4a1c";
      g.lineWidth = 3;
      g.stroke();
    }
    // pita tanaman gelap tepat di tepi kolam
    g.beginPath();
    g.arc(c, c, 9.95 * k, 0, TAU);
    g.arc(c, c, 9.3 * k, 0, TAU, true);
    g.fillStyle = "#3d6a2a";
    g.fill();
    // rumpun bunga bulat kuning pucat di rumput
    for (let i = 0; i < NP; i++) {
      const a = ((i + 0.5) / NP) * TAU;
      const [x, y] = pt(15.4, a);
      g.beginPath();
      g.arc(x, y, 0.8 * k, 0, TAU);
      g.fillStyle = "#ece48a";
      g.fill();
    }
    for (let i = 0; i < 20000; i++) {
      g.fillStyle = "rgba(0,0,0,.06)";
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  const garden = new GL3D.Mesh(
    new GL3D.CircleGeometry(R_ISLAND - 0.05, 128),
    new GL3D.MeshStandardMaterial({ map: gardenTex, roughness: 1 }),
  );
  garden.rotation.x = -Math.PI / 2;
  garden.position.y = 0.45;
  garden.receiveShadow = true;
  island.add(garden);
  // pagar besi keliling taman
  const fenceTex = canvasTex(
    256,
    64,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#1f2a22";
      g.fillRect(0, 4, w, 4);
      g.fillRect(0, h - 10, w, 4);
      for (let x = 0; x < w; x += 10) g.fillRect(x, 0, 3, h);
    },
    { repeat: [90, 1] },
  );
  const fence = new GL3D.Mesh(
    new GL3D.CylinderGeometry(R_ISLAND - 0.4, R_ISLAND - 0.4, 1.0, 128, 1, true),
    new GL3D.MeshStandardMaterial({
      map: fenceTex,
      transparent: true,
      alphaTest: 0.5,
      side: GL3D.DoubleSide,
      roughness: 0.6,
      metalness: 0.3,
    }),
  );
  fence.position.y = 0.95;
  island.add(fence);
  // pagar tanaman rendah di bibir kolam
  const hedge = new GL3D.Mesh(
    new GL3D.TorusGeometry(9.7, 0.42, 8, 128),
    new GL3D.MeshStandardMaterial({ color: 0x3d6a2a, roughness: 1 }),
  );
  hedge.rotation.x = -Math.PI / 2;
  hedge.position.y = 0.6;
  hedge.castShadow = true;
  island.add(hedge);

  /* ================= AIR MANCUR: kolam datar, LED, partikel air, lampu warna ================= */
  const fountain = new GL3D.Group();
  fountain.position.y = 0.45;
  island.add(fountain);
  const stoneMat = new GL3D.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6 });
  // kolam datar tanpa tiang di tengah
  const basinWall = new GL3D.Mesh(new GL3D.CylinderGeometry(9.1, 9.1, 0.5, 128, 1, true), stoneMat);
  basinWall.position.y = 0.2;
  fountain.add(basinWall);
  const rim = new GL3D.Mesh(new GL3D.TorusGeometry(9.1, 0.16, 8, 128), stoneMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.45;
  fountain.add(rim);
  const waterMat = new GL3D.MeshStandardMaterial({
    color: 0x5aa7b4,
    roughness: 0.06,
    metalness: 0.25,
    emissive: 0x000000,
    transparent: true,
    opacity: 0.95,
  });
  const water = new GL3D.Mesh(new GL3D.CircleGeometry(9.05, 128), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  water.receiveShadow = true;
  fountain.add(water);
  // cincin tanaman hijau di dalam kolam
  const innerRing = new GL3D.Mesh(
    new GL3D.TorusGeometry(5.9, 0.5, 8, 96),
    new GL3D.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 1 }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.38;
  innerRing.scale.z = 0.7;
  fountain.add(innerRing);
  // lampu LED: cincin di bibir kolam + deretan di sepanjang lengan pancuran
  const ARM_A = [0.35, 0.35 + Math.PI / 2, 0.35 + Math.PI, 0.35 + Math.PI * 1.5];
  const ledPos = [];
  for (let i = 0; i < 64; i++) ledPos.push(P(8.75, (i / 64) * TAU, 0.42));
  for (const a of ARM_A) for (let j = 0; j < 7; j++) ledPos.push(P(1.2 + j * 0.62, a, 0.34));
  const leds = new GL3D.InstancedMesh(
    new GL3D.SphereGeometry(0.11, 8, 6),
    new GL3D.MeshBasicMaterial({ color: 0x666666 }),
    ledPos.length,
  );
  const _m = new GL3D.Matrix4();
  ledPos.forEach((v, i) => {
    _m.makeTranslation(v.x, v.y, v.z);
    leds.setMatrixAt(i, _m);
    leds.setColorAt(i, new GL3D.Color(1, 1, 1));
  });
  fountain.add(leds);

  // pancuran air sebagai partikel; gerak parabola dihitung di GPU (vertex shader)
  const jets = []; // [ox,oy,oz, vx,vy,vz, life, phase, hue]
  const addJet = (o, v, count, life, spread, hue) => {
    for (let i = 0; i < count; i++) {
      jets.push(
        o.x,
        o.y,
        o.z,
        v.x + rnd(-spread, spread),
        v.y + rnd(-spread, spread) * 0.6,
        v.z + rnd(-spread, spread),
        life * rnd(0.85, 1.05),
        Math.random(),
        hue,
      );
    }
  };
  for (let i = 0; i < 7; i++) {
    const o = i ? P(0.7, (i / 6) * TAU, 0.3) : new GL3D.Vector3(0, 0.3, 0);
    addJet(o, new GL3D.Vector3(0, i ? 10.5 : 13, 0), i ? 200 : 420, i ? 2.1 : 2.6, 0.35, 0.6);
  } // kumpulan pancuran tengah
  ARM_A.forEach((a, ai) => {
    for (let j = 0; j < 7; j++) {
      const r = 1.2 + j * 0.62;
      addJet(
        P(r, a, 0.3),
        new GL3D.Vector3(0, 9.2 - j * 0.75, 0),
        85,
        1.8 - j * 0.1,
        0.16,
        [0.0, 0.6, 0.33, 0.95][ai],
      );
    }
  }); // 4 lengan pancuran
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    addJet(P(7.5, a, 0.3), new GL3D.Vector3(0, 6.2, 0), 95, 1.3, 0.18, i / 12);
  } // cincin pancuran luar
  const JN = jets.length / 9;
  const jg = new GL3D.BufferGeometry();
  const jo = new Float32Array(JN * 3),
    jv = new Float32Array(JN * 3),
    jl = new Float32Array(JN),
    jp = new Float32Array(JN),
    jh = new Float32Array(JN);
  for (let i = 0; i < JN; i++) {
    const b = i * 9;
    jo.set([jets[b], jets[b + 1], jets[b + 2]], i * 3);
    jv.set([jets[b + 3], jets[b + 4], jets[b + 5]], i * 3);
    jl[i] = jets[b + 6];
    jp[i] = jets[b + 7];
    jh[i] = jets[b + 8];
  }
  jg.setAttribute("position", new GL3D.BufferAttribute(jo, 3));
  jg.setAttribute("aVel", new GL3D.BufferAttribute(jv, 3));
  jg.setAttribute("aLife", new GL3D.BufferAttribute(jl, 1));
  jg.setAttribute("aPhase", new GL3D.BufferAttribute(jp, 1));
  jg.setAttribute("aHue", new GL3D.BufferAttribute(jh, 1));
  const waterUni = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uPix: { value: renderer.getPixelRatio() },
    uOn: { value: 1 },
  };
  const jetMat = new GL3D.ShaderMaterial({
    uniforms: waterUni,
    transparent: true,
    depthWrite: false,
    blending: GL3D.AdditiveBlending,
    vertexShader: `uniform float uTime,uPix,uNight,uOn; attribute vec3 aVel; attribute float aLife,aPhase,aHue; varying vec3 vC; varying float vA;
  vec3 hsv(float h){ vec3 k=vec3(1.,2./3.,1./3.); vec3 p=abs(fract(vec3(h)+k)*6.-3.); return clamp(p-1.,0.,1.); }
  void main(){ float t=mod(uTime+aPhase*aLife,aLife); vec3 p=position+aVel*t+vec3(0.,-4.9*t*t,0.);
    float fall=t/aLife; vA=(1.-fall*fall)*uOn;
    float h=fract(aHue+uTime*0.07+ position.y*0.0 + floor(uTime/6.)*0.0); vec3 col=hsv(fract(h+ sin(uTime*.35)*.25 + p.y*0.025));
    vC=mix(vec3(.75,.88,1.), col*1.15, uNight);
    vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=uPix*(0.32*(1.+fall*1.4))*(300./-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uNight; varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-.5; float r=dot(d,d); if(r>.25) discard; float a=smoothstep(.25,0.,r)*vA*mix(.5,.32,uNight); gl_FragColor=vec4(vC*a,a); }`,
  });
  const jetPoints = new GL3D.Points(jg, jetMat);
  jetPoints.frustumCulled = false;
  fountain.add(jetPoints);
  // lampu warna-warni air mancur (lebih terang saat malam)
  const fLights = [];
  for (let i = 0; i < 4; i++) {
    const l = new GL3D.PointLight(0xffffff, 0, 34, 1.6);
    l.position.copy(P(5, (i / 4) * TAU, 6));
    fountain.add(l);
    fLights.push(l);
  }

  /* ================= HURUF 3D "INSTITUT TEKNOLOGI SEPULUH NOPEMBER" ================= */
  const TEXT = "INSTITUT TEKNOLOGI SEPULUH NOPEMBER";
  const LET_H = 4.6,
    LET_R = 44,
    LET_DEPTH = 0.8,
    LAYERS = 10;
  const mctx = document.createElement("canvas").getContext("2d");
  mctx.font = '700 200px Oswald, "Arial Narrow", Impact, sans-serif';
  const texCache = {};
  // menyusun huruf 3D melengkung; outward=true -> huruf menghadap ke luar bundaran.
  // Ketebalan huruf dibuat dari beberapa lapis bidang bertekstur huruf yang ditumpuk.
  function buildArcText({
    radius,
    center,
    height,
    y0,
    outward,
    color,
    sideColor,
    emissive,
    nightI,
    depth,
    gap,
    spaceW,
    layers = LAYERS,
  }) {
    const group = new GL3D.Group();
    scene.add(group);
    const info = [...TEXT].map((ch) => ({
      ch,
      w: ch === " " ? spaceW : (mctx.measureText(ch).width / 200) * height + gap,
    }));
    const tw = info.reduce((s, l) => s + l.w, 0),
      sp = tw / radius;
    const dir = outward ? -1 : 1; // arah baca: ke dalam = sudut naik, ke luar = sudut turun
    const a0 = center - (dir * sp) / 2;
    const front = new Map(),
      side = new Map();
    let acc = 0;
    for (const L of info) {
      const aMid = a0 + (dir * (acc + L.w / 2)) / radius;
      acc += L.w;
      if (L.ch === " ") continue;
      let tex = texCache[L.ch];
      if (!tex) {
        tex = texCache[L.ch] = canvasTex(256, 256, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.fillStyle = "#fff";
          g.font = '700 230px Oswald, "Arial Narrow", Impact, sans-serif';
          g.textAlign = "center";
          g.textBaseline = "alphabetic";
          g.fillText(L.ch, w / 2, 232);
        });
      }
      if (!front.has(L.ch)) {
        const f = new GL3D.MeshStandardMaterial({
          map: tex,
          alphaTest: 0.5,
          color,
          roughness: 0.35,
          emissive,
          emissiveMap: tex,
          emissiveIntensity: 0,
          side: GL3D.DoubleSide,
        });
        const sd = new GL3D.MeshStandardMaterial({
          map: tex,
          alphaTest: 0.5,
          color: sideColor,
          roughness: 0.5,
          emissive,
          emissiveMap: tex,
          emissiveIntensity: 0,
          side: GL3D.DoubleSide,
        });
        nightEmissive(f, 0, nightI);
        nightEmissive(sd, 0, nightI * 0.33);
        front.set(L.ch, f);
        side.set(L.ch, sd);
      }
      const grp = new GL3D.Group();
      const geo = new GL3D.PlaneGeometry(height, height);
      for (let k = 0; k < layers; k++) {
        const m = new GL3D.Mesh(
          geo,
          k === 0 || k === layers - 1 ? front.get(L.ch) : side.get(L.ch),
        );
        m.position.z = (-k * depth) / (layers - 1);
        m.castShadow = true;
        grp.add(m);
      }
      grp.position.copy(P(radius, aMid, y0 + height / 2 - 0.05));
      grp.rotation.y = outward
        ? Math.atan2(Math.cos(aMid), Math.sin(aMid))
        : Math.atan2(-Math.cos(aMid), -Math.sin(aMid));
      group.add(grp);
    }
    return { start: Math.min(a0, a0 + dir * sp), span: sp };
  }
  const groundText = buildArcText({
    radius: LET_R,
    center: LET_CENTER,
    height: LET_H,
    y0: 0.1,
    outward: false,
    color: 0xffffff,
    sideColor: 0xc9ccd2,
    emissive: 0xdfe8ff,
    nightI: 1.05,
    depth: LET_DEPTH,
    gap: 0.38,
    spaceW: 1.8,
  });
  const startA = groundText.start,
    span = groundText.span;
  // alas rendah di bawah huruf + strip lampu sorot
  const plinthShape = (r0, r1, a0, a1) => {
    const s = new GL3D.Shape();
    s.absarc(0, 0, r1, -a0, -a1, true);
    s.absarc(0, 0, r0, -a1, -a0, false);
    return s;
  };
  const plinth = new GL3D.Mesh(
    new GL3D.ExtrudeGeometry(
      plinthShape(LET_R - 0.9, LET_R + 0.9, startA - 0.03, startA + span + 0.03),
      { depth: 0.25, bevelEnabled: false, curveSegments: 96 },
    ),
    new GL3D.MeshStandardMaterial({ color: 0x585c63, roughness: 0.8 }),
  );
  plinth.rotation.x = -Math.PI / 2;
  plinth.position.y = 0.02;
  plinth.receiveShadow = true;
  scene.add(plinth);
  const upMat = new GL3D.MeshBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0 });
  const upl = new GL3D.Mesh(
    new GL3D.ExtrudeGeometry(plinthShape(LET_R - 0.75, LET_R - 0.6, startA, startA + span), {
      depth: 0.05,
      bevelEnabled: false,
      curveSegments: 96,
    }),
    upMat,
  );
  upl.rotation.x = -Math.PI / 2;
  upl.position.y = 0.28;
  scene.add(upl);
  glowMeshes.push({ mat: upMat, max: 0.9 });
  const letterLight = new GL3D.PointLight(0xcfe0ff, 0, 60, 1.4);
  letterLight.position.copy(P(30, LET_CENTER, 6));
  scene.add(letterLight);

  /* ================= GEOMETRI RODA GIGI (pola gerigi) ================= */
  function gearShape(rOut, rIn, teeth, hole) {
    const s = new GL3D.Shape();
    const step = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const pts = [
        [rIn, a],
        [rOut, a + step * 0.18],
        [rOut, a + step * 0.5],
        [rIn, a + step * 0.68],
      ];
      pts.forEach(([r, an], j) => {
        const x = Math.cos(an) * r,
          y = Math.sin(an) * r;
        i === 0 && j === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
      });
    }
    s.closePath();
    if (hole) {
      const h = new GL3D.Path();
      h.absarc(0, 0, hole, 0, TAU, true);
      s.holes.push(h);
    }
    return s;
  }
  const gearMat = new GL3D.MeshStandardMaterial({
    color: 0xe7e8ea,
    roughness: 0.45,
    metalness: 0.15,
  });
  // cincin roda gigi (gigi + lubang besar) yang dibengkokkan mengikuti permukaan silinder jari-jari R
  function reliefGear(r, R) {
    const geo = new GL3D.ExtrudeGeometry(gearShape(r, r * 0.8, 10, r * 0.62), {
      depth: 0.09,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 1,
      curveSegments: 16,
    });
    geo.rotateZ(Math.random() * TAU);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i),
        rad = R - 0.02 + z,
        th = x / R;
      p.setXYZ(i, Math.sin(th) * rad, p.getY(i), Math.cos(th) * rad);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* ================= GATE: tiang bergerigi + atap melengkung ================= */
  const pillarMat = new GL3D.MeshStandardMaterial({ color: 0xe2e3e6, roughness: 0.55 });
  const P_R = 45.5,
    P_A0 = 1.85,
    P_A1 = 4.6,
    P_N = 11,
    P_H = 10;
  const pillarAngles = [];
  for (let i = 0; i < P_N; i++) {
    let a = P_A0 + ((P_A1 - P_A0) * i) / (P_N - 1);
    for (const r of ROAD_ANGLES) {
      const d = Math.atan2(Math.sin(a - r), Math.cos(a - r));
      if (Math.abs(d) < 0.25) a = r + (d < 0 ? -0.25 : 0.25);
    }
    pillarAngles.push(a);
  }
  for (const a of pillarAngles) {
    const pil = new GL3D.Group();
    pil.position.copy(P(P_R, a, 0));
    scene.add(pil);
    const body = new GL3D.Mesh(new GL3D.CylinderGeometry(1.25, 0.95, P_H, 40), pillarMat);
    body.position.y = P_H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    pil.add(body);
    // relief roda gigi menempel di badan tiang (seperti foto referensi)
    for (let k = 0; k < 9; k++) {
      const y = 1.0 + k * 0.98 + rnd(-0.15, 0.15),
        ang = k * 2.35 + a * 7 + rnd(-0.3, 0.3);
      const rr = 0.95 + (1.25 - 0.95) * (y / P_H);
      const g = new GL3D.Mesh(reliefGear(rnd(0.32, 0.55), rr), pillarMat);
      g.position.y = y;
      g.rotation.y = ang;
      g.castShadow = true;
      pil.add(g);
    }
  }
  const canopyShape = plinthShape(P_R - 2.4, P_R + 2.6, P_A0 - 0.1, P_A1 + 0.1);
  const canopy = new GL3D.Mesh(
    new GL3D.ExtrudeGeometry(canopyShape, { depth: 0.6, bevelEnabled: false, curveSegments: 80 }),
    new GL3D.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.7 }),
  );
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.y = P_H;
  canopy.castShadow = true;
  scene.add(canopy);
  const trimMat = new GL3D.MeshStandardMaterial({
    color: 0xc06a2a,
    roughness: 0.6,
    emissive: 0xff8a3c,
    emissiveIntensity: 0,
  });
  nightEmissive(trimMat, 0, 1.2);
  const trim = new GL3D.Mesh(
    new GL3D.ExtrudeGeometry(plinthShape(P_R - 2.45, P_R - 2.25, P_A0 - 0.1, P_A1 + 0.1), {
      depth: 0.25,
      bevelEnabled: false,
      curveSegments: 80,
    }),
    trimMat,
  );
  trim.rotation.x = -Math.PI / 2;
  trim.position.y = P_H - 0.2;
  scene.add(trim);
  // tulisan di atas atap gate, menghadap keluar
  buildArcText({
    radius: P_R + 1.4,
    center: (P_A0 + P_A1) / 2,
    height: 3.4,
    y0: P_H + 0.6,
    outward: true,
    color: 0x2a3150,
    sideColor: 0x1c2238,
    emissive: 0xe6eeff,
    nightI: 0.9,
    depth: 0.35,
    gap: 0.3,
    spaceW: 1.4,
    layers: 6,
  });
  // rel penopang tulisan
  const rail = new GL3D.Mesh(
    new GL3D.ExtrudeGeometry(plinthShape(P_R + 1.15, P_R + 1.65, P_A0 - 0.05, P_A1 + 0.05), {
      depth: 0.12,
      bevelEnabled: false,
      curveSegments: 80,
    }),
    new GL3D.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.5, roughness: 0.4 }),
  );
  rail.rotation.x = -Math.PI / 2;
  rail.position.y = P_H + 0.6;
  scene.add(rail);
  // cahaya lembut di bawah atap
  for (let i = 0; i < P_N - 1; i++) {
    const a = P_A0 + ((P_A1 - P_A0) * (i + 0.5)) / (P_N - 1);
    addGroundGlow(P(P_R, a, 0), 5, 0xffb877, 0.6);
  }

  /* ================= GERBANG ITS: menara kisi-kisi + monumen lambang ================= */
  const latticeTex = canvasTex(
    512,
    512,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "#eef0f3";
      g.lineCap = "round";
      g.lineWidth = 12;
      for (let i = -8; i < 16; i++) {
        g.beginPath();
        g.moveTo(i * 64, 0);
        g.lineTo(i * 64 + h, h);
        g.stroke();
        g.beginPath();
        g.moveTo(i * 64, h);
        g.lineTo(i * 64 + h, 0);
        g.stroke();
      }
      g.lineWidth = 20;
      for (let x = 0; x <= w; x += 128) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      g.lineWidth = 18;
      g.beginPath();
      g.moveTo(0, 10);
      g.lineTo(w, 10);
      g.stroke();
      g.beginPath();
      g.moveTo(0, h - 10);
      g.lineTo(w, h - 10);
      g.stroke();
    },
    { repeat: [2, 3] },
  );
  const latticeMat = new GL3D.MeshStandardMaterial({
    map: latticeTex,
    alphaTest: 0.45,
    side: GL3D.DoubleSide,
    roughness: 0.4,
    metalness: 0.4,
  });
  const baseMat = new GL3D.MeshStandardMaterial({ color: 0x6b6e74, roughness: 0.8 });
  function tower(pos, h, r) {
    const g = new GL3D.Group();
    g.position.copy(pos);
    const base = new GL3D.Mesh(new GL3D.CylinderGeometry(r * 0.75, r * 0.85, 3, 24), baseMat);
    base.position.y = 1.5;
    base.castShadow = true;
    g.add(base);
    const deck = new GL3D.Mesh(new GL3D.CylinderGeometry(r * 1.35, r * 1.35, 0.45, 32), stoneMat);
    deck.position.y = 3.2;
    deck.castShadow = true;
    g.add(deck);
    const deckGear = new GL3D.Mesh(
      new GL3D.ExtrudeGeometry(gearShape(r * 1.55, r * 1.38, 22, r * 1.1), {
        depth: 0.25,
        bevelEnabled: false,
      }),
      new GL3D.MeshStandardMaterial({ color: 0x4a7bb0, roughness: 0.5 }),
    );
    deckGear.rotation.x = -Math.PI / 2;
    deckGear.position.y = 3.0;
    g.add(deckGear);
    const lat = new GL3D.Mesh(new GL3D.CylinderGeometry(r, r * 0.9, h, 24, 1, true), latticeMat);
    lat.position.y = 3.4 + h / 2;
    lat.castShadow = true;
    g.add(lat);
    const ring = new GL3D.Mesh(new GL3D.TorusGeometry(r, 0.12, 6, 32), stoneMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.4 + h;
    g.add(ring);
    scene.add(g);
  }
  // jalan gerbang berada di arah +z (sudut pi/2)
  const gateR = 60;
  [[-1], [1]].forEach(([s]) => {
    tower(new GL3D.Vector3(s * (ROAD_W / 2 + 4), 0, gateR - 2), 13, 1.9);
    tower(new GL3D.Vector3(s * (ROAD_W / 2 + 7.5), 0, gateR + 1.5), 10, 1.7);
    tower(new GL3D.Vector3(s * (ROAD_W / 2 + 4.5), 0, gateR + 5.5), 11.5, 1.8);
  });
  // monumen lambang di tengah jalan
  const mon = new GL3D.Group();
  mon.position.set(0, 0, gateR);
  scene.add(mon);
  const darkStone = new GL3D.MeshStandardMaterial({ color: 0x26282c, roughness: 0.75 });
  const monBase = new GL3D.Mesh(new GL3D.CylinderGeometry(2.4, 2.4, 3.0, 40), darkStone);
  monBase.position.y = 1.5;
  monBase.castShadow = true;
  mon.add(monBase);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4; // jendela bulat
    const ring = new GL3D.Mesh(new GL3D.TorusGeometry(0.7, 0.12, 10, 32), stoneMat);
    ring.position.set(Math.cos(a) * 2.38, 1.4, Math.sin(a) * 2.38);
    ring.lookAt(Math.cos(a) * 9, 1.4, Math.sin(a) * 9);
    mon.add(ring);
    const glass = new GL3D.Mesh(
      new GL3D.CircleGeometry(0.66, 24),
      new GL3D.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.2, metalness: 0.3 }),
    );
    glass.position.set(Math.cos(a) * 2.36, 1.4, Math.sin(a) * 2.36);
    glass.lookAt(Math.cos(a) * 9, 1.4, Math.sin(a) * 9);
    mon.add(glass);
  }
  const monDeck = new GL3D.Mesh(new GL3D.CylinderGeometry(3.3, 3.1, 0.35, 48), stoneMat);
  monDeck.position.y = 3.15;
  monDeck.castShadow = true;
  mon.add(monDeck);
  const emblem = new GL3D.Group();
  emblem.position.y = 6.6;
  mon.add(emblem);
  const emblemGear = new GL3D.Mesh(
    new GL3D.ExtrudeGeometry(gearShape(2.1, 1.75, 16, 1.25), { depth: 0.35, bevelEnabled: false }),
    new GL3D.MeshStandardMaterial({ color: 0x2c62a8, roughness: 0.4, metalness: 0.3 }),
  );
  emblemGear.position.z = -0.17;
  emblemGear.castShadow = true;
  emblem.add(emblemGear);
  const goldMat = new GL3D.MeshStandardMaterial({
    color: 0xf0c040,
    roughness: 0.3,
    metalness: 0.6,
    emissive: 0xffc040,
    emissiveIntensity: 0,
  });
  nightEmissive(goldMat, 0, 0.9);
  const core = new GL3D.Mesh(new GL3D.SphereGeometry(0.9, 24, 16), goldMat);
  emblem.add(core);
  for (let i = 0; i < 3; i++) {
    const o = new GL3D.Mesh(new GL3D.TorusGeometry(3.0, 0.09, 8, 64), stoneMat);
    o.rotation.set(Math.PI / 2 + i * 0.6, i * 1.05, 0);
    emblem.add(o);
  }
  const stem = new GL3D.Mesh(new GL3D.CylinderGeometry(0.3, 0.4, 3.6, 12), stoneMat);
  stem.position.y = 4.5;
  mon.add(stem);

  /* ================= BENDERA ASEAN (kain berkibar) ================= */
  const flags = [];
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
  const FLAGS = {
    ASEAN: (g, w, h) => {
      g.fillStyle = "#0b3f9b";
      g.fillRect(0, 0, w, h);
      const cx = w / 2,
        cy = h / 2,
        R = h * 0.36;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.fillStyle = "#ffffff";
      g.fill();
      g.beginPath();
      g.arc(cx, cy, R * 0.9, 0, TAU);
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
          TAU,
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
      g.arc(w / 2, h / 2, h * 0.2, 0, TAU);
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
      g.arc(cx, cy, h * 0.2, 0, TAU);
      g.fillStyle = "#fc0";
      g.fill();
      g.beginPath();
      g.arc(cx + h * 0.06, cy, h * 0.17, 0, TAU);
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
      g.arc(h * 0.29, h / 2, h * 0.09, 0, TAU);
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
      g.arc(w * 0.2, h * 0.25, h * 0.17, 0, TAU);
      g.fillStyle = "#fff";
      g.fill();
      g.beginPath();
      g.arc(w * 0.25, h * 0.25, h * 0.16, 0, TAU);
      g.fillStyle = "#ef3340";
      g.fill();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 5;
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
  function flag(x, z, h, draw, face) {
    const pole = new GL3D.Mesh(
      new GL3D.CylinderGeometry(0.07, 0.09, h, 8),
      new GL3D.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.5, roughness: 0.3 }),
    );
    pole.position.set(x, h / 2, z);
    pole.castShadow = true;
    scene.add(pole);
    const knob = new GL3D.Mesh(new GL3D.SphereGeometry(0.13, 10, 8), goldMat);
    knob.position.set(x, h + 0.05, z);
    scene.add(knob);
    const tex = canvasTex(192, 128, draw);
    const geo = new GL3D.PlaneGeometry(2.4, 1.6, 14, 6);
    geo.translate(1.2, 0, 0);
    const m = new GL3D.Mesh(
      geo,
      new GL3D.MeshStandardMaterial({ map: tex, side: GL3D.DoubleSide, roughness: 0.8 }),
    );
    m.position.set(x, h - 0.9, z);
    m.rotation.y = face;
    m.castShadow = true;
    scene.add(m);
    flags.push({ m, base: geo.attributes.position.array.slice(), ph: Math.random() * 6 });
  }
  // pulau median di depan monumen: tanaman topiari + bendera di antaranya
  const halfW = (dz) =>
    dz > 0
      ? 4.3 * Math.sqrt(Math.max(0, 1 - (dz / 4.5) ** 2))
      : 1.1 + 3.2 * Math.pow((19 + dz) / 19, 0.75);
  const isl = new GL3D.Shape();
  {
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const dz = -19 + k * (23.5 / 40);
      pts.push([halfW(dz), dz]);
    }
    isl.moveTo(-pts[0][0], pts[0][1]);
    pts.forEach(([w, dz]) => isl.lineTo(-w, dz));
    [...pts].reverse().forEach(([w, dz]) => isl.lineTo(w, dz));
    isl.closePath();
  }
  const islMesh = new GL3D.Mesh(
    new GL3D.ExtrudeGeometry(isl, { depth: 0.3, bevelEnabled: false }),
    new GL3D.MeshStandardMaterial({ color: 0x5f8f3a, roughness: 1 }),
  );
  islMesh.rotation.x = Math.PI / 2;
  islMesh.position.set(0, 0.32, gateR);
  islMesh.receiveShadow = true;
  scene.add(islMesh); // sumbu y bentuk -> sumbu z dunia
  // kanstin kuning-hitam keliling pulau
  {
    const outline = isl.getSpacedPoints(110);
    const cb = new GL3D.InstancedMesh(
      new GL3D.BoxGeometry(0.62, 0.34, 0.3),
      new GL3D.MeshStandardMaterial({ roughness: 0.7 }),
      outline.length - 1,
    );
    for (let k = 0; k < outline.length - 1; k++) {
      const a = outline[k],
        b = outline[k + 1];
      const o = new GL3D.Object3D();
      o.position.set((a.x + b.x) / 2, 0.17, gateR + (a.y + b.y) / 2);
      o.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      o.updateMatrix();
      cb.setMatrixAt(k, o.matrix);
      cb.setColorAt(k, new GL3D.Color(k % 2 ? 0x1c1c1c : 0xf2c418));
    }
    scene.add(cb);
  }
  // topiari: blok tanaman kotak tumpul bertingkat
  const hedgeTex = canvasTex(
    128,
    128,
    (g, w, h) => {
      g.fillStyle = "#3f7a2a";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `hsla(${rnd(85, 110)},55%,${rnd(22, 42)}%,.8)`;
        g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
    },
    { repeat: [2, 2] },
  );
  const topiaryMat = new GL3D.MeshStandardMaterial({ map: hedgeTex, roughness: 1 });
  const hedgeGeo = new GL3D.RoundedBoxGeometry(1, 1, 1, 3, 0.28);
  const hedgeBlocks = [];
  for (let dz = -17.6; dz <= -1.2; dz += 1.55) {
    const w = halfW(dz) - 0.55,
      row = Math.round((dz + 17.6) / 1.55);
    const segs = Math.max(1, Math.round((2 * w) / 2.4)),
      sw = (2 * w) / segs;
    for (let k = 0; k < segs; k++) {
      const x = -w + sw * (k + 0.5);
      const hgt = ((k + row) % 2 ? 1.35 : 0.85) + rnd(-0.08, 0.08);
      hedgeBlocks.push([x, dz, sw * 1.02, hgt, 1.6, 0]);
    }
  }
  const topiary = new GL3D.InstancedMesh(hedgeGeo, topiaryMat, hedgeBlocks.length);
  hedgeBlocks.forEach(([x, dz, sx, sy, sz, ry], k) => {
    const o = new GL3D.Object3D();
    o.position.set(x, 0.3 + sy / 2, gateR + dz);
    o.scale.set(sx, sy, sz);
    o.rotation.y = ry;
    o.updateMatrix();
    topiary.setMatrixAt(k, o.matrix);
  });
  topiary.castShadow = true;
  topiary.receiveShadow = true;
  scene.add(topiary);
  // posisi bendera zig-zag; bendera ASEAN paling depan di tengah
  const flagSpots = [
    ["ASEAN", 0, -17.2, 10.5],
    ["Indonesia", -1.5, -14.6, 9.6],
    ["Singapura", 1.7, -13.6, 9.2],
    ["Malaysia", -2.4, -11.6, 8.6],
    ["Filipina", 2.6, -10.8, 9.4],
    ["Thailand", -1.0, -9.0, 9.0],
    ["Myanmar", 1.2, -7.6, 8.4],
    ["Vietnam", -3.3, -7.0, 8.0],
    ["Brunei", 3.4, -6.0, 9.2],
    ["Kamboja", -2.8, -3.6, 8.6],
    ["Laos", 3.0, -3.4, 8.2],
  ];
  flagSpots.forEach(([name, x, dz, h]) =>
    flag(x, gateR + dz, h, FLAG_DESIGNS[name], Math.PI + rnd(-0.35, 0.35)),
  );

  /* ================= LAMPU JALAN ================= */
  const lampPoleMat = new GL3D.MeshStandardMaterial({
    color: 0x9aa0a8,
    metalness: 0.6,
    roughness: 0.4,
  });
  const bulbMat = new GL3D.MeshStandardMaterial({
    color: 0xfff2d0,
    emissive: 0xffe2a8,
    emissiveIntensity: 0.1,
  });
  nightEmissive(bulbMat, 0.1, 6);
  function addGroundGlow(pos, size, color, max) {
    const tex =
      addGroundGlow.tex ||
      (addGroundGlow.tex = canvasTex(128, 128, (g, w, h) => {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.45, "rgba(255,255,255,.35)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }));
    const mat = new GL3D.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity: 0,
      blending: GL3D.AdditiveBlending,
      depthWrite: false,
    });
    const m = new GL3D.Mesh(new GL3D.PlaneGeometry(size * 2, size * 2), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.08, pos.z);
    scene.add(m);
    glowMeshes.push({ mat, max });
  }
  function lamp(a, r) {
    const base = P(r, a, 0);
    const inward = new GL3D.Vector3(-Math.cos(a), 0, -Math.sin(a));
    const pole = new GL3D.Mesh(new GL3D.CylinderGeometry(0.1, 0.16, 9, 8), lampPoleMat);
    pole.position.set(base.x, 4.5, base.z);
    pole.castShadow = true;
    scene.add(pole);
    const arm = new GL3D.Mesh(new GL3D.BoxGeometry(0.1, 0.1, 2.4), lampPoleMat);
    arm.position.set(base.x + inward.x * 1.1, 9, base.z + inward.z * 1.1);
    arm.lookAt(base.x + inward.x * 5, 9, base.z + inward.z * 5);
    scene.add(arm);
    const head = new GL3D.Mesh(new GL3D.BoxGeometry(0.5, 0.18, 0.9), bulbMat);
    head.position.set(base.x + inward.x * 2.2, 8.9, base.z + inward.z * 2.2);
    head.lookAt(base.x + inward.x * 5, 8.9, base.z + inward.z * 5);
    scene.add(head);
    addGroundGlow(
      new GL3D.Vector3(base.x + inward.x * 3, 0, base.z + inward.z * 3),
      7,
      0xffcf8a,
      0.55,
    );
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.11;
    if (ROAD_ANGLES.some((r) => Math.abs(Math.atan2(Math.sin(a - r), Math.cos(a - r))) < 0.36))
      continue;
    lamp(a, 38.6);
  }
  // beberapa lampu titik hangat untuk menerangi plaza saat malam
  const plazaLights = [];
  for (let i = 0; i < 4; i++) {
    const l = new GL3D.PointLight(0xffc98a, 0, 70, 1.5);
    l.position.copy(P(30, (i / 4) * TAU + 0.4, 9));
    scene.add(l);
    plazaLights.push(l);
  }

  /* ================= POHON & PALEM (sengaja sedikit) ================= */
  const trunkMat = new GL3D.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 });
  const leafMats = [0x3f6e2c, 0x4f7e33, 0x355f27].map(
    (c) => new GL3D.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }),
  );
  function tree(x, z, s = 1) {
    const g = new GL3D.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    const tr = new GL3D.Mesh(new GL3D.CylinderGeometry(0.25, 0.4, 4.5, 8), trunkMat);
    tr.position.y = 2.25;
    tr.castShadow = true;
    g.add(tr);
    for (let i = 0; i < 5; i++) {
      const f = new GL3D.Mesh(new GL3D.IcosahedronGeometry(rnd(1.6, 2.4), 1), leafMats[i % 3]);
      f.position.set(rnd(-1.4, 1.4), rnd(4.8, 6.6), rnd(-1.4, 1.4));
      f.scale.y = 0.75;
      f.castShadow = true;
      g.add(f);
    }
    scene.add(g);
  }
  function palm(x, z, s = 1) {
    const g = new GL3D.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    const tr = new GL3D.Mesh(new GL3D.CylinderGeometry(0.22, 0.32, 7, 8), trunkMat);
    tr.position.y = 3.5;
    tr.castShadow = true;
    g.add(tr);
    const leafGeo = new GL3D.PlaneGeometry(0.9, 4.2, 1, 4);
    leafGeo.translate(0, 2.1, 0);
    const p = leafGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setZ(i, -0.06 * y * y);
    }
    leafGeo.computeVertexNormals();
    const lm = new GL3D.MeshStandardMaterial({
      color: 0x4d7d2e,
      side: GL3D.DoubleSide,
      roughness: 0.9,
    });
    for (let i = 0; i < 9; i++) {
      const l = new GL3D.Mesh(leafGeo, lm);
      l.position.y = 7;
      l.rotation.set(0, (i / 9) * TAU, 0);
      l.rotateX(1.0);
      l.castShadow = true;
      g.add(l);
    }
    scene.add(g);
  }
  // pohon di pinggir taman supaya air mancur tetap terlihat
  [
    [0.6, 17.6],
    [1.9, 17.4],
    [3.2, 17.7],
    [4.4, 17.5],
    [5.5, 17.6],
  ].forEach(([a, r]) => {
    const p = P(r, a);
    tree(p.x, p.z, rnd(0.9, 1.1));
  });
  // pohon di luar bundaran
  [
    [0.9, 58],
    [0.35, 63],
    [3.5, 58],
    [4.05, 61],
    [-0.2, 58],
    [5.9, 62],
    [2.3, 66],
  ].forEach(([a, r]) => {
    const p = P(r, a);
    tree(p.x, p.z, rnd(1, 1.3));
  });
  palm(-ROAD_W / 2 - 1.5, gateR - 12, 1);
  palm(ROAD_W / 2 + 1.5, gateR - 12, 1);
  palm(-ROAD_W / 2 - 11, gateR + 2, 1.1);
  palm(ROAD_W / 2 + 11, gateR + 2, 1.1);

  /* ================= MOBIL: berputar searah jarum jam (lajur kiri) ================= */
  const carColors = [
    0xd9dde2, 0x1d1f24, 0xb4252b, 0x2a5fb0, 0x8a8f96, 0xf0f0f0, 0x3a6e4a, 0xe0a020, 0x5b2a86,
    0xc8c2b4,
  ];
  const headMat = new GL3D.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff3d0,
    emissiveIntensity: 0.2,
  });
  nightEmissive(headMat, 0.2, 8);
  const tailMat = new GL3D.MeshStandardMaterial({
    color: 0x880000,
    emissive: 0xff1a1a,
    emissiveIntensity: 0.2,
  });
  nightEmissive(tailMat, 0.2, 5);
  const glassMat = new GL3D.MeshStandardMaterial({
    color: 0x1a2633,
    roughness: 0.1,
    metalness: 0.6,
  });
  const wheelMat = new GL3D.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const cars = [];
  function makeCar(color, kind) {
    const g = new GL3D.Group();
    const body = new GL3D.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
    const L = kind === "van" ? 5.0 : 4.4,
      H = kind === "van" ? 1.5 : 0.85;
    const b = new GL3D.Mesh(new GL3D.BoxGeometry(1.9, H, L), body);
    b.position.y = 0.45 + H / 2;
    b.castShadow = true;
    g.add(b);
    const cab = new GL3D.Mesh(
      new GL3D.BoxGeometry(1.7, 0.75, kind === "van" ? 3.6 : 2.3),
      glassMat,
    );
    cab.position.set(0, 0.45 + H + 0.37, kind === "van" ? -0.4 : -0.25);
    cab.castShadow = true;
    g.add(cab);
    const roof = new GL3D.Mesh(new GL3D.BoxGeometry(1.72, 0.08, kind === "van" ? 3.5 : 2.1), body);
    roof.position.set(0, cab.position.y + 0.4, cab.position.z);
    g.add(roof);
    for (const sx of [-0.95, 0.95])
      for (const sz of [-L * 0.32, L * 0.32]) {
        const w = new GL3D.Mesh(new GL3D.CylinderGeometry(0.38, 0.38, 0.3, 14), wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx, 0.38, sz);
        g.add(w);
      }
    for (const sx of [-0.62, 0.62]) {
      const h = new GL3D.Mesh(new GL3D.BoxGeometry(0.42, 0.18, 0.06), headMat);
      h.position.set(sx, 0.75, L / 2 + 0.01);
      g.add(h);
      const t = new GL3D.Mesh(new GL3D.BoxGeometry(0.42, 0.16, 0.06), tailMat);
      t.position.set(sx, 0.8, -L / 2 - 0.01);
      g.add(t);
    }
    // sorot lampu depan di jalan (hanya malam)
    const beamMat = new GL3D.MeshBasicMaterial({
      map: addGroundGlow.tex,
      color: 0xfff0c8,
      transparent: true,
      opacity: 0,
      blending: GL3D.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new GL3D.Mesh(new GL3D.PlaneGeometry(3.6, 7), beamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 0.06, L / 2 + 3.2);
    g.add(beam);
    glowMeshes.push({ mat: beamMat, max: 0.45 });
    scene.add(g);
    return g;
  }
  const lanes = [
    { r: 23.7, v: 0.21, n: 6 },
    { r: 30.0, v: 0.17, n: 7 },
  ];
  let ci = 0;
  lanes.forEach((ln, li) => {
    for (let i = 0; i < ln.n; i++) {
      const car = makeCar(carColors[ci % carColors.length], ci % 5 === 3 ? "van" : "car");
      ci++;
      cars.push({
        obj: car,
        r: ln.r,
        a: (i / ln.n) * TAU + li * 0.3 + rnd(-0.12, 0.12),
        v: ln.v * rnd(0.92, 1.08),
      });
    }
  });

  /* ================= PERGANTIAN PAGI / MALAM ================= */
  const DAY = {
    top: new GL3D.Color(0x3d7fd1),
    bottom: new GL3D.Color(0xdfeefa),
    glow: new GL3D.Color(0xfff2d8),
    fog: new GL3D.Color(0xcfe0ef),
  };
  const NIGHT = {
    top: new GL3D.Color(0x01030a),
    bottom: new GL3D.Color(0x0a1426),
    glow: new GL3D.Color(0x182440),
    fog: new GL3D.Color(0x060b18),
  };
  let nightTarget = 0,
    night = 0;
  function applyNight(k) {
    skyUni.top.value.copy(DAY.top).lerp(NIGHT.top, k);
    skyUni.bottom.value.copy(DAY.bottom).lerp(NIGHT.bottom, k);
    skyUni.horizonGlow.value.copy(DAY.glow).lerp(NIGHT.glow, k);
    scene.fog.color.copy(DAY.fog).lerp(NIGHT.fog, k);
    sun.intensity = 2.6 * (1 - k);
    sun.castShadow = k < 0.6;
    moonLight.intensity = 0.35 * k;
    hemi.intensity = GL3D.MathUtils.lerp(1.1, 0.1, k);
    hemi.color.setHex(k > 0.5 ? 0x6c86c0 : 0xcfe6ff);
    stars.material.opacity = k;
    moon.material.opacity = k;
    clouds.children.forEach((c) => (c.material.opacity = 0.9 * (1 - k)));
    nightables.forEach((n) => (n.mat.emissiveIntensity = GL3D.MathUtils.lerp(n.dayI, n.nightI, k)));
    glowMeshes.forEach((g) => (g.mat.opacity = g.max * k));
    plazaLights.forEach((l) => (l.intensity = 55 * k));
    letterLight.intensity = 90 * k;
    waterUni.uNight.value = k;
    bloom.strength = GL3D.MathUtils.lerp(0.15, 0.7, k);
    bloom.threshold = GL3D.MathUtils.lerp(0.95, 0.68, k);
    renderer.toneMappingExposure = GL3D.MathUtils.lerp(1.0, 1.1, k);
  }
  applyNight(0);

  /* ================= ANIMASI PER FRAME ================= */
  let fountainOn = 1;
  const hsl = new GL3D.Color();
  // sudut kamera drone: dari sisi atap gate (tulisan melengkung di depan), tinggi, sehingga air mancur & seluruh bundaran terlihat
  const PHOTO_VIEW = { pos: new GL3D.Vector3(-60, 73, -27), target: new GL3D.Vector3(0, 0, 0) };

  /**
   * update(dt, t) dipanggil setiap frame oleh main.js.
   * dt = selisih waktu (detik) sejak frame sebelumnya, t = total waktu berjalan.
   */
  function update(dt, t) {
    // transisi halus pagi <-> malam
    night += (nightTarget - night) * Math.min(1, dt * 2.2);
    applyNight(night);
    // waktu & status air mancur untuk shader partikel
    waterUni.uTime.value = t;
    waterUni.uOn.value += (fountainOn - waterUni.uOn.value) * Math.min(1, dt * 2);
    // warna lampu air mancur berputar mengikuti waktu
    for (let i = 0; i < fLights.length; i++) {
      hsl.setHSL((t * 0.07 + i / 4) % 1, 1, 0.55);
      fLights[i].color.copy(hsl);
      fLights[i].intensity = (2 + night * 22) * waterUni.uOn.value;
    }
    leds.material.color.setScalar(0.35 + night * 1.8);
    for (let i = 0; i < ledPos.length; i++) {
      hsl.setHSL(
        i < 64 ? (i / 64 + t * 0.12) % 1 : (Math.floor((i - 64) / 7) / 4 + t * 0.07) % 1,
        1,
        0.55,
      );
      leds.setColorAt(i, hsl);
    }
    leds.instanceColor.needsUpdate = true;
    hsl.setHSL((t * 0.07) % 1, 0.9, 0.45);
    waterMat.emissive.copy(hsl).multiplyScalar(night * 0.18 * waterUni.uOn.value);
    // mobil bergerak di lintasan lingkaran dan menghadap arah gerak
    for (const c of cars) {
      c.a += c.v * dt * (28 / c.r);
      const p = P(c.r, c.a, 0);
      const n = P(c.r, c.a + 0.05, 0);
      c.obj.position.copy(p);
      c.obj.lookAt(n);
    }
    // kain bendera berkibar: titik digeser sinusoidal, makin jauh dari tiang makin besar
    for (const f of flags) {
      const pa = f.m.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = f.base[i * 3];
        pa.setZ(i, (Math.sin(x * 2.2 - t * 5 + f.ph) * 0.18 * x) / 2.6);
      }
      pa.needsUpdate = true;
    }
    // lambang monumen bergoyang pelan
    emblem.rotation.y = Math.sin(t * 0.3) * 0.25;
    controls.update();
    renderer.render(scene, camera);
  }

  /* ================= API yang dipakai main.js ================= */
  return {
    camera,
    controls,
    renderer,
    update,
    /** 0 = pagi, 1 = malam */
    setNight(n) {
      nightTarget = n;
    },
    isNight() {
      return nightTarget === 1;
    },
    /** nyalakan / jeda putaran kamera otomatis, mengembalikan status baru */
    toggleOrbit() {
      controls.autoRotate = !controls.autoRotate;
      return controls.autoRotate;
    },
    /** nyalakan / matikan air mancur, mengembalikan status baru */
    toggleFountain() {
      fountainOn = fountainOn ? 0 : 1;
      return !!fountainOn;
    },
    /** kembali ke posisi kamera awal */
    resetCamera() {
      camera.position.copy(HOME);
      controls.target.set(0, 3, 0);
    },
    /** kamera dari sudut yang mirip foto drone asli */
    photoView() {
      camera.position.copy(PHOTO_VIEW.pos);
      controls.target.copy(PHOTO_VIEW.target);
      controls.autoRotate = false;
    },
    /** sesuaikan ukuran kanvas saat wadahnya berubah ukuran */
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    setReducedMotion(on) {
      controls.autoRotateSpeed = on ? 0.2 : 0.55;
    },
  };
}
