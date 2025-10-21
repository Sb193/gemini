// server.mjs  (chạy: node server.mjs)
// ESM: thêm "type": "module" trong package.json

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 8787;

// ---------- Middlewares ----------
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// ---------- Gemini Setup ----------
if (!process.env.GOOGLE_API_KEY) {
  console.warn('⚠️  Missing GOOGLE_API_KEY in environment!');
}
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY
});

// ---------- Helpers ----------
function buildPromptFromSections(sections) {
  const guide = `
Bạn là trợ lý tạo câu hỏi trắc nghiệm (tiếng Việt) từ nội dung sau.
YÊU CẦU:
- Tạo 2–4 câu hỏi cho MỖI mục (section), tổng hợp lại thành MỘT mảng JSON duy nhất.
- Mỗi item có schema:
  {
    "question": "Câu hỏi?",
    "options": ["A", "B", "C", "D"],
    "answer": 0,
    "explanation": "Giải thích ngắn gọn, đúng trọng tâm."
  }
- "answer" là chỉ số (0..3) tương ứng phương án đúng trong "options".
- Không lặp câu, không mơ hồ, dựa sát dữ kiện trong văn bản.
- Chỉ trả về JSON THUẦN (không kèm chữ, không kèm markdown).
DỮ LIỆU:`;
  const data = JSON.stringify(
    sections.map(({ title, text }) => ({ title, text })),
    null,
    2
  );
  return `${guide}\n${data}\n\nHãy xuất ra MỘT mảng JSON duy nhất theo đúng schema.`;
}

function extractJson(text) {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = codeBlock ? codeBlock[1] : text;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  return JSON.parse(raw);
}



// ---------- Endpoint ----------
app.post('/quiz', async (req, res) => {
  try {
    // Body: { sections?: Array<{title,text,img?}> }
    const body = req.body || {};
    const sections = body.sections;


    const prompt = buildPromptFromSections(sections);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    });

    const text =
      typeof response.text === 'function'
        ? response.text()
        : response.text ?? response.output_text ?? '';

    if (!text || typeof text !== 'string') {
      return res.status(502).json({
        ok: false,
        error: 'Empty response from model'
      });
    }

    let quiz = extractJson(text);

    

    return res.json({
      ok: true,
      count: Array.isArray(quiz) ? quiz.length : 0,
      data: quiz
    });
  } catch (err) {
    console.error(err);
    const msg =
      err?.message ||
      (typeof err === 'string' ? err : 'Unhandled error');
    return res.status(500).json({
      ok: false,
      error: msg
    });
  }
});

// ---------- Healthcheck ----------
app.get('/', (_req, res) => {
  res.type('text').send('Quiz API is running. POST /quiz');
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Server listening at http://localhost:${PORT}`);
});
