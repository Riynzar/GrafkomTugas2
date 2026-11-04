/*
 * engine.js — GL3D
 * ---------------------------------------------------------------------
 * Mesin 3D kecil buatan sendiri di atas WebGL2 murni (tanpa library).
 * Isi:
 *   1. Matematika   : Vector2/3, Color, Quaternion, Euler, Matrix4
 *   2. Scene graph  : Object3D, Group, Mesh, Points, Sprite, InstancedMesh, kamera, lampu
 *   3. Geometri     : plane, circle, box, cylinder, sphere, torus, icosahedron,
 *                     rounded box, dan extrude dari bentuk 2D (Shape/Path)
 *   4. Material     : standard (PBR sederhana), basic, sprite, points, shader
 *   5. Renderer     : shadow map, MSAA, bloom, tone mapping ACES, sRGB
 *   6. OrbitControls: kamera orbit 360 derajat dengan mouse/sentuh
 * Semua kelas diekspos lewat objek global GL3D (mis. new GL3D.Mesh(...)).
 */
const GL3D = (() => {
  const TAU = Math.PI * 2;
  const FrontSide = 0,
    BackSide = 1,
    DoubleSide = 2;
  const NormalBlending = 1,
    AdditiveBlending = 2;
  const RepeatWrapping = 1000,
    ClampToEdgeWrapping = 1001;
  const SRGBColorSpace = "srgb",
    ACESFilmicToneMapping = 4,
    PCFSoftShadowMap = 2;

  /* ---------------- math ---------------- */
  /** Vektor 2D (x, y) – dipakai untuk titik bentuk 2D dan ukuran tekstur. */
  class Vector2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }
    clone() {
      return new Vector2(this.x, this.y);
    }
    equals(v) {
      return Math.abs(v.x - this.x) < 1e-10 && Math.abs(v.y - this.y) < 1e-10;
    }
  }
  /** Vektor 3D (x, y, z) – posisi, arah, dan skala objek. */
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    setScalar(s) {
      this.x = this.y = this.z = s;
      return this;
    }
    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    add(v) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    sub(v) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }
    subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    }
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    length() {
      return Math.hypot(this.x, this.y, this.z);
    }
    normalize() {
      const l = this.length() || 1;
      return this.multiplyScalar(1 / l);
    }
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    crossVectors(a, b) {
      const x = a.y * b.z - a.z * b.y,
        y = a.z * b.x - a.x * b.z,
        z = a.x * b.y - a.y * b.x;
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    randomDirection() {
      const u = (Math.random() - 0.5) * 2,
        t = Math.random() * TAU,
        f = Math.sqrt(1 - u * u);
      this.x = f * Math.cos(t);
      this.y = u;
      this.z = f * Math.sin(t);
      return this;
    }
    setFromMatrixPosition(m) {
      const e = m.elements;
      this.x = e[12];
      this.y = e[13];
      this.z = e[14];
      return this;
    }
  }
  /** Konversi satu kanal warna sRGB (0..1) ke ruang linear (perhitungan cahaya harus linear). */
  const s2l = (c) =>
    c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
    return p;
  }
  // warna disimpan dalam ruang linear (hex dianggap sRGB, seperti standar web)
  /** Warna RGB dalam ruang linear. setHex/setHSL menerima nilai sRGB seperti CSS lalu mengubahnya ke linear. */
  class Color {
    constructor(r, g, b) {
      this.r = 1;
      this.g = 1;
      this.b = 1;
      if (r !== undefined && g === undefined) {
        if (r instanceof Color) this.copy(r);
        else this.setHex(r);
      } else if (r !== undefined) {
        this.r = r;
        this.g = g;
        this.b = b;
      }
    }
    set(v) {
      return v instanceof Color ? this.copy(v) : this.setHex(v);
    }
    setHex(h) {
      h = Math.floor(h);
      this.r = s2l(((h >> 16) & 255) / 255);
      this.g = s2l(((h >> 8) & 255) / 255);
      this.b = s2l((h & 255) / 255);
      return this;
    }
    setHSL(h, s, l) {
      h = ((h % 1) + 1) % 1;
      s = Math.min(1, Math.max(0, s));
      l = Math.min(1, Math.max(0, l));
      if (s === 0) {
        this.r = this.g = this.b = l;
      } else {
        const p = l <= 0.5 ? l * (1 + s) : l + s - l * s,
          q = 2 * l - p;
        this.r = hue2rgb(q, p, h + 1 / 3);
        this.g = hue2rgb(q, p, h);
        this.b = hue2rgb(q, p, h - 1 / 3);
      }
      this.r = s2l(this.r);
      this.g = s2l(this.g);
      this.b = s2l(this.b);
      return this;
    }
    copy(c) {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
      return this;
    }
    clone() {
      return new Color(this.r, this.g, this.b);
    }
    lerp(c, a) {
      this.r += (c.r - this.r) * a;
      this.g += (c.g - this.g) * a;
      this.b += (c.b - this.b) * a;
      return this;
    }
    multiplyScalar(s) {
      this.r *= s;
      this.g *= s;
      this.b *= s;
      return this;
    }
    setScalar(s) {
      this.r = this.g = this.b = s;
      return this;
    }
  }
  /** Quaternion – representasi rotasi tanpa gimbal lock, dipakai untuk menggabungkan rotasi. */
  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    setFromEuler(e) {
      const c1 = Math.cos(e.x / 2),
        c2 = Math.cos(e.y / 2),
        c3 = Math.cos(e.z / 2),
        s1 = Math.sin(e.x / 2),
        s2 = Math.sin(e.y / 2),
        s3 = Math.sin(e.z / 2);
      this.x = s1 * c2 * c3 + c1 * s2 * s3;
      this.y = c1 * s2 * c3 - s1 * c2 * s3;
      this.z = c1 * c2 * s3 + s1 * s2 * c3;
      this.w = c1 * c2 * c3 - s1 * s2 * s3;
      return this;
    }
    setFromAxisAngle(a, ang) {
      const s = Math.sin(ang / 2);
      this.x = a.x * s;
      this.y = a.y * s;
      this.z = a.z * s;
      this.w = Math.cos(ang / 2);
      return this;
    }
    multiplyQuaternions(a, b) {
      const x = a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
        y = a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
        z = a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
        w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      return this;
    }
  }
  /** Sudut Euler (urutan XYZ, radian) – cara mudah menulis rotasi objek. */
  class Euler {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    setFromRotationMatrix(m) {
      const e = m.elements,
        m11 = e[0],
        m12 = e[4],
        m13 = e[8],
        m22 = e[5],
        m23 = e[9],
        m32 = e[6],
        m33 = e[10];
      this.y = Math.asin(Math.max(-1, Math.min(1, m13)));
      if (Math.abs(m13) < 0.9999999) {
        this.x = Math.atan2(-m23, m33);
        this.z = Math.atan2(-m12, m11);
      } else {
        this.x = Math.atan2(m32, m22);
        this.z = 0;
      }
      return this;
    }
  }
  /**
   * Matriks 4x4 (column-major, sama seperti WebGL).
   * Dipakai untuk transformasi model, view (kamera), proyeksi, dan bayangan.
   */
  class Matrix4 {
    constructor() {
      this.elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    identity() {
      this.elements.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      return this;
    }
    copy(m) {
      this.elements.set(m.elements);
      return this;
    }
    makeTranslation(x, y, z) {
      this.identity();
      const e = this.elements;
      e[12] = x;
      e[13] = y;
      e[14] = z;
      return this;
    }
    multiplyMatrices(a, b) {
      const ae = a.elements,
        be = b.elements,
        te = this.elements,
        r = new Float32Array(16);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += ae[k * 4 + i] * be[j * 4 + k];
          r[j * 4 + i] = s;
        }
      te.set(r);
      return this;
    }
    compose(p, q, s) {
      const te = this.elements,
        x = q.x,
        y = q.y,
        z = q.z,
        w = q.w,
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,
        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;
      te[0] = (1 - (yy + zz)) * s.x;
      te[1] = (xy + wz) * s.x;
      te[2] = (xz - wy) * s.x;
      te[3] = 0;
      te[4] = (xy - wz) * s.y;
      te[5] = (1 - (xx + zz)) * s.y;
      te[6] = (yz + wx) * s.y;
      te[7] = 0;
      te[8] = (xz + wy) * s.z;
      te[9] = (yz - wx) * s.z;
      te[10] = (1 - (xx + yy)) * s.z;
      te[11] = 0;
      te[12] = p.x;
      te[13] = p.y;
      te[14] = p.z;
      te[15] = 1;
      return this;
    }
    makeRotationFromQuaternion(q) {
      return this.compose(new Vector3(), q, new Vector3(1, 1, 1));
    }
    // basis dengan sumbu z menghadap (eye - target)
    lookAt(eye, target, up) {
      const z = new Vector3().subVectors(eye, target);
      if (z.length() === 0) z.z = 1;
      z.normalize();
      const x = new Vector3().crossVectors(up, z);
      if (x.length() === 0) {
        z.z += 1e-4;
        z.normalize();
        x.crossVectors(up, z);
      }
      x.normalize();
      const y = new Vector3().crossVectors(z, x);
      const te = this.elements;
      te[0] = x.x;
      te[4] = y.x;
      te[8] = z.x;
      te[1] = x.y;
      te[5] = y.y;
      te[9] = z.y;
      te[2] = x.z;
      te[6] = y.z;
      te[10] = z.z;
      return this;
    }
    invert() {
      const m = this.elements,
        inv = new Float32Array(16);
      inv[0] =
        m[5] * m[10] * m[15] -
        m[5] * m[11] * m[14] -
        m[9] * m[6] * m[15] +
        m[9] * m[7] * m[14] +
        m[13] * m[6] * m[11] -
        m[13] * m[7] * m[10];
      inv[4] =
        -m[4] * m[10] * m[15] +
        m[4] * m[11] * m[14] +
        m[8] * m[6] * m[15] -
        m[8] * m[7] * m[14] -
        m[12] * m[6] * m[11] +
        m[12] * m[7] * m[10];
      inv[8] =
        m[4] * m[9] * m[15] -
        m[4] * m[11] * m[13] -
        m[8] * m[5] * m[15] +
        m[8] * m[7] * m[13] +
        m[12] * m[5] * m[11] -
        m[12] * m[7] * m[9];
      inv[12] =
        -m[4] * m[9] * m[14] +
        m[4] * m[10] * m[13] +
        m[8] * m[5] * m[14] -
        m[8] * m[6] * m[13] -
        m[12] * m[5] * m[10] +
        m[12] * m[6] * m[9];
      inv[1] =
        -m[1] * m[10] * m[15] +
        m[1] * m[11] * m[14] +
        m[9] * m[2] * m[15] -
        m[9] * m[3] * m[14] -
        m[13] * m[2] * m[11] +
        m[13] * m[3] * m[10];
      inv[5] =
        m[0] * m[10] * m[15] -
        m[0] * m[11] * m[14] -
        m[8] * m[2] * m[15] +
        m[8] * m[3] * m[14] +
        m[12] * m[2] * m[11] -
        m[12] * m[3] * m[10];
      inv[9] =
        -m[0] * m[9] * m[15] +
        m[0] * m[11] * m[13] +
        m[8] * m[1] * m[15] -
        m[8] * m[3] * m[13] -
        m[12] * m[1] * m[11] +
        m[12] * m[3] * m[9];
      inv[13] =
        m[0] * m[9] * m[14] -
        m[0] * m[10] * m[13] -
        m[8] * m[1] * m[14] +
        m[8] * m[2] * m[13] +
        m[12] * m[1] * m[10] -
        m[12] * m[2] * m[9];
      inv[2] =
        m[1] * m[6] * m[15] -
        m[1] * m[7] * m[14] -
        m[5] * m[2] * m[15] +
        m[5] * m[3] * m[14] +
        m[13] * m[2] * m[7] -
        m[13] * m[3] * m[6];
      inv[6] =
        -m[0] * m[6] * m[15] +
        m[0] * m[7] * m[14] +
        m[4] * m[2] * m[15] -
        m[4] * m[3] * m[14] -
        m[12] * m[2] * m[7] +
        m[12] * m[3] * m[6];
      inv[10] =
        m[0] * m[5] * m[15] -
        m[0] * m[7] * m[13] -
        m[4] * m[1] * m[15] +
        m[4] * m[3] * m[13] +
        m[12] * m[1] * m[7] -
        m[12] * m[3] * m[5];
      inv[14] =
        -m[0] * m[5] * m[14] +
        m[0] * m[6] * m[13] +
        m[4] * m[1] * m[14] -
        m[4] * m[2] * m[13] -
        m[12] * m[1] * m[6] +
        m[12] * m[2] * m[5];
      inv[3] =
        -m[1] * m[6] * m[11] +
        m[1] * m[7] * m[10] +
        m[5] * m[2] * m[11] -
        m[5] * m[3] * m[10] -
        m[9] * m[2] * m[7] +
        m[9] * m[3] * m[6];
      inv[7] =
        m[0] * m[6] * m[11] -
        m[0] * m[7] * m[10] -
        m[4] * m[2] * m[11] +
        m[4] * m[3] * m[10] +
        m[8] * m[2] * m[7] -
        m[8] * m[3] * m[6];
      inv[11] =
        -m[0] * m[5] * m[11] +
        m[0] * m[7] * m[9] +
        m[4] * m[1] * m[11] -
        m[4] * m[3] * m[9] -
        m[8] * m[1] * m[7] +
        m[8] * m[3] * m[5];
      inv[15] =
        m[0] * m[5] * m[10] -
        m[0] * m[6] * m[9] -
        m[4] * m[1] * m[10] +
        m[4] * m[2] * m[9] +
        m[8] * m[1] * m[6] -
        m[8] * m[2] * m[5];
      let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
      det = det ? 1 / det : 0;
      for (let i = 0; i < 16; i++) this.elements[i] = inv[i] * det;
      return this;
    }
    makePerspective(fov, aspect, near, far) {
      const f = 1 / Math.tan((fov * Math.PI) / 360),
        e = this.elements;
      e.fill(0);
      e[0] = f / aspect;
      e[5] = f;
      e[10] = -(far + near) / (far - near);
      e[11] = -1;
      e[14] = (-2 * far * near) / (far - near);
      return this;
    }
    makeOrthographic(l, r, t, b, n, f) {
      const e = this.elements;
      e.fill(0);
      e[0] = 2 / (r - l);
      e[5] = 2 / (t - b);
      e[10] = -2 / (f - n);
      e[12] = -(r + l) / (r - l);
      e[13] = -(t + b) / (t - b);
      e[14] = -(f + n) / (f - n);
      e[15] = 1;
      return this;
    }
  }
  // matriks normal 3x3 (invers-transpose bagian rotasi/skala)
  /** Matriks normal 3x3 = invers-transpose bagian 3x3 matriks model, supaya normal tetap tegak lurus permukaan walau objek diskalakan. */
  function normalMatrix3(m, out) {
    const e = m.elements;
    const a00 = e[0],
      a01 = e[1],
      a02 = e[2],
      a10 = e[4],
      a11 = e[5],
      a12 = e[6],
      a20 = e[8],
      a21 = e[9],
      a22 = e[10];
    const b01 = a22 * a11 - a12 * a21,
      b11 = -a22 * a10 + a12 * a20,
      b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    det = det ? 1 / det : 0;
    // invers lalu transpose
    out[0] = b01 * det;
    out[3] = (-a22 * a01 + a02 * a21) * det;
    out[6] = (a12 * a01 - a02 * a11) * det;
    out[1] = b11 * det;
    out[4] = (a22 * a00 - a02 * a20) * det;
    out[7] = (-a12 * a00 + a02 * a10) * det;
    out[2] = b21 * det;
    out[5] = (-a21 * a00 + a01 * a20) * det;
    out[8] = (a11 * a00 - a01 * a10) * det;
    return out;
  }

  /* ---------------- scene graph ---------------- */
  const _q = new Quaternion(),
    _q2 = new Quaternion(),
    _m = new Matrix4(),
    UP = new Vector3(0, 1, 0);
  /**
   * Simpul dasar scene graph. Menyimpan posisi/rotasi/skala lokal dan daftar anak.
   * matrixWorld = matrix induk x matrix lokal (dihitung rekursif tiap frame).
   */
  class Object3D {
    constructor() {
      this.position = new Vector3();
      this.rotation = new Euler();
      this.scale = new Vector3(1, 1, 1);
      this.children = [];
      this.parent = null;
      this.matrix = new Matrix4();
      this.matrixWorld = new Matrix4();
      this.visible = true;
      this.castShadow = false;
      this.receiveShadow = false;
      this.frustumCulled = true;
    }
    add(o) {
      if (o.parent) {
        const i = o.parent.children.indexOf(o);
        if (i >= 0) o.parent.children.splice(i, 1);
      }
      o.parent = this;
      this.children.push(o);
      return this;
    }
    updateMatrix() {
      this.matrix.compose(this.position, _q.setFromEuler(this.rotation), this.scale);
    }
    updateMatrixWorld() {
      this.updateMatrix();
      if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      else this.matrixWorld.copy(this.matrix);
      for (const c of this.children) c.updateMatrixWorld();
    }
    lookAt(x, y, z) {
      const t = x instanceof Vector3 ? x : new Vector3(x, y, z);
      if (this.isCamera) _m.lookAt(this.position, t, UP);
      else _m.lookAt(t, this.position, UP);
      this.rotation.setFromRotationMatrix(_m);
    }
    _applyQuat(q, pre) {
      _q.setFromEuler(this.rotation);
      if (pre) _q2.multiplyQuaternions(q, _q);
      else _q2.multiplyQuaternions(_q, q);
      _m.makeRotationFromQuaternion(_q2);
      this.rotation.setFromRotationMatrix(_m);
      return this;
    }
    rotateX(a) {
      return this._applyQuat(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a), false);
    }
    rotateY(a) {
      return this._applyQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a), false);
    }
    rotateZ(a) {
      return this._applyQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a), false);
    }
    rotateOnWorldAxis(axis, a) {
      return this._applyQuat(new Quaternion().setFromAxisAngle(axis, a), true);
    }
    traverse(fn) {
      fn(this);
      for (const c of this.children) c.traverse(fn);
    }
  }
  /** Wadah kosong untuk mengelompokkan objek (mis. satu mobil, satu tiang). */
  class Group extends Object3D {}
  /** Akar scene graph; juga menyimpan pengaturan kabut. */
  class Scene extends Object3D {
    constructor() {
      super();
      this.isScene = true;
      this.fog = null;
    }
  }
  /** Objek yang digambar: gabungan geometri (bentuk) + material (tampilan). */
  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.isMesh = true;
      this.geometry = geometry;
      this.material = material;
    }
  }
  /** Kumpulan titik (gl.POINTS) – dipakai untuk bintang dan partikel air mancur. */
  class Points extends Object3D {
    constructor(geometry, material) {
      super();
      this.isPoints = true;
      this.geometry = geometry;
      this.material = material;
    }
  }
  /** Bidang datar yang selalu menghadap kamera – dipakai untuk awan. */
  class Sprite extends Object3D {
    constructor(material) {
      super();
      this.isSprite = true;
      this.material = material;
    }
  }
  /**
   * Menggambar satu geometri berkali-kali dalam satu draw call (instancing).
   * Tiap salinan punya matriks & warna sendiri – dipakai untuk LED, kanstin, dan topiari.
   */
  class InstancedMesh extends Mesh {
    constructor(geometry, material, count) {
      super(geometry, material);
      this.isInstancedMesh = true;
      this.count = count;
      const a = new Float32Array(count * 16);
      for (let i = 0; i < count; i++)
        a.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], i * 16);
      this.instanceMatrix = new BufferAttribute(a, 16);
      this.instanceColor = null;
    }
    setMatrixAt(i, m) {
      this.instanceMatrix.array.set(m.elements, i * 16);
      this.instanceMatrix.needsUpdate = true;
    }
    setColorAt(i, c) {
      if (!this.instanceColor)
        this.instanceColor = new BufferAttribute(new Float32Array(this.count * 3).fill(1), 3);
      this.instanceColor.array.set([c.r, c.g, c.b], i * 3);
      this.instanceColor.needsUpdate = true;
    }
  }
  /** Kamera perspektif (fov dalam derajat). */
  class PerspectiveCamera extends Object3D {
    constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
      super();
      this.isCamera = true;
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
      this.projectionMatrix = new Matrix4();
      this.matrixWorldInverse = new Matrix4();
      this.updateProjectionMatrix();
    }
    updateProjectionMatrix() {
      this.projectionMatrix.makePerspective(this.fov, this.aspect, this.near, this.far);
    }
  }
  /** Kelas dasar lampu: warna + intensitas. */
  class Light extends Object3D {
    constructor(color, intensity = 1) {
      super();
      this.isLight = true;
      this.color = new Color(color === undefined ? 0xffffff : color);
      this.intensity = intensity;
    }
  }
  /** Cahaya langit-tanah: permukaan menghadap atas dapat warna langit, menghadap bawah dapat warna tanah. */
  class HemisphereLight extends Light {
    constructor(sky, ground, intensity) {
      super(sky, intensity);
      this.isHemisphereLight = true;
      this.groundColor = new Color(ground);
      this.position.set(0, 1, 0);
    }
  }
  /** Cahaya searah (matahari/bulan). Matahari juga membuat shadow map. */
  class DirectionalLight extends Light {
    constructor(color, intensity) {
      super(color, intensity);
      this.isDirectionalLight = true;
      this.position.set(0, 1, 0);
      this.target = new Object3D();
      this.shadow = {
        mapSize: new Vector2(512, 512),
        camera: { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 500 },
        bias: 0,
        normalBias: 0,
      };
    }
  }
  /** Lampu titik dengan peluruhan jarak (distance, decay). */
  class PointLight extends Light {
    constructor(color, intensity, distance = 0, decay = 2) {
      super(color, intensity);
      this.isPointLight = true;
      this.distance = distance;
      this.decay = decay;
    }
  }
  /** Kabut linear: warna objek makin mendekati warna kabut antara jarak near..far. */
  class Fog {
    constructor(color, near = 1, far = 1000) {
      this.color = new Color(color);
      this.near = near;
      this.far = far;
    }
  }

  /* ---------------- geometry ---------------- */
  /** Array data per-vertex (posisi, normal, uv, ...). needsUpdate=true memicu upload ulang ke GPU. */
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
      this.version = 0;
    }
    set needsUpdate(v) {
      if (v) this.version++;
    }
    getX(i) {
      return this.array[i * this.itemSize];
    }
    getY(i) {
      return this.array[i * this.itemSize + 1];
    }
    getZ(i) {
      return this.array[i * this.itemSize + 2];
    }
    setX(i, v) {
      this.array[i * this.itemSize] = v;
      return this;
    }
    setY(i, v) {
      this.array[i * this.itemSize + 1] = v;
      return this;
    }
    setZ(i, v) {
      this.array[i * this.itemSize + 2] = v;
      return this;
    }
    setXYZ(i, x, y, z) {
      const o = i * this.itemSize;
      this.array[o] = x;
      this.array[o + 1] = y;
      this.array[o + 2] = z;
      return this;
    }
  }
  class Float32BufferAttribute extends BufferAttribute {
    constructor(arr, size) {
      super(new Float32Array(arr), size);
    }
  }
  /**
   * Geometri: kumpulan atribut vertex + indeks segitiga.
   * Menyediakan transformasi (translate/rotate) dan perhitungan normal otomatis.
   */
  class BufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
    }
    setAttribute(n, a) {
      this.attributes[n] = a;
      return this;
    }
    setIndex(arr) {
      this.index = new BufferAttribute(
        arr.length > 65535 ? new Uint32Array(arr) : new Uint32Array(arr),
        1,
      );
      return this;
    }
    _set(pos, nor, uv, idx) {
      this.setAttribute("position", new Float32BufferAttribute(pos, 3));
      if (nor) this.setAttribute("normal", new Float32BufferAttribute(nor, 3));
      this.setAttribute(
        "uv",
        new Float32BufferAttribute(uv || new Array((pos.length / 3) * 2).fill(0), 2),
      );
      if (idx) this.setIndex(idx);
      fixWinding(this);
      return this;
    }
    _xf(fnP, fnN) {
      const p = this.attributes.position,
        n = this.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const r = fnP(p.getX(i), p.getY(i), p.getZ(i));
        p.setXYZ(i, r[0], r[1], r[2]);
      }
      if (n && fnN)
        for (let i = 0; i < n.count; i++) {
          const r = fnN(n.getX(i), n.getY(i), n.getZ(i));
          n.setXYZ(i, r[0], r[1], r[2]);
        }
      p.needsUpdate = true;
      if (n) n.needsUpdate = true;
      return this;
    }
    translate(x, y, z) {
      return this._xf((a, b, c) => [a + x, b + y, c + z], null);
    }
    rotateX(t) {
      const c = Math.cos(t),
        s = Math.sin(t),
        f = (x, y, z) => [x, y * c - z * s, y * s + z * c];
      return this._xf(f, f);
    }
    rotateY(t) {
      const c = Math.cos(t),
        s = Math.sin(t),
        f = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
      return this._xf(f, f);
    }
    rotateZ(t) {
      const c = Math.cos(t),
        s = Math.sin(t),
        f = (x, y, z) => [x * c - y * s, x * s + y * c, z];
      return this._xf(f, f);
    }
    computeVertexNormals() {
      const p = this.attributes.position.array,
        n = new Float32Array(p.length);
      const idx = this.index ? this.index.array : null,
        cnt = idx ? idx.length : p.length / 3;
      for (let t = 0; t < cnt; t += 3) {
        const a = idx ? idx[t] : t,
          b = idx ? idx[t + 1] : t + 1,
          c = idx ? idx[t + 2] : t + 2;
        const ux = p[b * 3] - p[a * 3],
          uy = p[b * 3 + 1] - p[a * 3 + 1],
          uz = p[b * 3 + 2] - p[a * 3 + 2],
          vx = p[c * 3] - p[a * 3],
          vy = p[c * 3 + 1] - p[a * 3 + 1],
          vz = p[c * 3 + 2] - p[a * 3 + 2];
        const nx = uy * vz - uz * vy,
          ny = uz * vx - ux * vz,
          nz = ux * vy - uy * vx;
        for (const v of [a, b, c]) {
          n[v * 3] += nx;
          n[v * 3 + 1] += ny;
          n[v * 3 + 2] += nz;
        }
      }
      for (let i = 0; i < n.length; i += 3) {
        const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
        n[i] /= l;
        n[i + 1] /= l;
        n[i + 2] /= l;
      }
      this.setAttribute("normal", new BufferAttribute(n, 3));
      return this;
    }
  }
  // samakan urutan putaran segitiga dengan arah normal (supaya back-face culling benar)
  /** Menyamakan urutan putaran segitiga (CCW) dengan arah normal agar back-face culling benar. */
  function fixWinding(g) {
    const p = g.attributes.position.array,
      nA = g.attributes.normal;
    if (!nA) return;
    const n = nA.array;
    const idx = g.index ? g.index.array : null,
      cnt = idx ? idx.length : p.length / 3;
    for (let t = 0; t < cnt; t += 3) {
      const a = idx ? idx[t] : t,
        b = idx ? idx[t + 1] : t + 1,
        c = idx ? idx[t + 2] : t + 2;
      const ux = p[b * 3] - p[a * 3],
        uy = p[b * 3 + 1] - p[a * 3 + 1],
        uz = p[b * 3 + 2] - p[a * 3 + 2],
        vx = p[c * 3] - p[a * 3],
        vy = p[c * 3 + 1] - p[a * 3 + 1],
        vz = p[c * 3 + 2] - p[a * 3 + 2];
      const fx = uy * vz - uz * vy,
        fy = uz * vx - ux * vz,
        fz = ux * vy - uy * vx;
      const mx = n[a * 3] + n[b * 3] + n[c * 3],
        my = n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1],
        mz = n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2];
      if (fx * mx + fy * my + fz * mz < 0) {
        if (idx) {
          const tmp = idx[t + 1];
          idx[t + 1] = idx[t + 2];
          idx[t + 2] = tmp;
        } else
          for (const A of Object.values(g.attributes)) {
            const s = A.itemSize,
              arr = A.array;
            for (let k = 0; k < s; k++) {
              const tmp = arr[b * s + k];
              arr[b * s + k] = arr[c * s + k];
              arr[c * s + k] = tmp;
            }
          }
      }
    }
  }

  /** Bidang persegi panjang di bidang XY menghadap +Z, bisa dibagi menjadi grid. */
  class PlaneGeometry extends BufferGeometry {
    constructor(w = 1, h = 1, ws = 1, hs = 1) {
      super();
      const P = [],
        N = [],
        U = [],
        I = [];
      for (let iy = 0; iy <= hs; iy++)
        for (let ix = 0; ix <= ws; ix++) {
          P.push((ix / ws) * w - w / 2, -((iy / hs) * h - h / 2), 0);
          N.push(0, 0, 1);
          U.push(ix / ws, 1 - iy / hs);
        }
      for (let iy = 0; iy < hs; iy++)
        for (let ix = 0; ix < ws; ix++) {
          const a = ix + (ws + 1) * iy,
            b = ix + (ws + 1) * (iy + 1),
            c = ix + 1 + (ws + 1) * (iy + 1),
            d = ix + 1 + (ws + 1) * iy;
          I.push(a, b, d, b, c, d);
        }
      this._set(P, N, U, I);
    }
  }
  /** Cakram lingkaran di bidang XY (dipakai untuk plaza, taman, air kolam). */
  class CircleGeometry extends BufferGeometry {
    constructor(r = 1, segs = 32) {
      super();
      const P = [0, 0, 0],
        N = [0, 0, 1],
        U = [0.5, 0.5],
        I = [];
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * TAU,
          x = r * Math.cos(a),
          y = r * Math.sin(a);
        P.push(x, y, 0);
        N.push(0, 0, 1);
        U.push((x / r + 1) / 2, (y / r + 1) / 2);
      }
      for (let i = 1; i <= segs; i++) I.push(i, i + 1, 0);
      this._set(P, N, U, I);
    }
  }
  /** Cincin datar (lingkaran dengan lubang). */
  class RingGeometry extends BufferGeometry {
    constructor(ri = 0.5, ro = 1, segs = 32) {
      super();
      const P = [],
        N = [],
        U = [],
        I = [];
      for (let j = 0; j <= 1; j++) {
        const r = j ? ro : ri;
        for (let s = 0; s <= segs; s++) {
          const a = (s / segs) * TAU,
            x = r * Math.cos(a),
            y = r * Math.sin(a);
          P.push(x, y, 0);
          N.push(0, 0, 1);
          U.push((x / ro + 1) / 2, (y / ro + 1) / 2);
        }
      }
      for (let s = 0; s < segs; s++) {
        const a = s,
          b = s + segs + 1,
          c = s + segs + 2,
          d = s + 1;
        I.push(a, b, d, b, c, d);
      }
      this._set(P, N, U, I);
    }
  }
  /** Balok (kotak) – bodi mobil, kepala lampu, dll. */
  class BoxGeometry extends BufferGeometry {
    constructor(w = 1, h = 1, d = 1) {
      super();
      const P = [],
        N = [],
        U = [],
        I = [];
      const face = (o, uA, vA, nn) => {
        const base = P.length / 3;
        for (const [u, v] of [
          [0, 1],
          [1, 1],
          [0, 0],
          [1, 0],
        ]) {
          const p = [
            o[0] + uA[0] * (u - 0.5) + vA[0] * (v - 0.5),
            o[1] + uA[1] * (u - 0.5) + vA[1] * (v - 0.5),
            o[2] + uA[2] * (u - 0.5) + vA[2] * (v - 0.5),
          ];
          P.push(...p);
          N.push(...nn);
          U.push(u, v);
        }
        I.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
      };
      face([w / 2, 0, 0], [0, 0, -d], [0, h, 0], [1, 0, 0]);
      face([-w / 2, 0, 0], [0, 0, d], [0, h, 0], [-1, 0, 0]);
      face([0, h / 2, 0], [w, 0, 0], [0, 0, -d], [0, 1, 0]);
      face([0, -h / 2, 0], [w, 0, 0], [0, 0, d], [0, -1, 0]);
      face([0, 0, d / 2], [w, 0, 0], [0, h, 0], [0, 0, 1]);
      face([0, 0, -d / 2], [-w, 0, 0], [0, h, 0], [0, 0, -1]);
      this._set(P, N, U, I);
    }
  }
  /** Silinder/kerucut terpancung; open=true tanpa tutup (kanstin, pagar, menara kisi). */
  class CylinderGeometry extends BufferGeometry {
    constructor(rt = 1, rb = 1, h = 1, rs = 32, hs = 1, open = false) {
      super();
      const P = [],
        N = [],
        U = [],
        I = [],
        grid = [],
        slope = (rb - rt) / h;
      for (let y = 0; y <= hs; y++) {
        const row = [],
          v = y / hs,
          r = v * (rb - rt) + rt;
        for (let x = 0; x <= rs; x++) {
          const u = x / rs,
            th = u * TAU,
            s = Math.sin(th),
            c = Math.cos(th);
          P.push(r * s, -v * h + h / 2, r * c);
          const l = Math.hypot(s, slope, c);
          N.push(s / l, slope / l, c / l);
          U.push(u, 1 - v);
          row.push(P.length / 3 - 1);
        }
        grid.push(row);
      }
      for (let x = 0; x < rs; x++)
        for (let y = 0; y < hs; y++) {
          const a = grid[y][x],
            b = grid[y + 1][x],
            c = grid[y + 1][x + 1],
            d = grid[y][x + 1];
          I.push(a, b, d, b, c, d);
        }
      if (!open)
        for (const top of [true, false]) {
          const r = top ? rt : rb,
            sign = top ? 1 : -1;
          if (r <= 0) continue;
          const c0 = P.length / 3;
          P.push(0, (h / 2) * sign, 0);
          N.push(0, sign, 0);
          U.push(0.5, 0.5);
          for (let x = 0; x <= rs; x++) {
            const th = (x / rs) * TAU,
              s = Math.sin(th),
              c = Math.cos(th);
            P.push(r * s, (h / 2) * sign, r * c);
            N.push(0, sign, 0);
            U.push(c * 0.5 + 0.5, s * 0.5 * sign + 0.5);
          }
          for (let x = 0; x < rs; x++) I.push(c0, c0 + 1 + x, c0 + 2 + x);
        }
      this._set(P, N, U, I);
    }
  }
  /** Bola UV (langit, bulan, lampu LED). */
  class SphereGeometry extends BufferGeometry {
    constructor(r = 1, ws = 32, hs = 16) {
      super();
      const P = [],
        N = [],
        U = [],
        I = [],
        grid = [];
      for (let iy = 0; iy <= hs; iy++) {
        const row = [],
          v = iy / hs;
        for (let ix = 0; ix <= ws; ix++) {
          const u = ix / ws,
            x = -r * Math.cos(u * TAU) * Math.sin(v * Math.PI),
            y = r * Math.cos(v * Math.PI),
            z = r * Math.sin(u * TAU) * Math.sin(v * Math.PI);
          P.push(x, y, z);
          N.push(x / r, y / r, z / r);
          U.push(u, 1 - v);
          row.push(P.length / 3 - 1);
        }
        grid.push(row);
      }
      for (let iy = 0; iy < hs; iy++)
        for (let ix = 0; ix < ws; ix++) {
          const a = grid[iy][ix + 1],
            b = grid[iy][ix],
            c = grid[iy + 1][ix],
            d = grid[iy + 1][ix + 1];
          if (iy !== 0) I.push(a, b, d);
          if (iy !== hs - 1) I.push(b, c, d);
        }
      this._set(P, N, U, I);
    }
  }
  /** Torus/donat di bidang XY (pagar tanaman, cincin orbit lambang). */
  class TorusGeometry extends BufferGeometry {
    constructor(R = 1, tube = 0.4, rad = 12, tub = 48) {
      super();
      const P = [],
        N = [],
        U = [],
        I = [];
      for (let j = 0; j <= rad; j++)
        for (let i = 0; i <= tub; i++) {
          const u = (i / tub) * TAU,
            v = (j / rad) * TAU;
          const x = (R + tube * Math.cos(v)) * Math.cos(u),
            y = (R + tube * Math.cos(v)) * Math.sin(u),
            z = tube * Math.sin(v);
          P.push(x, y, z);
          const cx = R * Math.cos(u),
            cy = R * Math.sin(u),
            l = Math.hypot(x - cx, y - cy, z) || 1;
          N.push((x - cx) / l, (y - cy) / l, z / l);
          U.push(i / tub, j / rad);
        }
      for (let j = 1; j <= rad; j++)
        for (let i = 1; i <= tub; i++) {
          const a = (tub + 1) * j + i - 1,
            b = (tub + 1) * (j - 1) + i - 1,
            c = (tub + 1) * (j - 1) + i,
            d = (tub + 1) * j + i;
          I.push(a, b, d, b, c, d);
        }
      this._set(P, N, U, I);
    }
  }
  /** Ikosahedron yang dihaluskan (detail) – bentuk daun pohon low-poly. */
  class IcosahedronGeometry extends BufferGeometry {
    constructor(r = 1, detail = 0) {
      super();
      const t = (1 + Math.sqrt(5)) / 2,
        V = [
          -1,
          t,
          0,
          1,
          t,
          0,
          -1,
          -t,
          0,
          1,
          -t,
          0,
          0,
          -1,
          t,
          0,
          1,
          t,
          0,
          -1,
          -t,
          0,
          1,
          -t,
          t,
          0,
          -1,
          t,
          0,
          1,
          -t,
          0,
          -1,
          -t,
          0,
          1,
        ];
      const F = [
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7,
        1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9,
        8, 1,
      ];
      const P = [],
        N = [],
        cols = detail + 1,
        v = (i) => [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]];
      const proj = (p) => {
        const l = Math.hypot(...p);
        return [(p[0] / l) * r, (p[1] / l) * r, (p[2] / l) * r];
      };
      for (let f = 0; f < F.length; f += 3) {
        const a = v(F[f]),
          b = v(F[f + 1]),
          c = v(F[f + 2]),
          grid = [];
        for (let i = 0; i <= cols; i++) {
          grid[i] = [];
          const aj = a.map((x, k) => x + ((c[k] - x) * i) / cols),
            bj = b.map((x, k) => x + ((c[k] - x) * i) / cols),
            rows = cols - i;
          for (let j = 0; j <= rows; j++)
            grid[i][j] =
              j === 0 && i === cols ? aj : aj.map((x, k) => x + ((bj[k] - x) * j) / rows);
        }
        const tri = (p1, p2, p3) => {
          const A = proj(p1),
            B = proj(p2),
            C = proj(p3);
          P.push(...A, ...B, ...C);
          const mx = (A[0] + B[0] + C[0]) / 3,
            my = (A[1] + B[1] + C[1]) / 3,
            mz = (A[2] + B[2] + C[2]) / 3,
            l = Math.hypot(mx, my, mz);
          for (let k = 0; k < 3; k++) N.push(mx / l, my / l, mz / l);
        };
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < 2 * (cols - i) - 1; j++) {
            const k = Math.floor(j / 2);
            if (j % 2 === 0) tri(grid[i][k + 1], grid[i + 1][k], grid[i][k]);
            else tri(grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]);
          }
      }
      this._set(P, N, null, null);
    }
  }
  // kotak membulat (untuk tanaman topiari)
  /** Kotak bersudut membulat – bentuk tanaman topiari. */
  class RoundedBoxGeometry extends BufferGeometry {
    constructor(w = 1, h = 1, d = 1, segs = 2, rad = 0.1) {
      super();
      const n = segs * 2 + 2,
        P = [],
        N = [],
        U = [],
        I = [],
        hx = w / 2,
        hy = h / 2,
        hz = d / 2;
      const faces = [
        [
          [1, 0, 0],
          [0, 0, -1],
          [0, 1, 0],
        ],
        [
          [-1, 0, 0],
          [0, 0, 1],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [1, 0, 0],
          [0, 0, -1],
        ],
        [
          [0, -1, 0],
          [1, 0, 0],
          [0, 0, 1],
        ],
        [
          [0, 0, 1],
          [1, 0, 0],
          [0, 1, 0],
        ],
        [
          [0, 0, -1],
          [-1, 0, 0],
          [0, 1, 0],
        ],
      ];
      for (const [nn, ua, va] of faces) {
        const base = P.length / 3;
        for (let j = 0; j <= n; j++)
          for (let i = 0; i <= n; i++) {
            const u = (i / n) * 2 - 1,
              v = (j / n) * 2 - 1;
            const p = [
              nn[0] + ua[0] * u + va[0] * v,
              nn[1] + ua[1] * u + va[1] * v,
              nn[2] + ua[2] * u + va[2] * v,
            ].map((c, k) => c * [hx, hy, hz][k]);
            const cl = p.map((c, k) =>
              Math.max(-[hx, hy, hz][k] + rad, Math.min([hx, hy, hz][k] - rad, c)),
            );
            const dv = p.map((c, k) => c - cl[k]),
              l = Math.hypot(...dv) || 1,
              nrm = dv.map((c) => c / l);
            P.push(...cl.map((c, k) => c + nrm[k] * rad));
            N.push(...nrm);
            U.push(i / n, j / n);
          }
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const a = base + j * (n + 1) + i,
              b = a + 1,
              c = a + n + 2,
              dd = a + n + 1;
            I.push(a, b, dd, b, c, dd);
          }
      }
      this._set(P, N, U, I);
    }
  }

  /* ---------------- 2D shapes + extrude ---------------- */
  /** Segmen garis lurus untuk Path. */
  class LineCurve {
    constructor(a, b) {
      this.v1 = a;
      this.v2 = b;
    }
    getPoint(t) {
      return new Vector2(
        this.v1.x + (this.v2.x - this.v1.x) * t,
        this.v1.y + (this.v2.y - this.v1.y) * t,
      );
    }
  }
  /** Busur lingkaran untuk Path (absarc). */
  class EllipseCurve {
    constructor(x, y, r, a0, a1, cw) {
      Object.assign(this, { x, y, r, a0, a1, cw });
    }
    getPoint(t) {
      let d = this.a1 - this.a0;
      const same = Math.abs(d) < 1e-10;
      while (d < 0) d += TAU;
      while (d > TAU) d -= TAU;
      if (d < 1e-10) d = same ? 0 : TAU;
      if (this.cw && !same) d = d === TAU ? -TAU : d - TAU;
      const a = this.a0 + t * d;
      return new Vector2(this.x + this.r * Math.cos(a), this.y + this.r * Math.sin(a));
    }
  }
  /** Jalur 2D (moveTo, lineTo, absarc) – dasar pembuatan bentuk roda gigi, alas huruf, atap gate. */
  class Path {
    constructor() {
      this.curves = [];
      this.currentPoint = new Vector2();
    }
    moveTo(x, y) {
      this.currentPoint.set(x, y);
      return this;
    }
    lineTo(x, y) {
      this.curves.push(new LineCurve(this.currentPoint.clone(), new Vector2(x, y)));
      this.currentPoint.set(x, y);
      return this;
    }
    closePath() {
      if (!this.curves.length) return this;
      const s = this.curves[0].getPoint(0),
        e = this.curves[this.curves.length - 1].getPoint(1);
      if (!s.equals(e)) this.curves.push(new LineCurve(e, s));
      return this;
    }
    absarc(x, y, r, a0, a1, cw) {
      const c = new EllipseCurve(x, y, r, a0, a1, cw);
      if (this.curves.length) {
        const f = c.getPoint(0);
        if (!f.equals(this.currentPoint)) this.lineTo(f.x, f.y);
      }
      this.curves.push(c);
      const e = c.getPoint(1);
      this.currentPoint.set(e.x, e.y);
      return this;
    }
    getPoints(div = 12) {
      const out = [];
      let last = null;
      for (const c of this.curves) {
        const res = c instanceof EllipseCurve ? div * 2 : 1;
        for (let j = 0; j <= res; j++) {
          const p = c.getPoint(j / res);
          if (last && last.equals(p)) continue;
          out.push(p);
          last = p;
        }
      }
      return out;
    }
    getSpacedPoints(div = 40) {
      const pts = this.getPoints(64),
        L = [0];
      for (let i = 1; i < pts.length; i++)
        L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const tot = L[L.length - 1],
        out = [];
      for (let d = 0; d <= div; d++) {
        const tl = (tot * d) / div;
        let k = 1;
        while (k < L.length - 1 && L[k] < tl) k++;
        const seg = L[k] - L[k - 1] || 1,
          f = (tl - L[k - 1]) / seg;
        out.push(
          new Vector2(
            pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f,
            pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f,
          ),
        );
      }
      return out;
    }
  }
  /** Path tertutup yang boleh punya lubang (holes). */
  class Shape extends Path {
    constructor() {
      super();
      this.holes = [];
    }
  }
  const area2 = (pts) => {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i],
        q = pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };
  /** Triangulasi poligon sederhana dengan metode ear clipping. */
  function earClip(pts) {
    const n = pts.length,
      idx = [...Array(n).keys()],
      tris = [];
    const cr = (a, b, c) =>
      (pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) - (pts[b].y - pts[a].y) * (pts[c].x - pts[a].x);
    const inside = (p, a, b, c) => {
      const P = pts[p],
        A = pts[a],
        B = pts[b],
        C = pts[c];
      const d1 = (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x),
        d2 = (C.x - B.x) * (P.y - B.y) - (C.y - B.y) * (P.x - B.x),
        d3 = (A.x - C.x) * (P.y - C.y) - (A.y - C.y) * (P.x - C.x);
      return d1 >= 0 && d2 >= 0 && d3 >= 0;
    };
    let start = 0,
      guard = 0;
    while (idx.length > 3 && guard++ < 100000) {
      let found = false;
      for (let s = 0; s < idx.length; s++) {
        const k = (start + s) % idx.length,
          a = idx[(k + idx.length - 1) % idx.length],
          b = idx[k],
          c = idx[(k + 1) % idx.length];
        if (cr(a, b, c) <= 1e-12) continue;
        let ok = true;
        for (const p of idx) {
          if (p === a || p === b || p === c) continue;
          if (inside(p, a, b, c)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          tris.push(a, b, c);
          idx.splice(k, 1);
          start = k % idx.length;
          found = true;
          break;
        }
      }
      if (!found) {
        tris.push(idx[0], idx[1], idx[2]);
        idx.splice(1, 1);
      }
    }
    if (idx.length === 3) tris.push(...idx);
    return tris;
  }
  // cincin roda gigi: kontur luar & lubang bundar di tengah dijahit menurut sudut
  /** Triangulasi cincin (kontur luar + satu lubang di tengah) – khusus bentuk roda gigi. */
  function ringTriangulate(outer, hole) {
    const ang = (p) => {
      const a = Math.atan2(p.y, p.x);
      return a < 0 ? a + TAU : a;
    };
    const O = outer.map((p, i) => ({ i, a: ang(p) })).sort((x, y) => x.a - y.a),
      H = hole.map((p, i) => ({ i, a: ang(p) })).sort((x, y) => x.a - y.a);
    const n = O.length,
      m = H.length,
      tris = [];
    let i = 0,
      j = 0;
    const A = (arr, k) => arr[k % arr.length].a + Math.floor(k / arr.length) * TAU;
    while (i < n || j < m) {
      if (j >= m || (i < n && A(O, i + 1) <= A(H, j + 1))) {
        tris.push(["o", O[i % n].i], ["o", O[(i + 1) % n].i], ["h", H[j % m].i]);
        i++;
      } else {
        tris.push(["o", O[i % n].i], ["h", H[(j + 1) % m].i], ["h", H[j % m].i]);
        j++;
      }
    }
    return tris;
  }
  /** Mengubah bentuk 2D (Shape) menjadi benda 3D bertebal `depth`: tutup depan, tutup belakang, dan dinding samping. */
  class ExtrudeGeometry extends BufferGeometry {
    constructor(shape, opt = {}) {
      super();
      const depth = opt.depth ?? 1,
        cs = opt.curveSegments ?? 12;
      const clean = (pts) => {
        if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
        return pts;
      };
      let outer = clean(shape.getPoints(cs));
      if (area2(outer) < 0) outer.reverse();
      const holes = shape.holes.map((h) => {
        const p = clean(h.getPoints(cs));
        if (area2(p) > 0) p.reverse();
        return p;
      });
      const P = [],
        N = [];
      const put = (p, z, n) => {
        P.push(p.x, p.y, z);
        N.push(...n);
      };
      if (holes.length) {
        const tr = ringTriangulate(outer, holes[0]);
        const get = ([w, k]) => (w === "o" ? outer[k] : holes[0][k]);
        for (let t = 0; t < tr.length; t += 3)
          for (const [z, nz] of [
            [depth, 1],
            [0, -1],
          ])
            for (let k = 0; k < 3; k++) put(get(tr[t + k]), z, [0, 0, nz]);
      } else {
        const tr = earClip(outer);
        for (let t = 0; t < tr.length; t += 3)
          for (const [z, nz] of [
            [depth, 1],
            [0, -1],
          ])
            for (let k = 0; k < 3; k++) put(outer[tr[t + k]], z, [0, 0, nz]);
      }
      for (const c of [outer, ...holes])
        for (let k = 0; k < c.length; k++) {
          const a = c[k],
            b = c[(k + 1) % c.length],
            dx = b.x - a.x,
            dy = b.y - a.y,
            l = Math.hypot(dx, dy) || 1,
            nn = [dy / l, -dx / l, 0];
          put(a, 0, nn);
          put(b, 0, nn);
          put(b, depth, nn);
          put(a, 0, nn);
          put(b, depth, nn);
          put(a, depth, nn);
        }
      this._set(P, N, null, null);
    }
  }

  /* ---------------- textures & materials ---------------- */
  /** Tekstur dari elemen <canvas> (pola jalan, huruf, bendera dibuat dengan Canvas 2D). */
  class CanvasTexture {
    constructor(img) {
      this.image = img;
      this.colorSpace = "";
      this.wrapS = this.wrapT = ClampToEdgeWrapping;
      this.repeat = new Vector2(1, 1);
      this.anisotropy = 1;
      this.flipY = true;
      this.version = 1;
    }
    set needsUpdate(v) {
      if (v) this.version++;
    }
  }
  /**
   * Material dasar. Properti mengikuti model PBR sederhana:
   * color, map (tekstur), emissive (cahaya sendiri), roughness, metalness,
   * opacity/transparent, alphaTest, side (sisi yang digambar), blending.
   */
  class Material {
    constructor(p = {}) {
      this.color = new Color(0xffffff);
      this.map = null;
      this.emissive = new Color(0x000000);
      this.emissiveMap = null;
      this.emissiveIntensity = 1;
      this.roughness = 1;
      this.metalness = 0;
      this.opacity = 1;
      this.transparent = false;
      this.alphaTest = 0;
      this.side = FrontSide;
      this.blending = NormalBlending;
      this.depthWrite = true;
      this.depthTest = true;
      this.fog = true;
      this.flatShading = false;
      this.lit = true;
      this.id = Material._id = (Material._id || 0) + 1;
      this.setValues(p);
    }
    setValues(p) {
      for (const k in p) {
        const v = p[k];
        if ((k === "color" || k === "emissive") && !(v instanceof Color)) this[k] = new Color(v);
        else if (v instanceof Color) this[k] = v.clone();
        else this[k] = v;
      }
    }
  }
  /** Material yang terkena cahaya (diffuse + specular GGX). */
  class MeshStandardMaterial extends Material {}
  /** Material tanpa pencahayaan (warna polos), untuk glow dan LED. */
  class MeshBasicMaterial extends Material {
    constructor(p) {
      super();
      this.lit = false;
      this.setValues(p || {});
    }
  }
  /** Material untuk Sprite (awan). */
  class SpriteMaterial extends Material {
    constructor(p) {
      super();
      this.lit = false;
      this.transparent = true;
      this.isSpriteMaterial = true;
      this.setValues(p || {});
    }
  }
  /** Material titik berukuran tetap (bintang). */
  class PointsMaterial extends Material {
    constructor(p) {
      super();
      this.lit = false;
      this.size = 1;
      this.sizeAttenuation = true;
      this.isPointsMaterial = true;
      this.setValues(p || {});
    }
  }
  /** Material dengan shader GLSL buatan sendiri (langit & partikel air). */
  class ShaderMaterial extends Material {
    constructor(p) {
      super();
      this.isShaderMaterial = true;
      this.uniforms = {};
      this.setValues(p || {});
    }
  }
  const MathUtils = { lerp: (a, b, t) => a + (b - a) * t };
  /** Pencatat waktu antar-frame untuk animasi. */
  class Clock {
    constructor() {
      this.last = performance.now();
      this.elapsedTime = 0;
    }
    getDelta() {
      const n = performance.now(),
        d = (n - this.last) / 1000;
      this.last = n;
      this.elapsedTime += d;
      return d;
    }
  }

  /* ---------------- shaders ---------------- */
  /* ---------------- shader GLSL ---------------- */
  /** Vertex shader utama: transformasi posisi/normal ke ruang dunia, dukungan instancing, koordinat bayangan. */
  const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 position; layout(location=1) in vec3 normal; layout(location=2) in vec2 uv;
layout(location=8) in vec4 iM0; layout(location=9) in vec4 iM1; layout(location=10) in vec4 iM2; layout(location=11) in vec4 iM3; layout(location=12) in vec3 iColor;
uniform mat4 uModel, uView, uProj, uShadowMat; uniform mat3 uNormalMat; uniform vec2 uRepeat; uniform float uNormalBias;
out vec3 vWorldPos; out vec3 vNormal; out vec2 vUv; out vec3 vColor; out vec4 vShadowCoord; out float vViewZ;
void main(){
  mat4 im = mat4(iM0,iM1,iM2,iM3); vec4 wp = uModel * (im * vec4(position,1.));
  mat3 m3 = mat3(im); vec3 on = normal / vec3(dot(m3[0],m3[0]), dot(m3[1],m3[1]), dot(m3[2],m3[2])); on = m3 * on;
  vec3 wn = uNormalMat * on; float ln = length(wn); wn = ln > 0. ? wn/ln : vec3(0.,1.,0.);
  vWorldPos = wp.xyz; vNormal = wn; vUv = uv * uRepeat; vColor = iColor;
  vShadowCoord = uShadowMat * vec4(wp.xyz + wn * uNormalBias, 1.);
  vec4 mv = uView * wp; vViewZ = -mv.z; gl_Position = uProj * mv; }`;
  /**
   * Fragment shader utama (PBR sederhana):
   * - diffuse Lambert + specular GGX untuk 2 cahaya searah dan sampai 10 lampu titik
   * - cahaya langit-tanah (hemisphere)
   * - bayangan matahari dengan PCF 3x3 (tepi lembut)
   * - cahaya emisi (lampu menyala) dan kabut linear
   */
  const MESH_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vWorldPos; in vec3 vNormal; in vec2 vUv; in vec3 vColor; in vec4 vShadowCoord; in float vViewZ;
out vec4 fragColor;
uniform vec3 uColor, uEmissive, uCamPos; uniform float uOpacity, uRoughness, uMetalness, uAlphaTest;
uniform sampler2D uMap; uniform bool uHasMap, uHasEmissiveMap, uLit, uFlat, uFog, uReceiveShadow, uDouble;
uniform vec3 uHemiSky, uHemiGround; uniform vec3 uDirDir[2]; uniform vec3 uDirColor[2];
uniform int uNumPoint; uniform vec3 uPointPos[10]; uniform vec3 uPointColor[10]; uniform float uPointDist[10]; uniform float uPointDecay[10];
uniform sampler2DShadow uShadowMap; uniform bool uShadowOn; uniform float uShadowBias; uniform vec2 uShadowTexel;
uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
const float PI = 3.141592653589793;
float D_GGX(float a, float dNH){ float a2=a*a; float d=dNH*dNH*(a2-1.)+1.; return a2/(PI*d*d); }
float V_GGX(float a, float dNL, float dNV){ float a2=a*a; float gv=dNL*sqrt(a2+(1.-a2)*dNV*dNV); float gl=dNV*sqrt(a2+(1.-a2)*dNL*dNL); return 0.5/max(gv+gl,1e-6); }
vec3 F_Schlick(vec3 f0, float dVH){ float fr=exp2((-5.55473*dVH-6.98316)*dVH); return f0*(1.-fr)+fr; }
vec3 BRDF_GGX(vec3 L, vec3 V, vec3 N, vec3 f0, float rough){ float a=rough*rough; vec3 H=normalize(L+V);
  float dNL=clamp(dot(N,L),0.,1.), dNV=clamp(dot(N,V),0.,1.), dNH=clamp(dot(N,H),0.,1.), dVH=clamp(dot(V,H),0.,1.);
  return F_Schlick(f0,dVH)*(V_GGX(a,dNL,dNV)*D_GGX(a,dNH)); }
float shadowFactor(){ vec3 sc = vShadowCoord.xyz / vShadowCoord.w; sc.z += uShadowBias;
  if(sc.x<0.||sc.x>1.||sc.y<0.||sc.y>1.||sc.z>1.) return 1.;
  float s=0.; for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) s+=texture(uShadowMap, vec3(sc.xy+vec2(x,y)*uShadowTexel, sc.z)); return s/9.; }
void main(){
  vec4 diff = vec4(uColor, uOpacity); vec4 texel = vec4(1.);
  if(uHasMap){ texel = texture(uMap, vUv); diff *= texel; }
  diff.rgb *= vColor;
  if(diff.a < uAlphaTest) discard;
  vec3 outC;
  if(!uLit){ outC = diff.rgb; }
  else {
    vec3 N = uFlat ? normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos))) : normalize(vNormal);
    if(uDouble && !uFlat && !gl_FrontFacing) N = -N;
    vec3 V = normalize(uCamPos - vWorldPos);
    float rough = max(uRoughness, 0.0525);
    vec3 dc = diff.rgb*(1.-uMetalness); vec3 f0 = mix(vec3(0.04), diff.rgb, uMetalness);
    vec3 dd=vec3(0.), ds=vec3(0.);
    for(int i=0;i<2;i++){ vec3 L=uDirDir[i]; float dNL=clamp(dot(N,L),0.,1.); vec3 irr=dNL*uDirColor[i];
      if(i==0 && uShadowOn && uReceiveShadow) irr *= shadowFactor();
      dd += irr*dc/PI; ds += irr*BRDF_GGX(L,V,N,f0,rough); }
    for(int i=0;i<10;i++){ if(i>=uNumPoint) break; vec3 lv=uPointPos[i]-vWorldPos; float d=length(lv); vec3 L=lv/max(d,1e-4);
      float att=1./max(pow(d,uPointDecay[i]),0.01); if(uPointDist[i]>0.) att*=pow(clamp(1.-pow(d/uPointDist[i],4.),0.,1.),2.);
      vec3 irr=clamp(dot(N,L),0.,1.)*uPointColor[i]*att; dd+=irr*dc/PI; ds+=irr*BRDF_GGX(L,V,N,f0,rough); }
    vec3 hemi = mix(uHemiGround, uHemiSky, 0.5*N.y+0.5);
    outC = dd + ds + hemi*dc/PI;
  }
  vec3 em = uEmissive; if(uHasEmissiveMap) em *= texel.rgb; outC += em;
  if(uFog){ outC = mix(outC, uFogColor, smoothstep(uFogNear, uFogFar, vViewZ)); }
  fragColor = vec4(outC, diff.a); }`;
  /** Shader untuk shadow map: hanya menulis kedalaman dari sudut pandang matahari. */
  const DEPTH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 position; layout(location=2) in vec2 uv;
layout(location=8) in vec4 iM0; layout(location=9) in vec4 iM1; layout(location=10) in vec4 iM2; layout(location=11) in vec4 iM3;
uniform mat4 uModel, uLightVP; uniform vec2 uRepeat; out vec2 vUv;
void main(){ vUv = uv*uRepeat; gl_Position = uLightVP * uModel * mat4(iM0,iM1,iM2,iM3) * vec4(position,1.); }`;
  const DEPTH_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uMap; uniform bool uHasMap; uniform float uAlphaTest, uOpacity; out vec4 o;
void main(){ if(uHasMap && texture(uMap,vUv).a*uOpacity < uAlphaTest) discard; o=vec4(1.); }`;
  /** Shader sprite (awan) – bidang selalu menghadap kamera. */
  const SPRITE_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 position; layout(location=2) in vec2 uv;
uniform mat4 uView, uProj; uniform vec3 uCenter; uniform vec2 uScale; out vec2 vUv;
void main(){ vUv=uv; vec4 mv = uView*vec4(uCenter,1.); mv.xy += position.xy*uScale; gl_Position = uProj*mv; }`;
  const SPRITE_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; out vec4 o;
void main(){ vec4 t = texture(uMap, vUv); o = vec4(uColor*t.rgb, t.a*uOpacity); }`;
  /** Shader titik (bintang). */
  const POINTS_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 position; uniform mat4 uModel, uView, uProj; uniform float uSize;
void main(){ gl_Position = uProj*uView*uModel*vec4(position,1.); gl_PointSize = uSize; }`;
  const POINTS_FS = `#version 300 es
precision highp float; uniform vec3 uColor; uniform float uOpacity; out vec4 o; void main(){ o = vec4(uColor, uOpacity); }`;
  /** Segitiga layar penuh untuk pass post-processing. */
  const FS_TRI = `#version 300 es
out vec2 vUv; void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv = p; gl_Position = vec4(p*2.-1., 0., 1.); }`;
  /** Bloom tahap 1: ambil hanya bagian yang lebih terang dari ambang (threshold). */
  const BRIGHT_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform float uThreshold; out vec4 o;
void main(){ vec4 t = texture(uTex, vUv); float v = dot(t.rgb, vec3(0.2126,0.7152,0.0722)); float a = smoothstep(uThreshold, uThreshold+0.01, v); o = mix(vec4(0.,0.,0.,1.), t, a); }`;
  /** Bloom tahap 2: blur Gaussian terpisah (horizontal lalu vertikal). */
  const BLUR_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir; uniform vec2 uInvSize; uniform int uRadius; out vec4 o;
