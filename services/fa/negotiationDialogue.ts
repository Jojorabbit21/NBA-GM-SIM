/**
 * Negotiation Dialogue System
 *
 * 선수 성격(SaveTendencies) + 기분(Morale) + 협상 감정 상태를 기반으로
 * 상황에 맞는 한국어 대사를 결정론적으로 생성한다.
 */

import type { SaveTendencies } from '../../types/player';
import { stringToHash, seededRandom } from '../../utils/hiddenTendencies';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type NegotiationType = 'extension' | 'fa' | 'release';

export type DialogueTrigger =
    | 'GREETING'           // 협상 시작
    | 'OFFER_GENEROUS'     // 요구가 이상 오퍼
    | 'OFFER_FAIR'         // 최저선~요구가 구간
    | 'OFFER_LOW'          // 모욕선~최저선 미달
    | 'OFFER_INSULT'       // 모욕선 이하
    | 'COUNTER'            // 카운터 오퍼
    | 'ACCEPT'             // 수락
    | 'REJECT'             // 거절
    | 'WALKED_AWAY'        // 협상 결렬
    | 'RELEASE_PROPOSE'    // 방출 제안 (waive/stretch)
    | 'RELEASE_BUYOUT_OK'  // 바이아웃 수락
    | 'RELEASE_BUYOUT_NO'; // 바이아웃 거절

export interface DialogueContext {
    tendencies: SaveTendencies;
    morale: number;        // player.morale?.score ?? 50
    respect: number;       // 0~1
    trust: number;         // 0~1
    frustration: number;   // 0~1
    round: number;
    negotiationType: NegotiationType;
}

// ─────────────────────────────────────────────────────────────
// Personality category helpers
// ─────────────────────────────────────────────────────────────

function isProud(t: SaveTendencies)    { return t.ego > 0.35; }           // ego 0~1 scale로 매핑: (ego+1)/2
function isHumble(t: SaveTendencies)   { return t.ego < -0.3; }
function isMoney(t: SaveTendencies)    { return t.financialAmbition > 0.68; }
function isLoyal(t: SaveTendencies)    { return t.loyalty > 0.65; }
function isWinFirst(t: SaveTendencies) { return t.winDesire > 0.65; }
function isHotheaded(t: SaveTendencies){ return t.temperament > 0.45; }
function isCalm(t: SaveTendencies)     { return t.temperament < -0.40; }

// ─────────────────────────────────────────────────────────────
// Dialogue pools
// ─────────────────────────────────────────────────────────────

type DialoguePool = string[];

