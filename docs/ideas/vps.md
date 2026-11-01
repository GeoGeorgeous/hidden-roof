# Changes for the host (VPS)

What the repo needs from the host, for devops: an item goes here when its repo part lands and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **The GeoIP base each month (1.6.0).** The update script, `<apps>/roof/geoip-update.sh` (`docs/deploy.md` §6, GeoIP), ran once by hand on 2026-11-01; left: its schedule, the 3rd of each month at 06:17 host time (`17 6 3 * *`), a crontab entry or a systemd timer. The owner adds it (devops' permissions blocked the crontab).

