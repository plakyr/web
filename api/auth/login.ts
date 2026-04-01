import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, phone_last4 } = req.body;
    
    // 1. 활성화된 이벤트 확인
    const activeEvent = await prisma.event.findFirst({ where: { is_active: true } });
    if (!activeEvent) {
      return res.status(400).json({ error: '현재 진행 중인 이벤트가 없습니다.' });
    }

    // 2. 참가자 찾기 (에러 로그에 따라 participant_name -> name으로 수정)
    const participant = await prisma.participant.findFirst({
      where: {
        name: name, // 에러 로그에서 확인된 실제 필드명
        phone_last4: String(phone_last4),
        event_id: activeEvent.id
      }
    });

    // 3. 일치하는 정보가 없으면 에러 반환
    if (!participant) {
      return res.status(401).json({ error: '등록되지 않은 정보입니다. 이름과 번호를 확인해주세요.' });
    }

    // 4. 토큰 생성
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const token = jwt.sign(
      { id: participant.id, role: 'participant' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: participant
    });

  } catch (error: any) {
    console.error('SERVER_ERROR_DETAIL:', error.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
