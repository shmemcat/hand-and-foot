import { useEffect, useState } from "react";
import { iconData } from "./iconData";

type Artwork = { viewBox: string; paths: readonly string[] };
export function ProfileIcon({
  name,
  bot = false,
  disconnected = false,
}: {
  name?: string;
  bot?: boolean;
  disconnected?: boolean;
}) {
  const [artwork, setArtwork] = useState<Artwork>(iconData.user);
  useEffect(() => {
    let alive = true;
    setArtwork(iconData.user);
    if (!bot && name && name !== "user") {
      void import("../lib/profileIconData")
        .then(({ profileIcons }) => {
          if (alive && Object.hasOwn(profileIcons, name))
            setArtwork(profileIcons[name]);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [name, bot]);
  const displayedArtwork =
    disconnected && !bot
      ? iconData["link-broken"]
      : bot
        ? iconData.robot
        : artwork;
  return (
    <svg
      viewBox={displayedArtwork.viewBox}
      fill="currentColor"
      aria-hidden="true"
      className={disconnected && !bot ? "fa-solid fa-link-broken" : undefined}
    >
      {displayedArtwork.paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