const POOLS: Record<string, DialoguePool> = {

    // ── GREETING ──────────────────────────────────────────────
    'GREETING_extension_proud': [
        "내 실력이 얼마인지 잘 알잖아. 그에 맞게 얘기하자.",
        "이 팀에서 내 가치는 증명됐어. 그만한 대우를 원해.",
        "협상하자고. 근데 내 이름값은 잊지 마.",
        "좋아. 숫자 얘기해보자. 단, 내 수준에 맞게.",
    ],
    'GREETING_extension_money': [
        "단도직입적으로 얘기하자. 나는 최고 대우를 원해.",
        "시간 낭비하지 말고 최고 조건부터 제시해봐.",
        "솔직히 말할게. 연봉이 최우선이야.",
        "숫자로 얘기하자. 나는 좋은 계약을 원해.",
    ],
    'GREETING_extension_loyal': [
        "여기가 내 집 같아. 조건만 맞으면 바로 사인할게.",
        "이 팀에서 계속 뛰고 싶어. 좋은 조건으로 협상해보자.",
        "이 팀에 남고 싶어. 서로 좋은 방향을 찾아보자.",
        "솔직히 말하면, 여기를 떠나고 싶지 않아. 얘기해보자.",
    ],
    'GREETING_extension_winFirst': [
        "여기서 우승할 수 있다면 남겠어. 그게 중요해.",
        "타이틀을 노리고 있어. 이 팀이 그 길에 있다면 계약하지.",
        "우승할 팀에서 뛰고 싶어. 여기서 가능하다면 얘기해보자.",
        "챔피언십 가능성을 보여줘. 그러면 사인하겠어.",
    ],
    'GREETING_extension_neutral': [
        "이 팀에서 계속 뛰고 싶어. 제대로 된 조건으로 협상해보자.",
        "내 커리어에 이 팀은 특별해. 그만큼 대우를 원해.",
        "좋아, 협상을 시작하자. 서로 좋은 조건을 찾아봐.",
        "오랫동안 함께했잖아. 제대로 대우해줘.",
        "계약 얘기를 해보자. 조건이 맞으면 오래 함께할 수 있어.",
    ],

    'GREETING_fa_proud': [
        "내 가치를 알아볼 팀이 여럿이야. 설득해봐.",
        "솔직히 말할게, 내 이름값은 알고 있어. 그에 맞는 오퍼를 들고 와.",
        "여러 팀에서 연락이 왔어. 왜 여기가 최선인지 보여줘.",
        "관심 가져줘서 고마워. 근데 내 기대치는 높아.",
    ],
    'GREETING_fa_money': [
        "최고 연봉을 원해. 그게 최우선이야.",
        "솔직히 말할게. 내 가치에 맞는 오퍼를 기대하고 있어.",
        "다른 팀들도 좋은 숫자를 제시했어. 그 이상을 줄 수 있어?",
        "좋아. 어떤 조건을 제시할 수 있어?",
    ],
    'GREETING_fa_loyal': [
        "원래 팀이 좋은 조건을 못 내놨어. 새로운 집을 찾고 있어.",
        "이 팀에 합류하고 싶어. 조건만 잘 맞으면 바로 결정할게.",
        "여기서 뛰는 게 마음에 들어. 좋은 오퍼 기대해.",
        "솔직히 FA는 편하지 않아. 빨리 결정하고 싶어.",
    ],
    'GREETING_fa_winFirst': [
        "우승 가능성이 있는 팀에 가고 싶어. 여기가 그렇다고 봐?",
        "챔피언십이 목표야. 이 팀에서 가능한지 보여줘.",
        "타이틀 후보 팀에 합류하고 싶어. 어떤 비전이 있어?",
        "우승할 팀에서 뛰겠어. 설득해봐.",
    ],
    'GREETING_fa_neutral': [
        "솔직히 말할게. 내 가치에 맞는 오퍼를 들고 와.",
        "여러 팀들이 관심 보이고 있어. 최선을 다해줘.",
        "좋아. 어떤 조건을 제시할 건지 들어볼게.",
        "FA 시장은 처음이 아니야. 좋은 딜이 오길 기대하고 있어.",
        "여기서 뛰는 걸 생각해봤어. 조건을 보자.",
    ],

    'GREETING_release_proud': [
        "이렇게 보내는 건가. 아직 줄 게 많은데.",
        "나를 방출한다고? 두고 봐. 다른 팀에서 증명하겠어.",
        "...내 커리어가 여기서 끝나는 건 아니야.",
        "예상은 했어. 하지만 실망스럽네. 조건이나 얘기하자.",
    ],
    'GREETING_release_hotheaded': [
        "방출?! 이 팀이 나한테 할 수 있는 게 그것뿐이야?",
        "...믿기지 않아. 내가 이 팀에 얼마나 헌신했는데.",
        "화가 나. 근데 어쩌겠어. 숫자나 얘기하자.",
        "이게 뭐야. 내 희생을 다 잊어버린 거야?",
    ],
    'GREETING_release_calm': [
        "예상은 했어. 조건이나 얘기하자.",
        "그래. 다음 단계를 생각해야지. 숫자 보여줘.",
        "...알겠어. 어떤 조건인지 들어볼게.",
        "비즈니스는 비즈니스야. 딜을 마무리하자.",
    ],
    'GREETING_release_neutral': [
        "...예상은 했어. 조건이나 얘기하자.",
        "이 팀이 나한테 해줄 수 있는 건 여기까지인 거네.",
        "그래. 어쩌겠어. 좋은 조건으로 마무리하자.",
        "아직 커리어가 남아 있어. 다음을 생각하자.",
        "솔직히 충격이야. 근데 우선 조건 얘기를 해보자.",
    ],

    // ── OFFER_GENEROUS ─────────────────────────────────────────
    'OFFER_GENEROUS_proud': [
        "좋아. 내 가치를 알고 있구나.",
        "이 정도면 이야기가 돼.",
        "마음에 드는 숫자야. 계약서 들고 와.",
        "예상보다 좋은 오퍼인데. 사인하지.",
    ],
    'OFFER_GENEROUS_money': [
        "이거야. 이런 숫자를 기다리고 있었어.",
        "말이 통하는군. 계약하자.",
        "완벽한 오퍼야. 더 이상 볼 필요 없어.",
        "마음에 들어. 사인하겠어.",
    ],
    'OFFER_GENEROUS_winFirst': [
        "좋아. 우승할 수 있는 팀에서 이 정도 대우라면 최고야.",
        "이 조건이면 여기서 최선을 다할 수 있어.",
        "금전적으로도 좋고, 팀도 마음에 들어. 계약하자.",
        "완벽해. 계약서 가져와.",
    ],
    'OFFER_GENEROUS_neutral': [
        "좋은 오퍼야. 계약하자.",
        "예상보다 좋은데. 사인하겠어.",
        "기대 이상이야. 바로 결정할게.",
        "이 정도면 충분해. 계약하지.",
    ],

    // ── OFFER_FAIR ─────────────────────────────────────────────
    'OFFER_FAIR_proud': [
        "나쁘지 않은데. 조금만 더 올려줘.",
        "시작은 좋아. 조금 더 맞춰봐.",
        "방향은 맞는데, 숫자를 더 높여줘.",
        "근접했어. 한 번 더 생각해봐.",
    ],
    'OFFER_FAIR_money': [
        "더 줄 수 있을 것 같은데. 조금 더.",
        "아직 내 기대에 미치지 못해. 노력해봐.",
        "가까워지고 있어. 조금만 더 올려줘.",
        "이 정도로는 부족해. 숫자를 다시 봐.",
    ],
    'OFFER_FAIR_loyal': [
        "이 팀이 좋긴 한데, 조금 더 맞춰줄 수 있어?",
        "나쁘지 않아. 조금만 올려주면 바로 사인할게.",
        "거의 다 왔어. 조금만 더.",
        "이 정도면 좋아. 그래도 조금 더 올려줘.",
    ],
    'OFFER_FAIR_neutral': [
        "나쁘지 않아. 조금 더 올려줘.",
        "방향은 맞아. 조금만 더.",
        "가까워지고 있어. 더 생각해봐.",
        "이 정도면 협상할 수 있어. 좀 더 올려봐.",
        "조금 더 맞춰주면 사인하겠어.",
    ],

    // ── OFFER_LOW ──────────────────────────────────────────────
    'OFFER_LOW_proud': [
        "이 숫자가 내 가치라고 생각해? 다시 생각해봐.",
        "내 이름값을 이렇게 평가하는 거야? 실망스럽네.",
        "진심이야? 더 진지하게 접근해줘.",
        "아직 내 기대에 한참 못 미쳐.",
    ],
    'OFFER_LOW_money': [
        "시장가를 무시하면 곤란해. 숫자 다시 봐.",
        "내가 얼마를 원하는지 알잖아. 이건 너무 낮아.",
        "이 금액으로는 협상이 어려워. 더 높여와.",
        "진지하게 협상하려면 숫자를 올려야 해.",
    ],
    'OFFER_LOW_frustrated': [
        "계속 이런 숫자 가져오면 다른 팀 연락받을게.",
        "이러면 시간 낭비야. 제대로 된 오퍼를 들고 와.",
        "지쳐가고 있어. 좀 더 진지하게 접근해줘.",
        "이 협상, 의미 있게 진행하고 싶어. 숫자를 올려.",
    ],
    'OFFER_LOW_hotheaded': [
        "이게 뭐야! 제대로 협상할 생각이 있는 거야?",
        "시간 낭비하지 마. 진지한 오퍼를 들고 와.",
        "내 인내심을 시험하는 거야?",
        "화가 나네. 이건 협상이라고 볼 수 없어.",
    ],
    'OFFER_LOW_neutral': [
        "이 금액으로는 어렵워. 더 생각해봐.",
        "내 기대에 못 미쳐. 숫자를 올려줘.",
        "다시 생각해봐. 이건 너무 낮아.",
        "조금 더 진지하게 접근해줘.",
        "이 정도면 합의가 어려워.",
    ],

    // ── OFFER_INSULT ───────────────────────────────────────────
    'OFFER_INSULT_proud': [
        "내 가치를 그 정도로 본다고? 협상 끝났어.",
        "이 숫자는 모욕이야. 진심으로 사과해.",
        "내 커리어를 이렇게 평가한다고? 말이 안 돼.",
        "이건 협상이 아니야. 자리를 뜰게.",
    ],
    'OFFER_INSULT_hotheaded': [
        "이건 모욕이야! 다시는 연락하지 마.",
        "이 숫자로 날 부른 거야?! 황당하다.",
        "화가 머리끝까지 났어. 협상 끝이야.",
        "지금 농담하는 거야?!",
    ],
    'OFFER_INSULT_lowMorale': [
        "...그래, 이 팀이 나를 보는 눈이 그 정도인 거지.",
        "이미 실망할 만큼 실망했어. 끝내자.",
        "예상은 했지만, 이 정도일 줄은 몰랐어.",
        "...알겠어. 더 이상 시간 낭비하지 말자.",
    ],
    'OFFER_INSULT_neutral': [
        "이게 진심이야? 이 숫자로 날 모욕하는 건가.",
        "이건 받아들일 수 없어. 협상을 재고해.",
        "진지하게 대화할 생각이 없구나.",
        "이 정도 오퍼는 모욕이나 마찬가지야.",
        "실망이야. 이건 협상이 아니야.",
    ],

    // ── COUNTER ────────────────────────────────────────────────
    'COUNTER_proud': [
        "내 요구 조건이야. 이 정도는 받아야 해.",
        "이 숫자가 내 최소야. 여기서 더 내려갈 수 없어.",
        "이거 보여줄게. 이게 내가 원하는 거야.",
        "내 카운터야. 이 기준에서 시작하자.",
    ],
    'COUNTER_money': [
        "시장가를 반영해서 다시 제시할게. 이 정도는 받아야 해.",
        "숫자를 다시 보여줄게. 이게 공정한 값이야.",
        "내 요구야. 이 이상은 깎을 수 없어.",
        "이게 내 최종 요구야. 맞춰줄 수 있어?",
    ],
    'COUNTER_frustrated': [
        "이게 마지막 기회야. 이 조건 맞춰줘.",
        "더 이상 기다릴 수 없어. 이게 내 카운터야.",
        "시간이 없어. 이 숫자로 결정해.",
        "인내심이 한계야. 이 오퍼 받아줘.",
    ],
    'COUNTER_calm': [
        "조용히 내 요구 조건을 제시할게. 검토해봐.",
        "감정 없이 얘기하자. 내 카운터야.",
        "이 숫자가 합리적이라고 생각해. 고려해줘.",
        "내 제안이야. 냉정하게 판단해봐.",
    ],
    'COUNTER_neutral': [
        "조금 더 올려줘. 그러면 계약서에 사인할 수 있어.",
        "내 요구야. 이 정도면 합의할 수 있을 것 같아.",
        "다시 생각해봐. 이 카운터가 공정하다고 생각해.",
        "여기서 조금만 더 양보해줘.",
        "이게 내 조건이야. 어떻게 생각해?",
    ],

    // ── ACCEPT ─────────────────────────────────────────────────
    'ACCEPT_proud': [
        "알겠어. 내 가치를 인정해줬군. 계약하지.",
        "이 정도면 만족해. 사인할게.",
        "좋아. 내가 원하는 조건이야. 계약서 가져와.",
        "인정해. 계약하겠어.",
    ],
    'ACCEPT_money': [
        "이거야. 바로 사인하겠어.",
        "이 숫자면 충분해. 계약하자.",
        "마음에 들어. 바로 결정할게.",
        "좋아. 사인할게.",
    ],
    'ACCEPT_loyal': [
        "이 팀에서 계속 뛸 수 있어서 기뻐. 사인할게.",
        "여기가 내 집이야. 계약하자.",
        "잘됐어. 이 팀에서 더 좋은 모습 보여줄게.",
        "오래 함께할 수 있겠어. 계약하지.",
    ],
    'ACCEPT_winFirst': [
        "우승을 향해 함께 달려보자. 계약하겠어.",
        "이 팀에서 타이틀을 딸 수 있을 것 같아. 사인하지.",
        "좋아. 여기서 우승하자. 계약할게.",
        "챔피언십을 향해 함께 가자. 사인하겠어.",
    ],
    'ACCEPT_neutral': [
        "알겠어. 계약하자.",
        "이 조건이면 사인하겠어.",
        "좋아. 함께하자.",
        "계약서 들고 와. 사인할게.",
        "결정했어. 계약하자.",
    ],

    // ── REJECT ─────────────────────────────────────────────────
    'REJECT_proud': [
        "내 기대에 미치지 못해. 다른 팀 얘기를 들어볼게.",
        "아쉽지만, 이 조건으로는 계약할 수 없어.",
        "더 좋은 조건을 가져올 수 있었는데. 아쉽네.",
        "내 가치를 인정하지 않는 팀과 계약하기 어려워.",
    ],
    'REJECT_money': [
        "조건이 맞지 않아. 다른 팀 보겠어.",
        "원하는 숫자가 아니야. 통과.",
        "더 좋은 오퍼가 있어. 미안.",
        "이 금액으로는 사인할 수 없어.",
    ],
    'REJECT_neutral': [
        "미안하지만, 이 조건으로는 사인하기 어려워.",
        "다른 쪽을 알아봐야 할 것 같아.",
        "조건이 맞지 않아. 아쉽지만 여기서 마무리하자.",
        "원하는 조건이 아니야. 다른 팀을 고려할게.",
        "이 협상은 여기서 마무리해야 할 것 같아.",
    ],

    // ── WALKED_AWAY ────────────────────────────────────────────
    'WALKED_AWAY_proud': [
        "더 이상 이 협상은 의미가 없어. 끝내겠어.",
        "나를 이렇게 대우하는 팀과는 계약할 수 없어.",
        "이 팀이 내 가치를 모르는군. 다른 길을 찾겠어.",
        "자존심이 허락하지 않아. 협상 끝.",
    ],
    'WALKED_AWAY_hotheaded': [
        "이제 지쳤어! 협상 끝이야!",
        "더 이상 못 참겠어. 나가겠어.",
        "이건 내 자존심 문제야. 끝내겠어.",
        "화가 너무 나. 더 얘기 안 할게.",
    ],
    'WALKED_AWAY_calm': [
        "더 이상 진전이 없겠군. 협상을 종료할게.",
        "이성적으로 판단했어. 계속할 이유가 없어.",
        "이만 마치자. 다른 방향을 찾겠어.",
        "냉정하게 판단했어. 여기서 끝내는 게 맞아.",
    ],
    'WALKED_AWAY_neutral': [
        "더 이상 이 팀과 협상하지 않겠어.",
        "이 협상은 여기서 끝이야.",
        "시간을 더 낭비하고 싶지 않아. 가겠어.",
        "더 기다릴 수 없어. 다른 선택을 하겠어.",
        "협상이 결렬됐어. 유감이야.",
    ],

    // ── RELEASE_PROPOSE ────────────────────────────────────────
    'RELEASE_PROPOSE_proud': [
        "이렇게 보내는 건가. 아직 줄 게 많은데.",
        "나를 방출한다고? 이 팀을 위해 얼마나 희생했는데.",
        "...내 커리어가 여기서 끝나는 건 아니야. 조건이나 보자.",
        "예상했지만 실망스럽네. 그래도 조건은 제대로 받아야겠어.",
    ],
    'RELEASE_PROPOSE_hotheaded': [
        "방출?! 내가 이 팀에 얼마나 헌신했는데!",
        "믿기지 않아. 이렇게 끝나는 건가.",
        "화가 나. 근데 어쩌겠어. 숫자나 얘기하자.",
        "이게 뭐야. 내 희생을 이렇게 보상해주는 거야?",
    ],
    'RELEASE_PROPOSE_calm': [
        "예상은 했어. 조건이나 얘기하자.",
        "그래. 다음 단계를 생각해야지.",
        "알겠어. 어떤 조건인지 들어볼게.",
        "비즈니스는 비즈니스야. 딜을 마무리하자.",
    ],
    'RELEASE_PROPOSE_neutral': [
        "...예상은 했어. 조건이나 얘기하자.",
        "이 팀이 나한테 해줄 수 있는 건 여기까지인 거네.",
        "그래. 어쩌겠어. 좋은 조건으로 마무리하자.",
        "아직 커리어가 남아 있어. 다음을 생각하자.",
        "솔직히 충격이야. 근데 우선 조건 얘기를 해보자.",
    ],

    // ── RELEASE_BUYOUT_OK ──────────────────────────────────────
    'RELEASE_BUYOUT_OK': [
        "알겠어. 이 조건으로 마무리하자.",
        "공정한 바이아웃이야. 받아들이겠어.",
        "이 정도면 납득할 수 있어. 사인하자.",
        "고마워. 좋은 기억만 가져가겠어.",
        "좋아. 새로운 시작을 할게.",
    ],

    // ── RELEASE_BUYOUT_NO ──────────────────────────────────────
    'RELEASE_BUYOUT_NO_proud': [
        "이 금액은 내 가치에 비해 너무 낮아. 다시 생각해봐.",
        "내 남은 계약 가치를 이렇게 평가한다고?",
        "더 공정한 조건을 들고 와.",
        "이건 받아들이기 어려워.",
    ],
    'RELEASE_BUYOUT_NO_neutral': [
        "이 금액으로는 바이아웃에 동의할 수 없어.",
        "더 나은 조건을 제시해줘.",
        "공정하지 않아. 다시 생각해봐.",
        "이 바이아웃은 거절할게.",
        "조건이 맞지 않아. 더 올려줘.",
    ],
};

