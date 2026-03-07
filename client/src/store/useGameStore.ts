import { create } from 'zustand';
import { Socket } from 'socket.io-client';

export interface Player {
    id: string;
    name: string;
    isHost: boolean;
    ready: boolean;
    money: number;
    prob: number;
    isAlive: boolean;
    isBankrupt: boolean; // 새 라운드 시작 시 파산 여부
    bankruptOrder: number; // 먼저 파산한 순위표 기록용 카운터
    hasVest: boolean;
    hasRobber: boolean;
    hasSponsor: boolean;
    isMeditation: boolean;
    hasInsurance: boolean;
    hasExtraTurn: boolean;
    hasCurse: boolean;
    maxProb: number;
    passive: '증가' | '유지' | '감소';
    activeCard: ActiveCardType | null;
}

export type ActiveCardType =
    | '강도' | '방탄복' | '도주' | '역주행'
    | '후원자 A' | '후원자 B' | '명상' | '탄약병'
    | '저주' | '보험' | '파괴' | '발악';

export const CARD_INFO: Record<ActiveCardType, { desc: string; needTarget: boolean; cost?: number }> = {
    '강도': { desc: '죽인 사람에게서 가져오는 돈이 4배로 증가 (1회).', needTarget: false },
    '방탄복': { desc: '총에 맞아도 죽지 않음 (1회).', needTarget: false, cost: 25 },
    '도주': { desc: '현재 판돈의 40%를 가지고 라운드 즉시 이탈 및 생존.', needTarget: false },
    '역주행': { desc: '턴의 진행 방향을 반대로 바꿈.', needTarget: false },
    '후원자 A': { desc: '즉시 50달러 획득.', needTarget: false },
    '후원자 B': { desc: '자신의 턴이 올 때마다 10달러씩 획득.', needTarget: false },
    '명상': { desc: '패시브 확률 변동이 고정됨 (증가 10%, 유지 0%, 감소 -10%).', needTarget: false },
    '탄약병': { desc: '사용 즉시 자신의 격발 확률이 30%p 증가하며, 최대 확률 한도가 75%로 늘어나게 됩니다.', needTarget: false },
    '저주': {
        desc: "내 총에 맞은 플레이어의 확률을 30% 감소시킵니다. (최소 10%)",
        needTarget: false
    },
    '보험': { desc: '자신이 사망 시 80달러를 지급받음.', needTarget: false, cost: 20 },
    '파괴': { desc: '모든 플레이어의 손에 있는 액티브 카드를 제거함.', needTarget: false },
    '발악': { desc: '격발 확률 20% 감소 대신, 이번 턴 사격이나 카드 획득 시 턴을 1회 소모하지 않습니다.', needTarget: false }
};

export interface RoomState {
    id: string;
    players: Player[];
    status: 'waiting' | 'playing' | 'finished';
    phase: 'playing' | 'betting'; // 새로 추가된 페이즈
    round: number;
    pot: number;
    turnIndex: number;
    turnDirection: 1 | -1;
    currentBet: number;
    winnerId: string | null; // 라운드 우승자 ID
}

export interface RoomListInfo {
    id: string;
    status: string;
    playersCount: number;
    maxPlayers: number;
    round: number;
}

interface GameStore {
    socket: Socket | null;
    setSocket: (socket: Socket) => void;

    isConnected: boolean;
    setIsConnected: (status: boolean) => void;

    username: string;
    setUsername: (name: string) => void;

    roomId: string;
    setRoomId: (id: string) => void;

    roomState: RoomState | null;
    setRoomState: (state: RoomState | null) => void;

    roomList: RoomListInfo[];
    setRoomList: (list: RoomListInfo[]) => void;
}

export const useGameStore = create<GameStore>((set) => ({
    socket: null,
    setSocket: (socket) => set({ socket }),

    isConnected: false,
    setIsConnected: (status) => set({ isConnected: status }),

    username: '',
    setUsername: (name) => set({ username: name }),

    roomId: '',
    setRoomId: (id) => set({ roomId: id }),

    roomState: null,
    setRoomState: (state) => set({ roomState: state }),

    roomList: [],
    setRoomList: (list) => set({ roomList: list }),
}));
