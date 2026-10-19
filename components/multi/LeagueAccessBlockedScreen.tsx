/**
 * LeagueAccessBlockedScreen — 참가자가 아닌 로그인 유저가 관전 불가 리그에 URL로 들어왔을 때 뜨는 안내 화면.
 * (관전 off 리그 / 모집·드래프트 단계 리그) 실제 데이터 접근은 RLS가 이미 막고 있고, 이 화면은 빈 화면 대신 사유를 보여 주는 용도.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '../common/Button';

interface Props {
    /** 'draft' = 모집/드래프트 단계라 관전 불가, 'disabled' = 어드민이 관전을 꺼 둔 리그 */
    reason: 'draft' | 'disabled';
}

export const LeagueAccessBlockedScreen: React.FC<Props> = ({ reason }) => {
    const navigate = useNavigate();
    return (
        <div className="relative flex items-center justify-center h-full min-h-screen bg-gray-950 px-4">
            <Button
                variant="link"
                onClick={() => navigate('/')}
                icon={<ChevronLeft size={16} />}
                className="absolute top-4 left-4"
            >
                홈으로
            </Button>
            <div className="w-full max-w-xs flex flex-col items-center gap-3 text-center" aria-live="polite">
                <p className="text-base text-slate-200 ko-normal">
                    {reason === 'draft'
                        ? '드래프트 단계의 리그는 참가자만 볼 수 있습니다'
                        : '이 리그는 참가자만 볼 수 있습니다'}
                </p>
                <Button variant="primary" size="lg" onClick={() => navigate('/')} className="mt-1">
                    홈으로
                </Button>
            </div>
        </div>
    );
};
