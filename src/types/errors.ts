export enum ErrorCode {
  TOKEN_MISSING = "TOKEN_MISSING",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_INVALID = "TOKEN_INVALID",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
  SERVER_ERROR = "SERVER_ERROR",
}

export interface ErrorResponse {
  error: ErrorCode;
  code: ErrorCode;
  message: string;
  details?: string;
}

