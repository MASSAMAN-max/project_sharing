// =====================================================================
// /api/line-targets
// -----------------------------------------------------------------------
// LINE送信先の候補一覧（ホワイトリストのうちLINEuserIDが登録されている人）
// を取得するための中継API。
//
// 【認証について】
// GAS側（08_案件共有連携.js の handleShareAppAction）が、リクエストに
// 含まれる email／lineUserId／viewKey のいずれかを使って毎回認証を
// 再実行する（verifyShareUserAny）。email はGoogleログイン経由、
// lineUserIdはLINE内蔵ブラウザ（LIFF）経由、viewKeyはメインアプリの
// 「共有」ボタン経由の人に対応する。viewKeyでの認証にはshareTokenとの
// セット確認が必須のため、常にshareTokenも一緒に受け取る。
// このAPI自体は「誰が呼んでもよい」窓口だが、GAS側の再認証によって
// 未ログインの人が宛先一覧を取得することはできない。
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const { email, lineUserId, viewKey, shareToken } = req.body || {};
  const MAIN_APP_GAS_URL = process.env.MAIN_APP_GAS_URL;

  if (!email && !lineUserId && !viewKey) {
    return res.status(400).json({ error: "認証情報が指定されていません" });
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
        action: "getLineTargets",
        payload: { email: email, lineUserId: lineUserId, viewKey: viewKey, shareToken: shareToken }
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
