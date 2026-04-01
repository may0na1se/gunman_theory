import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';

export default function SystemLog() {
    const socket = useGameStore(state => state.socket);
    const roomState = useGameStore(state => state.roomState);

    const [messages, setMessages] = useState<string[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!socket) return;

        const handleSystemMessage = (message: string) => {
            setMessages(prev => [...prev.slice(-79), message]);
        };

        socket.on('system_message', handleSystemMessage);

        return () => {
            socket.off('system_message', handleSystemMessage);
        };
    }, [socket]);

    if (!roomState) return null;

    return (
        <div className="fixed top-1/2 -translate-y-1/2 right-4 z-[500] flex flex-col w-80 h-96 max-h-[60vh] bg-dark-900/40 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-2xl pointer-events-auto">
            <div className="px-3 py-2 border-b border-gray-700/50 text-sm font-bold text-yellow-400">
                시스템 로그
            </div>
            <div
                className="flex-1 overflow-y-auto p-3 flex flex-col gap-2"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 transparent' }}
            >
                {messages.map((message, idx) => (
                    <div key={idx} className="bg-dark-800/90 text-gray-200 px-3 py-2 rounded shadow-sm border-l-4 border-yellow-500 text-xs w-full break-keep animate-fade-in-up">
                        {message}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
