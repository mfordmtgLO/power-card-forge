// ============================================================
// POWER CARD CHARACTER FORGE — Firebase connection settings
// ============================================================
// This file is the ONLY place the app reads its Firebase
// settings from. Until you paste your real values in below,
// the app shows a plain "setup not finished" notice and does
// not try to connect to anything.
//
// WHERE THE VALUES COME FROM (full click-list in SETUP.md):
//   Firebase console -> your project (power-card-forge)
//   -> Project settings (gear icon) -> "Your apps" -> the web
//   app you registered -> "SDK setup and configuration".
// Copy each value into the matching slot, keeping the quotes.
//
// ADMIN_EMAIL: sign in to the app once with your own Google
// account, then put the exact email address you signed in
// with here. That one address is what makes "Mike's Inbox"
// appear for you — nobody else sees it. The SAME email must
// also replace the placeholder in firestore.rules and in
// storage.rules, or the inbox will not be allowed to read
// and update requests. (See SETUP.md, step 6.)
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA-tJFKO0dd2WS1pSZs_7G2E8GTsHW9JAM",
  authDomain: "gen-lang-client-0712375249.firebaseapp.com",
  projectId: "gen-lang-client-0712375249",
  storageBucket: "gen-lang-client-0712375249.firebasestorage.app",
  messagingSenderId: "1072495939311",
  appId: "1:1072495939311:web:be957fde4f5ca6637c951a"
};

export const ADMIN_EMAIL = "fordmj@gmail.com";

// True only when every slot above holds a real pasted value.
export function configIsReady() {
  const keys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  return keys.every((k) => {
    const v = FIREBASE_CONFIG[k];
    return typeof v === "string" && v.length > 0 && !v.includes("PASTE_");
  });
}

export function adminEmailIsReady() {
  return typeof ADMIN_EMAIL === "string" && ADMIN_EMAIL.includes("@") && !ADMIN_EMAIL.includes("PASTE_");
}
