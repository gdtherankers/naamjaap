import * as oidc from "openid-client";
import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db, usersTable, localCredentialsTable, passwordResetTokensTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { sendPasswordResetEmail } from "../lib/email";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split(":");
  const salt = parts[0];
  const keyHex = parts[1];
  if (!salt || !keyHex) return false;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else {
        try {
          resolve(crypto.timingSafeEqual(Buffer.from(keyHex, "hex"), key));
        } catch {
          resolve(false);
        }
      }
    });
  });
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    authMethod: "oidc",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);

  const sid = getSessionId(req);

  // For local-auth users, just clear session and redirect home (no OIDC logout)
  const session = sid ? await import("../lib/auth").then(m => m.getSession(sid)) : null;
  if (session?.authMethod === "local") {
    await clearSession(res, sid);
    res.redirect("/");
    return;
  }

  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });

  res.redirect(endSessionUrl.href);
});

// ── Email / Password Auth ─────────────────────────────────────────────────────

router.post("/auth/local/register", async (req: Request, res: Response) => {
  const { email, password, name } = req.body ?? {};

  if (!email || !password || !name) {
    res.status(400).json({ error: "Email, password aur naam required hain" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password kam se kam 6 characters ka hona chahiye" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  // Check if email already registered
  const [existing] = await db
    .select()
    .from(localCredentialsTable)
    .where(eq(localCredentialsTable.email, normalizedEmail))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Is email se pehle se account bana hua hai. Login karein." });
    return;
  }

  // Also check if email used by an OIDC user
  const [oidcUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (oidcUser) {
    res.status(409).json({ error: "Is email se pehle se account bana hua hai. Google/Replit se login karein." });
    return;
  }

  const passwordHash = await hashPassword(String(password));

  const [newUser] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, firstName: String(name).trim() })
    .returning();

  await db.insert(localCredentialsTable).values({
    email: normalizedEmail,
    passwordHash,
    userId: newUser!.id,
  });

  const sessionData: SessionData = {
    user: {
      id: newUser!.id,
      email: newUser!.email,
      firstName: newUser!.firstName,
      lastName: newUser!.lastName,
      profileImageUrl: newUser!.profileImageUrl,
    },
    access_token: "local",
    authMethod: "local",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ success: true });
});

router.post("/auth/local/login", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "Email aur password required hain" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const [creds] = await db
    .select()
    .from(localCredentialsTable)
    .where(eq(localCredentialsTable.email, normalizedEmail))
    .limit(1);

  if (!creds) {
    res.status(401).json({ error: "Email ya password galat hai" });
    return;
  }

  const valid = await verifyPassword(String(password), creds.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Email ya password galat hai" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, creds.userId))
    .limit(1);

  if (!user) {
    res.status(500).json({ error: "User data nahi mila" });
    return;
  }

  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
    access_token: "local",
    authMethod: "local",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ success: true });
});

// ── Forgot Password ───────────────────────────────────────────────────────────

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email required hai" });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();

  // Always respond with success to prevent email enumeration
  res.json({ success: true });

  // Check if ANY account (local or OIDC) exists with this email (async, after response)
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user) return; // No account with this email — silently do nothing

    // Generate secure reset token
    const token = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing unused tokens for this email
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokensTable.email, normalizedEmail),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ),
      );

    await db.insert(passwordResetTokensTable).values({
      email: normalizedEmail,
      token,
      expiresAt,
    });

    // Build reset link
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost:80";
    const proto = domain.startsWith("localhost") ? "http" : "https";
    const resetLink = `${proto}://${domain}/reset-password?token=${token}`;

    await sendPasswordResetEmail(normalizedEmail, resetLink);
  } catch (err) {
    req.log?.error({ err }, "forgot-password background error");
  }
});

