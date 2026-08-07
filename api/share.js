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
    // 1. GASから件名と発注元を取得
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

  // 人間が開いた時の転送先（元のindex.html）
  const targetUrl = `https://${req.headers.host}/?id=${encodeURIComponent(id)}`;

  // 2. LINEロボット用OGP ＋ 人間用JSリダイレクト
  // ※ http-equiv="refresh" を外すことで、LINEロボットがindex.htmlへ追従するのを防ぎます
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
  <script>
    // 人間がブラウザで開いた時だけ速やかに画面(index.html)へジャンプ
    window.location.href = "${targetUrl}";
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
