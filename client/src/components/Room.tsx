import { useGameStore } from '../store/useGameStore';
import { Users, Crown, Check } from 'lucide-react';

export default function Room() {
    const { roomState, username, socket, setRoomState } = useGameStore();

    if (!roomState) return null;

    const myPlayer = roomState.players.find(p => p.name === username);
    const isHost = myPlayer?.isHost;

    const handleLeaveRoom = () => {
        if (socket) {
            // 소켓을 강제로 끊었다 다시 연결하여 방에서 완전히 나가도록 처리 (가장 깔끔한 로컬 처리방식)
            socket.disconnect();
            socket.connect();
        }
        setRoomState(null);
    };

    const handleToggleReady = () => {
        if (socket) socket.emit('toggle_ready');
    };

    const handleStartGame = () => {
        // 최소 3명 이상, 본인 제외 모두 준비완료 상태인지 체크
        // 임시로 그냥 시작 가능하게 하거나, 준비된 인원 검증 로직 추가 (기획엔 없었지만 구색맞추기)
        const allOthersReady = roomState.players.filter(p => p.id !== myPlayer?.id).every(p => p.ready);
        if (socket && allOthersReady) {
            socket.emit('start_game');
        } else {
            alert('모든 플레이어가 준비를 완료해야 합니다.');
        }
    };

    // 최대 8명까지 자리 렌더링용 배열 (빈자리 포함)
    const maxPlayers = 8;
    const playerSlots = Array.from({ length: maxPlayers }).map((_, i) => roomState.players[i] || null);

    return (
        <div className="flex flex-col items-center justify-start min-h-screen p-8 max-w-5xl mx-auto">

            {/* 바 상단: 방 정보 */}
            <div className="w-full flex justify-between items-center mb-8 bg-dark-800 p-6 rounded-2xl border border-gray-700 shadow-xl">
                <div>
                    <h2 className="text-sm text-gray-400 capitalize mb-1">현재 위치</h2>
                    <div className="text-3xl font-black text-white tracking-wider font-mono">
                        {roomState.id}
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-dark-900 px-4 py-2 rounded-lg text-primary-500 font-bold">
                    <Users size={20} />
                    <span>{roomState.players.length} / 8</span>
                </div>
            </div>

            {/* 플레이어 목록 (원탁 형태 대신 임시로 그리드뷰 구축) */}
            <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                {playerSlots.map((player, index) => (
                    <div
                        key={index}
                        className={`
              relative flex flex-col items-center justify-center p-6 rounded-2xl h-40 transition-all border-2
              ${player ? (player.name === username ? 'bg-dark-800 border-primary-500' : 'bg-dark-800 border-gray-700') : 'bg-dark-900 border-dashed border-gray-800'}
            `}
                    >
                        {player ? (
                            <>
                                {player.isHost && (
                                    <div className="absolute -top-3 text-primary-500 bg-dark-900 rounded-full p-1 border border-gray-700 mb-2">
                                        <Crown size={20} />
                                    </div>
                                )}

                                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-3 ${player.name === username ? 'bg-primary-500 text-dark-900' : 'bg-gray-700 text-white'}`}>
                                    {player.name.substring(0, 2)}
                                </div>

                                <span className="font-bold text-gray-200">{player.name}</span>
                                {player.name === username && <span className="text-xs text-primary-500 absolute bottom-3">나</span>}

                                {/* 준비 완료 상태 뱃지 */}
                                {player.ready && !player.isHost && (
                                    <div className="absolute top-2 right-2 bg-green-500 text-dark-900 text-xs font-bold px-2 py-1 rounded shadow-md z-10 flex items-center gap-1">
                                        <Check size={12} strokeWidth={4} /> READY
                                    </div>
                                )}
                            </>
                        ) : (
                            <span className="text-gray-600 font-medium">빈 자리</span>
                        )}
                    </div>
                ))}
            </div>

            {/* 하단 컨트롤 바 */}
            <div className="flex gap-4 w-full max-w-md">
                {!isHost ? (
                    <button
                        onClick={handleToggleReady}
                        className={`flex-1 py-4 font-bold rounded-xl text-lg flex items-center justify-center gap-2 transition-colors 
                            ${myPlayer?.ready
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        <Check size={24} /> {myPlayer?.ready ? '준비 취소' : '준비 완료'}
                    </button>
                ) : (
                    <button
                        onClick={handleStartGame}
                        disabled={roomState.players.length < 3}
                        className={`flex-1 py-4 font-bold rounded-xl text-lg flex items-center justify-center gap-2 transition-colors 
              ${roomState.players.length >= 3 ? 'bg-primary-500 hover:bg-yellow-400 text-dark-900' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                    >
                        게임 시작 (최소 3명)
                    </button>
                )}
            </div>

            <button
                onClick={handleLeaveRoom}
                className="mt-6 text-gray-500 hover:text-red-400 underline underline-offset-4 text-sm font-bold transition-colors"
            >
                방 나가기
            </button>

        </div>
    );
}
