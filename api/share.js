export default async function handler(req, res) {
  const { id } = req.query;
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL) return res.status(500).send("GAS_URLが未設定です");
  if (!id) return res.status(400).send("idが未設定です");

  let title = "案件共有";
  let description = "案件詳細をご確認ください。";
  
  // 1. デフォルトのプレビュー画像（※ご自身のサイトのロゴやダミー画像URLに変更してください）
  //  ※画像がないとLINEでカード化されない場合があります
  let imageUrl = `https://${req.headers.host}/favicon.ico`; 

  try {
    // 2. LINEクローラーのタイムアウト対策（4秒で切り上げるAbortController）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

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
        
        // もしGASから画像URLが取れる場合はセット
        if (data.imageUrl) imageUrl = data.imageUrl;
      }
    }
  } catch (e) {
    console.error("GAS通信スキップまたはタイムアウト:", e.message);
  }

  const targetUrl = `https://${req.headers.host}/?id=${encodeURIComponent(id)}`;

  // 3. OGPタグの出力（og:image を必ず含める）
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
  
  <script>
    window.location.replace("${targetUrl}");
  </script>
</head>
<body>
  <p>案件画面へ移動しています... <a href="${targetUrl}">移動しない場合はこちら</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
