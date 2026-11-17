"use client";

import Image from "next/image";
import { useRef } from "react";
import type { VirtualClient } from "@/lib/chat/clientProfile";
import { usePracticeSession } from "./PracticeSession";

export function FaceCams({ darkRail = false }: { darkRail?: boolean }) {
  const { client } = usePracticeSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <aside
      className={`flex w-14 sm:w-28 xl:w-rail shrink-0 flex-col items-center gap-6 overflow-hidden border-r border-charcoal/10 px-1 sm:px-4 pt-5 ${
        darkRail ? "bg-charcoal" : "bg-[#EDEBE4]"
      }`}
    >
      <Cam src="/avatar-you.svg" label="You" darkRail={darkRail} />
      <button
        type="button"
        className="group rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage"
        aria-haspopup="dialog"
        aria-label={`View ${client.name}'s profile`}
        title={`View ${client.name}'s profile`}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Cam
          src={client.avatar}
          label={client.name}
          darkRail={darkRail}
          interactive
        />
      </button>
      <ClientProfileDialog ref={dialogRef} client={client} />
    </aside>
  );
}

function Cam({
  src,
  label,
  darkRail,
  interactive = false,
}: {
  src: string;
  label: string;
  darkRail: boolean;
  interactive?: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={`relative h-10 w-10 sm:h-20 sm:w-20 xl:h-cam xl:w-cam shrink-0 overflow-hidden rounded-full border-2 border-white/70 bg-[#E8E4DA] ${
          interactive
            ? "transition-transform group-hover:scale-105 group-hover:border-sage"
            : ""
        }`}
      >
        <Image
          src={src}
          alt={interactive ? "" : label}
          width={336}
          height={336}
          className="h-full w-full object-cover object-center"
          unoptimized
          priority
        />
      </div>
      <span
        className={`z-10 -mt-2 max-w-full truncate rounded-full border px-3 py-0.5 text-xs font-semibold ${
          darkRail
            ? "border-transparent bg-sage text-charcoal"
            : "border-charcoal/40 bg-white text-charcoal"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function ClientProfileDialog({
  ref,
  client,
}: {
  ref: React.Ref<HTMLDialogElement>;
  client: VirtualClient;
}) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="client-profile-title"
      className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-cream p-0 text-charcoal shadow-xl backdrop:bg-charcoal/50"
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="p-6">
        <div className="flex items-center gap-4">
          <Image
            src={client.avatar}
            alt=""
            width={80}
            height={80}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-white bg-[#E8E4DA]"
            unoptimized
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/60">
              Client profile
            </p>
            <h2
              id="client-profile-title"
              className="break-words text-xl font-semibold"
            >
              {client.name}
            </h2>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="font-semibold text-charcoal/70">Gender</dt>
          <dd>{client.gender}</dd>
          <dt className="font-semibold text-charcoal/70">Age</dt>
          <dd>{client.age}</dd>
          <dt className="font-semibold text-charcoal/70">Scenario</dt>
          <dd className="whitespace-pre-wrap break-words">{client.scenario}</dd>
        </dl>
        <form method="dialog" className="mt-6 flex justify-end">
          <button
            type="submit"
            autoFocus
            className="rounded-full bg-charcoal px-5 py-2 text-sm font-semibold text-white hover:bg-charcoal/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
          >
            Close
          </button>
        </form>
      </div>
    </dialog>
  );
}
