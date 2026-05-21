import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const EditorLayout: React.FC<{ userId?: string }> = ({ userId }) => {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 pretendard">
            <div className="p-4 md:p-6">
                <div className="flex items-center gap-4 mb-5">
                    <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-sm">
                        ← 뒤로
                    </button>
                    <h1 className="text-lg font-bold text-white">Admin 편집기</h1>
                </div>
                <div className="flex gap-0 border-b border-slate-800 mb-6">
                    <NavLink
                        to="player"
                        className={({ isActive }) =>
                            `px-5 py-2 text-sm transition-colors border-b-2 -mb-px ${
                                isActive
                                    ? 'text-white border-indigo-500'
                                    : 'text-slate-400 border-transparent hover:text-white'
                            }`
                        }
                    >
                        선수 편집
                    </NavLink>
                    <NavLink
                        to="archetype"
                        className={({ isActive }) =>
                            `px-5 py-2 text-sm transition-colors border-b-2 -mb-px ${
                                isActive
                                    ? 'text-white border-indigo-500'
                                    : 'text-slate-400 border-transparent hover:text-white'
                            }`
                        }
                    >
                        아키타입 설정
                    </NavLink>
                    <NavLink
                        to="draft-sim"
                        className={({ isActive }) =>
                            `px-5 py-2 text-sm transition-colors border-b-2 -mb-px ${
                                isActive
                                    ? 'text-white border-indigo-500'
                                    : 'text-slate-400 border-transparent hover:text-white'
                            }`
                        }
                    >
                        드래프트 시뮬
                    </NavLink>
                </div>
                <Outlet context={{ userId }} />
            </div>
        </div>
    );
};

export default EditorLayout;
