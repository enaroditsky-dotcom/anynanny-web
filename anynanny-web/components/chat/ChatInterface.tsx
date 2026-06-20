'use client';

import { useEffect, useState, useRef } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchBookingMessages, sendBookingMessage } from '@/lib/chat/booking-messages';

interface MessageRow {
  id: string;
  booking_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export default function ChatInterface({ bookingId, userId }: { bookingId: string; userId: string }) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // גלילה אוטומטית להודעה האחרונה
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !bookingId) return;

    // 1. טעינה ראשונית של הודעות בצורה מאובטחת דרך הפונקציה המובנית שלך
    const loadInitialMessages = async () => {
      const { messages: fetched, error } = await fetchBookingMessages(supabase, bookingId);
      if (!error && fetched) {
        setMessages(fetched as MessageRow[]);
      }
    };
    void loadInitialMessages();

    // 2. האזנה להודעות חדשות בזמן אמת דרך ערוץ הריל-טיים הרשמי
    const channel = supabase
      .channel(`chat:${bookingId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `booking_id=eq.${bookingId}` 
      }, (payload) => {
        const incoming = payload.new as MessageRow;
        // מניעת כפילות בסטייט המקומי אם זו הודעה שהקליינט הנוכחי כבר הוסיף
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      })
      .subscribe();

    return () => { 
      void supabase.removeChannel(channel); 
    };
  }, [bookingId]);

  const sendMessageHandler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const currentText = newMessage.trim();
    setSending(true);

    // שליחה דרך מתודת ה-Lib המאובטחת שלך
    const { message, error } = await sendBookingMessage(supabase, bookingId, userId, currentText);

    if (!error && message) {
      setNewMessage('');
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message as MessageRow];
      });
    } else if (error) {
      console.error("[ChatInterface] Failed to send message:", error);
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col h-[400px] border rounded-lg bg-gray-50 overflow-hidden" dir="rtl">
      {/* אזור ההודעות */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div 
            key={m.id} 
            className={`flex ${m.sender_id === userId ? 'justify-start' : 'justify-end'}`}
          >
            <div className={`max-w-[80%] p-3 rounded-2xl shadow-sm text-right text-sm leading-relaxed ${
              m.sender_id === userId 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white text-gray-800 rounded-bl-none border border-slate-100'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* אזור הקלט */}
      <form onSubmit={sendMessageHandler} className="p-3 bg-white border-t flex gap-2 items-center">
        <input 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          disabled={sending}
          className="flex-1 border border-slate-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 text-right"
          placeholder="הקלד הודעה..."
        />
        <button 
          type="submit" 
          disabled={!newMessage.trim() || sending}
          className="bg-blue-600 text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition active:scale-[0.98]"
        >
          {sending ? 'שולח...' : 'שלח'}
        </button>
      </form>
    </div>
  );
}