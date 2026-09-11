// =====================================================================
// /api/log-action
// -----------------------------------------------------------------------
// 案件共有アプリでの操作（案件ページ開封・資料閲覧・MAP確認・問い合わせ等）
// を、案件共有GAS側の操作ログシートに記録するための中継API。
//
// 【呼び出し先について】
// 認証チェック（メインアプリGAS）でも、案件データ取得（案件共有GAS）
// でもなく、この操作ログは「案件共有GAS」（GAS_URL）側の doPost に
// 記録する。これは、LINEの友だち追加ログ（ID取得.js）と同じ
// スプレッドシートに一元記録するため（GASプロジェクトが同じであるため）。
//
// このAPIはログ記録専用であり、失敗してもユーザー体験に影響を
// 与えるべきではない（＝案件ページの表示自体は止めない）。そのため
// フロント側は、このAPIの失敗を握りつぶして良い設計にしている。
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const { lineUserId, email, actionName, caseNo, detail } = req.body || {};
  const GAS_URL = process.env.GAS_URL;

  if (!actionName) {
    return res.status(400).json({ error: "操作名（actionName）が指定されていません" });
  }

  if (!GAS_URL) {
    return res.status(500).json({
      error: "サーバー設定エラー: Vercel環境変数『GAS_URL』が読み込めていません。Redeployを実行してください。"
    });
  }

  try {
    const gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "logAction",
        lineUserId: lineUserId || "",
        email: email || "",
        actionName: actionName,
        caseNo: caseNo || "",
        detail: detail || ""
      })
    });

    const responseText = await gasRes.text();

    try {
      const data = JSON.parse(responseText);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(data);
    } catch (parseError) {
      return res.status(500).json({
        error: "GASからの応答がJSONではありません。",
        rawResponse: responseText.substring(0, 150)
      });
    }

  } catch (error) {
    return res.status(500).json({ error: "GAS通信エラー: " + error.message });
  }
}
