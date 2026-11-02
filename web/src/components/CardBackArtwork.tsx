import { useState } from "react";
import { cardBackAsset, type CardBackId } from "../lib/cardBacks";
import { useReducedMotion } from "../lib/motionPreference";

function BackImages({
  id,
  small,
  onLoad,
}: {
  id: CardBackId;
  small: boolean;
  onLoad?: (theme: number) => void;
}) {
  return (
    <>
      {(["light", "dark"] as const).map((theme, index) => (
        <img
          key={theme}
          className={`card-back ${theme}-back`}
          src={cardBackAsset(id, theme, small)}
          alt=""
          draggable="false"
          onLoad={onLoad ? () => onLoad(1 << index) : undefined}
        />
      ))}
    </>
  );
}

function FadingBack({ id, small }: { id: CardBackId; small: boolean }) {
  const reduced = useReducedMotion();
  const [art, setArt] = useState<{
    current: CardBackId;
    previous: CardBackId | null;
    loaded: number;
  }>({ current: id, previous: null, loaded: 0 });
  if (art.current !== id || (reduced && art.previous)) {
    setArt({
      current: id,
      previous: reduced
        ? null
        : art.loaded === 3
          ? art.current
          : (art.previous ?? art.current),
      loaded: art.current === id ? art.loaded : 0,
    });
  }
  const ready = art.loaded === 3;
  return (
    <>
      {art.previous && (
        <span
          key={`previous-${art.previous}`}
          className="card-back-layer"
          data-back-layer="previous"
          data-back-design={art.previous}
          aria-hidden="true"
        >
          <BackImages id={art.previous} small={small} />
        </span>
      )}
      <span
        key={art.current}
        className={`card-back-layer${art.previous ? " card-back-entering" : ""}`}
        data-back-layer="current"
        data-back-design={art.current}
        data-ready={ready}
        aria-hidden="true"
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          setArt((current) =>
            current.current === id ? { ...current, previous: null } : current,
          );
        }}
      >
        <BackImages
          id={art.current}
          small={small}
          onLoad={(theme) => {
            setArt((current) =>
              current.current === id
                ? { ...current, loaded: current.loaded | theme }
                : current,
            );
          }}
        />
      </span>
    </>
  );
}

export function CardBackArtwork({
  id,
  small,
  fade,
}: {
  id: CardBackId;
  small: boolean;
  fade: boolean;
}) {
  return fade ? (
    <FadingBack id={id} small={small} />
  ) : (
    <BackImages id={id} small={small} />
  );
}
