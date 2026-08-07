// api/share.js

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export default async function handler(req, res) {
  const { id } = req.query;
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL || !id) {
    return res.status(400).send("パラメーターエラー");
  }

  let title = "案件共有";
  let clientStr = "";

  try {
    // 1. LINEカードに必要な「件名」と「発注元」だけをGASから取得
    const gasRes = await fetch(`${GAS_URL}?id=${encodeURIComponent(id)}`);
    if (gasRes.ok) {
      const data = await gasRes.json();
      if (data && !data.error) {
        title = data.title || "案件共有";
        const client = data.client || "";
        const staff = data.staff || "";
        clientStr = (staff && staff !== "--") ? `${client}（${staff} 様）` : client;
      }
    }
  } catch (e) {
    console.error("GAS Fetch Error:", e);
  }

  // 2. 本来の画面（index.html）のURL
  const targetUrl = `https://${req.headers.host}/?id=${encodeURIComponent(id)}`;

  // 3. OGPメタタグ（LINEカード用）と自動ジャンプ処理だけの最小限HTML
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <!-- LINEプレビューカード用の設定 -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${clientStr ? '発注元: ' + escapeHtml(clientStr) : '案件詳細をご確認ください'}">
  
  <!-- 人間がアクセスした際に元の画面(index.html)へ即座にジャンプ -->
  <meta http-equiv="refresh" content="0;url=${targetUrl}">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <script>window.location.href = "${targetUrl}";</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
