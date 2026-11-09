
import { APP_FULL_NAME, APP_NAME } from './constants';

// 법적 고지 문서 — 홈 푸터(About / Terms of Use / Privacy → pages/LegalPage.tsx)와 싱글 사이드바 LegalModal 이 공용.
// [2026-11-09] 전면 개정: 운영 실태(이메일 로그인·Supabase 저장·리그 채팅·BP 재화·상점)에 맞추고
// docs/plan/monetization-legal-strategy.md Phase 1.2(선수 성명 식별 목적 사용·비제휴·삭제 요청 절차)를 반영.
// 운영자명·연락처는 아래 상수만 채우면 전 문서에 반영된다.

/** 운영자(개인/사업자) 표기 — 확정 전 임시 */
export const LEGAL_OPERATOR_NAME = `${APP_NAME} 운영자`;
/** 문의·개인정보·삭제 요청 수신 이메일 — 확정 전 임시. 실제 주소가 정해지면 KO/EN 둘 다 같은 주소로 */
export const LEGAL_CONTACT_EMAIL = '(이메일 추후 안내)';
export const LEGAL_CONTACT_EMAIL_EN = '(email to be announced)';
export const LEGAL_OPERATOR_NAME_EN = `${APP_NAME} Operator`;
/** 문서 시행일 — 본문 변경 시 함께 갱신 */
export const LEGAL_LAST_UPDATED = '2026-11-09';

export const ABOUT_TITLE = "서비스 소개";
export const TERMS_OF_SERVICE_TITLE = "서비스 이용약관";
export const PRIVACY_POLICY_TITLE = "개인정보 처리방침";
export const UPDATE_NOTES_TITLE = "업데이트 노트";

export const ABOUT_CONTENT = `
${APP_FULL_NAME}은 농구 구단의 프런트 오피스(단장) 의사결정을 체험하는 시뮬레이션 플랫폼입니다. 이용자는 한 구단의 단장이 되어 로스터 구성, 드래프트, 트레이드, 자유계약(FA) 영입, 전술과 로테이션 설정을 결정하고, 시뮬레이션 엔진이 그 결정에 따라 시즌 전체의 경기 결과·기록·순위를 산출합니다.

1. 주요 기능
   - 온라인 리그: 여러 이용자가 각자 한 구단을 맡아 같은 리그에서 한 시즌을 진행합니다. 경기는 정해진 일정에 서버가 자동으로 시뮬레이션하며, 이용자가 동시에 접속해 있을 필요는 없습니다.
   - 팀 빌딩 드래프트, 트레이드(선수·드래프트 지명권), 자유계약 시장, 샐러리 캡 규칙에 따른 계약 관리
   - 전술·로테이션 설정과 경기 시뮬레이션 로그(플레이 단위 기록), 박스스코어, 시즌 통계, 수상, 플레이오프
   - 리그 채팅, 리그 소식, 통산 기록, BP(Basketball Points) 포인트와 코스메틱 상점

2. 데이터에 관하여
   - 선수·코치·단장 정보는 공개된 경기 기록과 운영자의 자체 평가를 바탕으로 작성된 능력치·성향 데이터입니다. 능력치는 운영자의 창작물이며 어떠한 단체의 공식 평가도 아닙니다.
   - 시뮬레이션 결과는 확률 모델에 따른 가상의 결과이며, 실제 경기·선수·구단의 성적을 예측하거나 대표하지 않습니다.

3. 비제휴 고지
${APP_NAME}은 National Basketball Association(NBA), National Basketball Players Association(NBPA), 소속 구단, 개별 선수 또는 그 관계사와 어떠한 제휴·후원·보증 관계도 없습니다. 선수와 구단의 명칭은 공인의 공지된 정보를 식별 목적으로만 사용하며, 모든 상표는 각 권리자의 소유입니다.

4. 운영 현황
현재 베타 서비스로 운영 중이며, 기능과 데이터는 예고 없이 추가·변경될 수 있습니다. 변경 내역은 서비스 내 패치 노트에서 확인할 수 있습니다.

5. 문의
서비스 이용, 데이터 정정, 제휴·권리 관련 문의: ${LEGAL_CONTACT_EMAIL}
`;

