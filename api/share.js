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
  const token = req.query ? req.query.token : '';

  if (!token) {
    return res.status(400).send("パラメーターエラー");
  }

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  // 転送先は同じサイト内の案件ページ。相対パスで指定するため、リクエストの
  // Hostヘッダーを使う必要がない（以前はHostをJavaScriptの文字列に埋め込んでいた）。
  const targetPath = `/index.html?token=${encodeURIComponent(token)}`;

  // 【1】一般ユーザー（ブラウザ）：GASを待たずに即時転送（HTTP 302）。
  // 以前は「JavaScriptで転送するHTML」を返していたが、ブラウザがHTMLを
  // 読み込んでJavaScriptを実行する分だけ遅く、302ならサーバーの応答だけで転送が完了する。
  if (!isBot) {
    res.setHeader('Location', targetPath);
    return res.status(302).end();
  }

  // 【2】SNSボット（LINE等）：GASからOGPを取得
  const GAS_URL = process.env.GAS_URL;
  // 案件共有GASが「Vercel経由の呼び出し」か確認するための共有シークレット
  const SHARE_API_SECRET = process.env.SHARE_API_SECRET;
  if (!GAS_URL || !SHARE_API_SECRET) {
    return res.status(400).send("パラメーターエラー");
  }

  let title = "案件共有";
  let clientStr = "";

  try {
    // 軽量な要約API（タイトル・発注元・担当者・住所のみ）をPOSTで呼ぶ。
    // 指定しないと案件詳細（連絡先等を含む）が呼ばれてしまうため、action は必ず getCaseSummary にする。
    // シークレットはURLに載せない（URLはアクセスログ等に残りやすいため）。
    // SNSのボットを長く待たせないよう、5秒で打ち切り、既定の見出しで返す。
    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getCaseSummary', secret: SHARE_API_SECRET, token: String(token) }),
      redirect: 'follow',
      signal: AbortSignal.timeout(5000)
    });
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
