import { defineComponents } from '@iwsdk/core';
import {
  BlueprintGhost,
  Gatherable,
  SatchelPouch,
  SnapSpot,
} from './components/game-components.js';

export default defineComponents([Gatherable, SnapSpot, BlueprintGhost, SatchelPouch]);
