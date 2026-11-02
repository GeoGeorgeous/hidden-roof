import type * as THREE from 'three';
import { msg } from '../messages';
import { button, div, pageHead } from '../menu-ui';
import type { PauseMenu } from '../pause-menu';
import type { AdminSession } from '../net/watching';

// Admin mode's players page (G): the session's players, dropped ones too, each a button that puts the admin where
// this game last showed them, and back to play. One never shown here (dropped before the admin came) can't be gone to.

const made = new WeakSet<PauseMenu>();
/** The admin mode open now: what the page lists, and where a pick goes. */
let open: { players: AdminSession['players']; go: (at: THREE.Vector3) => void } | null = null;

/** The page, on `menu`'s pages once; `now` (null: admin mode is over) is what it shows. */
export function playersPage(menu: PauseMenu, now: typeof open) {
  open = now;
  if (made.has(menu)) return;
  made.add(menu);
  const rows = div('rows admin-players');
  const root = div('page');
  root.append(pageHead(msg('admin.listTitle'), div('page-sub', msg('admin.listSub'))), rows);
  const fill = () => {
    const list = open?.players() ?? [];
    if (!list.length) return rows.replaceChildren(div('admin-player dim', msg('admin.listEmpty')));
    rows.replaceChildren(
      ...list.map((p) => {
        const at = p.at;
        const b = button(p.name, () => at && open && (open.go(at), menu.onResume()), 'admin-player');
        if (!at) b.append(div('dim', msg('admin.listNotSeen')));
        b.disabled = !at;
        return b;
      }),
    );
  };
  menu.addPage('admin', root, fill);
}
