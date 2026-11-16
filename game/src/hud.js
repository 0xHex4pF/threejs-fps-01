// The DOM HUD: health, ammo, money, timer, score, kill feed, uplink bar, banners
// and the four screens (title, buy menu, pause, match end). It never touches the
// simulation; main.js pushes numbers in and reads button clicks out. Every setter
// caches its last value, so a steady HUD costs no DOM writes.
import { WEAPONS, WEAPON_ORDER, CONFIG } from './config.js';

const BUY_ITEMS = [
  ...WEAPON_ORDER.filter((id) => id !== 'p9').map((id) => ({
    id, kind: 'weapon', name: WEAPONS[id].name, price: WEAPONS[id].price,
    desc: id === 'scatter' ? 'Close quarters, 8 pellets' : id === 'carbine' ? 'Automatic, 30 rounds' : 'Heavy, precise, 10 rounds',
  })),
  { id: 'armor', kind: 'armor', name: 'Kevlar Vest', price: CONFIG.armorPrice, desc: 'Halves damage taken' },
  { id: 'grenade', kind: 'grenade', name: 'Frag Grenade', price: CONFIG.grenadePrice, desc: 'Thrown with G, 6 m blast' },
  { id: 'ammo', kind: 'ammo', name: 'Full Ammo', price: CONFIG.ammoPrice, desc: 'Refills every owned gun' },
];
const BUY_KEYS = ['1', '2', '3', '4', '5', '6'];

