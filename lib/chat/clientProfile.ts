/**
 * Learner-customized virtual-client profile from the session setup screen.
 * Shared browser/server rules; keep this module free of server imports.
 */

export const MAX_CLIENT_NAME_LENGTH = 30;
export const MAX_CLIENT_SCENARIO_LENGTH = 300;
export const MIN_CLIENT_AGE = 4;
export const MAX_CLIENT_AGE = 17;

export const CLIENT_GENDERS = [
  "Boy",
  "Girl",
  "Nonbinary",
  "Prefer not to say",
] as const;
export type ClientGender = (typeof CLIENT_GENDERS)[number];

const avatarSet = (prefix: string) =>
  [1, 2, 3, 4, 5].map((index) => `/avatars/${prefix}-${index}.svg`);

const NEUTRAL_AVATARS = avatarSet("neutral");

export const CLIENT_AVATARS: Record<ClientGender, readonly string[]> = {
  Boy: avatarSet("male"),
  Girl: avatarSet("female"),
  Nonbinary: NEUTRAL_AVATARS,
  "Prefer not to say": NEUTRAL_AVATARS,
};

/** Accessible names for the avatar picker; keep in sync with public/avatars. */
export const CLIENT_AVATAR_LABELS: Readonly<Record<string, string>> = {
  "/avatars/male-1.svg": "Dark swept hair, green shirt",
  "/avatars/male-2.svg": "Short black hair, blue shirt",
  "/avatars/male-3.svg": "Blond hair and freckles, coral shirt",
  "/avatars/male-4.svg": "Curly black hair, dark green shirt",
  "/avatars/male-5.svg": "Spiky brown hair and glasses, yellow shirt",
  "/avatars/female-1.svg": "Long brown hair, coral shirt",
  "/avatars/female-2.svg": "Black pigtails, purple shirt",
  "/avatars/female-3.svg": "Blond ponytail and freckles, green shirt",
  "/avatars/female-4.svg": "Dark bun and glasses, blue shirt",
  "/avatars/female-5.svg": "Long curly hair, yellow shirt",
  "/avatars/neutral-1.svg": "Auburn bob, dark green shirt",
  "/avatars/neutral-2.svg": "Short black hair, purple shirt",
  "/avatars/neutral-3.svg": "Dark undercut and glasses, coral shirt",
  "/avatars/neutral-4.svg": "Yellow beanie, blue shirt",
  "/avatars/neutral-5.svg": "Wavy brown hair and freckles, green shirt",
};

export function isClientAvatarFor(
  gender: ClientGender,
  avatar: string,
): boolean {
  return CLIENT_AVATARS[gender].includes(avatar);
}

/** Keeps the current avatar when it already fits the gender, so editing other fields doesn't reshuffle it. */
export function pickClientAvatar(
  gender: ClientGender,
  current?: string | null,
  random: () => number = Math.random,
): string {
  const options = CLIENT_AVATARS[gender];
  if (current && options.includes(current)) return current;
  return options[Math.floor(random() * options.length)] ?? options[0];
}

export const CLIENT_AGES: readonly number[] = Array.from(
  { length: MAX_CLIENT_AGE - MIN_CLIENT_AGE + 1 },
  (_, index) => MIN_CLIENT_AGE + index,
);

// Letters (any script), spaces, hyphens, apostrophes, and periods.
const CLIENT_NAME_PATTERN = /^[\p{L}][\p{L}\p{M} '.-]*$/u;

export interface ClientProfile {
  name: string;
  gender: ClientGender;
  age: number;
  scenario: string;
  /** Learner-chosen avatar, or null to assign one at random. */
  avatar: string | null;
}

export interface ClientProfileDraft {
  name: string;
  gender: string;
  age: string;
  scenario: string;
  /** Empty string means "Random". */
  avatar: string;
}

export type ClientProfileErrors = Partial<
  Record<keyof ClientProfileDraft, string>
>;

export const EMPTY_CLIENT_PROFILE_DRAFT: ClientProfileDraft = {
  name: "",
  gender: "",
  age: "",
  scenario: "",
  avatar: "",
};

export function isClientGender(value: unknown): value is ClientGender {
  return (
    typeof value === "string" &&
    (CLIENT_GENDERS as readonly string[]).includes(value)
  );
}

/** Returns a normalized profile, or per-field messages the learner can act on. */
export function parseClientProfile(
  draft: ClientProfileDraft,
):
  | { ok: true; profile: ClientProfile }
  | { ok: false; errors: ClientProfileErrors } {
  const errors: ClientProfileErrors = {};
  const name = draft.name.trim().replace(/\s+/g, " ");
  const scenario = draft.scenario.trim().replace(/\s+/g, " ");
  const age = Number(draft.age);

  if (!name) errors.name = "Enter a name for your client.";
  else if (name.length > MAX_CLIENT_NAME_LENGTH)
    errors.name = `Use ${MAX_CLIENT_NAME_LENGTH} characters or fewer.`;
  else if (!CLIENT_NAME_PATTERN.test(name))
    errors.name =
      "Use letters, spaces, hyphens, apostrophes, or periods, starting with a letter.";

  if (!isClientGender(draft.gender)) errors.gender = "Choose a gender.";
  else if (draft.avatar && !isClientAvatarFor(draft.gender, draft.avatar))
    errors.avatar = "Choose one of the avatars shown, or Random.";

  if (
    !draft.age ||
    !Number.isInteger(age) ||
    age < MIN_CLIENT_AGE ||
    age > MAX_CLIENT_AGE
  )
    errors.age = `Choose an age from ${MIN_CLIENT_AGE} to ${MAX_CLIENT_AGE}.`;

  if (!scenario) errors.scenario = "Describe what your client is going through.";
  else if (scenario.length > MAX_CLIENT_SCENARIO_LENGTH)
    errors.scenario = `Use ${MAX_CLIENT_SCENARIO_LENGTH} characters or fewer.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    profile: {
      name,
      gender: draft.gender as ClientGender,
      age,
      scenario,
      avatar: draft.avatar || null,
    },
  };
}

/** The confirmed client stored on a session, with its avatar already resolved. */
export type VirtualClient = Omit<ClientProfile, "avatar"> & { avatar: string };

/**
 * Validates a client from a request body or stored transcript. Values must
 * already be normalized, so a stored client never differs from what was shown.
 */
export function parseVirtualClient(value: unknown): VirtualClient | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["name", "gender", "age", "scenario", "avatar"].includes(key),
    )
  )
    return null;
  const { name, gender, age, scenario, avatar } = value as Record<
    string,
    unknown
  >;
  if (
    typeof name !== "string" ||
    typeof gender !== "string" ||
    typeof age !== "number" ||
    typeof scenario !== "string" ||
    typeof avatar !== "string" ||
    !avatar
  )
    return null;
  const result = parseClientProfile({
    name,
    gender,
    age: String(age),
    scenario,
    avatar,
  });
  if (
    !result.ok ||
    result.profile.name !== name ||
    result.profile.scenario !== scenario
  )
    return null;
  return { ...result.profile, avatar };
}

/** What the practice room shows for sessions started before custom clients existed. */
export const DEFAULT_CLIENT_DISPLAY: VirtualClient = {
  name: "Jacob",
  gender: "Boy",
  age: 12,
  scenario: "Just started middle school and is having a hard time adjusting.",
  avatar: "/avatar-alex.svg",
};
