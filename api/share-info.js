// =====================================================================
// /api/share-info
// -----------------------------------------------------------------------
// share.html（共有方法選択ページ）がLINE共有文言を組み立てる際に使う、
// 認証不要の軽量な案件情報取得API。
//
// 【認証が無いことについて】
// ここで返すのは「案件名・発注元・担当者・住所」のみで、連絡先・検査日・
// 施工予定・添付資料URL等の詳細情報は一切含まない。これは以前の
// share.js（OGP機能）がBotに対して返していた情報と同程度であり、
// 認証なしで公開しても実害が小さいと判断している。
// 実際に案件の詳細を閲覧するには、引き続き index.html 側でGoogle/LINE
// いずれかのログインが必須。
// =====================================================================

export default async function handler(req, res) {
  const { token } = req.query;
  const GAS_URL = process.env.GAS_URL;
  // 案件共有GASが「Vercel経由の呼び出し」か確認するための共有シークレット
  const SHARE_API_SECRET = process.env.SHARE_API_SECRET;

  if (!token) {
    return res.status(400).json({ error: "共有トークンが指定されていません" });
  }

  if (!GAS_URL || !SHARE_API_SECRET) {
    return res.status(500).json({
      error: "サーバー設定エラー: Vercel環境変数『GAS_URL』または『SHARE_API_SECRET』が読み込めていません。Redeployを実行してください。"
    });
  }

  try {
    // 共有シークレットは、URLではなくリクエスト本文（POST）で渡す（URLはアクセスログ等に残りやすいため）
    const gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "getCaseSummary", secret: SHARE_API_SECRET, token: String(token) }),
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
