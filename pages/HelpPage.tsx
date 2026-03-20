import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpView } from '../views/HelpView';

const HelpPage: React.FC = () => {
    const navigate = useNavigate();
    return <HelpView onBack={() => navigate(-1)} />;
};

export default HelpPage;
