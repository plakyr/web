import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 프론트엔드에서 보낸 데이터 (세션ID, 전화번호 뒷4자리, 입장순서)
    const { session_id, phone_last4, turn_order } = req.body;

    // 2. DB(PostgreSQL)에서 해당 참가자 찾기
    const participant = await prisma.participant.findFirst({
      where: {
        session_id: session_id,
        phone_last4: phone_last4,
        turn_order: Number(turn_order), // 숫자로 변환
      },
    });

    // 3. 참가자가 없으면 에러 반환
    if (!participant) {
      return res.status(401).json({ error: '참가자 정보를 찾을 수 없습니다.' });
    }

    // 4. JWT 토큰 생성 (관리자용과 동일한 SECRET 사용 권장)
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
       return res.status(500).json({ error: '서버 설정 오류 (JWT_SECRET 미설정)' });
    }

    const token = jwt.sign(
      { 
        id: participant.id, 
        role: 'participant',
        session_id: participant.session_id 
      },
      JWT_SECRET,
      { expiresIn: '12h' } // 참가자는 보통 행사 당일만 유지되므로 12시간 정도가 적당합니다.
    );

    // 5. 성공 응답 (좌석 정보 등이 포함된 participant 객체 전달)
    return res.status(200).json({
      success: true,
      token,
      user: participant
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
