import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const requireAdmin = (req: VercelRequest) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;

  const token = authHeader.split(' ')[1];
  if (!token) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );
    return payload?.role === 'admin';
  } catch {
    return false;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!requireAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const events = await prisma.event.findMany({
      orderBy: { date: 'desc' },
      include: {
        layouts: {
          select: {
            id: true,
            rows: true,
            cols: true,
            seats: true, // ✅ DB에서 좌석 데이터를 명시적으로 가져옵니다.
          },
        },
        participants: true,
      },
    });

    const normalizedEvents = events.map((event) => ({
      id: event.id,
      name: event.name,
      date: event.date,
      is_active: event.is_active,
      // ⬇️ 이 부분들이 프론트엔드 SeatMap에 전달되는 핵심 데이터입니다.
      rows: event.layouts[0]?.rows ?? 0,
      cols: event.layouts[0]?.cols ?? 0,
      seats: event.layouts[0]?.seats ?? [], // ✨ 이제 좌석 데이터가 포함됩니다!
      layoutId: event.layouts[0]?.id ?? null,
      participants: event.participants ?? [],
    }));

    return res.status(200).json({ events: normalizedEvents });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to fetch events: ' + (error?.message || 'Unknown error'),
    });
  }
}
