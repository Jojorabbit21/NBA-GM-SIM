
import { PlayType } from '../../types.ts';

// 배열 인덱스 0 = Rank 1 (1옵션), 인덱스 4 = Rank 5 (5옵션)
export const PLAY_TYPE_USAGE_WEIGHTS: Record<PlayType, [number, number, number, number, number]> = {
    'Iso':          [2.5, 1.8, 1.2, 0.7, 0.4],
    'PostUp':       [2.2, 1.6, 1.0, 0.6, 0.3],
    'PnR_Handler':  [2.5, 1.8, 1.2, 0.7, 0.4],

    'Handoff':        [2.0, 1.6, 1.2, 0.8, 0.5],
    'OffBallScreen':  [2.0, 1.6, 1.2, 0.8, 0.5],
    'PnR_Pop':        [1.6, 1.4, 1.2, 0.9, 0.6],

    'PnR_Roll':     [1.3, 1.2, 1.1, 1.0, 0.9],
    'CatchShoot':   [1.5, 1.3, 1.2, 1.0, 0.8],
    'DriveKick':    [1.5, 1.3, 1.2, 1.0, 0.8],
    'Cut':          [1.4, 1.2, 1.1, 1.0, 0.8],

    'Transition':   [1.0, 1.0, 1.0, 1.0, 1.0],
    'Putback':      [1.0, 1.0, 1.0, 1.0, 1.0],
};
