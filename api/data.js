// =====================================================================
// /api/data
// -----------------------------------------------------------------------
// 案件詳細データを取得するための中継API。
//
// 【認証の仕組み】
// ブラウザから受け取るのは「IDトークン」（GoogleまたはLINEが署名した
// 本人確認情報）。メールアドレスやLINEuserIdを自己申告で受け取ることは
// しない（申告値は誰でも偽装できるため）。
// このAPI（サーバー側）がIDトークンをGoogle/LINEのサーバーで検証し、
// 「検証済みのメールアドレス／LINEuserId」だけをホワイトリスト照合に使う。
//
// 【2種類の認証方式（いずれか1つを送る）】
// ①googleIdToken（GoogleのIDトークン）
//     …通常ブラウザで開いた場合。Sign In With Googleで取得。
//     tokeninfoエンドポイントで、発行元・対象クライアント・有効期限・
//     メール確認済みかを検証する。
// ②lineIdToken（LIFFのIDトークン）
//     …LINEアプリ内蔵ブラウザで開いた場合。liff.getIDToken()で取得。
//     LINEのverifyエンドポイントで、発行元・対象チャネル・有効期限を検証する。
//   Googleログインは、LINEアプリ内蔵ブラウザではブロックされてしまう
//   既知の制限があるため、この経路を別途用意している。
//
// 【必要なVercel環境変数】
//   GAS_URL                … 案件共有GASのURL
//   MAIN_APP_GAS_URL       … メインアプリGASのURL
//   SHARE_API_SECRET       … 両GASへの呼び出しに付ける共有シークレット
//   GOOGLE_CLIENT_ID       … Googleログインのクライアントid
//                            （ブラウザ側 config.js の GOOGLE_CLIENT_ID と同じ値）
//   LINE_LOGIN_CHANNEL_ID  … LIFFを使うLINEログインチャネルのID
//                            （LIFF IDの「-」より前の数字）
//
// 【2つのGASプロジェクトを呼び分けている点に注意】
// ①GAS_URL（案件共有GAS）        …トークンから案件データ本体を取得する。
// ②MAIN_APP_GAS_URL（メインアプリGAS）…ホワイトリスト照合のみ行う。
//
// 【速度改善：待ち時間の重なりを最大化している】
// 「案件データ取得（案件共有GAS）」は本人確認の結果に依存しないため、
// 最初に開始しておき、本人確認（IDトークン検証 → ホワイトリスト照合）と
// 並行して進める。ただし、案件データをブラウザへ返すのは、本人確認が
// すべて成功した後だけ（未認証のユーザーにデータが渡る隙は無い）。
// =====================================================================

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const VERIFY_TIMEOUT_MS = 8000;

const INVALID_LOGIN_MESSAGE = "ログイン情報が無効か、有効期限が切れています。ページを開き直してください。";

// ステータスコード付きのエラーを作る（handler末尾のcatchで、そのまま応答に使う）
function createHttpError(message, status) {
  return Object.assign(new Error(message), { status: status });
}

