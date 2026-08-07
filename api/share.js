// api/share.js
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export default async function handler(req, res) {
  const { id } = req.query;
  const GAS_URL = process.env.GAS_URL;

  // 1. パラメータ・環境変数チェック
  if (!GAS_URL) {
    return res.status(500).send("エラー: Vercelの環境変数 (GAS_URL) が設定されていません。");
  }

  if (!id) {
    return res.status(400).send("エラー: 案件ID (?id=...) が指定されていません。");
  }

  let data = null;

  try {
    // 2. Vercelサーバー側でGASから直接データを取得（コールドスタート考慮でタイムアウト10秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const gasRes = await fetch(`${GAS_URL}?id=${encodeURIComponent(id)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (gasRes.ok) {
      data = await gasRes.json();
    }
  } catch (e) {
    console.error("GAS Fetch Error:", e);
  }

  if (!data || data.error) {
    return res.status(404).send("案件情報が見つかりませんでした。");
  }

  // 3. データの整形
  const title    = data.title || "無題の案件";
  const address  = data.address || "--";
  const client   = data.client || "--";
  const staff    = data.staff || "--";
  const tel      = data.tel || "--";
  const check    = data.check || "--";
  const kBox     = data.kBox || "--";
  const area     = data.area || "--";
  const loc      = data.loc || "";
  const note     = data.note || "--";
  const attached = data.attached || "";
  const workSchedule = data.workSchedule || [];

  const clientStr = (staff && staff !== "--") ? `${client}（${staff} 様）` : client;

  // 施工予定のHTML化
  let workHtml = "";
  workSchedule.forEach(w => {
    workHtml += `
      <div class="work-item">
        <span class="w-date">📅 ${escapeHtml(w.date)}</span>
        <span class="w-content">${escapeHtml(w.content)}</span>
        ${w.worker ? `<span class="w-worker">👤 ${escapeHtml(w.worker)}</span>` : ""}
      </div>`;
  });
  if (!workHtml) workHtml = "<div>予定なし</div>";

  const mapQuery = loc || address;
  const mapUrl = (mapQuery && mapQuery !== "--")
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : "#";

  // 自身のページURL
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const currentUrl = `${protocol}://${host}/api/share?id=${encodeURIComponent(id)}`;

  // LINE送信時のメッセージ本文（テキスト）
  const shareMessage = `【案件共有】\n${title}\n発注元: ${clientStr}\n${currentUrl}`;
  const lineUrl = "https://line.me/R/msg/text/?" + encodeURIComponent(shareMessage);

  // 4. OGPタグ入りの完全なHTMLを出力（サーバーサイドレンダリング）
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<!-- LINEプレビューカード用設定（動的生成） -->
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="発注元: ${escapeHtml(clientStr)}">

<title>${escapeHtml(title)}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 15px; font-size: 14px; color: #333; background: #f4f4f4; margin: 0;
  }
  .card {
    border: 1px solid #ddd; border-radius: 10px; padding: 15px; background: #fff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 480px; margin: 0 auto 20px auto;
  }
  h2 {
    font-size: 20px; margin-top: 0; color: #000; border-bottom: 2px solid #06c755; padding-bottom: 8px; word-break: break-word;
  }
  .label { font-weight: bold; color: #666; width: 85px; display: inline-block; vertical-align: top; }
  .btn {
    display: block; width: 100%; max-width: 480px; box-sizing: border-box; text-align: center;
    padding: 15px 0; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 10px auto 0 auto; border: none; cursor: pointer;
  }
  .line-btn { background: #06c755; }
  .fb-btn { background: #0084ff; }
  .copy-btn { background: #666; }
  .map-link { color: #1a73e8; text-decoration: none; font-weight: bold; }
  hr { border: 0; border-top: 1px solid #eee; margin: 15px 0; }
  .section-title { font-weight: bold; margin-bottom: 8px; }
  .small { font-size: 12px; color: #666; word-break: break-all; }
  .work-item { background: #f4f4f4; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; font-size: 13px; }
  .work-item .w-date { color: #555; }
  .work-item .w-content { font-weight: bold; color: #222; margin-left: 6px; }
  .work-item .w-worker { display: inline-block; margin-left: 6px; color: #0284c7; background: #e0f2fe; padding: 1px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
</style>
</head>
<body>

  <div class="card">
    <h2>${escapeHtml(title)}</h2>

    <p><span class="label">住 所</span>: ${escapeHtml(address)}</p>
    <p><span class="label">発注元</span>: ${escapeHtml(clientStr)}</p>
    <p><span class="label">連絡先</span>: ${escapeHtml(tel)}</p>
    <p><span class="label">検査日</span>: ${escapeHtml(check)}</p>
    <p><span class="label">キーBOX</span>: ${escapeHtml(kBox)}</p>
    <p><span class="label">面 積</span>: ${escapeHtml(area)} ㎡</p>
    <p><span class="label">備 考</span>: ${escapeHtml(note)}</p>

    ${attached ? `<p><span class="label">参考資料</span>: <a href="${escapeHtml(attached)}" class="map-link" target="_blank" rel="noopener">📂 資料参照</a></p>` : ""}

    <hr>
    <div class="section-title">施工予定</div>
    ${workHtml}

    <hr>
    <p><a href="${escapeHtml(mapUrl)}" class="map-link" target="_blank" rel="noopener">📍 Googleマップを開く</a></p>

    <hr>
    <div class="section-title">共有URL</div>
    <div class="small">${escapeHtml(currentUrl)}</div>
  </div>

  <a href="${lineUrl}" class="btn line-btn" target="_blank" rel="noopener">📩 LINEで案件URLを送る</a>
  <button id="msgBtn" class="btn fb-btn">💬 Messengerで案件URLを送る</button>
  <button id="copyBtn" class="btn copy-btn">🔗 案件URLをコピー</button>

  <script>
    const shareMessage = ${JSON.stringify(shareMessage)};
    const currentUrl = ${JSON.stringify(currentUrl)};

    function copyText(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    document.getElementById("msgBtn").addEventListener("click", () => {
      copyText(shareMessage);
      alert("案件メッセージをコピーしました。Messengerに貼り付けてください。");
      window.open("https://m.me/", "_blank");
    });

    document.getElementById("copyBtn").addEventListener("click", () => {
      copyText(currentUrl);
      alert("案件URLをコピーしました。");
    });
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
