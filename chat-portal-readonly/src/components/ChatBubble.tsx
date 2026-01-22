import { Badge } from "./Badge";

export function ChatBubble(props: {
  accountType: string | null;
  agentUsername: string | null;
  ts: string;
  text: string;
}) {
  const who = props.agentUsername ? `Agent: ${props.agentUsername}` : (props.accountType ?? "unknown");
  return (
    <div className="bg-white rounded border p-3">
      <div className="flex justify-between items-center text-xs text-gray-600">
        <div className="flex gap-2 items-center">
          <Badge text={who} />
        </div>
        <div>{new Date(props.ts).toLocaleString()}</div>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm">{props.text}</div>
    </div>
  );
}
