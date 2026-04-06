import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';

interface ChatMessage {
    sender: string;
    message: string;
    senderId: string;
}

export default function Chat() {
    const socket = useGameStore(state => state.socket);
    const roomState = useGameStore(state => state.roomState);
    const isRouletteLayout = roomState?.status === 'roulette_setup' || roomState?.status === 'roulette_running';

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 새 메세지가 추가될 때마다 스크롤을 맨 아래로 이동
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 유저 채팅 수신
    useEffect(() => {
        if (!socket) return;

        const handleChatMessage = (chatMessage: ChatMessage) => {
            setMessages(prev => [...prev, chatMessage]);
        };

        socket.on('chat_message', handleChatMessage);

        return () => {
            socket.off('chat_message', handleChatMessage);
        };
    }, [socket]);

    const handleSendChat = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !socket) return;
        socket.emit('send_chat', { message: chatInput.trim().slice(0, 20) });
        setChatInput('');
    };

    // 방에 없으면 채팅창 숨김 (로비에서는 안 보임)
    if (!roomState) return null;

    const rouletteStyle = isRouletteLayout
        ? {
            top: '1rem',
            left: '1rem',
            right: 'auto',
            transform: 'none',
            height: '44vh',
            maxHeight: '44vh'
        }
        : {
            top: '50%',
            left: '1rem',
            right: 'auto',
            transform: 'translateY(-50%)',
            height: '24rem',
            maxHeight: '60vh'
        };

    return (
        <div
            className="fixed z-[500] flex flex-col w-80 min-h-[320px] bg-dark-900/40 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-2xl pointer-events-auto"
            style={rouletteStyle}
        >
            <div className="px-3 py-2 border-b border-gray-700/50 text-sm font-bold text-primary-500">
                채팅
            </div>
            {/* 메세지 스크롤 구역 */}
            <div
                className="flex-1 overflow-y-auto p-3 flex flex-col gap-2"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 transparent' }}
            >
                {messages.map((msg, idx) => (
                    <div key={`${msg.senderId}-${idx}`} className="bg-dark-800/90 text-gray-200 px-3 py-2 rounded shadow-sm border-l-4 border-primary-500 text-xs w-full break-keep animate-fade-in-up">
                        <span className="font-bold text-primary-400 mr-2">[{msg.sender}]</span>
                        <span>{msg.message}</span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* 하단 입력 폼 구역 */}
            <form
                onSubmit={handleSendChat}
                className="p-2 border-t border-gray-700/50 flex gap-2"
            >
                <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="채팅 치기..."
                    maxLength={20}
                    className="flex-1 bg-dark-800/80 text-white text-xs px-3 py-2 rounded border border-gray-600 outline-none focus:border-primary-500"
                />
                <button type="submit" className="bg-primary-500 text-dark-900 text-xs font-bold px-3 py-2 rounded hover:bg-yellow-400 transition-colors">
                    전송
                </button>
            </form>
        </div>
    );
}
