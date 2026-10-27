import { useEffect, useState } from "react";
import { iconData } from "./iconData";

type Artwork = { viewBox: string; paths: readonly string[] };
export function ProfileIcon({ name }: { name?: string }) {
  const [artwork, setArtwork] = useState<Artwork>(iconData.user);
  useEffect(() => {
    let alive = true;
    setArtwork(iconData.user);
    if (name && name !== "user") {
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
  }, [name]);
  return (
    <svg viewBox={artwork.viewBox} fill="currentColor" aria-hidden="true">
      {artwork.paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
