import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 활성화된 이벤트 찾기
    const event = await prisma.event.findFirst({
      where: { is_active: true },
      include: {
        layouts: {
          include: {
            seats: true // 스키마에 정의된 필드명 'seats' 사용
          }
        },
        participants: true,
        sessionColors: true
      }
    });

    if (!event) {
      return res.status(404).json({ error: '활성화된 이벤트가 없습니다.' });
    }

    // 2. 클라이언트(User.tsx)가 기대하는 구조로 데이터 전송
    return res.status(200).json({
      seats: event.layouts[0]?.seats || [],
      participants: event.participants || [],
      sessionColors: event.sessionColors || []
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: '데이터 로드 실패', 
      message: error.message 
    });
  } finally {
    await prisma.$disconnect();
  }
}