export const TERMS_OF_SERVICE_CONTENT = `
시행일: ${LEGAL_LAST_UPDATED}

제1조 (목적)
본 약관은 ${LEGAL_OPERATOR_NAME}(이하 "운영자")이 제공하는 ${APP_FULL_NAME}(이하 "서비스")의 이용 조건과 절차, 이용자와 운영자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.

제2조 (용어의 정의)
1. "서비스"란 단말기 종류와 관계없이 이용자가 접속해 이용할 수 있는 ${APP_NAME}의 웹 서비스 일체를 말합니다.
2. "이용자"란 본 약관에 따라 서비스를 이용하는 회원과 비회원을 말합니다.
3. "회원"이란 이메일 주소로 계정을 생성하고 본 약관에 동의한 이용자를 말합니다.
4. "리그"란 복수의 회원이 참가해 한 시즌을 함께 진행하는 시뮬레이션 단위를 말합니다.
5. "BP"란 서비스 내 활동으로 지급되는 포인트로, 서비스 내 코스메틱 상품 교환에만 사용되는 가상의 수단을 말합니다.

제3조 (약관의 효력과 변경)
1. 본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.
2. 운영자는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행일과 변경 내용을 시행일 7일 전부터 서비스 내에 공지합니다. 이용자에게 불리한 변경은 30일 전에 공지합니다.
3. 변경된 약관의 시행일 이후에도 서비스를 계속 이용하면 변경에 동의한 것으로 봅니다. 동의하지 않는 이용자는 이용을 중단하고 계정 삭제를 요청할 수 있습니다.

제4조 (서비스의 성격)
1. 서비스는 농구 구단 운영 의사결정을 시뮬레이션하고 그 결과를 통계·기록 형태로 제공하는 정보 제공 및 분석 목적의 플랫폼입니다.
2. 시뮬레이션 결과는 확률 모델에 따른 가상의 산출물이며, 실제 경기나 선수의 성적을 예측·보증하지 않습니다.
3. 서비스는 현금 보상, 환전, 확률형 아이템을 제공하지 않습니다.

제5조 (회원 가입과 계정)
1. 회원 가입은 이메일 주소와 비밀번호를 등록하고 본 약관과 개인정보 처리방침에 동의함으로써 완료됩니다.
2. 회원은 계정 정보를 정확하게 유지해야 하며, 계정을 타인에게 양도·대여할 수 없습니다.
3. 계정 관리 소홀로 발생한 불이익은 회원 본인이 부담합니다. 단, 운영자의 고의 또는 과실로 인한 경우는 예외로 합니다.
4. 회원은 언제든 ${LEGAL_CONTACT_EMAIL}로 계정 삭제를 요청할 수 있으며, 운영자는 요청 접수 후 지체 없이 처리합니다.

제6조 (서비스의 제공과 변경·중단)
1. 서비스는 연중무휴 제공을 원칙으로 하되, 다음의 경우 전부 또는 일부가 중단될 수 있습니다.
   - 시스템 점검, 교체, 고장 또는 통신 장애
   - 외부 호스팅·데이터베이스 사업자의 장애
   - 그 밖에 운영상 상당한 이유가 있는 경우
2. 운영자는 서비스의 내용(기능, 선수 데이터, 시뮬레이션 규칙, 리그 일정 등)을 운영상·기술상 필요에 따라 변경할 수 있으며, 중요한 변경은 서비스 내 패치 노트로 안내합니다.
3. 서비스는 베타로 운영되며, 운영자는 리그 진행 데이터의 영구 보존을 보증하지 않습니다.

제7조 (리그 운영 규칙)
1. 리그의 일정, 진행 방식, 규칙은 리그 설정과 서비스 공지에 따릅니다.
2. 리그 관리자는 원활한 진행을 위해 참가자 승인, 강제 퇴장, 일정 조정 등의 조치를 할 수 있습니다.
3. 운영자는 시뮬레이션 오류, 데이터 오류 또는 부정 이용이 확인된 경우 경기 결과, 거래, 기록을 정정하거나 무효로 할 수 있습니다.

제8조 (BP와 상점)
1. BP는 서비스 내 활동(경기 진행, 업적 달성 등)에 대해 운영자가 정한 기준으로 지급됩니다.
2. BP는 현금으로 구매할 수 없고, 현금·재화로 환전할 수 없으며, 타인에게 양도할 수 없습니다.
3. BP로 교환한 코스메틱 상품은 외형 변경 용도이며 시뮬레이션 결과에 영향을 주지 않습니다.
4. 운영자는 부정한 방법으로 취득한 BP와 상품을 회수할 수 있습니다.
5. 운영자는 BP 제도의 운영 기준을 변경하거나 종료할 수 있으며, 이 경우 사전에 공지합니다.

제9조 (이용자의 의무)
이용자는 다음 행위를 해서는 안 됩니다.
   - 타인의 계정·정보를 도용하거나 허위 정보를 등록하는 행위
   - 자동화 도구, 비정상적 요청, 취약점 악용 등으로 서비스의 데이터나 운영을 조작·방해하는 행위
   - 복수 계정을 이용해 같은 리그의 결과나 거래를 조작하는 행위
   - 리그 채팅 등에서 타인을 비방·모욕·차별하거나, 음란·폭력적·불법적인 내용을 게시하는 행위
   - 운영자나 제3자의 지식재산권, 초상권, 명예 등 권리를 침해하는 행위
   - 서비스의 코드, 데이터, 콘텐츠를 무단으로 복제·배포·역설계하거나 상업적으로 이용하는 행위
   - 그 밖에 관련 법령 또는 본 약관에 위반되는 행위

제10조 (이용 제한)
1. 운영자는 이용자가 제9조를 위반한 경우 경고, 채팅 제한, 리그 참가 제한, 계정 정지 또는 삭제 등의 조치를 할 수 있습니다.
2. 운영자는 조치의 사유와 내용을 해당 이용자에게 통지하며, 이용자는 ${LEGAL_CONTACT_EMAIL}로 이의를 제기할 수 있습니다.

제11조 (이용자 게시물)
1. 이용자가 서비스에 게시한 내용(채팅, 닉네임, 팀 설정 등)의 책임은 이용자에게 있습니다.
2. 운영자는 법령 또는 본 약관에 위반되는 게시물을 사전 통지 없이 삭제하거나 비공개할 수 있습니다.
3. 이용자는 게시물을 서비스 운영·개선 목적으로 저장·표시하는 데 필요한 범위에서 운영자에게 비독점적 사용을 허락합니다.

제12조 (지식재산권과 제3자 권리)
1. 서비스의 소프트웨어, 디자인, 시뮬레이션 엔진, 운영자가 작성한 선수 능력치·성향 데이터 등은 운영자의 저작물입니다.
2. 서비스는 NBA, NBPA, 소속 구단, 개별 선수 또는 그 관계사와 제휴·후원·보증 관계가 없습니다. 선수와 구단의 명칭은 공인의 공지된 정보를 식별 목적으로만 사용하며, 모든 상표는 각 권리자의 소유입니다.
3. 선수 본인 또는 정당한 대리인은 ${LEGAL_CONTACT_EMAIL}로 성명·정보의 수정 또는 삭제를 요청할 수 있으며, 운영자는 권리 확인 후 지체 없이 조치합니다.
4. 이용자가 업로드하거나 수정한 데이터(커스텀 로스터 등)로 인해 발생하는 법적 문제의 책임은 해당 이용자에게 있습니다.

제13조 (책임의 제한)
1. 운영자는 천재지변, 외부 사업자의 장애 등 불가항력으로 서비스를 제공할 수 없는 경우 책임을 지지 않습니다.
2. 운영자는 이용자의 귀책사유로 인한 이용 장애, 이용자 간 또는 이용자와 제3자 간의 분쟁에 대해 책임을 지지 않습니다.
3. 운영자는 시뮬레이션 결과, 통계, 기록의 정확성·완전성을 보증하지 않으며, 이용자가 이를 신뢰해 내린 판단에 대해 책임을 지지 않습니다.
4. 서비스는 무료로 제공되며, 운영자의 고의 또는 중대한 과실이 없는 한 서비스 이용과 관련해 발생한 손해에 대해 책임을 지지 않습니다.

제14조 (준거법과 분쟁 해결)
1. 본 약관의 해석과 서비스 이용에 관한 분쟁에는 대한민국 법률을 적용합니다.
2. 분쟁이 발생한 경우 운영자와 이용자는 성실히 협의해 해결하며, 협의가 이루어지지 않을 경우 민사소송법에 따른 관할 법원에 제소할 수 있습니다.

부칙
본 약관은 ${LEGAL_LAST_UPDATED}부터 시행합니다.
`;

