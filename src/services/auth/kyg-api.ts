import axios from "axios";
import { ENV } from "../../config/env.js";

const kygApi = axios.create({
  baseURL: ENV.KYG_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface KygLoginResponse {
  user: {
    userid: number;
    email: string;
    firstName: string;
    lastName: string;
    [key: string]: unknown;
  };
  token: string;
}

export interface KygUserResponse {
  user: {
    userid: number;
    email: string;
    firstName: string;
    lastName: string;
    [key: string]: unknown;
  };
  token: string;
}

export interface KygErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
}

export async function loginWithKyg(
  email: string,
  password: string
): Promise<KygLoginResponse> {
  const response = await kygApi.post<KygLoginResponse | KygErrorResponse>(
    "/authentication/login",
    { email, password }
  );

  if ("statusCode" in response.data) {
    const error = response.data as KygErrorResponse;
    throw new Error(error.message || "Authentication failed");
  }

  return response.data as KygLoginResponse;
}

export async function verifyTokenWithKyg(
  token: string
): Promise<KygUserResponse> {
  const response = await kygApi.get<KygUserResponse | KygErrorResponse>(
    "/authentication/user",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if ("statusCode" in response.data) {
    const error = response.data as KygErrorResponse;
    throw new Error(error.message || "Token verification failed");
  }

  return response.data as KygUserResponse;
}
