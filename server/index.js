import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// 메모리 기반 게임 상태 저장소
const rooms = new Map();

// 다음 턴 플레이어를 찾고 자동 베팅 처리하는 유틸리티
function startNextTurn(room) {
    if (room.status !== 'playing') return;

    // 생존자가 1명 이하면 라운드 종료
    const alivePlayers = room.players.filter(p => p.isAlive && !p.isBankrupt);
    if (alivePlayers.length <= 1) {
        if (alivePlayers.length === 1) {
            const winner = alivePlayers[0];
            const bonusPercent = room.round * 0.1; // 1라 10%, 2라 20%...
            const bonusAmount = Math.floor(room.pot * bonusPercent);

            winner.money += (room.pot + bonusAmount);
            room.winnerId = winner.id;
            io.to(room.id).emit('global_message', `🏆 라운드 ${room.round} 종료! ${winner.name}님이 살아남아 판돈과 보너스 총액 $${room.pot + bonusAmount}를 휩쓸었습니다!`);
        } else {
            room.winnerId = null;
            io.to(room.id).emit('global_message', `☠️ 라운드 종료! 모두 비참하게 죽어 판돈이 증발했습니다...`);
        }

        room.pot = 0;

        if (room.round >= 4) {
            room.status = 'finished';

            // 최종 순위 집계 로직
            const sortedPlayers = [...room.players].sort((a, b) => {
                // 살아남은 자를 최우선으로 (돈순위 정렬)
                if (!a.isBankrupt && !b.isBankrupt) return b.money - a.money;
                if (!a.isBankrupt) return -1;
                if (!b.isBankrupt) return 1;

                // 둘 다 파산자면, 나중에 파산한 사람이 높은 순위 (bankruptOrder가 더 큰 사람 우선)
                return b.bankruptOrder - a.bankruptOrder;
            });

            io.to(room.id).emit('global_message', `[최종 결과] 모든 라운드 종료! 진정한 총잡이가 가려졌습니다.`);
            io.to(room.id).emit('room_state_update', room);
            io.to(room.id).emit('game_over', { rankings: sortedPlayers });
            return;
        } else {
            // 다음 라운드를 위한 대기 상태로 전환 (베팅 금액 정하기)
            room.phase = 'betting';
            if (!room.winnerId) {
                // 우승자 없으면 호스트에게 권한 인계
                const host = room.players.find(p => p.isHost);
                room.winnerId = host ? host.id : null;
            }
            io.to(room.id).emit('room_state_update', room);
            return;
        }
    }

    // 패시브 확률 변동 연산 (현재 턴이 종료되는 플레이어에게 적용)
    if (room.turnIndex !== -1 && room.turnIndex !== undefined) {
        const prevPlayer = room.players[room.turnIndex];
        if (prevPlayer) {
            let changeAmount = 0;
            const isMeditating = prevPlayer.isMeditation;

            if (prevPlayer.passive === '증가') {
                changeAmount = isMeditating ? 10 : Math.floor(Math.random() * 6) + 3; // 3~8
            } else if (prevPlayer.passive === '감소') {
                changeAmount = isMeditating ? -10 : -(Math.floor(Math.random() * 6) + 3); // -3~-8
            } else { // 유지
                changeAmount = isMeditating ? 0 : Math.floor(Math.random() * 3); // 0~2
            }

            prevPlayer.prob += changeAmount;

            // 최대/최소 확률 제한
            if (prevPlayer.prob < 10) prevPlayer.prob = 10;
            if (prevPlayer.prob > prevPlayer.maxProb) prevPlayer.prob = prevPlayer.maxProb;
        }
    }

    let nextIndex = room.turnIndex;
    let found = false;

    // 시계/반시계 방향으로 다음 생존자 탐색
    for (let i = 0; i < room.players.length; i++) {
        nextIndex = (nextIndex + room.turnDirection + room.players.length) % room.players.length;
        if (room.players[nextIndex].isAlive && !room.players[nextIndex].isBankrupt) {
            found = true;
            break;
        }
    }

    if (!found) return;

    room.turnIndex = nextIndex;
    const currentPlayer = room.players[nextIndex];

    // 후원자 B 버프 적용 (내 턴 시작 시 +$10)
    if (currentPlayer.hasSponsor) {
        currentPlayer.money += 10;
        io.to(room.id).emit('global_message', `💰 [후원자 B] ${currentPlayer.name}님이 턴 시작 후원금 $10를 받았습니다.`);
    }

    // (기존) 턴 시작 시 의무베팅 했으나, 변경된 룰에 따라 행동 후 턴 넘기기 직전에 베팅 지불함.
}

