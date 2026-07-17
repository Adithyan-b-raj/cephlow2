import type { Env } from "../types.js";
import { timingSafeEqual } from "./security.js";

function getBaseUrl(env: Env): string {
  const isProduction = env.VITE_CASHFREE_ENV === "PRODUCTION";
  return isProduction ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

function getHeaders(env: Env) {
  return {
    "x-client-id": env.CASHFREE_APP_ID || "",
    "x-client-secret": env.CASHFREE_SECRET_KEY || "",
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
  };
}

export async function createCashfreeOrder(
  env: Env,
  {
    orderId,
    amount,
    customerId,
    customerPhone,
    customerEmail,
    returnUrl,
  }: {
    orderId: string;
    amount: number;
    customerId: string;
    customerPhone: string;
    customerEmail: string;
    returnUrl: string;
  }
) {
  const url = `${getBaseUrl(env)}/orders`;
  const body = {
    order_id: orderId,
    order_amount: amount,
    order_currency: "INR",
    customer_details: {
      customer_id: customerId,
      customer_phone: customerPhone,
      customer_email: customerEmail,
    },
    order_meta: {
      return_url: returnUrl,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(env),
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    throw new Error(data.message || `Cashfree API error: ${res.status}`);
  }

  return {
    payment_session_id: data.payment_session_id,
    order_id: data.order_id,
  };
}

export async function fetchCashfreeOrder(env: Env, orderId: string) {
  const url = `${getBaseUrl(env)}/orders/${orderId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders(env),
  });

  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    throw new Error(data.message || `Cashfree API error: ${res.status}`);
  }

  return {
    order_id: data.order_id,
    order_status: data.order_status,
    order_amount: data.order_amount,
  };
}

// Verifies Cashfree webhook signature using Web Crypto API
export async function verifyWebhookSignature(
  signature: string,
  rawBody: string,
  timestamp: string,
  secretKey: string
): Promise<boolean> {
  try {
    const messageStr = timestamp + rawBody;
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(secretKey);
    const messageBytes = encoder.encode(messageStr);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      messageBytes
    );

    // Convert signatureBuffer to Base64
    const sigBytes = new Uint8Array(signatureBuffer);
    let binary = "";
    for (let i = 0; i < sigBytes.byteLength; i++) {
      binary += String.fromCharCode(sigBytes[i]);
    }
    const computedSignature = btoa(binary);

    return timingSafeEqual(signature, computedSignature);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}
