import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useGameStore } from './store/useGameStore';
import Lobby from './components/Lobby';
import Room from './components/Room';
import InGame from './components/InGame';
import Chat from './components/Chat';

// 환경 변수나 로컬 스토리지 등에 따라 URL 분기 가능
// 우선 로컬 개발환경 서버 주소 적용 (외부 접속 테스트를 위해 IP로 변경)
// const SOCKET_URL = 'http://70.12.247.186:4000';
const SOCKET_URL = 'https://gunman-theory.onrender.com'

function App() {
  const { setSocket, setIsConnected, roomState, setRoomState, setRoomList } = useGameStore();

  useEffect(() => {
    // 1. 소켓 객체 생성 및 연결
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    // 2. 기본 연결 이벤트
    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('서버에 연결되었습니다. ID:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('서버와의 연결이 끊어졌습니다.');
      setRoomState(null); // 연결 끊기면 로비로 강제 이동
    });

    // 3. 게임 상태 갱신 이벤트 리스너 등록
    newSocket.on('room_state_update', (updatedRoom) => {
      console.log('방 상태 업데이트:', updatedRoom);
      setRoomState(updatedRoom);
    });

    // 4. 로비 전용 방 목록 업데이트 리스너 등록
    newSocket.on('room_list_update', (receivedRoomList) => {
      setRoomList(receivedRoomList);
    });

    // 5. 클린업 (컴포넌트 언마운트 시)
    return () => {
      newSocket.close();
    };
  }, [setSocket, setIsConnected, setRoomState, setRoomList]);

  return (
    <>
      {/* roomState가 없으면 로비 UI, 상태에 따라 대기방 또는 인게임 UI 렌더링 */}
      {!roomState ? (
        <Lobby />
      ) : (
        <>
          {roomState.status === 'playing' || roomState.status === 'finished' ? <InGame /> : <Room />}
          {/* 어느 방이든(대기실이나 게임 플레이, 결과창) 우측 하단이나 고정된 위치에 공용 채팅창 렌더링 */}
          <Chat />
        </>
      )}
    </>
  );
}

export default App;
