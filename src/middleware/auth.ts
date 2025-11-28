import type { Context, Next } from "hono";
import { createClient } from "@supabase/supabase-js";

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthVariables = {
  user: AuthUser;
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
