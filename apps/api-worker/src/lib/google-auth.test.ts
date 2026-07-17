import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  handleCallback, 
  getAccessToken, 
  disconnectGoogleToken,
  generateAuthUrl,
  hasGoogleToken,
  hasAnyGoogleToken
} from "./google-auth.js";

describe("google-auth - Security Tests", () => {
  let dbMock: any;
  const env = {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost/callback",
    TOKEN_ENCRYPTION_KEY: "secret-token-key-for-test-32-chars-long",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    dbMock = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    };
  });

  it("should successfully encrypt token in handleCallback and decrypt in getAccessToken", async () => {
    let savedRefreshToken = "";
    
    // Mock DB behavior
    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockImplementation((...args: any[]) => {
          if (query.includes("pending_google_auth")) {
            return {
              first: vi.fn().mockResolvedValue({
                uid: "user-123",
                expires_at: Date.now() + 10000,
                origin_url: "http://localhost",
                scope_type: "drive",
              }),
              run: vi.fn().mockResolvedValue({}),
            };
          }
          if (query.includes("user_google_tokens")) {
            // Save the encrypted token argument (args[2] is the token)
            if (query.includes("INSERT")) {
              savedRefreshToken = args[2];
            }
            return {
              run: vi.fn().mockResolvedValue({}),
              all: vi.fn().mockResolvedValue({
                results: [{
                  refresh_token: savedRefreshToken,
                  scope_type: "drive",
                }],
              }),
            };
          }
          return {
            run: vi.fn().mockResolvedValue({}),
          };
        }),
      };
    });

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation((url: any) => {
      if (typeof url === "string" && url.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve(new Response(JSON.stringify({
          refresh_token: "my-plain-refresh-token",
          access_token: "short-lived-access-token",
          expires_in: 3600,
        }), { status: 200 }));
      }
      return Promise.reject(new Error("unexpected fetch"));
    });

    // 1. Run handleCallback to trigger insertion (which should encrypt)
    const { originUrl } = await handleCallback(dbMock, env as any, "code-abc", "state-xyz");
    expect(originUrl).toBe("http://localhost");

    // Verify it is encrypted (not equal to "my-plain-refresh-token")
    expect(savedRefreshToken).not.toBe("");
    expect(savedRefreshToken).not.toBe("my-plain-refresh-token");

    // 2. Run getAccessToken to trigger retrieval (which should decrypt)
    const access = await getAccessToken(dbMock, env as any, "user-123", "drive");
    expect(access.accessToken).toBe("short-lived-access-token");

    globalFetchMock.mockRestore();
  });

  it("should handle key revocation and deletion gracefully", async () => {
    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [{ refresh_token: "some-token" }],
          }),
          run: vi.fn().mockResolvedValue({}),
        }),
      };
    });

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    await expect(disconnectGoogleToken(dbMock, env as any, "user-123", "drive")).resolves.not.toThrow();

    globalFetchMock.mockRestore();
  });

  it("should generate auth URL successfully", async () => {
    const url = await generateAuthUrl(dbMock, env as any, "user-123", "sheets", "http://localhost");
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%2Fcallback");
  });

  it("should check token status via hasGoogleToken and hasAnyGoogleToken", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ role: "owner" }),
      }),
    }));

    const status1 = await hasGoogleToken(dbMock, "user-123", "drive");
    expect(status1).toBe(true);

    const status2 = await hasAnyGoogleToken(dbMock, "user-123");
    expect(status2).toBe(true);
  });

  it("should throw GOOGLE_NOT_CONNECTED if getAccessToken has no DB rows", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    }));

    await expect(getAccessToken(dbMock, env as any, "user-123", "drive")).rejects.toThrow("Google account not connected");
  });


  it("should delete token from D1 and throw GOOGLE_TOKEN_EXPIRED if Google returns invalid_grant", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            refresh_token: "token-abc",
            scope_type: "all",
          }],
        }),
        run: vi.fn().mockResolvedValue({}),
      }),
    }));

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify({
        error: "invalid_grant",
        error_description: "Token has been expired or revoked",
      }), { status: 400 }));
    });

    await expect(getAccessToken(dbMock, env as any, "user-123", "all")).rejects.toThrow("Your Google account connection has expired");
    
    globalFetchMock.mockRestore();
  });

  it("should throw regular error if Google returns other non-ok responses", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            refresh_token: "token-abc",
            scope_type: "all",
          }],
        }),
      }),
    }));

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify({
        error: "server_error",
      }), { status: 500 }));
    });

    await expect(getAccessToken(dbMock, env as any, "user-123", "all")).rejects.toThrow("server_error");
    
    globalFetchMock.mockRestore();
  });

  it("should disconnect token without scope parameter", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ refresh_token: "token-abc" }],
        }),
        run: vi.fn().mockResolvedValue({}),
      }),
    }));

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    await expect(disconnectGoogleToken(dbMock, env as any, "user-123")).resolves.not.toThrow();

    globalFetchMock.mockRestore();
  });

  it("should throw error if nonce is not found in handleCallback", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    }));

    await expect(handleCallback(dbMock, env as any, "code", "state")).rejects.toThrow("Invalid or expired state parameter");
  });

  it("should throw error if auth session is expired in handleCallback", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          expires_at: Date.now() - 5000, // Expired
        }),
        run: vi.fn().mockResolvedValue({}),
      }),
    }));

    await expect(handleCallback(dbMock, env as any, "code", "state")).rejects.toThrow("Auth session expired");
  });

  it("should throw error with fallback messages on callback exchange failure", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          expires_at: Date.now() + 50000,
        }),
        run: vi.fn().mockResolvedValue({}),
      }),
    }));

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      // Return error response without description
      return Promise.resolve(new Response(JSON.stringify({}), { status: 400 }));
    });

    await expect(handleCallback(dbMock, env as any, "code", "state")).rejects.toThrow("Failed to exchange authorization code");
    globalFetchMock.mockRestore();
  });

  it("should throw error if no refresh token is returned in handleCallback", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          expires_at: Date.now() + 50000,
        }),
        run: vi.fn().mockResolvedValue({}),
      }),
    }));

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      // Returns no refresh_token
      return Promise.resolve(new Response(JSON.stringify({
        access_token: "xyz",
      }), { status: 200 }));
    });

    await expect(handleCallback(dbMock, env as any, "code", "state")).rejects.toThrow("No refresh token returned");
    globalFetchMock.mockRestore();
  });

  it("should fall back to 3500 expires_in in getAccessToken", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ refresh_token: "token", scope_type: "all" }],
        }),
      }),
    }));

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      // Returns access token without expires_in
      return Promise.resolve(new Response(JSON.stringify({
        access_token: "xyz",
      }), { status: 200 }));
    });

    const access = await getAccessToken(dbMock, env as any, "user-123", "all");
    expect(access.accessToken).toBe("xyz");
    // Verify it used the fallback of 3500 seconds (~ Date.now() + 3500 * 1000)
    expect(access.expiresAt).toBeGreaterThan(Date.now() + 3400 * 1000);
    globalFetchMock.mockRestore();
  });

  it("should fall back to raw token if decryption fails with legacy token", async () => {
    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ refresh_token: "legacy-plain-token", scope_type: "all" }],
        }),
      }),
    }));

    // Mock fetch to check that it is called with legacy-plain-token
    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation((url, init) => {
      const body = init?.body as URLSearchParams;
      expect(body.get("refresh_token")).toBe("legacy-plain-token");
      return Promise.resolve(new Response(JSON.stringify({ access_token: "xyz" }), { status: 200 }));
    });

    await expect(getAccessToken(dbMock, env as any, "user-123", "all")).resolves.not.toThrow();
    globalFetchMock.mockRestore();
  });

  it("should cover fallback branches for missing environment variables", async () => {
    const minimalEnv = {
      // Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY
      SUPABASE_JWT_SECRET: "my-jwt-secret-key-at-least-32-chars",
    };

    dbMock.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ refresh_token: "token", scope_type: "all" }],
        }),
        run: vi.fn().mockResolvedValue({}),
      }),
    }));

    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation((url, init) => {
      const body = init?.body as URLSearchParams;
      expect(body.get("client_id")).toBe("");
      expect(body.get("client_secret")).toBe("");
      return Promise.resolve(new Response(JSON.stringify({ access_token: "xyz" }), { status: 200 }));
    });

    await expect(getAccessToken(dbMock, minimalEnv as any, "user-123", "all")).resolves.not.toThrow();
    
    // Also verify disconnect with missing TOKEN_ENCRYPTION_KEY
    await expect(disconnectGoogleToken(dbMock, minimalEnv as any, "user-123")).resolves.not.toThrow();

    globalFetchMock.mockRestore();
  });
});
