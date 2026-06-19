'use client';

import { useEffect, useState, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClientComponentClient();

  // גלילה אוטומטית להודעה האחרונה
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    // 1. טעינה ראשונית של הודעות
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      
      if (data) setMessages(data);
    };
    fetchMessages();

    // 2. האזנה להודעות חדשות בזמן אמת
    const channel = supabase
      .channel(`chat:${bookingId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `booking_id=eq.${bookingId}` 
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as MessageRow]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookingId, supabase]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // שליחה לבסיס הנתונים
    const { error } = await supabase.from('messages').insert({
      booking_id: bookingId,
      sender_id: userId,
      content: newMessage
    });

    if (!error) {
      setNewMessage('');
    }
  };

  return (
    <div className="flex flex-col h-[400px] border rounded-lg bg-gray-50 overflow-hidden">
      {/* אזור ההודעות */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div 
            key={m.id} 
            className={`flex ${m.sender_id === userId ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] p-3 rounded-lg shadow-sm ${
              m.sender_id === userId 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-white text-gray-800 rounded-tl-none border'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* אזור הקלט */}
      <form onSubmit={sendMessage} className="p-3 bg-white border-t flex gap-2">
        <input 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="הקלד הודעה..."
        />
        <button 
          type="submit" 
          disabled={!newMessage.trim()}
          className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50"
        >
          שלח
        </button>
      </form>
    </div>
  );
}