float g(float x, float s){ return 0.39894*exp(-0.5*x*x/(s*s))/s; }
void main(){ float s=float(uRadius); float ws=g(0.,s); vec3 sum=texture(uTex,vUv).rgb*ws;
  for(int i=1;i<11;i++){ if(i>=uRadius) break; float x=float(i); float w=g(x,s); vec2 off=uDir*uInvSize*x; sum+=(texture(uTex,vUv+off).rgb+texture(uTex,vUv-off).rgb)*w; ws+=2.*w; }
  o = vec4(sum/ws, 1.); }`;
  /** Tahap akhir: gabungkan scene + 5 tingkat bloom, tone mapping ACES, lalu ubah ke sRGB untuk layar. */
  const FINAL_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uB0, uB1, uB2, uB3, uB4; uniform float uStrength, uRadius, uExposure;
float lf(float f){ return mix(f, 1.2-f, uRadius); }
vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 aces(vec3 c){ const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
  const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
  c *= uExposure/0.6; c = I*c; c = RRTAndODTFit(c); c = O*c; return clamp(c,0.,1.); }
vec3 toSRGB(vec3 v){ return mix(pow(v, vec3(0.41666))*1.055-vec3(0.055), v*12.92, vec3(lessThanEqual(v, vec3(0.0031308)))); }
void main(){ vec3 c = texture(uScene, vUv).rgb;
  c += uStrength*( lf(1.0)*texture(uB0,vUv).rgb + lf(0.8)*texture(uB1,vUv).rgb + lf(0.6)*texture(uB2,vUv).rgb + lf(0.4)*texture(uB3,vUv).rgb + lf(0.2)*texture(uB4,vUv).rgb );
  o = vec4(toSRGB(aces(c)), 1.); }`;
  // awalan untuk ShaderMaterial (gaya GLSL lama -> GLSL ES 3.0)
  /** Awalan agar ShaderMaterial bisa ditulis dengan gaya GLSL lama (attribute/varying/gl_FragColor). */
  const CUSTOM_VS_PRE = `#version 300 es
precision highp float; precision highp int;
uniform mat4 modelMatrix, modelViewMatrix, projectionMatrix, viewMatrix; uniform vec3 cameraPosition;
#define attribute in
#define varying out
#define texture2D texture
in vec3 position;
`;
  const CUSTOM_FS_PRE = `#version 300 es
precision highp float; precision highp int;
#define varying in
#define texture2D texture
out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
`;

  /* ---------------- renderer ---------------- */
  /**
   * Renderer WebGL2. Urutan per frame:
   *  1. shadow pass  : gambar kedalaman objek dari sudut matahari ke shadow map
   *  2. main pass    : gambar semua objek ke buffer HDR multisample (anti-aliasing 4x)
   *                    objek buram dulu, lalu objek transparan dari jauh ke dekat
   *  3. bloom        : ambil bagian terang, blur 5 tingkat
   *  4. final        : gabung + tone mapping ACES + konversi sRGB ke layar
   */
  class WebGLRenderer {
    constructor({ canvas }) {
      const gl = (this.gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        depth: true,
        powerPreference: "high-performance",
      }));
      if (!gl) throw new Error("WebGL2 tidak didukung browser ini");
      this.canvas = canvas;
      this.pixelRatio = 1;
      this.width = 1;
      this.height = 1;
      this.shadowMap = { enabled: false, type: PCFSoftShadowMap };
      this.toneMapping = ACESFilmicToneMapping;
      this.outputColorSpace = SRGBColorSpace;
      this.toneMappingExposure = 1;
      this.bloom = { strength: 0, radius: 0, threshold: 1 };
      this.floatOK = !!gl.getExtension("EXT_color_buffer_float");
      gl.getExtension("OES_texture_float_linear");
      this.aniso = gl.getExtension("EXT_texture_filter_anisotropic");
      const maxA = this.aniso ? gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
      this.capabilities = { getMaxAnisotropy: () => maxA };
      // nilai konstan atribut instancing (identitas) saat objek tidak di-instance
      gl.vertexAttrib4f(8, 1, 0, 0, 0);
      gl.vertexAttrib4f(9, 0, 1, 0, 0);
      gl.vertexAttrib4f(10, 0, 0, 1, 0);
      gl.vertexAttrib4f(11, 0, 0, 0, 1);
      gl.vertexAttrib3f(12, 1, 1, 1);
      this.progMesh = this._prog(MESH_VS, MESH_FS);
      this.progDepth = this._prog(DEPTH_VS, DEPTH_FS);
      this.progSprite = this._prog(SPRITE_VS, SPRITE_FS);
      this.progPoints = this._prog(POINTS_VS, POINTS_FS);
      this.progBright = this._prog(FS_TRI, BRIGHT_FS);
      this.progBlur = this._prog(FS_TRI, BLUR_FS);
      this.progFinal = this._prog(FS_TRI, FINAL_FS);
      this.emptyVAO = gl.createVertexArray();
      const q = new PlaneGeometry(1, 1);
      this.spriteGeo = q;
      this.shadowSize = 0;
      this._nm = new Float32Array(9);
      this._vp = new Matrix4();
      this._tmp = new Matrix4();
    }
    setPixelRatio(r) {
      this.pixelRatio = r;
    }
    getPixelRatio() {
      return this.pixelRatio;
    }
    setSize(w, h) {
      this.width = w;
      this.height = h;
      this.canvas.width = Math.floor(w * this.pixelRatio);
      this.canvas.height = Math.floor(h * this.pixelRatio);
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this._targets();
    }
    _shader(type, src) {
      const gl = this.gl,
        s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(
          gl.getShaderInfoLog(s) +
            "\n" +
            src
              .split("\n")
              .map((l, i) => i + 1 + ": " + l)
              .join("\n"),
        );
      return s;
    }
    /** Kompilasi & link program shader, lalu catat lokasi semua uniform-nya. */
    _prog(vs, fs) {
      const gl = this.gl,
        p = gl.createProgram();
      gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {},
        n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const inf = gl.getActiveUniform(p, i),
          name = inf.name.replace(/\[0\]$/, "");
        u[name] = gl.getUniformLocation(p, inf.name);
      }
      return { p, u, id: (this._pid = (this._pid || 0) + 1), samplerUnits: {} };
    }
    _tex2D(w, h, hdr, filter) {
      const gl = this.gl,
        t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (hdr && this.floatOK)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    _fbo(tex) {
      const gl = this.gl,
        f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return f;
    }
    /** Buat ulang semua render target (MSAA, scene HDR, bloom) sesuai ukuran kanvas. */
    _targets() {
      const gl = this.gl,
        W = this.canvas.width,
        H = this.canvas.height;
      if (this.T) {
        const T = this.T;
        [T.sceneTex, T.brightTex, ...T.bA, ...T.bB].forEach((t) => gl.deleteTexture(t));
        [T.msColor, T.msDepth].forEach((r) => gl.deleteRenderbuffer(r));
        [T.msFbo, T.sceneFbo, T.brightFbo, ...T.fA, ...T.fB].forEach((f) =>
          gl.deleteFramebuffer(f),
        );
      }
      const T = (this.T = { W, H });
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
      T.msColor = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, T.msColor);
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        samples,
        this.floatOK ? gl.RGBA16F : gl.RGBA8,
        W,
        H,
      );
      T.msDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, T.msDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
      T.msFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, T.msColor);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.msDepth);
      T.sceneTex = this._tex2D(W, H, true);
      T.sceneFbo = this._fbo(T.sceneTex);
      let w = Math.max(1, Math.round(W / 2)),
        h = Math.max(1, Math.round(H / 2));
      T.brightTex = this._tex2D(w, h, true);
      T.brightFbo = this._fbo(T.brightTex);
      T.bA = [];
      T.bB = [];
      T.fA = [];
      T.fB = [];
      T.sizes = [];
      for (let i = 0; i < 5; i++) {
        T.sizes.push([w, h]);
        const a = this._tex2D(w, h, true),
          b = this._tex2D(w, h, true);
        T.bA.push(a);
        T.bB.push(b);
        T.fA.push(this._fbo(a));
        T.fB.push(this._fbo(b));
        w = Math.max(1, Math.round(w / 2));
        h = Math.max(1, Math.round(h / 2));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    /** Buat tekstur kedalaman untuk shadow map. */
    _shadowTarget(size) {
      const gl = this.gl;
      if (this.shadowSize === size) return;
      this.shadowSize = size;
      const t = (this.shadowTex = gl.createTexture());
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      this.shadowFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    /** Upload tekstur canvas ke GPU (sekali, atau saat versinya berubah) + buat mipmap. */
    _texture(t) {
      const gl = this.gl;
      if (t._gl && t._v === t.version) return t._gl;
      const tex = t._gl || gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, t.flipY);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        t.colorSpace === SRGBColorSpace ? gl.SRGB8_ALPHA8 : gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        t.image,
      );
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      const wr = (m) => (m === RepeatWrapping ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr(t.wrapS));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr(t.wrapT));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (this.aniso && t.anisotropy > 1)
        gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, t.anisotropy);
      t._gl = tex;
      t._v = t.version;
      return tex;
    }
    /** Upload/perbarui buffer atribut vertex ke GPU. */
    _buf(attr, target) {
      const gl = this.gl;
      if (!attr._buf) {
        attr._buf = gl.createBuffer();
        attr._v = -1;
      }
      if (attr._v !== attr.version) {
        gl.bindBuffer(target, attr._buf);
        if (attr._v === -1)
          gl.bufferData(target, attr.array, attr.version > 0 ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        else gl.bufferSubData(target, 0, attr.array);
        attr._v = attr.version;
      }
      return attr._buf;
    }
    // VAO: lokasi atribut tetap untuk program bawaan, dicari namanya untuk ShaderMaterial
    /** Buat (atau ambil dari cache) Vertex Array Object yang menghubungkan buffer ke atribut shader. */
    _vao(obj, geo, prog, custom) {
      this.gl.bindVertexArray(null);
      const gl = this.gl,
        owner = obj.isInstancedMesh ? obj : geo;
      owner._vaos = owner._vaos || {};
      for (const a of Object.values(geo.attributes)) this._buf(a, gl.ARRAY_BUFFER);
      if (geo.index) this._buf(geo.index, gl.ELEMENT_ARRAY_BUFFER);
      if (obj.isInstancedMesh) {
        this._buf(obj.instanceMatrix, gl.ARRAY_BUFFER);
        if (obj.instanceColor) this._buf(obj.instanceColor, gl.ARRAY_BUFFER);
      }
      const key = prog.id + (obj.instanceColor ? "c" : "");
      let v = owner._vaos[key];
      if (v) return v;
      v = gl.createVertexArray();
      gl.bindVertexArray(v);
      const bind = (attr, loc) => {
        if (loc < 0 || !attr) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, attr._buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, attr.itemSize, gl.FLOAT, false, 0, 0);
      };
      if (custom) {
        for (const [n, a] of Object.entries(geo.attributes))
          bind(a, gl.getAttribLocation(prog.p, n));
      } else {
        bind(geo.attributes.position, 0);
        bind(geo.attributes.normal, 1);
        bind(geo.attributes.uv, 2);
      }
      if (obj.isInstancedMesh && !custom) {
        gl.bindBuffer(gl.ARRAY_BUFFER, obj.instanceMatrix._buf);
        for (let i = 0; i < 4; i++) {
          gl.enableVertexAttribArray(8 + i);
          gl.vertexAttribPointer(8 + i, 4, gl.FLOAT, false, 64, i * 16);
          gl.vertexAttribDivisor(8 + i, 1);
        }
        if (obj.instanceColor) {
          gl.bindBuffer(gl.ARRAY_BUFFER, obj.instanceColor._buf);
          gl.enableVertexAttribArray(12);
          gl.vertexAttribPointer(12, 3, gl.FLOAT, false, 0, 0);
          gl.vertexAttribDivisor(12, 1);
        }
      }
      if (geo.index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.index._buf);
      gl.bindVertexArray(null);
      owner._vaos[key] = v;
      return v;
    }
    _draw(obj, geo, mode) {
      const gl = this.gl,
        n = geo.index ? geo.index.count : geo.attributes.position.count;
      if (obj.isInstancedMesh) {
        if (geo.index) gl.drawElementsInstanced(mode, n, gl.UNSIGNED_INT, 0, obj.count);
        else gl.drawArraysInstanced(mode, 0, n, obj.count);
      } else if (geo.index) gl.drawElements(mode, n, gl.UNSIGNED_INT, 0);
      else gl.drawArrays(mode, 0, n);
    }
    /** Atur state GPU sesuai material: culling sisi, blending transparan/aditif, depth write. */
    _state(mat) {
      const gl = this.gl;
      if (mat.side === DoubleSide) gl.disable(gl.CULL_FACE);
      else {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(mat.side === BackSide ? gl.FRONT : gl.BACK);
      }
      if (mat.transparent || mat.blending === AdditiveBlending) {
        gl.enable(gl.BLEND);
        if (mat.blending === AdditiveBlending) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        else
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA,
          );
      } else gl.disable(gl.BLEND);
      gl.depthMask(mat.depthWrite);
      if (mat.depthTest) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);
    }
    _customProg(mat) {
      if (!mat._prog)
        mat._prog = this._prog(
          CUSTOM_VS_PRE + mat.vertexShader,
          CUSTOM_FS_PRE + mat.fragmentShader,
        );
      return mat._prog;
    }
    /** Menggambar satu frame scene dari sudut pandang kamera. */
    render(scene, camera) {
      const gl = this.gl,
        T = this.T;
      scene.updateMatrixWorld();
      if (!camera.parent) camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const view = camera.matrixWorldInverse,
        proj = camera.projectionMatrix;
      // kumpulkan objek & lampu
      const opaque = [],
        transp = [],
        lights = { hemi: null, dirs: [], points: [] };
      const visit = (o) => {
        if (!o.visible) return;
        if (o.isLight) {
          if (o.isHemisphereLight) lights.hemi = o;
          else if (o.isDirectionalLight) lights.dirs.push(o);
          else if (o.isPointLight) lights.points.push(o);
        } else if (o.isMesh || o.isPoints || o.isSprite)
          (o.material.transparent ? transp : opaque).push(o);
        for (const c of o.children) visit(c);
      };
      visit(scene);
      // --- shadow pass (matahari) ---
      const sun = lights.dirs[0];
      const shadowOn = !!(this.shadowMap.enabled && sun && sun.castShadow && sun.intensity > 0);
      const lightVP = this._vp;
      if (shadowOn) {
        const S = sun.shadow,
          size = S.mapSize.x;
        this._shadowTarget(size);
        const lv = new Matrix4();
        const lp = new Vector3().setFromMatrixPosition(sun.matrixWorld),
          tp = new Vector3().setFromMatrixPosition(sun.target.matrixWorld);
        lv.lookAt(lp, tp, UP);
        lv.elements[12] = lp.x;
        lv.elements[13] = lp.y;
        lv.elements[14] = lp.z;
        lv.invert();
        const lpj = new Matrix4().makeOrthographic(
          S.camera.left,
          S.camera.right,
          S.camera.top,
          S.camera.bottom,
          S.camera.near,
          S.camera.far,
        );
        lightVP.multiplyMatrices(lpj, lv);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
        gl.viewport(0, 0, size, size);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const P = this.progDepth;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uLightVP, false, lightVP.elements);
        for (const o of [...opaque, ...transp]) {
          if (!o.castShadow || !o.isMesh || o.material.isShaderMaterial) continue;
          const m = o.material;
          gl.uniformMatrix4fv(P.u.uModel, false, o.matrixWorld.elements);
          const hasMap = !!(m.map && m.alphaTest > 0);
          gl.uniform1i(P.u.uHasMap, hasMap);
          gl.uniform1f(P.u.uAlphaTest, m.alphaTest);
          gl.uniform1f(P.u.uOpacity, m.opacity);
          gl.activeTexture(gl.TEXTURE0);
          gl.uniform1i(P.u.uMap, 0);
          if (hasMap) {
            gl.bindTexture(gl.TEXTURE_2D, this._texture(m.map));
            gl.uniform2f(P.u.uRepeat, m.map.repeat.x, m.map.repeat.y);
          } else {
            gl.bindTexture(gl.TEXTURE_2D, this._whiteTex());
            gl.uniform2f(P.u.uRepeat, 1, 1);
          }
          gl.bindVertexArray(this._vao(o, o.geometry, P, false));
          this._draw(o, o.geometry, gl.TRIANGLES);
        }
        gl.bindVertexArray(null);
      }
      // --- main pass ke buffer HDR multisample ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFbo);
      gl.viewport(0, 0, T.W, T.H);
      gl.clearColor(0, 0, 0, 1);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // urutkan transparan dari jauh ke dekat
      const vz = (o) => {
        const e = o.matrixWorld.elements,
          v = view.elements;
        return v[2] * e[12] + v[6] * e[13] + v[10] * e[14] + v[14];
      };
      transp.sort((a, b) => vz(a) - vz(b));
      const camPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
      const fog = scene.fog;
      // set uniform global program mesh
      const M = this.progMesh;
      gl.useProgram(M.p);
      const u = M.u;
      gl.uniformMatrix4fv(u.uView, false, view.elements);
      gl.uniformMatrix4fv(u.uProj, false, proj.elements);
      gl.uniform3f(u.uCamPos, camPos.x, camPos.y, camPos.z);
      const h = lights.hemi;
      if (h) {
        gl.uniform3f(
          u.uHemiSky,
          h.color.r * h.intensity,
          h.color.g * h.intensity,
          h.color.b * h.intensity,
        );
        gl.uniform3f(
          u.uHemiGround,
          h.groundColor.r * h.intensity,
          h.groundColor.g * h.intensity,
          h.groundColor.b * h.intensity,
        );
      }
      const dd = new Float32Array(6),
        dc = new Float32Array(6);
      lights.dirs.slice(0, 2).forEach((l, i) => {
        const p = new Vector3()
          .setFromMatrixPosition(l.matrixWorld)
          .sub(new Vector3().setFromMatrixPosition(l.target.matrixWorld))
          .normalize();
        dd.set([p.x, p.y, p.z], i * 3);
        dc.set([l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity], i * 3);
      });
      gl.uniform3fv(u.uDirDir, dd);
      gl.uniform3fv(u.uDirColor, dc);
      const np = Math.min(10, lights.points.length),
        pp = new Float32Array(30),
        pc = new Float32Array(30),
        pd = new Float32Array(10),
        pk = new Float32Array(10);
      lights.points.slice(0, 10).forEach((l, i) => {
        const p = new Vector3().setFromMatrixPosition(l.matrixWorld);
        pp.set([p.x, p.y, p.z], i * 3);
        pc.set([l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity], i * 3);
        pd[i] = l.distance;
        pk[i] = l.decay;
      });
      gl.uniform1i(u.uNumPoint, np);
      gl.uniform3fv(u.uPointPos, pp);
      gl.uniform3fv(u.uPointColor, pc);
      gl.uniform1fv(u.uPointDist, pd);
      gl.uniform1fv(u.uPointDecay, pk);
      if (fog) {
        gl.uniform3f(u.uFogColor, fog.color.r, fog.color.g, fog.color.b);
        gl.uniform1f(u.uFogNear, fog.near);
        gl.uniform1f(u.uFogFar, fog.far);
      }
      gl.uniform1i(u.uShadowOn, shadowOn);
      if (shadowOn) {
        const b = new Matrix4();
        b.elements.set([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
        const sm = new Matrix4().multiplyMatrices(b, lightVP);
        gl.uniformMatrix4fv(u.uShadowMat, false, sm.elements);
        gl.uniform1f(u.uShadowBias, sun.shadow.bias);
        gl.uniform1f(u.uNormalBias, sun.shadow.normalBias);
        gl.uniform2f(u.uShadowTexel, 1 / this.shadowSize, 1 / this.shadowSize);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      } else {
        gl.uniformMatrix4fv(u.uShadowMat, false, new Matrix4().elements);
        gl.uniform1f(u.uNormalBias, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._dummyShadow());
      }
      gl.uniform1i(u.uShadowMap, 1);
      gl.uniform1i(u.uMap, 0);
      let current = null,
        lastMat = null;
      const use = (P) => {
        if (current !== P) {
          gl.useProgram(P.p);
          current = P;
          lastMat = null;
        }
      };
      const drawObj = (o) => {
        const m = o.material;
        if (m.isShaderMaterial) {
          const P = this._customProg(m);
          use(P);
          this._state(m);
          const mv = new Matrix4().multiplyMatrices(view, o.matrixWorld);
          if (P.u.modelViewMatrix) gl.uniformMatrix4fv(P.u.modelViewMatrix, false, mv.elements);
          if (P.u.projectionMatrix) gl.uniformMatrix4fv(P.u.projectionMatrix, false, proj.elements);
          if (P.u.modelMatrix) gl.uniformMatrix4fv(P.u.modelMatrix, false, o.matrixWorld.elements);
          if (P.u.viewMatrix) gl.uniformMatrix4fv(P.u.viewMatrix, false, view.elements);
          for (const [k, v] of Object.entries(m.uniforms)) {
            const loc = P.u[k];
            if (!loc) continue;
            const val = v.value;
            if (val instanceof Color) gl.uniform3f(loc, val.r, val.g, val.b);
            else gl.uniform1f(loc, val);
          }
          gl.bindVertexArray(this._vao(o, o.geometry, P, true));
          this._draw(o, o.geometry, o.isPoints ? gl.POINTS : gl.TRIANGLES);
          lastMat = null;
          current = null;
          return;
        }
        if (o.isSprite) {
          const P = this.progSprite;
          use(P);
          this._state(m);
          const p = new Vector3().setFromMatrixPosition(o.matrixWorld);
          gl.uniformMatrix4fv(P.u.uView, false, view.elements);
          gl.uniformMatrix4fv(P.u.uProj, false, proj.elements);
          gl.uniform3f(P.u.uCenter, p.x, p.y, p.z);
          gl.uniform2f(P.u.uScale, o.scale.x, o.scale.y);
          gl.uniform3f(P.u.uColor, m.color.r, m.color.g, m.color.b);
          gl.uniform1f(P.u.uOpacity, m.opacity);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this._texture(m.map));
          gl.uniform1i(P.u.uMap, 0);
          gl.bindVertexArray(this._vao(o, this.spriteGeo, P, false));
          this._draw(o, this.spriteGeo, gl.TRIANGLES);
          return;
        }
        if (o.isPoints) {
          const P = this.progPoints;
          use(P);
          this._state(m);
          gl.uniformMatrix4fv(P.u.uModel, false, o.matrixWorld.elements);
          gl.uniformMatrix4fv(P.u.uView, false, view.elements);
          gl.uniformMatrix4fv(P.u.uProj, false, proj.elements);
          gl.uniform1f(P.u.uSize, m.size * this.pixelRatio);
          gl.uniform3f(P.u.uColor, m.color.r, m.color.g, m.color.b);
          gl.uniform1f(P.u.uOpacity, m.opacity);
          gl.bindVertexArray(this._vao(o, o.geometry, P, false));
          this._draw(o, o.geometry, gl.POINTS);
          return;
        }
        use(M);
        if (lastMat !== m) {
          this._state(m);
          lastMat = m;
          gl.uniform3f(u.uColor, m.color.r, m.color.g, m.color.b);
          gl.uniform1f(u.uOpacity, m.opacity);
          const ei = m.emissiveIntensity;
          gl.uniform3f(u.uEmissive, m.emissive.r * ei, m.emissive.g * ei, m.emissive.b * ei);
          gl.uniform1f(u.uRoughness, m.roughness);
          gl.uniform1f(u.uMetalness, m.metalness);
          gl.uniform1f(u.uAlphaTest, m.alphaTest);
          gl.uniform1i(u.uLit, m.lit);
          gl.uniform1i(u.uFlat, m.flatShading);
          gl.uniform1i(u.uFog, m.fog && !!fog);
          gl.uniform1i(u.uDouble, m.side === DoubleSide);
          gl.uniform1i(u.uHasMap, !!m.map);
          gl.uniform1i(u.uHasEmissiveMap, !!m.emissiveMap);
          gl.activeTexture(gl.TEXTURE0);
          if (m.map) {
            gl.bindTexture(gl.TEXTURE_2D, this._texture(m.map));
            gl.uniform2f(u.uRepeat, m.map.repeat.x, m.map.repeat.y);
          } else {
            gl.bindTexture(gl.TEXTURE_2D, this._whiteTex());
            gl.uniform2f(u.uRepeat, 1, 1);
          }
        }
        gl.uniformMatrix4fv(u.uModel, false, o.matrixWorld.elements);
        gl.uniformMatrix3fv(u.uNormalMat, false, normalMatrix3(o.matrixWorld, this._nm));
        gl.uniform1i(u.uReceiveShadow, o.receiveShadow);
        gl.bindVertexArray(this._vao(o, o.geometry, M, false));
        this._draw(o, o.geometry, gl.TRIANGLES);
      };
      gl.useProgram(M.p);
      current = M;
      for (const o of opaque) drawObj(o);
      for (const o of transp) drawObj(o);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      // resolve MSAA
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.sceneFbo);
      gl.blitFramebuffer(0, 0, T.W, T.H, 0, 0, T.W, T.H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      // --- bloom ---
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.emptyVAO);
      const quad = (fbo, w, h) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      const B = this.progBright;
      gl.useProgram(B.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, T.sceneTex);
      gl.uniform1i(B.u.uTex, 0);
      gl.uniform1f(B.u.uThreshold, this.bloom.threshold);
      quad(T.brightFbo, T.sizes[0][0], T.sizes[0][1]);
      const L = this.progBlur;
      gl.useProgram(L.p);
      gl.uniform1i(L.u.uTex, 0);
      const kern = [3, 5, 7, 9, 11];
      let input = T.brightTex;
      for (let i = 0; i < 5; i++) {
        const [w, h] = T.sizes[i];
        gl.uniform2f(L.u.uInvSize, 1 / w, 1 / h);
        gl.uniform1i(L.u.uRadius, kern[i]);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.uniform2f(L.u.uDir, 1, 0);
        quad(T.fA[i], w, h);
        gl.bindTexture(gl.TEXTURE_2D, T.bA[i]);
        gl.uniform2f(L.u.uDir, 0, 1);
        quad(T.fB[i], w, h);
        input = T.bB[i];
      }
      // --- komposit + tone mapping ACES + sRGB ---
      const F = this.progFinal;
      gl.useProgram(F.p);
      const texs = [T.sceneTex, ...T.bB];
      ["uScene", "uB0", "uB1", "uB2", "uB3", "uB4"].forEach((n, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, texs[i]);
        gl.uniform1i(F.u[n], i);
      });
      gl.uniform1f(F.u.uStrength, this.bloom.strength);
      gl.uniform1f(F.u.uRadius, this.bloom.radius);
      gl.uniform1f(F.u.uExposure, this.toneMappingExposure);
      quad(null, T.W, T.H);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
    }
    _whiteTex() {
      if (this._white) return this._white;
      const gl = this.gl,
        t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255]),
      );
      return (this._white = t);
    }
    _dummyShadow() {
      if (this._dummy) return this._dummy;
      const gl = this.gl,
        t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 1, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return (this._dummy = t);
    }
  }

  /* ---------------- orbit controls ---------------- */
  /**
   * Kontrol kamera orbit: seret = putar, scroll/cubit = zoom.
   * Posisi kamera disimpan dalam koordinat bola (radius, theta, phi) mengelilingi target.
   * Mendukung damping (gerak melambat halus) dan putar otomatis 360 derajat.
   */
  class OrbitControls {
    constructor(camera, el) {
      this.camera = camera;
      this.el = el;
      this.target = new Vector3();
      this.enableDamping = false;
      this.dampingFactor = 0.05;
      this.autoRotate = false;
      this.autoRotateSpeed = 2;
      this.minDistance = 0;
      this.maxDistance = Infinity;
      this.minPolarAngle = 0;
      this.maxPolarAngle = Math.PI;
      this.enablePan = true;
      this.dTheta = 0;
      this.dPhi = 0;
      this.scale = 1;
      this.state = 0;
      this.listeners = {};
      this.pointers = new Map();
      this.pinch0 = 0;
      el.addEventListener("pointerdown", (e) => this._down(e));
      el.addEventListener("pointermove", (e) => this._move(e));
      el.addEventListener("pointerup", (e) => this._up(e));
      el.addEventListener("pointercancel", (e) => this._up(e));
      el.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          this._emit("start");
          if (e.deltaY < 0) this.scale *= 0.95;
          else if (e.deltaY > 0) this.scale /= 0.95;
          this._emit("end");
        },
        { passive: false },
      );
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    addEventListener(t, f) {
      (this.listeners[t] = this.listeners[t] || []).push(f);
    }
    _emit(t) {
      (this.listeners[t] || []).forEach((f) => f({ type: t }));
    }
    _down(e) {
      this.el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.state = 1;
        this._emit("start");
      } else if (this.pointers.size === 2) {
        this.state = 2;
        this.pinch0 = this._pinchDist();
      }
    }
    _pinchDist() {
      const p = [...this.pointers.values()];
      return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
    _move(e) {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x,
        dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.state === 1) {
        const h = this.el.clientHeight || 1;
        this.dTheta -= (TAU * dx) / h;
        this.dPhi -= (TAU * dy) / h;
      } else if (this.state === 2 && this.pointers.size === 2) {
        const d = this._pinchDist();
        if (this.pinch0 > 0 && d > 0) this.scale /= d / this.pinch0;
        this.pinch0 = d;
      }
    }
    _up(e) {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        this.state = 0;
        this._emit("end");
      } else if (this.pointers.size === 1) this.state = 1;
    }
    /** Hitung posisi kamera baru dari input + putar otomatis; panggil setiap frame. */
    update() {
      const off = new Vector3().subVectors(this.camera.position, this.target);
      let r = off.length();
      let theta = Math.atan2(off.x, off.z),
        phi = Math.acos(Math.max(-1, Math.min(1, off.y / (r || 1))));
      if (this.autoRotate && this.state === 0)
        this.dTheta -= (TAU / 60 / 60) * this.autoRotateSpeed;
      if (this.enableDamping) {
        theta += this.dTheta * this.dampingFactor;
        phi += this.dPhi * this.dampingFactor;
      } else {
        theta += this.dTheta;
        phi += this.dPhi;
      }
      phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, phi));
      phi = Math.max(1e-6, Math.min(Math.PI - 1e-6, phi));
      r = Math.max(this.minDistance, Math.min(this.maxDistance, r * this.scale));
      off.set(
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.cos(theta),
      );
      this.camera.position.copy(this.target).add(off);
      this.camera.lookAt(this.target);
      if (this.enableDamping) {
        this.dTheta *= 1 - this.dampingFactor;
        this.dPhi *= 1 - this.dampingFactor;
      } else {
        this.dTheta = 0;
        this.dPhi = 0;
      }
      this.scale = 1;
    }
  }

  return {
    Vector2,
    Vector3,
    Color,
    Euler,
    Quaternion,
    Matrix4,
    Object3D,
    Group,
    Scene,
    Mesh,
    Points,
    Sprite,
    InstancedMesh,
    PerspectiveCamera,
    HemisphereLight,
    DirectionalLight,
    PointLight,
    Fog,
    BufferAttribute,
    Float32BufferAttribute,
    BufferGeometry,
    PlaneGeometry,
    CircleGeometry,
    RingGeometry,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    TorusGeometry,
    IcosahedronGeometry,
    RoundedBoxGeometry,
    Path,
    Shape,
    ExtrudeGeometry,
    CanvasTexture,
    MeshStandardMaterial,
    MeshBasicMaterial,
    SpriteMaterial,
    PointsMaterial,
    ShaderMaterial,
    MathUtils,
    Clock,
    WebGLRenderer,
    OrbitControls,
    FrontSide,
    BackSide,
    DoubleSide,
    NormalBlending,
    AdditiveBlending,
    RepeatWrapping,
    ClampToEdgeWrapping,
    SRGBColorSpace,
    ACESFilmicToneMapping,
    PCFSoftShadowMap,
  };
})();
