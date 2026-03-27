// api/admin/upload.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const upload = multer({ storage: multer.memoryStorage() });

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
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
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

    const rawRecords = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    });

    let records = rawRecords.map((record: Record<string, any>) => {
      const cleaned: Record<string, any> = {};
      for (const key in record) {
        const cleanKey = key.replace(/^\uFEFF/, '').trim();
        cleaned[cleanKey] = typeof record[key] === 'string' ? record[key].trim() : record[key];
      }
      return cleaned;
    });

    records = records.filter((r: Record<string, any>) =>
      Object.values(r).some((v) => String(v ?? '').trim() !== '')
    );

    if (records.length > 0) {
      const firstRecordKeys = Object.keys(records[0]);
      if (firstRecordKeys.length === 1 && firstRecordKeys[0].includes(';')) {
        return res.status(400).json({
          error: 'CSV 파일의 구분자가 쉼표(,)가 아닌 세미콜론(;)입니다. 쉼표로 구분된 CSV 파일을 업로드해주세요.',
        });
      }
    }

    const requiredColumns = [
      'event_id',
      'session_id',
      'participant_name',
      'phone_last4',
      'order_in_session',
    ];

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV 데이터가 비어 있습니다.' });
    }

    const firstKeys = Object.keys(records[0]);
    const missingColumns = requiredColumns.filter((col) => !firstKeys.includes(col));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        error: `필수 컬럼이 누락되었습니다: ${missingColumns.join(', ')}`,
      });
    }

    const participantCounts = new Map<string, number>();
    records.forEach((r: Record<string, any>) => {
      const key = `${r.participant_name}-${r.phone_last4}`;
      participantCounts.set(key, (participantCounts.get(key) || 0) + 1);
    });

    const turnGroups = new Set<string>();
    records.forEach((r: Record<string, any>) => {
      turnGroups.add(`${r.session_id}|${r.order_in_session}`);
    });

    const sortedTurnGroups = Array.from(turnGroups).sort((a, b) => {
      const [sA, oA] = a.split('|');
      const [sB, oB] = b.split('|');

      if (sA !== sB) {
        const numA = parseInt(sA.replace(/\D/g, ''), 10);
        const numB = parseInt(sB.replace(/\D/g, ''), 10);

        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB;
        }
        return sA.localeCompare(sB);
      }

      return parseInt(oA, 10) - parseInt(oB, 10);
    });

    const turnOrderMap = new Map<string, number>();
    sortedTurnGroups.forEach((group, index) => {
      turnOrderMap.set(group, index + 1);
    });

    const participants = records.map((r: Record<string, any>, index: number) => {
      if (!r.session_id || !r.participant_name || !r.phone_last4) {
        throw new Error(`CSV 파일 ${index + 1}번째 행에 필수 데이터가 누락되었습니다.`);
      }

      const key = `${r.participant_name}-${r.phone_last4}`;
      const isDuplicate = (participantCounts.get(key) || 0) > 1;
      const globalTurnOrder = turnOrderMap.get(`${r.session_id}|${r.order_in_session}`) || 1;

      return {
        event_id: String(r.event_id),
        session_id: String(r.session_id),
        name: String(r.participant_name),
        phone_last4: String(r.phone_last4),
        unique_code: isDuplicate
          ? Math.random().toString(36).substring(2, 6).toUpperCase()
          : null,
        turn_order: globalTurnOrder,
      };
    });

    const seats = [];
    for (let r = 1; r <= parseInt(rows, 10); r++) {
      for (let c = 1; c <= parseInt(cols, 10); c++) {
        seats.push({
          row: r,
          col: c,
          status: 'EMPTY',
        });
      }
    }

    const sessions = Array.from(
      new Set(records.map((r: Record<string, any>) => r.session_id))
    )
      .filter(Boolean)
      .sort();

    return res.status(200).json({
      success: true,
      mode: 'vercel-hardcoded',
      event: {
        id: crypto.randomUUID?.() ?? `event_${Date.now()}`,
        name,
        rows: parseInt(rows, 10),
        cols: parseInt(cols, 10),
      },
      summary: {
        participantCount: participants.length,
        seatCount: seats.length,
        sessionCount: sessions.length,
      },
      sessions,
      participants,
      seats,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Upload failed: ' + (error?.message || 'Unknown error'),
    });
  }
}
