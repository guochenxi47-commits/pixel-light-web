// ===== 数据：16×16 = 256 个像素，每个是一个颜色字符串（后面几步都用它） =====
  let SIZE = 32;                        // 当前分辨率，可在页面顶部切换 16 / 32
  const EMPTY = "";                      // 空字符串表示灯是灭的
  let pixels = new Array(SIZE * SIZE).fill(EMPTY);

  // ===== 画面：按当前分辨率生成圆点 =====
  const grid = document.getElementById("grid");
  const dots = [];
  function buildGrid() {
    grid.innerHTML = "";
    dots.length = 0;
    grid.style.gridTemplateColumns = "repeat(" + SIZE + ", 1fr)";
    grid.style.gridTemplateRows = "repeat(" + SIZE + ", 1fr)";
    grid.style.gap = SIZE > 16 ? "1px" : "3px";
    grid.setAttribute("aria-label", SIZE + "乘" + SIZE + "的像素画预览");
    for (let i = 0; i < SIZE * SIZE; i++) {
      const d = document.createElement("div");
      d.className = "dot";
      grid.appendChild(d);
      dots.push(d);
    }
  }
  buildGrid();

  // 把 pixels 数组画到屏幕上
  function render() {
    for (let i = 0; i < pixels.length; i++) {
      dots[i].style.background = pixels[i] || "";   // 空则用默认的暗色
    }
  }

  // ===== 先放一个示例爱心，避免一开始是空白 =====
  const heart = [
    "0000000000000000",
    "0000000000000000",
    "0011100001110000",
    "0111110011111000",
    "1111111111111100",
    "1111111111111100",
    "1111111111111100",
    "0111111111111000",
    "0011111111110000",
    "0001111111100000",
    "0000111111000000",
    "0000011110000000",
    "0000001100000000",
    "0000000000000000",
    "0000000000000000",
    "0000000000000000",
  ];
  function drawHeart() {                              // 把 16×16 的爱心按比例放大到当前分辨率
    pixels = new Array(SIZE * SIZE).fill(EMPTY);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (heart[Math.floor(y * 16 / SIZE)][Math.floor(x * 16 / SIZE)] === "1") {
          pixels[y * SIZE + x] = "#ff6fb5";
        }
      }
    }
    render();
  }
  drawHeart();

  const tip = document.getElementById("tip");
  const hexinfo = document.getElementById("hexinfo");

  // ===== 工具：颜色格式转换 =====
  const toHexColor = ([r, g, b]) =>
    "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");

  // ===== 颜色量化（中位切分）：把几千种颜色合并成最多 n 种 =====
  function quantize(colors, n) {
    let boxes = [colors.map((_, i) => i)];          // 每个盒子里存像素编号
    const range = (box, ch) => {
      let lo = 255, hi = 0;
      for (const i of box) { lo = Math.min(lo, colors[i][ch]); hi = Math.max(hi, colors[i][ch]); }
      return hi - lo;
    };
    while (boxes.length < n) {
      // 找到颜色跨度最大的盒子
      let best = -1, bestCh = 0, bestRange = 0;
      boxes.forEach((box, bi) => {
        if (box.length < 2) return;
        for (let ch = 0; ch < 3; ch++) {
          const r = range(box, ch);
          if (r > bestRange) { bestRange = r; best = bi; bestCh = ch; }
        }
      });
      if (best < 0 || bestRange === 0) break;        // 没法再分了
      const box = boxes[best].sort((a, b) => colors[a][bestCh] - colors[b][bestCh]);
      const mid = box.length >> 1;
      boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
    }
    // 每个盒子取平均色，得到调色板
    const palette = boxes.map(box => {
      const sum = [0, 0, 0];
      for (const i of box) for (let ch = 0; ch < 3; ch++) sum[ch] += colors[i][ch];
      return sum.map(v => Math.round(v / box.length));
    });
    // 每个像素换成最近的调色板颜色
    return colors.map(c => {
      let bestP = palette[0], bestD = Infinity;
      for (const p of palette) {
        const d = (c[0]-p[0])**2 + (c[1]-p[1])**2 + (c[2]-p[2])**2;
        if (d < bestD) { bestD = d; bestP = p; }
      }
      return bestP;
    });
  }

  // ===== 核心：图片 → 16×16 像素 =====
  let sourceImg = null;
  const work = document.createElement("canvas");     // 看不见的小画布，只用来缩小图片
  work.width = SIZE; work.height = SIZE;
  const wctx = work.getContext("2d", { willReadFrequently: true });

  function convert() {
    if (!sourceImg) return;
    const w = sourceImg.naturalWidth, h = sourceImg.naturalHeight;
    const s = Math.min(w, h);                        // 居中裁成正方形
    const sx = (w - s) / 2, sy = (h - s) / 2;
    wctx.fillStyle = "#000";                         // 透明背景当作黑色（灯灭）
    wctx.fillRect(0, 0, SIZE, SIZE);
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = "high";
    wctx.drawImage(sourceImg, sx, sy, s, s, 0, 0, SIZE, SIZE);

    const data = wctx.getImageData(0, 0, SIZE, SIZE).data;
    const colors = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      colors.push([data[i*4], data[i*4+1], data[i*4+2]]);
    }
    const f = 1 + parseInt(document.getElementById("contrast").value, 10) / 60;   // 对比度系数 1 ~ 2.7
    const adj = colors.map(c => c.map(v => Math.max(0, Math.min(255, Math.round((v - 128) * f + 128)))));
    const n = parseInt(document.getElementById("colors").value, 10);
    const result = quantize(adj, n);
    // 接近纯黑的像素视为灯灭
    pixels = result.map(c => (c[0] + c[1] + c[2] < 30 ? EMPTY : toHexColor(c)));
    render();
    showHex();
  }

  // ===== 导出：256 个像素 → 1536 位十六进制字符串（第 4 步发给 ESP32 用） =====
  function toHex() {
    return pixels.map(c => (c ? c.slice(1) : "000000")).join("").toUpperCase();
  }
  function showHex() {
    const hex = toHex();
    hexinfo.textContent = "数据长度 " + hex.length + "（应为 " + SIZE * SIZE * 6 + "）";
    console.log(hex);                                // F12 控制台里能看到完整数据
  }

  // ===== 按钮 =====
  const fileInput = document.getElementById("file");
  document.getElementById("btn-upload").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      if (drawMode) setDrawMode(false);
      pushUndo();                                    // 上传前存一份，可以撤销回去
      sourceImg = img;
      document.getElementById("controls").hidden = false;
      tip.textContent = "拖动滑块，调整颜色数量";
      convert();
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => { tip.textContent = "这张图片打不开，换一张试试"; };
    img.src = URL.createObjectURL(file);
    fileInput.value = "";                            // 允许重复选同一张图
  });

  const slider = document.getElementById("colors");
  slider.addEventListener("input", () => {
    document.getElementById("colorsVal").textContent = slider.value;
    convert();
  });

  // ===================== 第 3 步：手绘编辑器 =====================
  const PALETTE = [
    "#ff6fb5", "#ff4d4d", "#ff9f43", "#ffd93d", "#7cf0c8", "#2ecc71",
    "#4dabf7", "#5c6cff", "#b9a8ff", "#ffffff", "#a0a0a0", "#8b5a2b",
  ];
  let current = PALETTE[0];          // 当前画笔颜色
  let tool = "paint";                // "paint" 画笔 或 "erase" 橡皮擦
  let drawMode = false;              // 是否处于手绘模式
  let drawing = false;               // 手指/鼠标是否正按着在画
  const undoStack = [];              // 撤销用：每次动笔前存一份 pixels

  const paintBox = document.getElementById("paint");
  const palette = document.getElementById("palette");
  const customInput = document.getElementById("custom");
  const btnDraw = document.getElementById("btn-draw");
  const btnErase = document.getElementById("btn-erase");

  // 生成 12 个颜色按钮
  PALETTE.forEach(c => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = c;
    b.setAttribute("aria-label", "颜色 " + c);
    b.addEventListener("click", () => setColor(c));
    palette.appendChild(b);
  });

  function setColor(c) {
    current = c;
    tool = "paint";
    customInput.value = c;
    refreshToolUI();
  }
  function refreshToolUI() {
    btnErase.classList.toggle("on", tool === "erase");
    [...palette.children].forEach((b, i) =>
      b.classList.toggle("on", tool === "paint" && PALETTE[i] === current));
  }

  function pushUndo() {
    undoStack.push(pixels.slice());
    if (undoStack.length > 50) undoStack.shift();    // 最多记 50 步
  }

  // 进入 / 退出手绘模式
  function setDrawMode(on) {
    drawMode = on;
    paintBox.hidden = !on;
    grid.classList.toggle("drawing", on);
    btnDraw.textContent = on ? "完成" : "手绘";
    if (on) {
      document.getElementById("controls").hidden = true;   // 手绘时先收起颜色滑块
      tip.textContent = "点击或拖动格子上色";
      refreshToolUI();
    } else {
      tip.textContent = "已保存，可以继续上传或手绘";
    }
  }
  btnDraw.addEventListener("click", () => setDrawMode(!drawMode));

  // 手指/鼠标位置 → 第几个格子
  function cellAt(e) {
    const r = grid.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * SIZE);
    const y = Math.floor((e.clientY - r.top) / r.height * SIZE);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return -1;
    return y * SIZE + x;
  }
  function paintAt(e) {
    const i = cellAt(e);
    if (i < 0) return;
    const value = tool === "erase" ? EMPTY : current;
    if (pixels[i] !== value) {
      pixels[i] = value;
      dots[i].style.background = value || "";
    }
  }

  grid.addEventListener("pointerdown", e => {
    if (!drawMode) return;
    e.preventDefault();
    if (sourceImg) {                 // 一旦手动改图，颜色滑块就不再起作用，避免把画好的内容覆盖掉
      sourceImg = null;
    }
    pushUndo();
    drawing = true;
    grid.setPointerCapture(e.pointerId);
    paintAt(e);
  });
  grid.addEventListener("pointermove", e => { if (drawing) paintAt(e); });
  const stopDrawing = () => { if (drawing) { drawing = false; showHex(); } };
  grid.addEventListener("pointerup", stopDrawing);
  grid.addEventListener("pointercancel", stopDrawing);

  // 工具按钮
  customInput.addEventListener("input", () => setColor(customInput.value));
  btnErase.addEventListener("click", () => {
    tool = tool === "erase" ? "paint" : "erase";
    refreshToolUI();
  });
  document.getElementById("btn-undo").addEventListener("click", () => {
    if (!undoStack.length) { tip.textContent = "没有可以撤销的操作了"; return; }
    pixels = undoStack.pop();
    render();
    showHex();
  });
  document.getElementById("btn-clear").addEventListener("click", () => {
    pushUndo();
    pixels = new Array(SIZE * SIZE).fill(EMPTY);
    render();
    showHex();
  });

  // ===================== 第 4 步：发送到画框 =====================
  const ipInput = document.getElementById("ip");
  const demoBox = document.getElementById("demo");
  const btnSend = document.getElementById("btn-send");
  const expectedLen = () => SIZE * SIZE * 6;         // 每个像素 6 位十六进制

  // 记住 IP 和演示模式（localStorage 在某些浏览器里可能被禁用，所以包一层保护）
  function loadSetting(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function saveSetting(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 存不了就算了，不影响使用 */ }
  }
  ipInput.value = loadSetting("frameIp", "");
  demoBox.checked = loadSetting("frameDemo", "1") === "1";
  ipInput.addEventListener("input", () => saveSetting("frameIp", ipInput.value.trim()));
  demoBox.addEventListener("change", () => saveSetting("frameDemo", demoBox.checked ? "1" : "0"));

  // 把用户输入整理成 http://IP:端口，兼容 "192.168.1.50"、"http://192.168.1.50/" 等写法
  function buildUrl(raw) {
    let host = raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (!host) return null;
    return "http://" + host + "/upload";
  }

  function setStatus(text, kind) {
    tip.textContent = text;
    tip.className = kind || "";
  }

  btnSend.addEventListener("click", async () => {
    const hex = toHex();
    if (hex.length !== expectedLen()) {               // 数据长度不对就不发，避免把灯板搞乱
      setStatus("数据长度不对（" + hex.length + "），已取消发送", "err");
      return;
    }

    // ---- 演示模式：不联网，只打印并假装成功 ----
    if (demoBox.checked) {
      btnSend.disabled = true;
      setStatus("演示模式：正在“发送”…", "");
      console.log("[演示] 将发送到 /upload，长度 " + hex.length + "：\n" + hex);
      await new Promise(r => setTimeout(r, 600));
      setStatus("演示模式：发送成功（数据已打印在控制台）", "ok");
      btnSend.disabled = false;
      return;
    }

    // ---- 真实模式：POST 到 ESP32 ----
    const url = buildUrl(ipInput.value);
    if (!url) {
      setStatus("请先在顶部填写画框的 IP 地址", "err");
      ipInput.focus();
      return;
    }

    btnSend.disabled = true;
    setStatus("正在发送到 " + url + " …", "");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);   // 5 秒没反应就放弃
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },        // 用纯文本，浏览器不会先发预检请求，ESP32 更好处理
        body: hex,
        signal: ctrl.signal,
      });
      if (res.ok) {
        setStatus("发送成功，画框已更新", "ok");
      } else {
        setStatus("画框收到了，但返回了错误（状态码 " + res.status + "）", "err");
      }
    } catch (e) {
      if (e.name === "AbortError") {
        setStatus("5 秒没有响应：检查 IP 是否正确、手机和画框是否在同一个 WiFi", "err");
      } else {
        setStatus("发送失败：检查 IP、WiFi，以及画框是否已通电并联网", "err");
      }
      console.error("发送失败：", e);
    } finally {
      clearTimeout(timer);
      btnSend.disabled = false;
    }
  });

  // ===================== 分辨率切换（16 / 32） =====================
  function setSize(n) {
    if (n === SIZE) return;
    SIZE = n;
    work.width = n; work.height = n;                  // 缩小用的小画布也要跟着改
    undoStack.length = 0;
    buildGrid();
    if (sourceImg) { convert(); }                     // 有照片：用同一张照片按新分辨率重新转换
    else { drawHeart(); showHex(); }                  // 没有照片：重置为示例爱心
    document.getElementById("size16").classList.toggle("on", n === 16);
    document.getElementById("size32").classList.toggle("on", n === 32);
    setStatus(sourceImg ? "已切换到 " + n + "×" + n + "，同一张照片已重新转换" : "已切换到 " + n + "×" + n + "，画布已重置", "");
  }
  document.getElementById("size16").addEventListener("click", () => setSize(16));
  document.getElementById("size32").addEventListener("click", () => setSize(32));

  const contrastSlider = document.getElementById("contrast");
  contrastSlider.addEventListener("input", () => {
    document.getElementById("contrastVal").textContent = contrastSlider.value;
    convert();
  });

  // ===================== 第 6 步：AI 生成 =====================
  const aiBox = document.getElementById("ai");
  const aiPrompt = document.getElementById("ai-prompt");
  const aiGo = document.getElementById("ai-go");
  const aiDemo = document.getElementById("ai-demo");
  const aiBase = document.getElementById("ai-base");
  const aiModel = document.getElementById("ai-model");
  const aiKey = document.getElementById("ai-key");
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 记住接口地址和模型名；Key 只放在 sessionStorage（关闭标签页就清除）
  aiBase.value = loadSetting("aiBase", "");
  aiModel.value = loadSetting("aiModel", "");
  try { aiKey.value = sessionStorage.getItem("aiKey") || ""; } catch (e) {}
  aiDemo.checked = loadSetting("aiDemo", "1") === "1";
  aiBase.addEventListener("input", () => saveSetting("aiBase", aiBase.value.trim()));
  aiModel.addEventListener("input", () => saveSetting("aiModel", aiModel.value.trim()));
  aiKey.addEventListener("input", () => { try { sessionStorage.setItem("aiKey", aiKey.value.trim()); } catch (e) {} });
  aiDemo.addEventListener("change", () => saveSetting("aiDemo", aiDemo.checked ? "1" : "0"));

  const IDEAS = ["戴帽子的小猫", "一杯冒热气的咖啡", "害羞的小幽灵", "会笑的太阳", "吃西瓜的小熊",
                 "星空下的火箭", "一颗发光的爱心", "戴墨镜的仙人掌", "睡着的小月亮"];
  document.getElementById("ai-idea").addEventListener("click", () => {
    aiPrompt.value = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  });

  // ---- 离线演示用的内置示例（16×16，切到 32×32 时自动放大 2 倍） ----
  const DEMO_ART = [
    { keys: ["幽灵", "鬼", "ghost"],
      palette: { "0": "#000000", "1": "#f3efff", "2": "#5c6cff", "3": "#ff6fb5" },
      rows: ["0000000000000000","0000011111100000","0001111111111000","0011111111111100",
             "0111111111111110","0111221111221110","0111221111221110","0111111111111110",
             "0113311111133110","0111111111111110","0111111111111110","0111111111111110",
             "0111111111111110","0111011011101110","0110000110000110","0000000000000000"] },
    { keys: ["猫", "喵", "cat"],
      palette: { "0": "#000000", "1": "#ff9f43", "2": "#7cf0c8", "3": "#ff6fb5", "4": "#ffffff" },
      rows: ["0000000000000000","0110000000000110","0111000000001110","0111100000011110",
             "0111111111111110","0111111111111110","0112211111122110","0112211111122110",
             "0111111331111110","0111111111111110","0114111111114110","0111111111111110",
             "0011111111111100","0001111111111000","0000011111100000","0000000000000000"] },
    { keys: ["咖啡", "杯", "coffee"],
      palette: { "0": "#000000", "1": "#f3efff", "2": "#8b5a2b", "3": "#a59fcf" },
      rows: ["0000000000000000","0000030000300000","0000003000030000","0000030000300000",
             "0000000000000000","0011111111110000","0012222222210000","0012222222211110",
             "0012222222211010","0012222222211010","0012222222211110","0011222222110000",
             "0001111111100000","0000011111000000","0000000000000000","0000000000000000"] },
  ];
  function pickDemo(text) {
    const hit = DEMO_ART.find(a => a.keys.some(k => text.toLowerCase().includes(k)));
    return hit || DEMO_ART[Math.floor(Math.random() * DEMO_ART.length)];
  }

  // ---- 把 {palette, rows} 画到当前分辨率的画布上（尺寸不同会自动缩放） ----
  function applyArt(art) {
    const rows = art.rows;
    const h = rows.length;
    const w = Math.max(...rows.map(r => r.length));
    const next = new Array(SIZE * SIZE).fill(EMPTY);
    for (let y = 0; y < SIZE; y++) {
      const row = rows[Math.floor(y * h / SIZE)];
      for (let x = 0; x < SIZE; x++) {
        const col = art.palette[row[Math.floor(x * w / SIZE)]];
        next[y * SIZE + x] = (col && col.toLowerCase() !== "#000000") ? col.toLowerCase() : EMPTY;
      }
    }
    pushUndo();
    sourceImg = null;                                   // AI 图不再受颜色滑块影响
    document.getElementById("controls").hidden = true;
    pixels = next;
    render();
    showHex();
  }

  // ---- 校验并修补模型返回的内容 ----
  function parseArt(text, N) {
    const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("返回内容里没有找到 JSON");
    const obj = JSON.parse(t.slice(a, b + 1));
    if (!obj.palette || typeof obj.palette !== "object" || !Array.isArray(obj.rows)) {
      throw new Error("格式不对：缺少 palette 或 rows");
    }
    const palette = {};
    for (const k in obj.palette) {
      if (/^#[0-9a-f]{6}$/i.test(obj.palette[k])) palette[k] = obj.palette[k];
    }
    if (!Object.keys(palette).length) throw new Error("调色板里没有合法颜色");
    let rows = obj.rows.map(r => String(r));
    if (rows.length < N * 0.75 || rows.length > N * 1.25) {
      throw new Error("行数不对（" + rows.length + "，应为 " + N + "）");
    }
    rows = rows.slice(0, N);                            // 多了截断
    while (rows.length < N) rows.push("");              // 少了补空行
    rows = rows.map(r => r.slice(0, N).padEnd(N, "0")); // 每行补齐或截断到 N 个字符
    return { palette, rows };
  }

  // ---- 调用大模型（OpenAI 兼容的 /chat/completions） ----
  const SVG_SYSTEM =
    "You are an illustrator making tiny icons for a low-resolution LED matrix.\n" +
    "Reply with ONLY one complete SVG document, no markdown, no explanation.\n" +
    "Rules:\n" +
    '- Use viewBox="0 0 64 64". Draw on a transparent background (the LED matrix is black); do not add a background rectangle.\n' +
    "- Use only simple flat shapes (circle, ellipse, rect, polygon, path) with solid fills. No gradients, no filters, no text, no thin lines.\n" +
    "- Never use black or near-black for any feature (black means LED off). For dark details use dark blue, dark brown or dark purple, and keep them clearly visible.\n" +
    "- One centered subject filling about 80% of the canvas, drawn in its most recognisable view with its iconic features (for an animal: ears, snout, eyes, legs and tail).\n" +
    "- Use bright, saturated colors with strong contrast between neighbouring shapes.";

  // 把模型返回的 SVG 变成图片，交给第 2 步的“图片转像素”流程处理（颜色数量、对比度滑块也能用）
  function applySvg(text) {
    return new Promise((resolve, reject) => {
      const m = text.match(/<svg[\s\S]*<\/svg>/i);
      if (!m) return reject(new Error("返回内容里没有找到 SVG"));
      let svg = m[0].replace(/<script[\s\S]*?<\/script>/gi, "");
      svg = svg.replace(/<svg\b([^>]*)>/i, (all, attrs) => {
        attrs = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "");
        if (!/viewBox/i.test(attrs)) attrs += ' viewBox="0 0 64 64"';
        if (!/xmlns\s*=/i.test(attrs)) attrs += ' xmlns="http://www.w3.org/2000/svg"';
        return "<svg" + attrs + ' width="256" height="256">';
      });
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        pushUndo();
        sourceImg = img;
        document.getElementById("controls").hidden = false;
        convert();
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG 无法解析")); };
      img.src = url;
    });
  }

  function fatal(msg) { const e = new Error(msg); e.fatal = true; return e; }

  async function askModel(prompt, N, mode) {
    const base = aiBase.value.trim().replace(/\/+$/, "");
    const model = aiModel.value.trim();
    const key = aiKey.value.trim();
    if (!base || !model || !key) throw fatal("请先展开「接口设置」，填写接口地址、模型名和 API Key");

    const gridSystem =
      "You are a pixel artist designing for a " + N + "x" + N + " WS2812 LED matrix.\n" +
      "Reply with ONLY a JSON object, no markdown, no explanation, in exactly this shape:\n" +
      '{"palette":{"0":"#000000","1":"#rrggbb","2":"#rrggbb"},"rows":["...","..."]}\n' +
      "Rules:\n" +
      "- palette has at most 10 colors. Every key is a single character. Key \"0\" is always the background and must be #000000 (LED off).\n" +
      "- rows has exactly " + N + " strings, each exactly " + N + " characters long, using only palette keys.\n" +
      "- Draw one simple, bold, centered subject with a clear silhouette. Use bright, saturated colors that look good on LEDs. No text, no tiny details. Leave a 1-2 pixel margin.";

    const system = mode === "svg" ? SVG_SYSTEM : gridSystem;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const payload = {
        model: model,
        temperature: 0.7,
        max_tokens: 4000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Draw: " + prompt },
        ],
      };
      // DeepSeek 默认开启“思考模式”，会先想很久再回答，画像素图不需要，关掉可以快很多
      if (/deepseek/i.test(base)) payload.thinking = { type: "disabled" };

      const res = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.text()).slice(0, 120); } catch (e) {}
        throw fatal("接口返回 " + res.status + (res.status === 401 ? "（API Key 可能不对）" : "") + " " + detail);
      }
      const data = await res.json();
      return data.choices[0].message.content;
    } catch (e) {
      if (e.fatal) throw e;
      throw fatal(e.name === "AbortError"
        ? "120 秒没有响应，请检查网络后重试"
        : "网络请求失败：检查接口地址和网络；也可能是该接口不允许网页直接调用（跨域限制），这种情况需要一个小的转发服务");
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- 「生成」按钮 ----
  aiGo.addEventListener("click", async () => {
    const prompt = aiPrompt.value.trim();
    if (!prompt) {
      setStatus("先写一句想画什么，比如“戴帽子的小猫”", "err");
      aiPrompt.focus();
      return;
    }
    if (drawMode) setDrawMode(false);
    aiGo.disabled = true;
    try {
      if (aiDemo.checked) {                             // 离线演示：不联网
        setStatus("演示模式：正在“生成”…", "");
        await sleep(700);
        applyArt(pickDemo(prompt));
        setStatus("演示模式：这是内置示例图，不是 AI 生成的", "ok");
        return;
      }
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {  // 格式不对时最多重试 2 次
        const t0 = Date.now();
        const tick = setInterval(() => {                // 每秒更新一次已等待的时间
          setStatus("AI 正在画…（第 " + attempt + " 次尝试，已等待 " + Math.round((Date.now() - t0) / 1000) + " 秒）", "");
        }, 1000);
        setStatus("AI 正在画…（第 " + attempt + " 次尝试）", "");
        try {
          const mode = document.getElementById("ai-mode").value;
          const text = await askModel(prompt, SIZE, mode);
          if (mode === "svg") { await applySvg(text); } else { applyArt(parseArt(text, SIZE)); }
          setStatus("生成完成，可以手绘微调，或发送到画框", "ok");
          return;
        } catch (e) {
          lastErr = e;
          console.warn("第 " + attempt + " 次失败：", e);
          if (e.fatal) break;                           // 网络、Key 这类问题，重试没有用
        } finally {
          clearInterval(tick);
        }
      }
      throw lastErr;
    } catch (e) {
      setStatus("生成失败：" + e.message, "err");
      console.error(e);
    } finally {
      aiGo.disabled = false;
    }
  });
  aiPrompt.addEventListener("keydown", e => { if (e.key === "Enter") aiGo.click(); });

  // ---- 「AI 生成」按钮：打开 / 收起面板 ----
  document.getElementById("btn-ai").addEventListener("click", () => {
    if (drawMode) setDrawMode(false);
    aiBox.hidden = !aiBox.hidden;
    if (!aiBox.hidden) {
      setStatus("写一句想画什么，点「生成」", "");
      aiPrompt.focus();
    }
  });
  btnDraw.addEventListener("click", () => { if (drawMode) aiBox.hidden = true; });
