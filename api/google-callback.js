// =====================================================================
// /api/google-callback
// -----------------------------------------------------------------------
// Messenger等の内蔵ブラウザ向け「リダイレクト方式のGoogleログイン」の戻り先。
// （ポップアップが使えない環境で、Googleのログイン後に、ここへ移動してくる）
//
// 【Googleから届くもの】POSTで、次の2つ（フォーム形式）。
//   credential      … GoogleのIDトークン
//   g_csrf_token    … なりすまし防止の値（同じ値が、同名のCookieにも入っている）
//
// 【このAPIがやること】
//   1. g_csrf_token（本文）とCookieの値が一致するか確認する（Googleの公式手順）
//   2. IDトークンの形式を確認する
//      ※ 署名・有効期限・クライアントIDなどの「本人確認」は、ここでは行わない。
//         /api/data（data.js）が、これまでと同じ方法で行う。
//   3. IDトークンを sessionStorage に入れ、案件ページ（?token=...）へ戻す
//      ※ IDトークンをURLに載せない（履歴・アクセスログに残らないようにするため）
//
// 【Google Cloud Console の設定】
//   OAuthクライアントの「承認済みのリダイレクトURI」に、
//   https://（共有アプリのドメイン）/api/google-callback を登録すること。
// =====================================================================

// 「xxxxx.yyyyy.zzzzz」（JWTの形式）か確認する。HTMLに埋め込むため、安全な文字だけを通す
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Cookieヘッダーから、指定した名前の値を取り出す
function getCookieValue(cookieHeader, name) {
  const pairs = String(cookieHeader || "").split(";");
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return "";
}

// 本文を、オブジェクトとして取り出す（自動解析された場合・文字列のまま届いた場合の両方に対応）
function readFormBody(req) {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
  return Object.fromEntries(new URLSearchParams(text));
}

// 簡単なエラー画面（共有URLから開き直してもらう）
function sendErrorPage(res, status, message) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).send(
    `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>ログインエラー</title></head>` +
    `<body style="font-family:sans-serif; padding:24px; text-align:center; color:#d33;">` +
    `<p style="font-weight:bold;">⚠️ ${message}</p>` +
    `<p style="color:#666; font-size:13px;">共有されたURLを、もう一度開き直してください。</p></body></html>`
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendErrorPage(res, 405, "このページは直接開けません。");
  }

  const body = readFormBody(req);
  const credential = String(body.credential || "");
  const csrfInBody = String(body.g_csrf_token || "");
  const csrfInCookie = getCookieValue(req.headers.cookie, "g_csrf_token");

  // 1. なりすまし防止の確認（本文とCookieの値が、空でなく、一致すること）
  if (!csrfInBody || !csrfInCookie || csrfInBody !== csrfInCookie) {
    return sendErrorPage(res, 400, "ログイン情報を確認できませんでした。");
  }

  // 2. IDトークンの形式の確認
  if (!JWT_PATTERN.test(credential)) {
    return sendErrorPage(res, 400, "ログイン情報の形式が正しくありません。");
  }

  // 3. IDトークンを sessionStorage に入れて、案件ページへ戻す。
  //    共有トークンは、ログイン画面を出す前に、index.html が localStorage に保存している。
  //    （credential は形式を確認済みの文字だけなので、そのまま埋め込んでも安全）
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.status(200).send(
    `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>ログイン中…</title></head>` +
    `<body style="font-family:sans-serif; padding:24px; text-align:center; color:#666;">` +
    `<p id="msg">ログインを確認しています…</p>` +
    `<script>
      (function () {
        var shareToken = "";
        try {
          shareToken = localStorage.getItem("pendingShareToken") || "";
          sessionStorage.setItem("pendingGoogleIdToken", ${JSON.stringify(credential)});
        } catch (e) {}

        if (!shareToken) {
          document.getElementById("msg").textContent = "共有URLを、もう一度開き直してください。";
          return;
        }
        window.location.replace("/index.html?token=" + encodeURIComponent(shareToken));
      })();
    </script></body></html>`
  );
}
