import { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';

export default function Lobby() {
    const { socket, isConnected, setUsername, setRoomId, roomList } = useGameStore();
    const [nameInput, setNameInput] = useState('');
    const [roomInput, setRoomInput] = useState('');
    const [nameError, setNameError] = useState('');
    const [roomError, setRoomError] = useState('');

    useEffect(() => {
        if (!socket) return;

        const handleJoinRoomError = (message: string) => {
            setRoomError(message);
        };

        socket.on('join_room_error', handleJoinRoomError);

        return () => {
            socket.off('join_room_error', handleJoinRoomError);
        };
    }, [socket]);

    const validateJoinTarget = (targetRoomId: string) => {
        const normalizedRoomId = targetRoomId.trim().toUpperCase();
        const targetRoom = roomList.find(room => room.id === normalizedRoomId);

        if (!targetRoom) {
            return true;
        }

        if (targetRoom.playersCount >= targetRoom.maxPlayers) {
            setRoomError('방이 꽉 찼습니다.');
            return false;
        }

        return true;
    };

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!nameInput.trim()) {
            setNameError('닉네임을 입력하세요!');
            return;
        }
        setNameError('');

        if (!roomInput.trim() || !socket || !isConnected) {
            return;
        }

        const normalizedRoomId = roomInput.trim().toUpperCase();
        if (!validateJoinTarget(normalizedRoomId)) {
            return;
        }

        setRoomError('');

        setUsername(nameInput);
        setRoomId(normalizedRoomId);

        // 서버로 방 입장 요청
        socket.emit('join_room', { roomId: normalizedRoomId, username: nameInput });
    };

    const handleJoinRoom = (targetRoomId: string) => {
        if (!nameInput.trim()) {
            setNameError('닉네임을 입력하세요!');
            return;
        }
        setNameError('');
        if (!socket || !isConnected) return;

        if (!validateJoinTarget(targetRoomId)) {
            return;
        }

        setRoomError('');

        setUsername(nameInput);
        setRoomId(targetRoomId);
        setRoomInput(targetRoomId);

        socket.emit('join_room', { roomId: targetRoomId, username: nameInput });
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
                                onChange={e => {
                                    setNameInput(e.target.value);
                                    if (nameError) setNameError('');
                                }}
                                className={`w-full bg-dark-900 border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-1 transition-all ${nameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-600 focus:border-primary-500 focus:ring-primary-500'}`}
                                placeholder="멋진 이름을 지어주세요"
                            />
                            {nameError && (
                                <p className="mt-2 text-sm font-medium text-red-400">{nameError}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">방 제목</label>
                            <input
                                type="text"
                                maxLength={10}
                                required
                                value={roomInput}
                                onChange={e => {
                                    setRoomInput(e.target.value.toUpperCase());
                                    if (roomError) setRoomError('');
                                }}
                                className={`w-full bg-dark-900 border rounded-lg px-4 py-3 text-white uppercase focus:outline-none focus:ring-1 transition-all font-bold tracking-widest ${roomError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-600 focus:border-primary-500 focus:ring-primary-500'}`}
                                placeholder=""
                            />
                            {roomError && (
                                <p className="mt-2 text-sm font-medium text-red-400">{roomError}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="mt-4 w-full bg-primary-500 hover:bg-yellow-400 text-dark-900 font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                        >
                            게임 방 만들기
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
                                    onClick={() => handleJoinRoom(room.id)}
                                    className={`
                                        flex items-center justify-between p-4 rounded-xl border transition-all
                                        ${room.playersCount < room.maxPlayers
                                            ? 'bg-dark-900 border-gray-600 hover:border-primary-500 cursor-pointer hover:bg-dark-800'
                                            : 'bg-dark-900 border-gray-800 opacity-60 cursor-not-allowed'}
                                    `}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold text-lg">{room.id}</span>
                                        <span className="text-xs text-gray-400">
                                            {room.status === 'waiting'
                                                ? '대기 중'
                                                : room.status === 'playing'
                                                    ? `라운드 ${room.round} / 4 진행 중 · 관전 가능`
                                                    : room.status === 'finished'
                                                        ? '결과 화면 · 관전 가능'
                                                        : room.status === 'roulette_setup'
                                                            ? '핀볼 준비 중 · 관전 가능'
                                                            : '핀볼 진행 중 · 관전 가능'}
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
