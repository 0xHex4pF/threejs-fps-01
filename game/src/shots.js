// Screenshot staging: ?shot=start|play|buy|end&seed=N sets up a deterministic frame
// from the real game — the same spawn, step and HUD code live play uses — then the
// caller renders it twice, freezes it and sets window.__shotReady. No pointer lock
// is ever requested in shot mode. These hooks ship in the game, as the kit's
// starter does the same for its own shots.
export function stageShot(name, api) {
  const S = api.S;
  api.startMatch();

  if (name === 'start') {
    // Title screen over the quay at dusk, the squad at the spawn line.
    api.setPlayer(0, 14, 0.12, -0.02);
    api.stepFixed(30);
    api.hud.showScreen('title');
    return;
  }

  if (name === 'buy') {
    // Buy phase: the shop open, money in hand, the carbine already owned.
    api.setMoney(2400);
    api.giveWeapon('carbine');
    api.setPlayer(0, 14, 0, 0);
    api.stepFixed(30);
    api.openBuyMenu();
    return;
  }

  if (name === 'play') {
    // Mid-fight in the open centre lane: a Jackal in the open with the uplink
    // hologram behind it, one carbine round already on its way, the uplink
    // half-captured, the round score 2-1.
    api.setWins(2, 1);
    api.setRound(4);
    api.setTimerLeft(72);
    api.setUplink(0.35);
    api.setMoney(1500);
    api.giveWeapon('carbine');
    api.setGrenades(1);
    api.beginLive();
    api.setPlayer(2.5, 6.5, 0, 0);
    api.aimPlayerAt(-1.5, 1.2, -3.0);
    api.stepFixed(40);
    // Place after the settle steps so no bot drifts off its staged mark.
    const jackal = api.actors.find((a) => a.team === 'jackal');
    api.placeFighter(jackal, -1.5, -3.0, Math.PI - 0.3);
    const mates = api.actors.filter((a) => a.team === 'warden' && !a.isPlayer);
    api.placeFighter(mates[0], -4.5, 8.5, 0.3);
    api.placeFighter(mates[1], 7, 9, -0.2);
    const others = api.actors.filter((a) => a.team === 'jackal' && a !== jackal);
    api.placeFighter(others[0], 7.5, -7.5, Math.PI + 0.3);
    api.placeFighter(others[1], -10, -6.5, Math.PI - 0.5);
    api.firePlayerAt(jackal.position.x, 1.2, jackal.position.z);
    return;
  }

  // end: the match-end screen over the quay, victory 5-2.
  api.setWins(5, 2);
  api.setRound(7);
  api.setKills(14);
  api.setDeaths(6);
  api.setShots(68, 29);
  api.setPlayer(0, 14, 0, 0);
  api.stepFixed(30);
  api.showEndScreen(true, 'The Jackals never took the pad. The quay stays lit.');
  api.setCameraFree(9, 3.2, 9, 0.65, -0.12);
}
