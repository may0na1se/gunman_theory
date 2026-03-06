import { useState, useEffect } from 'react';
import { useGameStore, CARD_INFO, type Player, type ActiveCardType } from '../store/useGameStore';
import { Skull, Target, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import targetPng from '../assets/target.png';
import firedSfx from '../assets/fired.mp3';
import failedSfx from '../assets/failed.mp3';
import clangSfx from '../assets/clang.mp3';

export default function InGame() {
    const socket = useGameStore(state => state.socket);
    const roomState = useGameStore(state => state.roomState);
    const username = useGameStore(state => state.username);

    // 최종 순위 정보 상태
    const [rankings, setRankings] = useState<Player[] | null>(null);

    // 카드 타겟 지정 모드 여부
    const [activeCardMode, setActiveCardMode] = useState<ActiveCardType | null>(null);

    // 사격 타겟 지정 모드 여부 및 마우스 커서 공유
    const [isShootingMode, setIsShootingMode] = useState(false);
    const [otherCursors, setOtherCursors] = useState<{ [id: string]: { id: string, x: number, y: number, name: string, isShootingMode: boolean } }>({});

    // 타격감/애니메이션 (화면 흔들림, 피격 섬광)
    const [isShaking, setIsShaking] = useState(false);
    const [flashColor, setFlashColor] = useState<'transparent' | 'red' | 'white'>('transparent');

    // 내 화면용 거대 커서 좌표 (64x64 렌더링용)
    const [myCursorPos, setMyCursorPos] = useState({ x: 0, y: 0 });

    // 다음 라운드 선택할 베팅 금액
    const [nextBet, setNextBet] = useState(15);

    // 라운드 종료 후 베팅 페이즈 진입 시, 라운드에 맞는 기본 베팅금 자동 세팅
    useEffect(() => {
        if (roomState?.phase === 'betting') {
            const nextRound = roomState.round + 1;
            // 2라운드=15, 3라운드=20, 4라운드=25
            setNextBet(5 + (nextRound * 5));
        }
    }, [roomState?.phase, roomState?.round]);

    useEffect(() => {
        if (!socket) return;

        // 글로벌 메시지(사격 적중/파산 등)가 올 때 화면 흔들기 감지 및 사운드 재생
        const handleGlobalMessage = (msg: string) => {
            // 키워드 기반 화면 진동 및 섬광
            if (msg.includes('적중') || msg.includes('사살')) {
                triggerShake('red');
            } else if (msg.includes('파산') || msg.includes('파괴') || msg.includes('발악')) {
                triggerShake('white');
            }

            // 키워드 기반 효과음 재생 (볼륨 50%)
            if (msg.includes('[도탄]')) {
                const audio = new Audio(clangSfx);
                audio.volume = 0.5;
                audio.play().catch(e => console.log('Audio play failed:', e));
            } else if (msg.includes('[적중]')) {
                const audio = new Audio(firedSfx);
                audio.volume = 0.5;
                audio.play().catch(e => console.log('Audio play failed:', e));
            } else if (msg.includes('[불발]')) {
                const audio = new Audio(failedSfx);
                audio.volume = 0.5;
                audio.play().catch(e => console.log('Audio play failed:', e));
            }
        };

        socket.on('global_message', handleGlobalMessage);

        // 게임 종료 및 최종 순위 정보 수신
        socket.on('game_over', ({ rankings }) => {
            setRankings(rankings);
        });

        return () => {
            socket.off('global_message', handleGlobalMessage);
            socket.off('game_over');
        };
    }, [socket]);

    // 마우스 조준 모드 시 내 커서 위치 브로드캐스트
    useEffect(() => {
        if (!socket) return;
        const handleMouseMove = (e: MouseEvent) => {
            if (!isShootingMode) return;

            // 내 화면에 크게 보일 커서 좌표 저장
            setMyCursorPos({ x: e.clientX, y: e.clientY });

            socket.emit('mouse_move', {
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight,
                isShootingMode: true
            });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [socket, isShootingMode]);

    // 사격 모드 해제 시 다른 사람들에게 사격 모드 아님을 알림
    useEffect(() => {
        if (!socket) return;
        if (!isShootingMode) {
            socket.emit('mouse_move', { x: 0, y: 0, isShootingMode: false });
        }
    }, [socket, isShootingMode]);

    // 다른 사람의 조준 커서 수신
    useEffect(() => {
        if (!socket) return;
        const handleOtherMouseMove = (data: any) => {
            setOtherCursors(prev => {
                const next = { ...prev };
                if (!data.isShootingMode) {
                    delete next[data.id];
                } else {
                    next[data.id] = data;
                }
                return next;
            });
        };
        socket.on('mouse_move', handleOtherMouseMove);
        return () => {
            socket.off('mouse_move', handleOtherMouseMove);
        };
    }, [socket]);

    const triggerShake = (color: 'red' | 'white') => {
        setFlashColor(color);
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 400); // 0.4초 흔들림
        setTimeout(() => setFlashColor('transparent'), 150); // 번쩍이는 0.15초만
    };

    if (!roomState) return null;

    const currentTurnPlayer = roomState.players[roomState.turnIndex];
    const isMyTurn = currentTurnPlayer?.name === username;

    const handleDrawCard = () => {
        if (!isMyTurn || !socket) return;
        setIsShootingMode(false);
        setActiveCardMode(null);
        socket.emit('action_draw_card');
    };

    const handleChangePassive = (stance: '증가' | '유지' | '감소') => {
        if (!socket || !roomState) return;
        socket.emit('change_passive', { stance });
    };

    // 내 카드 사용 버튼 클릭 핸들러
    const handleUseCard = (cardName: ActiveCardType, needTarget: boolean) => {
        if (!isMyTurn || !socket) return;
        const me = roomState.players.find(p => p.name === username);
        const cardMeta = CARD_INFO[cardName];

        if (cardMeta?.cost && me && me.money < cardMeta.cost) {
            alert(`비용이 부족합니다. ($${cardMeta.cost} 필요)`);
            return;
        }

        if (needTarget) {
            // 타겟 지정 모드로 토글
            setActiveCardMode(activeCardMode === cardName ? null : cardName);
            setIsShootingMode(false);
        } else {
            // 즉시 발동형 카드 (서버 전송)
            socket.emit('action_use_card', { cardName });
            setActiveCardMode(null);
        }
    };

    // 타겟 모드일 때 특정 유저를 클릭
    const handleTargetClick = (player: Player) => {
        if (!isMyTurn || !player.isAlive || player.name === username) return;

        if (activeCardMode) {
            socket?.emit('action_use_card', { cardName: activeCardMode, targetId: player.id });
            setActiveCardMode(null);
        } else if (isShootingMode) {
            socket?.emit('action_shoot', { targetId: player.id });
            setIsShootingMode(false);
        }
    };
    return (
        <motion.div
            animate={{
                x: isShaking ? [-10, 10, -10, 10, 0] : 0,
                y: isShaking ? [-10, 10, -10, 10, 0] : 0
            }}
            transition={{ duration: 0.15 }}
            className={`relative min-h-screen p-4 flex flex-col items-center justify-between overflow-hidden py-12 bg-dark-900 w-full ${isShootingMode ? 'cursor-none' : 'cursor-default'}`}
        >
            {/* 내 사격용 거대 커서 (내 화면 전용, 64x64 사이즈) */}
            {isShootingMode && (
                <div
                    className="fixed z-[100] pointer-events-none"
                    style={{
                        left: myCursorPos.x,
                        top: myCursorPos.y,
                        transform: 'translate(-50%, -50%)',
                        backgroundImage: `url(${targetPng})`,
                        backgroundSize: 'contain',
                        width: '64px',
                        height: '64px',
                        filter: 'drop-shadow(0 0 10px rgba(255,0,0,0.8))'
                    }}
                />
            )}

            {/* 타격감용 데미지 오버레이 (빨간색/하얀색 섬광) */}
            <div
                className="pointer-events-none fixed inset-0 z-50 transition-colors duration-150"
                style={{ backgroundColor: flashColor === 'red' ? 'rgba(255, 0, 0, 0.3)' : flashColor === 'white' ? 'rgba(255, 255, 255, 0.3)' : 'transparent' }}
            />

            {/* 다른 플레이어의 조준 커서 */}
            {Object.values(otherCursors).map(cursor => (
                <div
                    key={cursor.id}
                    className="fixed z-50 pointer-events-none"
                    style={{
                        left: `${cursor.x * 100}vw`,
                        top: `${cursor.y * 100}vh`,
                        transform: 'translate(-50%, -50%)',
                        backgroundImage: `url(${targetPng})`,
                        backgroundSize: 'contain',
                        width: '32px',
                        height: '32px',
                        filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.8))'
                    }}
                >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-white text-md font-bold bg-dark-700 px-3 py-1 rounded-full whitespace-nowrap border border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]">
                        {cursor.name}
                    </span>
                </div>
            ))}

            {/* 라운드 종료 / 다음 라운드 베팅 대기 UI */}
            <AnimatePresence>
                {roomState.phase === 'betting' && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-dark-900/90 backdrop-blur-md flex flex-col items-center justify-center p-8"
                    >
                        <h1 className="text-5xl font-black text-white mb-4 drop-shadow-lg">라운드 {roomState.round} 종료!</h1>
                        {roomState.winnerId === socket?.id ? (
                            <div className="bg-dark-800 p-8 rounded-2xl border-4 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.4)] w-full max-w-lg mt-8">
                                <h2 className="text-3xl font-bold text-yellow-500 mb-6 text-center">축하합니다! 생존하셨습니다.</h2>
                                <p className="text-gray-300 text-center mb-8 font-bold">다음 라운드의 기본 베팅 금액을 직접 설정해주세요.</p>
                                <div className="flex flex-col gap-4 mb-8">
                                    <input
                                        type="range"
                                        min="10" max="30" step="1"
                                        value={nextBet}
                                        onChange={e => setNextBet(Number(e.target.value))}
                                        className="w-full accent-yellow-500 cursor-pointer h-2 bg-gray-700 rounded-lg appearance-none"
                                    />
                                    <div className="text-center font-black text-4xl text-yellow-400 drop-shadow-md">
                                        ${nextBet}
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500 font-bold px-1 mt-1">
                                        <span>$10</span>
                                        <span>$30</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => socket?.emit('next_round_start', { betAmount: nextBet })}
                                    className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-dark-900 font-black text-xl rounded-xl shadow border-b-4 border-yellow-700 active:translate-y-1 active:border-b-0 transition-all"
                                >
                                    다음 라운드 시작 수락
                                </button>
                            </div>
                        ) : (
                            <div className="bg-dark-800 p-8 rounded-2xl border-2 border-gray-600 shadow-2xl w-full max-w-lg text-center mt-8">
                                {roomState.players.find(p => p.id === roomState.winnerId) ? (
                                    <>
                                        <p className="text-2xl font-bold text-gray-300 mb-2">
                                            <span className="text-primary-500">{roomState.players.find(p => p.id === roomState.winnerId)?.name}</span>님이 승리했습니다!
                                        </p>
                                        <p className="text-lg text-gray-400">승리자가 다음 라운드를 세팅 중입니다...</p>
                                    </>
                                ) : (
                                    <p className="text-2xl font-bold text-gray-300">방장이 다음 라운드를 세팅 중입니다...</p>
                                )}
                                <div className="mt-8 text-yellow-500 font-bold animate-pulse text-xl tracking-widest">잠시만 기다려주세요</div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 상단: 게임 정보 헤더 */}
            <div className="absolute top-4 left-4 z-20 bg-dark-800 p-4 rounded-xl border border-gray-700 shadow-xl opacity-80 hover:opacity-100 transition-opacity">
                <h2 className="text-xl font-bold text-primary-500 tracking-widest">{roomState.id}</h2>
                <p className="text-gray-400 font-semibold mb-2">Round {roomState.round} / 4</p>
                <p className="text-sm text-gray-400">이번 베팅금: <span className="text-white font-bold">${roomState.currentBet}</span></p>
            </div>

            {/* 우측 중단: 게임 진행 설명 패널 */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-72 bg-dark-800/80 backdrop-blur-md p-5 rounded-xl border border-gray-700 shadow-2xl flex flex-col gap-3 pointer-events-none">
                <h3 className="text-primary-500 font-bold border-b border-gray-600 pb-2 mb-1 flex items-center gap-2">
                    <AlertTriangle size={18} /> 게임 가이드
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                    • 본인의 턴에 <span className="text-red-400 font-bold">사격</span> 또는 <span className="text-blue-400 font-bold">카드를 받으면</span> 턴이 넘어갑니다.
                </p>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                    • <span className="text-yellow-400 font-bold">액티브 카드 사용</span>은 턴을 넘기지 않습니다.
                </p>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                    • <span className="text-green-400 font-bold">사격 확률 조정</span>은 패시브 카드를 통해 언제든지 바꿀 수 있습니다.
                </p>
            </div>

            {/* 플레이어 렌더링 영역 (Top 4, Bottom 4) */}
            <div className="z-10 w-full max-w-6xl flex flex-col justify-between flex-1 my-8">

                {/* Top 4 Players (idx 0~3) */}
                <div className="flex justify-center gap-4 w-full">
                    {roomState.players.slice(0, 4).map((player: Player, idx: number) =>
                        renderPlayerCard(player, idx) // 원본 배열 인덱스 유지
                    )}
                </div>

                {/* 중앙 Pot (판돈) - 애니메이션 부여 */}
                <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center pointer-events-none"
                >
                    <div className="w-32 h-32 rounded-full border-4 border-yellow-500 bg-dark-800 flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.3)] backdrop-blur-sm">
                        <div className="text-center">
                            <span className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-1">판돈 (Pot)</span>
                            <span className="text-5xl font-black text-yellow-500">${roomState.pot}</span>
                        </div>
                    </div>
                    <div className="mt-4 bg-dark-900 px-4 py-1 rounded-full text-sm text-gray-500 font-bold tracking-widest">
                        {roomState.turnDirection === 1 ? '↻ 시계 방향 턴' : '↺ 반시계 방향 턴'}
                    </div>
                </motion.div>

                {/* Bottom 4 Players (idx 4~7) */}
                <div className="flex justify-center gap-4 w-full mt-auto translate-y-24">
                    {roomState.players.slice(4, 8).map((player: Player, jdx: number) =>
                        renderPlayerCard(player, jdx + 4) // 원본 배열 인덱스 유지
                    )}
                </div>
            </div>

            {/* 턴 액션 바 (내 턴일 때 중앙 하단) */}
            <div className="flex-1 flex flex-col items-center justify-center w-full my-8 relative pointer-events-none">
                {isMyTurn ? (
                    <div className="fixed bottom-8 z-30 flex gap-4 animate-bounce bg-dark-800 p-4 rounded-2xl border-2 border-primary-500 shadow-2xl pointer-events-auto">
                        <button
                            onClick={handleDrawCard}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-xl shadow border border-blue-400 transition-colors flex items-center justify-center gap-2"
                        >
                            새 액티브 카드 받기
                        </button>
                        <button
                            onClick={() => {
                                setIsShootingMode(!isShootingMode);
                                setActiveCardMode(null);
                            }}
                            className={`${isShootingMode ? 'bg-red-600 hover:bg-red-500 ring-4 ring-red-400' : 'bg-red-500 hover:bg-red-400'} text-white font-bold py-3 px-8 rounded-xl shadow border border-red-400 transition-colors flex items-center justify-center gap-2`}
                        >
                            <span>🎯 {isShootingMode ? '사격 취소' : '사격하기'}</span>
                        </button>
                    </div>
                ) : (
                    <div className="fixed bottom-8 z-30 flex gap-4 animate-bounce bg-dark-800 p-4 rounded-2xl border-2 border-gray-700 shadow-2xl pointer-events-auto">
                        <p className="text-gray-400 font-bold text-lg">다른 플레이어의 턴입니다.</p>
                    </div>
                )}
            </div>

            {/* 내 카드 패널 (좌측 하단 고정) */}
            <AnimatePresence>
                {roomState.players.find(p => p.name === username) && (() => {
                    const me = roomState.players.find(p => p.name === username)!;
                    const myCard = me.activeCard as ActiveCardType | null;
                    const cardMeta = myCard ? CARD_INFO[myCard] : null;

                    return (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-4 left-4 z-40 flex gap-4 bg-dark-800/90 p-5 rounded-2xl border border-gray-600 shadow-2xl backdrop-blur-sm h-48"
                        >
                            {/* 패시브 조작 영역 */}
                            <div className="flex flex-col items-center justify-between bg-dark-900 border border-gray-700 p-4 rounded-xl w-44 shadow-inner">
                                <div className="text-center w-full mb-2">
                                    <span className="text-gray-400 text-xs font-bold block mb-1">패시브 (확률 조정)</span>
                                    <div className="bg-dark-800 text-white font-black py-1 px-3 rounded-md border border-gray-600 text-sm flex items-center justify-center gap-1 shadow-inner">
                                        현재: {me.passive === '증가' ? <span className="text-red-400">▲ 증가</span> : me.passive === '유지' ? <span className="text-gray-400">- 유지</span> : <span className="text-blue-400">▼ 감소</span>}
                                    </div>
                                </div>
                                <div className="flex gap-1 w-full mt-auto">
                                    <button
                                        onClick={() => handleChangePassive('증가')}
                                        className={`flex-1 rounded-md py-2 flex items-center justify-center font-black shadow transition-colors text-xs border ${me.passive === '증가' ? 'bg-red-900/50 border-red-500 text-red-400' : 'bg-dark-800 border-gray-700 text-gray-400 hover:bg-dark-700 hover:text-red-300'}`}
                                    >
                                        증가
                                    </button>
                                    <button
                                        onClick={() => handleChangePassive('유지')}
                                        className={`flex-1 rounded-md py-2 flex items-center justify-center font-black shadow transition-colors text-xs border ${me.passive === '유지' ? 'bg-gray-800 border-gray-400 text-gray-300' : 'bg-dark-800 border-gray-700 text-gray-400 hover:bg-dark-700 hover:text-gray-200'}`}
                                    >
                                        유지
                                    </button>
                                    <button
                                        onClick={() => handleChangePassive('감소')}
                                        className={`flex-1 rounded-md py-2 flex items-center justify-center font-black shadow transition-colors text-xs border ${me.passive === '감소' ? 'bg-blue-900/50 border-blue-500 text-blue-400' : 'bg-dark-800 border-gray-700 text-gray-400 hover:bg-dark-700 hover:text-blue-300'}`}
                                    >
                                        감소
                                    </button>
                                </div>
                            </div>

                            {/* 액티브 카드 정보 영역 */}
                            <div className="flex flex-col justify-between flex-1 min-w-[280px] max-w-[360px] bg-dark-900 border border-blue-900/50 p-4 rounded-xl shadow-inner relative">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-blue-400 text-sm font-bold">액티브 카드</span>
                                    </div>
                                    <div className="text-2xl font-black text-white mb-3 flex items-center gap-2">
                                        {myCard || '카드 없음'}
                                        {cardMeta?.cost && (
                                            <span className="text-red-500 text-sm font-bold bg-red-900/30 px-2 py-1 rounded-md border border-red-900/50 transform -translate-y-0.5">
                                                (비용: ${cardMeta.cost})
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-300 leading-relaxed min-h-[40px]">
                                        {cardMeta
                                            ? cardMeta.desc
                                            : '내 턴에 무작위 새 카드를 받을 수 있습니다.'}
                                    </p>
                                </div>

                                {/* 카드 사용 버튼 (우측 하단으로 이동, 큼지막하게) */}
                                {myCard && cardMeta && isMyTurn && (
                                    <div className="flex justify-end mt-2">
                                        <button
                                            onClick={() => handleUseCard(myCard, cardMeta.needTarget)}
                                            className={`text-white text-sm font-bold py-2 px-6 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 w-full md:w-auto
                                            ${activeCardMode === myCard ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-500'}`}
                                        >
                                            {activeCardMode === myCard ? <><AlertTriangle size={16} />선택 취소</> : cardMeta.needTarget ? <><Target size={16} /> 타겟 지정</> : '이 카드 사용하기'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* 최종 게임 종료 (4라운드 끝) 순위표 모달 */}
            <AnimatePresence>
                {roomState.status === 'finished' && rankings && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[300] bg-dark-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 overflow-y-auto"
                    >
                        <h1 className="text-6xl font-black text-yellow-500 mb-2 drop-shadow-[0_5px_15px_rgba(234,179,8,0.5)]">FINAL RANKING</h1>
                        <p className="text-gray-400 mb-8 text-xl font-bold">4라운드 종료! 진정한 총잡이는 누구인가?</p>

                        <div className="flex flex-col gap-4 w-full max-w-2xl">
                            {rankings.map((p, idx) => {
                                let rankDisplay = `${idx + 1}등`;
                                let bgColor = 'bg-dark-800';
                                let textColor = 'text-gray-300';

                                if (idx === 0) {
                                    rankDisplay = '🥇 1등';
                                    bgColor = 'bg-yellow-900/40 border border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]';
                                    textColor = 'text-yellow-500 font-black text-2xl';
                                } else if (idx === 1) {
                                    rankDisplay = '🥈 2등';
                                    bgColor = 'bg-gray-800 border border-gray-400';
                                    textColor = 'text-gray-300 font-bold text-xl';
                                } else if (idx === 2) {
                                    rankDisplay = '🥉 3등';
                                    bgColor = 'bg-orange-900/40 border border-orange-700';
                                    textColor = 'text-orange-400 font-bold text-xl';
                                }

                                if (p.isBankrupt) {
                                    bgColor = 'bg-dark-900/80 border border-red-900/50 grayscale opacity-70';
                                    textColor = 'text-red-500 line-through';
                                    rankDisplay = `☠️ 파산 (${p.bankruptOrder}번째 탈락)`;
                                }

                                return (
                                    <motion.div
                                        key={p.id}
                                        initial={{ x: -50, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className={`flex items-center justify-between p-5 rounded-xl ${bgColor}`}
                                    >
                                        <div className="flex items-center gap-6">
                                            <span className={`w-32 text-left ${textColor} truncate`}>{rankDisplay}</span>
                                            <span className={`text-2xl font-bold ${p.id === socket?.id ? 'text-primary-500' : 'text-white'}`}>
                                                {p.name} {p.id === socket?.id && '(나)'}
                                            </span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-gray-400 text-sm">최종 소지금</span>
                                            <span className={`text-3xl font-black ${p.isBankrupt ? 'text-red-600' : 'text-green-400'}`}>
                                                ${p.money}
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {roomState.players.find(p => p.name === username)?.isHost ? (
                            <button
                                onClick={() => {
                                    if (socket) {
                                        socket.emit('play_again');
                                    }
                                }}
                                className="mt-12 bg-primary-500 hover:bg-yellow-400 text-dark-900 text-xl font-black py-4 px-12 rounded-full shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all transform hover:scale-105"
                            >
                                다시하기 (새 게임 파기)
                            </button>
                        ) : (
                            <div className="mt-12 text-center">
                                <p className="text-xl text-gray-400 font-bold mb-2">방장이 다음 게임을 준비 중입니다...</p>
                                <p className="text-yellow-500 text-sm animate-pulse">잠시만 기다려주세요</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );

    // 플레이어 카드 렌더링 헬퍼 함수
    function renderPlayerCard(player: Player, globalIndex: number) {
        const isTurn = globalIndex === roomState!.turnIndex;
        const isMe = player.name === username;

        return (
            <motion.div
                layout
                key={player.id}
                onClick={() => handleTargetClick(player)}
                className={`
                    relative flex flex-col items-center bg-dark-800 rounded-2xl p-4 w-44 transition-all duration-300
                    ${isTurn ? 'ring-4 ring-primary-500 shadow-[0_0_20px_rgba(234,179,8,0.5)] -translate-y-2' : 'border border-gray-700'}
                    ${!player.isAlive && 'opacity-30 grayscale'}
                    ${((activeCardMode && player.name !== username) || (isShootingMode && player.name !== username)) && player.isAlive ? 'cursor-pointer hover:ring-2 hover:ring-red-500' : ''}
`}
            >
                {/* 왼쪽 마커: 패시브 확률 조작기 (나인 경우 좌측하단에서 관리하지만, 직관주의 심리전을 위해 다른사람꺼는 보이게) */}
                {!isMe && (
                    <div
                        className="absolute -left-3 top-4 bg-dark-900 rounded-md py-1 px-2 border border-gray-700 text-[10px] text-gray-300 font-bold shadow-md cursor-help"
                        title="이 플레이어의 현재 패시브 상태"
                    >
                        {player.passive === '증가' ? <span className="text-red-400">▲ 증가</span> : player.passive === '유지' ? <span className="text-gray-400">- 유지</span> : <span className="text-blue-400">▼ 감소</span>}
                    </div>
                )}

                {/* 프로필 이미지 (임시 문자) */}
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-2 shadow-inner
                    ${!player.isAlive ? 'bg-red-900 text-red-500' : isMe ? 'bg-primary-500 text-dark-900' : 'bg-gray-700 text-white'}`}
                >
                    {!player.isAlive ? <Skull size={32} /> : player.name.substring(0, 2)}
                </div>

                <span className="font-bold text-gray-200 mb-1 tracking-wide">{player.name}</span>

                {/* 격발 확률 테두리(게이지바 대용) */}
                <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden mb-3">
                    <div
                        className="h-full bg-red-500 transition-all duration-500"
                        style={{ width: `${player.prob}%` }}
                    />
                </div>

                <div className="w-full flex justify-between items-end text-sm">
                    <div className="flex flex-col">
                        <span className="text-gray-500 text-xs">격발확률</span>
                        <span className="font-bold text-red-400">{player.prob}%</span>
                    </div>
                    <div className="flex flex-col text-right">
                        <span className="text-gray-500 text-xs">소지금</span>
                        <span className="font-bold text-green-400">${player.money}</span>
                    </div>
                </div>
            </motion.div>
        );
    }
}