export const PRIVACY_POLICY_CONTENT = `
시행일: ${LEGAL_LAST_UPDATED}

${LEGAL_OPERATOR_NAME}(이하 "운영자")은 ${APP_FULL_NAME}(이하 "서비스") 이용자의 개인정보를 「개인정보 보호법」 등 관련 법령에 따라 보호하며, 다음과 같이 처리합니다.

1. 처리하는 개인정보의 항목
   - 회원 가입 시(필수): 이메일 주소, 비밀번호(암호화 저장)
   - 프로필 설정 시(선택): 닉네임, 프로필 색상
   - 서비스 이용 과정에서 생성·저장되는 정보: 참가 리그와 팀, 전술·로테이션 설정, 거래·계약 내역, 시뮬레이션 결과와 기록, BP 지급·사용 내역, 보유 상품, 리그 채팅 메시지, 접속 일시
   - 자동 수집 항목: IP 주소, 브라우저·기기 정보, 서비스 이용 기록(페이지 성능 측정 포함)

2. 개인정보의 처리 목적
   - 회원 식별, 로그인, 계정 관리
   - 리그 참가·진행, 시뮬레이션 결과 저장과 표시, 통산 기록 제공
   - BP 지급·정산, 상점 구매 처리
   - 리그 채팅과 알림 제공, 부정 이용 방지, 민원 처리
   - 서비스 안정성·성능 개선(오류 분석, 페이지 성능 측정)

3. 개인정보의 보유 및 이용 기간
   - 회원 정보: 계정 삭제 요청 시까지. 삭제 요청 후 30일간 보관(부정 이용 방지, 복구 요청 대응)한 뒤 파기합니다.
   - 리그 기록·통산 기록: 리그 결과의 일관성을 위해 계정 삭제 후에도 닉네임을 익명 처리한 상태로 보존될 수 있습니다.
   - 관련 법령에 따라 보존이 필요한 정보는 해당 법령이 정한 기간 동안 보관합니다.

4. 개인정보의 제3자 제공
운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 다음의 경우는 예외로 합니다.
   - 이용자가 사전에 동의한 경우
   - 법령에 근거하거나 수사기관이 법령에 정한 절차에 따라 요구하는 경우

5. 개인정보 처리의 위탁 및 국외 이전
서비스 운영을 위해 다음 사업자의 인프라를 이용하며, 이 과정에서 개인정보가 해당 사업자의 서버에 저장·처리됩니다. 서버가 국외에 위치할 수 있습니다.
   - Supabase Inc.: 회원 인증, 데이터베이스 저장
   - Vercel Inc.: 웹 호스팅, 페이지 성능 측정
   - Fly.io: 시뮬레이션 서버 운영

6. 서비스 내 공개되는 정보
닉네임, 프로필 색상, 참가 팀, 전적·기록, 리그 채팅 메시지는 같은 리그의 다른 참가자(설정에 따라 관전자)에게 표시됩니다. 이메일 주소는 다른 이용자에게 공개되지 않습니다.

7. 이용자의 권리
이용자는 언제든 자신의 개인정보에 대해 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 닉네임·프로필 색상은 서비스 내 설정에서 직접 변경할 수 있으며, 그 밖의 요청은 아래 연락처로 접수하면 지체 없이 처리합니다.

8. 쿠키와 로컬 저장소
서비스는 로그인 상태 유지와 화면 설정 기억을 위해 브라우저의 쿠키와 로컬 저장소를 사용합니다. 이용자는 브라우저 설정으로 이를 거부할 수 있으나, 이 경우 로그인 등 일부 기능이 제한될 수 있습니다.

9. 개인정보의 안전성 확보 조치
   - 비밀번호 암호화 저장, 전송 구간 암호화(HTTPS)
   - 데이터베이스 접근 권한 통제(행 단위 접근 제어), 관리자 권한 최소화
   - 접근 기록 보관

10. 개인정보 보호책임자 및 문의
   - 책임자: ${LEGAL_OPERATOR_NAME}
   - 이메일: ${LEGAL_CONTACT_EMAIL}
개인정보 침해에 대한 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 118), 개인정보분쟁조정위원회(kopico.go.kr, 1833-6972)에 문의할 수 있습니다.

11. 처리방침의 변경
본 방침의 내용이 추가·삭제·수정되는 경우 시행일 7일 전부터 서비스 내에 공지합니다.
`;

