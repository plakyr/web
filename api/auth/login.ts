import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // User.tsx에서 전달하는 필드명: name, phone_last4
    const { name, phone_last4 } = req.body;

    if (!name || !phone_last4) {
      return res.status(400).json({ error: '이름과 전화번호 뒷자리를 모두 입력해주세요.' });
    }

    // 1. 이름과 전화번호 뒷자리가 "동시에" 일치하는 참가자를 찾습니다.
    // 현재 활성화된 이벤트(is_active: true) 소속인지도 함께 체크하여 보안을 강화합니다.
    const participant = await prisma.participant.findFirst({
      where: {
        participant_name: name, // CSV의 이름 컬럼
        phone_last4: String(phone_last4), // CSV의 전화번호 뒷자리 컬럼
        event: {
          is_active: true // 활성화된 이벤트 참가자만 허용
        }
      }
    });

    // 2. 일치하는 정보가 없으면 에러 반환 (임의 로그인 차단)
    if (!participant) {
      return res.status(401).json({ error: '등록된 정보가 없습니다. 이름과 번호를 다시 확인해주세요.' });
    }

    // 3. JWT 설정 확인
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error("환경변수 JWT_SECRET이 설정되지 않았습니다.");
      return res.status(500).json({ error: '서버 설정 오류' });
    }

    // 4. 토큰 생성
    const token = jwt.sign(
      { 
        id: participant.id, 
        role: 'participant',
        event_id: participant.event_id 
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    // 5. 성공 응답
    return res.status(200).json({
      success: true,
      token, // 프론트엔드의 sessionToken으로 저장됨
      user: participant
    });

  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
}
