import { useState } from "react";
import { Button, Input } from "../primitives";
import s from "./domain.module.css";

export type ChatMsg = { role: "user" | "assistant"; text: string };

/** HITL 채팅 패널 — 감독(사람)이 지시·재생성·채택을 대화로. */
export function ChatPanel({ messages, onSend }:
  { messages: ChatMsg[]; onSend?: (text: string) => void }) {
  const [v, setV] = useState("");
  const send = () => { if (v.trim()) { onSend?.(v.trim()); setV(""); } };
  return (
    <div className={s.chat}>
      <div className={s.chatLog}>
        {messages.map((m, i) => (
          <div key={i} className={`${s.msg} ${m.role === "user" ? s.msgUser : s.msgBot}`}>
            <div className={s.msgRole}>{m.role === "user" ? "감독" : "빌더"}</div>
            {m.text}
          </div>
        ))}
      </div>
      <div className={s.chatInput}>
        <Input value={v} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} placeholder="지시·피드백 입력 (예: 더 음모적으로)" />
        <Button variant="primary" onClick={send}>전송</Button>
      </div>
    </div>
  );
}
