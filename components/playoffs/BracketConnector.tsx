import React from 'react';

interface ConnectorPair {
  leftIndices: number[];
  rightIndex: number;
}

interface BracketConnectorProps {
  leftCount: number;
  rightCount: number;
  sectionHeight: number;
  pairs: ConnectorPair[];
  width?: number;
  dashed?: boolean;
}

const getYCenter = (index: number, total: number, height: number) =>
  height * (2 * index + 1) / (2 * total);

export const BracketConnector: React.FC<BracketConnectorProps> = ({
  leftCount,
  rightCount,
  sectionHeight,
  pairs,
  width = 28,
  dashed = false,
}) => {
  const midX = width / 2;

  return (
    <svg
      className="w-full h-full block"
      viewBox={`0 0 ${width} ${sectionHeight}`}
      preserveAspectRatio="none"
    >
      {pairs.map((pair, pairIdx) => {
        const rightY = getYCenter(pair.rightIndex, rightCount, sectionHeight);

        return pair.leftIndices.map((leftIdx, i) => {
          const leftY = getYCenter(leftIdx, leftCount, sectionHeight);

          return (
            <path
              key={`${pairIdx}-${i}`}
              d={`M 0,${leftY} H ${midX} V ${rightY} H ${width}`}
              fill="none"
              stroke="rgb(71,85,105)"
              strokeWidth={1.5}
              strokeDasharray={dashed ? '4,3' : undefined}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          );
        });
      })}
    </svg>
  );
};
