export interface LoginCredentials {
  email: string;
  password: string;
}

export type LoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string };

export type SignupResult =
  | { ok: true; redirectTo: string }
  | { ok: true; confirmationRequired: true }
  | { ok: false; message: string };
