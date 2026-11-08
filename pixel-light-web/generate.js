function isCompleteMoodContent(choice) {
  const content = choice?.message?.content;
  if (choice?.finish_reason !== "stop" || typeof content !== "string" || !content.trim()) return false;

  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return false;
  }
  const palette = data?.palette;
  const rows = data?.rows;
  if (!palette || typeof palette !== "object" || Array.isArray(palette) ||
      !Array.isArray(rows) || rows.length !== 16) return false;
  const colors = Object.entries(palette);
  if (colors.length < 2 || colors.length > 6 || palette["0"] !== "#000000" ||
      colors.some(([key, color]) => !/^[0-9A-Za-z]$/.test(key) ||
        typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))) return false;

  return rows.every(row => typeof row === "string" && row.length === 16 &&
    [...row].every(key => Object.hasOwn(palette, key))) &&
    rows.some(row => [...row].some(key => palette[key] !== "#000000"));
}


/**
 * Cloudflare Pages Function: POST /api/generate
 * Required Pages secret: DEEPSEEK_API_KEY
 * Optional Pages variable: DEEPSEEK_MODEL (defaults to deepseek-flash)
 */
export async function onRequestPost({ request, env }) {
  if (!env.DEEPSEEK_API_KEY) {
    return Response.json({ error: "网站尚未配置 AI 服务，请联系管理员。" }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  // Mood-light generation returns a validated 16x16 scene plus animation metadata.
  if (body.type === "mood") {
    const motion = ["auto", "breathing", "flow", "twinkle", "static"].includes(body.motion) ? body.motion : "auto";
    if (!prompt || prompt.length > 240) {
      return Response.json({ error: "请填写1到240字的情绪描述。" }, { status: 400 });
    }
    const moodSystem = [
      "You design gentle, low-fatigue mood lamps for a 16x16 RGB LED pixel matrix.",
      "Return ONLY valid JSON, no markdown, in this exact schema:",
      '{"name":"short Chinese title","emotion":"short label","palette":{"0":"#000000","1":"#rrggbb"},"rows":[16 strings of 16 palette keys],"animation":{"type":"breathing|flow|twinkle|static","periodMs":6000,"minBrightness":18,"maxBrightness":38}}',
      "Use 2-6 palette colors. Palette key 0 must be #000000 (LED off). Rows must be exactly 16 rows, each exactly 16 characters, using only palette keys. Include at least one non-black pixel.",
      "Create a calm, tasteful, readable pixel-art scene inspired by the user's feelings. Avoid text, tiny noise, strobing, rapid motion, harsh saturated colors and flashing.",
      "Animation choices: breathing is slow global brightness breathing; flow is subtle slow color/position drift; twinkle is only a few sparse pixels gently brightening; static is no animation.",
      "Use periodMs 5000-12000, minBrightness 10-25, maxBrightness 25-45. Keep contrast gentle and leave dark negative space.",
      `Requested animation: ${motion === "auto" ? "choose the most suitable one" : motion}.`
    ].join("\n");
    const model = (typeof env.DEEPSEEK_MODEL === "string" && env.DEEPSEEK_MODEL.trim()) ? env.DEEPSEEK_MODEL.trim() : "deepseek-flash";
    try {
      const signal = AbortSignal.timeout(110000);
      for (let attempt = 0; attempt < 2; attempt++) {
        const upstream = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
          body: JSON.stringify({ model, temperature: 0.65, max_tokens: 5000, response_format: { type: "json_object" }, thinking: { type: "disabled" }, messages: [
            { role: "system", content: moodSystem },
            { role: "user", content: `Create a gentle mood-light scene for this feeling: ${prompt}` },
            ...(attempt === 0 ? [] : [{ role: "user", content: "Return a complete JSON scene with 16 rows of 16 defined palette keys and at least one non-black pixel." }])
          ] }), signal: signal
        });
        const result = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
          const message = upstream.status === 401 ? "AI 服务认证失败，请管理员检查云端密钥。" : upstream.status === 429 ? "AI 服务当前请求较多，请稍后重试。" : "AI 服务暂时不可用，请稍后重试。";
          return Response.json({ error: message }, { status: upstream.status === 429 ? 429 : 502 });
        }
        const choice = result?.choices?.[0];
        if (isCompleteMoodContent(choice)) {
          return Response.json({ content: choice.message.content }, { headers: { "Cache-Control": "no-store" } });
        }
      }
      return Response.json({ error: "AI 两次均未返回有效的16×16情绪灯方案，请重新生成。" }, { status: 502 });
    } catch {
      return Response.json({ error: "连接 AI 服务超时或失败，请稍后重试。" }, { status: 502 });
    }
  }
  const size = Number(body.size);
  const mode = body.mode === "grid" ? "grid" : "svg";
  if (!prompt || prompt.length > 60 || size !== 16) {
    return Response.json({ error: "请提供有效描述，并选择 16×16 分辨率。" }, { status: 400 });
  }

  const svgSystem = [
    "You are an illustrator making tiny icons for a low-resolution LED matrix.",
    "Reply with ONLY one complete SVG document, no markdown, no explanation.",
    'Use viewBox="0 0 64 64". Draw on a transparent background; do not add a background rectangle.',
    "Use only simple flat shapes (circle, ellipse, rect, polygon, path) with solid fills. No gradients, filters, text, or thin lines.",
    "Never use black or near-black for any feature (black means LED off). For dark details use dark blue, dark brown or dark purple.",
    "Draw one centered subject filling about 80% of the canvas, with a clear recognizable silhouette.",
    "Use bright, saturated colors with strong contrast between neighbouring shapes."
  ].join("\n");

  const gridSystem = [
    `You are a pixel artist designing for a ${size}x${size} WS2812 LED matrix.`,
    "Reply with ONLY a JSON object, no markdown, no explanation, in exactly this shape:",
    '{"palette":{"0":"#000000","1":"#rrggbb"},"rows":["..."]}',
    'palette has at most 10 colors. Every key is one character. Key "0" is always #000000 (LED off).',
    `rows has exactly ${size} strings, each exactly ${size} characters long, using only palette keys.`,
    "Draw one simple, bold, centered subject with a clear silhouette. Use bright saturated colors. No text or tiny details."
  ].join("\n");

  const model = (typeof env.DEEPSEEK_MODEL === "string" && env.DEEPSEEK_MODEL.trim())
    ? env.DEEPSEEK_MODEL.trim()
    : "deepseek-flash";

  try {
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 4000,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: mode === "svg" ? svgSystem : gridSystem },
          { role: "user", content: `Draw: ${prompt}` }
        ]
      }),
      signal: AbortSignal.timeout(110000)
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      // Do not relay upstream headers or credentials to the browser.
      const message = upstream.status === 401
        ? "AI 服务认证失败，请管理员检查云端密钥。"
        : upstream.status === 429
          ? "AI 服务当前请求较多，请稍后重试。"
          : "AI 服务暂时不可用，请稍后重试。";
      return Response.json({ error: message }, { status: upstream.status === 429 ? 429 : 502 });
    }

    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return Response.json({ error: "AI 没有返回有效图案，请重试。" }, { status: 502 });
    }
    return Response.json({ content }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: "连接 AI 服务超时或失败，请稍后重试。" }, { status: 502 });
  }
}
