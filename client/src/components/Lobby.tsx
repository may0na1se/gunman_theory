import { useState } from 'react';
import { useGameStore } from '../store/useGameStore';

export default function Lobby() {
    const { socket, isConnected, setUsername, setRoomId, roomList } = useGameStore();
    const [nameInput, setNameInput] = useState('');
    const [roomInput, setRoomInput] = useState('');

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!nameInput.trim() || !roomInput.trim() || !socket || !isConnected) return;

        setUsername(nameInput);
        setRoomId(roomInput);

        // 서버로 방 입장 요청
        socket.emit('join_room', { roomId: roomInput, username: nameInput });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <div className="bg-dark-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-700">
                <h1 className="text-4xl font-bold text-primary-500 mb-2 text-center">총잡이 이론</h1>
                <p className="text-gray-400 text-center mb-8">안전한(?) 총잡이들의 세계에 오신 것을 환영합니다.</p>

                {!isConnected ? (
                    <div className="bg-red-900/50 text-red-200 p-4 rounded-lg text-center font-bold">
                        서버에 연결 중입니다...
                    </div>
                ) : (
                    <form onSubmit={handleJoin} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">닉네임</label>
                            <input
                                type="text"
                                maxLength={10}
                                required
                                value={nameInput}
                                onChange={e => setNameInput(e.target.value)}
                                className="w-full bg-dark-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
                                placeholder="멋진 이름을 지어주세요"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">방 코드</label>
                            <input
                                type="text"
                                maxLength={10}
                                required
                                value={roomInput}
                                onChange={e => setRoomInput(e.target.value.toUpperCase())}
                                className="w-full bg-dark-900 border border-gray-600 rounded-lg px-4 py-3 text-white uppercase focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all font-bold tracking-widest"
                                placeholder="예: ROOM123"
                            />
                        </div>

                        <button
                            type="submit"
                            className="mt-4 w-full bg-primary-500 hover:bg-yellow-400 text-dark-900 font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                        >
                            게임 방 입장하기
                        </button>
                    </form>
                )}
            </div>

            {/* 현재 개설된 방 목록 표시 영역 */}
            {isConnected && (
                <div className="mt-8 w-full max-w-md bg-dark-800 p-6 rounded-2xl border border-gray-700 shadow-lg">
                    <h2 className="text-xl font-bold text-gray-200 mb-4 flex items-center justify-between">
                        <span>현재 열린 게임 방</span>
                        <span className="text-sm bg-dark-900 px-3 py-1 rounded-full text-primary-500">{roomList.length}개</span>
                    </h2>

                    {roomList.length === 0 ? (
                        <div className="text-center text-gray-500 py-8 bg-dark-900 rounded-xl border border-dashed border-gray-700">
                            진행 중인 방이 없습니다.<br />새로운 방을 만들어보세요!
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {roomList.map((room) => (
                                <div
                                    key={room.id}
                                    onClick={() => {
                                        if (room.status === 'playing' || room.status === 'finished') {
                                            alert('이미 게임이 진행 중이거나 종료된 방입니다.');
                                            return;
                                        }
                                        if (room.playersCount >= room.maxPlayers) {
                                            alert('방이 꽉 찼습니다.');
                                            return;
                                        }
                                        setRoomInput(room.id);
                                    }}
                                    className={`
                                        flex items-center justify-between p-4 rounded-xl border transition-all
                                        ${room.status === 'waiting' && room.playersCount < room.maxPlayers
                                            ? 'bg-dark-900 border-gray-600 hover:border-primary-500 cursor-pointer hover:bg-dark-800'
                                            : 'bg-dark-900 border-gray-800 opacity-60 cursor-not-allowed'}
                                    `}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold text-lg">{room.id}</span>
                                        <span className="text-xs text-gray-400">
                                            {room.status === 'waiting' ? '대기 중' : room.status === 'playing' ? `라운드 ${room.round} 진행 중` : '결과 화면'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-black ${room.playersCount >= room.maxPlayers ? 'text-red-500' : 'text-primary-500'}`}>
                                            {room.playersCount} / {room.maxPlayers}명
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
