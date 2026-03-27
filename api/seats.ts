import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 활성화된 이벤트 찾기
    const event = await prisma.event.findFirst({
      where: { is_active: true }
    });

    if (!event) {
      return res.status(404).json({ error: '활성화된 이벤트가 없습니다.' });
    }

    // 2. 모델명 대소문자 이슈를 피하기 위해 PrismaClient의 내부 모델명을 확인하여 호출
    // 보통 Prisma는 내부적으로 소문자(venueLayout)를 권장하지만 환경에 따라 다를 수 있음
    const layout = await (prisma as any).venueLayout?.findFirst({
      where: { event_id: event.id },
      include: { Seat: true }
    }) || await (prisma as any).VenueLayout?.findFirst({
      where: { event_id: event.id },
      include: { Seat: true }
    });

    // 3. 참가자 및 컬러 정보 (모델명이 확실한 것들)
    const participants = await prisma.participant.findMany({
      where: { event_id: event.id }
    });

    const sessionColors = await (prisma as any).sessionColor?.findMany({
      where: { event_id: event.id }
    }) || await (prisma as any).SessionColor?.findMany({
      where: { event_id: event.id }
    });

    return res.status(200).json({
      seats: layout?.Seat || [],
      participants: participants || [],
      sessionColors: sessionColors || []
    });

  } catch (error: any) {
    console.error('API Error Details:', error);
    return res.status(500).json({ 
      error: 'Database Query Failed', 
      detail: error.message 
    });
  } finally {
    await prisma.$disconnect();
  }
}
