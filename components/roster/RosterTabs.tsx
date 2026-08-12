
import React from 'react';
import { TabBar } from '../common/TabBar';

export type RosterTab = 'overview' | 'attributes' | 'stats' | 'records' | 'schedule' | 'coaching' | 'draftPicks';

interface RosterTabsProps {
    activeTab: RosterTab;
    onTabChange: (tab: RosterTab) => void;
    hideTabs?: RosterTab[];
    theme?: { bg: string; text: string; accent: string };
}

const TABS: { id: RosterTab; label: string }[] = [
    { id: 'overview', label: '로스터' },
    { id: 'attributes', label: '능력치' },
    { id: 'stats', label: '선수 기록' },
    { id: 'records', label: '경기 기록' },
    { id: 'schedule', label: '일정' },
    { id: 'coaching', label: '코칭 스태프' },
    { id: 'draftPicks', label: '드래프트 픽' },
];

export const RosterTabs: React.FC<RosterTabsProps> = ({ activeTab, onTabChange, hideTabs, theme }) => {
    const tabs = hideTabs?.length ? TABS.filter(t => !hideTabs.includes(t.id)) : TABS;
    return <TabBar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} theme={theme} />;
};
