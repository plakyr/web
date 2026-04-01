import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, phone_last4 } = req.body;
    console.log("로그인 시도 데이터:", { name, phone_last4 }); // 서버 로그 확인용

    // 1. 활성화된 이벤트가 있는지 먼저 확인
    const activeEvent = await prisma.event.findFirst({ where: { is_active: true } });
    if (!activeEvent) {
      return res.status(400).json({ error: '현재 진행 중인 이벤트가 없습니다.' });
    }

    // 2. 참가자 찾기 (필드명을 정확히 String으로 변환하여 비교)
    const participant = await prisma.participant.findFirst({
      where: {
        participant_name: name,
        phone_last4: String(phone_last4),
        event_id: activeEvent.id
      }
    });

    if (!participant) {
      return res.status(401).json({ error: '등록되지 않은 정보입니다.' });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
    const token = jwt.sign(
      { id: participant.id, role: 'participant' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.status(200).json({ success: true, token, user: participant });

  } catch (error: any) {
    // 500 에러의 진짜 이유를 콘솔에 출력합니다.
    console.error('SERVER_ERROR_DETAIL:', error.message);
    return res.status(500).json({ 
      error: '서버 내부 오류가 발생했습니다.', 
      debug: error.message // 실제 에러 내용을 프론트로 보내 확인
    });
  }
}
