import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';

interface SystemMessage {
    message: string;
    type: 'presence' | 'round' | 'combat' | 'warning' | 'economy' | 'info';
}

export default function SystemLog() {
    const socket = useGameStore(state => state.socket);
    const roomState = useGameStore(state => state.roomState);
    const isRouletteLayout = roomState?.status === 'roulette_setup' || roomState?.status === 'roulette_running';

    const [messages, setMessages] = useState<SystemMessage[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!socket) return;

        const handleSystemMessage = (payload: SystemMessage | string) => {
            const normalizedPayload = typeof payload === 'string'
                ? { message: payload, type: 'info' as const }
                : payload;

            setMessages(prev => [...prev.slice(-79), normalizedPayload]);
        };

        socket.on('system_message', handleSystemMessage);

        return () => {
            socket.off('system_message', handleSystemMessage);
        };
    }, [socket]);

    if (!roomState) return null;

    return (
        <div
            className={`fixed z-[500] flex flex-col w-80 bg-dark-900/40 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-2xl pointer-events-auto ${
                isRouletteLayout
                    ? 'left-4 top-[calc(44vh+1.5rem)] h-[32vh] min-h-[220px] max-h-[32vh]'
                    : 'right-4 top-1/2 -translate-y-1/2 h-96 max-h-[60vh]'
            }`}
        >
            <div className="px-3 py-2 border-b border-gray-700/50 text-sm font-bold text-yellow-400">
                시스템 로그
            </div>
            <div
                className="flex-1 overflow-y-auto p-3 flex flex-col gap-2"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 transparent' }}
            >
                {messages.map((message, idx) => (
                    <div
                        key={idx}
                        className={`px-3 py-2 rounded shadow-sm text-xs w-full break-keep animate-fade-in-up ${
                            message.type === 'presence'
                                ? 'bg-dark-800/80 text-gray-300 border-l-4 border-gray-500'
                                : message.type === 'round'
                                    ? 'bg-yellow-900/20 text-yellow-100 border-l-4 border-yellow-500'
                                    : message.type === 'combat'
                                        ? 'bg-red-900/20 text-red-100 border-l-4 border-red-500'
                                        : message.type === 'warning'
                                            ? 'bg-orange-900/20 text-orange-100 border-l-4 border-orange-500'
                                            : message.type === 'economy'
                                                ? 'bg-emerald-900/20 text-emerald-100 border-l-4 border-emerald-500'
                                                : 'bg-sky-900/20 text-sky-100 border-l-4 border-sky-500'
                        }`}
                    >
                        {message.message}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
