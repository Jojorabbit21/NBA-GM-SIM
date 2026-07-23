
import React, { useState } from 'react';
import { PbpGameModePanel } from '../components/physics-lab/PbpGameModePanel';
import { MotionSandboxPanel } from '../components/physics-lab/MotionSandboxPanel';
import { CourtPointPicker } from '../components/physics-lab/CourtPointPicker';

// ─────────────────────────────────────────────────────────────
// 물리 랩 (테스팅 룸) — 순수 물리 코어(services/game/engine/physics/) 실험용 상설 실험실.
// - 모션 샌드박스: 디렉터 컷 방식(실제 PBP RNG 없이 admin이 직접 playType/zone/선수를 지정)으로
//   generateChoreography() Reel 파이프라인을 엔드투엔드로 재생·검증하는 곳(Milestone 1: CatchShoot).
// - PBP 경기 모드: 실제 PBP 엔진(stepPossession)을 그대로 돌려서, 매 포제션의 courtSnapshot을
//   물리 코어의 이동 타겟으로 주입해 순간이동 대신 물리 이동으로 재생. 추후 고도화 예정이라
//   탭은 숨겨두고 컴포넌트는 그대로 둠 — LabMode에 'pbp' 값 유지, 버튼만 미노출.
// 수동 동작 모드/스크립트 플레이 모드는 삭제됨(모션 샌드박스로 대체) — 사용자 확정.
// 이 페이지는 admin 전용 개발 도구 라우트(/admin/editor/physics-lab)로만 접근한다.
// ─────────────────────────────────────────────────────────────

type LabMode = 'pbp' | 'sandbox' | 'points';

const PhysicsLabPage: React.FC = () => {
    const [mode, setMode] = useState<LabMode>('sandbox');

    return (
        <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 160px)' }}>
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
                <button
                    onClick={() => setMode('sandbox')}
                    className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
                        mode === 'sandbox' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    모션 샌드박스
                </button>
                <button
                    onClick={() => setMode('points')}
                    className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
                        mode === 'points' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    좌표 피커
                </button>
                {/* PBP 경기 모드 탭 — 추후 고도화 전까지 숨김 (컴포넌트/모드 값은 유지) */}
            </div>

            <div className="flex-1 min-h-0">
                {mode === 'pbp' && <PbpGameModePanel />}
                {mode === 'sandbox' && <MotionSandboxPanel />}
                {mode === 'points' && <CourtPointPicker />}
            </div>
        </div>
    );
};

export default PhysicsLabPage;
