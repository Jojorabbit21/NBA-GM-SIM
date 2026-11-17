import React, { useState } from 'react';
import { Modal } from './common/Modal';
import { LegalContent, type LegalKind } from '../views/home/LegalContent';

/**
 * [2026-11-17] 세션 안에서 보는 서비스 소개 · 이용약관 · 개인정보 처리방침 팝업 — 멀티세션 푸터 링크가 연다(사용자 지시:
 * 새 탭으로 로비에 나가지 않고 세션 안에서 볼 수 있게). 본문은 홈 화면과 같은 LegalContent(탭 3개 · KOR/EN 토글 · 문서 레이아웃)를 그대로 쓴다.
 * 모양은 패치노트 모달과 같은 틀(공용 Modal · rounded-lg · 자체 닫기 버튼 · 높이 80vh).
 * kind = 처음 보여 줄 문서(null이면 닫힘). 안에서 탭을 바꾸면 picked가 우선하고, 닫을 때 비운다.
 * 싱글 플레이 사이드바의 옛 LegalModal(탭 2개 · 평문)과는 별개다.
 */
export const LegalDocsModal: React.FC<{ kind: LegalKind | null; onClose: () => void }> = ({ kind, onClose }) => {
    const [picked, setPicked] = useState<LegalKind | null>(null);
    const close = () => { setPicked(null); onClose(); };
    const current = picked ?? kind;
    return (
        <Modal isOpen={kind !== null} onClose={close} size="lg" rounded="rounded-lg" hideCloseButton>
            <div className="h-[80vh]">
                {current && <LegalContent kind={current} onSelect={setPicked} onClose={close} />}
            </div>
        </Modal>
    );
};
