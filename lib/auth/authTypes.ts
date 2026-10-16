export interface LoginCredentials {
  username: string;
  password: string;
}

export type LoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string };
