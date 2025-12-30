import type { Context, Next } from "hono";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { db, publisherApiKeys } from "../db/index.ts";
import { eq, and, gt } from "drizzle-orm";

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthPublisher = {
  id: string;
  userId: string;
  slug: string;
};

export type AuthVariables = {
  user: AuthUser;
  publisher?: AuthPublisher;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set");
}

/**
 * Middleware that requires authentication
 * Sets user in context
 */
export async function requireAuthAsync(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  // Create Supabase client to verify token
  const supabase = createClient(supabaseUrl!, supabasePublishableKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Verify the token by getting the user
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Set user in context
  c.set("user", { id: user.id, email: user.email });

  await next();
}

/**
 * Middleware that optionally authenticates
 * Sets user if token is valid, otherwise continues without user
 */
export async function optionalAuthAsync(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    const supabase = createClient(supabaseUrl!, supabasePublishableKey!, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (user) {
      c.set("user", { id: user.id, email: user.email });
    }
  }

  await next();
}

/**
 * Middleware that authenticates using API key (for CLI/CI)
 * API keys start with "hxmp_" prefix
 * Falls back to Supabase auth if not an API key
 */
export async function requireApiKeyOrAuthAsync(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  // Check if it's an API key (starts with hxmp_)
  if (token.startsWith("hxmp_")) {
    // Hash the provided key
    const keyHash = createHash("sha256").update(token).digest("hex");

    // Find the API key and check expiry
    const apiKey = await db.query.publisherApiKeys.findFirst({
      where: and(
        eq(publisherApiKeys.keyHash, keyHash),
        gt(publisherApiKeys.expiresAt, new Date())
      ),
      with: {
        publisher: true,
      },
    });

    if (!apiKey) {
      return c.json({ error: "Invalid or expired API key" }, 401);
    }

    // Update last used timestamp (fire and forget)
    db.update(publisherApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(publisherApiKeys.id, apiKey.id))
      .catch(() => {}); // Ignore errors

    // Set publisher context (API keys are publisher-scoped)
    c.set("publisher", {
      id: apiKey.publisher.id,
      userId: apiKey.publisher.userId,
      slug: apiKey.publisher.slug,
    });

    // Also set user context for compatibility
    c.set("user", { id: apiKey.publisher.userId });

    await next();
    return;
  }

  // Fall back to Supabase auth
  return requireAuthAsync(c, next);
}
