"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { saveBrowserSession } from "@/lib/chat/browserSession";
import { Icon } from "@/components/ui/Icon";
import {
  CLIENT_AGES,
  CLIENT_GENDERS,
  EMPTY_CLIENT_PROFILE_DRAFT,
  MAX_CLIENT_NAME_LENGTH,
  MAX_CLIENT_SCENARIO_LENGTH,
  CLIENT_AVATAR_LABELS,
  CLIENT_AVATARS,
  isClientAvatarFor,
  isClientGender,
  parseClientProfile,
  pickClientAvatar,
  type ClientGender,
  type ClientProfile,
  type ClientProfileDraft,
  type ClientProfileErrors,
} from "@/lib/chat/clientProfile";
import {
  isRecord,
  isTranscript,
  isValidSessionId,
  MAX_SESSION_NAME_LENGTH,
} from "@/lib/chat/validation";

const INPUT_CLASS =
  "mt-2 w-full rounded-panel border border-charcoal/20 bg-white px-3 py-3 text-sm outline-none placeholder:text-charcoal/45 focus:border-sage focus:ring-2 focus:ring-sage/30 disabled:opacity-60 aria-[invalid=true]:border-terracotta";
const PRIMARY_BUTTON_CLASS =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-panel bg-charcoal px-4 py-3 text-sm font-semibold text-cream transition hover:bg-charcoal/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:cursor-wait disabled:opacity-70";

export function StartSessionForm() {
  const [draft, setDraft] = useState<ClientProfileDraft>(
    EMPTY_CLIENT_PROFILE_DRAFT,
  );
  const [client, setClient] = useState<ClientProfile | null>(null);
  // Kept separately from a manual choice so returning to Random doesn't reuse the manual pick.
  const [randomAvatar, setRandomAvatar] = useState<string | null>(null);

  function confirmClient(profile: ClientProfile) {
    if (!profile.avatar)
      setRandomAvatar((current) => pickClientAvatar(profile.gender, current));
    setClient(profile);
  }

  const avatar = client?.avatar ?? randomAvatar;

  return (
    <main className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-10 sm:px-8 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <section className="min-w-0">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-charcoal/60">
          Your practice space
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Start a practice session
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-charcoal/70">
          Practice interviewing with a virtual client, at your own pace.
        </p>
        <div className="relative mt-7 hidden aspect-[4/3] overflow-hidden rounded-panel border border-charcoal/10 bg-[#eae5da] lg:block">
          <Image
            src="/room-background.png"
            alt="The illustrated practice room with a sofa, bookshelf, and sunlit window"
            fill
            sizes="420px"
            className="object-cover"
            priority
          />
        </div>
        <Link
          href="/sessions"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal"
        >
          Session logs · Coming soon <span aria-hidden="true">→</span>
        </Link>
      </section>

      {client && avatar ? (
        <SessionDetailsStep
          client={client}
          avatar={avatar}
          onBack={() => setClient(null)}
        />
      ) : (
        <ClientCustomizationStep
          draft={draft}
          onChange={setDraft}
          onNext={confirmClient}
        />
      )}
    </main>
  );
}

function StepLabel({ step }: { step: 1 | 2 }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-charcoal/60">
      Step {step} of 2
    </p>
  );
}

