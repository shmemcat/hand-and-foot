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
  const iconName = bot ? "robot" : name;
  const [artwork, setArtwork] = useState<Artwork>(iconData.user);
  useEffect(() => {
    let alive = true;
    setArtwork(iconData.user);
    if (iconName && iconName !== "user") {
      void import("../lib/profileIconData")
        .then(({ profileIcons }) => {
          if (alive && Object.hasOwn(profileIcons, iconName))
            setArtwork(profileIcons[iconName]);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [iconName]);
  return (
    <svg viewBox={artwork.viewBox} fill="currentColor" aria-hidden="true">
      {artwork.paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
