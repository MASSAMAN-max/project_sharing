function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export default async function handler(req, res) {
  // 【重要】URLはNo（連番）ではなく、ハッシュ化された共有トークン（token）を使う。
  //   Noを直接使うと、他の番号を手打ちされて他案件を推測・閲覧されるリスクがあるため。
  const { token } = req.query;
  const GAS_URL = process.env.GAS_URL;

  if (!GAS_URL || !token) {
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

  // 画面を開いた時の転送先（実際に表示する index.html）。
  // 【重要】"/index.html" という具体的なパスを指定すること。
  //   vercel.json の rewrite はルートパス "/" だけを /api/share に転送する設定のため、
  //   ここで "/?token=..." のようにルートへ戻してしまうと、また /api/share に
  //   転送され、このスクリプトが再実行される……という無限リダイレクトループになる。
  //   "/index.html" は rewrite の対象外なので、静的ファイルがそのまま返り、ループしない。
  const targetUrl = `https://${req.headers.host}/index.html?token=${encodeURIComponent(token)}`;

  // OGPメタタグの設定（LINEロボットが参照）
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
    // ブラウザで開いた時だけ index.html へジャンプ
    window.location.href = "${targetUrl}";
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
