// =====================================================================
// /api/verify-line-user
// -----------------------------------------------------------------------
// LIFF経由で取得したLINEuserIdを、ホワイトリストの「LINEuserID」列と
// 照合するための中継API。/api/verify-user（メールアドレス版）と対になる。
//
// LINEアプリ内蔵ブラウザではGoogleログインがブロックされるため、
// この経路（LINEuserIdでの照合）を別途用意している。
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const { lineUserId } = req.body || {};
  const MAIN_APP_GAS_URL = process.env.MAIN_APP_GAS_URL;

  if (!lineUserId) {
    return res.status(400).json({ error: "LINEユーザーIDが指定されていません" });
  }

  if (!MAIN_APP_GAS_URL) {
    return res.status(500).json({
      error: "サーバー設定エラー: Vercel環境変数『MAIN_APP_GAS_URL』が読み込めていません。Redeployを実行してください。"
    });
  }

  try {
    const gasRes = await fetch(MAIN_APP_GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "verifyShareUserByLineId",
        payload: { lineUserId: lineUserId }
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
