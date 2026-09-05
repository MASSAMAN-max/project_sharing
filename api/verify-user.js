// =====================================================================
// /api/verify-user
// -----------------------------------------------------------------------
// ブラウザで取得したGoogleアカウントのメールアドレスを、メインアプリの
// ホワイトリスト（ログインID列）と照合するための中継API。
//
// 【CORS対策・秘密情報の隠蔽について】
// 既存の /api/data.js と同じ方針で、ブラウザからGASへ直接fetchせず、
// 必ずこのVercel API（サーバー側）を経由させる。
// GASのURLをブラウザに一切見せないことで、URLの推測・直接アクセスを防ぐ。
//
// このAPIはPOSTのみ受け付ける（メールアドレスをクエリパラメータに
// 載せたくないため。GETだとアクセスログ等にメールアドレスが残りやすい）。
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const { email } = req.body || {};
  // 【重要】案件データ取得用の GAS_URL（案件共有GAS）とは別のGASプロジェクト。
  // こちらはメインの案件管理アプリのGAS（doPost・action形式のAPI）を指す。
  const MAIN_APP_GAS_URL = process.env.MAIN_APP_GAS_URL;

  if (!email) {
    return res.status(400).json({ error: "メールアドレスが指定されていません" });
  }

  if (!MAIN_APP_GAS_URL) {
    return res.status(500).json({
      error: "サーバー設定エラー: Vercel環境変数『MAIN_APP_GAS_URL』が読み込めていません。Redeployを実行してください。"
    });
  }

  try {
    const gasRes = await fetch(MAIN_APP_GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // GASのCORS制約回避のため既存構成と同じくtext/plainで送る
      body: JSON.stringify({
        action: "verifyShareUser",
        payload: { email: email }
      })
    });

    const responseText = await gasRes.text();

    try {
      const data = JSON.parse(responseText);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(data);
    } catch (parseError) {
      return res.status(500).json({
        error: "GASからの応答がJSONではありません。GASのアクセス権限が『全員』になっているか確認してください。",
        rawResponse: responseText.substring(0, 150)
      });
    }

  } catch (error) {
    return res.status(500).json({ error: "GAS通信エラー: " + error.message });
  }
}
