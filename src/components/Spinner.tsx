export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`spinner${large ? " spinner-lg" : ""}`} aria-hidden="true" />;
}