// =====================================================================
// /api/line-push
// -----------------------------------------------------------------------
// 選択された宛先（複数可）に、案件情報のFlex MessageをLINE Pushで
// 送信するための中継API。副作用のある操作（実際にLINEメッセージが
// 届く）ため、GAS側で email による再認証を必ず行わせている
// （08_案件共有連携.js の handleShareAppAction 参照）。
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const { email, shareToken, title, client, staff, address, workSchedule, targetLineUserIds } = req.body || {};
  const MAIN_APP_GAS_URL = process.env.MAIN_APP_GAS_URL;

  if (!email) {
    return res.status(400).json({ error: "メールアドレスが指定されていません" });
  }
  if (!shareToken) {
    return res.status(400).json({ error: "共有トークンが指定されていません" });
  }
  if (!Array.isArray(targetLineUserIds) || targetLineUserIds.length === 0) {
    return res.status(400).json({ error: "送信先が選択されていません" });
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
        action: "sendLinePush",
        payload: {
          email: email,
          shareToken: shareToken,
          title: title || "",
          client: client || "",
          staff: staff || "",
          address: address || "",
          workSchedule: Array.isArray(workSchedule) ? workSchedule : [],
          targetLineUserIds: targetLineUserIds
        }
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
