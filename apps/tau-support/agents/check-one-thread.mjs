#!/usr/bin/env node
/**
 * check-one-thread.mjs — Stage 1 CLI (see agents/README.md).
 * Requires Node 18+. No npm dependencies.
 */

const LMS_BASE_URL = (process.env.LMS_BASE_URL || "https://courses.campus.gov.il").replace(/\/$/, "");
const USERNAME = process.env.LMS_USERNAME?.trim();
const PASSWORD = process.env.LMS_PASSWORD?.replace(/\r?\n$/, "");
const COURSE_ID = process.env.COURSE_ID;

const CAMPUS_COURSES = "https://courses.campus.gov.il";
const CAMPUS_APP = "https://app.campus.gov.il";

function resolveApiOrigin(baseUrl) {
  const host = new URL(baseUrl).hostname;
  return host === "app.campus.gov.il" ? CAMPUS_COURSES : baseUrl;
}

function getCookie(setCookieHeaders, name) {
  for (const line of setCookieHeaders) {
    const match = line.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function extractSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  return [...headers].filter(([k]) => k.toLowerCase() === "set-cookie").map(([, v]) => v);
}

function getCookieFromJar(cookieJar, name) {
  const match = cookieJar.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function followRedirectCookies(url, cookieJar) {
  let currentUrl = url;
  let jar = cookieJar;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(currentUrl, { redirect: "manual", headers: { Cookie: jar } });
    jar = mergeCookieJar(jar, extractSetCookies(res.headers));
    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status >= 400) break;
    currentUrl = new URL(location, currentUrl).href;
  }
  return jar;
}

async function finalizeLoginSession(initialJar, setCookies, csrftoken, body) {
  let cookieJar = mergeCookieJar(initialJar, setCookies);
  let newCsrf = getCookie(setCookies, "csrftoken") || csrftoken;

  let loginJson = null;
  try {
    loginJson = JSON.parse(body);
  } catch {
    loginJson = null;
  }

  if (loginJson?.success) {
    if (loginJson.redirect_url) {
      cookieJar = await followRedirectCookies(loginJson.redirect_url, cookieJar);
      newCsrf = getCookieFromJar(cookieJar, "csrftoken") || newCsrf;
    }
    return { cookieJar, csrftoken: newCsrf };
  }

  let sessionid = getCookie(setCookies, "sessionid") || getCookieFromJar(cookieJar, "sessionid");
  if (!sessionid && loginJson?.redirect_url) {
    cookieJar = await followRedirectCookies(loginJson.redirect_url, cookieJar);
    newCsrf = getCookieFromJar(cookieJar, "csrftoken") || newCsrf;
    sessionid = getCookieFromJar(cookieJar, "sessionid");
  }

  if (sessionid) return { cookieJar, csrftoken: newCsrf };
  return null;
}

