import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 활성화된 이벤트의 ID를 가져옵니다.
    const activeEvents: any[] = await prisma.$queryRaw`SELECT id FROM "Event" WHERE is_active = true LIMIT 1`;
    
    if (!activeEvents || activeEvents.length === 0) {
      return res.status(404).json({ error: '활성화된 이벤트가 없습니다.' });
    }

    const eventId = activeEvents[0].id;

    // 2. 해당 이벤트의 좌석들을 직접 쿼리로 가져옵니다.
    // 테이블명은 보통 "Seat" 또는 "seat"입니다. 대소문자를 구분하여 시도합니다.
    const seats: any[] = await prisma.$queryRaw`
      SELECT * FROM "Seat" 
      WHERE venue_layout_id IN (
        SELECT id FROM "VenueLayout" WHERE event_id = ${eventId}
      )
    `;

    // 3. 참가자 명단 가져오기
    const participants: any[] = await prisma.$queryRaw`
      SELECT * FROM "Participant" WHERE event_id = ${eventId}
    `;

    // 4. 세션 컬러 정보 가져오기
    const sessionColors: any[] = await prisma.$queryRaw`
      SELECT * FROM "SessionColor" WHERE event_id = ${eventId}
    `;

    return res.status(200).json({
      seats: seats || [],
      participants: participants || [],
      sessionColors: sessionColors || []
    });

  } catch (error: any) {
    console.error('SQL Error:', error);
    return res.status(500).json({ 
      error: '데이터베이스 직접 조회 실패', 
      message: error.message 
    });
  } finally {
    await prisma.$disconnect();
  }
}
