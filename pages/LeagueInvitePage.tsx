import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';
import Loader from '../components/Loader';
import { Button } from '../components/common/Button';
import { InlineNotice } from '../components/common/InlineNotice';
import { acceptLeagueInvite, getLeagueInvite, type LeagueInvitePreview } from '../services/multi/leagueService';

const STATE_MESSAGES: Record<Exclude<LeagueInvitePreview['state'], 'valid'>, string> = {
    accepted:   '이미 사용된 초대 링크입니다.',
    revoked:    '방장이 취소한 초대 링크입니다.',
    expired:    '만료된 초대 링크입니다. 방장에게 새 링크를 요청하세요.',
    team_taken: '다른 유저가 이미 이 팀을 인계받았습니다.',
};

/** /multi/invite/:token — 초대 링크로 들어온 유저가 AI 팀을 인계받는 화면. 미로그인이면 로그인 후 돌아온다. */
const LeagueInvitePage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const { session, authLoading } = useGame();
    const navigate = useNavigate();

    const [preview, setPreview] = useState<LeagueInvitePreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);
    const [accepting, setAccepting] = useState(false);

    const userId = session?.user?.id ?? null;

    useEffect(() => {
        if (!token || !userId) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            const { data, error: err } = await getLeagueInvite(token);
            if (cancelled) return;
            setPreview(data);
            setError(err);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [token, userId]);

    if (authLoading) return <Loader message="잠시만 기다려주세요..." />;
    if (!session) return <Navigate to={`/auth?redirect=${encodeURIComponent(`/multi/invite/${token ?? ''}`)}`} replace />;
    if (loading) return <Loader message="초대를 확인하는 중..." />;

    const handleAccept = async () => {
        if (!token) return;
        setAccepting(true); setError(null);
        const { data, error: err } = await acceptLeagueInvite(token);
        setAccepting(false);
        if (err || !data) { setError(err ?? '초대 수락에 실패했습니다.'); return; }
        navigate(`/multi/leagues/${data.league_id}/season`, { replace: true });
    };

    const canAccept = preview?.state === 'valid' && !preview.already_member;

    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
                <h1 className="text-lg font-bold text-white ko-normal">리그 초대</h1>

                {!preview && <InlineNotice tone="danger">{error ?? '초대 정보를 불러오지 못했습니다.'}</InlineNotice>}

                {preview && (
                    <>
                        <p className="text-sm text-slate-400 ko-normal">
                            <span className="font-bold text-white">{preview.league_name}</span> 리그에서 AI가 운영 중인 팀을 이어받을 수 있습니다.
                        </p>
                        <div
                            className="rounded-xl px-4 py-3 flex items-center gap-3"
                            style={{ background: preview.color_primary ?? '#1e293b', color: preview.color_text ?? '#ffffff', border: `2px solid ${preview.color_secondary ?? '#334155'}` }}
                        >
                            <span className="text-xl font-extrabold">{preview.team_abbr}</span>
                            <span className="text-sm font-bold truncate">{preview.team_name}</span>
                        </div>

                        {preview.state !== 'valid' && <InlineNotice tone="warning">{STATE_MESSAGES[preview.state]}</InlineNotice>}
                        {preview.state === 'valid' && preview.already_member && (
                            <InlineNotice tone="warning">이미 이 리그에 참가 중이라 다른 팀을 인계받을 수 없습니다.</InlineNotice>
                        )}
                        {preview.state === 'valid' && !preview.already_member && (
                            <p className="text-xs text-slate-500 ko-normal">
                                현재 로스터·전술·계약이 그대로 넘어옵니다. 수락하면 즉시 이 팀의 GM이 됩니다.
                            </p>
                        )}
                        {error && <InlineNotice tone="danger">{error}</InlineNotice>}

                        <div className="flex gap-2 justify-end">
                            {preview.already_member && (
                                <Button variant="secondary" onClick={() => navigate(`/multi/leagues/${preview.league_id}/season`)}>내 리그로 이동</Button>
                            )}
                            <Button variant="primary" disabled={!canAccept} isLoading={accepting} onClick={handleAccept}>팀 인계받기</Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default LeagueInvitePage;
