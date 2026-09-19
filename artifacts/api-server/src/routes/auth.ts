import { Router, type IRouter, type Request, type Response } from "express";
import {
  AuthGetMeResponse,
  AuthLogInBody,
  AuthLogInResponse,
  AuthSignUpBody,
  AuthSignUpResponse,
  AuthUpdateProfileBody,
  AuthUpdateProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseSession {
  access_token?: string;
  refresh_token?: string;
  user?: SupabaseUser;
}

interface SupabaseError extends Error {
  status?: number;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
    ?.replace(/\/+$/, "")
    .replace(/\/(?:rest|auth)\/v1$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  try {
    const config = getSupabaseConfig();
    if (!config) {
      const error: SupabaseError = new Error("Supabase is not configured.");
      error.status = 503;
      throw error;
    }

    const response = await fetch(`${config.url}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken ?? config.anonKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error_description?: string;
      msg?: string;
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      const error: SupabaseError = new Error(
        payload.error_description || payload.msg || payload.message || payload.error || "Supabase request failed.",
      );
      error.status = response.status;
      throw error;
    }
    return payload as T;
  } catch (error) {
    throw error;
  }
}

function toProfile(user: SupabaseUser) {
  const metadata = user.user_metadata ?? {};
  const name =
    typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : user.email?.split("@")[0] || "Food safety profile";
  const allergies = Array.isArray(metadata.allergies)
    ? metadata.allergies.filter((value): value is string => typeof value === "string")
    : [];

  return {
    id: user.id,
    name,
    email: user.email ?? "",
    allergies,
  };
}

function sessionResponse(session: SupabaseSession) {
  return {
    accessToken: session.access_token ?? null,
    refreshToken: session.refresh_token ?? null,
    profile: session.user ? toProfile(session.user) : null,
    requiresEmailConfirmation: !session.access_token,
  };
}

function sendAuthError(res: Response, error: unknown) {
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: number }).status)
    : 503;
  if (status === 400 || status === 401) {
    res.status(status).json({ message: error instanceof Error ? error.message : "Invalid account details." });
    return;
  }
  res.status(503).json({ message: "Profile service is unavailable. You can continue using recall checks as a guest." });
}

router.post("/auth/signup", async (req, res) => {
  const parsed = AuthSignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid email, password, and name." });
    return;
  }

  try {
    const payload = await supabaseRequest<SupabaseSession>("/signup", {
      method: "POST",
      body: JSON.stringify({
        email: parsed.data.email,
        password: parsed.data.password,
        data: {
          name: parsed.data.name?.trim() || parsed.data.email.split("@")[0],
          allergies: [],
        },
      }),
    });
    res.json(AuthSignUpResponse.parse(sessionResponse(payload)));
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = AuthLogInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid email and password." });
    return;
  }

  try {
    const payload = await supabaseRequest<SupabaseSession>("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({
        email: parsed.data.email,
        password: parsed.data.password,
      }),
    });
    res.json(AuthLogInResponse.parse(sessionResponse(payload)));
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.get("/auth/me", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "A profile session is required." });
    return;
  }

  try {
    const user = await supabaseRequest<SupabaseUser>("/user", {}, token);
    res.json(AuthGetMeResponse.parse(toProfile(user)));
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.put("/auth/profile", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "A profile session is required." });
    return;
  }

  const parsed = AuthUpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose at least one valid profile preference." });
    return;
  }

  try {
    const currentUser = await supabaseRequest<SupabaseUser>("/user", {}, token);
    const currentMetadata = currentUser.user_metadata ?? {};
    const user = await supabaseRequest<SupabaseUser>(
      "/user",
      {
        method: "PUT",
        body: JSON.stringify({
          data: {
            ...currentMetadata,
            ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
            allergies: parsed.data.allergies,
          },
        }),
      },
      token,
    );
    res.json(AuthUpdateProfileResponse.parse(toProfile(user)));
  } catch (error) {
    sendAuthError(res, error);
  }
});

export default router;