import { useEffect, useState } from "react";

export function useMobileLayout() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 768px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}
