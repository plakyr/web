import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;
    
    // ✅ 테스트 계정 (하드코딩)
    const validAdmins = ['admin1', 'admin2', 'admin3'];
    const validPassword = 'admin123';

    if (!validAdmins.includes(username) || password !== validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // JWT_SECRET 환경변수
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('❌ JWT_SECRET 환경변수 설정 필요!');
      return res.status(500).json({ error: '서버 설정 오류' });
    }

    const token = jwt.sign(
      { id: username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    console.log(`✅ Admin 로그인 성공: ${username}`);
    return res.json({ 
      success: true, 
      token,
      user: { username, role: 'admin' }
    });

  } catch (error) {
    console.error('❌ 로그인 에러:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
