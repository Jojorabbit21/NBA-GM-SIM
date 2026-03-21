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
    | 'RELEASE_BUYOUT_NO'  // 바이아웃 거절
    | 'EXT_NOT_YET';       // 계약 기간 남아있어 연장 거절

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
        "제 실력이 얼마인지 잘 아시잖아요. 그에 맞게 얘기해봐요.",
        "이 팀에서 제 가치는 증명됐어요. 그만한 대우를 원해요.",
        "협상해보죠. 제 이름값은 잊지 마세요.",
        "좋아요. 숫자 얘기해봐요. 단, 제 수준에 맞게요.",
    ],
    'GREETING_extension_money': [
        "단도직입적으로 얘기할게요. 저는 최고 대우를 원해요.",
        "시간 낭비하지 마시고 최고 조건부터 제시해보세요.",
        "솔직히 말씀드릴게요. 연봉이 최우선이에요.",
        "숫자로 얘기해봐요. 저는 좋은 계약을 원해요.",
    ],
    'GREETING_extension_loyal': [
        "여기가 제 집 같아요. 조건만 맞으면 바로 사인할게요.",
        "이 팀에서 계속 뛰고 싶어요. 좋은 조건으로 협상해봐요.",
        "이 팀에 남고 싶어요. 서로 좋은 방향을 찾아봐요.",
        "솔직히 말씀드리면, 여기를 떠나고 싶지 않아요. 얘기해봐요.",
    ],
    'GREETING_extension_winFirst': [
        "여기서 우승할 수 있다면 남겠어요. 그게 중요해요.",
        "타이틀을 노리고 있어요. 이 팀이 그 길에 있다면 계약하죠.",
        "우승할 팀에서 뛰고 싶어요. 여기서 가능하다면 얘기해봐요.",
        "챔피언십 가능성을 보여주세요. 그러면 사인할게요.",
    ],
    'GREETING_extension_neutral': [
        "이 팀에서 계속 뛰고 싶어요. 제대로 된 조건으로 협상해봐요.",
        "제 커리어에 이 팀은 특별해요. 그만큼 대우를 원해요.",
        "좋아요, 협상을 시작해봐요. 서로 좋은 조건을 찾아봐요.",
        "오랫동안 함께했잖아요. 제대로 대우해주세요.",
        "계약 얘기를 해봐요. 조건이 맞으면 오래 함께할 수 있어요.",
    ],

    'GREETING_fa_proud': [
        "제 가치를 알아볼 팀이 여럿이에요. 설득해보세요.",
        "솔직히 말씀드릴게요, 제 이름값은 알고 있어요. 그에 맞는 오퍼를 들고 오세요.",
        "여러 팀에서 연락이 왔어요. 왜 여기가 최선인지 보여주세요.",
        "관심 가져주셔서 고마워요. 근데 제 기대치는 높아요.",
    ],
    'GREETING_fa_money': [
        "최고 연봉을 원해요. 그게 최우선이에요.",
        "솔직히 말씀드릴게요. 제 가치에 맞는 오퍼를 기대하고 있어요.",
        "다른 팀들도 좋은 숫자를 제시했어요. 그 이상을 주실 수 있어요?",
        "좋아요. 어떤 조건을 제시하실 수 있어요?",
    ],
    'GREETING_fa_loyal': [
        "원래 팀이 좋은 조건을 못 내놨어요. 새로운 집을 찾고 있어요.",
        "이 팀에 합류하고 싶어요. 조건만 잘 맞으면 바로 결정할게요.",
        "여기서 뛰는 게 마음에 들어요. 좋은 오퍼 기대할게요.",
        "솔직히 FA는 편하지 않아요. 빨리 결정하고 싶어요.",
    ],
    'GREETING_fa_winFirst': [
        "우승 가능성이 있는 팀에 가고 싶어요. 여기가 그렇다고 보세요?",
        "챔피언십이 목표예요. 이 팀에서 가능한지 보여주세요.",
        "타이틀 후보 팀에 합류하고 싶어요. 어떤 비전이 있으세요?",
        "우승할 팀에서 뛰겠어요. 설득해보세요.",
    ],
    'GREETING_fa_neutral': [
        "솔직히 말씀드릴게요. 제 가치에 맞는 오퍼를 들고 오세요.",
        "여러 팀들이 관심 보이고 있어요. 최선을 다해주세요.",
        "좋아요. 어떤 조건을 제시하실 건지 들어볼게요.",
        "FA 시장은 처음이 아니에요. 좋은 딜이 오길 기대하고 있어요.",
        "여기서 뛰는 걸 생각해봤어요. 조건을 봐요.",
    ],

    'GREETING_release_proud': [
        "이렇게 보내시는 건가요. 아직 드릴 게 많은데요.",
        "저를 방출하신다고요? 두고 보세요. 다른 팀에서 증명하겠어요.",
        "...제 커리어가 여기서 끝나는 건 아니에요.",
        "예상은 했어요. 하지만 실망스럽네요. 조건이나 얘기해봐요.",
    ],
    'GREETING_release_hotheaded': [
        "방출이요?! 이 팀이 저한테 할 수 있는 게 그것뿐인가요?",
        "...믿기지 않아요. 제가 이 팀에 얼마나 헌신했는데요.",
        "화가 나요. 근데 어쩌겠어요. 숫자나 얘기해봐요.",
        "이게 뭔가요. 제 희생을 다 잊어버리신 거예요?",
    ],
    'GREETING_release_calm': [
        "예상은 했어요. 조건이나 얘기해봐요.",
        "그래요. 다음 단계를 생각해야죠. 숫자 보여주세요.",
        "...알겠어요. 어떤 조건인지 들어볼게요.",
        "비즈니스는 비즈니스죠. 딜을 마무리해요.",
    ],
    'GREETING_release_neutral': [
        "...예상은 했어요. 조건이나 얘기해봐요.",
        "이 팀이 저한테 해줄 수 있는 건 여기까지인 거네요.",
        "그래요. 어쩌겠어요. 좋은 조건으로 마무리해요.",
        "아직 커리어가 남아 있어요. 다음을 생각해봐요.",
        "솔직히 충격이에요. 근데 우선 조건 얘기를 해봐요.",
    ],

    // ── OFFER_GENEROUS ─────────────────────────────────────────
    'OFFER_GENEROUS_proud': [
        "좋아요. 제 가치를 알고 계시는군요.",
        "이 정도면 이야기가 되네요.",
        "마음에 드는 숫자예요. 계약서 들고 오세요.",
        "예상보다 좋은 오퍼네요. 사인할게요.",
    ],
    'OFFER_GENEROUS_money': [
        "이거예요. 이런 숫자를 기다리고 있었어요.",
        "말이 통하시는군요. 계약해요.",
        "완벽한 오퍼예요. 더 이상 볼 필요 없어요.",
        "마음에 들어요. 사인할게요.",
    ],
    'OFFER_GENEROUS_winFirst': [
        "좋아요. 우승할 수 있는 팀에서 이 정도 대우라면 최고네요.",
        "이 조건이면 여기서 최선을 다할 수 있어요.",
        "금전적으로도 좋고, 팀도 마음에 들어요. 계약해요.",
        "완벽해요. 계약서 가져오세요.",
    ],
    'OFFER_GENEROUS_neutral': [
        "좋은 오퍼예요. 계약해요.",
        "예상보다 좋네요. 사인할게요.",
        "기대 이상이에요. 바로 결정할게요.",
        "이 정도면 충분해요. 계약하죠.",
    ],

    // ── OFFER_FAIR ─────────────────────────────────────────────
    'OFFER_FAIR_proud': [
        "나쁘지 않네요. 조금만 더 올려주세요.",
        "시작은 좋아요. 조금 더 맞춰보세요.",
        "방향은 맞는데, 숫자를 더 높여주세요.",
        "근접했어요. 한 번 더 생각해보세요.",
    ],
    'OFFER_FAIR_money': [
        "더 주실 수 있을 것 같은데요. 조금 더요.",
        "아직 제 기대에 미치지 못해요. 노력해보세요.",
        "가까워지고 있어요. 조금만 더 올려주세요.",
        "이 정도로는 부족해요. 숫자를 다시 봐주세요.",
    ],
    'OFFER_FAIR_loyal': [
        "이 팀이 좋긴 한데, 조금 더 맞춰주실 수 있어요?",
        "나쁘지 않아요. 조금만 올려주시면 바로 사인할게요.",
        "거의 다 왔어요. 조금만 더요.",
        "이 정도면 좋아요. 그래도 조금 더 올려주세요.",
    ],
    'OFFER_FAIR_neutral': [
        "나쁘지 않아요. 조금 더 올려주세요.",
        "방향은 맞아요. 조금만 더요.",
        "가까워지고 있어요. 더 생각해보세요.",
        "이 정도면 협상할 수 있어요. 좀 더 올려보세요.",
        "조금 더 맞춰주시면 사인할게요.",
    ],

    // ── OFFER_LOW ──────────────────────────────────────────────
    'OFFER_LOW_proud': [
        "이 숫자가 제 가치라고 생각하세요? 다시 생각해보세요.",
        "제 이름값을 이렇게 평가하시는 거예요? 실망스럽네요.",
        "진심이세요? 더 진지하게 접근해주세요.",
        "아직 제 기대에 한참 못 미쳐요.",
    ],
    'OFFER_LOW_money': [
        "시장가를 무시하시면 곤란해요. 숫자 다시 봐주세요.",
        "제가 얼마를 원하는지 아시잖아요. 이건 너무 낮아요.",
        "이 금액으로는 협상이 어려워요. 더 높여오세요.",
        "진지하게 협상하시려면 숫자를 올리셔야 해요.",
    ],
    'OFFER_LOW_frustrated': [
        "계속 이런 숫자 가져오시면 다른 팀 연락 받을게요.",
        "이러시면 시간 낭비예요. 제대로 된 오퍼를 들고 오세요.",
        "지쳐가고 있어요. 좀 더 진지하게 접근해주세요.",
        "이 협상, 의미 있게 진행하고 싶어요. 숫자를 올려주세요.",
    ],
    'OFFER_LOW_hotheaded': [
        "이게 뭔가요! 제대로 협상할 생각이 있으신 거예요?",
        "시간 낭비하지 마세요. 진지한 오퍼를 들고 오세요.",
        "제 인내심을 시험하시는 거예요?",
        "화가 나네요. 이건 협상이라고 볼 수 없어요.",
    ],
    'OFFER_LOW_neutral': [
        "이 금액으로는 어려워요. 더 생각해보세요.",
        "제 기대에 못 미쳐요. 숫자를 올려주세요.",
        "다시 생각해보세요. 이건 너무 낮아요.",
        "조금 더 진지하게 접근해주세요.",
        "이 정도면 합의가 어려워요.",
    ],

    // ── OFFER_INSULT ───────────────────────────────────────────
    'OFFER_INSULT_proud': [
        "제 가치를 그 정도로 보신다고요? 협상 끝났어요.",
        "이 숫자는 모욕이에요. 진심으로 사과해주세요.",
        "제 커리어를 이렇게 평가하신다고요? 말이 안 돼요.",
        "이건 협상이 아니에요. 자리를 뜰게요.",
    ],
    'OFFER_INSULT_hotheaded': [
        "이건 모욕이에요! 다시는 연락하지 마세요.",
        "이 숫자로 절 부르신 거예요?! 황당하네요.",
        "화가 머리끝까지 났어요. 협상 끝이에요.",
        "지금 농담하시는 거예요?!",
    ],
    'OFFER_INSULT_lowMorale': [
        "...그래요, 이 팀이 저를 보는 눈이 그 정도인 거네요.",
        "이미 실망할 만큼 실망했어요. 끝내요.",
        "예상은 했지만, 이 정도일 줄은 몰랐어요.",
        "...알겠어요. 더 이상 시간 낭비하지 말아요.",
    ],
    'OFFER_INSULT_neutral': [
        "이게 진심이세요? 이 숫자로 절 모욕하시는 건가요.",
        "이건 받아들일 수 없어요. 협상을 재고해주세요.",
        "진지하게 대화할 생각이 없으시군요.",
        "이 정도 오퍼는 모욕이나 마찬가지예요.",
        "실망이에요. 이건 협상이 아니에요.",
    ],

    // ── COUNTER ────────────────────────────────────────────────
    'COUNTER_proud': [
        "제 요구 조건이에요. 이 정도는 받아야 해요.",
        "이 숫자가 제 최소예요. 여기서 더 내려갈 수 없어요.",
        "이거 보여드릴게요. 이게 제가 원하는 거예요.",
        "제 카운터예요. 이 기준에서 시작해요.",
    ],
    'COUNTER_money': [
        "시장가를 반영해서 다시 제시할게요. 이 정도는 받아야 해요.",
        "숫자를 다시 보여드릴게요. 이게 공정한 값이에요.",
        "제 요구예요. 이 이상은 깎을 수 없어요.",
        "이게 제 최종 요구예요. 맞춰주실 수 있어요?",
    ],
    'COUNTER_frustrated': [
        "이게 마지막 기회예요. 이 조건 맞춰주세요.",
        "더 이상 기다릴 수 없어요. 이게 제 카운터예요.",
        "시간이 없어요. 이 숫자로 결정해주세요.",
        "인내심이 한계예요. 이 오퍼 받아주세요.",
    ],
    'COUNTER_calm': [
        "조용히 제 요구 조건을 제시할게요. 검토해보세요.",
        "감정 없이 얘기해요. 제 카운터예요.",
        "이 숫자가 합리적이라고 생각해요. 고려해주세요.",
        "제 제안이에요. 냉정하게 판단해보세요.",
    ],
    'COUNTER_neutral': [
        "조금 더 올려주세요. 그러면 계약서에 사인할 수 있어요.",
        "제 요구예요. 이 정도면 합의할 수 있을 것 같아요.",
        "다시 생각해보세요. 이 카운터가 공정하다고 생각해요.",
        "여기서 조금만 더 양보해주세요.",
        "이게 제 조건이에요. 어떻게 생각하세요?",
    ],

    // ── ACCEPT ─────────────────────────────────────────────────
    'ACCEPT_proud': [
        "알겠어요. 제 가치를 인정해주셨군요. 계약하죠.",
        "이 정도면 만족해요. 사인할게요.",
        "좋아요. 제가 원하는 조건이에요. 계약서 가져오세요.",
        "인정해요. 계약할게요.",
    ],
    'ACCEPT_money': [
        "이거예요. 바로 사인할게요.",
        "이 숫자면 충분해요. 계약해요.",
        "마음에 들어요. 바로 결정할게요.",
        "좋아요. 사인할게요.",
    ],
    'ACCEPT_loyal': [
        "이 팀에서 계속 뛸 수 있어서 기뻐요. 사인할게요.",
        "여기가 제 집이에요. 계약해요.",
        "잘됐어요. 이 팀에서 더 좋은 모습 보여드릴게요.",
        "오래 함께할 수 있겠네요. 계약하죠.",
    ],
    'ACCEPT_winFirst': [
        "우승을 향해 함께 달려봐요. 계약할게요.",
        "이 팀에서 타이틀을 딸 수 있을 것 같아요. 사인하죠.",
        "좋아요. 여기서 우승해요. 계약할게요.",
        "챔피언십을 향해 함께 가요. 사인할게요.",
    ],
    'ACCEPT_neutral': [
        "알겠어요. 계약해요.",
        "이 조건이면 사인할게요.",
        "좋아요. 함께해요.",
        "계약서 들고 오세요. 사인할게요.",
        "결정했어요. 계약해요.",
    ],

    // ── REJECT ─────────────────────────────────────────────────
    'REJECT_proud': [
        "제 기대에 미치지 못해요. 다른 팀 얘기를 들어볼게요.",
        "아쉽지만, 이 조건으로는 계약할 수 없어요.",
        "더 좋은 조건을 가져오실 수 있었는데요. 아쉽네요.",
        "제 가치를 인정하지 않는 팀과 계약하기 어려워요.",
    ],
    'REJECT_money': [
        "조건이 맞지 않아요. 다른 팀 보겠어요.",
        "원하는 숫자가 아니에요. 통과할게요.",
        "더 좋은 오퍼가 있어요. 미안해요.",
        "이 금액으로는 사인할 수 없어요.",
    ],
    'REJECT_neutral': [
        "미안하지만, 이 조건으로는 사인하기 어려워요.",
        "다른 쪽을 알아봐야 할 것 같아요.",
        "조건이 맞지 않아요. 아쉽지만 여기서 마무리해요.",
        "원하는 조건이 아니에요. 다른 팀을 고려할게요.",
        "이 협상은 여기서 마무리해야 할 것 같아요.",
    ],

    // ── WALKED_AWAY ────────────────────────────────────────────
    'WALKED_AWAY_proud': [
        "더 이상 이 협상은 의미가 없어요. 끝내겠어요.",
        "저를 이렇게 대우하는 팀과는 계약할 수 없어요.",
        "이 팀이 제 가치를 모르시는군요. 다른 길을 찾겠어요.",
        "자존심이 허락하지 않아요. 협상 끝이에요.",
    ],
    'WALKED_AWAY_hotheaded': [
        "이제 지쳤어요! 협상 끝이에요!",
        "더 이상 못 참겠어요. 나가겠어요.",
        "이건 제 자존심 문제예요. 끝내겠어요.",
        "화가 너무 나요. 더 얘기 안 할게요.",
    ],
    'WALKED_AWAY_calm': [
        "더 이상 진전이 없겠군요. 협상을 종료할게요.",
        "이성적으로 판단했어요. 계속할 이유가 없어요.",
        "이만 마쳐요. 다른 방향을 찾겠어요.",
        "냉정하게 판단했어요. 여기서 끝내는 게 맞아요.",
    ],
    'WALKED_AWAY_neutral': [
        "더 이상 이 팀과 협상하지 않겠어요.",
        "이 협상은 여기서 끝이에요.",
        "시간을 더 낭비하고 싶지 않아요. 가겠어요.",
        "더 기다릴 수 없어요. 다른 선택을 하겠어요.",
        "협상이 결렬됐어요. 유감이에요.",
    ],

    // ── EXT_NOT_YET ────────────────────────────────────────────
    'EXT_NOT_YET_proud': [
        "계약이 아직 남아있는데요. 지금 그 얘기를 꺼내시는 거예요?",
        "제 계약 기간은 아직 유효해요. 때가 되면 다시 얘기해요.",
        "지금은 연장 얘기 할 타이밍이 아니에요. 계약대로 뛸게요.",
        "잔여 계약이 있어요. 지금 연장을 논의하는 건 이르죠.",
    ],
    'EXT_NOT_YET_money': [
        "지금은 연장 생각 없어요. 시장 상황을 좀 더 보고 싶어요.",
        "FA가 되면 시장가를 제대로 받을 수 있어요. 지금은 아니에요.",
        "아직 계약 기간이 남았어요. 나중에 얘기해요.",
        "지금 연장 사인을 하는 건 제 이득이 아닌 것 같아요.",
    ],
    'EXT_NOT_YET_loyal': [
        "이 팀을 떠나고 싶은 마음은 없어요. 근데 지금은 아직 때가 아니에요.",
        "계약 기간이 남아있어요. 그때 가서 제대로 얘기해봐요.",
        "여기서 계속 뛰고 싶긴 한데, 지금 연장 사인은 좀 이른 것 같아요.",
        "아직 남은 계약이 있어요. 좀 더 기다렸다가 얘기해요.",
    ],
    'EXT_NOT_YET_winFirst': [
        "지금은 우승에 집중하고 싶어요. 계약 얘기는 나중에 해요.",
        "시즌이 남았어요. 계약보다 플레이에 집중하고 싶어요.",
        "연장보다 지금은 팀 성적이 중요해요. 때 되면 얘기하죠.",
        "계약 기간이 있는데 지금 당장 그 얘기는 아닌 것 같아요.",
    ],
    'EXT_NOT_YET_hotheaded': [
        "계약 기간이 남아있는데 벌써 연장 얘기를 꺼내는 거예요?",
        "지금 이 타이밍에 연장 얘기요? 이르다고 생각하지 않으세요?",
        "아직 계약 중이에요! 지금은 그 얘기 하고 싶지 않아요.",
        "지금 당장은 연장 생각이 없어요. 나중에 연락해요.",
    ],
    'EXT_NOT_YET_neutral': [
        "아직 계약 기간이 남아있어요. 지금은 얘기할 때가 아닌 것 같아요.",
        "계약이 남아있는데 지금 당장 연장 얘기는 좀 이른 것 같아요.",
        "지금 당장 연장은 생각 없어요. 계약대로 뛸 거예요.",
        "아직 시즌이 남았어요. 연장 얘기는 나중에 하죠.",
        "솔직히 말하면 지금은 그 얘기 하고 싶지 않아요.",
    ],

    // ── RELEASE_PROPOSE ────────────────────────────────────────
    'RELEASE_PROPOSE_proud': [
        "이렇게 보내시는 건가요. 아직 드릴 게 많은데요.",
        "저를 방출하신다고요? 이 팀을 위해 얼마나 희생했는데요.",
        "...제 커리어가 여기서 끝나는 건 아니에요. 조건이나 봐요.",
        "예상했지만 실망스럽네요. 그래도 조건은 제대로 받아야겠어요.",
    ],
    'RELEASE_PROPOSE_hotheaded': [
        "방출이요?! 제가 이 팀에 얼마나 헌신했는데요!",
        "믿기지 않아요. 이렇게 끝나는 건가요.",
        "화가 나요. 근데 어쩌겠어요. 숫자나 얘기해봐요.",
        "이게 뭔가요. 제 희생을 이렇게 보상해주시는 거예요?",
    ],
    'RELEASE_PROPOSE_calm': [
        "예상은 했어요. 조건이나 얘기해봐요.",
        "그래요. 다음 단계를 생각해야죠.",
        "알겠어요. 어떤 조건인지 들어볼게요.",
        "비즈니스는 비즈니스죠. 딜을 마무리해요.",
    ],
    'RELEASE_PROPOSE_neutral': [
        "...예상은 했어요. 조건이나 얘기해봐요.",
        "이 팀이 저한테 해줄 수 있는 건 여기까지인 거네요.",
        "그래요. 어쩌겠어요. 좋은 조건으로 마무리해요.",
        "아직 커리어가 남아 있어요. 다음을 생각해봐요.",
        "솔직히 충격이에요. 근데 우선 조건 얘기를 해봐요.",
    ],

    // ── RELEASE_BUYOUT_OK ──────────────────────────────────────
    'RELEASE_BUYOUT_OK': [
        "알겠어요. 이 조건으로 마무리해요.",
        "공정한 바이아웃이에요. 받아들이겠어요.",
        "이 정도면 납득할 수 있어요. 사인해요.",
        "고마워요. 좋은 기억만 가져가겠어요.",
        "좋아요. 새로운 시작을 할게요.",
    ],

    // ── RELEASE_BUYOUT_NO ──────────────────────────────────────
    'RELEASE_BUYOUT_NO_proud': [
        "이 금액은 제 가치에 비해 너무 낮아요. 다시 생각해보세요.",
        "제 남은 계약 가치를 이렇게 평가하시는 거예요?",
        "더 공정한 조건을 들고 오세요.",
        "이건 받아들이기 어려워요.",
    ],
    'RELEASE_BUYOUT_NO_neutral': [
        "이 금액으로는 바이아웃에 동의할 수 없어요.",
        "더 나은 조건을 제시해주세요.",
        "공정하지 않아요. 다시 생각해보세요.",
        "이 바이아웃은 거절할게요.",
        "조건이 맞지 않아요. 더 올려주세요.",
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

        case 'EXT_NOT_YET': {
            if (isHotheaded(t)) return POOLS['EXT_NOT_YET_hotheaded']!;
            if (isProud(t))     return POOLS['EXT_NOT_YET_proud']!;
            if (isMoney(t))     return POOLS['EXT_NOT_YET_money']!;
            if (isLoyal(t))     return POOLS['EXT_NOT_YET_loyal']!;
            if (isWinFirst(t))  return POOLS['EXT_NOT_YET_winFirst']!;
            return POOLS['EXT_NOT_YET_neutral']!;
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
/**
 * 인사 대화의 subText용 — 요구 조건을 자연어로 다양하게 표현.
 * salary는 달러 전체 금액, years는 정수.
 */
export function generateDemandSubText(
    type: 'fa' | 'extension',
    salary: number,
    years: number,
    seed: string,
): string {
    const m = salary / 1_000_000;
    const s = `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
    const y = years;

    const faPool: string[] = [
        `${y}년 계약에 연 ${s} 정도를 기대하고 있어요.`,
        `${s}에 ${y}년이면 진지하게 생각해볼 수 있어요.`,
        `연봉은 연 ${s}, 기간은 ${y}년이 적당할 것 같아요.`,
        `${y}년 동안 매 시즌 ${s}는 받아야 할 것 같아요.`,
        `시장을 보면 ${y}년에 연 ${s} 정도는 받아야 하지 않을까요?`,
        `저의 기대치는 ${y}년, 연 ${s} 수준이에요.`,
        `최소 ${y}년에 연 ${s} 조건이어야 진지하게 고려할 수 있어요.`,
        `${s}짜리 ${y}년 계약, 그 정도면 협상해볼 만해요.`,
        `${y}년 계약에 연 ${s}, 그게 제 기준이에요.`,
    ];

    const extPool: string[] = [
        `${y}년 연장 계약에 연 ${s} 조건을 생각하고 있어요.`,
        `${y}년 더, 매 시즌 ${s}면 좋겠어요.`,
        `연장 조건은 ${y}년에 연 ${s} 정도예요.`,
        `${s}에 ${y}년 연장이면 바로 사인할게요.`,
        `연 ${s}, ${y}년 연장 조건이 제 기대치예요.`,
        `이 팀에서 ${y}년 더 뛰고 싶어요. 연 ${s} 정도면 어때요?`,
        `재계약이라면 ${y}년에 연 ${s} 조건으로 얘기해봐요.`,
        `${y}년, 연 ${s}짜리 딜이면 남겠어요.`,
        `연 ${s}에 ${y}년 계약이 제 최소 조건이에요.`,
    ];

    const pool = type === 'fa' ? faPool : extPool;
    const hash = stringToHash(seed + type + String(years));
    const r    = seededRandom(hash);
    return pool[Math.floor(r * pool.length)];
}

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
