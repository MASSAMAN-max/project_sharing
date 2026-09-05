// =====================================================================
// /api/data
// -----------------------------------------------------------------------
// 案件詳細データを取得するための中継API。
//
// 【重要】GETからPOSTへ変更（ログイン機能導入に伴う変更）
// これまでは共有トークンだけで誰でも閲覧できたが、ログインを必須にした
// ため、認証情報も一緒に送ってもらい、認証チェックを通過した場合のみ
// 案件データを返すようにした。認証情報をURL（クエリパラメータ）に
// 乗せたくないため、GET→POSTに変更している。
//
// 【2種類の認証方式（どちらか一方を送る）】
// ①email（Googleアカウントのメールアドレス）
//     …通常ブラウザで開いた場合。Sign In With Googleで取得。
// ②lineUserId（LINEのユーザーID）
//     …LINEアプリ内蔵ブラウザで開いた場合。LIFFで取得。
//   Googleログインは、LINEアプリ内蔵ブラウザではブロックされてしまう
//   既知の制限があるため、この経路を別途用意している。
//
// 【2つのGASプロジェクトを呼び分けている点に注意】
// ①GAS_URL（案件共有GAS）        …トークンから案件データ本体を取得する。
// ②MAIN_APP_GAS_URL（メインアプリGAS）…認証チェックのみ行う。
// 案件データ本体の取得ロジック（トークン照合）は既存の案件共有GAS側にしか
// 無いため、ここでは変更せずそのまま使う。認証だけメインアプリGAS側に問い合わせる。
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const { token, email, lineUserId } = req.body || {};
  const GAS_URL = process.env.GAS_URL;
  const MAIN_APP_GAS_URL = process.env.MAIN_APP_GAS_URL;

  if (!token) {
    return res.status(400).json({ error: "共有トークンが指定されていません" });
  }
  if (!email && !lineUserId) {
    return res.status(401).json({ error: "ログインが必要です" });
  }

  if (!GAS_URL || !MAIN_APP_GAS_URL) {
    return res.status(500).json({
      error: "サーバー設定エラー: Vercel環境変数『GAS_URL』または『MAIN_APP_GAS_URL』が読み込めていません。Redeployを実行してください。"
    });
  }

  try {
    // -------------------------------------------------------------
    // ①まず認証チェック（メインアプリGASへ）
    // email があれば通常のGoogleログイン照合、無ければLINEuserIdでの
    // 照合を行う（両方来ることは無い想定だが、来た場合はemailを優先する）。
    // ここで失敗した場合は、案件共有GASへの問い合わせ自体を行わない
    // （＝未認証のユーザーに案件データが渡る隙を作らない）。
    // -------------------------------------------------------------
    const authAction = email ? "verifyShareUser" : "verifyShareUserByLineId";
    const authPayload = email ? { email: email } : { lineUserId: lineUserId };

    const authRes = await fetch(MAIN_APP_GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: authAction,
        payload: authPayload
      })
    });

    const authResponseText = await authRes.text();
    let authData;
    try {
      authData = JSON.parse(authResponseText);
    } catch (parseError) {
      return res.status(500).json({
        error: "認証APIからの応答がJSONではありません。GASのアクセス権限が『全員』になっているか確認してください。",
        rawResponse: authResponseText.substring(0, 150)
      });
    }

    if (authData.status !== "success") {
      // このアカウントではアクセスできません、等のエラーメッセージをそのまま返す
      return res.status(403).json({ error: authData.message || "このアカウントではアクセスできません" });
    }

    // -------------------------------------------------------------
    // ②認証成功後、案件共有GASへ案件データを問い合わせる
    // -------------------------------------------------------------
    const gasRes = await fetch(`${GAS_URL}?token=${encodeURIComponent(token)}`, {
      redirect: "follow"
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
