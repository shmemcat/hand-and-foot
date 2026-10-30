import { useEffect, useState } from "react";
import { iconData } from "./iconData";

type Artwork = { viewBox: string; paths: readonly string[] };
export function ProfileIcon({
  name,
  bot = false,
}: {
  name?: string;
  bot?: boolean;
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
  const displayedArtwork = bot ? iconData.robot : artwork;
  return (
    <svg
      viewBox={displayedArtwork.viewBox}
      fill="currentColor"
      aria-hidden="true"
    >
      {displayedArtwork.paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
