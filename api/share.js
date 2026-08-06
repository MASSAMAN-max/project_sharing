export default async function handler(req, res) {
  const { id } = req.query;
  const GAS_URL = process.env.GAS_URL;

  const targetUrl = `https://${req.headers.host}/?id=${encodeURIComponent(id || '')}`;

  if (!GAS_URL || !id) {
    return res.redirect(302, targetUrl);
  }

  const userAgent = req.headers['user-agent'] || '';
  const isCrawler = /bot|googlebot|crawler|spider|robot|crawling|facebookexternalhit|LineExternalUrlGap|Twitterbot|Slackbot|TelegramBot|WhatsApp/i.test(userAgent);

  if (!isCrawler) {
    return res.redirect(302, targetUrl);
  }

  let title = "案件共有";
  let description = "案件詳細をご確認ください。";
  let imageUrl = `https://${req.headers.host}/favicon.ico`;

  try {
    // GASのコールドスタート（初回起動の遅さ）を考慮してタイムアウトを3.5秒に少し延長
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const fetchUrl = `${GAS_URL}?id=${encodeURIComponent(id)}`;
    console.log(`[OGP Debug] GASへ通信開始: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const text = await response.text();
      console.log(`[OGP Debug] GASからの生レスポンス: ${text}`);

      let data = {};
      try {
        const jsonMatch = text.match(/^[^\(]*\(([\s\S]*)\);?$/);
        data = jsonMatch && jsonMatch[1] ? JSON.parse(jsonMatch[1]) : JSON.parse(text);
        console.log(`[OGP Debug] パース後のオブジェクト:`, JSON.stringify(data));
      } catch (e) {
        console.error(`[OGP Debug] JSONパース失敗:`, e.message);
      }

      if (data && !data.error) {
        // GASから返ってくるプロパティ名と合わせる
        title = data.title || "案件共有";
        
        const address = data.address ? `住所: ${data.address}` : "";
        const client = data.client ? `発注元: ${data.client}` : "";
        description = [address, client].filter(Boolean).join(" / ") || "案件詳細をご確認ください。";
        
        if (data.imageUrl) imageUrl = data.imageUrl;
      } else if (data && data.error) {
        console.error(`[OGP Debug] GASからエラーが返却されました: ${data.error}`);
      }
    } else {
      console.error(`[OGP Debug] GAS通信ステータスエラー: HTTP ${response.status}`);
    }
  } catch (e) {
    console.error(`[OGP Debug] GAS通信失敗またはタイムアウト: ${e.message}`);
  }

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
