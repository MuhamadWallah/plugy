#!/bin/sh
# Plugy backups: database dump + uploaded photos/ID documents, on a schedule.
# Runs in the `backup` service of docker-compose.prod.yml (postgres image, so pg_dump matches the server).
#   BACKUP_INTERVAL_HOURS  how often to back up (default 24)
#   BACKUP_KEEP_DAYS       delete backups older than this (default 14)
# Each dump is checked with pg_restore --list before it is kept.

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups

backup_once() {
  stamp=$(date -u +%Y-%m-%dT%H%MZ)
  db="/backups/plugy-db-$stamp.dump"
  files="/backups/plugy-uploads-$stamp.tgz"

  if pg_dump --format=custom --file="$db.partial" && pg_restore --list "$db.partial" > /dev/null; then
    mv "$db.partial" "$db"
    echo "[backup] $stamp database OK ($(du -h "$db" | cut -f1))"
  else
    rm -f "$db.partial"
    echo "[backup] $stamp database FAILED" >&2
  fi

  if [ -d /uploads ] && tar czf "$files.partial" -C /uploads . ; then
    mv "$files.partial" "$files"
    echo "[backup] $stamp uploads OK ($(du -h "$files" | cut -f1))"
  else
    rm -f "$files.partial"
    echo "[backup] $stamp uploads FAILED" >&2
  fi

  find /backups -name 'plugy-*' -type f -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] removed old /'
}

until pg_isready -q; do sleep 2; done
while true; do
  backup_once
  sleep $((INTERVAL_HOURS * 3600))
done