export function createHud(callbacks) {
  const el = {};
  for (const id of ['crosshair', 'hitmarker', 'score-warden', 'score-jackal', 'timer', 'round-label',
    'uplink', 'uplink-fill', 'alive-warden', 'alive-jackal', 'killfeed', 'health-num', 'armor-badge',
    'health-fill', 'money', 'weapon-name', 'ammo', 'ammo-mag', 'ammo-reserve', 'grenades', 'banner',
    'banner-title', 'banner-sub', 'hint', 'damage-vignette', 'mute-tag', 'screen-title', 'screen-buy',
    'screen-pause', 'screen-end', 'buy-money', 'buy-grid', 'end-heading', 'end-copy', 'end-stats']) {
    el[id] = document.getElementById(id);
  }
  const last = {};
  const feed = [];
  let bannerUntil = 0;
  let hitTimer = 0;

  function setText(key, node, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  // The buy grid is built once; updates only flip disabled states and labels.
  const buyButtons = {};
  BUY_ITEMS.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.innerHTML = `<div class="name"></div><div class="desc"></div><div class="row"><span class="price"></span><span class="key"></span></div>`;
    button.querySelector('.name').textContent = item.name;
    button.querySelector('.desc').textContent = item.desc;
    button.querySelector('.price').textContent = `$${item.price}`;
    button.querySelector('.key').textContent = `Key ${BUY_KEYS[index]}`;
    button.addEventListener('click', () => callbacks.onBuy(item.id));
    el['buy-grid'].appendChild(button);
    // Keep the row's own elements: the key label's class changes to 'owned'
    // after a purchase, so re-querying by class would come back null.
    buyButtons[item.id] = {
      button,
      item,
      keyEl: button.querySelector('.key'),
      descEl: button.querySelector('.desc'),
    };
  });

  document.getElementById('btn-play').addEventListener('click', callbacks.onPlay);
  document.getElementById('btn-close-buy').addEventListener('click', callbacks.onCloseBuy);
  document.getElementById('btn-resume').addEventListener('click', callbacks.onResume);
  document.getElementById('btn-quit').addEventListener('click', callbacks.onQuit);
  document.getElementById('btn-again').addEventListener('click', callbacks.onRestart);

  return {
    setHealth(hp, armor) {
      setText('hp', el['health-num'], String(Math.max(0, Math.ceil(hp))));
      el['armor-badge'].hidden = !armor;
      const pct = Math.max(0, Math.min(100, hp));
      if (last.hpFill !== pct) {
        last.hpFill = pct;
        el['health-fill'].style.width = `${pct}%`;
        el['health-fill'].classList.toggle('low', pct <= 30);
      }
    },
    setAmmo(mag, reserve, weaponName, grenadeCount) {
      setText('mag', el['ammo-mag'], String(mag));
      setText('reserve', el['ammo-reserve'], `/ ${reserve}`);
      setText('weapon', el['weapon-name'], weaponName);
      setText('grenades', el['grenades'], `Grenades: ${grenadeCount} · G to throw`);
      el.ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText('money', el.money, `$${value}`);
      setText('buyMoney', el['buy-money'], `$${value}`);
    },
    setTimer(seconds, phase) {
      const shown = phase === 'buy' ? `Buy ${Math.ceil(seconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      setText('timer', el.timer, shown);
      el.timer.classList.toggle('low', phase === 'live' && seconds <= 15);
    },
    setScore(warden, jackal, round) {
      setText('sw', el['score-warden'], String(warden));
      setText('sj', el['score-jackal'], String(jackal));
      setText('round', el['round-label'], `Round ${round}`);
    },
    setAlive(warden, jackal) {
      setText('aw', el['alive-warden'], String(warden));
      setText('aj', el['alive-jackal'], String(jackal));
    },
    setUplink(progress, contested) {
      const visible = progress > 0.01 || contested;
      el.uplink.hidden = !visible;
      if (!visible) return;
      const pct = Math.round(progress * 100);
      if (last.uplink !== pct) {
        last.uplink = pct;
        el['uplink-fill'].style.width = `${pct}%`;
      }
      el.uplink.classList.toggle('contested', contested);
    },
    killfeed(text, good) {
      const div = document.createElement('div');
      div.textContent = text;
      div.className = good ? 'good' : 'bad';
      el.killfeed.prepend(div);
      feed.push({ div, until: performance.now() + 4000 });
      while (feed.length > 4) feed.shift().div.remove();
    },
    showBanner(title, sub, good, holdMs) {
      el['banner-title'].textContent = title;
      el['banner-title'].className = good ? 'good' : 'bad';
      el['banner-title'].id = 'banner-title';
      el['banner-sub'].textContent = sub;
      el.banner.hidden = false;
      bannerUntil = performance.now() + holdMs;
    },
    hideBanner() {
      el.banner.hidden = true;
      bannerUntil = 0;
    },
    setHint(html) {
      if (last.hint === html) return;
      last.hint = html;
      if (!html) {
        el.hint.hidden = true;
      } else {
        el.hint.innerHTML = html;
        el.hint.hidden = false;
      }
    },
    hitMarker(killed, holdMs = 90) {
      el.hitmarker.classList.add('on');
      el.hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        el.hitmarker.classList.remove('on');
        el.hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      el['damage-vignette'].style.opacity = '1';
      setTimeout(() => { el['damage-vignette'].style.opacity = '0'; }, 140);
    },
    setMuted(muted) {
      el['mute-tag'].hidden = !muted;
    },
    showScreen(name) {
      el['screen-title'].hidden = name !== 'title';
      el['screen-buy'].hidden = name !== 'buy';
      el['screen-pause'].hidden = name !== 'pause';
      el['screen-end'].hidden = name !== 'end';
      el.crosshair.style.display = name === null ? '' : 'none';
    },
    updateBuyMenu(money, owned, hasArmor, grenadeCount) {
      for (const { button, item, keyEl, descEl } of Object.values(buyButtons)) {
        const ownedAlready = (item.kind === 'weapon' && owned.has(item.id)) || (item.kind === 'armor' && hasArmor);
        const affordable = money >= item.price;
        button.disabled = ownedAlready || !affordable;
        if (ownedAlready) {
          keyEl.textContent = item.kind === 'weapon' ? 'Owned' : item.kind === 'armor' ? 'Worn' : '';
          keyEl.className = 'owned';
        } else {
          keyEl.textContent = `Key ${BUY_KEYS[BUY_ITEMS.indexOf(item)]}`;
          keyEl.className = 'key';
        }
        if (item.kind === 'grenade') descEl.textContent = `Thrown with G, 6 m blast · carrying ${grenadeCount}`;
      }
    },
    showEnd(won, copy, stats) {
      el['end-heading'].textContent = won ? 'Victory' : 'Defeat';
      el['end-copy'].textContent = copy;
      el['end-stats'].innerHTML = '';
      for (const [label, value] of stats) {
        const row = document.createElement('div');
        const span = document.createElement('span');
        span.textContent = `${label}: `;
        row.appendChild(span);
        row.appendChild(document.createTextNode(String(value)));
        el['end-stats'].appendChild(row);
      }
    },
    update(now) {
      if (bannerUntil && now > bannerUntil) {
        el.banner.hidden = true;
        bannerUntil = 0;
      }
      while (feed.length && feed[0].until < now) feed.shift().div.remove();
    },
  };
}
