import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { PlayerBoxScore } from './types';
import { GameTactics } from './gameEngine'; 

/**
 * Helper function to retry an async operation with exponential backoff.
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = 2, // Reduced retries to fail faster to fallback on quota issues
  delay: number = 2000 // Increased initial delay to handle RPM limits better
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    const message = error?.message || error?.response?.message || '';
    
    // Check for rate limits or server errors
    const isRateLimit = status === 429 || status === 'RESOURCE_EXHAUSTED' || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED');
    const isServerError = typeof status === 'number' && status >= 500;

    if (retries > 0 && (isRateLimit || isServerError)) {
      // console.debug(`Gemini API transient error (${status}). Retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    } else {
      throw error;
    }
  }
}

export async function generateNewsTicker(teamName: string, recentEvents: string[]) {
  const apiKey = process.env.API_KEY;
  
  const fallbackNews = [
    `Standard News: ${teamName} 구단이 시즌 운영에 박차를 가하고 있습니다.`,
    `NBA Ticker: 2025-26 정규리그 개막 이후 순위권 경쟁이 치열합니다.`,
    `League Info: 모든 팀들이 플레이오프 진출을 위한 로스터 최적화에 집중하고 있습니다.`
  ];

  // NOTE: API Quota 문제 및 사용자 요청으로 인한 일시적 API 비활성화
  return fallbackNews;

  /*
  if (!apiKey) {
    return fallbackNews;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Act as an NBA reporter like Woj or Shams. 
    Generate news in KOREAN language.
    Context: 2025-26 Season. Team: ${teamName}.
    Events: ${recentEvents.join(', ')}.
    Generate 3 short, punchy news tickers (max 15 words each). 
    Use the format "Woj/Shams: [내용]"`;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));
    return response.text?.split('\n').filter(l => l.trim() !== '') || fallbackNews;
  } catch (error: any) {
    // Gracefully handle quota errors without cluttering console with stack traces
    const isQuota = error?.status === 429 || error?.status === 'RESOURCE_EXHAUSTED' || error?.message?.includes('quota');
    if (isQuota) {
      console.warn("Gemini API quota exceeded (News Ticker). Using fallback content.");
    } else {
      console.error("Gemini Error (News Ticker):", error);
    }
    return fallbackNews;
  }
  */
}

export async function generateOwnerWelcome(teamName: string) {
  const apiKey = process.env.API_KEY;
  const fallbackMessage = `[OWNER]: ${teamName}에 오신 것을 환영합니다. 우리의 목표와 실현 가능성을 점검해주십시오.`;
  
  // NOTE: API Quota 문제 및 사용자 요청으로 인한 일시적 API 비활성화
  return fallbackMessage;

  /*
  if (!apiKey) return fallbackMessage;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are the owner of the NBA team "${teamName}". 
    Welcome the new General Manager who just took over the team.
    Generate a one-sentence, charismatic welcome message in KOREAN.
    The tone should be professional and high-stakes.
    Example: "단장님, ${teamName}의 영광을 되찾아올 준비가 되셨길 바랍니다."`;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));
    return `[OWNER]: ${response.text?.trim() || "함께 우승을 향해 나아갑시다."}`;
  } catch (error: any) {
    const isQuota = error?.status === 429 || error?.status === 'RESOURCE_EXHAUSTED' || error?.message?.includes('quota');
    if (isQuota) {
      console.warn("Gemini API quota exceeded (Owner Welcome). Using fallback content.");
    } else {
      console.error("Gemini Error (Owner Welcome):", error);
    }
    return fallbackMessage;
  }
  */
}

