import {
  HYP_SANDBOX_RECOMMENDED_AMOUNT_NIS,
  HYP_SANDBOX_SUCCESS_CARD,
  isHypTestTerminalMasof
} from "@/lib/billing/hyp/sandbox-test-cards";

import {
  buildHypPaymentMethodSignEntries
} from "@/lib/billing/hyp/payment-method-flags";

/**
 * HYP Pay APISign integration.
 *
 * PAYMENT SAFETY RULES:
 *
 * 1. AnyNanny requires a trusted return URL from HYP.
 * 2. We never convert iframe navigation into payment success.
 * 3. We never retry CCode=902 by silently removing SuccessUrl/ErrorUrl.
 * 4. Booking/session are finalized only after an explicit successful
 *    payment response is received by the completion flow.
 */

export type HypCredentials = {
  /** Terminal ID -> Masof */
  masof: string;

  /** Dashboard/API user */
  user: string;

  /** API signature key -> KEY */
  key: string;

  /** API password -> PassP */
  passP: string;

  payBaseUrl: string;
};

export type HypCreateTransactionInput = {
  amountNis: number;

  bookingId: string;

  /**
   * AnyNanny Double-Shake Session ID.
   * Sent as MoreData so it can be recovered on HYP return.
   */
  shiftSessionId?: string | null;

  description?: string;

  paymentMethod?: string;

  pageLang?: "HEB" | "ENG";

  userId?: string | null;

  clientName?: string | null;

  clientLastName?: string | null;

  /**
   * AnyNanny payment-success return target.
   */
  successUrl?: string | null;

  /**
   * AnyNanny payment failure/cancel return target.
   */
  cancelUrl?: string | null;

  /**
   * Retained only for compatibility.
   *
   * Normal checkout flows should never set this to true.
   */
  omitReturnUrls?: boolean;

  /**
   * Identity-verification only. Leave unset on checkout/deposit/payout.
   *
   * HYP Pay APISign: `J5=True` is J5 authorization; `J5=J2` is card
   * verification without charge.
   */
  j5?: "J2" | "True" | boolean | null;

  /**
   * Identity-verification only. Leave unset on checkout.
   *
   * HYP Pay: `MoreData=True` adds extra redirect fields such as `UserId`.
   * Checkout already uses `MoreData` for `Session_<uuid>` and must not set this.
   */
  includeMoreData?: boolean;

  /**
   * Identity-verification only. Overrides compact Order derived from bookingId.
   * Used as the unique per-attempt merchant reference (max 19 chars for inquiry `user`).
   * Checkout must leave this unset.
   */
  orderOverride?: string | null;

  /**
   * Identity-verification only. Echoed as Fild2 so the return can correlate the attempt.
   * Checkout must leave this unset.
   */
  fild2?: string | null;
};

export type HypCreateTransactionResult = {
  checkoutUrl: string;
  sessionId: string;
  signedQuery: string;
  order: string;
};

const PAY_HOST =
  "https://pay.hyp.co.il/p/";

const HYP_FETCH_TIMEOUT_MS =
  20_000;

/**
 * Compatibility export.
 *
 * Real credentials must come from Environment Variables.
 */
export const HYP_DASHBOARD_API_CREDENTIALS = {
  masof:
    String(
      process.env.HYP_MASOF ??
        process.env.HYP_TERMINAL_ID ??
        ""
    ).trim(),

  user:
    String(
      process.env.HYP_USER ??
        process.env.HYP_USERNAME ??
        ""
    ).trim(),

  passP:
    String(
      process.env.HYP_PASSP ??
        ""
    ).trim(),

  key:
    String(
      process.env.HYP_API_KEY ??
        process.env.HYP_KEY ??
        ""
    ).trim()
} as const;

function envFlag(
  name: string
): boolean {
  const value =
    String(
      process.env[name] ??
        ""
    )
      .trim()
      .toLowerCase();

  return (
    value === "1" ||
    value === "true" ||
    value === "yes"
  );
}

function trimEnv(
  name: string
): string {
  return String(
    process.env[name] ??
      ""
  ).trim();
}

function resolvePayBaseUrl(): string {
  const raw =
    trimEnv(
      "HYP_PAY_BASE_URL"
    ) ||
    trimEnv(
      "HYP_API_URL"
    ) ||
    PAY_HOST;

  /*
   * APISign hosted pay page uses /p/.
   */
  if (
    /sandbox\.hyp\.co\.il\/api/i.test(
      raw
    ) ||
    /\/api\/v1\/payment/i.test(
      raw
    )
  ) {
    return PAY_HOST;
  }

  try {
    const url =
      new URL(
        raw.includes(
          "://"
        )
          ? raw
          : `https://${raw}`
      );

    if (
      !url.pathname ||
      url.pathname ===
        "/"
    ) {
      url.pathname =
        "/p/";
    }

    url.search = "";
    url.hash = "";

    const href =
      url.toString();

    return href.endsWith(
      "/"
    )
      ? href
      : `${href}/`;
  } catch {
    return PAY_HOST;
  }
}

