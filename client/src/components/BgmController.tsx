import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import hitmanTrack from '../assets/Hitman.mp3';
import mechanolithTrack from '../assets/Mechanolith.mp3';

const playlist = [hitmanTrack, mechanolithTrack];
const bgmAudio = new Audio();
const DEFAULT_VOLUME = 0.22;
const VOLUME_STORAGE_KEY = 'gunman-theory-bgm-volume';

bgmAudio.preload = 'auto';
bgmAudio.loop = false;
bgmAudio.volume = DEFAULT_VOLUME;

let currentTrackIndex = 0;
let isStarting = false;
let hasStarted = false;

function getSavedVolume() {
    if (typeof window === 'undefined') return DEFAULT_VOLUME;
    const savedVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const parsedVolume = savedVolume ? Number(savedVolume) : NaN;
    if (Number.isNaN(parsedVolume)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, parsedVolume));
}

function loadTrack(index: number) {
    bgmAudio.src = playlist[index];
    bgmAudio.currentTime = 0;
}

function playTrack(index: number) {
    currentTrackIndex = index;
    loadTrack(index);
    return bgmAudio.play();
}

function advanceTrack() {
    const nextIndex = (currentTrackIndex + 1) % playlist.length;
    return playTrack(nextIndex);
}

export default function BgmController() {
    const [volume, setVolume] = useState(() => getSavedVolume());

    useEffect(() => {
        bgmAudio.volume = volume;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
        }
    }, [volume]);

    useEffect(() => {
        const handleEnded = () => {
            void advanceTrack().catch((error) => {
                console.log('BGM advance failed:', error);
                isStarting = false;
                hasStarted = false;
            });
        };

        const tryStart = () => {
            if (hasStarted || isStarting) return;

            isStarting = true;
            if (!bgmAudio.src) {
                currentTrackIndex = 0;
            }

            void playTrack(currentTrackIndex)
                .then(() => {
                    hasStarted = true;
                    isStarting = false;
                })
                .catch((error) => {
                    console.log('BGM start failed:', error);
                    isStarting = false;
                });
        };

        const interactionEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];

        bgmAudio.addEventListener('ended', handleEnded);
        interactionEvents.forEach((eventName) => {
            window.addEventListener(eventName, tryStart, { passive: true });
        });

        return () => {
            bgmAudio.removeEventListener('ended', handleEnded);
            interactionEvents.forEach((eventName) => {
                window.removeEventListener(eventName, tryStart);
            });
        };
    }, []);

    return (
        <div className="fixed left-4 bottom-4 z-[700] flex items-center gap-3 rounded-2xl border border-gray-700 bg-dark-900/80 px-4 py-3 shadow-2xl backdrop-blur-md">
            {volume > 0 ? (
                <Volume2 size={18} className="text-primary-500" />
            ) : (
                <VolumeX size={18} className="text-gray-400" />
            )}
            <div className="flex min-w-44 flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">BGM</span>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(volume * 100)}
                    onChange={(event) => setVolume(Number(event.target.value) / 100)}
                    className="h-2 cursor-pointer appearance-none rounded-lg bg-gray-700 accent-primary-500"
                    aria-label="BGM volume"
                />
            </div>
            <span className="w-10 text-right text-xs font-bold text-white">
                {Math.round(volume * 100)}%
            </span>
        </div>
    );
}
