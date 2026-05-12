
import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
    createLeagueGroup,
    createLeague,
    createRoom,
    initializeLeagueTeams,
} from '../../services/multi/leagueService';

interface CreateLeagueModalProps {
    userId: string;
    onClose:  () => void;
    onCreated: (leagueId: string) => void;
}

type LeagueType = 'tournament' | 'main_league';
type TournamentFormat = 'single_elim' | 'round_robin';
type MatchFormat = 'best_of_1' | 'best_of_3' | 'best_of_7';
type Tier = 'd1' | 'd2' | 'd3';

const TOURNAMENT_TEAM_OPTIONS  = [4, 8, 16, 32];
const MAIN_LEAGUE_TEAM_OPTIONS = [10, 20, 30];


const CreateLeagueModal: React.FC<CreateLeagueModalProps> = ({ userId, onClose, onCreated }) => {
    const [name,              setName]              = useState('');
    const [type,              setType]              = useState<LeagueType>('tournament');
    const [tier,              setTier]              = useState<Tier>('d1');
    const [tournamentFormat,  setTournamentFormat]  = useState<TournamentFormat>('single_elim');
    const [matchFormat,       setMatchFormat]       = useState<MatchFormat>('best_of_1');
    const [maxTeams,          setMaxTeams]          = useState(8);
    const [totalRounds,       setTotalRounds]       = useState(10);
    const [pickDurationSec,   setPickDurationSec]   = useState(30);
    const [saving,            setSaving]            = useState(false);
    const [err,               setErr]               = useState<string | null>(null);

    const handleTypeChange = (t: LeagueType) => {
        setType(t);
        setMaxTeams(t === 'tournament' ? 8 : 30);
    };

    const handleSubmit = async () => {
        const trimName = name.trim();
        if (trimName.length < 1 || trimName.length > 30) {
            setErr('리그 이름은 1~30자여야 합니다'); return;
        }

        setSaving(true);
        setErr(null);

        try {
            let leagueId: string;

            if (type === 'tournament') {
                // ── 토너먼트 생성 ────────────────────────────────────────────
                const { data: league, error: le } = await createLeague({
                    type:             'tournament',
                    name:             trimName,
                    adminUserId:      userId,
                    maxTeams,
                    tournamentFormat,
                    matchFormat,
                    options: { draftTotalRounds: totalRounds, draftPickDurationSec: pickDurationSec },
                });
                if (le || !league) throw new Error(le ?? '리그 생성 실패');
                leagueId = league.id;

            } else {
                // ── 메인리그 생성 ────────────────────────────────────────────
                // 1. league_group 먼저 생성
                const { data: group, error: ge } = await createLeagueGroup({
                    name:        trimName,
                    adminUserId: userId,
                });
                if (ge || !group) throw new Error(ge ?? '리그 그룹 생성 실패');

                // 2. 선택한 tier로 league 생성
                const { data: league, error: le } = await createLeague({
                    type:         'main_league',
                    name:         trimName,
                    adminUserId:  userId,
                    groupId:      group.id,
                    tier,
                    maxTeams,
                    seasonNumber: 1,
                    options: { draftTotalRounds: totalRounds, draftPickDurationSec: pickDurationSec },
                });
                if (le || !league) throw new Error(le ?? '리그 생성 실패');
                leagueId = league.id;
            }

            // ── 방(Room) 생성 ────────────────────────────────────────────────
            const { data: room, error: re } = await createRoom({
                leagueId,
                maxPlayers: maxTeams,
            });
            if (re || !room) throw new Error(re ?? '방 생성 실패');

            // ── 팀 초기화 ────────────────────────────────────────────────────
            const { error: te } = await initializeLeagueTeams(room.id, maxTeams);
            if (te) throw new Error(te);

            onCreated(leagueId);

        } catch (e: any) {
            setErr(e.message ?? '알 수 없는 오류');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-5">

                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-black text-white ko-tight">새 리그 만들기</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* 리그 이름 */}
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1">리그 이름</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        maxLength={30}
                        placeholder="예: 스프링 인비테이셔널"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        autoFocus
                    />
                </div>

                {/* 리그 유형 */}
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-2">리그 유형</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['tournament', 'main_league'] as LeagueType[]).map(t => (
                            <button
                                key={t}
                                onClick={() => handleTypeChange(t)}
                                className={`py-2 rounded-xl text-sm font-bold transition-colors ${
                                    type === t
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                {t === 'tournament' ? '토너먼트' : '메인리그'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 메인리그 전용: 티어 선택 */}
                {type === 'main_league' && (
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-2">티어</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['d1', 'd2', 'd3'] as Tier[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTier(t)}
                                    className={`py-2 rounded-xl text-sm font-bold transition-colors ${
                                        tier === t
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {t.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 토너먼트 전용 옵션 */}
                {type === 'tournament' && (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1">대진 방식</label>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { value: 'single_elim', label: '싱글 엘리미네이션' },
                                    { value: 'round_robin', label: '라운드 로빈' },
                                ] as { value: TournamentFormat; label: string }[]).map(o => (
                                    <button
                                        key={o.value}
                                        onClick={() => setTournamentFormat(o.value)}
                                        className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            tournamentFormat === o.value
                                                ? 'bg-slate-600 text-white'
                                                : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1">경기 포맷</label>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { value: 'best_of_1', label: '단판' },
                                    { value: 'best_of_3', label: '3전2선' },
                                    { value: 'best_of_7', label: '7전4선' },
                                ] as { value: MatchFormat; label: string }[]).map(o => (
                                    <button
                                        key={o.value}
                                        onClick={() => setMatchFormat(o.value)}
                                        className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            matchFormat === o.value
                                                ? 'bg-slate-600 text-white'
                                                : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 정원 */}
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1">정원</label>
                    <div className="flex gap-2 flex-wrap">
                        {(type === 'tournament' ? TOURNAMENT_TEAM_OPTIONS : MAIN_LEAGUE_TEAM_OPTIONS).map(n => (
                            <button
                                key={n}
                                onClick={() => setMaxTeams(n)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    maxTeams === n
                                        ? 'bg-slate-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                {n}팀
                            </button>
                        ))}
                    </div>
                </div>

                {/* 드래프트 설정 */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 라운드 <span className="text-slate-600">10–15</span></label>
                        <input
                            type="number"
                            min={10}
                            max={15}
                            value={totalRounds}
                            onChange={e => setTotalRounds(Math.min(15, Math.max(10, Number(e.target.value))))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">픽 제한 시간(초) <span className="text-slate-600">15–60</span></label>
                        <input
                            type="number"
                            min={15}
                            max={60}
                            value={pickDurationSec}
                            onChange={e => setPickDurationSec(Math.min(60, Math.max(15, Number(e.target.value))))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                {err && <p className="text-xs text-red-400 ko-normal">{err}</p>}

                {/* 버튼 */}
                <div className="flex gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving
                            ? <span className="flex items-center justify-center gap-1.5"><Loader2 size={13} className="animate-spin" />생성 중…</span>
                            : '만들기'
                        }
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateLeagueModal;
