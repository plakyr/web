import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    const validAdmins = ['admin1', 'admin2', 'admin3'];
    const validPassword = 'admin123';

    if (!validAdmins.includes(username) || password !== validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ error: '서버 설정 오류' });
    }

    const token = jwt.sign(
      { id: username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: { username, role: 'admin' }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
