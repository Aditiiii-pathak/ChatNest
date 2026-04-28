"use client";

import { useMemo, useState } from "react";
import type { Message } from "@/types";
import { useChatStore } from "@/store/useChatStore";
import Loader from "./Loader";
import MarkdownContent from "./MarkdownContent";

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const updateMessage = useChatStore((s) => s.updateMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const formattedTime = useMemo(() => {
    try {
      return new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, [message.created_at]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditContent(message.content);
  };

  const handleSave = async () => {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await updateMessage(message.id, editContent);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to edit message:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    setIsDeleting(true);
    try {
      await removeMessage(message.id);
    } catch (err) {
      console.error("Failed to delete message:", err);
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-4 group`}
    >
      <div
        className={`
          relative max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed
          transition-all duration-200 sm:max-w-[85%]
          ${
            isUser
              ? "bg-emerald-600 text-white rounded-br-md shadow-lg shadow-emerald-600/20"
              : "bg-zinc-800 text-zinc-100 rounded-bl-md shadow-lg shadow-zinc-900/30 border border-zinc-700/50"
          }
          ${isDeleting ? "opacity-30 grayscale" : ""}
        `}
      >
        {/* Avatar indicator */}
        <div
          className={`mb-1 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider ${
            isUser ? "text-emerald-200" : "text-zinc-400"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isUser ? "bg-emerald-300" : "bg-violet-400"
              }`}
            />
            {isUser ? "You" : "ChatNest AI"}
          </div>

          {/* Action buttons (only for user messages and when not editing) */}
          {isUser && !isEditing && !isDeleting && (
            <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={handleEdit}
                className="hover:text-white"
                aria-label="Edit message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.917 6.917a4 4 0 01-1.341.888l-3.155 1.262a.75.75 0 01-.92-.92z" />
                  <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                </svg>
              </button>
              <button
                onClick={handleDelete}
                className="hover:text-red-300"
                aria-label="Delete message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75V4H5a2 2 0 00-2 2v.095c.148.067.3.136.452.206l1.32.61a51.645 51.645 0 0110.457 0l1.32-.61c.152-.07.304-.139.452-.206V6a2 2 0 00-2-2h-1V3.75A2.75 2.75 0 0011.25 1h-2.5zM7.5 3.75a1.25 1.25 0 011.25-1.25h2.5a1.25 1.25 0 011.25 1.25V4h-5v-.25zM4 6.75a.75.75 0 01.75-.75h10.5a.75.75 0 01.75.75v10.5A2.75 2.75 0 0113.25 20H6.75A2.75 2.75 0 014 17.25V6.75z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Message content */}
        {isEditing ? (
          <div className="flex flex-col gap-2 min-w-[200px]">
            <textarea
              autoFocus
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-emerald-700/50 text-white rounded-lg p-2 border border-emerald-400/30 focus:outline-none focus:border-white/50 resize-none text-sm min-h-[60px]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-2 py-1 text-[11px] font-medium hover:text-white"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1 rounded bg-white px-3 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <MarkdownContent
            content={message.content}
            variant={isUser ? "user" : "assistant"}
          />
        )}

        {/* Timestamp */}
        <div
          className={`mt-2 flex items-center justify-between text-[10px] ${
            isUser ? "text-emerald-200/60" : "text-zinc-500"
          }`}
        >
          <span>{isDeleting ? "Deleting..." : ""}</span>
          <span>{formattedTime}</span>
        </div>
      </div>
    </div>
  );
}
