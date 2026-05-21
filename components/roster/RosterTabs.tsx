
import React from 'react';
import { TabBar } from '../common/TabBar';

export type RosterTab = 'roster' | 'records' | 'coaching' | 'draftPicks';

interface RosterTabsProps {
    activeTab: RosterTab;
    onTabChange: (tab: RosterTab) => void;
    hideTabs?: RosterTab[];
}

const TABS: { id: RosterTab; label: string }[] = [
    { id: 'roster', label: '로스터' },
    { id: 'records', label: '경기 기록' },
    { id: 'coaching', label: '코칭 스태프' },
    { id: 'draftPicks', label: '드래프트 픽' },
];

export const RosterTabs: React.FC<RosterTabsProps> = ({ activeTab, onTabChange, hideTabs }) => {
    const tabs = hideTabs?.length ? TABS.filter(t => !hideTabs.includes(t.id)) : TABS;
    return <TabBar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />;
};
