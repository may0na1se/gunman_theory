import { useEffect, useMemo, useRef, useState } from 'react';
import { Coffee, Crown, Dice5 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { type RouletteEntry, useGameStore } from '../store/useGameStore';
import FixedStage from './FixedStage';

interface RouletteGoalMessage {
    type: 'roulette_goal';
    winner: string;
    sessionId: number;
}

function formatEntryNames(entries: RouletteEntry[]) {
    return entries
        .map((entry) => (entry.count > 1 ? `${entry.name}*${entry.count}` : entry.name))
        .join(',');
}

export default function RouletteRoom() {
    const socket = useGameStore((state) => state.socket);
    const roomState = useGameStore((state) => state.roomState);
    const [draftEntries, setDraftEntries] = useState<RouletteEntry[]>([]);
    const [streamFrame, setStreamFrame] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!roomState?.roulette) return;
        setDraftEntries(roomState.roulette.entries.map((entry) => ({ ...entry })));
    }, [roomState?.roulette]);

    useEffect(() => {
        if (!socket || roomState?.status !== 'roulette_running' || !roomState.roulette) return;

        const handleMessage = (event: MessageEvent<RouletteGoalMessage>) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'roulette_goal') return;
            if (event.data.sessionId !== roomState.roulette?.sessionId) return;

            const myPlayer = roomState.players.find((player) => player.id === socket.id);
            if (myPlayer?.isHost && !roomState.roulette?.winnerName) {
                socket.emit('roulette_finished', { winnerName: event.data.winner });
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [socket, roomState]);

    if (!roomState || !roomState.roulette) return null;

    const myPlayer = roomState.players.find((player) => player.id === socket?.id) ?? null;
    const isHost = Boolean(myPlayer?.isHost);
    const isSetup = roomState.status === 'roulette_setup';
    const isRunning = roomState.status === 'roulette_running';
    const isPresenter = roomState.roulette.presenterId === socket?.id;
    const canStart = draftEntries.length > 0 && draftEntries.every((entry) => entry.name.trim() && entry.count >= 1);
    const hasWinner = Boolean(roomState.roulette.winnerName);

    const iframeSrc = useMemo(() => {
        if (!isRunning || !roomState.roulette?.seed || !roomState.roulette?.startedAt) return '';
        const totalMarbleCount = roomState.roulette.entries.reduce((sum, entry) => sum + entry.count, 0);

        const params = new URLSearchParams();
        params.set('names', formatEntryNames(roomState.roulette.entries));
        params.set('embed', '1');
        params.set('autostart', '1');
        params.set('rank', String(totalMarbleCount));
        params.set('seed', roomState.roulette.seed);
        params.set('startAt', String(roomState.roulette.startedAt));
        params.set('session', String(roomState.roulette.sessionId));

        return `/roulette/index.html?${params.toString()}`;
    }, [isRunning, roomState.roulette]);

    useEffect(() => {
        if (!socket || !isRunning) {
            setStreamFrame(null);
            return;
        }

        const handleFrame = ({ imageData, sessionId }: { imageData: string; sessionId: number }) => {
            if (sessionId !== roomState.roulette?.sessionId) return;
            setStreamFrame(imageData);
        };

        socket.on('roulette_frame', handleFrame);
        return () => {
            socket.off('roulette_frame', handleFrame);
        };
    }, [socket, isRunning, roomState.roulette?.sessionId]);

    useEffect(() => {
        if (!socket || !isRunning || !isPresenter || !roomState.roulette) return;
        const currentSessionId = roomState.roulette.sessionId;

        const interval = window.setInterval(() => {
            const iframe = iframeRef.current;
            const canvas = iframe?.contentWindow?.document?.querySelector('canvas') as HTMLCanvasElement | null;
            if (!canvas || canvas.width === 0 || canvas.height === 0) return;

            try {
                let captureCanvas = captureCanvasRef.current;
                if (!captureCanvas) {
                    captureCanvas = document.createElement('canvas');
                    captureCanvasRef.current = captureCanvas;
                }

                const scale = 0.55;
                captureCanvas.width = Math.max(1, Math.floor(canvas.width * scale));
                captureCanvas.height = Math.max(1, Math.floor(canvas.height * scale));

                const context = captureCanvas.getContext('2d');
                if (!context) return;

                context.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
                context.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);

                const imageData = captureCanvas.toDataURL('image/webp', 0.58);
                socket.emit('roulette_frame', {
                    imageData,
                    sessionId: currentSessionId
                });
                setStreamFrame(imageData);
            } catch (error) {
                console.error('roulette frame capture failed', error);
            }
        }, 66);

        return () => {
            window.clearInterval(interval);
        };
    }, [socket, isRunning, isPresenter, roomState.roulette]);

    const handleEntryChange = (index: number, key: 'name' | 'count', value: string) => {
        setDraftEntries((prev) =>
            prev.map((entry, entryIndex) => {
                if (entryIndex !== index) return entry;

                if (key === 'count') {
                    return {
                        ...entry,
                        count: Math.min(12, Math.max(1, Number(value) || 1))
                    };
                }

                return {
                    ...entry,
                    name: value.slice(0, 12)
                };
            })
        );
    };

    const handleSaveEntries = () => {
        if (!socket || !isHost) return;
        socket.emit('update_roulette_entries', { entries: draftEntries });
    };

    const handleStartRoulette = () => {
        if (!socket || !isHost || !canStart) return;
        socket.emit('start_roulette', { entries: draftEntries });
    };

    const handleFinishRoulette = () => {
        if (!socket || !isHost) return;
        socket.emit('finish_roulette');
    };

    return (
        <FixedStage className="bg-dark-900">
        <div className="h-full w-full overflow-hidden px-8 py-8">
            <div className="flex h-full w-full gap-8">
                <div className="w-[360px] shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-6">
                <div className="rounded-3xl border border-gray-700 bg-dark-800/80 p-6 shadow-2xl backdrop-blur-md">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-sm font-bold uppercase tracking-[0.35em] text-sky-300">Pinball Mode</div>
                            <h1 className="mt-2 text-4xl font-black text-white">
                                {isSetup ? '커피빵 핀볼 설정' : '핀볼 공동 관람'}
                            </h1>
                            <p className="mt-2 text-gray-400">
                                게임 결과 순위로 기본 공 개수를 만들었고, 방장이 필요하면 직접 조정할 수 있습니다.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-700 bg-dark-900/80 px-5 py-4 text-right">
                            <div className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">방 코드</div>
                            <div className="mt-1 text-2xl font-black text-primary-500">{roomState.id}</div>
                        </div>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                    <aside className="rounded-3xl border border-gray-700 bg-dark-800/70 p-6 shadow-xl backdrop-blur-md">
                        <h2 className="text-lg font-black text-white">기본 확률표</h2>
                        <p className="mt-2 text-sm text-gray-400">높은 순위를 할수록 공 개수가 적고, 낮은 순위일수록 공 개수가 많습니다.</p>

                        <div className="mt-5 flex flex-col gap-3">
                            {roomState.finalRankings.map((player, index) => (
                                <div
                                    key={player.id}
                                    className="flex items-center justify-between rounded-2xl border border-gray-700 bg-dark-900/80 px-4 py-3"
                                >
                                    <div>
                                        <div className="text-xs font-bold text-gray-500">{index + 1}등</div>
                                        <div className="text-lg font-bold text-white">
                                            {player.name}
                                            {player.id === socket?.id && <span className="ml-2 text-primary-500">(나)</span>}
                                        </div>
                                    </div>
                                    <div className="rounded-full bg-sky-900/40 px-3 py-1 text-sm font-black text-sky-300">
                                        공 {index + 1}개
                                    </div>
                                </div>
                            ))}
                        </div>

                        {isSetup && (
                            <div className="mt-6 rounded-2xl border border-gray-700 bg-dark-900/70 p-4">
                                {isHost ? (
                                    <>
                                        <div className="flex items-center gap-2 text-sm font-bold text-yellow-300">
                                            <Crown size={16} />
                                            방장만 참가자 이름과 공 개수를 수정할 수 있습니다.
                                        </div>
                                        <p className="mt-2 text-sm text-gray-400">이름은 장난스럽게 바꿔도 되고, 공 개수만 만져도 됩니다.</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 text-sm font-bold text-sky-300">
                                            <Dice5 size={16} />
                                            방장이 핀볼 공 개수를 정리하는 중입니다.
                                        </div>
                                        <p className="mt-2 text-sm text-gray-400">조금만 기다리면 모두 같이 핀볼을 볼 수 있어요.</p>
                                    </>
                                )}
                            </div>
                        )}
                    </aside>

                    <section className="min-h-0 rounded-3xl border border-gray-700 bg-dark-800/70 p-6 shadow-xl backdrop-blur-md">
                        {isSetup ? (
                            <>
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-2xl font-black text-white">참가자 편집</h2>
                                        <p className="mt-1 text-sm text-gray-400">`이름*개수` 형식으로 들어갈 값입니다. 그대로 공 개수에 반영됩니다.</p>
                                    </div>
                                    <div className="rounded-full border border-gray-700 bg-dark-900 px-4 py-2 text-sm font-bold text-gray-300">
                                        총 {draftEntries.reduce((sum, entry) => sum + entry.count, 0)}개
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-col gap-3">
                                    {(isHost ? draftEntries : roomState.roulette.entries).map((entry, index) => (
                                        <div
                                            key={entry.playerId}
                                            className="grid grid-cols-[90px_minmax(0,1fr)_110px] items-center gap-3 rounded-2xl border border-gray-700 bg-dark-900/80 px-4 py-3"
                                        >
                                            <div className="text-sm font-black text-gray-400">{entry.rank}등</div>
                                            {isHost ? (
                                                <input
                                                    value={entry.name}
                                                    onChange={(event) => handleEntryChange(index, 'name', event.target.value)}
                                                    className="w-full rounded-xl border border-gray-600 bg-dark-800 px-4 py-3 text-white outline-none transition focus:border-sky-400"
                                                />
                                            ) : (
                                                <div className="text-lg font-bold text-white">{entry.name}</div>
                                            )}
                                            {isHost ? (
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={12}
                                                    value={entry.count}
                                                    onChange={(event) => handleEntryChange(index, 'count', event.target.value)}
                                                    className="w-full rounded-xl border border-gray-600 bg-dark-800 px-4 py-3 text-center text-white outline-none transition focus:border-sky-400"
                                                />
                                            ) : (
                                                <div className="text-right text-lg font-black text-sky-300">공 {entry.count}개</div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {isHost ? (
                                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                        <button
                                            onClick={handleSaveEntries}
                                            className="flex-1 rounded-2xl border border-gray-600 bg-dark-900 px-6 py-4 text-lg font-black text-white transition hover:border-sky-400 hover:text-sky-300"
                                        >
                                            수정 저장
                                        </button>
                                        <button
                                            onClick={handleStartRoulette}
                                            disabled={!canStart}
                                            className={`flex-1 rounded-2xl px-6 py-4 text-lg font-black transition ${
                                                canStart
                                                    ? 'bg-sky-500 text-dark-900 hover:bg-sky-400'
                                                    : 'cursor-not-allowed bg-gray-700 text-gray-400'
                                            }`}
                                        >
                                            핀볼 시작
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-8 rounded-2xl border border-gray-700 bg-dark-900/80 px-6 py-5 text-center text-gray-400">
                                        방장이 설정을 마치면 자동으로 핀볼 화면으로 넘어갑니다.
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h2 className="text-2xl font-black text-white">오늘의 커피 담당 추첨</h2>
                                        <p className="mt-1 text-sm text-gray-400">마지막까지 살아남는 공 1개가 오늘의 커피 담당이 됩니다. 끝까지 같이 지켜봐 주세요.</p>
                                    </div>
                                    <div className="rounded-full border border-sky-500/40 bg-sky-900/20 px-4 py-2 text-sm font-bold text-sky-300">
                                        공 {roomState.roulette.entries.reduce((sum, entry) => sum + entry.count, 0)}개
                                    </div>
                                </div>

                                <div className="relative mt-6 overflow-hidden rounded-3xl border border-gray-700 bg-black shadow-[0_0_40px_rgba(0,0,0,0.35)]">
                                    {isPresenter && iframeSrc ? (
                                        <iframe
                                            ref={iframeRef}
                                            key={`${roomState.roulette.sessionId}-${roomState.roulette.seed}-presenter`}
                                            src={iframeSrc}
                                            title="roulette"
                                            className="h-[500px] w-full"
                                        />
                                    ) : streamFrame ? (
                                        <img
                                            src={streamFrame}
                                            alt="roulette live view"
                                            className="h-[500px] w-full object-contain"
                                        />
                                    ) : (
                                        <div className="flex h-[500px] items-center justify-center text-lg font-bold text-gray-500">
                                            {isPresenter ? '핀볼 화면을 준비 중입니다...' : '방장이 핀볼 화면을 송출하는 중입니다...'}
                                        </div>
                                    )}

                                    <AnimatePresence>
                                        {roomState.roulette.winnerName && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 28, scale: 0.96 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                                className="pointer-events-none absolute inset-x-6 bottom-6 z-10"
                                            >
                                                <div className="rounded-3xl border border-emerald-500/40 bg-emerald-900/85 px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
                                                    <div className="flex items-center gap-3">
                                                        <div className="rounded-full bg-emerald-500/20 p-3 text-emerald-300">
                                                            <Coffee size={24} />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold uppercase tracking-[0.3em] text-emerald-300">Result</div>
                                                            <div className="mt-1 text-2xl font-black text-white">
                                                                {roomState.roulette.winnerName}님이 오늘의 커피 담당입니다.
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {!roomState.roulette.winnerName ? (
                                    <div className="mt-6 rounded-2xl border border-gray-700 bg-dark-900/80 px-6 py-5 text-center text-gray-400">
                                        {isPresenter ? '방장 화면이 실시간으로 송출되고 있습니다.' : '방장 화면을 같이 보는 중입니다. 결과가 정해질 때까지 잠깐만 기다려 주세요.'}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </section>
                </div>
                </div>
            </div>
            {isRunning && hasWinner && isHost && (
                <div className="pointer-events-none absolute bottom-8 left-8 z-30">
                    <button
                        onClick={handleFinishRoulette}
                        className="pointer-events-auto rounded-2xl bg-primary-500 px-6 py-4 text-lg font-black text-dark-900 shadow-[0_0_20px_rgba(234,179,8,0.25)] transition hover:bg-yellow-400"
                    >
                        대기실로 돌아가기
                    </button>
                </div>
            )}
        </div>
        </FixedStage>
    );
}
