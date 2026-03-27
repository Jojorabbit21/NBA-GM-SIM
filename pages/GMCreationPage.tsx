
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GMCreationView } from '../views/GMCreationView';
import { useGame } from '../hooks/useGameContext';
import { supabase } from '../services/supabaseClient';
import type { GMPersonalityType, GMProfile, GMSliders } from '../types/gm';

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
        sliders: GMSliders;
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

            // 2. 유저 GM 프로필 구성
            const userGMProfile: GMProfile = {
                teamId: gameData.myTeamId!,
                name: `${data.lastName} ${data.firstName}`,
                firstName: data.firstName,
                lastName: data.lastName,
                birthYear: data.birthYear,
                personalityType: data.personalityType,
                sliders: data.sliders,
                direction: 'standPat',
            };

            // 3. insertDraftClass + forceSave + sendMessage 일괄 처리
            await gameData.handleInitialSave(userGMProfile);

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
