function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// OGP（プレビューカード）を取得しに来るSNSボットのリスト
const BOT_USER_AGENTS = [
  'facebookexternalhit',
  'line-poker', // LINEのOGP収集ボット
  'twitterbot',
  'slackbot',
  'discordbot',
  'telegrambot',
  'whatsapp'
];

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("パラメーターエラー");
  }

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  const targetUrl = `https://${req.headers.host}/index.html?token=${encodeURIComponent(token)}`;

  // 【1】人間（ブラウザ）が開いた場合
  //  GASへの通信（await fetch）をスキップし、0.01秒で index.html へ転送する
  if (!isBot) {
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>案件共有</title>
</head>
<body>
  <script>
    window.location.href = "${targetUrl}";
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  // 【2】LINE等のボットが開いた場合のみ
  //  裏でGASから件名を取得し、LINE上で綺麗に見えるOGPタグを動的生成する
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) {
    return res.status(400).send("パラメーターエラー");
  }

  let title = "案件共有";
  let clientStr = "";
  try {
    const gasRes = await fetch(`${GAS_URL}?token=${encodeURIComponent(token)}`);
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

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${clientStr ? '発注元: ' + escapeHtml(clientStr) : '案件詳細をご確認ください'}">
  <title>${escapeHtml(title)}</title>
</head>
<body>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
