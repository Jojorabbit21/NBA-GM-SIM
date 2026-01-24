
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Player, PlayerBoxScore } from '../types';
import { GameTactics } from './gameEngine'; 
import { logError } from './analytics'; 

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = 2,
  delay: number = 2000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    const message = error?.message || error?.response?.message || '';
    
    const isRateLimit = status === 429 || status === 'RESOURCE_EXHAUSTED' || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED');
    const isServerError = typeof status === 'number' && status >= 500;

    if (retries > 0 && (isRateLimit || isServerError)) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    } else {
      throw error;
    }
  }
}

export async function generateScoutingReport(prospect: Player): Promise<string[]> {
    const apiKey = process.env.API_KEY;
    const fallback = [
        `${prospect.name} 선수는 ${prospect.position} 포지션에서 뛰어난 신체 조건을 갖춘 유망주입니다.`,
        `현재 오버롤 ${prospect.ovr} 수준으로 즉시 전력보다는 장기적인 육성이 필요해 보입니다.`,
        "워크에식과 농구 지능 면에서 높은 점수를 받고 있어, 팀의 핵심 조각으로 성장할 잠재력이 충분합니다."
    ];

    if (!apiKey) return fallback;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are an elite NBA Scout. Provide a 3-point scouting report in KOREAN for this draft prospect.
        Name: ${prospect.name}
        Position: ${prospect.position}
        Current OVR: ${prospect.ovr}
        Attributes: ATH(${prospect.ath}), OUT(${prospect.out}), INS(${prospect.ins}), PLM(${prospect.plm}), DEF(${prospect.def}), REB(${prospect.reb})
        
        Requirements:
        1. Point 1: Playstyle analysis and biggest strength.
        2. Point 2: Major weakness and area of improvement.
        3. Point 3: Potential NBA player comparison and overall ceiling.
        
        Return as a JSON array of 3 strings.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        const jsonStr = response.text;
        if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed) && parsed.length >= 3) return parsed;
        }
    } catch (e: any) {
        logError('Gemini API', `Scouting Report Failed: ${e.message}`);
    }
    return fallback;
}

export async function generateNewsTicker(teamName: string, recentEvents: string[]) {
  return [
    `Standard News: ${teamName} 구단이 시즌 운영에 박차를 가하고 있습니다.`,
    `NBA Ticker: 2025-26 정규리그 개막 이후 순위권 경쟁이 치열합니다.`,
    `League Info: 모든 팀들이 플레이오프 진출을 위한 로스터 최적화에 집중하고 있습니다.`
  ];
}

export async function generateOwnerWelcome(teamName: string) {
  return `[OWNER]: ${teamName}에 오신 것을 환영합니다. 우리의 목표와 실현 가능성을 점검해주십시오.`;
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
  const winner = gameResult.homeScore > gameResult.awayScore ? gameResult.home.name : gameResult.away.name;
  const loser = gameResult.homeScore < gameResult.awayScore ? gameResult.home.name : gameResult.away.name;
  const isWin = (gameResult.myTeamId === gameResult.home.id && gameResult.homeScore > gameResult.awayScore) ||
                (gameResult.myTeamId === gameResult.away.id && gameResult.awayScore > gameResult.homeScore);
  const myTeamName = gameResult.myTeamId === gameResult.home.id ? gameResult.home.name : gameResult.away.name;

  return [
    `[속보] ${winner}, ${loser} 상대로 ${Math.abs(gameResult.homeScore - gameResult.awayScore)}점차 승리`,
    isWin 
      ? `[경기 분석] ${myTeamName}의 전술적 승리, 팬들의 환호 속 경기 종료`
      : `[경기 분석] ${myTeamName}, 아쉬운 패배... 다음 경기 반등 노린다`,
    `[현장 반응] 경기장 분위기 고조, 양 팀 선수들 치열한 승부 펼쳐`
  ];
}
