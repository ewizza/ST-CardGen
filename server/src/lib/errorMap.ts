import type { ZodError } from "zod";
import type { HttpRequestError } from "../utils/http.js";

export function mapHttpRequestError(err: HttpRequestError) {
  const { status } = err.details;
  if (err.details.kind === "timeout") {
    return {
      status: 504,
      code: "PROVIDER_TIMEOUT",
      message: "Provider request timed out",
      details: err.details,
    };
  }
  if (err.details.kind === "network") {
    return {
      status: 502,
      code: "PROVIDER_UNREACHABLE",
      message: "Provider is unreachable",
      details: err.details,
    };
  }
  if (err.details.kind === "parse") {
    return {
      status: 502,
      code: "PROVIDER_BAD_RESPONSE",
      message: "Provider returned an invalid response",
      details: err.details,
    };
  }
  if (err.details.kind === "http") {
    if (status === 401 || status === 403) {
      return {
        status: 401,
        code: "AUTH_INVALID",
        message: "Provider rejected credentials",
        details: err.details,
      };
    }
    if (status === 429) {
      return {
        status: 429,
        code: "RATE_LIMITED",
        message: "Provider rate limited the request",
        details: err.details,
      };
    }
    if (status === 404) {
      return {
        status: 502,
        code: "PROVIDER_NOT_FOUND",
        message: "Provider endpoint returned 404",
        details: err.details,
      };
    }
    return {
      status: 502,
      code: "PROVIDER_ERROR",
      message: `Provider returned HTTP ${status ?? "error"}`,
      details: err.details,
    };
  }
  return {
    status: 502,
    code: "PROVIDER_ERROR",
    message: "Provider request failed",
    details: err.details,
  };
}

export function mapUnknownError(err: unknown) {
  const message = String((err as any)?.message ?? err);
  const details = process.env.NODE_ENV !== "production"
    ? { message, stack: (err as any)?.stack }
    : { message };
  return {
    status: 500,
    code: "INTERNAL",
    message: "Unexpected server error",
    details,
  };
}

export function zodToDetails(err: ZodError) {
  return err.issues;
}

export const zodIssues = zodToDetails;
