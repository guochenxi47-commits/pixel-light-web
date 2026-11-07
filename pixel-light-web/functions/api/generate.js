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
  const size = Number(body.size);
  const mode = body.mode === "grid" ? "grid" : "svg";
  if (!prompt || prompt.length > 60 || ![16, 32].includes(size)) {
    return Response.json({ error: "请提供有效描述，并选择 16×16 或 32×32 分辨率。" }, { status: 400 });
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