// ── English versions (홈 법적 문서 패널 KOR/EN 토글용, 2026-11-09) ─────────────────────────────
// 구조 규칙은 한국어와 동일: 빈 줄 = 블록, 블록 첫 줄 "Article N (…)" / "N. Title" / "Addendum" = 소제목,
// 블록 안 "N. …" = 항, "- …" = 호, 단독 "Effective date: …" 블록 = 메타. 내용은 한국어 원문의 번역이며 한국어본이 우선한다.

export const ABOUT_TITLE_EN = "About";
export const TERMS_OF_SERVICE_TITLE_EN = "Terms of Service";
export const PRIVACY_POLICY_TITLE_EN = "Privacy Policy";

export const ABOUT_CONTENT_EN = `
${APP_FULL_NAME} is a simulation platform for experiencing the decision-making of a basketball front office. You act as the general manager of one franchise — building the roster, drafting, trading, signing free agents, and setting tactics and rotations — while the simulation engine produces the results, statistics and standings of an entire season based on those decisions.

1. Key features
   - Online leagues: multiple users each run a franchise in the same league through a full season. Games are simulated automatically by the server on a fixed schedule; users do not need to be online at the same time.
   - Team-building draft, trades (players and draft picks), free-agent market, and contract management under salary-cap rules
   - Tactics and rotation settings, play-by-play simulation logs, box scores, season statistics, awards and playoffs
   - League chat, league news, career records, BP (Basketball Points) and a cosmetic shop

2. About the data
   - Player, coach and GM information consists of ratings and tendency data written from publicly available game records and the operator's own evaluation. Ratings are the operator's original work and are not an official assessment by any organization.
   - Simulation results are fictional outcomes produced by a probabilistic model. They do not predict or represent the performance of any real game, player or team.

3. Non-affiliation notice
${APP_NAME} is not affiliated with, sponsored by or endorsed by the National Basketball Association (NBA), the National Basketball Players Association (NBPA), any team, any individual player or any of their affiliates. Player and team names are used solely to identify public figures by their publicly known information. All trademarks are the property of their respective owners.

4. Service status
The service is currently in beta. Features and data may be added or changed without notice. Changes are listed in the in-app patch notes.

5. Contact
Questions about the service, data corrections, partnership or rights inquiries: ${LEGAL_CONTACT_EMAIL_EN}
`;

