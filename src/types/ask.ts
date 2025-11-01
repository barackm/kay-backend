export interface AskRequest {
  prompt: string;
  interactive?: boolean;
  confirm?: boolean;
  context?: Record<string, unknown>;
  session_id?: string; // For continuing interactive sessions
  confirmation_token?: string; // For confirming pending actions
}

export interface AskResponse {
  status:
    | "pending"
    | "confirmation_required"
    | "interactive_response"
    | "completed"
    | "error";
  session_id?: string;
  message: string;
  data?: unknown;
  confirmation_token?: string;
  requires_confirmation?: boolean;
  interactive?: boolean;
}

export interface ConfirmationRequest {
  confirmation_token: string;
  approved: boolean;
}

export interface InteractiveTurn {
  session_id: string;
  prompt: string;
  context?: Record<string, unknown>;
}
