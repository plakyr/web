import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 활성화된 이벤트를 먼저 찾습니다.
    const event = await prisma.event.findFirst({
      where: { is_active: true },
      select: { id: true }
    });

    if (!event) {
      return res.status(404).json({ error: '활성화된 이벤트가 없습니다.' });
    }

    // 2. 해당 이벤트의 레이아웃과 좌석을 가져옵니다. 
    // (모델명 VenueLayout이 맞는지, Venue_Layout인지 확인이 필요할 수 있습니다)
    const layout = await prisma.venueLayout.findFirst({
      where: { event_id: event.id },
      include: {
        Seat: true
      }
    });

    // 3. 참가자 및 컬러 정보 가져오기
    const participants = await prisma.participant.findMany({
      where: { event_id: event.id }
    });

    const sessionColors = await prisma.sessionColor.findMany({
      where: { event_id: event.id }
    });

    return res.status(200).json({
      seats: layout?.Seat || [],
      participants: participants || [],
      sessionColors: sessionColors || []
    });

  } catch (error: any) {
    console.error('API Error:', error);
    // 구체적인 에러 메시지를 응답에 포함하여 원인 파악을 돕습니다.
    return res.status(500).json({ 
      error: '서버 내부 오류', 
      message: error.message 
    });
  } finally {
    await prisma.$disconnect();
  }
}
