import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';

interface FixedStageProps {
    children: ReactNode;
    stageRef?: RefObject<HTMLDivElement | null>;
    className?: string;
    baseWidth?: number;
    baseHeight?: number;
}

export default function FixedStage({
    children,
    stageRef,
    className = '',
    baseWidth = 1600,
    baseHeight = 900,
}: FixedStageProps) {
    const [viewport, setViewport] = useState(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }));

    useEffect(() => {
        const handleResize = () => {
            setViewport({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const scale = useMemo(() => {
        const horizontalPadding = 40;
        const verticalPadding = 32;
        return Math.min(
            (viewport.width - horizontalPadding) / baseWidth,
            (viewport.height - verticalPadding) / baseHeight
        );
    }, [viewport, baseWidth, baseHeight]);

    const safeScale = Math.max(scale, 0.35);

    return (
        <div className="fixed inset-0 overflow-hidden bg-dark-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(180,83,9,0.16),_transparent_38%),radial-gradient(circle_at_bottom,_rgba(30,41,59,0.55),_transparent_45%)]" />
            <div className="relative flex h-full w-full items-center justify-center px-5 py-4">
                <div
                    className="relative"
                    style={{
                        width: `${baseWidth * safeScale}px`,
                        height: `${baseHeight * safeScale}px`,
                    }}
                >
                    <div
                        ref={stageRef}
                        className={`relative overflow-hidden rounded-[28px] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)] ${className}`}
                        style={{
                            width: `${baseWidth}px`,
                            height: `${baseHeight}px`,
                            transform: `scale(${safeScale})`,
                            transformOrigin: 'top left',
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
