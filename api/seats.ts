import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 활성화된 이벤트 찾기 (대소문자 무관하게 시도)
    const event: any = await prisma.event.findFirst({
      where: { is_active: true }
    }) || await (prisma as any).Event.findFirst({
      where: { is_active: true }
    });

    if (!event) {
      return res.status(404).json({ error: '활성화된 이벤트가 없습니다.' });
    }

    // 2. 가장 에러가 많이 나는 VenueLayout과 Seat 가져오기
    // include 대신 별도로 조회하여 에러 지점을 특정합니다.
    const layouts = await prisma.venueLayout.findMany({
      where: { event_id: event.id }
    }) || await (prisma as any).VenueLayout.findMany({
      where: { event_id: event.id }
    });

    const layoutId = layouts[0]?.id;
    let seats: any[] = [];

    if (layoutId) {
      // Seat 테이블 조회 (Prisma Client가 생성한 이름을 동적으로 찾음)
      seats = await (prisma as any).seat.findMany({
        where: { venue_layout_id: layoutId }
      }) || await (prisma as any).Seat.findMany({
        where: { venue_layout_id: layoutId }
      });
    }

    // 3. 참가자 및 세션 컬러 조회
    const participants = await prisma.participant.findMany({ where: { event_id: event.id } });
    const sessionColors = await (prisma as any).sessionColor.findMany({ where: { event_id: event.id } }) 
                         || await (prisma as any).SessionColor.findMany({ where: { event_id: event.id } });

    return res.status(200).json({
      seats: seats || [],
      participants: participants || [],
      sessionColors: sessionColors || []
    });

  } catch (error: any) {
    console.error('SERVER_ERROR:', error);
    // 500 에러 시 브라우저 콘솔에 "진짜 이유"를 던져줍니다.
    return res.status(500).json({ 
      error: 'DB 조회 실패', 
      message: error.message,
      stack: error.stack 
    });
  } finally {
    await prisma.$disconnect();
  }
}
