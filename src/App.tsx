import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { audio } from './audio/audio';
import { game } from './game/controller';
import { useGame } from './store/game';
import { useProfile } from './store/profile';
import { cx } from './ui/common';
import { GameCanvas } from './ui/GameCanvas';
import { AircraftPanel } from './ui/hud/AircraftPanel';
import { FlightBoard } from './ui/hud/FlightBoard';
import { ConfirmTakeoff, HintBubble, PickBanner, RadioLog, Toasts, UndoButton } from './ui/hud/Overlays';
import { Radar } from './ui/hud/Radar';
import { ReplayBar, SandboxPanel } from './ui/hud/Sandbox';
import { TopBar } from './ui/hud/TopBar';
import { Loading, MainMenu, ModeSelect } from './ui/screens/MainMenu';
import { Customize, Encyclopedia, Hangar, Missions, Replays, Settings, Stats } from './ui/screens/Panels';
import { DailyChallenge, DaySummary, GameOver, HowToPlay, Leaderboard, PauseMenu } from './ui/screens/Session';

function HUD() {
  const replaying = useGame((s) => s.replaying);
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="hud">
      <TopBar />
      <FlightBoard />
      <Radar />
      {!replaying && <RadioLog />}
      <SandboxPanel />
      <PickBanner />
      <HintBubble />
      <UndoButton />
      <AircraftPanel />
      <ReplayBar />
    </div>
  );
}

export default function App() {
  const screen = useGame((s) => s.screen);
  const settings = useProfile((s) => s.settings);

  useEffect(() => {
    audio.setVolumes(settings.master, settings.sfx, settings.music, settings.musicOn);
  }, [settings.master, settings.sfx, settings.music, settings.musicOn]);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
    document.documentElement.style.fontSize = `${16 * settings.uiScale}px`;
  }, [settings.uiScale]);

  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
    window.addEventListener('keydown', unlock);
    const hide = () => {
      if (document.visibilityState === 'hidden') {
        game.save();
        if (game.kind === 'play') useGame.getState().set({ paused: true });
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', () => game.save());
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  return (
    <div className={cx('ui-root relative h-full w-full overflow-hidden', settings.highContrast && 'hc', settings.reduceMotion && 'rm')}>
      <GameCanvas />
      <div className="pointer-events-none absolute inset-0">
        {screen === 'game' && <HUD />}
        <AnimatePresence>{screen === 'menu' && <MainMenu key="menu" />}</AnimatePresence>
        <ModeSelect />
        <Hangar />
        <Missions />
        <Encyclopedia />
        <Stats />
        <Replays />
        <Settings />
        <Customize />
        <PauseMenu />
        <DaySummary />
        <GameOver />
        <DailyChallenge />
        <Leaderboard />
        <HowToPlay />
        <ConfirmTakeoff />
        <Toasts />
      </div>
      <AnimatePresence>{screen === 'loading' && <Loading key="loading" />}</AnimatePresence>
    </div>
  );
}
