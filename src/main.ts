import './styles.css';
import { Game } from './core/Game';
import { CellScene } from './scenes/CellScene';
import { Hud } from './ui/Hud';

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = new Hud(document.getElementById('hud') as HTMLElement);

const game = new Game(canvas, app);
game.setScene(new CellScene(canvas, hud));
game.start();

// iOS Safari ignores user-scalable=no; block its pinch/double-tap page zoom so gestures reach the game.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