// -------------------------------------------------------------
// GoogleのIDトークンを検証し、検証済みのメールアドレスを返す。
// tokeninfoエンドポイントは、署名・有効期限の検証をGoogle側で行う。
// ここでは加えて、発行元（iss）・対象クライアント（aud）・
// メール確認済み（email_verified）を自分で確認する。
// -------------------------------------------------------------
async function verifyGoogleIdToken(idToken, expectedClientId) {
  let response;
  try {
    response = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`, {
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS)
    });
  } catch (err) {
    throw createHttpError("Google認証サーバーとの通信に失敗しました。時間をおいて再度お試しください。", 502);
  }

  if (response.status >= 500) {
    throw createHttpError("Google認証サーバーでエラーが発生しました。時間をおいて再度お試しください。", 502);
  }
  if (!response.ok) {
    throw createHttpError(INVALID_LOGIN_MESSAGE, 401);
  }

  const info = await response.json();
  const isValidIssuer = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
  const isNotExpired = Number(info.exp) * 1000 > Date.now();
  const isEmailVerified = info.email_verified === true || info.email_verified === "true";

  if (info.aud !== expectedClientId || !isValidIssuer || !isNotExpired || !isEmailVerified || !info.email) {
    throw createHttpError(INVALID_LOGIN_MESSAGE, 401);
  }

  return String(info.email).trim().toLowerCase();
}

// -------------------------------------------------------------
// LINEのIDトークンを検証し、検証済みのLINEuserId（sub）を返す。
// verifyエンドポイントは、署名・有効期限・対象チャネルの検証をLINE側で行う。
// ここでは加えて、発行元（iss）・対象チャネル（aud）を自分でも確認する。
// -------------------------------------------------------------
async function verifyLineIdToken(idToken, expectedChannelId) {
  let response;
  try {
    response = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: expectedChannelId }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS)
    });
  } catch (err) {
    throw createHttpError("LINE認証サーバーとの通信に失敗しました。時間をおいて再度お試しください。", 502);
  }

  if (response.status >= 500) {
    throw createHttpError("LINE認証サーバーでエラーが発生しました。時間をおいて再度お試しください。", 502);
  }
  if (!response.ok) {
    throw createHttpError(INVALID_LOGIN_MESSAGE, 401);
  }

  const info = await response.json();
  if (info.iss !== "https://access.line.me" || info.aud !== expectedChannelId || !info.sub) {
    throw createHttpError(INVALID_LOGIN_MESSAGE, 401);
  }

  return String(info.sub);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "このAPIはPOSTメソッドのみ受け付けます" });
  }

  const { token, googleIdToken, lineIdToken } = req.body || {};
  const GAS_URL = process.env.GAS_URL;
  const MAIN_APP_GAS_URL = process.env.MAIN_APP_GAS_URL;
  const SHARE_API_SECRET = process.env.SHARE_API_SECRET;
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const LINE_LOGIN_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID;

  if (!token) {
    return res.status(400).json({ error: "共有トークンが指定されていません" });
  }
  if (!googleIdToken && !lineIdToken) {
    return res.status(401).json({ error: "ログインが必要です" });
  }

  // 使う認証方式に必要な環境変数だけを確認する
  const isGoogleAuth = !!googleIdToken;
  const verifierConfig = isGoogleAuth ? GOOGLE_CLIENT_ID : LINE_LOGIN_CHANNEL_ID;
  if (!GAS_URL || !MAIN_APP_GAS_URL || !SHARE_API_SECRET || !verifierConfig) {
    return res.status(500).json({
      error: "サーバー設定エラー: Vercel環境変数『GAS_URL』『MAIN_APP_GAS_URL』『SHARE_API_SECRET』『GOOGLE_CLIENT_ID』『LINE_LOGIN_CHANNEL_ID』のいずれかが読み込めていません。Redeployを実行してください。"
    });
  }

  try {
    // -------------------------------------------------------------
    // ①案件データ取得（案件共有GAS）を最初に開始しておく。
    // 本人確認の結果を待たずに開始してよいのは、ブラウザへ返すのが
    // 本人確認の成功後だけだから。本人確認が先に失敗した場合に、
    // 取得結果が未処理のまま残ってエラー扱いにならないよう、
    // 何もしない catch を付けておく（後で await した時のエラーは通常どおり届く）。
    // -------------------------------------------------------------
    const gasPromise = fetch(
      `${GAS_URL}?token=${encodeURIComponent(token)}&secret=${encodeURIComponent(SHARE_API_SECRET)}`,
      { redirect: "follow" }
    );
    gasPromise.catch(() => {});

    // -------------------------------------------------------------
    // ②本人確認：IDトークンを検証し、検証済みのメールアドレス／LINEuserIdを得る
    // -------------------------------------------------------------
    let verifiedEmail = "";
    let verifiedLineUserId = "";
    if (isGoogleAuth) {
      verifiedEmail = await verifyGoogleIdToken(String(googleIdToken), GOOGLE_CLIENT_ID);
    } else {
      verifiedLineUserId = await verifyLineIdToken(String(lineIdToken), LINE_LOGIN_CHANNEL_ID);
    }

    // -------------------------------------------------------------
    // ③ホワイトリスト照合（メインアプリGAS）
    // shareSecret：メインアプリGASが「案件共有アプリからの呼び出し」か確認するための値
    // -------------------------------------------------------------
    const authRes = await fetch(MAIN_APP_GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: isGoogleAuth ? "verifyShareUser" : "verifyShareUserByLineId",
        payload: isGoogleAuth
          ? { email: verifiedEmail, shareSecret: SHARE_API_SECRET }
          : { lineUserId: verifiedLineUserId, shareSecret: SHARE_API_SECRET }
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
      // （案件データ取得の結果は、認証失敗の場合は一切使わず捨てる）
      return res.status(403).json({ error: authData.message || "このアカウントではアクセスできません" });
    }

    // -------------------------------------------------------------
    // ④本人確認がすべて成功したので、並行して取得しておいた案件データを返す
    // -------------------------------------------------------------
    const gasRes = await gasPromise;
    const responseText = await gasRes.text();

    try {
      const data = JSON.parse(responseText);
      // ホワイトリストに登録された正式なユーザー名。LINE経由の場合、
      // LINEプロフィールAPIは相手が公式アカウントを友だち追加していないと
      // 表示名を取得できない制約があるため、操作ログ記録時はこちらを優先して使う。
      data.verifiedUserName = authData.data && authData.data.userName ? authData.data.userName : "";
      // サーバーが検証して確定した識別子（操作ログ記録用。ブラウザの申告値ではない）
      data.verifiedEmail = verifiedEmail;
      data.verifiedLineUserId = verifiedLineUserId;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(data);
    } catch (parseError) {
      return res.status(500).json({
        error: "GASからの応答がJSONではありません。GASのアクセス権限が『全員』になっているか確認してください。",
        rawResponse: responseText.substring(0, 150)
      });
    }

  } catch (error) {
    // IDトークン検証のエラー（401/502）は、ステータス付きでそのまま返す
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "GAS通信エラー: " + error.message });
  }
}
