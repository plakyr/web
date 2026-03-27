import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const upload = multer({
  storage: multer.memoryStorage(),
});

const runMiddleware = (
  req: VercelRequest,
  res: VercelResponse,
  fn: (req: any, res: any, callback: (err?: any) => void) => void
) =>
  new Promise<void>((resolve, reject) => {
    fn(req, res, (result?: any) => {
      if (result instanceof Error) return reject(result);
      if (result) return reject(result);
      resolve();
    });
  });

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

export const config = {
  api: {
    bodyParser: false,
  },
};

type CsvRow = {
  event_id: string;
  session_id: string;
  participant_name: string;
  phone_last4: string;
  order_in_session: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!requireAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await runMiddleware(req, res, upload.single('file'));

    const file = (req as any).file;
    const { name, rows, cols } = (req as any).body || {};

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!name || !rows || !cols) {
      return res.status(400).json({ error: 'name, rows, cols are required' });
    }

    const parsedRowsNum = Number(rows);
    const parsedColsNum = Number(cols);

    if (
      !Number.isInteger(parsedRowsNum) ||
      !Number.isInteger(parsedColsNum) ||
      parsedRowsNum <= 0 ||
      parsedColsNum <= 0
    ) {
      return res.status(400).json({
        error: 'rows와 cols는 1 이상의 정수여야 합니다.',
      });
    }

    const parsedRows = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    });

    let records: CsvRow[] = parsedRows.map((record: Record<string, any>) => {
      const cleaned: Record<string, string> = {};

      for (const key in record) {
        const cleanKey = key.replace(/^\uFEFF/, '').trim();
        cleaned[cleanKey] = String(record[key] ?? '').trim();
      }

      return cleaned as CsvRow;
    });

    records = records.filter((row) =>
      Object.values(row).some((value) => String(value).trim() !== '')
    );

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV 데이터가 비어 있습니다.' });
    }

    const firstRecordKeys = Object.keys(records[0]);

    if (firstRecordKeys.length === 1 && firstRecordKeys[0].includes(';')) {
      return res.status(400).json({
        error:
          'CSV 파일의 구분자가 쉼표(,)가 아닌 세미콜론(;)입니다. 쉼표로 구분된 CSV 파일을 업로드해주세요.',
      });
    }

    const requiredColumns = [
      'event_id',
      'session_id',
      'participant_name',
      'phone_last4',
      'order_in_session',
    ];

    const missingColumns = requiredColumns.filter(
      (col) => !firstRecordKeys.includes(col)
    );

    if (missingColumns.length > 0) {
      return res.status(400).json({
        error: `필수 컬럼이 누락되었습니다: ${missingColumns.join(', ')}`,
      });
    }

    const invalidRowIndex = records.findIndex(
      (row) =>
        !row.session_id ||
        !row.participant_name ||
        !row.phone_last4 ||
        !row.order_in_session
    );

    if (invalidRowIndex !== -1) {
      return res.status(400).json({
        error: `CSV 파일 ${invalidRowIndex + 2}번째 행에 필수 데이터가 누락되었습니다.`,
      });
    }

    const participantCounts = new Map<string, number>();
    for (const row of records) {
      const key = `${row.participant_name}-${row.phone_last4}`;
      participantCounts.set(key, (participantCounts.get(key) || 0) + 1);
    }

    const turnGroups = new Set<string>();
    for (const row of records) {
      turnGroups.add(`${row.session_id}|${row.order_in_session}`);
    }

    const sortedTurnGroups = Array.from(turnGroups).sort((a, b) => {
      const [sessionA, orderA] = a.split('|');
      const [sessionB, orderB] = b.split('|');

      if (sessionA !== sessionB) {
        const numA = parseInt(sessionA.replace(/\D/g, ''), 10);
        const numB = parseInt(sessionB.replace(/\D/g, ''), 10);

        if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
          return numA - numB;
        }

        return sessionA.localeCompare(sessionB);
      }

      return Number(orderA) - Number(orderB);
    });

    const turnOrderMap = new Map<string, number>();
    sortedTurnGroups.forEach((group, index) => {
      turnOrderMap.set(group, index + 1);
    });

    const now = new Date();

    const createdEvent = await prisma.event.create({
      data: {
        name: String(name),
        date: now,
        is_active: true,
      },
    });

    const createdLayout = await prisma.venueLayout.create({
      data: {
        event_id: createdEvent.id,
        rows: parsedRowsNum,
        cols: parsedColsNum,
      },
    });

    const participantsData = records.map((row) => {
      const duplicateKey = `${row.participant_name}-${row.phone_last4}`;
      const isDuplicate = (participantCounts.get(duplicateKey) || 0) > 1;
      const turnKey = `${row.session_id}|${row.order_in_session}`;
      const globalTurnOrder = turnOrderMap.get(turnKey) || 1;

      return {
        event_id: createdEvent.id,
        session_id: row.session_id,
        name: row.participant_name,
        phone_last4: row.phone_last4,
        unique_code: isDuplicate
          ? Math.random().toString(36).substring(2, 6).toUpperCase()
          : null,
        turn_order: globalTurnOrder,
      };
    });

    if (participantsData.length > 0) {
      await prisma.participant.createMany({
        data: participantsData,
      });
    }

    const seatsData = [];
    for (let r = 1; r <= parsedRowsNum; r++) {
      for (let c = 1; c <= parsedColsNum; c++) {
        seatsData.push({
          layout_id: createdLayout.id,
          row: r,
          col: c,
          status: 'EMPTY',
          assigned_to: null,
          session_id: null,
        });
      }
    }

    if (seatsData.length > 0) {
      await prisma.seat.createMany({
        data: seatsData,
      });
    }

    await prisma.systemState.create({
      data: {
        event_id: createdEvent.id,
        is_frozen: false,
        current_turn_order: 1,
        current_turn_start_time: now,
      },
    });

    const sessions = Array.from(new Set(records.map((row) => row.session_id)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return res.status(200).json({
      success: true,
      eventId: createdEvent.id,
      event: {
        id: createdEvent.id,
        name: createdEvent.name,
        date: createdEvent.date,
        rows: createdLayout.rows,
        cols: createdLayout.cols,
        layoutId: createdLayout.id,
      },
      summary: {
        participantCount: participantsData.length,
        seatCount: seatsData.length,
        sessionCount: sessions.length,
      },
      sessions,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Upload failed: ' + (error?.message || 'Unknown error'),
    });
  }
}
