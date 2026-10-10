# Serving www.andisdad.net over HTTPS, without the :3000

## The approach: iojs terminates TLS itself

Rather than fighting Apache's rewrite/proxy config, `server.js` now speaks
HTTPS directly: if it finds a cert and key on disk, it opens a **second**
listener on port 443 (alongside the existing plain-HTTP one on 3000) using
the exact same request handler - same routes, same static files. Apache
stays completely untouched, still serving whatever it already serves on
port 80.

```
Browser --https://www.andisdad.net:443--> iojs (TLS terminated here)
Browser --http://...:80--------------------> Apache (unchanged)
```

## Step 1 - put the cert/key where server.js expects them

You've already got `fullchain.pem` and `privkey.pem` on the Pi. By default
`server.js` looks for them at:

```
<dish-duty-game folder>/certs/fullchain.pem
<dish-duty-game folder>/certs/privkey.pem
```

Either move/copy the two files there, e.g.:

```
mkdir -p /home/pi/scanpi/dullas/certs
cp fullchain.pem privkey.pem /home/pi/scanpi/dullas/certs/
```

or leave them wherever you already put them and point `server.js` at that
location instead via two environment variables when you launch it:

```
HTTPS_CERT_FILE=/path/to/fullchain.pem HTTPS_KEY_FILE=/path/to/privkey.pem iojs server.js
```

(If you're running it via the SysV init script, add those two `export`
lines - and `HTTPS_PORT` if you ever need to change it from 443 - near the
top of `/etc/init.d/dullas-dishwater`, right before the `start-stop-daemon`
call.)

If neither file is found, `server.js` just logs "running HTTP only" and
carries on exactly as before - nothing breaks if the certs aren't in place
yet.

## Step 2 - let iojs bind port 443

443 is a privileged port (anything under 1024), so a process needs either
root privileges or a specific capability grant to bind it. Binding to 3000
never needed this, which is why nothing about port 443 has come up before
now.

**Recommended: grant the capability to the iojs binary itself**, so the
service can keep running as the unprivileged `pi` user:

```
sudo apt-get install libcap2-bin     # provides setcap, if not already present
sudo setcap 'cap_net_bind_service=+ep' $(readlink -f $(which iojs))
```

Verify it took:

```
getcap $(readlink -f $(which iojs))
# should print: .../iojs = cap_net_bind_service+ep
```

Note this capability is attached to that specific binary file - if you ever
reinstall or replace the `iojs` binary, re-run the `setcap` command.

**Fallback: run the service as root.** If `setcap` isn't available or
doesn't stick on this old a kernel/filesystem combination, running
`iojs server.js` as root (e.g. via the init script's `start-stop-daemon`
without a `--chuid pi` drop-privileges option) will also let it bind 443 -
less clean, but simple and it's a single-purpose Pi.

## Step 3 - open port 443 on your router

You already forward port 3000 externally. Add:

- External **443** -> Pi's LAN IP, port **443**

You can leave port 80 forwarding alone (Apache keeps doing whatever it
already does there) and, once 443 is confirmed working end-to-end, remove
the port-3000 forwarding rule - that's what actually hides the `:3000` from
the outside world. iojs keeps listening on 3000 locally for convenience
(e.g. `curl http://localhost:3000/...` on the Pi itself for quick checks),
it just won't be reachable from outside anymore.

## Step 4 - restart and verify

Restart the service so it picks up the new code and the certs:

```
sudo /etc/init.d/dullas-dishwater restart
```

Check the log output - you should see both:

```
Dullas Dishwater HTTP server running at http://localhost:3000
Dullas Dishwater HTTPS server running at https://localhost:443
```

If instead you see `HTTPS server failed to start on port 443: ... EACCES`,
the capability/root step above didn't take - double check `getcap` or the
init script's user.

Then from outside your network, confirm `https://www.andisdad.net` loads
with a valid padlock, and that `/api/highscores` and `/api/leaderboards`
work over it too (the highscores page is a good end-to-end check).

## Renewals

Let's Encrypt certs expire every 90 days. Whatever process you used to get
the current `fullchain.pem`/`privkey.pem` (certbot on a separate modern
machine, since the Pi's own TLS/CA stack can't be trusted to talk to Let's
Encrypt directly - the same GnuTLS issue seen earlier fetching the iojs
binary), you'll need to repeat it and copy the two renewed files back into
the `certs/` folder before the old ones expire, then
`sudo /etc/init.d/dullas-dishwater restart` to pick them up. If your DNS
provider has a certbot DNS plugin, a scheduled job on that other machine
that renews and auto-`scp`s the two files across (then SSHes in to restart
the service) can fully automate this.
