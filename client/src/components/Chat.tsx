import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';

export default function Chat() {
    const socket = useGameStore(state => state.socket);
    const roomState = useGameStore(state => state.roomState);

    const [messages, setMessages] = useState<string[]>([]);
    const [chatInput, setChatInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 새 메세지가 추가될 때마다 스크롤을 맨 아래로 이동
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 글로벌 메시지 수신 (InGame.tsx의 효과음/화면흔들기 로직은 InGame에 유지, 여기선 채팅만 쌓음)
    useEffect(() => {
        if (!socket) return;

        const handleGlobalMessage = (msg: string) => {
            setMessages(prev => [...prev, msg]);
        };

        socket.on('global_message', handleGlobalMessage);

        return () => {
            socket.off('global_message', handleGlobalMessage);
        };
    }, [socket]);

    const handleSendChat = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !socket) return;
        socket.emit('send_chat', { message: chatInput.trim() });
        setChatInput('');
    };

    // 방에 없으면 채팅창 숨김 (로비에서는 안 보임)
    if (!roomState) return null;

    return (
        <div
            className="fixed top-1/2 -translate-y-1/2 left-4 z-[500] flex flex-col w-80 h-96 max-h-[60vh] bg-dark-900/40 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-2xl pointer-events-auto"
        >
            {/* 메세지 스크롤 구역 */}
            <div
                className="flex-1 overflow-y-auto p-3 flex flex-col gap-2"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 transparent' }}
            >
                {messages.map((msg, idx) => (
                    <div key={idx} className="bg-dark-800/90 text-gray-200 px-3 py-2 rounded shadow-sm border-l-4 border-primary-500 text-xs w-full break-keep animate-fade-in-up">
                        {msg}
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
                    maxLength={50}
                    className="flex-1 bg-dark-800/80 text-white text-xs px-3 py-2 rounded border border-gray-600 outline-none focus:border-primary-500"
                />
                <button type="submit" className="bg-primary-500 text-dark-900 text-xs font-bold px-3 py-2 rounded hover:bg-yellow-400 transition-colors">
                    전송
                </button>
            </form>
        </div>
    );
}
