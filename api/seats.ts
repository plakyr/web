import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 활성화된 이벤트를 찾고 관련 데이터를 포함합니다.
    const event = await prisma.event.findFirst({
      where: { is_active: true },
      include: {
        VenueLayout: {
          include: {
            Seat: true
          }
        },
        Participant: true,
        SessionColor: true
      }
    });

    if (!event) {
      return res.status(404).json({ error: '활성화된 이벤트를 찾을 수 없습니다.' });
    }

    // 클라이언트가 사용하기 편한 구조로 응답
    res.status(200).json({
      seats: event.VenueLayout[0]?.Seat || [],
      participants: event.Participant || [],
      sessionColors: event.SessionColor || []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '데이터 로드 실패' });
  } finally {
    await prisma.$disconnect();
  }
}
