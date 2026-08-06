export default async function handler(req, res) {
  const { id } = req.query;

  // 1. GASのWeb API URLを設定（config.jsにあるCONFIG.GAS_URLと同じURLを指定）
  const GAS_URL = "https://script.google.com/macros/s/YOUR_GAS_SCRIPT_ID/exec"; 

  if (!id) {
    return res.status(400).send("案件IDが指定されていません");
  }

  let title = "案件共有";
  let description = "案件詳細をご確認ください。";

  try {
    // 2. サーバー側でGASから案件データを取得
    const response = await fetch(`${GAS_URL}?id=${encodeURIComponent(id)}`);
    if (response.ok) {
      const data = await response.json();
      if (!data.error) {
        title = data.title || "無題の案件";
        // LINEプレビュー（説明文）に表示したい項目を組み立て
        const address = data.address ? `住所: ${data.address}` : "";
        const client = data.client ? `発注元: ${data.client}` : "";
        description = [address, client].filter(Boolean).join(" / ") || "案件詳細をご確認ください。";
      }
    }
  } catch (e) {
    console.error("Fetch error:", e);
  }

  // 3. 人間がアクセスした時の遷移先（トップのHTML画面）
  const targetUrl = `https://${req.headers.host}/?id=${encodeURIComponent(id)}`;

  // 4. LINEクローラー用のOGPタグを含むHTMLを出力（JavaScriptで自動転送も設定）
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  
  <!-- LINE等のSNSプレビュー用OGPタグ -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://${req.headers.host}/api/share?id=${encodeURIComponent(id)}">
  
  <!-- ブラウザでアクセスした人間を瞬時に元の詳細画面へ自動リダイレクト -->
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
