
import { GoogleGenAI, Type } from "@google/genai";
import { Player, Transaction, PlayerBoxScore } from '../types';
import { logError } from './analytics'; 

export async function generateScoutingReport(prospect: Player): Promise<string[]> {
    const fallback = [
        `${prospect.name} 선수는 ${prospect.position} 포지션에서 뛰어난 신체 조건을 갖춘 유망주입니다.`,
        `현재 오버롤 ${prospect.ovr} 수준으로 즉시 전력보다는 장기적인 육성이 필요해 보입니다.`,
        "워크에식과 농구 지능 면에서 높은 점수를 받고 있어, 팀의 핵심 조각으로 성장할 잠재력이 충분합니다."
    ];
    if (!process.env.API_KEY) return fallback;
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `You are an elite NBA Scout. Provide a 3-point scouting report in KOREAN for this draft prospect.
        Name: ${prospect.name}
        Position: ${prospect.position}
        Current OVR: ${prospect.ovr}
        Attributes: ATH(${prospect.ath}), OUT(${prospect.out}), INS(${prospect.ins}), PLM(${prospect.plm}), DEF(${prospect.def}), REB(${prospect.reb})
        Return as a JSON array of 3 strings.`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        });
        const jsonStr = response.text;
        if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed) && parsed.length >= 3) return parsed;
        }
    } catch (e: any) { logError('Gemini API', `Scouting Report Failed: ${e.message}`); }
    return fallback;
}

export async function generateOwnerWelcome(teamName: string) {
  return `[OWNER]: ${teamName}에 오신 것을 환영합니다. 우리의 목표와 실현 가능성을 점검해주십시오.`;
}
