import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 활성화된 이벤트를 찾습니다.
    // 스키마에 정의된 필드명: layouts, participants, sessionColors 를 정확히 사용해야 합니다.
    const event = await prisma.event.findFirst({
      where: { is_active: true },
      include: {
        layouts: {
          include: {
            seats: true // VenueLayout 모델 내부의 Seat 관계 필드명은 'seats'입니다.
          }
        },
        participants: true,
        sessionColors: true
      }
    });

    if (!event) {
      return res.status(404).json({ error: '활성화된 이벤트가 없습니다.' });
    }

    // 2. 프론트엔드가 사용할 수 있도록 데이터 구조화
    return res.status(200).json({
      seats: event.layouts[0]?.seats || [],
      participants: event.participants || [],
      sessionColors: event.sessionColors || []
    });

  } catch (error: any) {
    console.error('Prisma Runtime Error:', error);
    return res.status(500).json({ 
      error: '데이터베이스 조회 중 오류 발생', 
      message: error.message 
    });
  } finally {
    await prisma.$disconnect();
  }
}