function mergeCookieJar(existing, setCookieHeaders) {
  const jar = new Map();
  for (const part of existing.split("; ").filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    if (name) jar.set(name, rest.join("="));
  }
  for (const line of setCookieHeaders) {
    const [pair] = line.split(";");
    const [name, ...rest] = pair.split("=");
    if (name) jar.set(name, rest.join("="));
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function obtainLoginCookies(authOrigin) {
  const targets = authOrigin.includes("campus.gov.il")
    ? [authOrigin, CAMPUS_COURSES].filter((v, i, a) => a.indexOf(v) === i)
    : [authOrigin];

  for (const origin of targets) {
    const loginPageRes = await fetch(`${origin}/login`, { redirect: "manual" });
    let setCookies = extractSetCookies(loginPageRes.headers);
    let csrftoken = getCookie(setCookies, "csrftoken");
    let cookieJar = setCookies.map((c) => c.split(";")[0]).join("; ");

    for (const version of ["v2", "v1"]) {
      const sessionRes = await fetch(`${origin}/api/user/${version}/account/login_session/`, {
        headers: { Cookie: cookieJar },
      });
      const sessionCookies = extractSetCookies(sessionRes.headers);
      cookieJar = mergeCookieJar(cookieJar, sessionCookies);
      csrftoken = getCookie(sessionCookies, "csrftoken") || csrftoken;
    }

    if (csrftoken) return { authOrigin: origin, cookieJar, csrftoken };
  }

  throw new Error(
    "Could not get csrftoken. For campus IL use LMS_BASE_URL=https://courses.campus.gov.il"
  );
}

const LOGIN_ATTEMPTS = (origin) =>
  origin.includes("campus.gov.il")
    ? [
        {
          label: "campus authn v2",
          version: "v2",
          referer: `${CAMPUS_APP}/authn/login`,
          body: new URLSearchParams({ email_or_username: USERNAME, password: PASSWORD, next: "/" }),
        },
        {
          label: "Open edX v2",
          version: "v2",
          referer: `${CAMPUS_COURSES}/login`,
          body: new URLSearchParams({ email_or_username: USERNAME, password: PASSWORD, next: "/" }),
        },
        {
          label: "Open edX v1",
          version: "v1",
          referer: `${CAMPUS_COURSES}/login`,
          body: new URLSearchParams({ email: USERNAME, password: PASSWORD }),
        },
      ]
    : [
        {
          label: "Open edX v2",
          version: "v2",
          referer: `${origin}/login`,
          body: new URLSearchParams({ email_or_username: USERNAME, password: PASSWORD, next: "/" }),
        },
        {
          label: "Open edX v1",
          version: "v1",
          referer: `${origin}/login`,
          body: new URLSearchParams({ email: USERNAME, password: PASSWORD }),
        },
      ];

async function login(apiOrigin) {
  if (!USERNAME || !PASSWORD) {
    throw new Error("Set LMS_USERNAME and LMS_PASSWORD env vars.");
  }

  const { authOrigin, cookieJar: initialJar, csrftoken } = await obtainLoginCookies(apiOrigin);
  const failures = [];

  for (const attempt of LOGIN_ATTEMPTS(apiOrigin)) {
    const loginRes = await fetch(
      `${authOrigin}/api/user/${attempt.version}/account/login_session/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": csrftoken,
          Cookie: initialJar,
          Referer: attempt.referer,
          Origin: new URL(attempt.referer).origin,
        },
        body: attempt.body,
        redirect: "manual",
      }
    );

    const setCookies2 = extractSetCookies(loginRes.headers);
    const body = await loginRes.text().catch(() => "");
    const finalized = await finalizeLoginSession(initialJar, setCookies2, csrftoken, body);
    if (finalized) return finalized;

    failures.push(`${attempt.label} (${loginRes.status}): ${body.slice(0, 160)}`);
  }

  throw new Error(`All login attempts failed.\n${failures.join("\n")}`);
}

async function main() {
  if (!COURSE_ID) {
    console.log("Set COURSE_ID to a real course key, e.g.:");
    console.log('  COURSE_ID="course-v1:TAU+ECON101+2026_S1" node check-one-thread.mjs');
    return;
  }

  const apiOrigin = resolveApiOrigin(LMS_BASE_URL);
  console.log(`Logging in to ${apiOrigin} as ${USERNAME}...`);
  const auth = await login(apiOrigin);
  console.log("Login OK.\n");

  const url = `${apiOrigin}/api/discussion/v1/threads/?course_id=${encodeURIComponent(
    COURSE_ID
  )}&order_by=last_activity_at&page_size=5`;

  console.log(`Fetching threads for ${COURSE_ID}...`);
  const res = await fetch(url, {
    headers: { Cookie: auth.cookieJar, "X-CSRFToken": auth.csrftoken },
  });

  console.log(`HTTP status: ${res.status}\n`);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Request failed.", body.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Total threads found: ${data.count ?? "(not reported)"}`);
  console.log(`Threads returned this page: ${(data.results || []).length}\n`);

  if (!data.results?.length) {
    console.log("No threads found in this course.");
    return;
  }

  console.log("=== First raw thread object ===\n");
  console.log(JSON.stringify(data.results[0], null, 2));
}

main().catch((err) => {
  console.error("\nScript failed:", err.message);
  process.exit(1);
});
