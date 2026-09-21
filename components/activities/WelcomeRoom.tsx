import Link from "next/link";
import Image from "next/image";

/** Aspect ratio of cropped welcome-room.png. */
const ROOM_ASPECT = "1411 / 761";

/**
 * Welcome room hub — visual matched to docs/ui-prototypes/01-practice-room-v2.png
 * (cropped room art). Invisible hit targets sit over the baked-in activity labels.
 */
export function WelcomeRoom() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-[#E8E4DA]">
      <div
        className="relative h-full max-h-full w-auto max-w-full"
        style={{ aspectRatio: ROOM_ASPECT }}
      >
        <Image
          src="/welcome-room.png"
          alt="Welcome room with whiteboard, feelings check-in, and chess activities"
          fill
          priority
          className="object-fill"
          sizes="(max-width: 1400px) 100vw, 1400px"
          unoptimized
        />

        {/* Hit targets — centers measured from prototype label blobs */}
        <Link
          href="/practice/whiteboard"
          aria-label="Whiteboard"
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm focus-visible:ring-2 focus-visible:ring-sage"
          style={{ left: "17.9%", top: "74.9%", width: "14%", height: "8%" }}
        />
        <Link
          href="/practice/feelings"
          aria-label="Feelings"
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm focus-visible:ring-2 focus-visible:ring-sage"
          style={{ left: "59%", top: "40.7%", width: "12%", height: "8%" }}
        />
        <Link
          href="/practice/chess"
          aria-label="Chess"
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm focus-visible:ring-2 focus-visible:ring-sage"
          style={{ left: "59%", top: "82.3%", width: "11%", height: "8%" }}
        />
      </div>
    </div>
  );
}
