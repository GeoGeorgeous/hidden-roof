// The playtest build's notice (docs/playtest.md): on a device's first launch,
// in Russian (the testers'), three pages, each with its own OK: what this build
// records and where it goes, with an optional "I'm on a VPN"; what else to
// check; F9 to mark a lag. Closed before the last page, it shows again next load.
// It also keeps the device's id: a random one made on first launch, which the
// report keys players on (a name isn't a person: docs/playtest.md, Who's who).

const KEY = 'roofhiddenhaus.playtest';

interface Stored {
  device: string;
  seen: boolean;
  vpn: boolean | null;
}

const id = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 13);

function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    if (s?.device) return s;
  } catch {
    // No storage: a new device every load, and the notice every time.
  }
  return { device: id(), seen: false, vpn: null };
}

const stored = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // No storage.
  }
}
save();

/** Who this is, as far as the playtest can tell: the device (kept), this page load, and whether they said they're on a VPN. */
export const identity = { device: stored.device, load: id(), get vpn() {
  return stored.vpn;
} };

/** The notice's pages, in Russian (the testers'); each has its own OK, the last closes it. The VPN box is on the first. */
const PAGES = [
  `<h2>PLAYTEST BUILD</h2>
<p>Эта сборка собирает телеметрию. Во время игры в мультиплеере игра каждые несколько секунд отправляет технические данные на сервер. Цель теста: проверить, как сервер справляется с нагрузкой, насколько хорошо работает игра на устройствах игроков и насколько стабильна сеть при большом количестве игроков.</p>
<p><b>Какие данные собираются:</b></p>
<ul>
<li><b>Производительность:</b> FPS, время кадров, нагрузка на GPU, draw calls.</li>
<li><b>Графика:</b> память, занятая краской и текстурами, количество частиц краски.</li>
<li><b>Сеть:</b> пинг, сетевой трафик, задержки и потери пакетов, плавность отображения других игроков.</li>
<li><b>Устройство:</b> браузер, модель GPU, разрешение экрана, количество ядер CPU, объём памяти и настройки игры.</li>
<li><b>Ошибки игры</b> и ваше игровое имя.</li>
</ul>
<p>Данные видит только Гоша. После завершения теста они будут удалены.</p>
<p>IP-адрес не сохраняется в открытом виде. Используется только его преобразованная версия, чтобы различать игроков из одной сети. Мы не собираем текст, который вы вводите в игре, кроме игрового имени, и данные за пределами игры. В одиночном режиме данные не отправляются.</p>
<label><input type="checkbox" class="vpn"> Я играю через VPN</label>`,
  `<h2>PLAYTEST BUILD</h2>
<p><b>Что ещё нужно проверить:</b></p>
<ul>
<li>Есть баг, из-за которого краска иногда вылетает не из сопла баллончика, а чуть дальше.</li>
<li>Есть подозрение, что частицы краски из баллончиков других игроков могут сильно влиять на производительность. Поэтому не стесняйтесь пшикать другим игрокам в лицо!</li>
</ul>`,
  `<h2>PLAYTEST BUILD</h2>
<p><b>Заметили лаг?</b></p>
<p>Нажмите <b>F9</b> сразу после того, как игра начнёт тормозить. Это отметит момент в отчёте и поможет Гоше найти причину.</p>
<p>Тестирование идёт автоматически. Просто рисуйте, исследуйте карту и делайте что хотите. Если игра будет заметно тормозить, вылетать или возникнут проблемы с подключением, сообщите об этом.</p>
<p>Спасибо!</p>`,
];

/** Shown once per device (every load without storage); `onClose` when it's gone. */
export function showNotice(onClose: () => void = () => {}) {
  // Automated browsers (the tests, `npm run shots`) don't see it: it would sit over the menus they press.
  if (stored.seen || navigator.webdriver) return onClose();
  const el = document.createElement('div');
  el.className = 'overlay playtest-notice';
  el.innerHTML = `${PAGES.map((p, i) => `<div class="playtest-sheet"${i ? ' hidden' : ''}>${p}<div class="playtest-foot"><button class="ok">OK</button><span>${i + 1} / ${PAGES.length}</span></div></div>`).join('')}`;
  const sheets = [...el.querySelectorAll<HTMLElement>('.playtest-sheet')];
  const vpn = el.querySelector<HTMLInputElement>('.vpn')!;
  sheets.forEach((sheet, i) =>
    sheet.querySelector('.ok')!.addEventListener('click', (e) => {
      e.stopPropagation();
      stored.vpn = vpn.checked;
      if (i + 1 < sheets.length) {
        sheet.hidden = true;
        sheets[i + 1].hidden = false;
        el.scrollTop = 0;
        return;
      }
      stored.seen = true;
      save();
      el.remove();
      onClose();
    }),
  );
  // Clicks here don't reach the game (which would take the pointer).
  el.addEventListener('mousedown', (e) => e.stopPropagation());
  document.body.appendChild(el);
}
