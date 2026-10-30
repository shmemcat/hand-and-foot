import { achievementIconData } from "../lib/achievementIconData";
import { Icon } from "./Icons";
import { ProfileIcon } from "./ProfileIcon";

export function AchievementIcon({ name }: { name: string }) {
  if (name === "music-off") return <Icon name="music-off" />;
  const artwork = achievementIconData[name];
  if (!artwork) return <ProfileIcon name={name} />;
  return (
    <svg viewBox={artwork.viewBox} fill="currentColor" aria-hidden="true">
      {artwork.paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