/**
 * Resolve HYP credentials from environment variables.
 */
export function getHypCredentials(): HypCredentials {
  const masof =
    trimEnv(
      "HYP_MASOF"
    ) ||
    trimEnv(
      "HYP_TERMINAL_ID"
    );

  const key =
    trimEnv(
      "HYP_API_KEY"
    ) ||
    trimEnv(
      "HYP_KEY"
    );

  const passP =
    trimEnv(
      "HYP_PASSP"
    );

  const user =
    trimEnv(
      "HYP_USER"
    ) ||
    trimEnv(
      "HYP_USERNAME"
    );

  const resolved:
    HypCredentials = {
    masof,
    user,
    key,
    passP,

    payBaseUrl:
      resolvePayBaseUrl()
  };

  if (
    !resolved.masof ||
    !resolved.key ||
    !resolved.passP
  ) {
    throw new Error(
      "HYP credentials incomplete. HYP_MASOF, HYP_API_KEY and HYP_PASSP are required."
    );
  }

  if (
    resolved.key.length <
    16
  ) {
    throw new Error(
      "HYP_API_KEY appears invalid or incomplete."
    );
  }

  return resolved;
}

export function isHypConfigured(): boolean {
  try {
    const credentials =
      getHypCredentials();

    return Boolean(
      credentials.masof &&
        credentials.key &&
        credentials.passP
    );
  } catch {
    return false;
  }
}

/**
 * Detect sandbox/test mode.
 */
export function isHypSandboxMode(
  creds?: HypCredentials
): boolean {
  if (
    envFlag(
      "HYP_TEST_MODE"
    ) ||
    envFlag(
      "HYP_SANDBOX"
    )
  ) {
    return true;
  }

  try {
    const credentials =
      creds ??
      getHypCredentials();

    return isHypTestTerminalMasof(
      credentials.masof
    );
  } catch {
    return false;
  }
}

function formatHypAmount(
  amountNis: number
): string {
  const amount =
    Math.max(
      0.5,
      Number(
        amountNis
      ) || 0
    );

  return Number.isInteger(
    amount
  )
    ? String(amount)
    : amount.toFixed(
        2
      );
}

/**
 * HYP Order is intentionally compact.
 *
 * Full Booking UUID is kept in Info.
 */
function hypOrderFromBookingId(
  bookingId: string
): string {
  const compact =
    bookingId.replace(
      /[^a-zA-Z0-9]/g,
      ""
    );

  return (
    compact ||
    `ord${Date.now()}`.slice(
      0,
      20
    )
  );
}

function hypTrueFalse(
  value: boolean
): "True" | "False" {
  return value
    ? "True"
    : "False";
}

/**
 * Build application/x-www-form-urlencoded
 * while preserving parameter insertion order.
 */
