import Image from "next/image";

/** LINE profile picture, or the name's first letter when the user has none. */
export function Avatar({ name, pictureUrl, size = 40 }: { name: string; pictureUrl: string | null; size?: number }) {
  if (pictureUrl) {
    return <Image src={pictureUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-gradient font-medium text-white"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