// 플레이어 사망(파산/총격) 공통 로직 (보험금 체크)
function handlePlayerDeath(currentPlayer, room, io) {
    currentPlayer.isAlive = false;
    // 보험 아이템 확인
    if (currentPlayer.activeCard === '보험') { // 이미 썼다면 hasVest처럼 버프변수로 남길 수도 있지만, 보험은 액티브로 들고있다가 죽을때 발동으로도 기획 해석 가능.
        // 현재 스키마 상 보험은 '사용'시 돈을 지불하고 버프를 거는 식이므로 currentPlayer.hasInsurance 버프값이 필요하나, 
        // 롤백/추가를 최소화하기 위해 activeCard가 보험일 때 보험금을 줌(지속 패시브 형태로도 괜찮음. 혹은 기획의도대로 돈내고 보험가입).
        // 방탄복/강도에 맞추어 상태 변수가 필요하므로 아래 로직은 hasInsurance 여부로 변경합니다. (index.js 상단 상태변수에 hasInsurance 추가 요망)
    }

    if (currentPlayer.hasInsurance) {
        currentPlayer.money += 80;
        currentPlayer.hasInsurance = false;
        io.to(room.id).emit('global_message', `🏥 [보험 발동] ${currentPlayer.name}님이 사망하여 생명보험금 $80를 수령했습니다!`);
    } else {
        // 죽어도 잔고는 유지됨 (단, 생존자에게 스틸당한 금액 등은 다른 곳에서 이미 계산됨)
        // 다음 라운드 시작 전 베팅금액 검사에서 파산 여부가 갈림.
    }
}

// 턴 종료 처리 (지불 및 파산 판정)를 공통화
function finishTurnAndPay(room, currentPlayer, io) {
    if (currentPlayer.money >= room.currentBet) {
        currentPlayer.money -= room.currentBet;
        room.pot += room.currentBet;
    } else {
        // 파산
        room.pot += currentPlayer.money;
        handlePlayerDeath(currentPlayer, room, io);
    }
}