export const TERMS_OF_SERVICE_CONTENT_EN = `
Effective date: ${LEGAL_LAST_UPDATED}

Article 1 (Purpose)
These Terms set out the conditions and procedures for using ${APP_FULL_NAME} (the "Service") provided by ${LEGAL_OPERATOR_NAME_EN} (the "Operator"), and the rights, obligations and responsibilities of users and the Operator.

Article 2 (Definitions)
1. "Service" means all web services of ${APP_NAME} that users can access regardless of device.
2. "User" means any member or non-member who uses the Service under these Terms.
3. "Member" means a user who has created an account with an email address and agreed to these Terms.
4. "League" means a simulation unit in which multiple members participate together through one season.
5. "BP" means points granted for activity within the Service; it is a virtual medium used only to redeem cosmetic items within the Service.

Article 3 (Effect and amendment of the Terms)
1. These Terms take effect upon being posted within the Service.
2. The Operator may amend these Terms to the extent permitted by applicable law. Amendments, together with their effective date, are announced within the Service at least 7 days before they take effect, or at least 30 days before for amendments unfavorable to users.
3. Continued use of the Service after the effective date constitutes acceptance of the amended Terms. A user who does not agree may stop using the Service and request account deletion.

Article 4 (Nature of the Service)
1. The Service is an information and analysis platform that simulates basketball franchise management decisions and presents the results as statistics and records.
2. Simulation results are fictional outputs of a probabilistic model and do not predict or guarantee the performance of any real game or player.
3. The Service does not offer cash rewards, cash-out, or chance-based (loot-box) items.

Article 5 (Registration and accounts)
1. Registration is completed by registering an email address and password and agreeing to these Terms and the Privacy Policy.
2. Members must keep their account information accurate and may not transfer or lend their account to others.
3. Members bear any disadvantage arising from negligent account management, except where caused by the Operator's intent or negligence.
4. Members may request account deletion at any time at ${LEGAL_CONTACT_EMAIL_EN}, and the Operator will process the request without undue delay.

Article 6 (Provision, change and suspension of the Service)
1. The Service is in principle provided year-round, but may be suspended in whole or in part in the following cases:
   - System inspection, replacement, failure or communication outage
   - Outage of an external hosting or database provider
   - Other cases where there is a reasonable operational cause
2. The Operator may change the contents of the Service (features, player data, simulation rules, league schedules, etc.) for operational or technical reasons; material changes are announced in the in-app patch notes.
3. The Service is operated as a beta, and the Operator does not guarantee permanent preservation of league progress data.

Article 7 (League operation rules)
1. League schedules, procedures and rules follow the league settings and Service announcements.
2. League administrators may take measures such as approving participants, removing participants and adjusting schedules for smooth operation.
3. Where a simulation error, data error or abuse is confirmed, the Operator may correct or void game results, transactions and records.

Article 8 (BP and the shop)
1. BP is granted for activity within the Service (playing games, achievements, etc.) according to criteria set by the Operator.
2. BP cannot be purchased with money, cannot be exchanged for money or goods, and cannot be transferred to others.
3. Cosmetic items redeemed with BP change appearance only and do not affect simulation results.
4. The Operator may reclaim BP and items obtained by improper means.
5. The Operator may change the rules of the BP program or discontinue it, with prior notice.

Article 9 (User obligations)
Users must not:
   - Misappropriate another person's account or information, or register false information
   - Manipulate or disrupt the Service's data or operation through automation tools, abnormal requests or exploitation of vulnerabilities
   - Use multiple accounts to manipulate results or transactions within the same league
   - Defame, insult or discriminate against others, or post obscene, violent or unlawful content in league chat or elsewhere
   - Infringe the intellectual property, publicity, reputation or other rights of the Operator or third parties
   - Copy, distribute, reverse-engineer or commercially exploit the Service's code, data or content without authorization
   - Otherwise violate applicable law or these Terms

Article 10 (Restrictions on use)
1. If a user violates Article 9, the Operator may issue a warning, restrict chat, restrict league participation, or suspend or delete the account.
2. The Operator notifies the user of the reason and content of the measure, and the user may object at ${LEGAL_CONTACT_EMAIL_EN}.

Article 11 (User content)
1. Users are responsible for content they post in the Service (chat, nicknames, team settings, etc.).
2. The Operator may delete or hide content that violates applicable law or these Terms without prior notice.
3. Users grant the Operator a non-exclusive license to store and display their content to the extent necessary to operate and improve the Service.

Article 12 (Intellectual property and third-party rights)
1. The Service's software, design, simulation engine and the player ratings and tendency data authored by the Operator are the Operator's copyrighted works.
2. The Service is not affiliated with, sponsored by or endorsed by the NBA, the NBPA, any team, any individual player or any of their affiliates. Player and team names are used solely to identify public figures by their publicly known information, and all trademarks are the property of their respective owners.
3. A player or their authorized representative may request correction or removal of their name or information at ${LEGAL_CONTACT_EMAIL_EN}; the Operator will act without undue delay after verifying the right.
4. Users are responsible for any legal issues arising from data they upload or modify (custom rosters, etc.).

Article 13 (Limitation of liability)
1. The Operator is not liable where it cannot provide the Service due to force majeure, including natural disasters and outages of external providers.
2. The Operator is not liable for service disruptions caused by the user, or for disputes between users or between a user and a third party.
3. The Operator does not guarantee the accuracy or completeness of simulation results, statistics or records, and is not liable for decisions users make in reliance on them.
4. The Service is provided free of charge. Except in cases of the Operator's intent or gross negligence, the Operator is not liable for damages arising from use of the Service.

Article 14 (Governing law and dispute resolution)
1. The laws of the Republic of Korea govern the interpretation of these Terms and any dispute concerning use of the Service.
2. The Operator and users shall first seek to resolve disputes in good faith; failing that, either party may bring an action before the court having jurisdiction under the Korean Civil Procedure Act.

Addendum
These Terms take effect on ${LEGAL_LAST_UPDATED}. The Korean version prevails in the event of any discrepancy with this translation.
`;