function encodeHypForm(
  entries: Array<
    [string, string]
  >
): string {
  return entries
    .filter(
      ([, value]) =>
        value !==
          undefined &&
        value !==
          null &&
        String(
          value
        ).length >
          0
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(
          key
        )}=${encodeURIComponent(
          String(value)
        )}`
    )
    .join("&");
}

function readCCode(
  body: string
): string | null {
  const match =
    body.match(
      /(?:^|&)CCode=([^&]*)/i
    );

  return match
    ? decodeURIComponent(
        match[1] ??
          ""
      ).trim()
    : null;
}

function isSuccessfulCCode(
  value:
    | string
    | null
): boolean {
  const code =
    String(
      value ?? ""
    ).trim();

  return (
    code === "0" ||
    code === "00"
  );
}

/**
 * Validates APISign result.
 *
 * This does NOT mean the card payment itself succeeded.
 * It only means HYP accepted the APISign request.
 */
function isHypSignSuccessBody(
  body: string
): boolean {
  const text =
    body
      .trim()
      .replace(
        /^\?/,
        ""
      );

  if (!text) {
    return false;
  }

  const cCode =
    readCCode(
      text
    );

  if (
    cCode != null &&
    cCode !== "" &&
    !isSuccessfulCCode(
      cCode
    )
  ) {
    return false;
  }

  if (
    /^error[=:]/i.test(
      text
    )
  ) {
    return false;
  }

  return (
    /(?:^|&)signature=/i.test(
      text
    ) ||
    /(?:^|&)action=pay(?:&|$)/i.test(
      text
    )
  );
}

function authFailureMessage(
  body: string
): string {
  const cCode =
    readCCode(
      body
    );

  if (
    cCode ===
    "902"
  ) {
    return (
      "HYP authentication failed (CCode=902): " +
      "the SuccessUrl/ErrorUrl origin is not allowed by the HYP terminal. " +
      "Configure/whitelist the AnyNanny HTTPS return domain in HYP. " +
      "Checkout will not continue without a trusted return URL."
    );
  }

  if (cCode) {
    return (
      `HYP APISign rejected the request (CCode=${cCode}): ` +
      body.slice(
        0,
        160
      )
    );
  }

  return body
    ? `HYP APISign rejected the request: ${body.slice(
        0,
        180
      )}`
    : "HYP APISign returned an empty response.";
}

/**
 * Remove KEY and PassP before exposing the payment URL
 * to the browser.
 */
export function stripSecretsPreserveOrder(
  signedQuery: string
): string {
  return signedQuery
    .replace(
      /^\?/,
      ""
    )
    .split("&")
    .filter(
      (part) => {
        const key =
          decodeURIComponent(
            (
              part.split(
                "="
              )[0] ??
              ""
            ).replace(
              /\+/g,
              " "
            )
          );

        return (
          key !== "KEY" &&
          key !== "PassP" &&
          key !== "Key" &&
          key !== "Passp"
        );
      }
    )
    .join("&");
}

/**
 * Build official HYP APISign parameters.
 */
export function buildHypApiSignEntries(
  creds: HypCredentials,
  input: HypCreateTransactionInput,
  order: string
): Array<[string, string]> {
  const amount =
    formatHypAmount(
      input.amountNis
    );

  const includeUser =
    envFlag(
      "HYP_INCLUDE_USER_IN_APISIGN"
    );

  const entries:
    Array<
      [string, string]
    > = [
    [
      "action",
      "APISign"
    ],
    [
      "What",
      "SIGN"
    ],
    [
      "Sign",
      hypTrueFalse(
        true
      )
    ],
    [
      "Masof",
      creds.masof
    ],
    [
      "KEY",
      creds.key
    ],
    [
      "PassP",
      creds.passP
    ]
  ];

  if (
    includeUser &&
    creds.user
  ) {
    entries.push([
      "User",
      creds.user
    ]);
  }

  entries.push(
    [
      "Amount",
      amount
    ],
    [
      "Coin",
      "1"
    ],
    [
      "Order",
      order
    ],

    /**
     * Full Booking UUID.
     */
    [
      "Info",
      input.bookingId
    ],

    [
      "PageLang",
      input.pageLang ??
        "HEB"
    ],
    [
      "UTF8",
      hypTrueFalse(
        true
      )
    ],
    [
      "UTF8out",
      hypTrueFalse(
        true
      )
    ],
    [
      "Tash",
      "1"
    ]
  );

  /**
   * Payment rail flags:
   * credit card / Bit / PayBox.
   */
  for (
    const entry
    of buildHypPaymentMethodSignEntries(
      input.paymentMethod
    )
  ) {
    const key =
      entry[0];

    if (
      key ===
      "Tash"
    ) {
      const existing =
        entries.findIndex(
          ([existingKey]) =>
            existingKey ===
            "Tash"
        );

      if (
        existing >=
        0
      ) {
        entries[
          existing
        ] = entry;
      } else {
        entries.push(
          entry
        );
      }

      continue;
    }

    entries.push(
      entry
    );
  }

  const sandbox =
    isHypSandboxMode(
      creds
    );

  const userId =
    input.userId?.trim() ||
    (
      sandbox
        ? HYP_SANDBOX_SUCCESS_CARD.israeliId
        : ""
    ) ||
    "";

  if (userId) {
    entries.push([
      "UserId",
      userId
    ]);
  }

  if (
    input.clientName?.trim()
  ) {
    entries.push([
      "ClientName",
      input.clientName
        .trim()
        .slice(
          0,
          50
        )
    ]);
  } else if (
    sandbox
  ) {
    entries.push([
      "ClientName",
      "AnyNanny"
    ]);
  }

  if (
    input.clientLastName?.trim()
  ) {
    entries.push([
      "ClientLName",
      input.clientLastName
        .trim()
        .slice(
          0,
          50
        )
    ]);
  } else if (
    sandbox
  ) {
    entries.push([
      "ClientLName",
      "Sandbox"
    ]);
  }

  if (
    sandbox &&
    Number(amount) >
      HYP_SANDBOX_RECOMMENDED_AMOUNT_NIS *
        5
  ) {
    console.warn(
      `[HYP] Sandbox amount ${amount} NIS is high. ` +
        `Recommended test amount is around ${HYP_SANDBOX_RECOMMENDED_AMOUNT_NIS} NIS.`
    );
  }

  const shiftSessionId =
    input.shiftSessionId?.trim();

  if (
    shiftSessionId
  ) {
    /**
     * Allows AnyNanny to recover the exact Session
     * after HYP returns.
     */
    entries.push([
      "MoreData",
      `Session_${shiftSessionId}`
    ]);
  } else if (
    input.includeMoreData
  ) {
    entries.push([
      "MoreData",
      "True"
    ]);
  }

  if (
    input.j5 ===
      "J2"
  ) {
    entries.push([
      "J5",
      "J2"
    ]);
  } else if (
    input.j5 ===
      true ||
    input.j5 ===
      "True"
  ) {
    entries.push([
      "J5",
      "True"
    ]);
  }

  if (
    input.description?.trim()
  ) {
    entries.push([
      "Fild1",
      input.description
        .trim()
        .slice(
          0,
          100
        )
    ]);
  }

  if (
    input.fild2?.trim()
  ) {
    entries.push([
      "Fild2",
      input.fild2.trim().slice(0, 19)
    ]);
  }

  /**
   * Trusted return URLs.
   */
  const successUrl =
    input.successUrl?.trim() ??
    "";

  const cancelUrl =
    input.cancelUrl?.trim() ??
    "";

  if (
    !input.omitReturnUrls
  ) {
    if (
      successUrl
    ) {
      entries.push([
        "SuccessUrl",
        successUrl
      ]);
    }

    if (
      cancelUrl
    ) {
      entries.push([
        "ErrorUrl",
        cancelUrl
      ]);

      entries.push([
        "CancelUrl",
        cancelUrl
      ]);
    }
  }

  return entries;
}

async function requestApiSign(
  payBaseUrl: string,
  formBody: string,
  method:
    | "GET"
    | "POST",
  signal: AbortSignal
): Promise<string> {
  if (
    method ===
    "POST"
  ) {
    const response =
      await fetch(
        payBaseUrl,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",

            Accept:
              "text/plain,*/*"
          },

          body:
            formBody,

          redirect:
            "follow",

          signal,

          cache:
            "no-store"
        }
      );

    const text =
      await response.text();

    if (
      !response.ok
    ) {
      throw new Error(
        `HYP APISign HTTP ${response.status}`
      );
    }

    return text;
  }

  const response =
    await fetch(
      `${payBaseUrl}?${formBody}`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "text/plain,*/*"
        },

        redirect:
          "follow",

        signal,

        cache:
          "no-store"
      }
    );

  const text =
    await response.text();

  if (
    !response.ok
  ) {
    throw new Error(
      `HYP APISign HTTP ${response.status}`
    );
  }

  return text;
}

/**
 * Create HYP hosted checkout:
 *
 * APISign -> signed HYP query -> hosted payment URL.
 */
export async function createHypTransaction(
  input: HypCreateTransactionInput
): Promise<HypCreateTransactionResult> {
  const creds =
    getHypCredentials();

  const order =
    input.orderOverride?.trim() ||
    hypOrderFromBookingId(
      input.bookingId
    );

  if (
    !input.successUrl?.trim() &&
    !input.omitReturnUrls
  ) {
    throw new Error(
      "HYP checkout requires a SuccessUrl. Payment cannot start without a trusted AnyNanny return URL."
    );
  }

  /**
   * TEMPORARY DIAGNOSTIC LOG
   *
   * Shows the return URLs supplied by AnyNanny BEFORE APISign.
   */
  console.info(
    "[HYP] return URL debug",
    {
      bookingId:
        input.bookingId,

      successUrl:
        input.successUrl ??
        null,

      cancelUrl:
        input.cancelUrl ??
        null,

      omitReturnUrls:
        Boolean(
          input.omitReturnUrls
        )
    }
  );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () =>
        controller.abort(),
      HYP_FETCH_TIMEOUT_MS
    );

  async function signOnce(
    omitReturnUrls: boolean
  ): Promise<string> {
    const entries =
      buildHypApiSignEntries(
        creds,
        {
          ...input,
          omitReturnUrls
        },
        order
      );

    const formBody =
      encodeHypForm(
        entries
      );

    let raw = "";

    let lastError:
      unknown = null;

    for (
      const method
      of [
        "GET",
        "POST"
      ] as const
    ) {
      try {
        raw =
          await requestApiSign(
            creds.payBaseUrl,
            formBody,
            method,
            controller.signal
          );

        if (
          isHypSignSuccessBody(
            raw
          )
        ) {
          return raw
            .trim()
            .replace(
              /^\?/,
              ""
            );
        }

        lastError =
          new Error(
            authFailureMessage(
              raw.trim()
            )
          );

        if (
          readCCode(
            raw
          ) ===
          "902"
        ) {
          throw lastError;
        }
      } catch (
        error
      ) {
        lastError =
          error;

        const message =
          error instanceof
          Error
            ? error.message
            : String(error);

        /**
         * We never work around a rejected return URL
         * by removing it.
         */
        if (
          /CCode=902|origin does not match/i.test(
            message
          )
        ) {
          throw error;
        }
      }
    }

    throw lastError instanceof
      Error
      ? lastError
      : new Error(
          authFailureMessage(
            raw.trim()
          )
        );
  }

  try {
    let signedQuery =
      "";

    const usedReturnUrls =
      Boolean(
        input.successUrl?.trim()
      ) &&
      !input.omitReturnUrls;

    try {
      signedQuery =
        await signOnce(
          Boolean(
            input.omitReturnUrls
          )
        );
    } catch (
      error
    ) {
      const message =
        error instanceof
        Error
          ? error.message
          : String(error);

      if (
        /CCode=902|origin does not match/i.test(
          message
        )
      ) {
        console.error(
          "[HYP] Return URL rejected by terminal",
          {
            masof:
              creds.masof,

            bookingId:
              input.bookingId,

            successUrl:
              input.successUrl ??
              null,

            cancelUrl:
              input.cancelUrl ??
              null
          }
        );

        throw new Error(
          "HYP rejected the AnyNanny return URL (CCode=902). " +
            "The checkout was stopped because AnyNanny cannot safely verify the payment without a trusted return URL."
        );
      }

      throw error;
    }

    if (
      !isHypSignSuccessBody(
        signedQuery
      )
    ) {
      console.error(
        "[HYP] APISign failed",
        {
          masof:
            creds.masof,

          user:
            creds.user,

          keyLength:
            creds.key.length,

          passPLength:
            creds.passP.length,

          returnUrls:
            usedReturnUrls,

          body:
            signedQuery
              .slice(
                0,
                400
              )
              .replace(
                /UserId=[^&]*/gi,
                "UserId=REDACTED"
              )
        }
      );

      throw new Error(
        authFailureMessage(
          signedQuery
        )
      );
    }

    const safeQuery =
      stripSecretsPreserveOrder(
        signedQuery
      );

    /**
     * NEW DIAGNOSTIC:
     *
     * Inspect the actual query returned by HYP APISign.
     *
     * This does NOT expose KEY / PassP because safeQuery has already
     * stripped those secrets.
     *
     * This lets us determine whether HYP preserved the return URLs
     * in the signed payment query.
     */
    const signedParams =
      new URLSearchParams(
        safeQuery
      );

    console.info(
      "[HYP] signed return URLs",
      {
        hasSuccessUrl:
          signedParams.has(
            "SuccessUrl"
          ),

        hasErrorUrl:
          signedParams.has(
            "ErrorUrl"
          ),

        hasCancelUrl:
          signedParams.has(
            "CancelUrl"
          ),

        successUrl:
          signedParams.get(
            "SuccessUrl"
          ),

        errorUrl:
          signedParams.get(
            "ErrorUrl"
          ),

        cancelUrl:
          signedParams.get(
            "CancelUrl"
          )
      }
    );

    const checkoutUrl =
      `${creds.payBaseUrl}?${safeQuery}`;

    console.info(
      "[HYP] APISign ok",
      {
        payBase:
          creds.payBaseUrl,

        masof:
          creds.masof,

        order,

        bookingId:
          input.bookingId,

        returnUrls:
          usedReturnUrls
      }
    );

    /**
     * Confirms the URLs supplied by AnyNanny still exist
     * after the APISign request has completed.
     */
    console.info(
      "[HYP] return URL debug after sign",
      {
        successUrl:
          input.successUrl ??
          null,

        cancelUrl:
          input.cancelUrl ??
          null,

        returnUrls:
          usedReturnUrls
      }
    );

    return {
      checkoutUrl,

      signedQuery:
        safeQuery,

      order,

      sessionId:
        `hyp_${order}_${Date.now()}`
    };
  } catch (
    error
  ) {
    if (
      error instanceof
        Error &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        "HYP payment initiation timed out."
      );
    }

    if (
      error instanceof
      Error
    ) {
      throw error;
    }

    throw new Error(
      `HYP payment network error: ${String(
        error
      )}`
    );
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}