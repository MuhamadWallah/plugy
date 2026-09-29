import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Send, MessageSquare, RefreshCw, AlertCircle, Sparkles, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export interface ChatMessage {
  id: string;
  job_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

interface ChatPanelProps {
  jobId: string;
  posterId: string;
  workerId: string | null;
  posterName: string;
  workerName?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  jobId,
  posterId,
  workerId: _workerId,
  posterName,
  workerName,
}) => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [inputBody, setInputBody] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPoster = user?.id === posterId;
  const otherPartyName = isPoster ? (workerName || 'Worker') : posterName;

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  // Fetch historical messages
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/messages`, {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Only the poster or assigned worker can access messages for this job');
        }
        throw new Error('Failed to load chat messages');
      }

      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching messages');
    } finally {
      setLoading(false);
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [jobId, scrollToBottom]);

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime Socket.IO Room & Message Handling
  useEffect(() => {
    if (!socket) return;

    // Join the job's dedicated communication room
    socket.emit('join:job', jobId);

    const handleNewMessage = (newMessage: ChatMessage) => {
      if (newMessage.job_id === jobId) {
        setMessages((prev) => {
          // Avoid duplicate messages if already present
          if (prev.some((m) => m.id === newMessage.id)) {
            return prev;
          }
          return [...prev, newMessage];
        });
        setTimeout(() => scrollToBottom(true), 50);
      }
    };

    socket.on('message:new', handleNewMessage);

    return () => {
      socket.emit('leave:job', jobId);
      socket.off('message:new', handleNewMessage);
    };
  }, [socket, jobId, scrollToBottom]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputBody.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ body: trimmed }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await res.json();
      // Optimistically append if not already received from socket
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) {
            return prev;
          }
          return [...prev, data.message];
        });
      }

      setInputBody('');
      setTimeout(() => scrollToBottom(true), 50);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sending message');
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden shadow-inner">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Chat with {otherPartyName}</span>
              <span className="text-[10px] font-normal text-slate-400">
                ({isPoster ? 'Assigned Worker' : 'Job Poster'})
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span>{connected ? 'Live Realtime' : 'Reconnecting...'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={fetchMessages}
          disabled={loading}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          title="Refresh Messages"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Messages List View */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[220px] max-h-[340px]">
        {loading && messages.length === 0 ? (
          <div className="h-full py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
            <span className="text-xs">Loading conversation history...</span>
          </div>
        ) : error && messages.length === 0 ? (
          <div className="h-full py-8 flex flex-col items-center justify-center gap-2 text-center text-rose-400 px-4">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full py-10 flex flex-col items-center justify-center text-center px-4 space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-xs font-semibold text-slate-200">No messages yet</p>
            <p className="text-[11px] text-slate-400 max-w-[260px] leading-relaxed">
              Coordinate details, timing, or ask questions directly with {otherPartyName}.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-end gap-2 max-w-[85%]">
                  {!isMe && (
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-slate-950 font-bold flex items-center justify-center text-[10px] shrink-0">
                      {msg.sender.name ? msg.sender.name.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      isMe
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 font-medium rounded-br-xs shadow-md'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-xs'
                    }`}
                  >
                    {!isMe && (
                      <div className="text-[10px] font-bold text-emerald-400 mb-0.5">
                        {msg.sender.name}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <div
                      className={`text-[9px] mt-1 flex items-center justify-end gap-1 ${
                        isMe ? 'text-emerald-950/70' : 'text-slate-500'
                      }`}
                    >
                      <span>{formatMessageTime(msg.created_at)}</span>
                      {isMe && <CheckCheck className="w-3 h-3 text-emerald-900" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Inline Error Toast */}
      {error && messages.length > 0 && (
        <div className="px-3 py-1.5 bg-rose-500/10 border-t border-rose-500/20 text-rose-400 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Message Input Form */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={inputBody}
          onChange={(e) => setInputBody(e.target.value)}
          placeholder={`Message ${otherPartyName}...`}
          maxLength={2000}
          disabled={sending}
          className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputBody.trim() || sending}
          className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 hover:from-emerald-300 hover:to-teal-400 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
        >
          {sending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
