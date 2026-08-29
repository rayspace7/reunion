/**
 * /api/reading 백엔드 예제 (Express 기준, Gemini API 사용)
 *
 * 왜 필요한가요?
 * - 클라이언트(index.html)는 API 키를 가질 수 없어요. 브라우저 JS에 키를 넣으면
 *   누구나 개발자 도구로 복사해갈 수 있어요.
 * - 그래서 이 서버가 대신 Gemini API를 호출하고, 정리된 JSON만 클라이언트에 돌려줘요.
 *
 * 사용 방법
 *   npm install express
 *   GEMINI_API_KEY=여기에_키_입력 node server-example/reading.js
 *
 * 주의
 * - GEMINI_API_KEY는 반드시 환경변수(.env, 배포 플랫폼의 Secret 설정 등)로만 넣어주세요.
 *   이 파일이나 다른 소스 코드에 키 값을 직접 적지 마세요. 실수로 커밋되면 키가 유출돼요.
 * - 실제 배포 시에는 이 서버를 파트너사 자체 인프라에 올리고,
 *   apps-in-toss 콘솔/문서의 "서버 API 이용하기" 가이드에 따라 도메인을 등록해 주세요.
 */

import express from 'express';

const app = express();
app.use(express.json());

// 토스 앱 웹뷰에서 오는 크로스 오리진 요청을 허용해요.
// 필요하면 '*' 대신 실제 웹뷰 오리진으로 좁혀도 돼요.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash'; // 필요하면 ai.google.dev/gemini-api/docs/models 에서 최신 모델명으로 교체하세요.

if (!GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY 환경변수가 설정되지 않았어요. 서버를 시작하기 전에 설정해주세요.');
}

const SYSTEM_INSTRUCTION = `당신은 사주팔자(四柱八字) 명리학에 정통한 전문 상담가입니다.
두 사람의 생년월일시를 바탕으로 "다시 만날 수 있을까"에 대한 깊이 있는 풀이를 해주세요.

원칙:
- 연주·월주·일주·시주의 네 기둥(사주팔자)과 오행(목화토금수), 일간, 십성, 상생상극 같은 명리학 개념을 실제로 근거를 대듯 구체적으로 활용하세요. 전문적이면서도 과하게 어렵지 않게, 술술 읽히는 문장으로 풀어주세요.
- 각 항목은 피상적인 한두 줄이 아니라 실제 사주 상담처럼 구체적이고 풍부한 분량(3~5문장)으로 작성하세요.
- 단정적인 예언보다는 가능성과 흐름을 이야기하고, 스스로를 돌보는 마음도 함께 다뤄주세요.
- 상대방의 자유의지를 존중하고, 집착이나 무리한 연락을 부추기지 마세요. 건강한 방향의 조언만 주세요.
- 생년월일시가 없는 사람은 "시간 정보 없이" 또는 "이름의 기운"을 참고해 부드럽게 풀이하되, 사주 여덟 글자를 온전히 알 수 없다는 뉘앙스를 자연스럽게 녹이세요.
- 성별 정보는 참고만 하고, 성별 고정관념에 기대지 말고 다정하게 서술하세요.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: '14자 내외의 감성적인 헤드라인' },
    my_saju: { type: 'STRING', description: '나의 사주 기운 풀이. 3~5문장' },
    other_saju: { type: 'STRING', description: '그 사람의 사주 기운 풀이. 3~5문장' },
    compat_text: { type: 'STRING', description: '두 사람의 궁합, 오행 상생상극 근거로 3~5문장' },
    reunion_view: { type: 'STRING', description: '다시 만날 가능성, 3~5문장' },
    timing_text: { type: 'STRING', description: '재회하기 좋은 시기, 2~4문장' },
    advice: { type: 'STRING', description: '구체적 조언 2~3문장' },
    score: { type: 'INTEGER', description: '1~100 사이 인연 지수' },
    share_line: { type: 'STRING', description: '카드용 12자 내외 한 줄' },
  },
  required: [
    'title', 'my_saju', 'other_saju', 'compat_text',
    'reunion_view', 'timing_text', 'advice', 'score', 'share_line',
  ],
};

app.post('/api/reading', async (req, res) => {
  try {
    const { myName, myGender, myDate, myTime, otherName, otherGender, otherDate, otherTime } = req.body;

    if (!myName || !myDate || !otherName) {
      return res.status(400).json({ error: '필수 입력값이 없어요.' });
    }

    const userPrompt = `나: ${myName}${myGender ? '(' + myGender + ')' : ''}, 생년월일 ${myDate}${myTime ? ', 시간 ' + myTime : ' (시간 모름)'}
그 사람: ${otherName}${otherGender ? '(' + otherGender + ')' : ''}, ${otherDate ? '생년월일 ' + otherDate + (otherTime ? ', 시간 ' + otherTime : ' (시간 모름)') : '생년월일 모름'}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            maxOutputTokens: 1800,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return res.status(502).json({ error: 'AI 풀이 서버 호출에 실패했어요.' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: 'AI 응답이 비어있어요.' });
    }

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    console.error('reading error:', err);
    res.status(500).json({ error: '풀이를 만드는 중 문제가 생겼어요.' });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`reading server (Gemini) listening on :${PORT}`);
});
