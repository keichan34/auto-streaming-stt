# Install

The Raspberry Pi appliance is responsible for:
* Creating the text from audio (Google Speech-to-Text)
* Creating the summary (OpenAI)
* Uploading the MP3 recording, transcript, and summary to the hosting server

## Hardware

### Audio in

Raspberry Pi doesn't have native audio in, so you'll need a USB audio adapter. Connect the "mic" input to the output of the audio source you want to monitor.

## Software

### Install mise

auto-streaming-stt uses `mise` to synchronize and update NodeJS.

```
$ curl https://mise.run | sh
```

Activate mise before checking if it's an interactive shell or not. Insert the following line in `~/.bashrc` before exiting when running non-interactively.

```
eval "$(mise activate bash)"
```

### Create systemd files

Environment config file: `/etc/auto-streaming-stt/secrets.env`

```
GOOGLE_APPLICATION_CREDENTIALS=..path to json..
OPENAI_API_KEY=sk-proj-...
AUTO_STT_API_URL=https://auto-stt-web.yakushima.blog/api/<id>
AUTO_STT_API_KEY=...
```

systemd unit file: `/etc/systemd/system/auto-streaming-stt.service`

```
[Unit]
Description=auto-streaming-stt
After=network.target

[Service]
User=pi
Group=pi
WorkingDirectory=/home/pi/auto-streaming-stt
EnvironmentFile=/etc/auto-streaming-stt/secrets.env
ExecStart=/home/pi/.local/bin/mise exec -- node /home/pi/auto-streaming-stt/dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

### Perform initial deploy

* setup tailscale
* use `/home/pi/auto-streaming-stt`
* see `.github/workflows/cd.yml`
* after files have been deployed, you need to run `mise trust /home/pi/auto-streaming-stt/`
