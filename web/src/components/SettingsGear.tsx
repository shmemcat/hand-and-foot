import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Gear } from "./Icons";
import { useAuth } from "../context/AuthContext";
import styles from "./SettingsGear.module.css";

const MENU_ITEMS = [
  { to: "/profile", label: "Profile" },
  { to: "/options", label: "Options" },
];

interface SettingsGearProps {
  /** Path to exclude from the dropdown (the current page) */
  exclude?: string;
}

export const SettingsGear: React.FC<SettingsGearProps> = ({ exclude }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const items = exclude
    ? MENU_ITEMS.filter((item) => item.to !== exclude)
    : MENU_ITEMS;

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handler);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.wrap} data-modal-open={open}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.gearBtn}
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings menu"
        aria-expanded={open}
      >
        <Gear />
      </button>
      <div className={styles.drop} hidden={!open}>
        <div className={styles.inner}>
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={styles.menuItem}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

const GEAR_ROUTES: Record<string, string | undefined> = {
  "/user": undefined,
  "/preview/user": undefined,
  "/profile": "/profile",
  "/options": "/options",
};

export function GearOverlay() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const isGearPage =
    pathname in GEAR_ROUTES &&
    (pathname !== "/preview/user" || import.meta.env.DEV);
  const isPreview = import.meta.env.DEV && pathname === "/preview/user";
  const show = isGearPage && (!!user || isPreview);

  return (
    <div className={styles.overlay}>
      <div className={styles.overlayMirror}>
        {show && (
          <div className={styles.overlayGear}>
            <SettingsGear exclude={GEAR_ROUTES[pathname]} />
          </div>
        )}
      </div>
    </div>
  );
}
