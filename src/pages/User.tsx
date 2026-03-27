import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import SeatMap from '../components/SeatMap';
import { useSocket } from '../store/useSocket';
import ChatWindow from '../components/ChatWindow';

export default function User() {
  const { user, sessionToken, setUser, logoutUser, serverTime, isFrozen, frozenReason, currentTurnOrder, currentTurnStartTime } = useStore();
  const socket = useSocket();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [uniqueCode, setUniqueCode] = useState('');
  const [requiresCode, setRequiresCode] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [timerStatus, setTimerStatus] = useState<'WAITING' | 'ACTIVE' | 'EXPIRED' | 'COMPLETED'>('WAITING');

  useEffect(() => {
    if (!user || !serverTime || !currentTurnStartTime) return;

    if (user.turn_status === 'COMPLETED' || user.is_final) {
      setTimerStatus('COMPLETED');
      setTimeLeft('00:00');
      return;
    }
  
    useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // 1. 좌석 정보 가져오기
        const seatsRes = await fetch('/api/seats');
        if (seatsRes.ok) {
          const seatsData = await seatsRes.json();
          // 스토어의 setSeats 함수를 사용하여 데이터 주입
          useStore.getState().setSeats(seatsData.seats || seatsData);
        }

        // 2. 초기 참가자 데이터도 필요하다면 로드
        const participantsRes = await fetch('/api/participants');
        if (participantsRes.ok) {
          const pData = await participantsRes.json();
          useStore.getState().setParticipants(pData.participants || pData);
        }
      } catch (err) {
        console.error('데이터 로딩 오류:', err);
      }
    };

      useEffect(() => {
    const fetchEventData = async () => {
      try {
        // seats.ts 대신 events.ts를 통해 좌석과 이벤트 정보를 가져옵니다.
        const res = await fetch('/api/admin/events'); 
        if (res.ok) {
          const data = await res.json();
          
          // 현재 활성화된 이벤트 찾기
          const activeEvent = data.find((e: any) => e.is_active) || data[0];
          
          if (activeEvent && activeEvent.VenueLayout?.[0]) {
            const layout = activeEvent.VenueLayout[0];
            // 스토어에 좌석 데이터 주입
            useStore.getState().setSeats(layout.Seat || []);
            
            // 참가자 데이터도 함께 있다면 업데이트
            if (activeEvent.Participant) {
              useStore.getState().setParticipants(activeEvent.Participant);
            }
          }
        }
      } catch (err) {
        console.error('데이터 로딩 실패:', err);
      }
    };

    if (user) {
      fetchEventData();
    }
  }, [user]);

    if (user?.event_id) {
      fetchInitialData();
    }
  }, [user?.event_id]);
    

    const updateTimer = () => {
      const now = new Date(serverTime).getTime();
      const turnStart = new Date(currentTurnStartTime).getTime();
      const turnEnd = turnStart + 3 * 60000; // 3 minutes

      if (user.turn_order > currentTurnOrder) {
        setTimerStatus('WAITING');
        setTimeLeft(null); // Or calculate estimated time based on previous turns
      } else if (user.turn_order === currentTurnOrder) {
        if (now >= turnStart && now <= turnEnd) {
          setTimerStatus('ACTIVE');
          const diff = turnEnd - now;
          setTimeLeft(formatTimeDiff(diff));
        } else if (now > turnEnd) {
          setTimerStatus('EXPIRED');
          setTimeLeft('00:00');
        } else {
           setTimerStatus('WAITING');
           setTimeLeft(null);
        }
      } else {
        setTimerStatus('EXPIRED');
        setTimeLeft('00:00');
      }
    };

    updateTimer();
    // In a real app, we'd tick this every second locally, but syncing with serverTime is safer
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [user, serverTime, currentTurnOrder, currentTurnStartTime]);

  const formatTimeDiff = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone_last4: phone, unique_code: uniqueCode || undefined })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 409) {
          setRequiresCode(true);
          setError(data.error);
        } else {
          setError(data.error || '로그인 실패');
        }
        return;
      }
      
      // data.participant 대신 data.user를 사용하여 상태를 업데이트합니다.
      if (data.user) {
        setUser(data.user, data.sessionToken);
        setSessionExpiredMsg('');
      } else {
        setError('사용자 정보를 불러올 수 없습니다.');
      }

    } catch (err) {
      setError('서버 오류가 발생했습니다.');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-bold text-center mb-8 text-gray-900">참가자 로그인</h1>
          
          {sessionExpiredMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium text-center">
              {sessionExpiredMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="홍길동"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 뒷자리 (4자리)</label>
              <input 
                type="text" 
                maxLength={4}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="1234"
                required
              />
            </div>
            {requiresCode && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">고유 코드</label>
                <input 
                  type="text" 
                  value={uniqueCode}
                  onChange={(e) => setUniqueCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="부여받은 코드 입력"
                  required
                />
              </div>
            )}
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            <button 
              type="submit"
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition-colors mt-6 shadow-md"
            >
              입장하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm p-4 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{user.name}님</h1>
          <p className="text-sm text-gray-500 font-medium">
            세션: <span className="text-blue-600 font-bold">{user.session_id}</span> | 
            순서: <span className="text-blue-600 font-bold">{user.turn_order}번째</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-0.5">내 선택 시간</p>
          <p className="text-sm font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded-md">
            {user.allowed_start_time ? new Date(user.allowed_start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '미정'} ~ 
            {user.allowed_end_time ? new Date(user.allowed_end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '미정'}
          </p>
        </div>
      </header>
      
      <main className="flex-1 p-4 flex flex-col max-w-5xl mx-auto w-full">
        {isFrozen && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl font-bold text-center shadow-sm">
            시스템이 일시정지되었습니다: {frozenReason || '사유 없음'}
          </div>
        )}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-xl font-bold text-gray-900">좌석 맵</h2>
            <p className="text-sm text-gray-500">두 손가락으로 확대/축소 가능</p>
          </div>
          <div className="flex-1 relative min-h-[400px]">
            <SeatMap />
          </div>
        </div>

        <div className="mt-6 h-[300px]">
          <ChatWindow eventId={user.event_id} />
        </div>
      </main>
      
      <footer className="bg-white border-t p-4 sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-5xl mx-auto flex gap-3">
          {timerStatus === 'WAITING' && (
            <button className="flex-1 py-4 bg-gray-200 text-gray-500 rounded-xl font-bold text-lg cursor-not-allowed transition-colors">
              {timeLeft ? `시작까지 ${timeLeft} 남음` : '아직 차례가 아닙니다'}
            </button>
          )}
          {timerStatus === 'ACTIVE' && (
            <div className={`flex-1 py-4 rounded-xl font-bold text-lg text-center shadow-md ${isFrozen ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white animate-pulse'}`}>
              {isFrozen ? '일시정지 중' : `선택 가능 시간: ${timeLeft}`}
            </div>
          )}
          {timerStatus === 'EXPIRED' && (
            <button className="flex-1 py-4 bg-red-100 text-red-700 rounded-xl font-bold text-lg cursor-not-allowed transition-colors">
              선택 시간이 종료되었습니다
            </button>
          )}
          {timerStatus === 'COMPLETED' && (
            <button className="flex-1 py-4 bg-green-100 text-green-700 rounded-xl font-bold text-lg cursor-not-allowed transition-colors">
              좌석 선택이 완료되었습니다
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
