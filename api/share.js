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

// 未入力を表す "--" と空文字は「値なし」として扱う（GAS側は未入力の項目を "--" で返す）
function hasValue(v) {
  return !!v && v !== "--";
}

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

  // 【2】SNSボット（LINE・Messenger等）：GASからOGPを取得
  const GAS_URL = process.env.GAS_URL;
  // 案件共有GASが「Vercel経由の呼び出し」か確認するための共有シークレット
  const SHARE_API_SECRET = process.env.SHARE_API_SECRET;
  if (!GAS_URL || !SHARE_API_SECRET) {
    return res.status(400).send("パラメーターエラー");
  }

  let caseNo = "";
  let title = "";
  let clientStr = "";

  try {
    // 軽量な要約API（案件No・タイトル・発注元・担当者・住所のみ）をPOSTで呼ぶ。
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
        // caseNo は、GAS側（Main.js buildShareSummary）が返す。未対応の古いGASでは空のまま（案件名のみ表示）
        caseNo = hasValue(String(data.caseNo || "")) ? String(data.caseNo) : "";
        title = data.title || "";
        const client = hasValue(data.client) ? data.client : "";
        const staff = hasValue(data.staff) ? data.staff : "";
        clientStr = (client && staff) ? `${client}（${staff} 様）` : client;
      }
    }
  } catch (e) {
    console.error("GAS Fetch Error:", e);
  }

  // 【表示内容】SNSのプレビューは、1行目（太字）が og:title、2行目が og:description。
  //   1行目：📁 No.案件No 案件名   ← 案件Noが無ければ案件名のみ。案件名も無ければ「案件共有」
  //   2行目：発注元（担当者 様）     ← 発注元が無ければ「▶ 案件詳細を開く」
  //
  // 【Messengerへの対応】Messengerは、プレビューに og:description を表示しない場合がある
  // （タイトルとURLのドメインだけが出る）。そのため、発注元・担当者もタイトルに含める。
  // 2行目を改行（&#10;）で区切るが、改行が反映されない環境では、半角スペースで続けて表示される。
  const titleText = [caseNo ? `No.${caseNo}` : "", title].filter(Boolean).join(" ") || "案件共有";
  const displayTitle = `📁 ${titleText}`;
  const description = clientStr || "▶ 案件詳細を開く";
  const ogTitleHtml = clientStr
    ? `${escapeHtml(displayTitle)}&#10;${escapeHtml(clientStr)}`
    : escapeHtml(displayTitle);

  const ogpHtml = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${ogTitleHtml}">` +
    `<meta property="og:description" content="${escapeHtml(description)}">` +
    `<title>${escapeHtml(displayTitle)}</title></head><body></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(ogpHtml);
}
