(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const canvas = $("mood-preview");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const prompt = $("mood-prompt"), motionSelect = $("mood-motion");
  const generate = $("mood-generate"), status = $("mood-status"), tools = $("mood-tools");
  const playButton = $("mood-play"), speedInput = $("mood-speed"), brightnessInput = $("mood-brightness");
  let scene = null, playing = true, raf = 0, startAt = 0, lastFrame = 0;
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function parseModelContent(raw) {
    const text = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const first = text.indexOf("{"), last = text.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("AI 返回格式不正确，请重试。");
    const data = JSON.parse(text.slice(first, last + 1));
    if (!data.palette || !Array.isArray(data.rows) || data.rows.length !== 32) throw new Error("像素画数据不完整，请重新生成。");
    const palette = {};
    for (const [key, value] of Object.entries(data.palette)) {
      if (/^[0-9A-Za-z]$/.test(key) && /^#[0-9a-f]{6}$/i.test(value)) palette[key] = value;
    }
    if (!palette["0"]) palette["0"] = "#000000";
    const rows = data.rows.map(row => String(row));
    if (rows.some(row => row.length !== 32 || [...row].some(ch => !(ch in palette)))) throw new Error("像素行数据有误，请重新生成。");
    const allowed = ["breathing", "flow", "twinkle", "static"];
    const type = allowed.includes(data.animation?.type) ? data.animation.type : "breathing";
    const periodMs = Math.max(5000, Math.min(12000, Number(data.animation?.periodMs) || 7000));
    const minBrightness = Math.max(10, Math.min(25, Number(data.animation?.minBrightness) || 18));
    const maxBrightness = Math.max(minBrightness + 5, Math.min(45, Number(data.animation?.maxBrightness) || 38));
    return { name: String(data.name || "我的情绪灯").slice(0, 30), emotion: String(data.emotion || "").slice(0, 30), palette, rows, animation: { type, periodMs, minBrightness, maxBrightness } };
  }

  function draw(timestamp = 0) {
    if (!scene) return;
    if (!startAt) startAt = timestamp;
    const a = scene.animation, t = ((timestamp - startAt) / (a.periodMs * (100 / Number(speedInput.value)))) % 1;
    const base = Number(brightnessInput.value) / 100;
    let alpha = base;
    if (a.type === "breathing") {
      const wave = (1 - Math.cos(t * Math.PI * 2)) / 2;
      alpha = (a.minBrightness + (a.maxBrightness - a.minBrightness) * wave) / 100 * (base / .38);
    }
    ctx.clearRect(0, 0, 320, 320);
    ctx.fillStyle = "#101027"; ctx.fillRect(0, 0, 320, 320);
    const cell = 10;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const key = scene.rows[y][x], color = scene.palette[key] || "#000000";
      if (key === "0" || color === "#000000") continue;
      let localAlpha = alpha;
      let dx = 0, dy = 0;
      if (a.type === "flow") {
        const wave = Math.sin(t * Math.PI * 2 + (x + y) * .16);
        localAlpha *= .82 + wave * .13;
        dx = Math.sin(t * Math.PI * 2 + y * .12) * .45;
      } else if (a.type === "twinkle") {
        const sparse = ((x * 17 + y * 31) % 23) === 0;
        if (sparse) localAlpha *= .55 + .45 * ((1 - Math.cos(t * Math.PI * 2 + x)) / 2);
      }
      ctx.globalAlpha = Math.max(.08, Math.min(.75, localAlpha));
      ctx.fillStyle = color;
      ctx.fillRect(x * cell + dx, y * cell + dy, cell - .7, cell - .7);
    }
    ctx.globalAlpha = 1;
    if (playing && a.type !== "static" && !reducedMotion) raf = requestAnimationFrame(draw);
  }

  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function play() {
    stop(); playing = true; playButton.textContent = "暂停";
    startAt = 0; if (scene) { if (scene.animation.type === "static" || reducedMotion) draw(1); else raf = requestAnimationFrame(draw); }
  }
  function pause() { playing = false; stop(); playButton.textContent = "播放"; }
  function showScene(next) {
    scene = next; tools.hidden = false; playButton.disabled = next.animation.type === "static";
    status.textContent = `${next.name} · ${next.emotion} · ${({ breathing:"柔和呼吸", flow:"缓慢流动", twinkle:"微光闪烁", static:"静态微光" })[next.animation.type]}`;
    play();
  }

  generate.addEventListener("click", async () => {
    const text = prompt.value.trim();
    if (!text) { status.textContent = "先写一句此刻的感受吧。"; prompt.focus(); return; }
    generate.disabled = true; status.textContent = "AI 正在理解你的心情并创作像素灯…";
    try {
      const response = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mood", prompt: text, motion: motionSelect.value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `请求失败（${response.status}）`);
      showScene(parseModelContent(result.content));
    } catch (error) {
      status.textContent = `生成失败：${error.message || "请稍后重试"}`;
    } finally { generate.disabled = false; }
  });
  playButton.addEventListener("click", () => playing ? pause() : play());
  speedInput.addEventListener("input", () => { if (playing) play(); });
  brightnessInput.addEventListener("input", () => { if (scene) { if (playing) play(); else draw(1); } });
  $("mood-apply").addEventListener("click", () => {
    if (!scene) return;
    window.dispatchEvent(new CustomEvent("pixel-mood-apply", { detail: { palette: scene.palette, rows: scene.rows } }));
    status.textContent = "已将情绪画面应用到主画布。";
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (playing && scene && scene.animation.type !== "static" && !reducedMotion) raf = requestAnimationFrame(draw); });
  // Initial calm placeholder keeps the panel useful before the first AI request.
  ctx.fillStyle = "#101027"; ctx.fillRect(0, 0, 320, 320);
  ctx.fillStyle = "#d9cda7"; ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(165, 135, 48, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(185, 115, 43, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
})();
