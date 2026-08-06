// api/share.js
export default async function handler(req, res) {
  const { id } = req.query;
  const GAS_URL = process.env.GAS_URL;

  const targetUrl = `https://${req.headers.host}/?id=${encodeURIComponent(id || '')}`;

  // 1. 設定エラーやIDがない場合は即座にトップへ転送
  if (!GAS_URL || !id) {
    return res.redirect(302, targetUrl);
  }

  const userAgent = req.headers['user-agent'] || '';
  
  // 2. LINEやSNSのクローラー（ロボット）からのアクセスかどうか判定
  const isCrawler = /bot|facebookexternalhit|line|twitterbot|slackbot|telegrambot|whatsapp/i.test(userAgent);

  // 【人間がアクセスした場合】
  // GASの読み込みを待たず、HTTP 302 で一瞬で実際のアプリ画面へ自動転送する
  if (!isCrawler) {
    return res.redirect(302, targetUrl);
  }

  // 【LINEなどのクローラーがアクセスした場合のみ】OGP用データを取得
  let title = "案件共有";
  let description = "案件詳細をご確認ください。";
  let imageUrl = `https://${req.headers.host}/favicon.ico`;

  try {
    // LINEが待ちきれずフリーズするのを防ぐため、タイムアウトを2.5秒に設定
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(`${GAS_URL}?id=${encodeURIComponent(id)}`, {
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const text = await response.text();
      let data = {};
      try {
        const jsonMatch = text.match(/^[^\(]*\(([\s\S]*)\);?$/);
        data = jsonMatch && jsonMatch[1] ? JSON.parse(jsonMatch[1]) : JSON.parse(text);
      } catch (e) {}

      if (data && !data.error) {
        title = data.title || "無題の案件";
        const address = data.address ? `住所: ${data.address}` : "";
        const client = data.client ? `発注元: ${data.client}` : "";
        description = [address, client].filter(Boolean).join(" / ") || "案件詳細をご確認ください。";
        if (data.imageUrl) imageUrl = data.imageUrl;
      }
    }
  } catch (e) {
    // GASが遅い・タイムアウトした場合はデフォルトの文言でカードを即座に出す
    console.log("GAS応答タイムアウト（デフォルトOGPを出力します）:", e.message);
  }

  // クローラー専用のHTML（<script>リダイレクトを排除して安定化）
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://${req.headers.host}/api/share?id=${encodeURIComponent(id)}">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
