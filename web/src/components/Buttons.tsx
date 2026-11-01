import type { ButtonHTMLAttributes } from "react";
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "name"> & {
  name: string;
  variant?: "primary" | "secondary";
  size?: "menu" | "compact";
};
export function Button({
  name,
  variant = "primary",
  size = "menu",
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      className={`button ${variant === "secondary" ? "secondary" : ""} ${
        size === "compact" ? "small" : ""
      } ${className}`}
    >
      {name}
    </button>
  );
}