export async function generateGameRecapNews(gameResult: {
  home: any; 
  away: any; 
  homeScore: number;
  awayScore: number;
  homeBox: PlayerBoxScore[];
  awayBox: PlayerBoxScore[];
  userTactics: GameTactics; 
  myTeamId: string;
}): Promise<string[] | null> {
  const apiKey = process.env.API_KEY;
  
  const winner = gameResult.homeScore > gameResult.awayScore ? gameResult.home.name : gameResult.away.name;
  const loser = gameResult.homeScore < gameResult.awayScore ? gameResult.home.name : gameResult.away.name;
  const isWin = (gameResult.myTeamId === gameResult.home.id && gameResult.homeScore > gameResult.awayScore) ||
                (gameResult.myTeamId === gameResult.away.id && gameResult.awayScore > gameResult.homeScore);
  const myTeamName = gameResult.myTeamId === gameResult.home.id ? gameResult.home.name : gameResult.away.name;

  // Fallback content in case of failure or missing API key
  const fallbackRecap = [
    `[속보] ${winner}, ${loser} 상대로 ${Math.abs(gameResult.homeScore - gameResult.awayScore)}점차 승리`,
    isWin 
      ? `[경기 분석] ${myTeamName}의 전술적 승리, 팬들의 환호 속 경기 종료`
      : `[경기 분석] ${myTeamName}, 아쉬운 패배... 다음 경기 반등 노린다`,
    `[현장 반응] 경기장 분위기 고조, 양 팀 선수들 치열한 승부 펼쳐`
  ];

  if (!apiKey) {
    return fallbackRecap;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const isMyTeamHome = gameResult.myTeamId === gameResult.home.id;
    const myTeam = isMyTeamHome ? gameResult.home : gameResult.away;
    const opponentTeam = isMyTeamHome ? gameResult.away : gameResult.home;
    const myScore = isMyTeamHome ? gameResult.homeScore : gameResult.awayScore;
    const opponentScore = isMyTeamHome ? gameResult.awayScore : gameResult.homeScore;
    
    // Safety check for empty boxes or undefined data
    if (!gameResult.homeBox || !gameResult.awayBox) return fallbackRecap;

    const myBox = isMyTeamHome ? gameResult.homeBox : gameResult.awayBox;
    const oppBox = isMyTeamHome ? gameResult.awayBox : gameResult.homeBox;
    
    // Avoid mutating original array with sort
    const myTopPerformer = [...myBox].sort((a, b) => b.pts - a.pts)[0];
    const oppTopPerformer = [...oppBox].sort((a, b) => b.pts - a.pts)[0];

    const offenseTacticsDisplay = gameResult.userTactics?.offenseTactics?.map(t => {
      // Fix: Use correct OffenseTactic string literals as defined in types.ts
      switch(t) {
        case 'Balance': return '밸런스 오펜스';
        case 'PaceAndSpace': return '페이스 & 스페이스';
        case 'PerimeterFocus': return '퍼리미터 포커스';
        case 'PostFocus': return '포스트 포커스';
        case 'Grind': return '그라인드';
        case 'SevenSeconds': return '세븐 세컨즈';
        default: return t;
      }
    }).join(', ') || '기본 전술';

    const defenseTacticDisplay = gameResult.userTactics?.defenseTactics?.map(t => {
      switch(t) {
        case 'ManToManPerimeter': return '맨투맨 & 퍼리미터 수비';
        case 'ZoneDefense': return '존 디펜스';
        case 'AceStopper': return '에이스 스토퍼';
        default: return t;
      }
    }).join(', ') || '기본 수비';

    const prompt = `Act as a seasoned NBA sports journalist for ESPN. 
    Write 3 short news paragraphs (bullet points) in KOREAN about this game.
    
    Game Info:
    - ${myTeam.city} ${myTeam.name} vs ${opponentTeam.city} ${opponentTeam.name}
    - Score: ${myScore} - ${opponentScore} (${isWin ? 'Win' : 'Loss'})
    - My Team Top Player: ${myTopPerformer?.playerName} (${myTopPerformer?.pts}pts)
    - Opponent Top Player: ${oppTopPerformer?.playerName} (${oppTopPerformer?.pts}pts)
    - Tactics: Offense(${offenseTacticsDisplay}), Defense(${defenseTacticDisplay})

    Requirements:
    1. First point: Overall summary of the game result and key moment.
    2. Second point: Analysis of ${myTeam.name}'s performance, tactics effectiveness, and key player.
    3. Third point: Future outlook or coach's reaction.
    
    Return ONLY a JSON array of strings.`;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }));
    
    const jsonStr = response.text;
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    
    return fallbackRecap;

  } catch (error: any) {
    const isQuota = error?.status === 429 || error?.status === 'RESOURCE_EXHAUSTED' || error?.message?.includes('quota');
    if (isQuota) {
      console.warn("Gemini API quota exceeded (Game Recap). Using fallback content.");
    } else {
      console.error("Gemini Error (Game Recap):", error);
    }
    return fallbackRecap;
  }
}