import type { SVGProps } from "react";

type IconName =
  | "settings"
  | "person"
  | "activities"
  | "camera"
  | "chat"
  | "phone"
  | "pen"
  | "pointer"
  | "check"
  | "eraser"
  | "text"
  | "rectangle"
  | "ellipse";

const PATHS: Record<IconName, React.ReactNode> = {
  settings: (
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
    </>
  ),
  activities: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  camera: (
    <>
      <path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4Z" />
      <circle cx="12" cy="14" r="4" />
    </>
  ),
  chat: (
    <path d="M21 15a3 3 0 0 1-3 3H7l-4 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />
  ),
  phone: <path d="M3 15v-3c5-5 13-5 18 0v3l-5 1v-4a12 12 0 0 0-8 0v4Z" />,
  pen: (
    <>
      <path d="m16 3 5 5-12 12-6 1 1-6Z" />
      <path d="m14 5 5 5M4 15l5 5" />
    </>
  ),
  pointer: <path d="m4 3 7 18 3-7 7-3Z" />,
  eraser: (
    <>
      <path d="m14 3 7 7-10 10H7l-5-5Z" />
      <path d="m8 9 7 7M11 20h10" />
    </>
  ),
  text: (
    <>
      <path d="M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3" />
    </>
  ),
  rectangle: <rect x="4" y="5" width="16" height="14" rx="2" />,
  ellipse: <circle cx="12" cy="12" r="8" />,
  check: <path d="m5 12 4 4L19 6" />,
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