function ClientCustomizationStep({
  draft,
  onChange,
  onNext,
}: {
  draft: ClientProfileDraft;
  onChange: (draft: ClientProfileDraft) => void;
  onNext: (client: ClientProfile) => void;
}) {
  const [errors, setErrors] = useState<ClientProfileErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function update(field: keyof ClientProfileDraft, value: string) {
    const nextDraft = { ...draft, [field]: value };
    if (
      field === "gender" &&
      nextDraft.avatar &&
      !(isClientGender(value) && isClientAvatarFor(value, nextDraft.avatar))
    )
      nextDraft.avatar = "";
    onChange(nextDraft);
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseClientProfile(draft);
    if (result.ok) {
      onNext(result.profile);
      return;
    }
    setErrors(result.errors);
    const firstInvalid = (
      ["name", "gender", "age", "avatar", "scenario"] as const
    ).find((field) => result.errors[field]);
    formRef.current
      ?.querySelector<HTMLElement>(
        `[name="${firstInvalid}"]:checked, [name="${firstInvalid}"]`,
      )
      ?.focus();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={next}
      className="min-w-0 overflow-hidden rounded-panel border border-charcoal/15 bg-white shadow-sm"
    >
      <div className="border-b border-charcoal/10 bg-sage/15 px-6 py-6 sm:px-8">
        <StepLabel step={1} />
        <h2 className="mt-1 text-2xl font-semibold">
          Create your virtual client
        </h2>
        <p className="mt-1 text-sm text-charcoal/70">
          Describe who you&apos;d like to practice with.
        </p>
      </div>
      <div className="space-y-6 p-6 sm:p-8">
        <Field
          id="client-name"
          label="Name"
          error={errors.name}
          help={`Up to ${MAX_CLIENT_NAME_LENGTH} characters, letters only.`}
        >
          <input
            id="client-name"
            name="name"
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            maxLength={MAX_CLIENT_NAME_LENGTH}
            autoComplete="off"
            placeholder="e.g., Jacob"
            aria-invalid={Boolean(errors.name)}
            aria-describedby="client-name-help"
            className={INPUT_CLASS}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id="client-gender"
            label="Gender"
            error={errors.gender}
            help="How your client identifies."
          >
            <select
              id="client-gender"
              name="gender"
              value={draft.gender}
              onChange={(event) => update("gender", event.target.value)}
              aria-invalid={Boolean(errors.gender)}
              aria-describedby="client-gender-help"
              className={`${INPUT_CLASS} ${draft.gender ? "" : "text-charcoal/45"}`}
            >
              <option value="" disabled>
                Select a gender
              </option>
              {CLIENT_GENDERS.map((gender) => (
                <option key={gender} value={gender} className="text-charcoal">
                  {gender}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="client-age"
            label="Age"
            error={errors.age}
            help={`Ages ${CLIENT_AGES[0]}–${CLIENT_AGES[CLIENT_AGES.length - 1]}.`}
          >
            <select
              id="client-age"
              name="age"
              value={draft.age}
              onChange={(event) => update("age", event.target.value)}
              aria-invalid={Boolean(errors.age)}
              aria-describedby="client-age-help"
              className={`${INPUT_CLASS} ${draft.age ? "" : "text-charcoal/45"}`}
            >
              <option value="" disabled>
                Select an age
              </option>
              {CLIENT_AGES.map((age) => (
                <option key={age} value={age} className="text-charcoal">
                  {age}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <AvatarPicker
          gender={isClientGender(draft.gender) ? draft.gender : null}
          value={draft.avatar}
          error={errors.avatar}
          onChange={(avatar) => update("avatar", avatar)}
        />

        <Field
          id="client-scenario"
          label="Scenario"
          error={errors.scenario}
          help="In a sentence or two, describe what brings your client to therapy."
          counter={`${draft.scenario.length}/${MAX_CLIENT_SCENARIO_LENGTH}`}
        >
          <textarea
            id="client-scenario"
            name="scenario"
            value={draft.scenario}
            onChange={(event) => update("scenario", event.target.value)}
            maxLength={MAX_CLIENT_SCENARIO_LENGTH}
            rows={4}
            placeholder="e.g., Just started middle school and is having trouble making friends. Feels like teachers treat them unfairly."
            aria-invalid={Boolean(errors.scenario)}
            aria-describedby="client-scenario-help"
            className={`${INPUT_CLASS} resize-none leading-relaxed`}
          />
        </Field>

        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}

const AVATAR_OPTION_CLASS =
  "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-transparent transition peer-checked:border-charcoal peer-checked:ring-2 peer-checked:ring-sage/40 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-charcoal group-hover:border-charcoal/30 sm:h-16 sm:w-16";

function AvatarPicker({
  gender,
  value,
  error,
  onChange,
}: {
  gender: ClientGender | null;
  value: string;
  error?: string;
  onChange: (avatar: string) => void;
}) {
  const options = gender ? CLIENT_AVATARS[gender] : [];
  const selectedLabel = value ? CLIENT_AVATAR_LABELS[value] : "Random";

  return (
    <fieldset aria-describedby="client-avatar-help">
      <legend className="block text-sm font-semibold">
        Avatar{" "}
        <span className="font-normal text-charcoal/60">(optional)</span>
      </legend>
      {gender ? (
        <div className="mt-2 flex flex-wrap gap-2 sm:gap-3">
          <label className="group cursor-pointer" title="Random">
            <input
              type="radio"
              name="avatar"
              value=""
              checked={value === ""}
              onChange={() => onChange("")}
              aria-label="Random"
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`${AVATAR_OPTION_CLASS} border-dashed !border-charcoal/30 bg-cream text-lg font-semibold text-charcoal/60 peer-checked:!border-charcoal`}
            >
              ?
            </span>
          </label>
          {options.map((avatar) => (
            <label
              key={avatar}
              className="group cursor-pointer"
              title={CLIENT_AVATAR_LABELS[avatar]}
            >
              <input
                type="radio"
                name="avatar"
                value={avatar}
                checked={value === avatar}
                onChange={() => onChange(avatar)}
                aria-label={CLIENT_AVATAR_LABELS[avatar] ?? "Avatar"}
                className="peer sr-only"
              />
              <span aria-hidden="true" className={AVATAR_OPTION_CLASS}>
                <Image
                  src={avatar}
                  alt=""
                  width={64}
                  height={64}
                  className="h-full w-full"
                />
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-panel border border-dashed border-charcoal/20 bg-cream px-3 py-4 text-sm text-charcoal/60">
          Choose a gender to see avatar options.
        </p>
      )}
      <p
        id="client-avatar-help"
        className={`mt-2 text-xs leading-relaxed ${error ? "text-terracotta" : "text-charcoal/65"}`}
      >
        {error ??
          (gender
            ? `Selected: ${selectedLabel}. Leave on Random to have one picked for you.`
            : "Leave on Random to have one picked for you.")}
      </p>
    </fieldset>
  );
}

function Field({
  id,
  label,
  help,
  error,
  counter,
  children,
}: {
  id: string;
  label: string;
  help: string;
  error?: string;
  counter?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      <div
        id={`${id}-help`}
        className="mt-2 flex items-start justify-between gap-3 text-xs leading-relaxed"
      >
        <p className={error ? "text-terracotta" : "text-charcoal/65"}>
          {error ?? help}
        </p>
        {counter && (
          <p className="shrink-0 tabular-nums text-charcoal/50">{counter}</p>
        )}
      </div>
    </div>
  );
}

function SessionDetailsStep({
  client,
  avatar,
  onBack,
}: {
  client: ClientProfile;
  avatar: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          requestId: requestId.current,
          client: { ...client, avatar },
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Could not start your session. Please try again.",
        );
      if (!isRecord(data) || !isValidSessionId(data.sessionId))
        throw new Error("Could not start your session. Please try again.");
      if (data.transcript !== undefined) {
        if (
          !isTranscript(data.transcript) ||
          data.transcript.sessionId !== data.sessionId
        )
          throw new Error("Could not start your session. Please try again.");
        saveBrowserSession(data.transcript);
      }
      router.push(`/practice/${data.sessionId}`);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not start your session. Please try again.",
      );
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={startSession}
      aria-busy={pending}
      className="min-w-0 overflow-hidden rounded-panel border border-charcoal/15 bg-white shadow-sm"
    >
      <div className="flex items-start gap-4 border-b border-charcoal/10 bg-sage/15 px-6 py-6 sm:px-8">
        <Image
          src={avatar}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-full border border-charcoal/15 bg-cream"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <StepLabel step={2} />
            <button
              type="button"
              onClick={onBack}
              disabled={pending}
              className="text-xs font-medium underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal disabled:opacity-60"
            >
              Edit client
            </button>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-charcoal/60">
            Virtual client
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 break-words text-2xl font-semibold outline-none"
          >
            {client.name}
          </h2>
          <p className="mt-1 text-sm text-charcoal/70">
            Age {client.age}
            {client.gender !== "Prefer not to say" && ` · ${client.gender}`}
          </p>
          <p className="mt-2 break-words text-sm leading-relaxed text-charcoal/80">
            {client.scenario}
          </p>
        </div>
      </div>
      <div className="space-y-6 p-6 sm:p-8">
        <div>
          <label htmlFor="session-name" className="block text-sm font-semibold">
            Session name{" "}
            <span className="font-normal text-charcoal/60">(optional)</span>
          </label>
          <input
            id="session-name"
            name="name"
            maxLength={MAX_SESSION_NAME_LENGTH}
            disabled={pending}
            placeholder="e.g., Rapport-building practice"
            aria-describedby="session-name-help"
            className={INPUT_CLASS}
          />
          <p
            id="session-name-help"
            className="mt-2 text-xs leading-relaxed text-charcoal/65"
          >
            Give this practice session a name, or leave it blank.
          </p>
        </div>
        <div className="flex gap-3 rounded-panel bg-cream p-4 text-sm leading-relaxed text-charcoal/80">
          <Icon name="chat" className="mt-0.5 shrink-0 text-charcoal/60" />
          <p>
            Start practicing with {client.name} now. Saved session logs are
            coming soon.
          </p>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-panel border border-terracotta/40 bg-terracotta/10 p-3 text-sm"
          >
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON_CLASS}>
          {pending ? "Starting session…" : "Start practice session"}
          {!pending && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </form>
  );
}