// ─────────────────────────────────────────────────────────────
// Pool selection logic
// ─────────────────────────────────────────────────────────────

function selectPool(trigger: DialogueTrigger, ctx: DialogueContext): DialoguePool {
    const t = ctx.tendencies;
    const isFrustrated = ctx.frustration > 0.55;
    const isLowMorale  = ctx.morale < 35;

    switch (trigger) {
        case 'GREETING': {
            const base = `GREETING_${ctx.negotiationType}`;
            if (ctx.negotiationType === 'release') {
                if (isHotheaded(t)) return POOLS[`${base}_hotheaded`] ?? POOLS[`${base}_neutral`]!;
                if (isCalm(t))      return POOLS[`${base}_calm`] ?? POOLS[`${base}_neutral`]!;
                if (isProud(t))     return POOLS[`${base}_proud`] ?? POOLS[`${base}_neutral`]!;
            } else {
                if (isProud(t))     return POOLS[`${base}_proud`] ?? POOLS[`${base}_neutral`]!;
                if (isMoney(t))     return POOLS[`${base}_money`] ?? POOLS[`${base}_neutral`]!;
                if (isLoyal(t))     return POOLS[`${base}_loyal`] ?? POOLS[`${base}_neutral`]!;
                if (isWinFirst(t))  return POOLS[`${base}_winFirst`] ?? POOLS[`${base}_neutral`]!;
            }
            return POOLS[`${base}_neutral`] ?? POOLS['GREETING_fa_neutral']!;
        }

        case 'OFFER_GENEROUS': {
            if (isWinFirst(t)) return POOLS['OFFER_GENEROUS_winFirst']!;
            if (isMoney(t))    return POOLS['OFFER_GENEROUS_money']!;
            if (isProud(t))    return POOLS['OFFER_GENEROUS_proud']!;
            return POOLS['OFFER_GENEROUS_neutral']!;
        }

        case 'OFFER_FAIR': {
            if (isFrustrated)  return POOLS['OFFER_FAIR_neutral']!; // 이미 지쳐있으면 냉담하게
            if (isLoyal(t))    return POOLS['OFFER_FAIR_loyal']!;
            if (isMoney(t))    return POOLS['OFFER_FAIR_money']!;
            if (isProud(t))    return POOLS['OFFER_FAIR_proud']!;
            return POOLS['OFFER_FAIR_neutral']!;
        }

        case 'OFFER_LOW': {
            if (isFrustrated)   return POOLS['OFFER_LOW_frustrated']!;
            if (isHotheaded(t)) return POOLS['OFFER_LOW_hotheaded']!;
            if (isProud(t))     return POOLS['OFFER_LOW_proud']!;
            if (isMoney(t))     return POOLS['OFFER_LOW_money']!;
            return POOLS['OFFER_LOW_neutral']!;
        }

        case 'OFFER_INSULT': {
            if (isHotheaded(t)) return POOLS['OFFER_INSULT_hotheaded']!;
            if (isLowMorale)    return POOLS['OFFER_INSULT_lowMorale']!;
            if (isProud(t))     return POOLS['OFFER_INSULT_proud']!;
            return POOLS['OFFER_INSULT_neutral']!;
        }

        case 'COUNTER': {
            if (isFrustrated)  return POOLS['COUNTER_frustrated']!;
            if (isCalm(t))     return POOLS['COUNTER_calm']!;
            if (isProud(t))    return POOLS['COUNTER_proud']!;
            if (isMoney(t))    return POOLS['COUNTER_money']!;
            return POOLS['COUNTER_neutral']!;
        }

        case 'ACCEPT': {
            if (isLoyal(t))    return POOLS['ACCEPT_loyal']!;
            if (isWinFirst(t)) return POOLS['ACCEPT_winFirst']!;
            if (isMoney(t))    return POOLS['ACCEPT_money']!;
            if (isProud(t))    return POOLS['ACCEPT_proud']!;
            return POOLS['ACCEPT_neutral']!;
        }

        case 'REJECT': {
            if (isMoney(t))    return POOLS['REJECT_money']!;
            if (isProud(t))    return POOLS['REJECT_proud']!;
            return POOLS['REJECT_neutral']!;
        }

        case 'WALKED_AWAY': {
            if (isHotheaded(t)) return POOLS['WALKED_AWAY_hotheaded']!;
            if (isCalm(t))      return POOLS['WALKED_AWAY_calm']!;
            if (isProud(t))     return POOLS['WALKED_AWAY_proud']!;
            return POOLS['WALKED_AWAY_neutral']!;
        }

        case 'RELEASE_PROPOSE': {
            if (isHotheaded(t)) return POOLS['RELEASE_PROPOSE_hotheaded']!;
            if (isCalm(t))      return POOLS['RELEASE_PROPOSE_calm']!;
            if (isProud(t))     return POOLS['RELEASE_PROPOSE_proud']!;
            return POOLS['RELEASE_PROPOSE_neutral']!;
        }

        case 'RELEASE_BUYOUT_OK':
            return POOLS['RELEASE_BUYOUT_OK']!;

        case 'RELEASE_BUYOUT_NO': {
            if (isProud(t)) return POOLS['RELEASE_BUYOUT_NO_proud']!;
            return POOLS['RELEASE_BUYOUT_NO_neutral']!;
        }

        default:
            return POOLS['ACCEPT_neutral']!;
    }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * 선수 성격 + 협상 상태 기반으로 한국어 대사를 결정론적으로 생성한다.
 * 같은 seed + trigger + round 조합이면 항상 동일한 대사 반환.
 */
export function generateDialogue(
    trigger: DialogueTrigger,
    ctx: DialogueContext,
    seed: string,
): string {
    const pool = selectPool(trigger, ctx);
    if (!pool || pool.length === 0) return '...';

    // 결정론적 인덱스 선택
    const hashSeed = stringToHash(seed + trigger + String(ctx.round));
    const r = seededRandom(hashSeed);
    const idx = Math.floor(r * pool.length);
    return pool[Math.max(0, Math.min(idx, pool.length - 1))];
}
