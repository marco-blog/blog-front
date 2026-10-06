import { isRouteErrorResponse } from "react-router";
import { describe, expect, it } from "vitest";

import { ApiError, apiErrorResponse, isApiError, toApiErrorData } from "~/api/errors";
import { isApiEnvelope } from "~/api/types";

describe("ApiError", () => {
  it("기본값과 메시지", () => {
    const error = new ApiError({ status: 404, resultCode: "POST_NOT_FOUND" });

    expect(error.message).toBe("404 POST_NOT_FOUND");
    expect(error.name).toBe("ApiError");
    expect(error.fieldErrors).toEqual([]);
    expect(error.resultMessage).toBe("");
    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
    expect(toApiErrorData(error)).toEqual({
      resultCode: "POST_NOT_FOUND",
      fieldErrors: [],
      traceId: null,
    });
  });

  it("apiErrorResponse는 backend 상태 코드를 그대로 쓴다", () => {
    const error = new ApiError({
      status: 409,
      resultCode: "HANDLE_TAKEN",
      resultMessage: "taken",
      traceId: "abcdef1234567890",
    });

    const response = apiErrorResponse(error);

    expect(response.init?.status).toBe(409);
    expect(response.data).toEqual({
      resultCode: "HANDLE_TAKEN",
      fieldErrors: [],
      traceId: "abcdef1234567890",
    });
    expect(isRouteErrorResponse(response)).toBe(false);
  });
});

describe("isApiEnvelope", () => {
  it.each([
    [{ header: { isSuccessful: true, resultCode: "OK", resultMessage: "" }, result: null }, true],
    [{ header: { isSuccessful: "yes", resultCode: "OK" } }, false],
    [{ header: { isSuccessful: true } }, false],
    [{ header: null }, false],
    [{ result: 1 }, false],
    [null, false],
    ["text", false],
  ])("%j → %s", (value, expected) => {
    expect(isApiEnvelope(value)).toBe(expected);
  });
});
