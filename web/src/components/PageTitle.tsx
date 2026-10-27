import { Book } from "./Icons";

export function PageTitle({ children }: { children: string }) {
  return (
    <div className="page-heading">
      <Book />
      <h1 className={children.length > 8 ? "long-title" : undefined}>
        {children}
      </h1>
    </div>
  );
}