export const PRIVACY_POLICY_CONTENT_EN = `
Effective date: ${LEGAL_LAST_UPDATED}

${LEGAL_OPERATOR_NAME_EN} (the "Operator") protects the personal information of users of ${APP_FULL_NAME} (the "Service") in accordance with the Personal Information Protection Act of the Republic of Korea and other applicable laws, and processes it as follows.

1. Personal information we process
   - At registration (required): email address, password (stored encrypted)
   - Profile settings (optional): nickname, profile color
   - Generated and stored while using the Service: leagues and teams joined, tactics and rotation settings, transaction and contract history, simulation results and records, BP grant and spending history, owned items, league chat messages, access timestamps
   - Collected automatically: IP address, browser and device information, usage records (including page performance measurement)

2. Purposes of processing
   - Identifying members, login and account management
   - League participation and progress, storing and displaying simulation results, providing career records
   - Granting and settling BP, processing shop purchases
   - Providing league chat and notifications, preventing abuse, handling inquiries
   - Improving stability and performance of the Service (error analysis, page performance measurement)

3. Retention period
   - Member information: until an account deletion request. After the request, data is retained for 30 days (to prevent abuse and handle restoration requests) and then destroyed.
   - League and career records: to keep league results consistent, they may be retained with the nickname anonymized even after account deletion.
   - Information that must be retained under applicable law is kept for the period prescribed by that law.

4. Provision to third parties
The Operator does not provide users' personal information to third parties, except in the following cases:
   - Where the user has given prior consent
   - Where required by law, or requested by an investigative agency following the procedures prescribed by law

5. Processing by service providers and cross-border transfer
The Service relies on the infrastructure of the following providers, and personal information is stored and processed on their servers, which may be located outside Korea.
   - Supabase Inc.: member authentication, database storage
   - Vercel Inc.: web hosting, page performance measurement
   - Fly.io: simulation server operation

6. Information visible within the Service
Nickname, profile color, team, record and league chat messages are visible to other participants in the same league (and to spectators, depending on settings). Email addresses are never shown to other users.

7. Your rights
You may at any time request access to, correction or deletion of, or suspension of processing of your personal information. Nickname and profile color can be changed directly in the Service settings; other requests sent to the contact below are handled without undue delay.

8. Cookies and local storage
The Service uses browser cookies and local storage to keep you signed in and remember display settings. You may refuse them in your browser settings, but some features such as login may then be limited.

9. Security measures
   - Encrypted password storage, encryption in transit (HTTPS)
   - Database access control (row-level access control), minimized administrator privileges
   - Retention of access logs

10. Privacy officer and contact
   - Officer: ${LEGAL_OPERATOR_NAME_EN}
   - Email: ${LEGAL_CONTACT_EMAIL_EN}
For reports or consultation regarding privacy infringement, you may also contact the Korea Personal Information Infringement Report Center (privacy.kisa.or.kr, 118) or the Personal Information Dispute Mediation Committee (kopico.go.kr, 1833-6972).

11. Changes to this policy
Additions, deletions or amendments to this policy are announced within the Service at least 7 days before they take effect. The Korean version prevails in the event of any discrepancy with this translation.
`;

