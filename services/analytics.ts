
import ReactGA from "react-ga4";

// 환경 변수에서 측정 ID를 가져오거나, 없다면 빈 문자열 (추후 .env에 설정 필요)
// 예: REACT_APP_GA_MEASUREMENT_ID=G-XXXXXXXXXX
const GA_MEASUREMENT_ID = process.env.REACT_APP_GA_MEASUREMENT_ID;

/**
 * Google Analytics 초기화
 */
export const initGA = () => {
  if (GA_MEASUREMENT_ID) {
    ReactGA.initialize(GA_MEASUREMENT_ID);
    console.log("GA Initialized");
  } else {
    console.warn("GA Measurement ID is missing.");
  }
};

/**
 * 페이지 뷰 전송 (SPA에서 가상 페이지뷰)
 * @param pageName 현재 뷰의 이름 (예: 'Dashboard', 'Roster')
 */
export const logPageView = (pageName: string) => {
  if (!GA_MEASUREMENT_ID) return;
  
  // 가상의 경로 생성 (예: /Dashboard)
  const path = `/${pageName.toLowerCase()}`;
  
  ReactGA.send({ 
    hitType: "pageview", 
    page: path, 
    title: pageName 
  });
};

/**
 * 사용자 행동 이벤트 전송
 * @param category 이벤트 카테고리 (예: 'Game', 'Trade', 'Roster')
 * @param action 이벤트 액션 (예: 'Simulate', 'Offer Trade', 'Change Starter')
 * @param label 추가 정보 (선택 사항)
 */
export const logEvent = (category: string, action: string, label?: string) => {
  if (!GA_MEASUREMENT_ID) return;
  
  ReactGA.event({
    category,
    action,
    label
  });
};

/**
 * 에러 이벤트 전송 (시스템 모니터링용)
 * @param category 에러 발생 위치 (예: 'Auth', 'Data Load', 'API')
 * @param errorMessage 에러 메시지
 */
export const logError = (category: string, errorMessage: string) => {
  if (!GA_MEASUREMENT_ID) return;

  console.error(`[Analytics Error] ${category}: ${errorMessage}`);
  
  ReactGA.event({
    category: "Error",
    action: category,
    label: errorMessage
  });
};