io.on('connection', (socket) => {
    console.log(`[+] 클라이언트 연결됨: ${socket.id}`);

    // 현재 열려있는 방 목록을 전달하는 함수 (대기실 전용 정보 포맷팅)
    const broadcastRooms = () => {
        const roomList = Array.from(rooms.values()).map(r => ({
            id: r.id,
            status: r.status,
            playersCount: r.players.length,
            maxPlayers: 8,
            round: r.round
        }));
        io.emit('room_list_update', roomList); // 접속한 모든 유저에게 전송
    };

    // 접속 직후 클라이언트에게 현재 방 목록 전송
    broadcastRooms();

    // 방 참가/생성 로직
    socket.on('join_room', ({ roomId, username }) => {
        socket.join(roomId);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                players: [],
                status: 'waiting', // waiting, playing, finished
                phase: 'playing', // playing, betting (베팅 금액 선정)
                round: 1,
                pot: 0,
                turnIndex: 0,
                turnDirection: 1,
                currentBet: 10,
                winnerId: null,
                bankruptCount: 0 // 파산한 순서를 추적하기 위한 카운터
            });
        }

        const room = rooms.get(roomId);

        // 이미 있는 유저면 이름 변경, 아니면 새로 추가
        const existingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
        if (existingPlayerIndex >= 0) {
            room.players[existingPlayerIndex].name = username;
        } else {
            room.players.push({
                id: socket.id,
                name: username,
                isHost: room.players.length === 0,
                ready: false,
                money: 200,
                prob: 0,
                isAlive: true,
                passive: '유지',
                activeCard: null,
                // 버프 및 상태 변수
                hasVest: false,
                hasRobber: false,
                hasSponsor: false,
                isMeditation: false,
                hasInsurance: false, // 보험 가입 여부
                hasExtraTurn: false, // 발악 (추가 행동권) 여부
                hasCurse: false, // 다음 사격 시 저주 묻히기 버프
                maxProb: 66, // 최대 확률 상한
                isBankrupt: false, // 완전 파산 여부
                bankruptOrder: 0 // 먼저 파산한 순서 기록용 (0이면 파산 안함)
            });
        }

        // 소켓 객체에 현재 방 정보 저장 (disconnect 시 활용)
        socket.data.roomId = roomId;
        socket.data.username = username;

        console.log(`[입장] [${roomId}] 방에 ${username}(${socket.id}) 입장`);

        // 방 안의 모든 유저에게 새로운 방 상태 브로드캐스트
        io.to(roomId).emit('room_state_update', room);

        // 방 참가 또는 방 신규 생성으로 인원수/상태가 변했으므로 로비 유저들에게도 목록 업데이트
        broadcastRooms();
    });

    // 준비 완료 토글 로직
    socket.on('toggle_ready', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.ready = !player.ready;
                io.to(roomId).emit('room_state_update', room);
            }
        }
    });

    // 게임 시작 로직
    socket.on('start_game', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const player = room.players.find(p => p.id === socket.id);
            if (player && player.isHost) {
                room.status = 'playing';
                room.phase = 'playing';
                room.round = 1;
                room.pot = 0;
                room.turnIndex = 0; // 호스트(첫번째 플레이어)부터 시작
                room.turnDirection = 1;
                room.currentBet = 10; // 1라운드 10달러 고정
                room.bankruptCount = 0; // 초기화

                room.players.forEach(p => {
                    p.money = 200; // 초기 자본 세팅
                    p.prob = Math.floor(Math.random() * (66 - 10 + 1)) + 10; // 10~66% 초기 할당
                    p.isAlive = true;
                    p.isBankrupt = false;
                    p.bankruptOrder = 0;
                    p.passive = '유지';

                    // 라운드 시작 시 랜덤 액티브 카드 1장 지급
                    const ALL_CARDS = ['강도', '방탄복', '도주', '역주행', '후원자 A', '후원자 B', '명상', '탄약병', '저주', '보험', '파괴', '발악'];
                    p.activeCard = ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)];

                    p.hasVest = false;
                    p.hasRobber = false;
                    p.hasSponsor = false;
                    p.isMeditation = false;
                    p.hasInsurance = false;
                    p.hasExtraTurn = false;
                    p.hasCurse = false;
                    p.maxProb = 66; // 게임 시작 시 66% 상한
                });

                // 첫 번째 유저(0번 인덱스)의 턴을 명시적으로 시작(자동 베팅 적용을 위해 현재 턴을 -1로 두고 넘김)
                room.turnIndex = -1;
                startNextTurn(room);

                console.log(`[게임 시작] [${roomId}] 게임이 시작되었습니다.`);
                io.to(roomId).emit('room_state_update', room);
            }
        }
    });

    // 게임 다시하기 (대기실로 복귀) - 누구나 누를 수 있고, 누르면 모든 유저의 게임 데이터 초기화 후 대기실(waiting)로 이동
    socket.on('play_again', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);

            // 방 상태 초기화
            room.status = 'waiting';
            room.phase = 'playing';
            room.round = 1;
            room.pot = 0;
            room.turnIndex = 0;
            room.turnDirection = 1;
            room.currentBet = 10;
            room.winnerId = null;
            room.bankruptCount = 0;

            // 플레이어 상태 초기화
            room.players.forEach(p => {
                p.ready = false;  // 준비 상태 해제
                p.money = 200;
                p.prob = 0;
                p.isAlive = true;
                p.passive = '유지';
                p.activeCard = null;
                p.hasVest = false;
                p.hasRobber = false;
                p.hasSponsor = false;
                p.isMeditation = false;
                p.hasInsurance = false;
                p.hasExtraTurn = false;
                p.hasCurse = false;
                p.maxProb = 66;
                p.isBankrupt = false;
                p.bankruptOrder = 0;
            });

            console.log(`[다시하기] [${roomId}] 방 데이터가 초기화되었습니다.`);
            io.to(roomId).emit('global_message', '🔄 게임이 초기화되었습니다. 모두 대기실로 돌아갑니다.');
            io.to(roomId).emit('room_state_update', room);
        }
    });

    // 라운드 승자가 베팅액 지정 후 다음 라운드 시작
    socket.on('next_round_start', ({ betAmount }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const player = room.players.find(p => p.id === socket.id);

            // 지정 권한 확인
            if (player && player.id === room.winnerId && room.phase === 'betting') {
                room.currentBet = betAmount;
                room.round += 1;
                room.phase = 'playing';
                room.pot = 0;

                room.players.forEach(p => {
                    if (p.isBankrupt) return; // 이미 영구 파산한 사람은 대상 외

                    // 새 라운드 베팅금액 미달일 시 영구파산
                    if (p.money < room.currentBet) {
                        p.isBankrupt = true;
                        p.isAlive = false;
                        room.bankruptCount += 1;
                        p.bankruptOrder = room.bankruptCount;
                        io.to(roomId).emit('global_message', `📉 ${p.name}님이 베팅금액($${room.currentBet})을 내지 못해 파산했습니다!`);
                    } else {
                        // 새 라운드 시작 복구
                        p.isAlive = true;
                        p.prob = Math.floor(Math.random() * (66 - 10 + 1)) + 10;
                        p.passive = '유지';

                        const ALL_CARDS = ['강도', '방탄복', '도주', '역주행', '후원자 A', '후원자 B', '명상', '탄약병', '저주', '보험', '파괴', '발악'];
                        p.activeCard = ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)];

                        p.hasVest = false;
                        p.hasRobber = false;
                        p.hasSponsor = false;
                        p.isMeditation = false;
                        p.hasInsurance = false;
                        p.hasExtraTurn = false;
                        p.hasCurse = false;
                        p.maxProb = 66;
                    }
                });

                room.turnDirection = 1;
                const winnerIndex = room.players.findIndex(p => p.id === room.winnerId);
                room.turnIndex = winnerIndex !== -1 ? winnerIndex : -1;
                startNextTurn(room);

                io.to(roomId).emit('global_message', `📣 라운드 ${room.round} 시작! 기준 베팅금: $${room.currentBet}`);
                io.to(roomId).emit('room_state_update', room);
            }
        }
    });

    // 패시브 스탠스 변경 액션
    socket.on('change_passive', ({ stance }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const player = room.players.find(p => p.id === socket.id);
            if (player && ['증가', '유지', '감소'].includes(stance)) {
                player.passive = stance;
                io.to(roomId).emit('room_state_update', room);
            }
        }
    });

    // 마우스 조준점 커서 실시간 공유 (사격 모드용)
    socket.on('mouse_move', ({ x, y, isShootingMode }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            // 본인을 제외한 방 내 다른 유저들에게 좌표 발송
            socket.to(roomId).emit('mouse_move', {
                id: socket.id,
                name: socket.data.username,
                x,
                y,
                isShootingMode
            });
        }
    });

    // (더이상 end_turn은 수동으로 호출하지 않음 - 사격이나 카드뽑기 후 자동 전환)
    // // 턴 넘기기 로직 (허공에 쏘기 등)
    // socket.on('end_turn', () => {
    //     const roomId = socket.data.roomId;
    //     if (roomId && rooms.has(roomId)) {
    //         const room = rooms.get(roomId);

    //         // 본인 턴일때만 동작
    //         if (room.players[room.turnIndex]?.id === socket.id) {
    //             startNextTurn(room);
    //             io.to(roomId).emit('room_state_update', room);
    //         }
    //     }
    // });

    // 사격 액션 로직 (액션 후 턴 종료)
    socket.on('action_shoot', ({ targetId }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const currentPlayer = room.players[room.turnIndex];

            // 본인 턴일때만 동작
            if (currentPlayer?.id === socket.id) {
                const targetPlayer = room.players.find(p => p.id === targetId);

                if (targetPlayer && targetPlayer.isAlive) {
                    // 사격 실시 전: 발사자에게 저주 버프가 있다면 타겟의 확률 폭락
                    if (currentPlayer.hasCurse) {
                        targetPlayer.prob = Math.max(10, targetPlayer.prob - 30);
                        currentPlayer.hasCurse = false;
                        io.to(roomId).emit('global_message', `☠️ [저주] ${currentPlayer.name}님의 저주받은 총알이 닿아 ${targetPlayer.name}님의 확률이 30% 폭락했습니다!`);
                    }

                    const isHit = Math.random() * 100 < currentPlayer.prob;

                    if (isHit) {
                        if (targetPlayer.hasVest) {
                            // 방탄복 적용 (1회 방어 후 소멸)
                            targetPlayer.hasVest = false;
                            console.log(`[방탄복 발동] ${targetPlayer.name} 님이 총격 생존.`);
                            io.to(roomId).emit('global_message', `🛡️ [도탄] ${targetPlayer.name}님의 방탄복이 1회 희생되어 총격을 막았습니다!`);
                        } else {
                            handlePlayerDeath(targetPlayer, room, io);
                            // 강도 버프(4배) 확인 후 스틸 금액 계산 (죽은 사람의 보험금이 있을 수 있으므로 처리 후 계산)
                            const multiplier = currentPlayer.hasRobber ? 4 : 1;
                            currentPlayer.hasRobber = false; // 1회 적용 후 해제

                            const stealAmount = Math.min(targetPlayer.money, room.currentBet * multiplier);
                            targetPlayer.money -= stealAmount;
                            currentPlayer.money += stealAmount;

                            console.log(`[사격 적중] ${currentPlayer.name} 님이 ${targetPlayer.name} 님 처치. $${stealAmount} 스틸.`);
                            io.to(roomId).emit('global_message', `🎯 [적중] ${currentPlayer.name}님이 ${targetPlayer.name}님을 사살하고 $${stealAmount}를 빼앗았습니다!`);
                        }
                    } else {
                        console.log(`[사격 불발] ${currentPlayer.name} 님이 ${targetPlayer.name} 님에게 빗나감.`);
                        io.to(roomId).emit('global_message', `💨 [불발] ${currentPlayer.name}님의 사격이 빗나갔습니다!`);
                    }

                    // 행동 종료 시점: 발악 버프가 있다면 턴 유지, 없다면 턴 종료+파산 지불 체크
                    if (currentPlayer.hasExtraTurn) {
                        currentPlayer.hasExtraTurn = false;
                        io.to(roomId).emit('global_message', `🩸 [발악] ${currentPlayer.name}님이 추가 행동권을 소모했습니다. (턴 유지)`);
                    } else {
                        finishTurnAndPay(room, currentPlayer, io);
                        if (!currentPlayer.isAlive && !currentPlayer.hasInsurance) {
                            io.to(roomId).emit('global_message', `💀 [파산] ${currentPlayer.name}님이 판돈 지불에 실패하여 파산했습니다!`);
                        }
                        startNextTurn(room);
                    }

                    io.to(roomId).emit('room_state_update', room);
                }
            }
        }
    });

    // 새 액티브 카드 받기 (액션 후 턴 종료)
    socket.on('action_draw_card', () => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const currentPlayer = room.players[room.turnIndex];

            // 본인 턴일때만 동작
            if (currentPlayer?.id === socket.id) {
                const ALL_CARDS = ['강도', '방탄복', '도주', '역주행', '후원자 A', '후원자 B', '명상', '탄약병', '저주', '보험', '파괴', '발악'];
                currentPlayer.activeCard = ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)];

                io.to(roomId).emit('global_message', `🃏 ${currentPlayer.name}님이 새 카드를 뽑았습니다.`);

                // 행동 종료 시점: 발악 버프가 있다면 턴 유지, 없다면 턴 종료+파산 지불 체크
                if (currentPlayer.hasExtraTurn) {
                    currentPlayer.hasExtraTurn = false;
                    io.to(roomId).emit('global_message', `🩸 [발악] ${currentPlayer.name}님이 추가 행동권을 소모했습니다. (턴 유지)`);
                } else {
                    finishTurnAndPay(room, currentPlayer, io);
                    if (!currentPlayer.isAlive && !currentPlayer.hasInsurance) {
                        io.to(roomId).emit('global_message', `💀 [파산] ${currentPlayer.name}님이 판돈 지불에 실패하여 파산했습니다!`);
                    }
                    startNextTurn(room);
                }

                io.to(roomId).emit('room_state_update', room);
            }
        }
    });

    // 12종 액티브 카드 사용 처리 (비용 처리 포함, 발동 시 카드는 소모됨)
    socket.on('action_use_card', ({ cardName, targetId }) => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        const currentPlayer = room.players[room.turnIndex];

        if (currentPlayer?.id !== socket.id || currentPlayer.activeCard !== cardName) return;

        // 카드 사용 코스트 차감
        const reqCostObj = { '방탄복': 25, '보험': 20 };
        if (reqCostObj[cardName]) {
            if (currentPlayer.money < reqCostObj[cardName]) return;
            currentPlayer.money -= reqCostObj[cardName];
            room.pot += reqCostObj[cardName]; // 코스트 지불은 중앙 판돈으로
        }

        // 카드 제거
        currentPlayer.activeCard = null;
        let actionMsg = `🃏 ${currentPlayer.name}님이 [${cardName}]을(를) 발동했습니다.`;

        switch (cardName) {
            case '강도':
                currentPlayer.hasRobber = true;
                break;
            case '방탄복':
                currentPlayer.hasVest = true;
                break;
            case '도주':
                const escapeMoney = Math.floor(room.pot * 0.4);
                room.pot -= escapeMoney;
                currentPlayer.money += escapeMoney;
                currentPlayer.isAlive = false; // 도주는 라운드 즉시 이탈하므로 사망판정(관전)
                actionMsg += ` 🏃‍♂️ 판돈 40%($${escapeMoney})를 들고 무사히 도망쳤습니다!`;
                break;
            case '역주행':
                room.turnDirection = room.turnDirection === 1 ? -1 : 1;
                actionMsg += ` 🔄 턴 진행 방향이 반대로 변경되었습니다!`;
                break;
            case '후원자 A':
                currentPlayer.money += 50;
                break;
            case '후원자 B':
                currentPlayer.hasSponsor = true;
                break;
            case '명상':
                currentPlayer.isMeditation = true;
                break;
            case '탄약병':
                currentPlayer.maxProb = 75;
                currentPlayer.prob = Math.min(currentPlayer.maxProb, currentPlayer.prob + 30);
                actionMsg += ` 💊 특수 탄약을 장전했습니다! 확률이 30% 증가하고 상한이 75%로 늘어났습니다.`;
                break;
            case '저주':
                currentPlayer.hasCurse = true;
                actionMsg += ` ☠️ 총알에 저주를 부여했습니다! 다음 사격 시 상대방의 확률이 30% 폭락합니다.`;
                break;
            case '보험':
                currentPlayer.hasInsurance = true;
                actionMsg += ` 🏥 생명보험에 가입했습니다. 사망 시 $80를 받습니다.`;
                break;
            case '파괴':
                room.players.forEach(p => p.activeCard = null);
                actionMsg += ` 💥 모든 사람의 손에서 액티브 카드가 소멸했습니다.`;
                break;
            case '발악':
                currentPlayer.prob = Math.max(10, currentPlayer.prob - 20);
                currentPlayer.hasExtraTurn = true;
                actionMsg += ` 🩸 피를 흘리며 한번 더 행동기회를 얻습니다. (확률 -20%, 이번 행동 턴 소모 안함)`;
                break;
        }

        io.to(roomId).emit('global_message', actionMsg);
        io.to(roomId).emit('used_card_broadcast', { playerName: currentPlayer.name, cardName });

        // (발악의 확률 -25% 로직 수정: 이전엔 턴을 스킵하지 않는 변수로 썼으나, 이젠 모든 카드가 턴을 스킵하지 않음)
        // 도주처럼 사망(이탈) 판정이 난 경우가 아니면 턴은 그대로 본인에게 유지됨.
        if (!currentPlayer.isAlive) {
            // 도주 카드를 써서 자가 이탈했거나, 코스트를 내다 파산한 경우에만 턴 넘김 처리
            // 이미 코스트는 위에서 냈음. 파산 연산 등은 finishTurnAndPay가 아니어도 사망 시 다음 턴으로.
            if (!currentPlayer.hasInsurance && currentPlayer.money <= 0 && cardName !== '도주') {
                // 보험이 없고 돈이 0이하여서 죽었다면 코스트 지불 파산
                io.to(roomId).emit('global_message', `💀 [파산] ${currentPlayer.name}님이 카드 비용 지불 후 파산했습니다!`);
            }
            startNextTurn(room);
        }

        // 턴을 넘기지 않으므로, 정보(확률, 아이템 등)만 갱신해서 브로드캐스트
        io.to(roomId).emit('room_state_update', room);
    });

    // 연결 해제 로직
    // 유저 채팅 발송
    socket.on('send_chat', ({ message }) => {
        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            io.to(roomId).emit('global_message', `💬 [${socket.data.username}] ${message}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] 클라이언트 연결 해제됨: ${socket.id}`);
        const roomId = socket.data.roomId;

        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.players = room.players.filter(p => p.id !== socket.id);

            if (room.players.length === 0) {
                // 방에 아무도 없으면 폭파
                rooms.delete(roomId);
                console.log(`[삭제] [${roomId}] 빈 방 삭제`);
            } else {
                // 남은 유저가 있고, 나간 유저가 방장(Host)이었다면 호스트 넘겨주기
                const hasHost = room.players.some(p => p.isHost);
                if (!hasHost) {
                    room.players[0].isHost = true;
                }
                io.to(roomId).emit('room_state_update', room);
            }
            // 방 폭파 또는 인원 감소로 상태가 변했으므로 방 목록 브로드캐스트
            broadcastRooms();
        }
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`[✓] 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