export const UPDATE_NOTES_CONTENT = `
[v1.0.7] - 2025.02.27 (Current)
- 파울(Foul) 시스템 및 퇴장 로직 구현
  * 수비자/공격자의 능력치, 매치업 상성, 팀 전술(수비 강도 등)에 따라 파울 발생 확률이 동적으로 계산됩니다.
  * 경기 중 6반칙 퇴장 시 해당 선수는 즉시 교체되며, 남은 시간 동안 출전할 수 없습니다.
- 스탯 UI 업데이트: '파울(PF)' 항목 추가
  * 경기 박스스코어, 시즌 기록, 선수 상세 정보에 파울 스탯이 표기됩니다.
- 시뮬레이션 엔진 최적화
  * 플레이오프 대진표 자동 생성 및 라운드 진행 로직 안정화
  * 저장된 게임 로드 시 세부 슈팅 스탯(구역별 성공률) 및 파울 스탯이 누락되던 버그 수정

[v1.0.6] - 2025.02.26
- 라이브 스코어 티커(Live Score Ticker) 엔진 2.0 적용
  * 기존: 날짜 변경 직후(자정) 오늘 예정된 경기가 없으면 빈 화면 노출
  * 개선: 오늘 종료된 경기가 없을 시, 가장 최근 종료된 날짜의 경기 결과들을 자동으로 탐색하여 송출 (끊김 없는 몰입감 제공)
- 경기 결과 화면(Game Result View) 아키텍처 리팩토링
  * 유지보수성 강화를 위해 헤더(Scoreboard), 전술 분석(Tactics), 박스스코어(Stats), 푸터(Nav)로 모듈화
  * 승리/패배 시각 효과 및 MVP 선정 로직 최적화
- 시뮬레이션 엔진 고도화: '백투백(Back-to-Back)' 일정 페널티 구현
  * 연속된 경기 일정 소화 시 선수단의 체력 소모량이 1.5배 증가하며, 경기력 저하 발생 확률 추가
- UI/UX 표준화 및 최적화
  * 경기 시뮬레이션 및 결과 화면에서 원정팀(좌측) vs 홈팀(우측) 배치 통일
  * 대시보드 및 로스터 화면의 배경 블러(Blur) 효과 최적화를 통한 렌더링 성능 향상

[v1.0.5] - 2025.02.24
- 전술 시스템 개선: '에이스 스토퍼(Ace Stopper)' 선정 로직 고도화
  * 기존 수비력(DEF) 단일 기준에서 퍼리미터 수비(30%), 스틸(20%), 패스 차단(15%), 지구력(10%), 스피드(10%) 등을 복합적으로 고려한 가중치 공식 적용
  * 상대 에이스 전담 마크 시 체력 소모량 증가 페널티 적용
- 대시보드 헤더 개선: 플레이오프 시리즈 진행 상황(라운드, 스코어) 실시간 표시 기능 추가

[v1.0.2] - 2025.02.21
- 트레이드 엔진 개선: AI 구단의 트레이드 제안 로직 고도화 및 샐러리 캡 룰 적용 강화
  * 팀 니즈(Needs)와 잉여 자원(Surplus) 분석 알고리즘 탑재
- 로스터 UI 업데이트: 샐러리 현황(사치세, 에이프런 구간) 시각화 그래프 추가

[v1.0.0] - 2025.02.01
- ${APP_FULL_NAME} 정식 베타 런칭
- 30개 구단 최신 로스터 및 2025-26 시즌 스케줄 탑재
`;
