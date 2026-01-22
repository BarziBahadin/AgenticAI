export function Badge({ text }: { text: string }) {
  return <span className="px-2 py-1 text-xs rounded bg-gray-100 border">{text}</span>;
}
