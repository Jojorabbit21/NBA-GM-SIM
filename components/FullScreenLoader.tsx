
import React, { useState, useEffect } from 'react';
import { LOADING_MESSAGES } from '../data/uiConstants';

interface FullScreenLoaderProps {
    message?: string; // Optional override message
}

const FullScreenLoader: React.FC<FullScreenLoaderProps> = ({ message }) => {
    // Default to a random message initially if no override is provided
    const [currentText, setCurrentText] = useState(() => {
        if (message) return message;
        return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    });

    useEffect(() => {
        // If a specific message is provided (e.g. "Saving..."), don't cycle.
        if (message) {
            setCurrentText(message);
            return;
        }

        // Cycle through random messages to keep the user entertained
        const interval = setInterval(() => {
            setCurrentText(prev => {
                let nextIndex;
                // Ensure we don't show the same message twice in a row
                do {
                    nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
                } while (LOADING_MESSAGES[nextIndex] === prev && LOADING_MESSAGES.length > 1);
                
                return LOADING_MESSAGES[nextIndex];
            });
        }, 800); // Change every 800ms

        return () => clearInterval(interval);
    }, [message]);

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[1000]">
            <p className="text-2xl md:text-4xl font-black pretendard text-slate-100 tracking-tight animate-pulse leading-relaxed break-keep text-center px-6">
                {currentText}
            </p>
        </div>
    );
};

export default FullScreenLoader;