router.get("/auth/verify-reset-token", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  if (!token) { res.json({ valid: false }); return; }

  const [row] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, token))
    .limit(1);

  const valid = !!(row && !row.usedAt && row.expiresAt > new Date());
  res.json({ valid });
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const { token, newPassword } = req.body ?? {};
  if (!token || !newPassword) {
    res.status(400).json({ error: "Token aur new password required hain" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "Password kam se kam 6 characters ka hona chahiye" });
    return;
  }

  const [row] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, String(token)))
    .limit(1);

  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    res.status(400).json({ error: "Reset link expire ho gayi hai ya already use ho chuki hai" });
    return;
  }

  // Hash new password
  const newHash = await hashPassword(String(newPassword));

  // Check if local credentials already exist for this email
  const [existingCreds] = await db
    .select()
    .from(localCredentialsTable)
    .where(eq(localCredentialsTable.email, row.email))
    .limit(1);

  if (existingCreds) {
    // Local user — just update the existing password hash
    await db
      .update(localCredentialsTable)
      .set({ passwordHash: newHash })
      .where(eq(localCredentialsTable.email, row.email));
  } else {
    // OIDC user (Google/Replit) — look up their user record and create local credentials
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, row.email))
      .limit(1);

    if (!user) {
      res.status(400).json({ error: "Account nahi mila. Dobara try karein." });
      return;
    }

    await db.insert(localCredentialsTable).values({
      email: row.email,
      passwordHash: newHash,
      userId: user.id,
    });
  }

  // Mark token as used
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.token, String(token)));

  res.json({ success: true });
});

// ── Auth Method ───────────────────────────────────────────────────────────────

router.get("/auth/method", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (!sid) { res.json({ authMethod: null, hasLocalPassword: false }); return; }
  const session = await getSession(sid);

  if (!session) { res.json({ authMethod: null, hasLocalPassword: false }); return; }

  // Prefer explicitly stored authMethod; fall back to inferring from session shape.
  // Old OIDC sessions were saved without authMethod but always have access_token.
  let authMethod: "local" | "oidc" | null = session.authMethod ?? null;
  if (!authMethod) {
    authMethod = (session as unknown as Record<string, unknown>).access_token ? "oidc" : "local";
  }

  // Check whether this user has local credentials set (even OIDC users can set a password)
  let hasLocalPassword = false;
  if (req.isAuthenticated()) {
    const [creds] = await db
      .select({ id: localCredentialsTable.id })
      .from(localCredentialsTable)
      .where(eq(localCredentialsTable.userId, req.user.id))
      .limit(1);
    hasLocalPassword = !!creds;
  }

  res.json({ authMethod, hasLocalPassword });
});

// ── Change Password ───────────────────────────────────────────────────────────

router.post("/auth/change-password", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current password and new password required" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const [creds] = await db
    .select()
    .from(localCredentialsTable)
    .where(eq(localCredentialsTable.userId, req.user.id))
    .limit(1);

  if (!creds) {
    res.status(400).json({ error: "No local credentials found" });
    return;
  }

  const valid = await verifyPassword(String(currentPassword), creds.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await hashPassword(String(newPassword));
  await db
    .update(localCredentialsTable)
    .set({ passwordHash: newHash })
    .where(eq(localCredentialsTable.userId, req.user.id));

  res.json({ success: true });
});

// ── Set Password (OIDC users setting a password for the first time) ──────────

router.post("/auth/set-password", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { newPassword } = req.body ?? {};
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  // Check if user already has local credentials — if so, use change-password instead
  const [existing] = await db
    .select()
    .from(localCredentialsTable)
    .where(eq(localCredentialsTable.userId, req.user.id))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "You already have a password set. Use change password instead." });
    return;
  }

  // Get user email from usersTable
  const [userRecord] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id))
    .limit(1);

  if (!userRecord?.email) {
    res.status(400).json({ error: "No email found on your account." });
    return;
  }

  const hash = await hashPassword(newPassword);
  await db.insert(localCredentialsTable).values({
    email: userRecord.email,
    passwordHash: hash,
    userId: req.user.id,
  });

  res.json({ success: true });
});

// ── Mobile Auth ───────────────────────────────────────────────────────────────

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
        authMethod: "oidc",
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
