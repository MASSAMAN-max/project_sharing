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
// 【2種類の認証方式（いずれか1つを送る）】
// ①email（Googleアカウントのメールアドレス）
//     …通常ブラウザで開いた場合。Sign In With Googleで取得。
// ②lineUserId（LINEのユーザーID）
//     …LINEアプリ内蔵ブラウザで開いた場合。LIFFで取得。
//   Googleログインは、LINEアプリ内蔵ブラウザではブロックされてしまう
//   既知の制限があるため、この経路を別途用意している。
//
// 【注記：viewKey方式について】
// 以前、メインアプリの「共有」ボタン経由でログインを省略するための
// viewKey方式を実装していたが、「共有する」操作と「案件を見る」操作を
// 分離する設計に転換したため撤去した。共有の入口はメインアプリの
// 共有ボタン・カレンダーの共有リンクのいずれもshare.html（共有方法
// 選択ページ、GAS通信なし）を経由し、実際の案件閲覧（このAPI）では
// 必ずGoogle/LINEいずれかのログインを求める。
//
// 【2つのGASプロジェクトを呼び分けている点に注意】
// ①GAS_URL（案件共有GAS）        …トークンから案件データ本体を取得する。
// ②MAIN_APP_GAS_URL（メインアプリGAS）…認証チェックのみ行う。
// 案件データ本体の取得ロジック（トークン照合）は既存の案件共有GAS側にしか
// 無いため、ここでは変更せずそのまま使う。認証だけメインアプリGAS側に問い合わせる。
//
// 【速度改善：認証チェックとデータ取得の並列化】
// 以前は「①認証チェック（メインアプリGAS）→ 完了を待ってから
// ②案件データ取得（案件共有GAS）」という直列処理だったため、
// 2つのGAS呼び出し時間の合計がそのまま待ち時間になっていた。
// 認証に失敗した場合にデータをブラウザへ返さない、というセキュリティ
// 上の要件は変えずに、"呼び出し自体"は両方同時に開始することで、
// 待ち時間を「2つの合計」から「遅い方の1つ分」に短縮する
// （Promise.allで両方の完了を待ってから、まず認証結果を確認し、
//   成功していた場合のみデータ取得の結果をブラウザへ返す）。
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
    const authAction = email ? "verifyShareUser" : "verifyShareUserByLineId";
    const authPayload = email ? { email: email } : { lineUserId: lineUserId };

    // -------------------------------------------------------------
    // 【並列実行】認証チェック（メインアプリGAS）と、案件データ取得
    // （案件共有GAS）の2つのリクエストを同時に投げる。
    // 案件データ取得は「その案件が実在するか・トークンが正しいか」の
    // 検証でしかなく、この時点ではまだ個人情報等はブラウザに返して
    // いないため、認証結果を待たずに並列で取得を開始しても安全。
    // 実際にデータをブラウザへ返すかどうかは、この後の認証結果
    // チェックで判定する（＝未認証のユーザーにデータが渡る隙は無い）。
    // -------------------------------------------------------------
    const [authRes, gasRes] = await Promise.all([
      fetch(MAIN_APP_GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: authAction,
          payload: authPayload
        })
      }),
      fetch(`${GAS_URL}?token=${encodeURIComponent(token)}`, {
        redirect: "follow"
      })
    ]);

    // -------------------------------------------------------------
    // ①まず認証結果を確認する
    // -------------------------------------------------------------
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
      // （案件データ取得の結果は、認証失敗の場合は一切使わず捨てる）
      return res.status(403).json({ error: authData.message || "このアカウントではアクセスできません" });
    }

    // -------------------------------------------------------------
    // ②認証成功が確認できたので、並列取得しておいた案件データを返す
    // -------------------------------------------------------------
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
