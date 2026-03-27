
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GMCreationView } from '../views/GMCreationView';
import { useGame } from '../hooks/useGameContext';
import { supabase } from '../services/supabaseClient';
import type { GMPersonalityType, GMProfile } from '../types/gm';
import { GM_SLIDER_PRESETS } from '../types/gm';

const GMCreationPage: React.FC = () => {
    const { gameData, session } = useGame();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);

    if (!gameData.myTeamId) {
        navigate('/select-team', { replace: true });
        return null;
    }

    const handleComplete = async (data: {
        firstName: string;
        lastName: string;
        birthYear: number;
        personalityType: GMPersonalityType;
    }) => {
        if (!session?.user || isLoading) return;
        setIsLoading(true);
        try {
            // 1. profiles 테이블에 이름/생년도 저장
            await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
                first_name: data.firstName,
                last_name: data.lastName,
                birth_year: data.birthYear,
            });

            // 2. leagueGMProfiles에 유저 팀 프로필 추가
            const userGMProfile: GMProfile = {
                teamId: gameData.myTeamId!,
                name: `${data.lastName} ${data.firstName}`,
                firstName: data.firstName,
                lastName: data.lastName,
                birthYear: data.birthYear,
                personalityType: data.personalityType,
                sliders: GM_SLIDER_PRESETS[data.personalityType],
                direction: 'standPat',
            };
            const updatedProfiles = {
                ...gameData.leagueGMProfiles,
                [gameData.myTeamId!]: userGMProfile,
            };
            gameData.setLeagueGMProfiles(updatedProfiles);

            // 3. saves.league_gm_profiles 업데이트
            await gameData.forceSave({ leagueGMProfiles: updatedProfiles });

            navigate('/onboarding', { replace: true });
        } catch (err) {
            console.error('[GMCreationPage] save error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return <GMCreationView onComplete={handleComplete} isLoading={isLoading} />;
};

export default GMCreationPage;
