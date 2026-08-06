export default async function handler(req, res) {
  const { id } = req.query;

  // Vercelの環境変数からGASのURLを取得
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL) {
    return res.status(500).send("環境変数 GAS_URL が設定されていません");
  }

  if (!id) {
    return res.status(400).send("案件ID（id）が指定されていません");
  }

  let title = "案件共有";
  let description = "案件詳細をご確認ください。";

  try {
    // サーバー側からGASへデータ取得（リダイレクトを考慮して follow 設定）
    const response = await fetch(`${GAS_URL}?id=${encodeURIComponent(id)}`, {
      redirect: 'follow'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (!data.error) {
        title = data.title || "無題の案件";
        const address = data.address ? `住所: ${data.address}` : "";
        const client = data.client ? `発注元: ${data.client}` : "";
        description = [address, client].filter(Boolean).join(" / ") || "案件詳細をご確認ください。";
      }
    }
  } catch (e) {
    console.error("GASデータ取得エラー:", e);
  }

  // 人間がアクセスした時の転送先（トップの画面）
  const targetUrl = `https://${req.headers.host}/?id=${encodeURIComponent(id)}`;

  // LINEクローラー用のOGPタグを含むHTML
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  
  <!-- OGPタグ -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://${req.headers.host}/api/share?id=${encodeURIComponent(id)}">
  
  <!-- ブラウザでアクセスした人間を元の画面に移動させる -->
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
