module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Server missing DEEPSEEK_API_KEY" }));
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const title = String(body.title || "").trim();
    const source = String(body.source || "").trim();
    const chunks = Array.isArray(body.chunks)
      ? body.chunks.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
      : [];

    if (!title || !chunks.length) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Missing title or chunks" }));
      return;
    }

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "你是一个出题助手。请根据给定的知识卡片内容，按内容块生成多个简洁问题。输出严格 JSON 对象，包含 questions 数组。每个元素包含 prompt 和 answer 两个字段。每个 answer 必须对应原文中的一个块，不要遗漏，不要杜撰。",
          },
          {
            role: "user",
            content: JSON.stringify({ title, source, chunks }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Upstream error", detail: text.slice(0, 600) }));
      return;
    }

    const data = await upstream.json();
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw || "{}");
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : [];
    const cleaned = questions
      .map((item) => ({
        prompt: String(item?.prompt || "").trim(),
        answer: String(item?.answer || "").trim(),
      }))
      .filter((item) => item.prompt && item.answer);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ questions: cleaned }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "Internal server error",
        detail: error instanceof Error ? error.message : "Unknown error",
      })
    );
  }
};
