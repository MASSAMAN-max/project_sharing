function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

const BOT_USER_AGENTS = [
  'facebookexternalhit',
  'line-poker',
  'twitterbot',
  'slackbot',
  'discordbot',
  'telegrambot',
  'whatsapp'
];

export default async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const token = req.query ? req.query.token : '';

  if (!token) {
    return res.status(400).send("パラメーターエラー");
  }

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  const targetUrl = `https://${host}/index.html?token=${encodeURIComponent(token)}`;

  // 【1】一般ユーザー（ブラウザ）：GASを待たずに即時転送
  if (!isBot) {
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>案件共有</title></head><body><script>window.location.href="${targetUrl}";</script></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  // 【2】SNSボット（LINE等）：GASからOGPを取得
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) {
    return res.status(400).send("パラメーターエラー");
  }

  let title = "案件共有";
  let clientStr = "";

  try {
    const gasApiUrl = new URL(GAS_URL);
    gasApiUrl.searchParams.set('token', token);

    const gasRes = await fetch(gasApiUrl.toString());
    if (gasRes.ok) {
      const data = await gasRes.json();
      if (data && !data.error) {
        title = data.title || "案件共有";
        const client = data.client || "";
        const staff = data.staff || "";
        clientStr = (staff && staff !== "--" && staff !== "") ? `${client}（${staff} 様）` : client;
      }
    }
  } catch (e) {
    console.error("GAS Fetch Error:", e);
  }

  // LINE表示用の装飾処理
  const displayTitle = clientStr ? `📁 ${clientStr}` : `📁 ${title}`;
  const description = "▶ 案件詳細を開く";

  const ogpHtml = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${escapeHtml(displayTitle)}">` +
    `<meta property="og:description" content="${escapeHtml(description)}">` +
    `<title>${escapeHtml(displayTitle)}</title></head><body></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(ogpHtml);
}
